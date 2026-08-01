import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { evaluateRegexRequest } from "../app/regex-worker-core.mjs";

const futureDeadline = () => Date.now() + 5_000;

test("worker core handles valid, invalid, Unicode, multiline, zero-width, and capture cases", () => {
  const filtered = evaluateRegexRequest({
    operation: "filter",
    pattern: "^héllo$",
    flags: "imu",
    values: ["HÉLLO", "héllo\nnext", "goodbye"],
    deadlineEpochMs: futureDeadline(),
  });
  assert.deepEqual(filtered, { ok: true, operation: "filter", indices: [0, 1] });

  const preview = evaluateRegexRequest({
    operation: "preview",
    pattern: "(?=(a))",
    flags: "u",
    sample: "aa",
    deadlineEpochMs: futureDeadline(),
  });
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.matches.map(({ value, index, groups }) => ({ value, index, groups })), [
    { value: "", index: 0, groups: ["a"] },
    { value: "", index: 1, groups: ["a"] },
  ]);

  const invalid = evaluateRegexRequest({
    operation: "filter",
    pattern: "(",
    flags: "u",
    values: ["anything"],
    deadlineEpochMs: futureDeadline(),
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid-pattern");

  const expired = evaluateRegexRequest({
    operation: "filter",
    pattern: "safe",
    flags: "u",
    values: ["safe"],
    deadlineEpochMs: Date.now() - 1,
  });
  assert.deepEqual(expired, { ok: false, code: "timeout", error: "Regex evaluation reached its deadline." });
});

test("catastrophic input is isolated and can be terminated at a hard deadline", async () => {
  const worker = new Worker(new URL("fixtures/regex-core-worker.mjs", import.meta.url), {
    workerData: {
      operation: "filter",
      pattern: "(a+)+$",
      flags: "u",
      values: [`${"a".repeat(7_999)}!`],
      deadlineEpochMs: Date.now() + 60_000,
    },
  });
  const started = performance.now();
  const outcome = await new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      await worker.terminate();
      resolve("terminated");
    }, 120);
    worker.once("message", (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  assert.equal(outcome, "terminated");
  assert.ok(performance.now() - started < 1_000, "catastrophic input must not outlive the hard deadline by a meaningful margin");
});

test("page source contains no dynamic RegExp construction and the client owns worker termination", async () => {
  const [page, client, worker, core] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/regex-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/regex.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/regex-worker-core.mjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /\bnew\s+RegExp\s*\(/u);
  assert.doesNotMatch(page, /matcherFor|previewMatches/u);
  assert.match(client, /new Worker\(new URL\("\.\/regex\.worker\.ts", import\.meta\.url\)/u);
  assert.match(client, /REGEX_TIMEOUT_MS\s*=\s*80/u);
  assert.match(client, /worker\?\.terminate\(\)/u);
  assert.match(client, /deadlineEpochMs:\s*Date\.now\(\) \+ REGEX_TIMEOUT_MS - 5/u);
  assert.match(worker, /evaluateRegexRequest/u);
  assert.match(core, /\.\.\/\.\.\/src\/renderer\/core\/regex\.mjs/u);
});
