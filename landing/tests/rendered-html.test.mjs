import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import sharp from "sharp";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Material Office product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Material Office — Windows office workspace<\/title>/i);
  assert.match(html, /A local office workspace with explicit boundaries/i);
  assert.match(html, /2,433/);
  assert.match(html, /No public installer or hosted release yet/i);
  assert.match(html, /href="legal\/LICENSE\.txt"/i);
  assert.doesNotMatch(html, /releases\/latest|material-office-windows\.matday116\.chatgpt\.site|ding-ding-projects\.github\.io\/material-office/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
  assert.doesNotMatch(html, /fonts\.googleapis|unpkg\.com|googletagmanager|<script[^>]+src=["']https?:/i);
});

test("bundles the command catalog and fully decodes the provenance-matched candidate image", async () => {
  const [featureRaw, image, provenanceRaw] = await Promise.all([
    readFile(new URL("public/data/features.json", root), "utf8"),
    readFile(new URL("public/media/classic-har-gow.png", root)),
    readFile(new URL("public/legal/classic-har-gow-provenance.json", root), "utf8"),
  ]);
  const features = JSON.parse(featureRaw);
  const provenance = JSON.parse(provenanceRaw);
  assert.equal(features.length, 2433);
  assert.ok(features.every((record) => Array.isArray(record) && record.length === 4));
  assert.deepEqual([...new Set(features.map((record) => record[1]))].sort(), [
    "basic", "biblio", "calc", "chart", "dbu", "math", "report", "sd", "shared", "writer",
  ]);
  assert.equal(image.length, provenance.asset.bytes);
  assert.equal(createHash("sha256").update(image).digest("hex"), provenance.asset.sha256);
  const decoder = sharp(image, { failOn: "error" });
  const metadata = await decoder.metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, provenance.asset.width);
  assert.equal(metadata.height, provenance.asset.height);
  const { data, info } = await decoder.clone().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, provenance.asset.width);
  assert.equal(info.height, provenance.asset.height);
  assert.ok(data.length >= provenance.asset.width * provenance.asset.height * 3);
});

test("publishes exact canonical license, notices, and provenance copies", async () => {
  for (const [canonical, published] of [
    ["../../LICENSE", "../public/legal/LICENSE.txt"],
    ["../../THIRD_PARTY_NOTICES.md", "../public/legal/THIRD_PARTY_NOTICES.md"],
    ["../../docs/legal/classic-har-gow-provenance.json", "../public/legal/classic-har-gow-provenance.json"],
  ]) {
    assert.deepEqual(await readFile(new URL(published, import.meta.url)), await readFile(new URL(canonical, import.meta.url)));
  }
});

test("removes starter state and retains accessibility and local-preference contracts", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  await assert.rejects(access(new URL("app/_sites-preview", root)));
  assert.doesNotMatch(`${page}\n${layout}\n${packageJson}`, /codex-preview|SkeletonPreview|react-loading-skeleton/);
  assert.match(page, /Classic Har Gow/);
  assert.match(page, /蝦餃/);
  assert.match(page, /localStorage/);
  assert.match(page, /getRandomValues/);
  assert.match(page, /<RegexBuilder/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /Minimize preview/);
  assert.match(page, /Restore preview/);
  assert.match(page, /Close preview/);
  assert.match(page, /Bold preview/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /@media \(max-width:\s*560px\)/);
});
