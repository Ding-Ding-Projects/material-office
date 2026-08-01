export const REGEX_LIMITS = Object.freeze({
  maxPatternLength: 512,
  maxSampleLength: 20_000,
  maxMatches: 2_000,
  maxCollectionItems: 10_000,
  maxCollectionItemLength: 20_000,
  maxCollectionTextLength: 1_000_000,
  maxFlagsLength: 8,
});

const VALID_FLAGS = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);
const SUPPORTS_MATCH_INDICES = (() => {
  try {
    return new RegExp(".", "d").hasIndices === true;
  } catch {
    return false;
  }
})();

export class RegexValidationError extends Error {
  constructor(message, code = "INVALID_REGEX", details = undefined) {
    super(message);
    this.name = "RegexValidationError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function escapeRegexLiteral(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

export function validateRegexFlags(flags = "") {
  if (typeof flags !== "string") {
    throw new RegexValidationError("Regex flags must be a string.", "INVALID_FLAGS");
  }
  if (flags.length > REGEX_LIMITS.maxFlagsLength) {
    throw new RegexValidationError("Too many regex flags.", "INVALID_FLAGS");
  }
  const seen = new Set();
  for (const flag of flags) {
    if (!VALID_FLAGS.has(flag)) {
      throw new RegexValidationError(`Unsupported regex flag: ${flag}`, "INVALID_FLAGS");
    }
    if (seen.has(flag)) {
      throw new RegexValidationError(`Duplicate regex flag: ${flag}`, "INVALID_FLAGS");
    }
    seen.add(flag);
  }
  if (seen.has("u") && seen.has("v")) {
    throw new RegexValidationError(
      "Regex flags u and v cannot be used together.",
      "INVALID_FLAGS",
    );
  }
  return flags;
}

export function validateRegexPattern(pattern) {
  if (typeof pattern !== "string") {
    throw new RegexValidationError("Regex pattern must be a string.", "INVALID_PATTERN");
  }
  if (pattern.length === 0) {
    throw new RegexValidationError("Regex pattern cannot be empty.", "EMPTY_PATTERN");
  }
  if (pattern.length > REGEX_LIMITS.maxPatternLength) {
    throw new RegexValidationError(
      `Regex pattern exceeds ${REGEX_LIMITS.maxPatternLength} characters.`,
      "PATTERN_TOO_LONG",
    );
  }
  return pattern;
}

/**
 * A deliberately conservative pre-flight check. It catches common exponential
 * forms before they reach a worker; the worker deadline remains the authority
 * for patterns whose runtime cannot be proven statically.
 */
export function assessRegexRisk(pattern) {
  const reasons = [];
  const source = String(pattern);
  if (/\\[1-9]/.test(source) || /\\k<[^>]+>/.test(source)) {
    reasons.push("backreference");
  }
  if (/(?:\.\*){2,}|(?:\.\+){2,}/.test(source)) {
    reasons.push("repeated-wildcard");
  }
  if (
    /\((?:\?:|\?<[^=!][^>]*>)?(?:[^()\\]|\\.)*(?:\*|\+|\{\d+,\})(?:[^()\\]|\\.)*\)(?:\*|\+|\{\d+,?\d*\})/.test(
      source,
    )
  ) {
    reasons.push("nested-quantifier");
  }
  if (
    /\((?:\?:)?([^|()\\]+)\|\1[^|()]*(?:\))(?:\*|\+|\{\d+,?\d*\})/.test(
      source,
    )
  ) {
    reasons.push("overlapping-alternation");
  }
  return Object.freeze({ risky: reasons.length > 0, reasons: Object.freeze(reasons) });
}

function normalizeMode(mode) {
  if (mode === undefined || mode === null || mode === "") return "plain";
  if (mode !== "plain" && mode !== "regex") {
    throw new RegexValidationError(`Unsupported match mode: ${mode}`, "INVALID_MODE");
  }
  return mode;
}

export function normalizeRegexRequest(request = {}) {
  if (!request || typeof request !== "object") {
    throw new RegexValidationError("Regex request must be an object.", "INVALID_REQUEST");
  }
  const mode = normalizeMode(request.mode);
  const query = typeof request.query === "string" ? request.query : "";
  const pattern = mode === "plain" ? escapeRegexLiteral(query) : request.pattern ?? query;
  if (query.length > REGEX_LIMITS.maxSampleLength) {
    throw new RegexValidationError(
      `Plain-text query exceeds ${REGEX_LIMITS.maxSampleLength} characters.`,
      "QUERY_TOO_LONG",
    );
  }
  validateRegexPattern(pattern);
  const flags = validateRegexFlags(request.flags ?? "");
  return Object.freeze({ mode, query, pattern, flags });
}

export function compileRegex(
  request,
  { global = false, allowRisky = false, indices = false } = {},
) {
  const normalized = normalizeRegexRequest(request);
  const risk = assessRegexRisk(normalized.pattern);
  if (risk.risky && !allowRisky) {
    throw new RegexValidationError(
      "Pattern requires isolated worker evaluation because it may backtrack excessively.",
      "UNSAFE_PATTERN",
      risk,
    );
  }
  let flags = normalized.flags;
  if (global && !flags.includes("g")) flags += "g";
  if (!global) flags = flags.replaceAll("g", "").replaceAll("y", "");
  if (indices && SUPPORTS_MATCH_INDICES && !flags.includes("d")) flags += "d";
  try {
    return {
      regex: new RegExp(normalized.pattern, flags),
      request: normalized,
      risk,
    };
  } catch (error) {
    throw new RegexValidationError(error.message, "INVALID_PATTERN");
  }
}

function advanceStringIndex(text, index, unicode) {
  if (!unicode || index >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  if (first < 0xd800 || first > 0xdbff || index + 1 >= text.length) return index + 1;
  const second = text.charCodeAt(index + 1);
  return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
}

function captureRecord(match) {
  return match.slice(1).map((value, captureIndex) => ({
    captureIndex: captureIndex + 1,
    value: value ?? null,
    index: match.indices?.[captureIndex + 1]?.[0] ?? null,
  }));
}

export function evaluateRegex(request, options = {}) {
  const sample = typeof request?.sample === "string" ? request.sample : "";
  if (sample.length > REGEX_LIMITS.maxSampleLength) {
    throw new RegexValidationError(
      `Sample exceeds ${REGEX_LIMITS.maxSampleLength} characters.`,
      "SAMPLE_TOO_LONG",
    );
  }
  const limit = Math.min(
    REGEX_LIMITS.maxMatches,
    Math.max(1, Number.isInteger(options.maxMatches) ? options.maxMatches : REGEX_LIMITS.maxMatches),
  );
  const { regex, request: normalized, risk } = compileRegex(request, {
    global: true,
    allowRisky: options.allowRisky === true,
    indices: true,
  });
  const matches = [];
  let truncated = false;
  let match;
  while ((match = regex.exec(sample)) !== null) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    matches.push({
      value: match[0],
      index: match.index,
      end: match.index + match[0].length,
      captures: captureRecord(match),
      namedCaptures: match.groups ? { ...match.groups } : {},
    });
    if (match[0].length === 0) {
      regex.lastIndex = advanceStringIndex(
        sample,
        regex.lastIndex,
        normalized.flags.includes("u") || normalized.flags.includes("v"),
      );
    }
  }
  return {
    mode: normalized.mode,
    pattern: normalized.pattern,
    flags: normalized.flags,
    matches,
    truncated,
    risk,
  };
}

export function evaluateRegexCollection(request, values, options = {}) {
  if (!Array.isArray(values)) {
    throw new RegexValidationError("Regex collection must be an array.", "INVALID_COLLECTION");
  }
  if (values.length > REGEX_LIMITS.maxCollectionItems) {
    throw new RegexValidationError(
      `Regex collection exceeds ${REGEX_LIMITS.maxCollectionItems} items.`,
      "COLLECTION_TOO_LARGE",
    );
  }
  let totalLength = 0;
  const strings = values.map((value) => {
    if (typeof value !== "string") {
      throw new RegexValidationError(
        "Every regex collection value must be a string.",
        "INVALID_COLLECTION",
      );
    }
    if (value.length > REGEX_LIMITS.maxCollectionItemLength) {
      throw new RegexValidationError(
        `Regex collection item exceeds ${REGEX_LIMITS.maxCollectionItemLength} characters.`,
        "COLLECTION_ITEM_TOO_LONG",
      );
    }
    totalLength += value.length;
    if (totalLength > REGEX_LIMITS.maxCollectionTextLength) {
      throw new RegexValidationError(
        `Regex collection text exceeds ${REGEX_LIMITS.maxCollectionTextLength} characters.`,
        "COLLECTION_TEXT_TOO_LONG",
      );
    }
    return value;
  });
  const mode = normalizeMode(request?.mode);
  if (mode === "plain" && (request?.query ?? "") === "") {
    const flags = validateRegexFlags(request?.flags ?? "");
    const matches = strings.map(() => true);
    return {
      mode,
      pattern: "",
      flags,
      matches,
      matchedIndices: matches.map((_match, index) => index),
      risk: Object.freeze({ risky: false, reasons: Object.freeze([]) }),
    };
  }
  const { regex, request: normalized, risk } = compileRegex(request, {
    allowRisky: options.allowRisky === true,
  });
  const matches = strings.map((value) => regex.test(value));
  return {
    mode: normalized.mode,
    pattern: normalized.pattern,
    flags: normalized.flags,
    matches,
    matchedIndices: matches.flatMap((match, index) => (match ? [index] : [])),
    risk,
  };
}

/**
 * Synchronous collection filtering is intentionally plain-text only. Regex
 * callers must use `RegexWorkerEvaluator.filter` so hostile patterns can be
 * terminated at a deadline.
 */
export function filterCollection(values, request = {}, options = {}) {
  if (normalizeMode(request?.mode) === "regex") {
    compileRegex(request, { allowRisky: true });
    throw new RegexValidationError(
      "Regex collection filters require deadline-bounded worker evaluation.",
      "REGEX_WORKER_REQUIRED",
    );
  }
  return evaluateRegexCollection(request, values, options).matchedIndices;
}

export function createRegexPredicate(request, options = {}) {
  const { regex, request: normalized } = compileRegex(request, {
    allowRisky: options.allowRisky === true,
  });
  return Object.freeze({
    request: normalized,
    test(value) {
      return regex.test(String(value));
    },
  });
}

function rawFragment(value, name = "fragment") {
  if (typeof value !== "string" || value.length === 0) {
    throw new RegexValidationError(`${name} cannot be empty.`, "INVALID_GUIDED_TOKEN");
  }
  if (value.length > REGEX_LIMITS.maxPatternLength) {
    throw new RegexValidationError(`${name} is too long.`, "PATTERN_TOO_LONG");
  }
  return value;
}

function escapeCharacterClass(value) {
  return String(value).replace(/[\\\]\^-]/g, "\\$&");
}

export function buildGuidedToken(token) {
  if (!token || typeof token !== "object") {
    throw new RegexValidationError("Guided token must be an object.", "INVALID_GUIDED_TOKEN");
  }
  switch (token.type) {
    case "literal":
      return escapeRegexLiteral(token.value ?? "");
    case "characterClass": {
      const value = rawFragment(String(token.value ?? ""), "Character class");
      const body = token.raw === true ? value.replace(/\]/g, "\\]") : escapeCharacterClass(value);
      return `[${token.negated ? "^" : ""}${body}]`;
    }
    case "anchor": {
      const anchors = {
        start: "^",
        end: "$",
        wordBoundary: "\\b",
        nonWordBoundary: "\\B",
      };
      if (!anchors[token.value]) {
        throw new RegexValidationError("Unknown anchor type.", "INVALID_GUIDED_TOKEN");
      }
      return anchors[token.value];
    }
    case "group": {
      const body = rawFragment(token.pattern, "Group pattern");
      if (token.name !== undefined) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(token.name)) {
          throw new RegexValidationError("Invalid capture-group name.", "INVALID_GUIDED_TOKEN");
        }
        return `(?<${token.name}>${body})`;
      }
      return token.capturing === false ? `(?:${body})` : `(${body})`;
    }
    case "alternation": {
      if (!Array.isArray(token.branches) || token.branches.length < 2) {
        throw new RegexValidationError(
          "Alternation needs at least two branches.",
          "INVALID_GUIDED_TOKEN",
        );
      }
      const branches = token.branches.map((branch) =>
        token.raw === true
          ? rawFragment(branch, "Alternation branch")
          : escapeRegexLiteral(branch),
      );
      return `(?:${branches.join("|")})`;
    }
    case "quantifier": {
      const subject = rawFragment(token.subject, "Quantifier subject");
      const min = Number(token.min);
      const max = token.max === null || token.max === undefined ? null : Number(token.max);
      if (!Number.isInteger(min) || min < 0 || min > 10_000) {
        throw new RegexValidationError("Invalid quantifier minimum.", "INVALID_GUIDED_TOKEN");
      }
      if (max !== null && (!Number.isInteger(max) || max < min || max > 10_000)) {
        throw new RegexValidationError("Invalid quantifier maximum.", "INVALID_GUIDED_TOKEN");
      }
      const quantifier =
        max === null ? (min === 0 ? "*" : min === 1 ? "+" : `{${min},}`) : min === max ? `{${min}}` : `{${min},${max}}`;
      return `(?:${subject})${quantifier}${token.greedy === false ? "?" : ""}`;
    }
    default:
      throw new RegexValidationError(
        `Unknown guided token type: ${token.type}`,
        "INVALID_GUIDED_TOKEN",
      );
  }
}

export function buildGuidedPattern(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new RegexValidationError("At least one guided token is required.", "INVALID_GUIDED_TOKEN");
  }
  const pattern = tokens.map(buildGuidedToken).join("");
  validateRegexPattern(pattern);
  return pattern;
}
