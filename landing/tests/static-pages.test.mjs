import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildReleaseState } from "../scripts/prepare-pages-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist-pages");

function normalizedBase() {
  const raw = (process.env.GITHUB_PAGES_BASE_PATH ?? "/").replace(/^\/+|\/+$/g, "");
  return raw ? `/${raw}/` : "/";
}

test("builds the client-only landing page with the configured Pages base", async () => {
  const html = await readFile(path.join(output, "index.html"), "utf8");
  const base = normalizedBase();
  assert.match(html, /<title>Material Office — Windows office workspace<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, new RegExp(`(?:src|href)="${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}assets/`, "i"));
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /_next\//i);
});

test("Pages output bundles only local scripts, styles, catalog, legal records, and image bytes", async () => {
  const assetNames = await readdir(path.join(output, "assets"));
  assert.ok(assetNames.some((name) => name.endsWith(".js")));
  assert.ok(assetNames.some((name) => name.endsWith(".css")));
  for (const file of [
    "data/features.json",
    "data/release.json",
    "legal/LICENSE.txt",
    "legal/THIRD_PARTY_NOTICES.md",
    "legal/classic-har-gow-provenance.json",
    "media/classic-har-gow.png",
  ]) {
    await access(path.join(output, ...file.split("/")));
  }

  const [publishedImage, sourceImage, features] = await Promise.all([
    readFile(path.join(output, "media", "classic-har-gow.png")),
    readFile(path.join(root, "public", "media", "classic-har-gow.png")),
    readFile(path.join(output, "data", "features.json"), "utf8"),
  ]);
  assert.equal(createHash("sha256").update(publishedImage).digest("hex"), createHash("sha256").update(sourceImage).digest("hex"));
  assert.equal(JSON.parse(features).length, 2_433);
});

test("static Pages output bundles validated release-state data for truthful links", async () => {
  const source = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(source, /fetch\("data\/release\.json"/u);
  assert.match(source, /releaseState\.status === "published"/u);

  const releaseState = JSON.parse(await readFile(path.join(output, "data", "release.json"), "utf8"));
  assert.deepEqual(releaseState, buildReleaseState(process.env));
});

test("Pages legal outputs remain byte-identical to their canonical repository files", async () => {
  for (const [canonical, published] of [
    ["../LICENSE", "legal/LICENSE.txt"],
    ["../THIRD_PARTY_NOTICES.md", "legal/THIRD_PARTY_NOTICES.md"],
    ["../docs/legal/classic-har-gow-provenance.json", "legal/classic-har-gow-provenance.json"],
  ]) {
    assert.deepEqual(
      await readFile(path.resolve(root, canonical)),
      await readFile(path.join(output, ...published.split("/"))),
    );
  }
});
