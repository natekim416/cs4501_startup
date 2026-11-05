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
];

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
