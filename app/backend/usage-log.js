// Opt-in usage log for testing. It's off until the user says yes, and it stays on their machine
// unless they export it and send it themselves. It holds counts, sizes, and timings only:
// never file names, folder names, or what the user typed.
const fs = require('fs');

const LABELS = { mode: ['llm', 'demo'], zone: ['free', 'ask', 'never'], category: ['javascript', 'python', 'xcode', 'docker', 'ml', 'other'] };

// Keeps only numbers, true/false, and known labels, so a file name can't slip into the log.
function clean(fields) {
  const kept = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'boolean' || Number.isFinite(value) || LABELS[key]?.includes(value)) kept[key] = value;
  }
  return kept;
}

class UsageLog {
  constructor(file, profile) {
    this.file = file;
    this.profile = profile;
    this.onChange = () => {};
  }

  get enabled() {
    return this.profile.data.usageLogging === true;
  }

  status() {
    return { asked: this.profile.data.usageLogging !== null, enabled: this.enabled, events: this.eventCount() };
  }

  eventCount() {
    try {
      return fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  // US-21: the "Go Pro" fake door. Nothing to buy yet; the click is what the pivot test measures.
  goPro() {
    this.record('go_pro_click');
    return { message: "Pro isn't available yet. Want us to email you when it is? (We're counting this click; nothing is charged.)" };
  }

  // Turning the log off also deletes what it recorded.
  setEnabled(on) {
    this.profile.data.usageLogging = on;
    this.profile.save();
    if (on) this.record('logging_on');
    else fs.rmSync(this.file, { force: true });
    return this.status();
  }

  record(event, fields = {}) {
    if (!this.enabled) return;
    try {
      fs.appendFileSync(this.file, `${JSON.stringify({ at: new Date().toISOString(), event, ...clean(fields) })}\n`);
    } catch {
      // A logging problem should never get in the way of cleaning.
    }
    this.onChange();
  }

  exportTo(dest) {
    fs.copyFileSync(this.file, dest);
  }
}

module.exports = { UsageLog };
