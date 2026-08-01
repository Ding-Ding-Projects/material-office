/**
 * Dependency-free color parsing and translation. All conversions use sRGB as
 * the interchange gamut; CIELAB/LCH use a D50 white point and OKLab/OKLCH use
 * their standard D65 definitions.
 */

export const NAMED_COLORS = Object.freeze({
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
});

export class ColorParseError extends Error {
  constructor(message, code = "INVALID_COLOR") {
    super(message);
    this.name = "ColorParseError";
    this.code = code;
  }
}

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));
const GAMUT_EPSILON = 0.00005;
const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
const degrees = (turn) => ((turn * 360) % 360 + 360) % 360;
const turn = (angle) => ((angle / 360) % 1 + 1) % 1;

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ColorParseError(`${name} must be finite.`);
  return number;
}

function parseNumeric(token, name) {
  if (typeof token !== "string" || !token.trim()) {
    throw new ColorParseError(`Missing ${name}.`);
  }
  const number = Number.parseFloat(token);
  if (!Number.isFinite(number) || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/i.test(token.trim())) {
    throw new ColorParseError(`Invalid ${name}: ${token}`);
  }
  return { number, percent: token.trim().endsWith("%") };
}

function parseAlpha(token = "1") {
  const value = parseNumeric(String(token), "alpha");
  return value.percent ? value.number / 100 : value.number;
}

function parseHue(token) {
  const text = String(token).trim().toLowerCase();
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/.exec(text);
  if (!match) throw new ColorParseError(`Invalid hue: ${token}`);
  const value = Number(match[1]);
  const degreesValue =
    match[2] === "turn"
      ? value * 360
      : match[2] === "rad"
        ? (value * 180) / Math.PI
        : match[2] === "grad"
          ? value * 0.9
          : value;
  return turn(degreesValue);
}

function parseFraction(token, name, { percentScale = 1 } = {}) {
  const parsed = parseNumeric(String(token), name);
  return parsed.percent ? (parsed.number / 100) * percentScale : parsed.number;
}

function splitFunctionBody(body, legacyAlpha = false) {
  const slash = body.split(/\s*\/\s*/);
  if (slash.length > 2) throw new ColorParseError("Color contains too many alpha separators.");
  const values = slash[0].replaceAll(",", " ").trim().split(/\s+/).filter(Boolean);
  let alpha = slash[1]?.trim();
  if (legacyAlpha && alpha === undefined && values.length === 4) alpha = values.pop();
  return { values, alpha: alpha ?? "1" };
}

function hueToRgb(hue) {
  const h = ((hue % 1) + 1) % 1;
  const channel = (offset) => clamp(Math.abs(((h * 6 + offset) % 6) - 3) - 1);
  return [channel(0), channel(4), channel(2)];
}

function hslToRgb([h, s, l]) {
  const a = s * Math.min(l, 1 - l);
  const channel = (offset) => l - a * Math.max(-1, Math.min(((h * 12 + offset) % 12) - 3, 9 - ((h * 12 + offset) % 12), 1));
  return [channel(0), channel(8), channel(4)];
}

function rgbToHsl([r, g, b]) {
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return [((hue % 1) + 1) % 1, saturation, lightness];
}

function hsvToRgb([h, s, v]) {
  const [baseR, baseG, baseB] = hueToRgb(h);
  return [
    v * (1 - s + s * baseR),
    v * (1 - s + s * baseG),
    v * (1 - s + s * baseB),
  ];
}

function rgbToHsv([r, g, b]) {
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
  }
  return [((hue % 1) + 1) % 1, maximum === 0 ? 0 : delta / maximum, maximum];
}

function hwbToRgb([h, whiteness, blackness]) {
  if (whiteness + blackness >= 1) {
    const gray = whiteness / (whiteness + blackness);
    return [gray, gray, gray];
  }
  const base = hueToRgb(h);
  const factor = 1 - whiteness - blackness;
  return base.map((channel) => channel * factor + whiteness);
}

function rgbToHwb(rgb) {
  return [rgbToHsv(rgb)[0], Math.min(...rgb), 1 - Math.max(...rgb)];
}

function srgbToLinear(value) {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  return sign * (absolute <= 0.04045 ? absolute / 12.92 : ((absolute + 0.055) / 1.055) ** 2.4);
}

function linearToSrgb(value) {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  return sign * (absolute <= 0.0031308 ? 12.92 * absolute : 1.055 * absolute ** (1 / 2.4) - 0.055);
}

function multiplyMatrix(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

const RGB_TO_XYZ_D65 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const XYZ_D65_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];
const D65_TO_D50 = [
  [1.0479298, 0.0229468, -0.0501922],
  [0.0296278, 0.9904345, -0.0170738],
  [-0.0092431, 0.0150551, 0.7518743],
];
const D50_TO_D65 = [
  [0.9554734, -0.0230985, 0.0632593],
  [-0.0283697, 1.0099955, 0.0210414],
  [0.012314, -0.0205077, 1.3303659],
];
const D50_WHITE = [0.96422, 1, 0.82521];

function rgbToXyzD50(rgb) {
  const xyzD65 = multiplyMatrix(RGB_TO_XYZ_D65, rgb.map(srgbToLinear));
  return multiplyMatrix(D65_TO_D50, xyzD65);
}

function xyzD50ToRgb(xyz) {
  const xyzD65 = multiplyMatrix(D50_TO_D65, xyz);
  return multiplyMatrix(XYZ_D65_TO_RGB, xyzD65).map(linearToSrgb);
}

function xyzToLab(xyz) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const f = (value) => (value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116);
  const [x, y, z] = xyz.map((value, index) => value / D50_WHITE[index]).map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labToXyz([lightness, a, b]) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inverse = (value) => {
    const cube = value ** 3;
    return cube > epsilon ? cube : (116 * value - 16) / kappa;
  };
  return [inverse(fx), inverse(fy), inverse(fz)].map(
    (value, index) => value * D50_WHITE[index],
  );
}

function labToLch([lightness, a, b]) {
  return [lightness, Math.hypot(a, b), degrees(Math.atan2(b, a) / (2 * Math.PI))];
}

function lchToLab([lightness, chroma, hue]) {
  const radians = (hue * Math.PI) / 180;
  return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
}

function linearRgbToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinearRgb([lightness, a, b]) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function rgbToOklab(rgb) {
  return linearRgbToOklab(rgb.map(srgbToLinear));
}

function oklabToRgb(oklab) {
  return oklabToLinearRgb(oklab).map(linearToSrgb);
}

function makeColor(rawRgb, alpha, sourceFormat, sourceComponents) {
  const rawAlpha = finite(alpha, "alpha");
  const clippedChannels = [];
  rawRgb.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new ColorParseError("Color conversion produced a non-finite channel.");
    if (value < -GAMUT_EPSILON || value > 1 + GAMUT_EPSILON) {
      clippedChannels.push(["red", "green", "blue"][index]);
    }
  });
  if (rawAlpha < 0 || rawAlpha > 1) clippedChannels.push("alpha");
  return Object.freeze({
    r: clamp(rawRgb[0]),
    g: clamp(rawRgb[1]),
    b: clamp(rawRgb[2]),
    a: clamp(rawAlpha),
    metadata: Object.freeze({
      activeColorSpace: sourceFormat,
      gamut: "srgb",
      inGamut:
        clippedChannels.every((channel) => channel === "alpha") &&
        rawRgb.every((value) => value >= -GAMUT_EPSILON && value <= 1 + GAMUT_EPSILON),
      clipped: clippedChannels.length > 0,
      clippedChannels: Object.freeze(clippedChannels),
      sourceComponents: Object.freeze([...sourceComponents]),
      rawSrgb: Object.freeze([...rawRgb]),
    }),
  });
}

function normalizeSpaceName(space) {
  const normalized = String(space).trim().toLowerCase();
  const aliases = { rgba: "rgb", hsla: "hsl", hsb: "hsv", cielab: "lab" };
  return aliases[normalized] ?? normalized;
}

function structuredComponents(space, components) {
  if (Array.isArray(components)) return components;
  if (!components || typeof components !== "object") {
    throw new ColorParseError("Color components must be an array or channel object.");
  }
  const first = (...keys) => {
    const key = keys.find((candidate) => Object.hasOwn(components, candidate));
    return key === undefined ? undefined : components[key];
  };
  switch (space) {
    case "rgb":
    case "srgb":
      return [first("r", "red"), first("g", "green"), first("b", "blue")];
    case "hsl":
      return [first("h", "hue"), first("s", "saturation"), first("l", "lightness")];
    case "hsv":
      return [
        first("h", "hue"),
        first("s", "saturation"),
        first("v", "value", "b", "brightness"),
      ];
    case "hwb":
      return [first("h", "hue"), first("w", "whiteness"), first("b", "blackness")];
    case "lab":
    case "oklab":
      return [first("l", "lightness"), first("a"), first("b")];
    case "lch":
    case "oklch":
      return [first("l", "lightness"), first("c", "chroma"), first("h", "hue")];
    case "cmyk":
      return [first("c", "cyan"), first("m", "magenta"), first("y", "yellow"), first("k", "key", "black")];
    default:
      throw new ColorParseError(`Unsupported color space: ${space}`, "UNSUPPORTED_COLOR_SPACE");
  }
}

export function fromColorSpace(space, components, alpha = undefined) {
  const normalized = normalizeSpaceName(space);
  const values = structuredComponents(normalized, components).map((value, index) =>
    finite(value, `component ${index + 1}`),
  );
  const resolvedAlpha =
    alpha === undefined && components && !Array.isArray(components)
      ? components.alpha ??
        (!["lab", "oklab"].includes(normalized) ? components.a : undefined) ??
        1
      : alpha ?? 1;
  let rgb;
  switch (normalized) {
    case "rgb":
      if (values.length !== 3) throw new ColorParseError("RGB needs three components.");
      rgb = values.map((value) => value / 255);
      break;
    case "srgb":
      if (values.length !== 3) throw new ColorParseError("sRGB needs three components.");
      rgb = values;
      break;
    case "hsl":
      if (values.length !== 3) throw new ColorParseError("HSL needs three components.");
      rgb = hslToRgb([turn(values[0]), values[1] / 100, values[2] / 100]);
      break;
    case "hsv":
      if (values.length !== 3) throw new ColorParseError("HSV needs three components.");
      rgb = hsvToRgb([turn(values[0]), values[1] / 100, values[2] / 100]);
      break;
    case "hwb":
      if (values.length !== 3) throw new ColorParseError("HWB needs three components.");
      rgb = hwbToRgb([turn(values[0]), values[1] / 100, values[2] / 100]);
      break;
    case "lab":
      if (values.length !== 3) throw new ColorParseError("Lab needs three components.");
      rgb = xyzD50ToRgb(labToXyz(values));
      break;
    case "lch":
      if (values.length !== 3) throw new ColorParseError("LCH needs three components.");
      rgb = xyzD50ToRgb(labToXyz(lchToLab(values)));
      break;
    case "oklab":
      if (values.length !== 3) throw new ColorParseError("OKLab needs three components.");
      rgb = oklabToRgb(values);
      break;
    case "oklch":
      if (values.length !== 3) throw new ColorParseError("OKLCH needs three components.");
      rgb = oklabToRgb(lchToLab(values));
      break;
    case "cmyk":
      if (values.length !== 4) throw new ColorParseError("CMYK needs four components.");
      rgb = values.slice(0, 3).map((value) => (1 - value / 100) * (1 - values[3] / 100));
      break;
    default:
      throw new ColorParseError(`Unsupported color space: ${space}`, "UNSUPPORTED_COLOR_SPACE");
  }
  return makeColor(rgb, resolvedAlpha, normalized, values);
}

function parseHex(value, sourceFormat = "hex") {
  let digits = value.replace(/^#/, "");
  if (![3, 4, 6, 8].includes(digits.length) || !/^[0-9a-f]+$/i.test(digits)) {
    throw new ColorParseError(`Invalid hex color: ${value}`);
  }
  if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join("");
  const hasAlpha = digits.length === 8;
  const channels = [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
  const alpha = hasAlpha ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
  return makeColor(channels.map((channel) => channel / 255), alpha, sourceFormat, channels);
}

function parseFunctionalColor(name, body) {
  const space = normalizeSpaceName(name);
  const { values, alpha } = splitFunctionBody(body, ["rgb", "hsl"].includes(space));
  let components;
  switch (space) {
    case "rgb":
      if (values.length !== 3) throw new ColorParseError("RGB needs three channels.");
      components = values.map((token) => {
        const parsed = parseNumeric(token, "RGB channel");
        return parsed.percent ? parsed.number * 2.55 : parsed.number;
      });
      return fromColorSpace("rgb", components, parseAlpha(alpha));
    case "hsl":
    case "hsv":
    case "hwb":
      if (values.length !== 3) throw new ColorParseError(`${space.toUpperCase()} needs three channels.`);
      components = [
        degrees(parseHue(values[0])),
        parseFraction(values[1], `${space} channel`) * 100,
        parseFraction(values[2], `${space} channel`) * 100,
      ];
      return fromColorSpace(space, components, parseAlpha(alpha));
    case "lab":
      if (values.length !== 3) throw new ColorParseError("Lab needs three channels.");
      components = [
        parseFraction(values[0], "Lab lightness", { percentScale: 100 }),
        parseFraction(values[1], "Lab a"),
        parseFraction(values[2], "Lab b"),
      ];
      return fromColorSpace(space, components, parseAlpha(alpha));
    case "lch":
      if (values.length !== 3) throw new ColorParseError("LCH needs three channels.");
      components = [
        parseFraction(values[0], "LCH lightness", { percentScale: 100 }),
        parseFraction(values[1], "LCH chroma"),
        degrees(parseHue(values[2])),
      ];
      return fromColorSpace(space, components, parseAlpha(alpha));
    case "oklab":
      if (values.length !== 3) throw new ColorParseError("OKLab needs three channels.");
      components = [
        parseFraction(values[0], "OKLab lightness"),
        parseFraction(values[1], "OKLab a"),
        parseFraction(values[2], "OKLab b"),
      ];
      return fromColorSpace(space, components, parseAlpha(alpha));
    case "oklch":
      if (values.length !== 3) throw new ColorParseError("OKLCH needs three channels.");
      components = [
        parseFraction(values[0], "OKLCH lightness"),
        parseFraction(values[1], "OKLCH chroma"),
        degrees(parseHue(values[2])),
      ];
      return fromColorSpace(space, components, parseAlpha(alpha));
    case "cmyk":
      if (values.length !== 4) throw new ColorParseError("CMYK needs four channels.");
      components = values.map((token) => parseFraction(token, "CMYK channel") * 100);
      return fromColorSpace(space, components, parseAlpha(alpha));
    default:
      throw new ColorParseError(`Unsupported color function: ${name}`, "UNSUPPORTED_COLOR_SPACE");
  }
}

export function parseColor(input) {
  if (input && typeof input === "object") {
    if (typeof input.space === "string") {
      return fromColorSpace(input.space, input.components ?? input, input.alpha);
    }
    if ([input.r, input.g, input.b].every(Number.isFinite)) {
      const scale = Math.max(input.r, input.g, input.b) > 1 ? 255 : 1;
      return makeColor(
        [input.r / scale, input.g / scale, input.b / scale],
        input.a ?? input.alpha ?? 1,
        "srgb",
        [input.r, input.g, input.b],
      );
    }
  }
  if (typeof input !== "string") throw new ColorParseError("Color must be a string or color object.");
  const value = input.trim().toLowerCase();
  if (!value) throw new ColorParseError("Color cannot be empty.");
  if (value === "transparent") return makeColor([0, 0, 0], 0, "named", [0, 0, 0]);
  if (Object.hasOwn(NAMED_COLORS, value)) {
    return parseHex(NAMED_COLORS[value], "named");
  }
  if (value.startsWith("#")) return parseHex(value);
  const functional = /^([a-z]+)\((.*)\)$/i.exec(value);
  if (functional) return parseFunctionalColor(functional[1], functional[2]);
  throw new ColorParseError(`Unknown color: ${input}`, "UNKNOWN_COLOR");
}

function channelHex(channel) {
  return Math.round(clamp(channel) * 255).toString(16).padStart(2, "0");
}

function exactNamedColor(color) {
  if (color.a === 0 && color.r === 0 && color.g === 0 && color.b === 0) return "transparent";
  if (color.a !== 1) return null;
  const hex = `#${channelHex(color.r)}${channelHex(color.g)}${channelHex(color.b)}`;
  return Object.keys(NAMED_COLORS).find((name) => NAMED_COLORS[name] === hex) ?? null;
}

export function toColorSpace(input, space) {
  const color = input?.metadata ? input : parseColor(input);
  const rgb = [color.r, color.g, color.b];
  const normalized = normalizeSpaceName(space);
  let components;
  switch (normalized) {
    case "rgb":
      components = rgb.map((channel) => channel * 255);
      break;
    case "srgb":
      components = rgb;
      break;
    case "hsl": {
      const [h, s, l] = rgbToHsl(rgb);
      components = [degrees(h), s * 100, l * 100];
      break;
    }
    case "hsv": {
      const [h, s, v] = rgbToHsv(rgb);
      components = [degrees(h), s * 100, v * 100];
      break;
    }
    case "hwb": {
      const [h, w, b] = rgbToHwb(rgb);
      components = [degrees(h), w * 100, b * 100];
      break;
    }
    case "lab":
      components = xyzToLab(rgbToXyzD50(rgb));
      break;
    case "lch":
      components = labToLch(xyzToLab(rgbToXyzD50(rgb)));
      break;
    case "oklab":
      components = rgbToOklab(rgb);
      break;
    case "oklch":
      components = labToLch(rgbToOklab(rgb));
      break;
    case "cmyk": {
      const key = 1 - Math.max(...rgb);
      components = key >= 1
        ? [0, 0, 0, 100]
        : [
            ((1 - rgb[0] - key) / (1 - key)) * 100,
            ((1 - rgb[1] - key) / (1 - key)) * 100,
            ((1 - rgb[2] - key) / (1 - key)) * 100,
            key * 100,
          ];
      break;
    }
    default:
      throw new ColorParseError(`Unsupported color space: ${space}`, "UNSUPPORTED_COLOR_SPACE");
  }
  const rounded = components.map((value) => round(value, 6));
  const channelNames = {
    rgb: ["r", "g", "b"],
    srgb: ["r", "g", "b"],
    hsl: ["h", "s", "l"],
    hsv: ["h", "s", "v"],
    hwb: ["h", "w", "b"],
    lab: ["l", "a", "b"],
    lch: ["l", "c", "h"],
    oklab: ["l", "a", "b"],
    oklch: ["l", "c", "h"],
    cmyk: ["c", "m", "y", "k"],
  }[normalized];
  return {
    space: normalized,
    components: rounded,
    channels: Object.fromEntries(channelNames.map((name, index) => [name, rounded[index]])),
    alpha: color.a,
  };
}

function formattedComponents(translation) {
  const format = (values, suffix = "") => values.map((value) => `${round(value, 3)}${suffix}`);
  const rgb = toColorSpace(translation, "rgb").components;
  const hsl = toColorSpace(translation, "hsl").components;
  const hsv = toColorSpace(translation, "hsv").components;
  const hwb = toColorSpace(translation, "hwb").components;
  const lab = toColorSpace(translation, "lab").components;
  const lch = toColorSpace(translation, "lch").components;
  const oklab = toColorSpace(translation, "oklab").components;
  const oklch = toColorSpace(translation, "oklch").components;
  const cmyk = toColorSpace(translation, "cmyk").components;
  const alpha = round(translation.a, 4);
  const slash = translation.a < 1 ? ` / ${alpha}` : "";
  const hex = `#${channelHex(translation.r)}${channelHex(translation.g)}${channelHex(translation.b)}`;
  return {
    name: exactNamedColor(translation),
    hex,
    hex8: `${hex}${channelHex(translation.a)}`,
    rgb: `rgb(${format(rgb).join(" ")})`,
    rgba: `rgb(${format(rgb).join(" ")}${slash})`,
    hsl: `hsl(${round(hsl[0], 3)} ${format(hsl.slice(1), "%").join(" ")})`,
    hsla: `hsl(${round(hsl[0], 3)} ${format(hsl.slice(1), "%").join(" ")}${slash})`,
    hsv: `hsv(${round(hsv[0], 3)} ${format(hsv.slice(1), "%").join(" ")}${slash})`,
    hsb: `hsb(${round(hsv[0], 3)} ${format(hsv.slice(1), "%").join(" ")}${slash})`,
    hwb: `hwb(${round(hwb[0], 3)} ${format(hwb.slice(1), "%").join(" ")}${slash})`,
    lab: `lab(${round(lab[0], 3)} ${round(lab[1], 3)} ${round(lab[2], 3)}${slash})`,
    lch: `lch(${round(lch[0], 3)} ${round(lch[1], 3)} ${round(lch[2], 3)}${slash})`,
    oklab: `oklab(${format(oklab).join(" ")}${slash})`,
    oklch: `oklch(${format(oklch).join(" ")}${slash})`,
    cmyk: `cmyk(${format(cmyk, "%").join(" ")}${slash})`,
  };
}

function composite(foreground, background) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

export function relativeLuminance(input) {
  const color = input?.metadata ? input : parseColor(input);
  const [r, g, b] = [color.r, color.g, color.b].map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundInput, backgroundInput = "#ffffff") {
  const white = { r: 1, g: 1, b: 1, a: 1 };
  const background = backgroundInput?.metadata ? backgroundInput : parseColor(backgroundInput);
  const opaqueBackground = composite(background, white);
  const foreground = foregroundInput?.metadata ? foregroundInput : parseColor(foregroundInput);
  const opaqueForeground = composite(foreground, opaqueBackground);
  const first = relativeLuminance(opaqueForeground);
  const second = relativeLuminance(opaqueBackground);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function translateColor(input, { background = "#ffffff" } = {}) {
  const color = parseColor(input);
  const ratio = contrastRatio(color, background);
  return {
    canonical: { r: color.r, g: color.g, b: color.b, a: color.a },
    formats: formattedComponents(color),
    metadata: {
      ...color.metadata,
      alpha: color.a,
      warning: color.metadata.clipped
        ? `Clipped ${color.metadata.clippedChannels.join(", ")} to the sRGB gamut.`
        : null,
    },
    contrast: {
      background: formattedComponents(parseColor(background)).hex,
      ratio: round(ratio, 3),
      normalTextAA: ratio >= 4.5,
      largeTextAA: ratio >= 3,
      normalTextAAA: ratio >= 7,
      largeTextAAA: ratio >= 4.5,
    },
  };
}
