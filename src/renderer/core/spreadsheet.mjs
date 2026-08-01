export const SPREADSHEET_ERRORS = Object.freeze({
  cycle: "#CYCLE!",
  divisionByZero: "#DIV/0!",
  name: "#NAME?",
  parse: "#PARSE!",
  range: "#RANGE!",
  reference: "#REF!",
  value: "#VALUE!",
  number: "#NUM!",
});

export const SPREADSHEET_LIMITS = Object.freeze({
  maxFormulaLength: 8_192,
  maxRangeCells: 10_000,
  maxParseDepth: 256,
  maxEvaluationDepth: 1_000,
  maxColumn: 16_384,
  maxRow: 1_048_576,
});

export class SpreadsheetFormulaError extends Error {
  constructor(message, code = SPREADSHEET_ERRORS.parse, position = null) {
    super(message);
    this.name = "SpreadsheetFormulaError";
    this.code = code;
    this.position = position;
  }
}

class SpreadsheetRuntimeError extends Error {
  constructor(message, code, details = undefined) {
    super(message);
    this.name = "SpreadsheetRuntimeError";
    this.code = code;
    this.details = details;
  }
}

const BLANK = Symbol("spreadsheet-blank");

function columnToNumber(column) {
  let value = 0;
  for (const character of column.toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
}

function numberToColumn(value) {
  let result = "";
  let current = value;
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

export function normalizeCellReference(reference) {
  if (typeof reference !== "string") {
    throw new SpreadsheetFormulaError("Cell reference must be a string.", SPREADSHEET_ERRORS.reference);
  }
  const match = /^\$?([A-Za-z]{1,3})\$?([1-9]\d*)$/.exec(reference.trim());
  if (!match) {
    throw new SpreadsheetFormulaError(`Invalid cell reference: ${reference}`, SPREADSHEET_ERRORS.reference);
  }
  const column = columnToNumber(match[1]);
  const row = Number(match[2]);
  if (
    column < 1 ||
    column > SPREADSHEET_LIMITS.maxColumn ||
    row < 1 ||
    row > SPREADSHEET_LIMITS.maxRow
  ) {
    throw new SpreadsheetFormulaError(`Cell reference is outside sheet bounds: ${reference}`, SPREADSHEET_ERRORS.reference);
  }
  return `${numberToColumn(column)}${row}`;
}

function tokenize(formula) {
  if (typeof formula !== "string") {
    throw new SpreadsheetFormulaError("Formula must be a string.");
  }
  const source = formula.startsWith("=") ? formula.slice(1) : formula;
  if (!source.trim()) throw new SpreadsheetFormulaError("Formula cannot be empty.");
  if (source.length > SPREADSHEET_LIMITS.maxFormulaLength) {
    throw new SpreadsheetFormulaError("Formula exceeds the length limit.");
  }
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"') {
      const start = index;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] === '"') {
          if (source[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += source[index];
        index += 1;
      }
      if (!closed) throw new SpreadsheetFormulaError("Unterminated string literal.", SPREADSHEET_ERRORS.parse, start);
      tokens.push({ type: "string", value, position: start });
      continue;
    }
    const rest = source.slice(index);
    const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) {
        throw new SpreadsheetFormulaError("Numeric literal is outside the supported range.", SPREADSHEET_ERRORS.number, index);
      }
      tokens.push({ type: "number", value, position: index });
      index += number[0].length;
      continue;
    }
    const cell = /^\$?[A-Za-z]{1,3}\$?[1-9]\d*/.exec(rest);
    if (cell) {
      const after = rest[cell[0].length];
      if (!after || !/[A-Za-z0-9_]/.test(after)) {
        tokens.push({
          type: "cell",
          value: normalizeCellReference(cell[0]),
          position: index,
        });
        index += cell[0].length;
        continue;
      }
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0].toUpperCase(), position: index });
      index += identifier[0].length;
      continue;
    }
    const punctuation = {
      "(": "leftParen",
      ")": "rightParen",
      ",": "comma",
      ":": "colon",
      "+": "operator",
      "-": "operator",
      "*": "operator",
      "/": "operator",
      "^": "operator",
    }[character];
    if (punctuation) {
      tokens.push({ type: punctuation, value: character, position: index });
      index += 1;
      continue;
    }
    throw new SpreadsheetFormulaError(
      `Unexpected character: ${character}`,
      SPREADSHEET_ERRORS.parse,
      index,
    );
  }
  tokens.push({ type: "eof", value: "", position: source.length });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
    this.depth = 0;
  }

  peek() {
    return this.tokens[this.index];
  }

  consume(type, value) {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new SpreadsheetFormulaError(
        `Expected ${value ?? type} but found ${token.value || token.type}.`,
        SPREADSHEET_ERRORS.parse,
        token.position,
      );
    }
    this.index += 1;
    return token;
  }

  parse() {
    const expression = this.parseExpression(0);
    this.consume("eof");
    return expression;
  }

  parseExpression(minimumPrecedence) {
    this.depth += 1;
    if (this.depth > SPREADSHEET_LIMITS.maxParseDepth) {
      this.depth -= 1;
      throw new SpreadsheetFormulaError(
        "Formula nesting exceeds the parser limit.",
        SPREADSHEET_ERRORS.parse,
        this.peek().position,
      );
    }
    try {
      let left = this.parsePrefix();
      const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
      while (this.peek().type === "operator") {
        const operator = this.peek().value;
        const current = precedence[operator];
        if (current < minimumPrecedence) break;
        this.index += 1;
        const right = this.parseExpression(current + (operator === "^" ? 0 : 1));
        left = { type: "binary", operator, left, right };
      }
      return left;
    } finally {
      this.depth -= 1;
    }
  }

  parsePrefix() {
    const token = this.peek();
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.index += 1;
      return { type: "unary", operator: token.value, operand: this.parseExpression(4) };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (token.type === "number" || token.type === "string") {
      this.index += 1;
      return { type: token.type, value: token.value };
    }
    if (token.type === "cell") {
      this.index += 1;
      if (this.peek().type === "colon") {
        this.index += 1;
        const end = this.consume("cell");
        return { type: "range", start: token.value, end: end.value };
      }
      return { type: "cell", reference: token.value };
    }
    if (token.type === "identifier") {
      this.index += 1;
      const name = token.value;
      this.consume("leftParen");
      const argumentsList = [];
      if (this.peek().type !== "rightParen") {
        while (true) {
          argumentsList.push(this.parseExpression(0));
          if (this.peek().type !== "comma") break;
          this.index += 1;
        }
      }
      this.consume("rightParen");
      return { type: "call", name, arguments: argumentsList };
    }
    if (token.type === "leftParen") {
      this.index += 1;
      const expression = this.parseExpression(0);
      this.consume("rightParen");
      return { type: "group", expression };
    }
    throw new SpreadsheetFormulaError(
      `Unexpected token: ${token.value || token.type}`,
      SPREADSHEET_ERRORS.parse,
      token.position,
    );
  }
}

export function parseSpreadsheetFormula(formula) {
  return new Parser(tokenize(formula)).parse();
}

function referenceParts(reference) {
  const match = /^([A-Z]+)(\d+)$/.exec(normalizeCellReference(reference));
  return { column: columnToNumber(match[1]), row: Number(match[2]) };
}

export function expandCellRange(start, end) {
  const first = referenceParts(start);
  const last = referenceParts(end);
  const columnStart = Math.min(first.column, last.column);
  const columnEnd = Math.max(first.column, last.column);
  const rowStart = Math.min(first.row, last.row);
  const rowEnd = Math.max(first.row, last.row);
  const count = (columnEnd - columnStart + 1) * (rowEnd - rowStart + 1);
  if (count > SPREADSHEET_LIMITS.maxRangeCells) {
    throw new SpreadsheetRuntimeError(
      `Range contains ${count} cells; the limit is ${SPREADSHEET_LIMITS.maxRangeCells}.`,
      SPREADSHEET_ERRORS.range,
    );
  }
  const references = [];
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let column = columnStart; column <= columnEnd; column += 1) {
      references.push(`${numberToColumn(column)}${row}`);
    }
  }
  return references;
}

function cellEntries(cells) {
  if (cells instanceof Map) return [...cells.entries()];
  if (!cells || typeof cells !== "object" || Array.isArray(cells)) {
    throw new TypeError("Spreadsheet cells must be an object or Map.");
  }
  return Object.entries(cells);
}

function createEvaluator(cells) {
  const source = new Map();
  for (const [reference, raw] of cellEntries(cells)) {
    source.set(normalizeCellReference(reference), raw);
  }
  const memo = new Map();
  const stack = [];
  let rangeVisits = 0;

  const runtimeFailure = (error, reference) => ({
    ok: false,
    error: error.code ?? SPREADSHEET_ERRORS.value,
    message: error.message,
    reference,
    details: error.details,
  });

  function throwMemoFailure(result) {
    throw new SpreadsheetRuntimeError(result.message, result.error, result.details);
  }

  function resolveCell(reference) {
    const normalized = normalizeCellReference(reference);
    if (memo.has(normalized)) {
      const result = memo.get(normalized);
      if (!result.ok) throwMemoFailure(result);
      return result.value === null && result.valueType === "blank" ? BLANK : result.value;
    }
    const cycleIndex = stack.indexOf(normalized);
    if (cycleIndex !== -1) {
      const cycle = [...stack.slice(cycleIndex), normalized];
      throw new SpreadsheetRuntimeError(
        `Circular reference: ${cycle.join(" -> ")}`,
        SPREADSHEET_ERRORS.cycle,
        { cycle },
      );
    }
    if (stack.length >= SPREADSHEET_LIMITS.maxEvaluationDepth) {
      throw new SpreadsheetRuntimeError(
        "Formula dependency depth exceeded the evaluation limit.",
        SPREADSHEET_ERRORS.value,
        { limit: SPREADSHEET_LIMITS.maxEvaluationDepth },
      );
    }
    stack.push(normalized);
    let result;
    try {
      const raw = source.has(normalized) ? source.get(normalized) : null;
      let value;
      if (raw === null || raw === undefined || raw === "") {
        value = BLANK;
      } else if (typeof raw === "string" && raw.startsWith("=")) {
        value = evaluateNode(parseSpreadsheetFormula(raw));
        if (value?.kind === "range") {
          throw new SpreadsheetRuntimeError("A range cannot be the final cell value.", SPREADSHEET_ERRORS.value);
        }
      } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
          value = Number(trimmed);
          if (!Number.isFinite(value)) {
            throw new SpreadsheetRuntimeError("Cell contains a non-finite number.", SPREADSHEET_ERRORS.number);
          }
        } else {
          value = raw;
        }
      } else if (["number", "boolean"].includes(typeof raw)) {
        if (typeof raw === "number" && !Number.isFinite(raw)) {
          throw new SpreadsheetRuntimeError("Cell contains a non-finite number.", SPREADSHEET_ERRORS.number);
        }
        value = raw;
      } else {
        throw new SpreadsheetRuntimeError("Unsupported cell value type.", SPREADSHEET_ERRORS.value);
      }
      result = {
        ok: true,
        value: value === BLANK ? null : value,
        valueType: value === BLANK ? "blank" : typeof value,
        reference: normalized,
      };
      memo.set(normalized, result);
    } catch (error) {
      const runtimeError =
        error instanceof SpreadsheetRuntimeError
          ? error
          : error instanceof SpreadsheetFormulaError
            ? new SpreadsheetRuntimeError(error.message, error.code, { position: error.position })
            : new SpreadsheetRuntimeError(error.message ?? String(error), SPREADSHEET_ERRORS.value);
      result = runtimeFailure(runtimeError, normalized);
      memo.set(normalized, result);
    } finally {
      stack.pop();
    }
    if (!result.ok) throwMemoFailure(result);
    return result.value === null && result.valueType === "blank" ? BLANK : result.value;
  }

  function scalarNumber(value) {
    if (value === BLANK) return 0;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new SpreadsheetRuntimeError("Arithmetic requires numeric cells.", SPREADSHEET_ERRORS.value);
    }
    return value;
  }

  function* functionValues(argumentNodes) {
    for (const argument of argumentNodes) {
      const value = evaluateNode(argument);
      if (value?.kind === "range") yield* value.values;
      else yield value;
    }
  }

  function* numericFunctionValues(argumentNodes) {
    for (const value of functionValues(argumentNodes)) {
      if (typeof value === "number" && Number.isFinite(value)) yield value;
    }
  }

  function finiteFunctionResult(value, functionName) {
    if (!Number.isFinite(value)) {
      throw new SpreadsheetRuntimeError(
        `${functionName} produced a non-finite result.`,
        SPREADSHEET_ERRORS.number,
      );
    }
    return value;
  }

  function evaluateCall(node) {
    const supported = new Set(["SUM", "AVERAGE", "MIN", "MAX", "COUNT"]);
    if (!supported.has(node.name)) {
      throw new SpreadsheetRuntimeError(`Unknown function: ${node.name}`, SPREADSHEET_ERRORS.name);
    }
    switch (node.name) {
      case "SUM": {
        let sum = 0;
        for (const value of numericFunctionValues(node.arguments)) {
          sum = finiteFunctionResult(sum + value, "SUM");
        }
        return sum;
      }
      case "AVERAGE": {
        let average = 0;
        let count = 0;
        for (const value of numericFunctionValues(node.arguments)) {
          count += 1;
          average = finiteFunctionResult(
            average * ((count - 1) / count) + value / count,
            "AVERAGE",
          );
        }
        if (!count) {
          throw new SpreadsheetRuntimeError("AVERAGE has no numeric values.", SPREADSHEET_ERRORS.divisionByZero);
        }
        return average;
      }
      case "MIN": {
        let minimum = Infinity;
        for (const value of numericFunctionValues(node.arguments)) {
          if (value < minimum) minimum = value;
        }
        return minimum === Infinity ? 0 : minimum;
      }
      case "MAX": {
        let maximum = -Infinity;
        for (const value of numericFunctionValues(node.arguments)) {
          if (value > maximum) maximum = value;
        }
        return maximum === -Infinity ? 0 : maximum;
      }
      case "COUNT": {
        let count = 0;
        for (const _value of numericFunctionValues(node.arguments)) count += 1;
        return count;
      }
      default:
        throw new SpreadsheetRuntimeError("Unsupported function.", SPREADSHEET_ERRORS.name);
    }
  }

  function evaluateNode(node) {
    switch (node.type) {
      case "number":
      case "string":
        return node.value;
      case "cell":
        return resolveCell(node.reference);
      case "range":
        {
          const references = expandCellRange(node.start, node.end);
          rangeVisits += references.length;
          if (rangeVisits > SPREADSHEET_LIMITS.maxRangeCells) {
            throw new SpreadsheetRuntimeError(
              `Formula range visits exceed ${SPREADSHEET_LIMITS.maxRangeCells} cells.`,
              SPREADSHEET_ERRORS.range,
              {
                limit: SPREADSHEET_LIMITS.maxRangeCells,
                attempted: rangeVisits,
              },
            );
          }
          return {
            kind: "range",
            values: references.map(resolveCell),
          };
        }
      case "group":
        return evaluateNode(node.expression);
      case "unary": {
        const value = scalarNumber(evaluateNode(node.operand));
        return node.operator === "-" ? -value : value;
      }
      case "binary": {
        const left = scalarNumber(evaluateNode(node.left));
        const right = scalarNumber(evaluateNode(node.right));
        let result;
        if (node.operator === "+") result = left + right;
        else if (node.operator === "-") result = left - right;
        else if (node.operator === "*") result = left * right;
        else if (node.operator === "/") {
          if (right === 0) {
            throw new SpreadsheetRuntimeError("Division by zero.", SPREADSHEET_ERRORS.divisionByZero);
          }
          result = left / right;
        } else if (node.operator === "^") result = left ** right;
        if (!Number.isFinite(result)) {
          throw new SpreadsheetRuntimeError("Arithmetic result is non-finite.", SPREADSHEET_ERRORS.number);
        }
        return result;
      }
      case "call":
        return evaluateCall(node);
      default:
        throw new SpreadsheetRuntimeError("Unknown formula node.", SPREADSHEET_ERRORS.parse);
    }
  }

  function evaluate(reference) {
    const normalized = normalizeCellReference(reference);
    rangeVisits = 0;
    try {
      resolveCell(normalized);
    } catch {
      // The normalized result is retained in memo with exact error metadata.
    }
    return memo.get(normalized);
  }

  return { evaluate, source, memo };
}

export function evaluateSpreadsheetCell(cells, reference) {
  return createEvaluator(cells).evaluate(reference);
}

export function evaluateSpreadsheet(cells) {
  const evaluator = createEvaluator(cells);
  const results = Object.create(null);
  for (const reference of evaluator.source.keys()) {
    results[reference] = evaluator.evaluate(reference);
  }
  return results;
}
