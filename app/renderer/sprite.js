// The Cleanasaurus mascot: an 8-bit T-rex in a maid outfit. Two frames so the duster can sweep.
const DINO_COLORS = { G: '#6BD49A', K: '#1B1A2E', W: '#F6F3EA', D: '#3B4BA8', P: '#FF7AB6', B: '#A0673C' };

const DINO_BODY = [
  '...........WWWPWW.....',
  '...........GGGGGGGGG..',
  '..........GGKGGGGGGGG.',
  '..........GGGGGGGGGGG.',
  '..........GGGGGGGGGGG.',
  '..........GGGGGG......',
  '..........GGGGGGGGG...',
  '.........GGGGG........',
  'G.......DDWWDD........',
  'G......DDDDDDDGG......',
];
const DINO_FRAMES = [
  [
    'GG....DDDWWWDDDGB.....',
    'GGG..DDDWWWWWDD...B...',
    '.GGGDDDDWWWWWDD....BPP',
    '..GGDDDDWWWWWDDD...PPP',
    '...WDWDWDWDWDWDW....PP',
    '......GG...GG.........',
    '......GG...GG.........',
    '......GGG..GGG........',
  ],
  [
    'GG....DDDWWWDDDGBPP...',
    'GGG..DDDWWWWWDD.BPPP..',
    '.GGGDDDDWWWWWDD..PP...',
    '..GGDDDDWWWWWDDD......',
    '...WDWDWDWDWDWDW......',
    '......GG...GG.........',
    '......GG...GG.........',
    '.....GGG...GGG........',
  ],
];

function drawDino(canvas, frame = 0) {
  const rows = [...DINO_BODY, ...DINO_FRAMES[frame % 2]];
  const px = Math.floor(canvas.width / rows[0].length);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '.') return;
      ctx.fillStyle = DINO_COLORS[c];
      ctx.fillRect(x * px, y * px, px, px);
    });
  });
}

// Creates an animated dino. It sweeps faster while "busy" is set.
function makeDino(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.round((size * 18) / 22);
  canvas.className = 'dino';
  let frame = 0;
  drawDino(canvas, frame);
  setInterval(() => {
    if (!canvas.isConnected) return;
    const busy = document.body.classList.contains('busy');
    if (busy || Math.random() < 0.35) drawDino(canvas, ++frame);
  }, 260);
  return canvas;
}

window.makeDino = makeDino;
