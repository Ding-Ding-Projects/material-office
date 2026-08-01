import test from "node:test";
import assert from "node:assert/strict";

import {
  ColorParseError,
  NAMED_COLORS,
  contrastRatio,
  fromColorSpace,
  parseColor,
  relativeLuminance,
  toColorSpace,
  translateColor,
} from "../src/renderer/core/colors.mjs";

function assertColorNear(actual, expected, tolerance = 0.00001) {
  for (const channel of ["r", "g", "b", "a"]) {
    assert.ok(
      Math.abs(actual[channel] - expected[channel]) <= tolerance,
      `${channel}: expected ${expected[channel]}, received ${actual[channel]}`,
    );
  }
}

test("named, short hex, HEX8, RGB percentages, and transparent colors parse", () => {
  assert.equal(Object.keys(NAMED_COLORS).length >= 140, true);
  assertColorNear(parseColor("rebeccapurple"), parseColor("#663399"));
  assertColorNear(parseColor("#0f08"), parseColor("#00ff0088"));
  assertColorNear(parseColor("rgb(100% 0% 50% / 25%)"), {
    r: 1,
    g: 0,
    b: 0.5,
    a: 0.25,
  });
  assert.equal(parseColor("transparent").a, 0);
  assert.throws(
    () => parseColor("definitely-not-a-color"),
    (error) => error instanceof ColorParseError && error.code === "UNKNOWN_COLOR",
  );
});

test("all required color spaces round-trip bidirectionally", () => {
  const base = parseColor("rgb(32 128 224 / 0.4)");
  for (const space of [
    "rgb",
    "hsl",
    "hsv",
    "hsb",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "cmyk",
  ]) {
    const translated = toColorSpace(base, space);
    const restored = fromColorSpace(space, translated.components, translated.alpha);
    assertColorNear(restored, base, 0.00001);
  }
});

test("structured channel objects translate in both directions", () => {
  const green = parseColor({
    space: "hsl",
    h: 120,
    s: 100,
    l: 50,
    alpha: 0.25,
  });
  assertColorNear(green, { r: 0, g: 1, b: 0, a: 0.25 });
  const hsv = toColorSpace(green, "hsb");
  assert.deepEqual(hsv.channels, { h: 120, s: 100, v: 100 });
  assert.equal(hsv.alpha, 0.25);
  assertColorNear(
    fromColorSpace("cmyk", { c: 0, m: 100, y: 100, k: 0, alpha: 0.75 }),
    { r: 1, g: 0, b: 0, a: 0.75 },
  );
  assertColorNear(
    fromColorSpace("rgba", { r: 255, g: 0, b: 0, a: 0.2 }),
    { r: 1, g: 0, b: 0, a: 0.2 },
  );
});

test("translator emits copyable forms that parse and preserve alpha", () => {
  const translated = translateColor("rgba(255, 0, 0, 0.5)");
  assert.equal(translated.formats.hex, "#ff0000");
  assert.equal(translated.formats.hex8, "#ff000080");
  assert.equal(translated.formats.name, null);
  for (const key of [
    "hex8",
    "rgba",
    "hsla",
    "hsv",
    "hsb",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "cmyk",
  ]) {
    const parsed = parseColor(translated.formats[key]);
    assert.ok(Math.abs(parsed.a - 0.5) <= 1 / 255, `${key} did not preserve alpha`);
    assertColorNear({ ...parsed, a: 0.5 }, { ...parseColor("red"), a: 0.5 }, 0.0005);
  }
  assert.equal(translateColor("red").formats.name, "red");
});

test("out-of-gamut inputs retain clipping metadata and source coordinates", () => {
  const translated = translateColor("lab(50 200 200 / 120%)");
  assert.equal(translated.metadata.activeColorSpace, "lab");
  assert.equal(translated.metadata.gamut, "srgb");
  assert.equal(translated.metadata.inGamut, false);
  assert.equal(translated.metadata.clipped, true);
  assert.equal(translated.metadata.clippedChannels.includes("alpha"), true);
  assert.equal(translated.metadata.clippedChannels.some((channel) => channel !== "alpha"), true);
  assert.match(translated.metadata.warning, /Clipped/);
  assert.deepEqual(translated.metadata.sourceComponents, [50, 200, 200]);
  assert.equal(translated.canonical.a, 1);
});

test("WCAG luminance, alpha compositing, and contrast thresholds are reported", () => {
  assert.equal(relativeLuminance("black"), 0);
  assert.equal(relativeLuminance("white"), 1);
  assert.equal(contrastRatio("black", "white"), 21);
  const black = translateColor("black", { background: "white" });
  assert.equal(black.contrast.ratio, 21);
  assert.equal(black.contrast.normalTextAAA, true);
  const translucent = contrastRatio("rgb(0 0 0 / 50%)", "white");
  assert.ok(translucent > 3.9 && translucent < 4.1);
});
