export const MATH_FORMULA_LIMITS = Object.freeze({
  maxLength: 4_096,
  maxNodes: 2_000,
  maxDepth: 128,
  maxOutputLength: 200_000,
});

export class MathFormulaError extends Error {
  constructor(message, code = "INVALID_MATH_FORMULA", position = null) {
    super(message);
    this.name = "MathFormulaError";
    this.code = code;
    this.position = position;
  }
}

function validatedXmlText(value) {
  const text = String(value);
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    const valid =
      codePoint === 0x9 ||
      codePoint === 0xa ||
      codePoint === 0xd ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (!valid) {
      throw new MathFormulaError(
        "Math text contains a character that XML 1.0 cannot represent.",
        "INVALID_XML_CHARACTER",
      );
    }
  }
  return text;
}

function escapeValidatedText(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function escapeMathText(value) {
  return escapeValidatedText(validatedXmlText(value));
}

function tokenize(source) {
  if (typeof source !== "string") throw new MathFormulaError("Math formula must be a string.");
  validatedXmlText(source);
  if (!source.trim()) throw new MathFormulaError("Math formula cannot be empty.", "EMPTY_FORMULA");
  if (source.length > MATH_FORMULA_LIMITS.maxLength) {
    throw new MathFormulaError("Math formula exceeds the length limit.", "FORMULA_TOO_LONG");
  }
  const tokens = [];
  let index = 0;
  let parenthesisDepth = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"') {
      const start = index;
      let value = "";
      index += 1;
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
      if (!closed) throw new MathFormulaError("Unterminated text literal.", "INVALID_MATH_FORMULA", start);
      tokens.push({ type: "text", value, position: start });
      continue;
    }
    const rest = source.slice(index);
    const number = /^(?:\d+\.?\d*|\.\d+)/.exec(rest);
    if (number) {
      tokens.push({ type: "number", value: number[0], position: index });
      index += number[0].length;
      continue;
    }
    const identifier = /^[\p{L}\p{Nl}][\p{L}\p{Nl}\p{M}\p{N}]*/u.exec(rest);
    if (identifier) {
      tokens.push({ type: "symbol", value: identifier[0], position: index });
      index += identifier[0].length;
      continue;
    }
    if (character === "(") {
      parenthesisDepth += 1;
      if (parenthesisDepth > MATH_FORMULA_LIMITS.maxDepth) {
        throw new MathFormulaError(
          "Math formula nesting exceeds the depth limit.",
          "FORMULA_TOO_COMPLEX",
          index,
        );
      }
      tokens.push({ type: "leftParen", value: character, position: index });
    } else if (character === ")") {
      parenthesisDepth -= 1;
      tokens.push({ type: "rightParen", value: character, position: index });
    }
    else if (character === "^") tokens.push({ type: "superscript", value: character, position: index });
    else if (character === "_") tokens.push({ type: "subscript", value: character, position: index });
    else if ("+-−*×·/=<>≤≥≠±".includes(character)) {
      tokens.push({ type: "operator", value: character, position: index });
    } else {
      // Unknown glyphs are symbols, never markup. This keeps arbitrary Unicode
      // useful while the renderer's escaping remains the security boundary.
      const glyph = String.fromCodePoint(source.codePointAt(index));
      tokens.push({ type: "symbol", value: glyph, position: index });
      index += glyph.length;
      continue;
    }
    index += 1;
  }
  tokens.push({ type: "eof", value: "", position: source.length });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
    this.nodes = 0;
  }

  node(value) {
    this.nodes += 1;
    if (this.nodes > MATH_FORMULA_LIMITS.maxNodes) {
      throw new MathFormulaError("Math formula has too many nodes.", "FORMULA_TOO_COMPLEX");
    }
    return value;
  }

  peek() {
    return this.tokens[this.index];
  }

  consume(type) {
    const token = this.peek();
    if (token.type !== type) {
      throw new MathFormulaError(
        `Expected ${type} but found ${token.value || token.type}.`,
        "INVALID_MATH_FORMULA",
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
    let left = this.parsePrefix();
    const precedence = {
      "=": 1,
      "<": 1,
      ">": 1,
      "≤": 1,
      "≥": 1,
      "≠": 1,
      "+": 2,
      "-": 2,
      "−": 2,
      "±": 2,
      "*": 3,
      "×": 3,
      "·": 3,
      "/": 3,
    };
    while (this.peek().type === "operator") {
      const operator = this.peek().value;
      const current = precedence[operator];
      if (current === undefined || current < minimumPrecedence) break;
      this.index += 1;
      const right = this.parseExpression(current + 1);
      left = this.node(
        operator === "/"
          ? { type: "fraction", numerator: left, denominator: right }
          : { type: "binary", operator, left, right },
      );
    }
    return left;
  }

  parsePrefix() {
    const operators = [];
    while (
      this.peek().type === "operator" &&
      ["+", "-", "−", "±"].includes(this.peek().value)
    ) {
      operators.push(this.peek().value);
      if (operators.length > MATH_FORMULA_LIMITS.maxDepth) {
        throw new MathFormulaError(
          "Unary expression exceeds the depth limit.",
          "FORMULA_TOO_COMPLEX",
          this.peek().position,
        );
      }
      this.index += 1;
    }
    let expression = this.parseScripts(this.parseAtom());
    for (let index = operators.length - 1; index >= 0; index -= 1) {
      expression = this.node({
        type: "unary",
        operator: operators[index],
        operand: expression,
      });
    }
    return expression;
  }

  parseScriptValue() {
    const operators = [];
    while (
      this.peek().type === "operator" &&
      ["+", "-", "−", "±"].includes(this.peek().value)
    ) {
      operators.push(this.peek().value);
      if (operators.length > MATH_FORMULA_LIMITS.maxDepth) {
        throw new MathFormulaError(
          "Script expression exceeds the depth limit.",
          "FORMULA_TOO_COMPLEX",
          this.peek().position,
        );
      }
      this.index += 1;
    }
    let value = this.parseAtom();
    for (let index = operators.length - 1; index >= 0; index -= 1) {
      value = this.node({ type: "unary", operator: operators[index], operand: value });
    }
    return value;
  }

  parseScripts(base) {
    let superscript = null;
    let subscript = null;
    while (this.peek().type === "superscript" || this.peek().type === "subscript") {
      const type = this.peek().type;
      this.index += 1;
      const value = this.parseScriptValue();
      if (type === "superscript") {
        if (superscript) throw new MathFormulaError("A base can have only one superscript.");
        superscript = value;
      } else {
        if (subscript) throw new MathFormulaError("A base can have only one subscript.");
        subscript = value;
      }
    }
    return superscript || subscript
      ? this.node({ type: "scripts", base, superscript, subscript })
      : base;
  }

  parseAtom() {
    const token = this.peek();
    if (token.type === "number") {
      this.index += 1;
      return this.node({ type: "literal", value: token.value });
    }
    if (token.type === "text") {
      this.index += 1;
      return this.node({ type: "text", value: token.value });
    }
    if (token.type === "symbol") {
      this.index += 1;
      if (token.value.toLowerCase() === "sqrt" && this.peek().type === "leftParen") {
        this.index += 1;
        const radicand = this.parseExpression(0);
        this.consume("rightParen");
        return this.node({ type: "sqrt", radicand });
      }
      return this.node({ type: "symbol", value: token.value });
    }
    if (token.type === "leftParen") {
      this.index += 1;
      const expression = this.parseExpression(0);
      this.consume("rightParen");
      return this.node({ type: "parentheses", expression });
    }
    throw new MathFormulaError(
      `Unexpected token: ${token.value || token.type}`,
      "INVALID_MATH_FORMULA",
      token.position,
    );
  }
}

export function parseMathFormula(source) {
  return new Parser(tokenize(source)).parse();
}

function renderNode(node, state, depth = 0) {
  if (!node || typeof node !== "object") throw new MathFormulaError("Math AST node must be an object.");
  if (depth > MATH_FORMULA_LIMITS.maxDepth) {
    throw new MathFormulaError("Math AST exceeds the depth limit.", "FORMULA_TOO_COMPLEX");
  }
  state.nodes += 1;
  if (state.nodes > MATH_FORMULA_LIMITS.maxNodes) {
    throw new MathFormulaError("Math AST has too many nodes.", "FORMULA_TOO_COMPLEX");
  }
  if (typeof node.type !== "string" || node.type.length > 32) {
    throw new MathFormulaError("Math AST has an invalid node type.");
  }
  const child = (value) => renderNode(value, state, depth + 1);
  const text = (value) => {
    const source = validatedXmlText(value);
    state.textLength += source.length;
    if (state.textLength > MATH_FORMULA_LIMITS.maxLength) {
      throw new MathFormulaError(
        "Math AST text exceeds the length limit.",
        "FORMULA_TOO_LONG",
      );
    }
    return escapeValidatedText(source);
  };
  switch (node.type) {
    case "literal":
      return `<mn>${text(node.value)}</mn>`;
    case "symbol":
      return `<mi>${text(node.value)}</mi>`;
    case "text":
      return `<mtext>${text(node.value)}</mtext>`;
    case "operator":
      return `<mo>${text(node.value)}</mo>`;
    case "unary":
      return `<mrow><mo>${text(node.operator)}</mo>${child(node.operand)}</mrow>`;
    case "binary":
      return `<mrow>${child(node.left)}<mo>${text(node.operator)}</mo>${child(node.right)}</mrow>`;
    case "fraction":
      return `<mfrac>${child(node.numerator)}${child(node.denominator)}</mfrac>`;
    case "superscript":
      return `<msup>${child(node.base)}${child(node.exponent)}</msup>`;
    case "subscript":
      return `<msub>${child(node.base)}${child(node.subscript)}</msub>`;
    case "scripts":
      if (node.superscript && node.subscript) {
        return `<msubsup>${child(node.base)}${child(node.subscript)}${child(node.superscript)}</msubsup>`;
      }
      if (node.superscript) return `<msup>${child(node.base)}${child(node.superscript)}</msup>`;
      if (node.subscript) return `<msub>${child(node.base)}${child(node.subscript)}</msub>`;
      throw new MathFormulaError("Scripts node has no script.");
    case "sqrt":
      return `<msqrt>${child(node.radicand)}</msqrt>`;
    case "parentheses":
    case "group":
      return `<mrow><mo fence="true">(</mo>${child(node.expression)}<mo fence="true">)</mo></mrow>`;
    default:
      throw new MathFormulaError("Unsupported Math AST node type.");
  }
}

export function renderMathML(formulaOrAst, { display = "inline" } = {}) {
  const ast = typeof formulaOrAst === "string" ? parseMathFormula(formulaOrAst) : formulaOrAst;
  const displayMode = display === "block" ? "block" : "inline";
  const body = renderNode(ast, { nodes: 0, textLength: 0 });
  const output = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${displayMode}"><mrow>${body}</mrow></math>`;
  if (output.length > MATH_FORMULA_LIMITS.maxOutputLength) {
    throw new MathFormulaError("Generated MathML exceeds the output limit.", "FORMULA_TOO_COMPLEX");
  }
  return output;
}

export const renderFormulaToMathML = renderMathML;
