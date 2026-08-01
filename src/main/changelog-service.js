import { ValidationError } from './errors.js';
import { requirePlainObject, requireString } from './validation.js';

export class ChangelogService {
  constructor(entries = []) {
    if (!Array.isArray(entries)) throw new TypeError('entries must be an array');
    this.entries = entries.map((entry) => Object.freeze(structuredClone(entry)));
  }

  list(input = {}) {
    const payload = input === undefined ? {} : requirePlainObject(input, 'changelog query');
    const query = payload.query === undefined
      ? ''
      : requireString(payload.query, 'changelog query', { minLength: 0, maxLength: 500 });
    const from = payload.from === undefined ? null : this.#date(payload.from, 'from date');
    const to = payload.to === undefined ? null : this.#date(payload.to, 'to date');
    if (from && to && from > to) {
      throw new ValidationError('The changelog start date must not be after the end date.');
    }
    const normalizedQuery = query.toLocaleLowerCase('en');
    return this.entries.filter((entry) => {
      if (from && entry.releaseDate < from) return false;
      if (to && entry.releaseDate > to) return false;
      if (!normalizedQuery) return true;
      return JSON.stringify(entry).toLocaleLowerCase('en').includes(normalizedQuery);
    }).map((entry) => structuredClone(entry));
  }

  #date(value, label) {
    const date = requireString(value, label, { pattern: /^\d{4}-\d{2}-\d{2}$/ });
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new ValidationError(`${label} is not a valid date.`);
    }
    return date;
  }
}

// No release is fabricated before a real release exists. Release tooling can replace this
// data with verified entries without changing the IPC contract.
export const VERIFIED_CHANGELOG_ENTRIES = Object.freeze([]);
