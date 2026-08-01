import {
  evaluateRegex,
  evaluateRegexCollection,
} from "../../src/renderer/core/regex.mjs";

export const REGEX_LIMITS = Object.freeze({
  pattern: 500,
  sample: 4_000,
  value: 8_000,
  values: 3_000,
  matches: 20,
});

function fail(code, error) {
  return { ok: false, code, error };
}

function deadlinePassed(deadlineEpochMs, now) {
  return !Number.isFinite(deadlineEpochMs) || now() >= deadlineEpochMs;
}

function requestFor(pattern, flags, sample = "") {
  return { mode: "regex", query: pattern, pattern, flags, sample };
}

/**
 * Landing adapter for the project-owned regex core. This module is loaded only
 * inside regex.worker.ts; page components never import or call it. The page's
 * hard timer can terminate evaluation even while JavaScript RegExp cannot yield.
 */
export function evaluateRegexRequest(request, now = Date.now) {
  if (!request || typeof request !== "object") return fail("invalid-request", "The regex request is invalid.");
  const { operation, pattern, flags = "", deadlineEpochMs } = request;
  if (operation !== "filter" && operation !== "preview") return fail("invalid-request", "The regex operation is invalid.");
  if (typeof pattern !== "string") return fail("invalid-pattern", "The pattern must be text.");
  if (pattern.length > REGEX_LIMITS.pattern) return fail("limit", `Patterns are limited to ${REGEX_LIMITS.pattern} characters.`);
  if (deadlinePassed(deadlineEpochMs, now)) return fail("timeout", "Regex evaluation reached its deadline.");

  try {
    if (operation === "filter") {
      if (!Array.isArray(request.values) || request.values.length > REGEX_LIMITS.values) {
        return fail("limit", `A regex filter accepts at most ${REGEX_LIMITS.values} values.`);
      }
      const values = request.values.map((value) => {
        if (typeof value !== "string") throw Object.assign(new TypeError("Regex filter values must be text."), { code: "invalid-request" });
        return value.slice(0, REGEX_LIMITS.value);
      });
      if (deadlinePassed(deadlineEpochMs, now)) return fail("timeout", "Regex evaluation reached its deadline.");
      const result = evaluateRegexCollection(requestFor(pattern, flags), values, { allowRisky: true });
      return { ok: true, operation, indices: result.matchedIndices };
    }

    if (typeof request.sample !== "string") return fail("invalid-request", "The preview sample must be text.");
    const result = evaluateRegex(
      requestFor(pattern, flags, request.sample.slice(0, REGEX_LIMITS.sample)),
      { allowRisky: true, maxMatches: REGEX_LIMITS.matches },
    );
    return {
      ok: true,
      operation,
      matches: result.matches.map((match) => ({
        value: match.value,
        index: match.index,
        groups: match.captures.map((capture) => capture.value),
      })),
    };
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code.toLocaleLowerCase().replaceAll("_", "-") : "syntax";
    return fail(code, error instanceof Error ? error.message : "Invalid pattern.");
  }
}
