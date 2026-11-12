// Loaded before every test file (npm test uses --import). Points HOME at a throwaway folder, so no test
// can scan or change the real ~/.npm, ~/Library, ~/.Trash, or anything else on this Mac (red-team F14).
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.CLEANASAURUS_REAL_HOME) process.env.CLEANASAURUS_REAL_HOME = os.homedir();
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanasaurus-test-home-'));
// Every Mac home has a Library folder; FEAT-01's lock tests link to it.
fs.mkdirSync(path.join(process.env.HOME, 'Library'));
