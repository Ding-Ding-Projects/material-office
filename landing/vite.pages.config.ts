import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

function normalizeBase(value: string | undefined): string {
  const raw = (value ?? "/").trim();
  if (!raw || raw === "/") return "/";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.includes("?") || raw.includes("#")) {
    throw new Error("GITHUB_PAGES_BASE_PATH must be a URL path, not a URL, query, or fragment.");
  }
  const segments = raw.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("GITHUB_PAGES_BASE_PATH contains an unsafe path segment.");
  }
  return `/${segments.join("/")}/`;
}

const landingRoot = import.meta.dirname;

export default defineConfig({
  root: resolve(landingRoot, "static-pages"),
  base: normalizeBase(process.env.GITHUB_PAGES_BASE_PATH),
  publicDir: resolve(landingRoot, "public"),
  plugins: [react()],
  build: {
    outDir: resolve(landingRoot, "dist-pages"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
