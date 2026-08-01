const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validIso(year, month, day) {
  if (![year, month, day].every(Number.isSafeInteger)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function localeOrder(locale) {
  const parts = new Intl.DateTimeFormat(locale || 'en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
  }).formatToParts(new Date(Date.UTC(2006, 10, 22)));
  return parts.filter((part) => ['year', 'month', 'day'].includes(part.type)).map((part) => part.type);
}

export function parseTypedDate(input, locale = 'en-CA') {
  const raw = String(input ?? '');
  const value = raw.trim();
  if (!value) return { status: 'empty', input: raw, iso: '' };

  const isoMatch = ISO_DATE.exec(value);
  if (isoMatch) {
    const iso = validIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return iso
      ? { status: 'valid', input: raw, iso }
      : { status: 'invalid', input: raw, iso: null };
  }

  if (/^[0-9]{1,4}(?:[./-][0-9]{0,2}){0,2}$/.test(value) && (value.match(/[./-]/g) ?? []).length < 2) {
    return { status: 'partial', input: raw, iso: null };
  }

  const parts = value.split(/[./-]/);
  if (parts.length !== 3 || parts.some((part) => !/^\d{1,4}$/.test(part))) {
    return { status: 'invalid', input: raw, iso: null };
  }
  const order = localeOrder(locale);
  if (order.length !== 3) return { status: 'invalid', input: raw, iso: null };
  const values = Object.fromEntries(order.map((name, index) => [name, Number(parts[index])]));
  const iso = validIso(values.year, values.month, values.day);
  return iso
    ? { status: 'valid', input: raw, iso }
    : { status: 'invalid', input: raw, iso: null };
}

export function selectRangeDate(range, iso) {
  if (!ISO_DATE.test(String(iso ?? ''))) throw new TypeError('iso must be a valid ISO date string');
  const from = ISO_DATE.test(String(range?.from ?? '')) ? range.from : '';
  const to = ISO_DATE.test(String(range?.to ?? '')) ? range.to : '';
  if (!from || to) return { from: iso, to: '' };
  return iso < from ? { from: iso, to: from } : { from, to: iso };
}

export function dateRangePreset(name, today = new Date()) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const iso = (date) => date.toISOString().slice(0, 10);
  if (name === 'all') return { from: '', to: '' };
  if (name === 'today') return { from: iso(end), to: iso(end) };
  if (name === 'month') {
    return { from: iso(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))), to: iso(end) };
  }
  const days = name === '30-days' ? 30 : name === '7-days' ? 7 : null;
  if (!days) throw new TypeError('Unknown date range preset');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: iso(start), to: iso(end) };
}

export function calendarGrid(year, month) {
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2200) throw new RangeError('year is outside the supported calendar range');
  if (!Number.isSafeInteger(month) || month < 1 || month > 12) throw new RangeError('month must be 1-12');
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      iso: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1
    };
  });
}

export function dateInRange(iso, range) {
  if (!ISO_DATE.test(String(iso ?? ''))) return false;
  const from = ISO_DATE.test(String(range?.from ?? '')) ? range.from : '';
  const to = ISO_DATE.test(String(range?.to ?? '')) ? range.to : '';
  return Boolean(from && iso >= from && (!to || iso <= to));
}

