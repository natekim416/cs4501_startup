// UI smoke test: drives the real app window by clicking buttons, like a user would.
// Loaded by main.js only when started with --ui-test=<result file> (see scripts/ui-test.js).
const fs = require('fs');
const path = require('path');

// Runs inside the page: small helpers for finding and clicking things.
const HELPERS = `
  window.__t = {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async waitFor(fn, what, ms = 15000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { const v = fn(); if (v) return v; await this.sleep(100); }
      throw new Error('Timed out waiting for: ' + what + ' | last dino message: ' + this.botText().slice(-300));
    },
    botText: () => [...document.querySelectorAll('.msg.bot .bubble')].map((b) => b.textContent).join('\\n'),
    button: (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text && !b.disabled),
    liveCards: () => [...document.querySelectorAll('.card:not(.stale)')],
    scans: () => (__t.botText().match(/Scanned \\d+ files/g) || []).length,
    async setZone(zone) {
      const before = this.scans();
      this.button(zone).click();
      await this.waitFor(() => this.scans() > before && !document.body.classList.contains('busy'), 'rescan after zone change');
    },
    // FEAT-01: a row in the PERMISSION ZONES list, found by the path it shows.
    zoneRow: (shown) => [...document.querySelectorAll('#zones .zone-row')].find((r) => r.querySelector('.zone-path').textContent === shown),
    picker: () => document.querySelector('#zones .zone-edit'),
    async savedZone(p) {
      return (await api.init()).profile.zones.find((z) => z.path === p).zone;
    },
    async openPicker(shown) {
      this.zoneRow(shown).click();
      return this.waitFor(() => this.picker(), 'zone picker for ' + shown);
    },
    async pick(zone) {
      this.picker().querySelector('.zone-pick[data-zone="' + zone + '"]').click();
      return this.waitFor(() => document.querySelector('#zones .zone-confirm'), 'confirmation');
    },
  };
  true;
`;

// A step is either page code (a string) or a function that runs in the main process.
const STEPS = [
  ['first launch asks about the usage log, and it stays off until answered', `
    await __t.waitFor(() => document.querySelector('.consent'), 'usage log prompt');
    if ((await api.init()).usage.enabled) throw new Error('log is on before the user answered');
    if (!__t.button('TURN ON')) throw new Error('panel does not offer TURN ON');
    return 'ok';`],
  ['saying yes turns the log on and the prompt goes away', `
    __t.button('YES, KEEP A LOG').click();
    await __t.waitFor(() => __t.button('TURN OFF'), 'TURN OFF button');
    if (document.querySelector('.consent')) throw new Error('prompt still showing');
    return 'ok';`],
  ['app starts and scans the demo folder', `
    await __t.waitFor(() => /Scanned \\d+ files/.test(__t.botText()), 'scan message');
    return document.querySelector('#folder-stats').textContent;`],
  ['there is no API key box: the key stays in the backend (.env), and the page cannot set one', `
    if (document.querySelector('#key, #key-form')) throw new Error('API key box is still on screen');
    if (typeof api.setApiKey !== 'undefined') throw new Error('the page can still send an API key to the backend');
    return 'ok';`],
  ['"Free up space" shows a plan that passed checks', `
    __t.button('Free up space').click();
    const card = await __t.waitFor(() => __t.liveCards()[0], 'plan card');
    if (!/PASSED CHECKS/.test(card.textContent)) throw new Error('no PASSED CHECKS badge');
    return card.querySelectorAll('.action').length + ' actions';`],
  ['APPROVE runs the plan, and FREED is honest about the Dino Bin (US-12)', `
    __t.liveCards()[0].querySelector('.btn-primary').click();
    await __t.waitFor(() => /Done! \\d+ actions complete/.test(__t.botText()), 'Done message');
    // The demo folder only has duplicates. They go to the Dino Bin on the same disk, so the
    // measured change is ~0, and the dino must say the space frees up when the bin is emptied.
    await __t.waitFor(() => /frees up when you empty it/.test(__t.botText()), 'Dino Bin note');
    return 'freed ' + document.querySelector('#freed').textContent + ', bin noted';`],
  ['UNDO reverses it', `
    __t.button('↶ UNDO').click();
    await __t.waitFor(() => /Undone\\. \\d+ steps reversed/.test(__t.botText()), 'Undone message');
    return 'ok';`],
  ['NEVER zone: dino refuses clearly, no plan card', `
    await __t.setZone('NEVER');
    __t.button('Organize everything').click();
    await __t.waitFor(() => /NEVER zone \(.*\), so I won't touch anything/.test(__t.botText()), 'NEVER refusal');
    if (__t.liveCards().length) throw new Error('a plan card is still approvable');
    return 'ok';`],
  ['back to FREE: plan appears and asks about resume versions', `
    await __t.setZone('FREE');
    __t.button('Organize everything').click();
    await __t.waitFor(() => __t.liveCards()[0], 'plan card');
    await __t.waitFor(() => __t.button('Keep all of them'), 'resume question');
    return 'ok';`],
  ['answering replaces the plan; the old card can no longer be approved', `
    const oldCard = __t.liveCards()[0];
    __t.button('Keep all of them').click();
    await __t.waitFor(() => __t.liveCards()[0] && __t.liveCards()[0] !== oldCard, 'new plan card');
    if (!oldCard.classList.contains('stale')) throw new Error('old card not marked out of date');
    if (!oldCard.querySelector('.btn-primary').disabled) throw new Error('old APPROVE still enabled');
    if (!/Keep all of them/.test(document.querySelector('#memory').textContent)) throw new Error('answer not in DINO MEMORY');
    return 'ok';`],
  ['approving the new plan runs it', `
    __t.liveCards()[0].querySelector('.btn-primary').click();
    await __t.waitFor(() => (__t.botText().match(/Done! \\d+ actions complete/g) || []).length >= 2, 'second Done message');
    if (/out of date|couldn't run/.test(__t.botText())) throw new Error('error shown: ' + __t.botText().slice(-200));
    return 'ok';`],
  ['the practice folder stayed out of the usage log', `
    const { events } = (await api.init()).usage;
    if (events !== 1) throw new Error('expected only the logging_on event, found ' + events);
    return 'ok';`],
  ['a run and undo on a real folder are logged', `
    await api.setZone(__t.real, 'free');
    await useFolder(__t.real);
    __t.button('Free up space').click();
    const card = await __t.waitFor(() => __t.liveCards().find((c) => !c.querySelector('.btn-primary').disabled), 'plan card');
    card.querySelector('.btn-primary').click();
    await __t.waitFor(() => (__t.botText().match(/Done! \\d+ actions complete/g) || []).length >= 3, 'third Done message');
    [...document.querySelectorAll('.undo-row button')].pop().click();
    await __t.waitFor(() => (__t.botText().match(/Undone\\. \\d+ steps/g) || []).length >= 2, 'second Undone message');
    const shown = document.querySelector('#usage-status').textContent;
    const { events } = (await api.init()).usage;
    if (!shown.includes(events + ' events')) throw new Error('panel is out of date: ' + shown);
    return events + ' events';`],
  ['EXPORT saves a copy with counts and no file names', async ({ win, base }) => {
    const out = path.join(base, 'exported.jsonl');
    require('electron').dialog.showSaveDialog = async () => ({ canceled: false, filePath: out });
    await win.webContents.executeJavaScript(`__t.button('EXPORT').click(); __t.waitFor(() => /Saved a copy/.test(__t.botText()), 'export message')`);
    const raw = fs.readFileSync(out, 'utf8');
    for (const name of fs.readdirSync(path.join(base, 'Real'))) if (raw.includes(name)) throw new Error('log contains ' + name);
    if (raw.includes('/')) throw new Error('log contains a path');
    const logged = raw.trim().split('\n').map((line) => JSON.parse(line).event);
    for (const event of ['logging_on', 'scan', 'plan', 'run', 'undo']) if (!logged.includes(event)) throw new Error('no ' + event + ' event');
    return logged.join(', ');
  }],
  ['TURN OFF deletes the log', async ({ win, base }) => {
    await win.webContents.executeJavaScript(`window.confirm = () => true; __t.button('TURN OFF').click(); __t.waitFor(() => __t.button('TURN ON'), 'TURN ON button')`);
    if (fs.existsSync(path.join(base, 'data', 'usage-log.jsonl'))) throw new Error('log file still there');
    return 'ok';
  }],
  // FEAT-01 (#41): change a zone from the list, with a confirmation step so a stray click changes nothing.
  ['FEAT-01 clicking a zone opens a picker with FREE, ASK and NEVER, and the current one marked', `
    const picker = await __t.openPicker('~/Documents');
    const picks = [...picker.querySelectorAll('.zone-pick')].map((b) => b.dataset.zone + (b.disabled ? ' (current)' : ''));
    if (picks.join(', ') !== 'free, ask (current), never') throw new Error('picker shows ' + picks.join(', '));
    return picks.join(', ');`],
  ['FEAT-01 picking a zone changes nothing until CONFIRM, and CANCEL leaves it as it was', `
    const docs = state.home + '/Documents';
    const box = await __t.pick('free');
    const text = box.textContent;
    if (!text.includes('~/Documents') || !text.includes('ASK') || !text.includes('FREE')) throw new Error('confirmation does not name the folder and both zones: ' + text);
    if (!/more access/i.test(text)) throw new Error('giving more access is not called out: ' + text);
    if (document.activeElement !== __t.button('CANCEL')) throw new Error('CANCEL is not the default button');
    if ((await __t.savedZone(docs)) !== 'ask') throw new Error('zone changed before CONFIRM');
    __t.button('CANCEL').click();
    await __t.waitFor(() => !__t.picker(), 'picker to close');
    if ((await __t.savedZone(docs)) !== 'ask') throw new Error('CANCEL changed the zone');
    return 'ok';`],
  ['FEAT-01 Escape, or clicking the zone again, closes the picker without changing anything', `
    await __t.openPicker('~/Documents');
    await __t.pick('never');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await __t.waitFor(() => !__t.picker(), 'picker to close on Escape');
    await __t.openPicker('~/Documents');
    __t.zoneRow('~/Documents').click();
    await __t.waitFor(() => !__t.picker(), 'picker to close on a second click');
    if ((await __t.savedZone(state.home + '/Documents')) !== 'ask') throw new Error('zone changed');
    return 'ok';`],
  ['FEAT-01 CONFIRM saves the zone, writes it to the Safety Log, and marks plans out of date', `
    const cards = () => document.querySelectorAll('.card');
    const n = cards().length;
    __t.button('Free up space').click();
    await __t.waitFor(() => cards().length > n && !document.body.classList.contains('busy'), 'plan card');
    const card = [...cards()].pop();
    await __t.openPicker('~/Documents');
    await __t.pick('never');
    __t.button('CONFIRM').click();
    await __t.waitFor(() => /NEVER/.test(__t.zoneRow('~/Documents').textContent), 'NEVER tag on ~/Documents');
    if ((await __t.savedZone(state.home + '/Documents')) !== 'never') throw new Error('zone not saved');
    if (!/~\\/Documents.*ASK.*NEVER/.test(document.querySelector('#log').textContent)) throw new Error('Safety Log has no entry');
    if (!card.classList.contains('stale')) throw new Error('the plan made before the change can still be approved');
    return 'ok';`],
  ['FEAT-01 macOS folders are locked, and the page cannot change them through the backend either', `
    const lib = state.home + '/Library';
    const picker = await __t.openPicker('~/Library');
    if (picker.querySelector('.zone-pick')) throw new Error('a locked zone offers choices');
    if (!/macOS/.test(picker.textContent)) throw new Error('no reason given: ' + picker.textContent);
    for (const res of [await api.changeZone(lib, 'free'), await api.setZone(lib + '/Caches', 'free')]) {
      if (!res || !res.error) throw new Error('backend accepted a change to a locked folder');
    }
    if ((await __t.savedZone(lib)) !== 'never') throw new Error('~/Library is no longer NEVER');
    return 'ok';`],
  // US-04 (#5): protect projects once, see later plans skip them, and remove a protection in DINO MEMORY.
  ['US-04 "keep anything on my resume" shows a checklist of projects, and SAVE protects only the ones picked', async ({ win, base }) => {
    const { makeJsProject } = require('./stories/helpers');
    const code = path.join(base, 'code');
    for (const name of ['capstone-team7', 'portfolio-site', 'cs3140-hw1']) makeJsProject(code, name);
    return win.webContents.executeJavaScript(`(async () => {
      __t.code = ${JSON.stringify(code)};
      await api.setZone(__t.code, 'free');
      await useFolder(__t.code);
      await sendRequest('Keep anything on my resume');
      const pick = await __t.waitFor(() => document.querySelector('.question.pick'), 'project checklist');
      const names = [...pick.querySelectorAll('label')].map((l) => l.textContent.trim());
      if (names.join(', ') !== 'capstone-team7, cs3140-hw1, portfolio-site') throw new Error('checklist shows ' + names.join(', '));
      if (__t.button('SAVE')) throw new Error('SAVE works before anything is picked');
      for (const box of pick.querySelectorAll('input')) if (/capstone-team7|portfolio-site/.test(box.value)) box.click();
      __t.button('SAVE').click();
      const memory = () => document.querySelector('#memory').textContent;
      await __t.waitFor(() => /Always keep: capstone-team7/.test(memory()) && /Always keep: portfolio-site/.test(memory()), 'protections in DINO MEMORY');
      if (/cs3140-hw1/.test(memory())) throw new Error('a project that was not picked got protected');
      const refused = await api.protect(['../code']);
      if (!refused || !refused.error) throw new Error('the backend saved a path as a protection');
      return names.join(', ');
    })()`);
  }],
  ['US-04 later plans skip protected projects and say so', `
    const cards = () => document.querySelectorAll('.card');
    const n = cards().length;
    await sendRequest('Free up space');
    if (cards().length === n) throw new Error('no plan card');
    const actions = [...[...cards()].pop().querySelectorAll('.action')].map((a) => a.textContent).join('\\n');
    if (/capstone-team7|portfolio-site/.test(actions)) throw new Error('the plan includes a protected project');
    if (!/cs3140-hw1/.test(actions)) throw new Error('the unprotected project is missing');
    await __t.waitFor(() => /left out capstone-team7 and portfolio-site/.test(__t.botText()), 'note about protected projects');
    return 'ok';`],
  ['US-04 removing a protection in DINO MEMORY lets the project back into plans', `
    const item = [...document.querySelectorAll('#memory li')].find((li) => /Always keep: capstone-team7/.test(li.textContent));
    item.querySelector('button').click();
    await __t.waitFor(() => !/Always keep: capstone-team7/.test(document.querySelector('#memory').textContent), 'protection removed');
    await sendRequest('Free up space');
    const actions = [...[...document.querySelectorAll('.card')].pop().querySelectorAll('.action')].map((a) => a.textContent).join('\\n');
    if (!/capstone-team7/.test(actions)) throw new Error('capstone-team7 is still left out');
    if (/portfolio-site/.test(actions)) throw new Error('portfolio-site lost its protection');
    return 'ok';`],
  // US-08 (#9): old Xcode build data in ~/Library (a fake home, see scripts/ui-test.js) is offered and deleted,
  // and undo says how it comes back instead of offering a command to run.
  ['US-08 asking to clean Xcode offers old build data, APPROVE deletes it, and UNDO says Xcode rebuilds it', async ({ win, base }) => {
    const dd = path.join(base, 'home', 'Library', 'Developer', 'Xcode', 'DerivedData', 'OldApp-abc123');
    fs.mkdirSync(path.join(dd, 'Build'), { recursive: true });
    fs.writeFileSync(path.join(dd, 'info.plist'), '<plist><dict><key>WorkspacePath</key><string>/nope/OldApp.xcodeproj</string></dict></plist>');
    fs.writeFileSync(path.join(dd, 'Build', 'App'), 'b'.repeat(256 * 1024));
    const old = new Date(Date.now() - 45 * 864e5);
    for (const p of [path.join(dd, 'Build', 'App'), path.join(dd, 'Build'), path.join(dd, 'info.plist'), dd]) fs.utimesSync(p, old, old);
    const row = await win.webContents.executeJavaScript(`(async () => {
      const cards = () => document.querySelectorAll('.card');
      const n = cards().length;
      await sendRequest('Clean up my Xcode build data');
      if (cards().length === n) throw new Error('no plan card');
      const card = [...cards()].pop();
      const rows = [...card.querySelectorAll('.action')].map((a) => a.textContent);
      if (rows.length !== 1 || !/OldApp-abc123/.test(rows[0])) throw new Error('plan shows: ' + rows.join(' | '));
      if (!/rebuilds it on the next build/.test(rows[0])) throw new Error('no rebuild note: ' + rows[0]);
      card.querySelector('.btn-primary').click();
      await __t.waitFor(() => /Done! 1 actions complete/.test(__t.botText()), 'Done message');
      return rows[0];
    })()`);
    if (fs.existsSync(dd)) throw new Error('DerivedData is still there after APPROVE');
    await win.webContents.executeJavaScript(`(async () => {
      __t.button('↶ UNDO').click();
      const last = () => [...document.querySelectorAll('.msg.bot')].pop();
      await __t.waitFor(() => /Undone\\./.test(last().textContent) && /Xcode rebuilds it on the next build/.test(last().textContent), 'undo note');
      if (last().querySelector('button')) throw new Error('undo offers a button: ' + last().querySelector('button').textContent);
      return true;
    })()`);
    return row.includes('REBUILDABLE') ? 'offered, deleted, undo explained' : row;
  }],
  // Answers, refused runs, undo, and the Trash, on fresh folders (after the usage-log steps, so they aren't counted).
  ['set up fresh folders, one with a 1.1 GB lecture recording (sparse: takes no disk space)', async ({ win, base }) => {
    const { makeDemoFolder } = require('../scripts/make-demo-folder');
    for (const name of ['Fresh', 'Fresh2']) makeDemoFolder(path.join(base, name));
    const big = path.join(base, 'Fresh', 'lecture-recording.mp4');
    fs.closeSync(fs.openSync(big, 'w'));
    fs.truncateSync(big, 1.1e9);
    fresh2Before = new Set(fs.readdirSync(path.join(base, 'Fresh2')));
    await page(win, `await useFolder(${JSON.stringify(path.join(base, 'Fresh'))}); return 'ok';`);
    return 'ok';
  }],
  ['"No, leave it" on a one-file question unchecks just that file; the plan stays approvable and runs', `
    const before = __t.liveCards().at(-1);
    __t.button('Organize everything').click();
    const card = await __t.waitFor(() => __t.liveCards().at(-1) !== before && __t.liveCards().at(-1), 'plan card');
    const q = await __t.waitFor(() => [...document.querySelectorAll('.question')].find((b) => /lecture-recording/.test(b.textContent)), 'big-file question');
    [...q.querySelectorAll('button')].find((b) => b.textContent === 'No, leave it').click();
    await __t.sleep(300);
    if (card.classList.contains('stale') || __t.liveCards().at(-1) !== card) throw new Error('answering re-planned instead of keeping the plan');
    const box = [...card.querySelectorAll('input')].find((i) => /lecture-recording/.test(i.getAttribute('aria-label')));
    if (!box || box.checked) throw new Error('the big file is still checked');
    const approve = card.querySelector('.btn-primary');
    if (approve.disabled) throw new Error('APPROVE is disabled after answering');
    const done = (__t.botText().match(/Done! /g) || []).length;
    approve.click();
    await __t.waitFor(() => (__t.botText().match(/Done! /g) || []).length > done, 'Done message');
    return 'ok';`],
  ['the file the user said to leave alone did not move', async ({ base }) => {
    if (!fs.existsSync(path.join(base, 'Fresh', 'lecture-recording.mp4'))) throw new Error('lecture-recording.mp4 was moved');
    return 'ok';
  }],
  ['a refused run gives APPROVE and the checkboxes back so the selection can be fixed', async ({ win, base }) => page(win, `
    await useFolder(${JSON.stringify(path.join(base, 'Fresh2'))});
    const before = __t.liveCards().at(-1);
    __t.button('Sort my school files by class').click();
    const card = await __t.waitFor(() => __t.liveCards().at(-1) !== before && __t.liveCards().at(-1), 'plan card');
    const mkdirs = [...card.querySelectorAll('input[data-op="mkdir"]')];
    if (!mkdirs.length) throw new Error('no new folders in the plan');
    mkdirs.forEach((i) => (i.checked = false));
    // Moves in this folder start unchecked (it isn't a FREE zone); check them, so they lack their folders.
    card.querySelectorAll('input[data-op="move"]').forEach((i) => (i.checked = true));
    const approve = card.querySelector('.btn-primary');
    approve.click();
    await __t.waitFor(() => /stopped before touching anything/.test(__t.botText()), 'refusal message');
    if (approve.disabled) throw new Error('APPROVE stayed disabled after a refused run');
    if (mkdirs.some((i) => i.disabled)) throw new Error('checkboxes stayed disabled');
    mkdirs.forEach((i) => (i.checked = true));
    const done = (__t.botText().match(/Done! /g) || []).length;
    approve.click();
    await __t.waitFor(() => (__t.botText().match(/Done! /g) || []).length > done, 'Done message after fixing the selection');
    return mkdirs.length + ' folders';`)],
  ['UNDO removes the folders the run created, even after Finder opened them', async ({ win, base }) => {
    const dir = path.join(base, 'Fresh2');
    const created = fs.readdirSync(dir).filter((n) => !fresh2Before.has(n));
    if (!created.length) throw new Error('the run created no folders');
    for (const n of created) fs.writeFileSync(path.join(dir, n, '.DS_Store'), 'x');
    await page(win, `
      const undos = (__t.botText().match(/Undone\\./g) || []).length;
      [...document.querySelectorAll('.undo-row button')].filter((b) => !b.disabled).at(-1).click();
      await __t.waitFor(() => (__t.botText().match(/Undone\\./g) || []).length > undos, 'Undone message');`);
    const left = created.filter((n) => fs.existsSync(path.join(dir, n)));
    if (left.length) throw new Error('still there: ' + left.join(', '));
    return created.length + ' folders removed';
  }],
  ['emptying the Trash needs the confirm dialog: Cancel deletes nothing, OK deletes for real (US-30)', async ({ win, base }) => {
    const trash = path.join(base, 'Trash');
    fs.mkdirSync(trash, { recursive: true });
    fs.writeFileSync(path.join(trash, 'old draft.docx'), 'x');
    await page(win, `
      await sendRequest('Empty my trash');
      const card = await __t.waitFor(() => __t.liveCards().at(-1), 'trash plan card');
      const boxes = [...card.querySelectorAll('input[data-op="delete_from_trash"]')];
      if (!boxes.length) throw new Error('no PERMANENT actions');
      if (boxes.some((b) => b.checked)) throw new Error('permanent deletes should start unchecked');
      boxes.forEach((b) => (b.checked = true));
      window.confirm = () => false;
      card.querySelector('.btn-primary').click();
      await __t.waitFor(() => /nothing was deleted from the Trash/.test(__t.botText()), 'cancel message');
      if (card.querySelector('.btn-primary').disabled) throw new Error('APPROVE disabled after Cancel');`);
    if (!fs.existsSync(path.join(trash, 'old draft.docx'))) throw new Error('Cancel deleted a file');
    await page(win, `
      window.confirm = () => true;
      const done = (__t.botText().match(/Done! /g) || []).length;
      __t.liveCards().at(-1).querySelector('.btn-primary').click();
      await __t.waitFor(() => (__t.botText().match(/Done! /g) || []).length > done, 'Done message');`);
    const left = fs.readdirSync(trash);
    if (left.length) throw new Error('still in the Trash: ' + left.join(', '));
    return 'ok';
  }],
  ['an answer that leaves nothing safe to do says why, instead of an empty reply', async ({ win, base }) => {
    const { makeDevDemo } = require('../scripts/make-dev-demo');
    const code = makeDevDemo(path.join(base, 'code'));
    return page(win, `
      await useFolder(${JSON.stringify(code)});
      await sendRequest("I'm done with something. Free up space.");
      const q = await __t.waitFor(() => [...document.querySelectorAll('.question')].filter((b) => /Which projects/.test(b.textContent) && [...b.querySelectorAll('button')].some((x) => x.textContent === 'hoohacks-2026' && !x.disabled)).pop(), 'which-projects question');
      [...q.querySelectorAll('button')].find((b) => b.textContent === 'hoohacks-2026').click();
      await __t.waitFor(() => /nothing to approve/i.test(__t.botText()), 'explanation');
      await __t.waitFor(() => /uncommitted/i.test(__t.botText()), 'the reason (uncommitted changes)');
      return 'ok';`);
  }],
  ['US-21 GO PRO shows "not available yet" and changes nothing', `
    const b = await __t.waitFor(() => document.querySelector('#gopro-btn'), 'GO PRO button');
    b.click();
    await __t.waitFor(() => /Pro isn't available yet/.test(__t.botText()), 'Go Pro message');
    return 'ok';`],
  ['US-16 the storage-watch notification opens a plan preview and runs nothing', async ({ win }) => {
    const before = await page(win, `return (__t.botText().match(/Done! /g) || []).length;`);
    win.webContents.send('storage-watch', { text: "You're 87% full. I can get you about 18 GB back.", action: 'open-plan-preview' });
    return page(win, `
      await __t.waitFor(() => /87% full/.test(__t.botText()) && /Nothing runs until you approve/.test(__t.botText()), 'storage-watch message');
      await __t.waitFor(() => !document.body.classList.contains('busy'), 'preview to finish');
      if ((__t.botText().match(/Done! /g) || []).length !== ${before}) throw new Error('something ran');
      return 'preview only';`);
  }],
  ['US-20 LOCAL turns on local mode: the badge says LOCAL and the app explains the trade-off once', `
    const b = await __t.waitFor(() => document.querySelector('#local-btn'), 'LOCAL button');
    b.click();
    await __t.waitFor(() => document.querySelector('#mode').textContent === 'LOCAL', 'LOCAL badge');
    await __t.waitFor(() => /slower or less accurate/.test(__t.botText()), 'local-mode notice');
    b.click();
    await __t.waitFor(() => document.querySelector('#mode').textContent !== 'LOCAL', 'badge back');
    return 'ok';`],
  // Last, so a failure can't strand the other steps on a foreign page. Red-team F15.
  ['SEC: the window cannot be navigated to another page or open new windows, so no other page gets the app API', async ({ win, base }) => {
    const evil = path.join(base, 'evil.html');
    fs.writeFileSync(evil, '<!doctype html><title>EVIL</title><script>document.title = typeof window.api;</script>');
    const before = win.webContents.getURL();
    await win.webContents.executeJavaScript(`location.href = ${JSON.stringify('file://' + evil)}; true`).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    if (win.webContents.getURL() !== before) throw new Error('navigated to ' + win.webContents.getURL());
    const opened = await win.webContents.executeJavaScript(`String(window.open(${JSON.stringify('file://' + evil)}))`);
    if (opened !== 'null') throw new Error('window.open returned ' + opened);
    const { BrowserWindow } = require('electron');
    if (BrowserWindow.getAllWindows().length !== 1) throw new Error('a second window opened');
    if (!win.webContents.getLastWebPreferences().sandbox) throw new Error('the renderer is not sandboxed');
    return 'blocked';
  }],
];

let fresh2Before = new Set();
const page = (win, code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);

module.exports = function runUiTest(win, resultFile) {
  win.webContents.once('did-finish-load', async () => {
    const results = [];
    const base = path.dirname(resultFile);
    try {
      await win.webContents.executeJavaScript(HELPERS);
      await win.webContents.executeJavaScript(`__t.real = ${JSON.stringify(path.join(base, 'Real'))}; true`);
      for (const [name, body] of STEPS) {
        try {
          const detail = typeof body === 'function' ? await body({ win, base }) : await win.webContents.executeJavaScript(`(async () => { ${body} })()`);
          results.push({ name, ok: true, detail });
        } catch (err) {
          results.push({ name, ok: false, detail: String(err.message || err) });
          break;
        }
      }
    } finally {
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
      require('electron').app.exit(results.every((r) => r.ok) && results.length === STEPS.length ? 0 : 1);
    }
  });
};
