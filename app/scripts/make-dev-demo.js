// Creates a fake "code" folder full of dev clutter for demos: old projects whose build folders the
// rebuild proof will clear, and the tricky cases it must refuse (uncommitted work, no lockfile,
// a secret inside node_modules, a project touched last week, a virtual machine).
// Usage: node scripts/make-dev-demo.js [target]   (default: ~/CleanasaurusDemo/code)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeJsProject, makePyProject, write, age } = require('../test/stories/helpers');

function makeDevDemo(target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const mb = 1024;
  makeJsProject(target, 'cs3140-hw1', { kb: 40 * mb });
  makeJsProject(target, 'cs3140-final', { lock: 'yarn', kb: 60 * mb });
  makeJsProject(target, 'hoohacks-2026', { dirty: true, kb: 80 * mb });
  makeJsProject(target, 'portfolio-site', { ageDays: 4, kb: 30 * mb });
  makeJsProject(target, 'old-experiment', { lock: null, kb: 20 * mb });
  makeJsProject(target, 'cs2150-lab', { secret: true, kb: 10 * mb });
  makePyProject(target, 'cs4774-ml', { recipe: 'requirements', repo: true });
  write(path.join(target, 'cs4774-ml', '.venv', 'lib', 'python3.12', 'site-packages', 'torch', 'lib.so'), 'x'.repeat(50 * mb * 1024));
  age(path.join(target, 'cs4774-ml'), 60);
  write(path.join(target, 'linux-vm.utm', 'disk.qcow2'), 'x'.repeat(5 * mb * 1024));
  return target;
}

if (require.main === module) {
  const target = path.resolve(process.argv[2] || path.join(os.homedir(), 'CleanasaurusDemo', 'code'));
  makeDevDemo(target);
  console.log(`Dev clutter demo created at ${target}`);
}

module.exports = { makeDevDemo };
