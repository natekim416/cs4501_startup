// Creates a messy fake Downloads folder for demos and user tests.
// Usage: node scripts/make-demo-folder.js [target]   (default: ~/CleanasaurusDemo/Downloads)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EICAR } = require('../backend/malware');

const target = path.resolve(process.argv[2] || path.join(os.homedir(), 'CleanasaurusDemo', 'Downloads'));
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

const fill = (seed, kb) => crypto.createHash('sha256').update(seed).digest('hex').repeat(Math.ceil((kb * 1024) / 64)).slice(0, kb * 1024);
const write = (name, content, daysAgo = 0) => {
  const p = path.join(target, name);
  fs.writeFileSync(p, content);
  const t = new Date(Date.now() - daysAgo * 86400000);
  fs.utimesSync(p, t, t);
};

const lecture3 = fill('lecture3', 2400);
write('CS4501_Lecture3_Transformers.pdf', lecture3, 20);
write('CS4501_Lecture3_Transformers (1).pdf', lecture3, 19);
write('CS4501_Lecture3_Transformers (2).pdf', lecture3, 12);
write('CS4501_Lecture4_RAG.pdf', fill('lecture4', 3100), 10);
write('CS3100_Midterm_Review.pdf', fill('midterm', 1800), 30);
const hw5 = fill('hw5', 900);
write('CS3100_HW5.pdf', hw5, 8);
write('CS3100_HW5 copy.pdf', hw5, 7);
write('APMA3100_Notes.pdf', fill('apma', 1500), 15);
write('Resume.pdf', fill('resume-a', 120), 200);
write('Resume_FINAL.pdf', fill('resume-b', 130), 90);
write('Resume_FINAL_v2.pdf', fill('resume-c', 140), 5);
write('IMG_4802.png', fill('img', 4200), 40);
write('vacation.jpg', fill('vacation', 3600), 60);
const beat = fill('beat', 9000);
write('beat_idea.wav', beat, 25);
write('beat_idea (1).wav', beat, 24);
const video = fill('video', 20000);
write('SummerVideo.mp4', video, 100);
write('SummerVideo (1).mp4', video, 99);
// Harmless test files that the malware checks are designed to catch.
write('free_vst_crack.command', `#!/bin/sh\n# ${EICAR}\necho "test file"\n`, 3);
write('syllabus.pdf.command', '#!/bin/sh\necho "this file only pretends to be a PDF"\n', 2);

console.log(`Demo folder ready: ${target}`);
