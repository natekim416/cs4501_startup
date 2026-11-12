// UI logic. Talks to the backend only through window.api (see preload.js).
const $ = (sel) => document.querySelector(sel);
const chat = $('#chat');
const state = { folder: null, freed: 0, home: '', currentCard: null };

const OP_LABEL = { mkdir: 'NEW FOLDER', move: 'MOVE', rename: 'RENAME', trash_duplicate: 'DUPLICATE', quarantine: 'QUARANTINE', delete_rebuildable: 'REBUILDABLE', clear_cache: 'CACHE', delete_from_trash: 'PERMANENT', remove_simulator: 'SIMULATOR' , remove_docker: 'DOCKER' };
// US-08: "simulator:com.apple.CoreSimulator.SimRuntime.iOS-16-0" -> "iOS 16.0 simulator"
const simulatorName = (p) => `${p.replace(/^simulator:.*SimRuntime\./, '').replace(/^([A-Za-z]+)-([\d-]+)$/, (_, os, v) => `${os} ${v.replace(/-/g, '.')}`)} simulator`;

// Decimal units, the way macOS Finder and the plan's one-line summary report sizes.
function formatBytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

function short(p) {
  if (state.folder && p.startsWith(state.folder + '/')) return p.slice(state.folder.length + 1);
  const home = state.home && p.startsWith(state.home) ? '~' + p.slice(state.home.length) : p;
  return home.length > 42 ? '…/' + home.split('/').slice(-2).join('/') : home;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(c));
  return node;
}

function scrollDown() {
  chat.scrollTop = chat.scrollHeight;
}

// ---------- Chat messages ----------

function botSay(content) {
  const body = el('div', { class: 'bubble' }, el('span', { class: 'name' }, 'CLEANASAURUS'));
  if (typeof content === 'string') typewrite(body, content);
  else body.append(content);
  chat.append(el('div', { class: 'msg bot' }, makeDino(72), body));
  scrollDown();
  return body;
}

function typewrite(node, text) {
  const span = el('span');
  node.append(span);
  let i = 0;
  const tick = () => {
    span.textContent = text.slice(0, (i += 3));
    scrollDown();
    // setTimeout instead of requestAnimationFrame so text still finishes while the window is in the background.
    if (i < text.length) setTimeout(tick, 16);
  };
  tick();
}

function userSay(text) {
  chat.append(el('div', { class: 'msg user' }, el('div', { class: 'bubble' }, text)));
  scrollDown();
}

function attach(node) {
  chat.append(el('div', { class: 'msg bot' }, el('div', { class: 'spacer' }), node));
  scrollDown();
}

// ---------- Side panels ----------

function renderProfile(profile) {
  state.home = profile.home;
  $('#zones').replaceChildren(
    ...profile.zones
      .slice()
      .sort((a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone))
      .map(zoneItem),
  );
  const target = profile.targetPlan.destRoots[0];
  $('#target').textContent = target ? short(target) : 'Inside the selected folder';
  // US-04: protected projects come first; X stops protecting one, so it can appear in plans again.
  const kept = (profile.protected || []).map((p) =>
    el('li', { class: 'kept' }, el('span', {}, `Always keep: ${p}`), el('button', { title: 'Stop protecting', onclick: async () => renderProfile(await api.unprotect(p)) }, 'X')),
  );
  const learned = profile.preferences.map((p) =>
    el('li', {}, el('span', {}, p), el('button', { title: 'Forget', onclick: async () => renderProfile(await api.forget(p)) }, 'X')),
  );
  $('#memory').replaceChildren(...(kept.length || learned.length ? [...kept, ...learned] : [el('li', { class: 'muted' }, 'Nothing learned yet.')]));
}

// ---------- Permission zones (FEAT-01) ----------
// Clicking a zone opens a picker under it. Picking a zone only asks for confirmation; nothing changes
// until CONFIRM, and CANCEL is the default. The backend checks every change again (profile.js).

const ZONE_ORDER = ['free', 'ask', 'never']; // most access first
const ZONE_HELP = {
  free: 'I can move and remove files here without asking first. You still approve every plan.',
  ask: 'I ask you before each change here.',
  never: 'I never touch anything here.',
};

function zoneItem(z) {
  const item = el('li', { class: 'zone-item', onkeydown: (e) => e.key === 'Escape' && closeZonePicker() });
  item.append(
    el(
      'button',
      { class: 'zone-row', 'aria-expanded': 'false', title: z.locked ? 'macOS folder: always NEVER' : 'Change this zone', onclick: () => toggleZonePicker(item, z) },
      el('span', { class: `zone-tag ${z.zone}` }, z.zone.toUpperCase()),
      el('span', { class: 'zone-path' }, short(z.path)),
      z.locked ? el('span', { class: 'zone-lock' }, 'LOCKED') : null,
    ),
  );
  return item;
}

function closeZonePicker() {
  const open = $('#zones .zone-edit');
  if (!open) return;
  const row = open.parentElement.querySelector('.zone-row');
  open.remove();
  row.setAttribute('aria-expanded', 'false');
  row.focus();
}

function toggleZonePicker(item, z) {
  const wasOpen = item.querySelector('.zone-edit');
  closeZonePicker();
  if (wasOpen || isBusy()) return;
  const box = el('div', { class: 'zone-edit' });
  item.append(box);
  item.querySelector('.zone-row').setAttribute('aria-expanded', 'true');
  if (z.locked) {
    zoneMessage(box, `macOS needs ${short(z.path)}, so it always stays NEVER. I can't change it.`);
    return;
  }
  box.append(
    el('p', {}, `Change ${short(z.path)} to:`),
    ...ZONE_ORDER.map((zone) =>
      el(
        'div',
        { class: 'zone-choice' },
        el('button', { class: `zone-btn zone-pick ${zone}`, 'data-zone': zone, ...(zone === z.zone && { disabled: '' }), onclick: () => confirmZone(box, z, zone) }, zone.toUpperCase()),
        el('span', { class: 'zone-help' }, zone === z.zone ? `Now. ${ZONE_HELP[zone]}` : ZONE_HELP[zone]),
      ),
    ),
    el('div', { class: 'zone-actions' }, el('button', { class: 'btn', onclick: closeZonePicker }, 'CANCEL')),
  );
  box.querySelector('.zone-actions .btn').focus();
}

function confirmZone(box, z, to) {
  const more = ZONE_ORDER.indexOf(to) < ZONE_ORDER.indexOf(z.zone);
  box.replaceChildren(
    el(
      'div',
      { class: 'zone-confirm' },
      el('p', {}, `Change ${short(z.path)} from ${z.zone.toUpperCase()} to ${to.toUpperCase()}?`),
      el('p', { class: more ? 'zone-warn' : 'zone-help' }, `${more ? 'This gives me more access.' : 'This gives me less access.'} ${ZONE_HELP[to]}`),
      el(
        'div',
        { class: 'zone-actions' },
        el('button', { class: `btn ${more ? 'btn-pink' : 'btn-primary'}`, onclick: () => applyZone(box, z, to) }, 'CONFIRM'),
        el('button', { class: 'btn zone-cancel', onclick: closeZonePicker }, 'CANCEL'),
      ),
    ),
  );
  box.querySelector('.zone-cancel').focus();
}

async function applyZone(box, z, to) {
  if (isBusy()) return;
  box.querySelectorAll('button').forEach((b) => (b.disabled = true));
  const res = await api.changeZone(z.path, to);
  if (res.error) return zoneMessage(box, `I didn't change it: ${res.error}`, 'zone-warn');
  // Plans on screen were checked against the old zones, so they can't be approved any more.
  retirePlans();
  renderProfile(res);
  log(`Zone changed: ${short(z.path)} ${z.zone.toUpperCase()} → ${to.toUpperCase()}`, 'info');
  if (state.folder && (state.folder === z.path || state.folder.startsWith(z.path + '/'))) await useFolder(state.folder);
}

function zoneMessage(box, text, cls = 'zone-help') {
  box.replaceChildren(el('p', { class: cls }, text), el('div', { class: 'zone-actions' }, el('button', { class: 'btn', onclick: closeZonePicker }, 'CLOSE')));
  box.querySelector('.btn').focus();
}

function log(text, kind = 'info') {
  const list = $('#log');
  if (list.firstElementChild && list.firstElementChild.classList.contains('muted')) list.replaceChildren();
  list.prepend(el('li', { class: kind }, text));
}

function setDisk(disk) {
  if (!disk) return;
  const used = disk.total - disk.free;
  $('#disk-fill').style.width = `${Math.round((used / disk.total) * 100)}%`;
  $('#disk-text').textContent = `${formatBytes(disk.free)} FREE`;
}

function setMode(mode) {
  const m = $('#mode');
  m.textContent = mode === 'llm' ? 'CLAUDE' : mode === 'local' ? 'LOCAL' : 'DEMO';
  m.className = `mode ${mode}`;
}

// ---------- Usage log (opt-in) ----------

function renderUsage(status) {
  state.usageOn = status.enabled;
  $('#usage-status').textContent = status.enabled
    ? `On · ${status.events} event${status.events === 1 ? '' : 's'}, saved only on this computer. EXPORT makes a copy you can send to the team. Turning it off deletes the log.`
    : 'Off, so nothing is recorded. If you turn it on, it keeps counts, sizes, and timings on this computer, never file names or what you type.';
  $('#usage-toggle').textContent = status.enabled ? 'TURN OFF' : 'TURN ON';
  $('#usage-export').hidden = !status.enabled;
  if (status.asked) document.querySelector('.consent')?.closest('.msg').remove();
}

// Asked once, on first launch. Both answers look the same, and ignoring it leaves the log off.
function offerUsageLog() {
  const choice = (label, on, reply) =>
    el('button', {
      class: 'btn btn-pink',
      onclick: async () => {
        renderUsage(await api.setUsage(on));
        botSay(reply);
      },
    }, label);
  attach(
    el(
      'div',
      { class: 'consent' },
      el('p', {}, 'One question first: can I keep a usage log to help my team test me? It counts files, sizes, and timings, plus what you approve or undo. It never records file names, folder names, or what you type.'),
      el('p', {}, 'The log stays on this computer unless you export it and send it yourself. You can change your mind any time under USAGE LOG, at the bottom of the right side.'),
      el(
        'div',
        { class: 'options' },
        choice('YES, KEEP A LOG', true, "Thanks! The log is on. When you're ready to send it, press EXPORT under USAGE LOG."),
        choice('NO THANKS', false, 'No problem. Nothing is being recorded.'),
      ),
    ),
  );
}

// ---------- Folder ----------

async function useFolder(folder) {
  state.folder = null;
  $('#folder-path').textContent = short(folder);
  state.folder = folder;
  $('#zone-add').hidden = false;
  document.body.classList.add('busy');
  const info = await api.scan(folder);
  document.body.classList.remove('busy');
  $('#folder-stats').textContent = `${info.fileCount} files · ${formatBytes(info.totalBytes)} · zone: ${info.zone.toUpperCase()}`;
  log(`Scanned with ${info.malwareEngine}`, 'info');
  let text = `Scanned ${info.fileCount} files (${formatBytes(info.totalBytes)}).`;
  if (info.rebuildableCount) text += `\nFound ${info.rebuildableCount} build folders I may be able to rebuild (${formatBytes(info.rebuildableBytes)}).`;
  if (info.duplicateGroups) text += `\nFound ${info.duplicateGroups} ${info.duplicateGroups === 1 ? 'set' : 'sets'} of duplicates wasting ${formatBytes(info.duplicateBytes)}.`;
  if (info.findings.length) text += `\n${info.findings.length} file(s) look suspicious: ${info.findings.map((f) => f.name).join(', ')}.`;
  if (info.zone === 'never') text += `\nHeads up: this folder is in a NEVER zone (${info.zoneReason}), so I won't touch it.`;
  text += '\nWhat should I do?';
  botSay(text);
  // US-17: once per semester, offer a sweep of class projects. Accepting it is an ordinary request.
  if (info.sweep && info.sweep.offered) {
    const offer = botSay(info.sweep.text);
    const go = el('button', { class: 'btn btn-pink' }, 'Plan the cleanup');
    const no = el('button', { class: 'btn' }, 'Not now');
    go.addEventListener('click', () => {
      go.disabled = no.disabled = true;
      sendRequest(info.sweep.request);
    });
    no.addEventListener('click', () => {
      go.disabled = no.disabled = true;
    });
    offer.append(el('div', { class: 'undo-row' }, go, no));
  }
}

// ---------- Plans ----------

const isBusy = () => document.body.classList.contains('busy');

async function sendRequest(text) {
  if (isBusy()) return;
  if (!state.folder) {
    botSay('Pick a folder first with SELECT FOLDER on the right.');
    return;
  }
  userSay(text);
  document.body.classList.add('busy');
  const thinking = botSay('Planning... every plan goes through my safety checks first.');
  try {
    const result = await api.plan(text);
    showPlan(result);
    // US-04: "always keep …" saved something, so DINO MEMORY needs to show it.
    if (result.memoryChanged) renderProfile((await api.init()).profile);
  } catch (err) {
    botSay(`Something went wrong: ${err.message}`);
  } finally {
    thinking.closest('.msg').remove();
    document.body.classList.remove('busy');
  }
}

// Older plan cards can't be approved once a newer plan exists or the folder settings change.
function retirePlans() {
  document.querySelectorAll('.card').forEach((card) => {
    card.classList.add('stale');
    card.querySelectorAll('button, input').forEach((b) => (b.disabled = true));
    const badge = card.querySelector('.badge');
    if (badge) badge.textContent = 'OUT OF DATE';
  });
  state.currentCard = null;
}

function showPlan(result) {
  setMode(result.mode);
  retirePlans();
  const lastTry = result.attempts[result.attempts.length - 1] || { attempt: 0 };
  if (result.summary) botSay(result.summary);

  if (result.actions.length) {
    const askFirst = new Set(result.needsApproval);
    const items = result.actions.map((a) => {
      const box = el('input', { type: 'checkbox', 'data-id': a.id, 'data-op': a.op, 'aria-label': `Include ${OP_LABEL[a.op]} ${a.path}` });
      box.checked = !askFirst.has(a.id) && a.checked !== false;
      const dest = a.dest === state.folder ? './' : short(a.dest) + '/';
      const target = a.op === 'move' ? `${short(a.path)}  →  ${dest}` : a.op === 'rename' ? `${short(a.path)}  →  ${short(a.dest)}` : a.op === 'remove_simulator' ? simulatorName(a.path) : short(a.path);
      return el(
        'li',
        { class: 'action' },
        box,
        el('span', { class: `op ${a.op}` }, OP_LABEL[a.op] || a.op),
        el('div', {}, el('div', { class: 'file' }, target, askFirst.has(a.id) ? el('span', { class: 'ask-tag' }, 'ASK FIRST') : null), el('div', { class: 'why' }, a.reason), a.note ? el('div', { class: 'why note' }, a.note) : null),
      );
    });
    const list = el('ul', { class: 'actions' }, items);
    const approve = el('button', { class: 'btn btn-primary' }, '▶ APPROVE');
    const card = el(
      'div',
      { class: 'card' },
      el(
        'div',
        { class: 'card-head' },
        el('span', { class: 'card-title' }, `CLEANUP PLAN · FREES ${formatBytes(result.bytesFreed)}`),
        el('span', { class: 'badge pass' }, `PASSED CHECKS · TRY ${lastTry.attempt}/3`),
      ),
      list,
      result.oneLine ? el('div', { class: 'one-line' }, result.oneLine) : null,
      el('div', { class: 'card-foot' }, approve, el('span', { class: 'muted' }, 'Uncheck anything you want to skip. Files can be undone; build folders can be rebuilt.')),
    );
    approve.addEventListener('click', () => runPlan(result.planId, list, approve));
    attach(card);
    state.currentCard = card;
  }

  for (const w of result.warnings) log(w, 'fail');
  for (const q of result.questions) askQuestion(q);
}

// US-04: "which projects should I always keep?" is a checklist. SAVE stays off until one is checked.
function pickProjects(q) {
  const boxes = q.options.map((name) => el('input', { type: 'checkbox', value: name }));
  const save = el('button', { class: 'btn btn-pink', disabled: '' }, 'SAVE');
  const cancel = el('button', { class: 'btn' }, 'CANCEL');
  const list = el('div', { class: 'pick-list' }, boxes.map((box) => el('label', {}, box, box.value)));
  list.addEventListener('change', () => (save.disabled = !boxes.some((b) => b.checked)));
  const close = () => [save, cancel, ...boxes].forEach((b) => (b.disabled = true));
  save.addEventListener('click', async () => {
    if (isBusy()) return;
    const names = boxes.filter((b) => b.checked).map((b) => b.value);
    close();
    userSay(`Always keep: ${names.join(', ')}`);
    const res = await api.protect(names);
    if (res.error) return botSay(`I didn't save that: ${res.error}`);
    retirePlans();
    renderProfile(res.profile);
    botSay(res.summary);
  });
  cancel.addEventListener('click', () => {
    close();
    botSay('Okay, nothing changed.');
  });
  attach(el('div', { class: 'question pick' }, el('p', {}, q.text), list, el('div', { class: 'options' }, save, cancel)));
}

function askQuestion(q) {
  if (q.pick === 'protect') return pickProjects(q);
  const options = el('div', { class: 'options' });
  const box = el('div', { class: 'question' }, el('p', {}, q.text), options);
  for (const choice of q.options) {
    options.append(
      el('button', {
        class: 'btn btn-pink',
        onclick: async () => {
          if (isBusy()) return;
          options.querySelectorAll('button').forEach((b) => (b.disabled = true));
          userSay(choice);
          if (choice === 'Cancel' || choice === 'OK') {
            retirePlans();
            return botSay('Okay, nothing changed.');
          }
          if (choice === 'Run only the safe part') {
            if (!state.currentCard) return botSay('That plan is out of date. Ask me again for a fresh one.');
            state.currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return botSay('Here it is. Press APPROVE on the plan to run it.');
          }
          // A question about one action ("over 1 GB, are you sure?") is answered on the plan you already
          // have: check or uncheck that action. Re-planning would throw the rest of the plan away.
          const box = q.action && state.currentCard && state.currentCard.querySelector(`input[data-id="${q.action}"]`);
          if (box) {
            const keep = choice === 'Yes, go ahead';
            box.checked = keep;
            box.closest('li').classList.toggle('skipped', !keep);
            return botSay(keep ? 'OK, it stays in the plan. Press APPROVE when ready.' : "OK, I'll leave that one alone. The rest of the plan is ready: press APPROVE.");
          }
          // Any other answer makes a new plan, so the old card can't be approved meanwhile.
          retirePlans();
          document.body.classList.add('busy');
          const thinking = botSay('Re-planning with your answer...');
          try {
            const result = await api.answer(q.text, choice);
            renderProfile((await api.init()).profile);
            botSay("Got it, I'll remember that.");
            showPlan(result);
          } catch (err) {
            options.querySelectorAll('button').forEach((b) => (b.disabled = false));
            botSay(`I couldn't use that answer: ${err.message}. Try again or ask me something new.`);
          } finally {
            thinking.closest('.msg').remove();
            document.body.classList.remove('busy');
          }
        },
      }, choice),
    );
  }
  attach(box);
}

async function runPlan(planId, list, approve) {
  const checked = [...list.querySelectorAll('input:checked')];
  const ids = checked.map((i) => i.dataset.id);
  if (!ids.length) return botSay('Nothing is checked, so there is nothing to do.');
  if (isBusy()) return;
  // US-30: a permanent delete from the Trash needs its own yes, on top of APPROVE.
  const permanent = checked.filter((i) => i.dataset.op === 'delete_from_trash').length;
  if (permanent && !window.confirm(`Permanently delete ${permanent} item${permanent === 1 ? '' : 's'} from the Trash? This can't be undone.`)) {
    return botSay('OK, nothing was deleted from the Trash.');
  }
  approve.disabled = true;
  list.querySelectorAll('input').forEach((i) => (i.disabled = true));
  let res;
  try {
    res = await api.execute(planId, ids, { confirmPermanent: permanent > 0 });
  } catch (err) {
    approve.disabled = false;
    list.querySelectorAll('input').forEach((i) => (i.disabled = false));
    return botSay(`I couldn't run that: ${err.message}`);
  }
  if (!res.ok) {
    log('Approved subset failed re-check', 'fail');
    if (res.errors.some((e) => /out of date/i.test(e))) {
      retirePlans();
      return botSay(`${res.errors.join(' ')}`);
    }
    // Nothing ran, so give the controls back: the user can fix the selection and approve again.
    approve.disabled = false;
    list.querySelectorAll('input').forEach((i) => (i.disabled = false));
    return botSay(`I stopped before touching anything, because your selection isn't safe on its own:\n- ${res.errors.join('\n- ')}\nFix the checkboxes and press APPROVE again.`);
  }
  state.currentCard = null;
  const failed = res.results.filter((r) => !r.ok);
  state.freed += res.bytesFreed;
  $('#freed').textContent = formatBytes(state.freed);
  setDisk(res.disk);
  log(`Ran ${res.results.length - failed.length} actions`, 'pass');
  const undo = el('button', { class: 'btn' }, '↶ UNDO');
  const body = botSay(
    `Done! ${res.results.length - failed.length} actions complete. ${formatBytes(res.bytesFreed)} freed on disk.` +
      (res.freedNote ? `\n${res.freedNote}` : '') +
      (failed.length ? `\n${failed.length} could not run.` : '') +
      `\nRemoved files are in the Trash. Deleted build folders can be rebuilt with the command I saved.`,
  );
  body.append(el('div', { class: 'undo-row' }, undo));
  // US-14: undo a single action, leaving the rest done.
  const ran = res.results.filter((r) => r.ok).map((r) => list.querySelector(`input[data-id="${r.id}"]`)).filter(Boolean);
  if (ran.length > 1) {
    const one = el('details', { class: 'undo-one' }, el('summary', {}, 'Undo just one…'));
    for (const box of ran) {
      const label = box.closest('li').querySelector('.file').textContent;
      const b = el('button', { class: 'btn' }, `↶ ${label}`);
      b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await api.undoOne(res.batchId, box.dataset.id);
        setDisk(r.disk);
        log(r.undone ? `Undid ${label}` : `Could not undo ${label}`, r.undone ? 'info' : 'fail');
        b.textContent = r.undone ? `✓ undone: ${label}` : r.needsRebuild.length ? `↻ rebuild with: ${r.needsRebuild[0].command}` : r.note ? `ⓘ ${r.note}` : `✗ ${label}`;
      });
      one.append(el('div', { class: 'undo-one-row' }, b));
    }
    body.append(one);
  }
  undo.addEventListener('click', async () => {
    undo.disabled = true;
    const r = await api.undo();
    state.freed = Math.max(0, state.freed - res.bytesFreed);
    $('#freed').textContent = formatBytes(state.freed);
    setDisk(r.disk);
    log(`Undid ${r.undone} steps`, 'info');
    const needs = r.needsRebuild || [];
    const kept = r.keptFolders || [];
    // US-08: Xcode items can't be put back by the app; say how they come back instead.
    const notes = (r.notes || []).map((n) => `\n${n}`).join('');
    const keptNote = kept.length ? `\nI kept ${kept.map(short).join(', ')} because you've put your own files in ${kept.length === 1 ? 'it' : 'them'} since.` : '';
    // Red-team F6/F7: say when a file came back under a new name, or couldn't come back at all.
    const renamed = (r.restoredAs || []).map((x) => `\nA newer ${short(x.path)} was already there, so the old one came back as ${short(x.as)}.`).join('');
    const failedNote = (r.failed || []).length ? `\n${r.failed.length} step${r.failed.length === 1 ? '' : 's'} couldn't be undone (${r.failed.map((f) => `${short(f.path)}: ${f.reason}`).join('; ')}). I kept ${r.failed.length === 1 ? 'it' : 'them'} so you can try UNDO again.` : '';
    const msg = botSay(`Undone. ${r.undone} steps reversed.${keptNote}${renamed}${failedNote}${notes}${needs.length ? '\nThese build folders were deleted for real. One click rebuilds each one:' : ''}`);
    for (const recipe of needs) {
      const b = el('button', { class: 'btn' }, `↻ REBUILD ${short(recipe.cwd)}`);
      b.title = recipe.command;
      b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = `↻ ${recipe.command}…`;
        const res = await api.rebuild(recipe);
        setDisk(res.disk);
        b.textContent = res.ok ? '✓ REBUILT' : '✗ FAILED';
        log(res.ok ? `Rebuilt ${short(recipe.cwd)}` : `Rebuild failed: ${short(recipe.cwd)}`, res.ok ? 'pass' : 'fail');
        botSay([res.warning, res.message].filter(Boolean).join('\n'));
      });
      msg.append(el('div', { class: 'undo-row' }, b));
    }
  });
}

// ---------- Wiring ----------

api.onAttempt((a) => {
  if (a.ok) log(`TRY ${a.attempt}: PASS`, 'pass');
  else log(`TRY ${a.attempt}: FAIL (${a.errors.length} errors) → sent back. First: ${a.errors[0]}`, 'fail');
});

api.onUsage(renderUsage);

// US-20: local mode keeps even file names on this Mac.
$('#local-btn').addEventListener('click', async () => {
  const on = $('#local-btn').classList.toggle('on');
  $('#local-btn').textContent = on ? 'LOCAL: ON' : 'LOCAL: OFF';
  const res = await api.setLocalMode(on);
  setMode(res.mode);
  if (res.notice) botSay(res.notice);
});

// US-21: the "Go Pro" fake door.
$('#gopro-btn').addEventListener('click', async () => botSay((await api.goPro()).message));

// US-16: the storage-watch notification opens a plan preview. Nothing runs until the user approves.
api.onStorageWatch(async (n) => {
  botSay(`${n.text}\nHere's a plan preview. Nothing runs until you approve it.`);
  if (state.folder) await sendRequest('Free up space');
});

$('#usage-toggle').addEventListener('click', async () => {
  const on = !state.usageOn;
  if (!on && !confirm('Turn off the usage log and delete what it has recorded?')) return;
  renderUsage(await api.setUsage(on));
});

$('#usage-export').addEventListener('click', async () => {
  try {
    const saved = await api.exportUsage();
    if (saved) botSay(`Saved a copy to ${short(saved)}. Open it to see exactly what's in it, then send it to the team.`);
  } catch (err) {
    botSay(`I couldn't export the log: ${err.message}`);
  }
});

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  sendRequest(text);
});

document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => sendRequest(chip.textContent)));

$('#pick').addEventListener('click', async () => {
  const folder = await api.pickFolder();
  if (folder) useFolder(folder);
});

$('#pick-target').addEventListener('click', async () => {
  const folder = await api.pickFolder();
  renderProfile(await api.setTarget(folder));
});

document.querySelectorAll('.zone-btn').forEach((b) =>
  b.addEventListener('click', async () => {
    if (!state.folder || isBusy()) return;
    document.body.classList.add('busy');
    const res = await api.setZone(state.folder, b.dataset.zone);
    if (res.error) {
      document.body.classList.remove('busy');
      botSay(`I didn't change the zone: ${res.error}`);
      return;
    }
    retirePlans();
    renderProfile(res);
    await useFolder(state.folder);
  }),
);

(async function start() {
  $('#logo-dino').append(makeDino(44));
  const init = await api.init();
  setMode(init.mode);
  if (init.mode === 'local') {
    $('#local-btn').classList.add('on');
    $('#local-btn').textContent = 'LOCAL: ON';
  }
  setDisk(init.disk);
  renderProfile(init.profile);
  renderUsage(init.usage);
  botSay(
    `RAWR! I'm Cleanasaurus, your file maid.\nPick a folder, then tell me what you want in plain English.\nI check every plan for safety before you see it, and I never touch your NEVER zones.${init.mode === 'demo' ? '\n(No Claude API key found, so I\'m in DEMO MODE with offline rules.)' : ''}`,
  );
  if (!init.usage.asked && !init.screenshot) offerUsageLog();
  if (init.demoFolder) await useFolder(init.demoFolder);
  if (init.screenshot) {
    await sendRequest(init.screenshotRequest || 'Free up space and sort my school files by class');
    setTimeout(() => {
      const users = chat.querySelectorAll('.msg.user');
      chat.scrollTop = users[users.length - 1].offsetTop - chat.offsetTop - 12;
      setTimeout(() => api.capture(), 400);
    }, 1500);
  }
})();
