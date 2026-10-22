// Guided demo: Cleanasaurus walks across the screen, spotlights each feature, and uses the app itself
// on a fresh practice folder so every feature is shown working.
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let running = false;
  let skipped = false;

  async function waitFor(fn, ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (skipped) throw new Error('skipped');
      const v = fn();
      if (v) return v;
      await sleep(100);
    }
    return null;
  }

  const idle = () => !document.body.classList.contains('busy');
  const lastOf = (sel) => [...document.querySelectorAll(sel)].pop();
  const buttonNamed = (text) => [...document.querySelectorAll('button')].reverse().find((b) => b.textContent.trim() === text && !b.disabled);
  const liveCard = () => lastOf('.card:not(.stale)');

  // ---------- Overlay pieces ----------

  let overlay, spot, guide, bubble;

  function build() {
    overlay = el('div', { id: 'tour-overlay' });
    spot = el('div', { id: 'tour-spot' });
    bubble = el('div', { class: 'tour-bubble' });
    guide = el('div', { id: 'tour-guide' }, makeDino(120), bubble);
    overlay.append(spot);
    document.body.append(overlay, guide);
    guide.style.left = '-640px';
    guide.style.top = `${window.innerHeight / 2 - 90}px`;
  }

  function teardown() {
    overlay.remove();
    guide.remove();
    document.querySelectorAll('.dust').forEach((d) => d.remove());
  }

  function spotlight(target) {
    if (!target) {
      spot.style.left = `${window.innerWidth / 2}px`;
      spot.style.top = `${window.innerHeight / 2}px`;
      spot.style.width = '0px';
      spot.style.height = '0px';
      return null;
    }
    const r = target.getBoundingClientRect();
    const pad = 8;
    spot.style.left = `${r.left - pad}px`;
    spot.style.top = `${r.top - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;
    return r;
  }

  // Walks the dino next to the spotlighted area, hopping on the way.
  async function walkTo(rect) {
    const w = 560;
    const h = guide.offsetHeight || 200;
    let left;
    let top;
    if (!rect) {
      left = window.innerWidth / 2 - w / 2;
      top = window.innerHeight / 2 - h / 2;
    } else if (rect.left > w + 40) {
      left = rect.left - w - 24;
      top = rect.top + rect.height / 2 - h / 2;
    } else if (window.innerWidth - rect.right > w + 40) {
      left = rect.right + 24;
      top = rect.top + rect.height / 2 - h / 2;
    } else {
      left = Math.min(rect.left, window.innerWidth - w - 16);
      top = rect.bottom + h + 24 < window.innerHeight ? rect.bottom + 24 : rect.top - h - 24;
    }
    left = Math.max(16, Math.min(left, window.innerWidth - w - 16));
    top = Math.max(84, Math.min(top, window.innerHeight - h - 16));
    guide.classList.add('hopping');
    guide.style.left = `${left}px`;
    guide.style.top = `${top}px`;
    await sleep(650);
    guide.classList.remove('hopping');
  }

  // Shows the dino's line, typed out, then waits for the user to click the button.
  async function say(text, { step, total, label }) {
    bubble.replaceChildren(el('span', { class: 'tour-step' }, `CLEANASAURUS · ${step}/${total}`));
    const span = el('span');
    bubble.append(span);
    document.body.classList.add('tour-talking');
    for (let i = 0; i <= text.length; i += 2) {
      if (skipped) break;
      span.textContent = text.slice(0, i);
      await sleep(12);
    }
    span.textContent = text;
    document.body.classList.remove('tour-talking');
    const actions = el('div', { class: 'tour-actions' });
    bubble.append(actions);
    const skip = el('button', { class: 'btn' }, 'SKIP TOUR');
    skip.addEventListener('click', () => (skipped = true));
    actions.append(skip);
    const go = el('button', { class: 'btn btn-primary' }, label);
    actions.append(go);
    go.focus();
    await new Promise((resolve) => {
      go.addEventListener('click', resolve);
      const poll = setInterval(() => skipped && (clearInterval(poll), resolve()), 100);
    });
  }

  // Pixel dust that bursts out of something the dino just cleaned.
  function dust(target, count = 24) {
    const r = target.getBoundingClientRect();
    const colors = ['#6BD49A', '#FF7AB6', '#F2C14E', '#F6F3EA'];
    for (let i = 0; i < count; i++) {
      const d = el('div', { class: 'dust' });
      d.style.left = `${r.left + Math.random() * r.width}px`;
      d.style.top = `${r.top + Math.random() * r.height}px`;
      d.style.background = colors[i % colors.length];
      d.style.setProperty('--dx', `${(Math.random() - 0.5) * 260}px`);
      d.style.setProperty('--dy', `${-60 - Math.random() * 180}px`);
      document.body.append(d);
      setTimeout(() => d.remove(), 1000);
    }
  }

  async function typeInto(input, text) {
    input.focus();
    input.value = '';
    for (const ch of text) {
      input.value += ch;
      await sleep(35);
    }
  }

  // ---------- The tour ----------

  const STEPS = [
    {
      text: "RAWR! Hi, I'm Cleanasaurus, your file maid. I'll show you everything I can do, using a practice folder so none of your real files are touched.",
    },
    {
      target: () => document.querySelector('#pick').closest('.panel'),
      text: 'First you pick a folder. I scan it for duplicate files, wasted space, and anything suspicious. I just opened a messy practice Downloads folder.',
      before: async () => {
        const tour = await api.prepareTour();
        renderProfile(tour.profile);
        await useFolder(tour.folder);
        await waitFor(idle);
      },
    },
    {
      target: () => document.querySelector('#zones').closest('.panel'),
      text: "Permission zones keep you in control. FREE means I can act. ASK means I check with you first. NEVER means hands off, like system folders and code projects.",
    },
    {
      target: () => document.querySelector('#target').closest('.panel'),
      text: 'The target plan is where organized files are allowed to go. If I ever try to put something somewhere else, my validator blocks it.',
    },
    {
      target: () => document.querySelector('#composer'),
      text: "Now just tell me what you want, in plain English. Watch me type a request...",
      after: async () => {
        await typeInto(document.querySelector('#input'), 'Free up space and sort my school files by class');
        await sleep(300);
        document.querySelector('#composer').requestSubmit();
        await sleep(300);
        await waitFor(() => idle() && liveCard());
      },
    },
    {
      target: () => document.querySelector('#log').closest('.panel'),
      text: "Every plan goes through my validator BEFORE you see it. If a plan fails, the errors go straight back to the AI to fix, up to 3 tries. This log shows each try.",
    },
    {
      target: () => liveCard(),
      text: 'Here is my plan. Every line says what I will do and why. Duplicates are proven identical by their file fingerprint, and only files the malware scanner flagged can be quarantined.',
    },
    {
      target: () => lastOf('.question'),
      text: "When something looks strange, like 3 different versions of a resume, I don't guess. I ask you. Let me answer \"Keep all of them\"...",
      after: async () => {
        const b = await waitFor(() => buttonNamed('Keep all of them'));
        if (b) b.click();
        await sleep(300);
        await waitFor(() => idle() && liveCard());
      },
    },
    {
      target: () => document.querySelector('#memory').closest('.panel'),
      text: 'I remember your answers in Dino Memory, so I never ask the same question twice. You can make me forget with the X.',
    },
    {
      target: () => liveCard(),
      text: 'You can uncheck anything you want to skip. Then press APPROVE and I get sweeping!',
      after: async () => {
        const card = liveCard();
        if (!card) return;
        card.querySelector('.btn-primary').click();
        for (let i = 0; i < 4; i++) {
          dust(card);
          await sleep(250);
        }
        await waitFor(() => idle() && buttonNamed('↶ UNDO'));
      },
    },
    {
      target: () => document.querySelector('#freed').closest('.hud-stat'),
      text: 'Done! The space I freed shows up up here. Nothing is deleted for good: removed files go to my Dino Bin and suspicious ones go to quarantine.',
    },
    {
      target: () => buttonNamed('↶ UNDO'),
      text: 'Changed your mind? One click on UNDO puts every file back exactly where it was. Watch...',
      after: async () => {
        const b = buttonNamed('↶ UNDO');
        if (b) b.click();
        await waitFor(() => /Undone\./.test(document.querySelector('#chat').textContent));
      },
    },
    {
      text: "That's everything! Pick your own folder with SELECT FOLDER whenever you're ready. Happy cleaning! RAWR!",
    },
  ];

  async function run() {
    if (running || !idle()) return;
    running = true;
    skipped = false;
    document.querySelector('#tour-btn').disabled = true;
    build();
    try {
      for (let i = 0; i < STEPS.length && !skipped; i++) {
        const s = STEPS[i];
        if (s.before) await s.before();
        const target = s.target ? s.target() : null;
        if (target) {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          await sleep(350);
        }
        const rect = spotlight(target);
        await walkTo(rect);
        // Steps that demo something wait for SHOW ME, then do it; nothing advances on its own.
        const label = s.after ? 'SHOW ME ▶' : i === STEPS.length - 1 ? 'FINISH ★' : 'NEXT ▶';
        await say(s.text, { step: i + 1, total: STEPS.length, label });
        if (s.after && !skipped) {
          bubble.querySelectorAll('button').forEach((b) => (b.disabled = true));
          await s.after();
          await sleep(400);
        }
      }
    } catch (err) {
      if (err.message !== 'skipped') console.error(err);
    } finally {
      teardown();
      running = false;
      document.querySelector('#tour-btn').disabled = false;
    }
  }

  document.querySelector('#tour-btn').addEventListener('click', run);
  window.startTour = run;
})();
