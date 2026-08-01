const MAX_CSV_CHARS = 1_000_000;
const MAX_CSV_ROWS = 10_000;
const MAX_CSV_COLUMNS = 128;
const MAX_CSV_CELL_CHARS = 20_000;
const RECORD_FIELDS = Object.freeze(['id', 'name', 'contact', 'status', 'value']);

function csvError(message, code = 'CSV_INVALID') {
  return Object.assign(new Error(message), { name: 'CsvError', code });
}

export function parseCsv(text) {
  let source = String(text ?? '');
  if (source.length > MAX_CSV_CHARS) throw csvError('CSV input exceeds the 1,000,000-character limit.', 'CSV_TOO_LARGE');
  if (source.startsWith('\uFEFF')) source = source.slice(1);
  if (source.includes('\0')) throw csvError('CSV input contains a forbidden null character.');

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;

  const pushCell = () => {
    if (cell.length > MAX_CSV_CELL_CHARS) throw csvError('A CSV cell exceeds the 20,000-character limit.', 'CSV_CELL_TOO_LARGE');
    row.push(cell);
    if (row.length > MAX_CSV_COLUMNS) throw csvError('CSV input exceeds the 128-column limit.', 'CSV_TOO_WIDE');
    cell = '';
    afterQuote = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
    if (rows.length > MAX_CSV_ROWS) throw csvError('CSV input exceeds the 10,000-row limit.', 'CSV_TOO_MANY_ROWS');
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; afterQuote = true; }
      } else {
        cell += character;
      }
      continue;
    }
    if (afterQuote && character !== ',' && character !== '\r' && character !== '\n' && !/\s/u.test(character)) {
      throw csvError('CSV input contains text after a closing quote.');
    }
    if (character === '"' && cell === '' && !afterQuote) { quoted = true; continue; }
    if (character === ',') { pushCell(); continue; }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      pushRow();
      continue;
    }
    if (!afterQuote) cell += character;
  }
  if (quoted) throw csvError('CSV input ends inside a quoted field.');
  if (cell !== '' || row.length) pushRow();
  return rows;
}

export function parseCsvRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const normalizedHeader = rows[0].map((value) => value.trim().toLowerCase());
  const hasHeader = normalizedHeader.some((value) => RECORD_FIELDS.includes(value));
  const indexes = Object.fromEntries(RECORD_FIELDS.map((field, fallback) => [
    field,
    hasHeader && normalizedHeader.includes(field) ? normalizedHeader.indexOf(field) : fallback
  ]));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const identifiers = new Set();
  return dataRows.map((values, index) => {
    let id = String(values[indexes.id] ?? '').trim() || `C-${String(index + 1).padStart(3, '0')}`;
    const base = id.slice(0, 80);
    id = base;
    let suffix = 2;
    while (identifiers.has(id)) id = `${base}-${suffix++}`.slice(0, 80);
    identifiers.add(id);
    return {
      id,
      name: String(values[indexes.name] ?? '').slice(0, MAX_CSV_CELL_CHARS),
      contact: String(values[indexes.contact] ?? '').slice(0, MAX_CSV_CELL_CHARS),
      status: String(values[indexes.status] ?? '').slice(0, MAX_CSV_CELL_CHARS),
      value: String(values[indexes.value] ?? '').slice(0, MAX_CSV_CELL_CHARS)
    };
  });
}

export const CSV_LIMITS = Object.freeze({
  maxChars: MAX_CSV_CHARS,
  maxRows: MAX_CSV_ROWS,
  maxColumns: MAX_CSV_COLUMNS,
  maxCellChars: MAX_CSV_CELL_CHARS
});
