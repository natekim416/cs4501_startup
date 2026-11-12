// US-16: a low-cost disk reminder. This class never scans, plans, or changes files.
const DAY = 864e5;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function validState(state) {
  return state && finite(state.lastNotifiedAt) && state.lastNotifiedAt >= 0
    && finite(state.lastUsedFraction) && state.lastUsedFraction >= 0 && state.lastUsedFraction <= 1;
}

function spaceLabel(bytes) {
  if (bytes >= 1e9) return `${Number((bytes / 1e9).toFixed(1))} GB`;
  if (bytes >= 1e6) return `${Number((bytes / 1e6).toFixed(1))} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

class StorageWatch {
  constructor({ threshold = 0.85, enabled, notify = () => {}, estimate = () => 0, state = {}, save = () => {} } = {}) {
    if (!finite(threshold) || threshold < 0 || threshold > 1) throw new Error('Choose a storage threshold between 0 and 1.');
    this.threshold = threshold;
    this.notify = notify;
    this.estimate = estimate;
    this.save = save;
    this.state = { enabled: enabled === undefined ? state?.enabled !== false : enabled === true, ...(validState(state) ? { lastNotifiedAt: state.lastNotifiedAt, lastUsedFraction: state.lastUsedFraction } : {}) };
  }

  status() {
    return { ...this.state };
  }

  persist() {
    // A preference write failure must not crash a scan or a disk check.
    try { this.save(this.status()); } catch { /* Keep the in-memory cooldown. */ }
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Storage watch must be on or off.');
    this.state.enabled = enabled;
    this.persist();
    return this.status();
  }

  check({ usedFraction, now = Date.now() } = {}) {
    if (!this.state.enabled || !finite(usedFraction) || usedFraction < 0 || usedFraction > 1 || !finite(now) || now < 0) return null;
    this.lastObservedFraction = usedFraction;
    if (usedFraction < this.threshold) return null;
    if (validState(this.state)) {
      const days = now - this.state.lastNotifiedAt;
      if (days < 0) return null;
      const increase = usedFraction - this.state.lastUsedFraction;
      // Five percentage points, not five percent of the previous reading.
      if (increase + Number.EPSILON < 0.05 && days < 7 * DAY) return null;
    }
    let bytes = 0;
    try {
      const measured = this.estimate();
      if (finite(measured) && measured > 0) bytes = measured;
    } catch { /* The reminder still works without a space estimate. */ }
    const text = `You're ${Math.round(usedFraction * 100)}% full. ${bytes ? `Your latest scan found about ${spaceLabel(bytes)} of possible cleanup. Preview it before changing anything.` : 'Choose a folder and preview a cleanup to see what can be safely removed.'}`;
    const notice = { text, estimatedBytes: bytes, usedFraction, action: 'open-plan-preview' };
    // Do not start the cooldown if delivery failed completely.
    try { this.notify(notice); } catch { return null; }
    this.state.lastNotifiedAt = now;
    this.state.lastUsedFraction = usedFraction;
    this.persist();
    return notice;
  }

  dismiss({ now = Date.now() } = {}) {
    if (!validState(this.state) || !finite(now) || now < this.state.lastNotifiedAt) return;
    this.state.lastNotifiedAt = now;
    if (finite(this.lastObservedFraction)) this.state.lastUsedFraction = this.lastObservedFraction;
    this.persist();
  }
}

module.exports = { StorageWatch };
