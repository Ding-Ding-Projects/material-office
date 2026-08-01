import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const source = new URL("../../design/data/features.json", import.meta.url);
const target = new URL("../public/data/features.json", import.meta.url);
const raw = await readFile(source, "utf8");
const features = JSON.parse(raw);

if (!Array.isArray(features) || features.length !== 2433) {
  throw new Error(`Expected 2,433 feature records, received ${features?.length ?? "invalid data"}.`);
}

for (const [index, feature] of features.entries()) {
  if (!Array.isArray(feature) || feature.length !== 4 || feature.some((value) => typeof value !== "string")) {
    throw new Error(`Feature record ${index + 1} does not match [name, scope, area, command].`);
  }
}

await mkdir(dirname(fileURLToPath(target)), { recursive: true });
await writeFile(target, `${JSON.stringify(features)}\n`, "utf8");
console.log(`Copied ${features.length.toLocaleString("en-US")} verified feature records.`);
