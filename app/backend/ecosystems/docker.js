// US-09: Docker images no container uses, and Docker's build cache. Both come back on their own (a pull, or
// the next build). Volumes hold data, like a database, so they are never offered.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const NOT_RUNNING = "Docker isn't running, so I skipped it. Start Docker Desktop to include its images.";

// Runs docker only where Docker is installed (~/.docker exists), so a Mac without it never sees an error.
function dockerFor(home) {
  return (cmd, args) => {
    if (!fs.existsSync(path.join(home, '.docker'))) throw new Error('Docker is not installed.');
    return execFileSync(cmd, args, { stdio: 'pipe', timeout: 2 * 60 * 1000 }).toString();
  };
}

// Docker prints decimal sizes like "400MB", "1.1GB", "512kB".
function parseSize(s) {
  const m = String(s || '').match(/([\d.]+)\s*([kMGT]?B)/i);
  if (!m) return 0;
  const unit = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[m[2].toUpperCase()] || 1;
  return Math.round(parseFloat(m[1]) * unit);
}

function rows(text) {
  return String(text || '')
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function dockerItems({ run = dockerFor(os.homedir()) } = {}) {
  try {
    run('docker', ['info', '--format', '{{json .}}']);
  } catch {
    return { available: false, message: NOT_RUNNING, items: [], volumes: [] };
  }
  const images = rows(run('docker', ['image', 'ls', '--format', '{{json .}}']));
  const containers = rows(run('docker', ['ps', '-a', '--format', '{{json .}}']));
  // An image is in use if any container, running or stopped, was made from it.
  const used = new Set(containers.flatMap((c) => [c.ImageID, c.Image]).filter(Boolean));
  const items = images
    .filter((i) => i.ID && !used.has(i.ID) && !used.has(`${i.Repository}:${i.Tag}`) && !used.has(i.Repository))
    .map((i) => {
      const tagged = i.Repository && i.Repository !== '<none>';
      const name = tagged ? `${i.Repository}:${i.Tag}` : `an untagged image (${i.ID.slice(0, 12)})`;
      return {
        type: 'docker-image',
        id: i.ID,
        path: `docker-image:${i.ID}`,
        name,
        bytes: parseSize(i.Size),
        label: 'rebuildable',
        reason: `${name} (${i.Size}) isn't used by any container. It re-downloads on the next pull.`,
        rebuild: { note: tagged ? `If you need ${name} again, run docker pull ${name}.` : 'An untagged image comes back the next time you build its Dockerfile.', docker: [['image', 'rm', i.ID]] },
      };
    });
  const cache = parseSize((String(run('docker', ['builder', 'du']) || '').match(/Total:\s*(\S+)/) || [])[1]);
  if (cache > 0) {
    items.push({
      type: 'docker-build-cache',
      path: 'docker:build-cache',
      name: "Docker's build cache",
      bytes: cache,
      label: 'rebuildable',
      reason: `Docker's build cache. Docker rebuilds what it needs on the next build.`,
      rebuild: { note: 'Docker rebuilds its build cache on the next build.', docker: [['builder', 'prune', '-f']] },
    });
  }
  const volumes = rows(run('docker', ['volume', 'ls', '--format', '{{json .}}'])).map((v) => ({
    type: 'docker-volume',
    path: `docker-volume:${v.Name}`,
    label: 'never',
    reason: 'Volumes hold data, like a database. I never remove them.',
  }));
  return { available: true, message: null, items: items.sort((a, b) => b.bytes - a.bytes), volumes };
}

// Docker Desktop keeps its disk image at full size, so space freed inside Docker may not show on the disk yet.
function reportDockerFreed({ insideDocker, diskChange }) {
  const gb = (n) => `${(n / 1e9).toFixed(1)} GB`;
  const showBoth = insideDocker > 0 && diskChange < insideDocker * 0.8;
  return {
    showBoth,
    text: showBoth ? `Freed ${gb(insideDocker)} inside Docker; your disk shows ${gb(diskChange)} so far. Docker Desktop gives the rest back when it shrinks its disk image (Settings > Resources).` : '',
  };
}

module.exports = { dockerItems, dockerFor, reportDockerFreed, parseSize };
