const PRIORITY = Object.freeze({ error: 0, warning: 1, success: 2, info: 3 });

function normalizedItem(value) {
  const category = Object.hasOwn(PRIORITY, value?.category) ? value.category : 'info';
  const tracks = Array.isArray(value?.tracks)
    ? value.tracks.filter((track) => typeof track?.text === 'string' && track.text.trim() && typeof track?.lang === 'string').slice(0, 2)
    : [];
  if (!tracks.length) return null;
  return { category, tracks: tracks.map((track) => ({ text: track.text.trim(), lang: track.lang })) };
}

export class SerializedNarrator {
  #pending = new Map();
  #active = false;
  #timer = null;
  #epoch = 0;
  #lastSpoken = new Map();
  #deferredDelay = null;

  constructor(options = {}) {
    if (typeof options.speak !== 'function') throw new TypeError('speak must be a function');
    this.speak = options.speak;
    this.cancelSpeech = typeof options.cancel === 'function' ? options.cancel : () => {};
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.setTimer = typeof options.setTimer === 'function' ? options.setTimer : setTimeout;
    this.clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : clearTimeout;
    this.shouldYield = typeof options.shouldYield === 'function' ? options.shouldYield : () => false;
    this.debounceMs = Math.max(0, Number(options.debounceMs ?? 160));
    this.cooldownMs = Math.max(0, Number(options.cooldownMs ?? 2400));
    this.maxCategories = Math.max(2, Number(options.maxCategories ?? 8));
  }

  enqueue(value) {
    const item = normalizedItem(value);
    if (!item || this.shouldYield()) return false;
    if (!this.#pending.has(item.category) && this.#pending.size >= this.maxCategories) {
      const evictable = [...this.#pending.keys()].reverse().find((category) => category !== 'error');
      if (evictable) this.#pending.delete(evictable);
      else if (item.category !== 'error') return false;
    }
    this.#pending.set(item.category, item);
    this.#schedule(item.category === 'error' ? 0 : this.debounceMs);
    return true;
  }

  cancel() {
    this.#epoch += 1;
    this.#pending.clear();
    if (this.#timer !== null) this.clearTimer(this.#timer);
    this.#timer = null;
    this.#deferredDelay = null;
    this.cancelSpeech();
  }

  get pendingCount() {
    return this.#pending.size;
  }

  #schedule(delay) {
    if (this.#active) return;
    if (this.#timer !== null) this.clearTimer(this.#timer);
    this.#timer = this.setTimer(() => {
      this.#timer = null;
      void this.#drain();
    }, delay);
  }

  #nextItem() {
    return [...this.#pending.values()].sort((left, right) => PRIORITY[left.category] - PRIORITY[right.category])[0] ?? null;
  }

  async #drain() {
    if (this.#active || this.shouldYield()) return;
    this.#active = true;
    const epoch = this.#epoch;
    try {
      while (epoch === this.#epoch && !this.shouldYield()) {
        const item = this.#nextItem();
        if (!item) return;
        const elapsed = this.now() - (this.#lastSpoken.get(item.category) ?? -Infinity);
        if (item.category !== 'error' && elapsed < this.cooldownMs) {
          this.#deferredDelay = this.cooldownMs - elapsed;
          return;
        }
        this.#pending.delete(item.category);
        for (const track of item.tracks) {
          if (epoch !== this.#epoch || this.shouldYield()) return;
          await this.speak(track);
        }
        if (epoch === this.#epoch) this.#lastSpoken.set(item.category, this.now());
      }
    } finally {
      this.#active = false;
      if (epoch === this.#epoch && this.#pending.size && !this.shouldYield() && this.#timer === null) {
        const delay = this.#deferredDelay ?? 0;
        this.#deferredDelay = null;
        this.#schedule(delay);
      }
    }
  }
}
