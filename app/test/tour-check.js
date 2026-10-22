// Plays the guided demo automatically (pressing NEXT) and saves a screenshot of every step.
// Loaded by main.js only when started with --tour-test=<output folder>.
const fs = require('fs');
const path = require('path');

module.exports = function runTourCheck(win, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  win.webContents.once('did-finish-load', async () => {
    const js = (code) => win.webContents.executeJavaScript(code);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let shots = 0;
    await sleep(1500);
    js('startTour(); true');
    for (let i = 0; i < 300 && shots < 13; i++) {
      await sleep(250);
      const state = await js(`(() => {
        const g = document.querySelector('#tour-guide');
        if (!g) return 'done';
        const next = [...g.querySelectorAll('button')].find((b) => /NEXT|FINISH|SHOW ME/.test(b.textContent) && !b.disabled);
        const step = (g.querySelector('.tour-step') || {}).textContent || '';
        return next ? 'next:' + step : 'busy:' + step;
      })()`);
      if (state === 'done') break;
      const key = state.split(':').slice(1).join(':');
      if (!runTourCheck.seen) runTourCheck.seen = new Set();
      if (!runTourCheck.seen.has(key) && state.startsWith('next')) {
        await sleep(state.startsWith('next') ? 200 : 1200);
        runTourCheck.seen.add(key);
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `step-${String(++shots).padStart(2, '0')}.png`), img.toPNG());
      }
      if (state.startsWith('next')) await js(`[...document.querySelectorAll('#tour-guide button')].find((b) => /NEXT|FINISH|SHOW ME/.test(b.textContent) && !b.disabled).click(); true`);
    }
    require('electron').app.exit(0);
  });
};
