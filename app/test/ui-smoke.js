// UI smoke test: drives the real app window by clicking buttons, like a user would.
// Loaded by main.js only when started with --ui-test=<result file> (see scripts/ui-test.js).
const fs = require('fs');

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

const STEPS = [
  ['app starts and scans the demo folder', `
    await __t.waitFor(() => /Scanned \\d+ files/.test(__t.botText()), 'scan message');
    return document.querySelector('#folder-stats').textContent;`],
  ['"Free up space" shows a plan that passed checks', `
    __t.button('Free up space').click();
    const card = await __t.waitFor(() => __t.liveCards()[0], 'plan card');
    if (!/PASSED CHECKS/.test(card.textContent)) throw new Error('no PASSED CHECKS badge');
    return card.querySelectorAll('.action').length + ' actions';`],
  ['APPROVE runs the plan and updates FREED', `
    __t.liveCards()[0].querySelector('.btn-primary').click();
    await __t.waitFor(() => /Done! \\d+ actions complete/.test(__t.botText()), 'Done message');
    const freed = document.querySelector('#freed').textContent;
    if (freed === '0.0 MB' || freed === '0 B') throw new Error('FREED did not change: ' + freed);
    return 'freed ' + freed;`],
  ['UNDO reverses it', `
    __t.button('↶ UNDO').click();
    await __t.waitFor(() => /Undone\\. \\d+ steps reversed/.test(__t.botText()), 'Undone message');
    return 'ok';`],
  ['NEVER zone: dino refuses clearly, no plan card', `
    await __t.setZone('NEVER');
    __t.button('Organize everything').click();
    await __t.waitFor(() => /NEVER zone, so I won't touch/.test(__t.botText()), 'NEVER refusal');
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
];

module.exports = function runUiTest(win, resultFile) {
  win.webContents.once('did-finish-load', async () => {
    const results = [];
    try {
      await win.webContents.executeJavaScript(HELPERS);
      for (const [name, body] of STEPS) {
        try {
          const detail = await win.webContents.executeJavaScript(`(async () => { ${body} })()`);
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
