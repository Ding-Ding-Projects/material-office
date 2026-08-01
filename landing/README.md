# Material Office product site

This directory contains the interactive product and documentation candidate for Material Office. The client-only `app/page.tsx` feeds both a Vinext build prepared for Sites and a separate static Vite build prepared for GitHub Pages; neither has been hosted yet. The site has no account system, database, analytics, remote media, or document upload path.

## Local commands

```bash
npm ci
npm test
npm run dev
```

- `npm run sync:features` copies the checked-in 2,433-entry LibreOffice command catalog into the public site bundle.
- `npm run build` preserves the production Vinext/Sites worker build.
- `npm run build:pages` creates `dist-pages/` with a normalized `GITHUB_PAGES_BASE_PATH`.
- `npm test` verifies both builds, rendered HTML, base-aware local assets, catalog coverage, canonical legal bytes, and local release media.
- `npm run dev` starts the local documentation experience.

## Product behavior

The site distinguishes implemented candidate features from LibreOffice-only workflows and roadmap items. It provides persisted English, playful Hong Kong-style Cantonese, and bilingual modes; independent funny-level controls; theme, density, accent, font, and scale settings; tab navigation and discovery; local plain-text/regex search; notification history; legal notices; and the provenance-matched Classic Har Gow candidate image.

All site preferences stay in the visitor's browser. The site does not receive office documents, regular expressions, sample text, credentials, or telemetry.

The future deployment identity is stored in `.openai/hosting.json`. Build output and local Sites state are ignored. No deployment URL should be documented until hosting succeeds and the result is verified.
