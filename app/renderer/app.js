// UI logic. Talks to the backend only through window.api (see preload.js).
const $ = (sel) => document.querySelector(sel);
const chat = $('#chat');
const state = { folder: null, freed: 0, home: '' };

const OP_LABEL = { mkdir: 'NEW FOLDER', move: 'MOVE', rename: 'RENAME', trash_duplicate: 'DUPLICATE', quarantine: 'QUARANTINE' };

function formatBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
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
    if (i < text.length) requestAnimationFrame(tick);
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
  const zones = $('#zones');
  zones.replaceChildren(
    ...profile.zones
      .slice()
      .sort((a, b) => ['free', 'ask', 'never'].indexOf(a.zone) - ['free', 'ask', 'never'].indexOf(b.zone))
      .map((z) => el('li', {}, el('span', { class: `zone-tag ${z.zone}` }, z.zone.toUpperCase()), short(z.path))),
  );
  const target = profile.targetPlan.destRoots[0];
  $('#target').textContent = target ? short(target) : 'Inside the selected folder';
  const memory = $('#memory');
  memory.replaceChildren(
    ...(profile.preferences.length
      ? profile.preferences.map((p) =>
          el('li', {}, el('span', {}, p), el('button', { title: 'Forget', onclick: async () => renderProfile(await api.forget(p)) }, 'X')),
        )
      : [el('li', { class: 'muted' }, 'Nothing learned yet.')]),
  );
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
  m.textContent = mode === 'llm' ? 'CLAUDE' : 'DEMO';
  m.className = `mode ${mode}`;
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
  if (info.duplicateGroups) text += `\nFound ${info.duplicateGroups} sets of duplicates wasting ${formatBytes(info.duplicateBytes)}.`;
  if (info.findings.length) text += `\n${info.findings.length} file(s) look suspicious: ${info.findings.map((f) => f.name).join(', ')}.`;
  if (info.zone === 'never') text += `\nHeads up: this folder is in a NEVER zone, so I won't touch it.`;
  text += '\nWhat should I do?';
  botSay(text);
}

// ---------- Plans ----------

async function sendRequest(text) {
  if (!state.folder) {
    botSay('Pick a folder first with SELECT FOLDER on the right.');
    return;
  }
  userSay(text);
  document.body.classList.add('busy');
  const thinking = botSay('Planning... every plan goes through my safety checks first.');
  try {
    showPlan(await api.plan(text));
  } catch (err) {
    botSay(`Something went wrong: ${err.message}`);
  } finally {
    thinking.closest('.msg').remove();
    document.body.classList.remove('busy');
  }
}

function showPlan(result) {
  setMode(result.mode);
  const lastTry = result.attempts[result.attempts.length - 1];
  if (result.summary) botSay(result.summary);

  if (result.actions.length) {
    const askFirst = new Set(result.needsApproval);
    const items = result.actions.map((a) => {
      const box = el('input', { type: 'checkbox', 'data-id': a.id, 'aria-label': `Include ${OP_LABEL[a.op]} ${a.path}` });
      box.checked = !askFirst.has(a.id);
      const dest = a.dest === state.folder ? './' : short(a.dest) + '/';
      const target = a.op === 'move' ? `${short(a.path)}  →  ${dest}` : a.op === 'rename' ? `${short(a.path)}  →  ${short(a.dest)}` : short(a.path);
      return el(
        'li',
        { class: 'action' },
        box,
        el('span', { class: `op ${a.op}` }, OP_LABEL[a.op] || a.op),
        el('div', {}, el('div', { class: 'file' }, target, askFirst.has(a.id) ? el('span', { class: 'ask-tag' }, 'ASK FIRST') : null), el('div', { class: 'why' }, a.reason)),
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
      el('div', { class: 'card-foot' }, approve, el('span', { class: 'muted' }, 'Uncheck anything you want to skip. Everything can be undone.')),
    );
    approve.addEventListener('click', () => runPlan(list, approve));
    attach(card);
  }

  for (const w of result.warnings) log(w, 'fail');
  for (const q of result.questions) askQuestion(q);
}

function askQuestion(q) {
  const options = el('div', { class: 'options' });
  const box = el('div', { class: 'question' }, el('p', {}, q.text), options);
  for (const choice of q.options) {
    options.append(
      el('button', {
        class: 'btn btn-pink',
        onclick: async () => {
          options.querySelectorAll('button').forEach((b) => (b.disabled = true));
          userSay(choice);
          if (choice === 'Cancel') return botSay('Okay, nothing changed.');
          if (choice === 'Run only the safe part') return botSay('The safe part is in the plan above. Approve it whenever you are ready.');
          document.body.classList.add('busy');
          try {
            const result = await api.answer(q.text, choice);
            renderProfile((await api.init()).profile);
            botSay("Got it, I'll remember that.");
            showPlan(result);
          } finally {
            document.body.classList.remove('busy');
          }
        },
      }, choice),
    );
  }
  attach(box);
}

async function runPlan(list, approve) {
  const ids = [...list.querySelectorAll('input:checked')].map((i) => i.dataset.id);
  if (!ids.length) return botSay('Nothing is checked, so there is nothing to do.');
  approve.disabled = true;
  list.querySelectorAll('input').forEach((i) => (i.disabled = true));
  const res = await api.execute(ids);
  if (!res.ok) {
    log('Approved subset failed re-check', 'fail');
    return botSay(`I stopped before touching anything, because your selection isn't safe on its own:\n- ${res.errors.join('\n- ')}`);
  }
  const failed = res.results.filter((r) => !r.ok);
  state.freed += res.bytesFreed;
  $('#freed').textContent = formatBytes(state.freed);
  setDisk(res.disk);
  log(`Ran ${res.results.length - failed.length} actions`, 'pass');
  const undo = el('button', { class: 'btn' }, '↶ UNDO');
  const body = botSay(`Done! ${res.results.length - failed.length} actions complete, ${formatBytes(res.bytesFreed)} freed.${failed.length ? `\n${failed.length} could not run.` : ''}\nRemoved files are in the Dino Bin, so nothing is gone for good.`);
  body.append(el('div', { class: 'undo-row' }, undo));
  undo.addEventListener('click', async () => {
    undo.disabled = true;
    const r = await api.undo();
    state.freed = Math.max(0, state.freed - res.bytesFreed);
    $('#freed').textContent = formatBytes(state.freed);
    setDisk(r.disk);
    log(`Undid ${r.undone} steps`, 'info');
    botSay(`Undone. ${r.undone} steps reversed.`);
  });
}

// ---------- Wiring ----------

api.onAttempt((a) => {
  if (a.ok) log(`TRY ${a.attempt}: PASS`, 'pass');
  else log(`TRY ${a.attempt}: FAIL (${a.errors.length} errors) → sent back to the LLM`, 'fail');
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
    renderProfile(await api.setZone(state.folder, b.dataset.zone));
    useFolder(state.folder);
  }),
);

$('#key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMode(await api.setApiKey($('#key').value.trim()));
  $('#key').value = '';
});

(async function start() {
  $('#logo-dino').append(makeDino(44));
  const init = await api.init();
  setMode(init.mode);
  setDisk(init.disk);
  renderProfile(init.profile);
  botSay(
    `RAWR! I'm Cleanasaurus, your file maid.\nPick a folder, then tell me what you want in plain English.\nI check every plan for safety before you see it, and I never touch your NEVER zones.${init.mode === 'demo' ? '\n(No Claude API key found, so I\'m in DEMO MODE with offline rules.)' : ''}`,
  );
  if (init.demoFolder) await useFolder(init.demoFolder);
  if (init.screenshot) {
    await sendRequest('Free up space and sort my school files by class');
    setTimeout(() => {
      const users = chat.querySelectorAll('.msg.user');
      chat.scrollTop = users[users.length - 1].offsetTop - chat.offsetTop - 12;
      setTimeout(() => api.capture(), 400);
    }, 1500);
  }
})();
