import test from "node:test";
import assert from "node:assert/strict";

import {
  SPREADSHEET_ERRORS,
  evaluateSpreadsheet,
  evaluateSpreadsheetCell,
  normalizeCellReference,
  parseSpreadsheetFormula,
} from "../src/renderer/core/spreadsheet.mjs";
import {
  MathFormulaError,
  escapeMathText,
  parseMathFormula,
  renderMathML,
} from "../src/renderer/core/mathml.mjs";

test("spreadsheet arithmetic uses a parser with precedence and right-associative powers", () => {
  const result = evaluateSpreadsheet({
    A1: "=2 + 3 * 4",
    A2: "=(2 + 3) * 4",
    A3: "=2^3^2",
    A4: "=-5 + +2",
  });
  assert.equal(result.A1.value, 14);
  assert.equal(result.A2.value, 20);
  assert.equal(result.A3.value, 512);
  assert.equal(result.A4.value, -3);
  assert.equal(normalizeCellReference("$a$4"), "A4");
});

test("cell references, ranges, functions, Unicode, and string cells evaluate safely", () => {
  const result = evaluateSpreadsheet({
    A1: 10,
    A2: 20,
    A3: "香港辦公室",
    A4: null,
    B1: "=SUM(A1:A4, 5)",
    B2: "=AVERAGE(A1:A2)",
    B3: "=MIN(A1:A2)",
    B4: "=MAX(A1:A2)",
    B5: "=COUNT(A1:A4)",
    C1: "=A3",
    C2: "=A4 + 7",
    C3: '=SUM(1, "not numeric", 2)',
  });
  assert.equal(result.B1.value, 35);
  assert.equal(result.B2.value, 15);
  assert.equal(result.B3.value, 10);
  assert.equal(result.B4.value, 20);
  assert.equal(result.B5.value, 2);
  assert.equal(result.C1.value, "香港辦公室");
  assert.equal(result.C2.value, 7);
  assert.equal(result.C3.value, 3);
});

test("numeric text entered through the spreadsheet grid participates in formulas", () => {
  const result = evaluateSpreadsheet({
    A1: "4200",
    B1: " 4.5 ",
    C1: "=SUM(A1:B1)",
    D1: "0012",
    E1: "not numeric",
  });
  assert.equal(result.A1.value, 4200);
  assert.equal(result.B1.value, 4.5);
  assert.equal(result.C1.value, 4204.5);
  assert.equal(result.D1.value, 12);
  assert.equal(result.E1.value, "not numeric");
});

test("cycles and formula errors remain explicit and propagate", () => {
  const result = evaluateSpreadsheet({
    A1: "=B1 + 1",
    B1: "=C1 + 1",
    C1: "=A1 + 1",
    D1: "=1 / 0",
    D2: "=MYSTERY(1)",
    D3: "=1 +",
    D4: "=A99 + 2",
    D5: "=SUM(A1:XFD1048576)",
    E1: "text",
    E2: "=E1 + 1",
  });
  for (const reference of ["A1", "B1", "C1"]) {
    assert.equal(result[reference].error, SPREADSHEET_ERRORS.cycle);
    assert.match(result[reference].message, /Circular reference/);
  }
  assert.equal(result.D1.error, SPREADSHEET_ERRORS.divisionByZero);
  assert.equal(result.D2.error, SPREADSHEET_ERRORS.name);
  assert.equal(result.D3.error, SPREADSHEET_ERRORS.parse);
  assert.equal(result.D4.value, 2);
  assert.equal(result.D5.error, SPREADSHEET_ERRORS.range);
  assert.equal(result.E2.error, SPREADSHEET_ERRORS.value);
});

test("aggregate functions enforce one range budget and finite numeric results", () => {
  const repeatedRange = evaluateSpreadsheetCell(
    { A1: 1, Z1: "=SUM(A1:J1000,A1:J1000)" },
    "Z1",
  );
  assert.equal(repeatedRange.ok, false);
  assert.equal(repeatedRange.error, SPREADSHEET_ERRORS.range);
  assert.match(repeatedRange.message, /range visits exceed/i);

  const overflow = evaluateSpreadsheet({
    A1: "=SUM(1e308,1e308)",
    A2: "=AVERAGE(1e308,1e308)",
  });
  assert.equal(overflow.A1.error, SPREADSHEET_ERRORS.number);
  assert.equal(overflow.A2.ok, true);
  assert.equal(overflow.A2.value, 1e308);
});

test("acyclic dependency depth is a complexity error rather than a false cycle", () => {
  const cells = {};
  for (let row = 1; row <= 1_001; row += 1) {
    cells[`A${row}`] = row === 1_001 ? 1 : `=A${row + 1}`;
  }
  const result = evaluateSpreadsheetCell(cells, "A1");
  assert.equal(result.ok, false);
  assert.equal(result.error, SPREADSHEET_ERRORS.value);
  assert.doesNotMatch(result.message, /Circular reference/);
});

test("spreadsheet formulas never execute JavaScript", () => {
  globalThis.__materialOfficeFormulaPwned = false;
  const result = evaluateSpreadsheetCell(
    { A1: "=globalThis.__materialOfficeFormulaPwned = true" },
    "A1",
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, SPREADSHEET_ERRORS.parse);
  assert.equal(globalThis.__materialOfficeFormulaPwned, false);
  delete globalThis.__materialOfficeFormulaPwned;
  assert.doesNotThrow(() => parseSpreadsheetFormula("=SUM($A$1:B2)"));
  assert.throws(
    () => parseSpreadsheetFormula(`=${"(".repeat(300)}1${")".repeat(300)}`),
    (error) => error.code === SPREADSHEET_ERRORS.parse,
  );
});

test("MathML parser renders literals, symbols, operators, fractions, scripts, roots, and parentheses", () => {
  const ast = parseMathFormula("sqrt((x_1^2 + 1) / 2) = α");
  const mathml = renderMathML(ast, { display: "block" });
  assert.match(mathml, /^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML" display="block">/);
  assert.match(mathml, /<msqrt>/);
  assert.match(mathml, /<mfrac>/);
  assert.match(mathml, /<msubsup><mi>x<\/mi><mn>1<\/mn><mn>2<\/mn><\/msubsup>/);
  assert.match(mathml, /<mo fence="true">\(<\/mo>/);
  assert.match(mathml, /<mo>=<\/mo><mi>α<\/mi>/);
});

test("direct MathML AST forms support standalone superscript and subscript", () => {
  assert.match(
    renderMathML({
      type: "superscript",
      base: { type: "symbol", value: "x" },
      exponent: { type: "literal", value: "2" },
    }),
    /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/,
  );
  assert.match(
    renderMathML({
      type: "subscript",
      base: { type: "symbol", value: "a" },
      subscript: { type: "symbol", value: "n" },
    }),
    /<msub><mi>a<\/mi><mi>n<\/mi><\/msub>/,
  );
});

test("MathML escapes every text-bearing node and rejects malformed formulas", () => {
  const payload = '</mi><script data-x="1">alert(1)</script>&';
  const rendered = renderMathML({ type: "symbol", value: payload });
  assert.equal(rendered.includes("<script"), false);
  assert.match(rendered, /&lt;script data-x=&quot;1&quot;&gt;/);
  assert.match(rendered, /&amp;/);
  assert.equal(escapeMathText("<'&\">"), "&lt;&apos;&amp;&quot;&gt;");
  assert.throws(
    () => renderMathML("sqrt(1 + 2"),
    (error) => error instanceof MathFormulaError,
  );
  assert.throws(
    () => renderMathML(`${"(".repeat(200)}x${")".repeat(200)}`),
    (error) => error instanceof MathFormulaError && error.code === "FORMULA_TOO_COMPLEX",
  );
  assert.throws(
    () => renderMathML({ type: "symbol", value: "x".repeat(4_097) }),
    (error) => error instanceof MathFormulaError && error.code === "FORMULA_TOO_LONG",
  );
  for (const invalid of ["\0", "\ud800"]) {
    assert.throws(
      () => renderMathML({ type: "symbol", value: invalid }),
      (error) => error instanceof MathFormulaError && error.code === "INVALID_XML_CHARACTER",
    );
  }
});

test("MathML handles astral symbols, signed scripts, and unary depth bounds", () => {
  assert.match(renderMathML("😀"), /<mi>😀<\/mi>/);
  assert.match(renderMathML("x^-1 + y_+2"), /<msup><mi>x<\/mi><mrow><mo>-<\/mo><mn>1<\/mn><\/mrow><\/msup>/);
  assert.match(renderMathML("x^-1 + y_+2"), /<msub><mi>y<\/mi><mrow><mo>\+<\/mo><mn>2<\/mn><\/mrow><\/msub>/);
  assert.throws(
    () => parseMathFormula(`${"-".repeat(129)}x`),
    (error) => error instanceof MathFormulaError && error.code === "FORMULA_TOO_COMPLEX",
  );
});
