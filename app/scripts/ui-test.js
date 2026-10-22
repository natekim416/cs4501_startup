// Runs the UI smoke test against a fresh demo folder and prints a pass/fail report.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanasaurus-ui-'));
const folder = path.join(base, 'Downloads');
const results = path.join(base, 'results.json');
execFileSync('node', [path.join(__dirname, 'make-demo-folder.js'), folder]);

const electron = require('electron');
spawnSync(electron, ['.', `--demo-folder=${folder}`, `--data-dir=${path.join(base, 'data')}`, `--ui-test=${results}`], {
  cwd: path.join(__dirname, '..'),
  stdio: 'ignore',
  timeout: 120000,
});

const steps = fs.existsSync(results) ? JSON.parse(fs.readFileSync(results, 'utf8')) : [];
for (const s of steps) console.log(`${s.ok ? '✔' : '✖'} ${s.name}${s.detail ? `  (${s.detail})` : ''}`);
const passed = steps.length > 0 && steps.every((s) => s.ok);
console.log(passed ? `\nUI smoke test passed (${steps.length} steps)` : '\nUI smoke test FAILED');
process.exit(passed ? 0 : 1);
