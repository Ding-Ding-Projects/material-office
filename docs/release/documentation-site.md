# Landing and documentation site

> **Status:** the `0.1.0` documentation site publishes at `https://ding-ding-projects.github.io/material-office/` only after the corresponding installer Release succeeds.

## Behavior

The Material site presents the implemented product surfaces and generated LibreOffice command records with tabbed navigation, independent product/settings regex builders, localization/funny controls, appearance settings, notifications, legal notices, and release-aware state. The same client-only `app/page.tsx` has two builds: Vinext retains the Sites server-rendered package, while a separate Vite entry produces the static GitHub Pages artifact. The checked-in workflow deploys the static build only after Windows, site, attestation, and Release gates pass. Local builds intentionally generate a candidate-only `data/release.json`; a successful default-branch workflow generates a validated published record with the immutable release URL and stable installer download URL, which the Release, About, and footer surfaces consume after hydration.

## Configuration

Site preferences use local storage per visitor. All scripts, fonts, catalog data, legal records, and imagery are bundled. `GITHUB_PAGES_BASE_PATH` is normalized as a path and supplied by `actions/configure-pages`, so repository Pages deployments keep their asset prefix; absolute URLs, queries, fragments, dot segments, and empty interior segments are rejected. The repository homepage field is currently empty and must be set only after a live deployment is verified.

## Failure modes

The local site remains usable without app IPC and explains which actions require Windows Electron or LibreOffice. Until hosting exists, public links remain omitted or explicitly unavailable. Published release data rejects an unexpected repository, malformed version/tag, or unsafe installer filename and fails the Pages build instead of emitting an untrusted download link.

## Security

No analytics, CDN, third-party assets, authentication database, uploads, or external connectors are used. Search and sample text stay local.

## Verification

Landing tests build the Vinext output, server-render the product shell, assert 2,433 command records, fully decode the provenance-matched image, and reject starter metadata and false release links. Static tests independently build the client-only Vite output, verify the configured base prefix, reject external script/style URLs and Next-only paths, check all local catalog/legal/image files, compare canonical legal and image bytes, and test both candidate and published release records with stable URLs. The exact Pages deployment URL and status remain tied to the corresponding successful workflow run.

## Suggested articles

[Start Center](../core/start-center.md) · [Tabs and search](../customization/tabs-search-regex.md) · [Windows installer](windows-installer.md)
