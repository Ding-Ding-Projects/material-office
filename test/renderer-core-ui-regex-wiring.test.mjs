import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appUrl = new URL("../src/renderer/app.mjs", import.meta.url);
const popoversUrl = new URL("../src/renderer/ui/popovers.mjs", import.meta.url);
const toolsUrl = new URL("../src/renderer/ui/surfaces-tools.mjs", import.meta.url);
const documentsUrl = new URL("../src/renderer/ui/surfaces-documents.mjs", import.meta.url);

test("renderer collection searches route regex to the worker and keep plain filtering synchronous", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /RegexWorkerEvaluator/);
  assert.match(source, /filterCollection as filterCollectionSync/);
  assert.match(source, /regexEvaluator\.filter\(strings, request, \{ timeoutMs: 250 \}\)/);
  assert.match(source, /request\.mode === 'regex'[\s\S]*await regexEvaluator\.filter/);
  assert.doesNotMatch(source, /createRegexPredicate/);

  for (const surface of [
    "state.searches.global",
    "settings-${section}",
    "state.tabs.items, spec",
    "features, search",
    "CHANGELOG, search",
  ]) {
    assert.equal(source.includes(surface), true, `missing worker-backed search surface: ${surface}`);
  }

  const tools = await readFile(toolsUrl, "utf8");
  for (const surfaceFunction of ["renderHome", "renderCommands", "renderHistory", "renderChangelog"]) {
    const start = tools.indexOf(`function ${surfaceFunction}`);
    assert.notEqual(start, -1, `missing ${surfaceFunction}`);
    const nextExport = tools.indexOf("\nexport function ", start + 1);
    const body = tools.slice(start, nextExport === -1 ? undefined : nextExport);
    assert.match(body, /ctx\.filterCollection/, `${surfaceFunction} bypasses the worker-aware filter`);
  }
  const documents = await readFile(documentsUrl, "utf8");
  const baseStart = documents.indexOf("function renderBase");
  const baseEnd = documents.indexOf("\nexport function ", baseStart + 1);
  assert.match(
    documents.slice(baseStart, baseEnd),
    /ctx\.filterCollection/,
    "renderBase bypasses the worker-aware filter",
  );
});

test("regex builder previews use a deadline worker while plain previews remain local", async () => {
  const source = await readFile(popoversUrl, "utf8");
  assert.match(source, /state\.mode === 'regex'\s*\? await regexEvaluator\.evaluate\(request, \{ timeoutMs: 250 \}\)/);
  assert.match(source, /: evaluateRegex\(request, \{ maxMatches: 100 \}\)/);
  assert.match(source, /terminated at its deadline/);
  assert.doesNotMatch(source, /assessRegexRisk/);
});
