import { useEffect, useMemo, useState } from "react";

export const REGEX_TIMEOUT_MS = 80;

export type RegexSearchState = {
  query: string;
  regex: boolean;
  flags: string;
  sample: string;
  open: boolean;
};

export type RegexMatch = { value: string; index: number; groups: Array<string | null> };

export type RegexEvaluation = {
  key: string;
  pending: boolean;
  error: string;
  timedOut: boolean;
  indices: number[];
  matches: RegexMatch[];
};

type RegexOperation = "filter" | "preview";
type RegexResult =
  | { ok: true; operation: "filter"; indices: number[] }
  | { ok: true; operation: "preview"; matches: RegexMatch[] }
  | { ok: false; code: string; error: string };

type RegexJob = { promise: Promise<RegexResult>; cancel: () => void };

let requestSequence = 0;

function timeoutResult(): RegexResult {
  return { ok: false, code: "timeout", error: "Regex evaluation timed out. Refine the pattern and try again." };
}

function createRegexJob(
  operation: RegexOperation,
  pattern: string,
  flags: string,
  payload: { values?: string[]; sample?: string },
): RegexJob {
  let settled = false;
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveResult: (value: RegexResult) => void = () => undefined;

  const finish = (result: RegexResult) => {
    if (settled) return;
    settled = true;
    if (timer !== null) globalThis.clearTimeout(timer);
    worker?.terminate();
    worker = null;
    resolveResult(result);
  };

  const promise = new Promise<RegexResult>((resolve) => {
    resolveResult = resolve;
    if (typeof Worker === "undefined") {
      finish({ ok: false, code: "unavailable", error: "Regex worker is unavailable in this browser." });
      return;
    }

    try {
      const id = ++requestSequence;
      worker = new Worker(new URL("./regex.worker.ts", import.meta.url), {
        type: "module",
        name: `material-office-regex-${id}`,
      });
      worker.onmessage = (event: MessageEvent<{ id: number; result: RegexResult }>) => {
        if (event.data?.id !== id) return;
        finish(event.data.result);
      };
      worker.onerror = () => finish({ ok: false, code: "worker", error: "Regex worker failed safely." });
      timer = globalThis.setTimeout(() => finish(timeoutResult()), REGEX_TIMEOUT_MS);
      worker.postMessage({
        id,
        operation,
        pattern,
        flags,
        ...payload,
        deadlineEpochMs: Date.now() + REGEX_TIMEOUT_MS - 5,
      });
    } catch {
      finish({ ok: false, code: "worker", error: "Regex worker could not be started." });
    }
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      worker?.terminate();
      worker = null;
    },
  };
}

function idleEvaluation(key: string, indices: number[] = []): RegexEvaluation {
  return { key, pending: false, error: "", timedOut: false, indices, matches: [] };
}

export function regexFilterKey(search: Pick<RegexSearchState, "query" | "flags" | "regex">, values: readonly string[]) {
  return JSON.stringify([search.regex, search.query, search.flags, values]);
}

export function useRegexFilter(search: RegexSearchState, values: readonly string[]): RegexEvaluation {
  const serializedValues = JSON.stringify(values);
  const stableValues = useMemo<string[]>(() => JSON.parse(serializedValues) as string[], [serializedValues]);
  const key = useMemo(
    () => regexFilterKey(search, stableValues),
    [search, stableValues],
  );
  const allIndices = useMemo(() => stableValues.map((_, index) => index), [stableValues]);
  const activeRegex = Boolean(search.regex && search.query);
  const [evaluation, setEvaluation] = useState<RegexEvaluation>(() => activeRegex
    ? { key, pending: true, error: "", timedOut: false, indices: [], matches: [] }
    : idleEvaluation(key, allIndices));

  useEffect(() => {
    if (!activeRegex) return;

    const job = createRegexJob("filter", search.query, search.flags, { values: stableValues });
    let active = true;
    void job.promise.then((result) => {
      if (!active) return;
      if (!result.ok) {
        setEvaluation({ key, pending: false, error: result.error, timedOut: result.code === "timeout", indices: [], matches: [] });
        return;
      }
      setEvaluation({ key, pending: false, error: "", timedOut: false, indices: result.indices, matches: [] });
    });
    return () => {
      active = false;
      job.cancel();
    };
  }, [activeRegex, key, search.flags, search.query, stableValues]);

  if (!activeRegex) return idleEvaluation(key, allIndices);
  if (evaluation.key !== key) {
    return { key, pending: true, error: "", timedOut: false, indices: [], matches: [] };
  }
  return evaluation;
}

export function useRegexPreview(search: RegexSearchState): RegexEvaluation {
  const key = useMemo(
    () => JSON.stringify([search.open, search.query, search.flags, search.sample]),
    [search.open, search.query, search.flags, search.sample],
  );
  const activePreview = Boolean(search.open && search.query);
  const [evaluation, setEvaluation] = useState<RegexEvaluation>(() => activePreview
    ? { key, pending: true, error: "", timedOut: false, indices: [], matches: [] }
    : idleEvaluation(key));

  useEffect(() => {
    if (!activePreview) return;

    const job = createRegexJob("preview", search.query, search.flags, { sample: search.sample });
    let active = true;
    void job.promise.then((result) => {
      if (!active) return;
      if (!result.ok) {
        setEvaluation({ key, pending: false, error: result.error, timedOut: result.code === "timeout", indices: [], matches: [] });
        return;
      }
      setEvaluation({ key, pending: false, error: "", timedOut: false, indices: [], matches: result.matches });
    });
    return () => {
      active = false;
      job.cancel();
    };
  }, [activePreview, key, search.flags, search.query, search.sample]);

  if (!activePreview) return idleEvaluation(key);
  if (evaluation.key !== key) {
    return { key, pending: true, error: "", timedOut: false, indices: [], matches: [] };
  }
  return evaluation;
}
