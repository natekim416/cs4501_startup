// US-16: one notification when the disk passes 85% full. It only opens the plan preview; nothing runs on
// its own. After a dismissal it stays quiet until the disk is 5% fuller or 7 days pass.
const fs = require('fs');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;
const QUIET_DAYS = 7;
const QUIET_STEP = 0.05;

class StorageWatch {
  // notify({ text, action }): shows the notification. estimate(): bytes we could probably free, or 0.
  // stateFile (optional): remembers what was sent and dismissed across restarts.
  constructor({ threshold = 0.85, notify = () => {}, estimate = () => 0, enabled = true, stateFile = null } = {}) {
    this.threshold = threshold;
    this.notify = notify;
    this.estimate = estimate;
    this.enabled = enabled;
    this.stateFile = stateFile;
    this.state = { pending: false, lastFraction: null, dismissed: null };
    try {
      if (stateFile) this.state = { ...this.state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
    } catch {
      // First run.
    }
  }

  save() {
    if (!this.stateFile) return;
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state));
    } catch {
      // Losing this only means one extra notification.
    }
  }

  check({ usedFraction, now = Date.now() }) {
    if (!this.enabled || !Number.isFinite(usedFraction) || usedFraction < this.threshold) return null;
    // Already told them and they haven't dismissed it: one notification, not one per check. After 7 days
    // an unanswered one counts as dismissed, so the watch never goes silent for good (round 3 F10).
    if (this.state.pending) {
      if (now - (this.state.notifiedAt || 0) < QUIET_DAYS * DAY) return null;
      this.state = { ...this.state, pending: false, dismissed: { fraction: this.state.lastFraction ?? this.threshold, at: this.state.notifiedAt || 0 } };
    }
    const d = this.state.dismissed;
    if (d && usedFraction < d.fraction + QUIET_STEP && now - d.at < QUIET_DAYS * DAY) return null;
    const pct = Math.round(usedFraction * 100);
    const gb = Math.round(this.estimate() / 1e9);
    const n = {
      text: gb > 0 ? `You're ${pct}% full. I can get you about ${gb} GB back.` : `You're ${pct}% full. Want me to look for space I can free safely?`,
      action: 'open-plan-preview',
    };
    this.state = { ...this.state, pending: true, lastFraction: usedFraction, notifiedAt: now };
    this.save();
    this.notify(n);
    return n;
  }

  // Clicking the notification (it opened the plan preview) counts as handled, like a dismissal.
  opened({ now = Date.now() } = {}) {
    this.dismiss({ now });
  }

  dismiss({ now = Date.now() } = {}) {
    this.state = { ...this.state, pending: false, dismissed: { fraction: this.state.lastFraction ?? this.threshold, at: now } };
    this.save();
  }
}

module.exports = { StorageWatch };
