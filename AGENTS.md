# Project agent instructions

This file is a sanitized public mirror of the shared agent agreement. The canonical private instructions are authoritative. Update the canonical source first, then refresh this mirror and the collapsed copy in `README.md`.

## Product boundary

- Material Office is a new Windows-only Electron application.
- The checked-in design prototype is visual reference material, not production runtime code.
- Write original application code. LibreOffice is the only external office application whose source behavior or API semantics may be referenced.
- Do not copy code from other office suites, Electron applications, design systems, or sample projects.
- Keep the application’s own editing surfaces honest: never claim that a derived preview or local model preserves a format when only LibreOffice can verify it.

## Security architecture

- Keep the main/preload/renderer split. Renderer Node integration remains disabled; context isolation and sandboxing remain enabled.
- Expose only narrow, named preload methods. Validate every IPC request and response; renderer-supplied arbitrary paths, commands, process arguments, or UNO URIs are forbidden.
- Main-process services own native dialogs, file capabilities, processes, persistence, conversion, and external-editor launch.
- Use absolute executable paths and argument arrays with `shell: false`.
- LibreOffice conversions use an app-owned unique profile, allowlisted input/output formats, time and output bounds, and output existence/type checks.
- UNO command execution accepts a catalog ID only. The main process resolves the exact bundled command URI and rejects unknown or modified IDs.
- Deny navigation, popups, webviews, and permissions by default. Bundle all fonts, scripts, icons, and media locally.
- Never log document contents, credentials, tokens, search samples, or other private data.

## User-facing requirements

- Maintain Material Design 3 Expressive tokens, component anatomy, focus, contrast, reduced motion, and Windows forced-color behavior.
- Fix accessibility, clipping, overlap, and undersized targets whenever found; these are completion blockers.
- Support English, playful Hong Kong Cantonese, and compact bilingual modes.
- Persist independent English and Cantonese funny levels from 1 through 5. Humor changes voice, never facts, impact, or available actions.
- Every informational, success, progress, and non-decision error is a corner notification. Errors and warnings persist until dismissed; notification history remains reviewable.
- Blocking dialogs are reserved for choices that must be made before continuing.
- Provide a persisted optional narrator that is off by default, serialized, non-overlapping, language-selectable, and respectful of reduced-sound/accessibility conditions.

## Search and regex

- Every search bar has its own adjacent anchored full regex builder.
- Plain-text search is always the default. Pattern, flags, validation, mode, query, sample, matches, and capture groups stay synchronized.
- Evaluate locally with pattern/sample limits, zero-width progress, Unicode coverage, timeouts or conservative risk blocking, and no persistence without explicit need.
- Settings sections, history, changelog, command catalog, tab strips, each tab group, group names, and master tab search all retain independent search state.

## Tabs and groups

- Tabs support reorder, pinning, grouping, overflow discovery, persistence, keyboard navigation, screen-reader roles, and per-tab appearance.
- Provide current-strip, per-group, group-name, and master searches.
- Groups support create, rename, color, reorder, collapse, membership, pin state, search, appearance, and persistence.
- Provide close-containing and close-not-containing actions using the exact same visible-label predicate.
- Never execute bulk close for an empty query or invalid pattern. Preview affected tabs; exclude pinned tabs by default and preserve unsaved-work protection.
- Shift+right-click a tab opens its appearance editor directly; normal right-click retains tab management and an appearance command.

## Appearance

- Every rendered element exposes an anchored non-modal appearance editor by context menu and keyboard-equivalent path.
- Support installed-font selection with CJK-safe fallback; size, weight, bold, italic/oblique, underline, strike variants, overline, capitalization, scripts, color/highlight, effects, spacing, line height, baseline, direction, and alignment.
- Unsupported properties remain visible with a platform-capability explanation and saved values are not silently discarded.
- Every color control is continuous and translates bidirectionally among named, HEX/HEX8, RGB/A, HSL/A, HSV/HSB, HWB, Lab/LCH, OKLab/OKLCH, and CMYK while preserving alpha and reporting gamut/clipping and contrast.
- Appearance presets, import/export, per-property/element reset, and global reset remain functional. The editor and pickers must customize their own chrome.

## Persistence and history

- Store app-owned state under the Electron user-data directory with stable IDs and atomic replacement.
- Keep an isolated local Git history beside app data, never a `.git` directory inside a user document folder.
- Snapshot every app-managed document, record, setting, account-like integration record, creation, edit, and deletion.
- Unchanged state records nothing. A history failure never fails the primary user operation.
- Restore appends a new revision and never rewrites history.
- History search composes with an advanced typed/calendar date range and multi-select action filters derived from recorded actions.

## Dim sum and release identity

- Ordinary project work uses only verified images from the canonical tracked dim-sum catalog. Never generate, download, scrape, or fetch substitute images.
- The 1% startup surprise is one fresh draw per eligible launch, non-blocking, focus-safe, first-run/update/error excluded, reduced-motion aware, and persistently disableable.
- Every build uses one unused verified bilingual dish code name without replacing the version number.
- Show the exact dish names and local image in About, changelog, landing site, and release notes; attach the image to the release.

## Documentation and release work

- Keep a compact README with collapsible detail, `ROADMAP.md`, `HANDOFF.md`, community files, categorized feature docs, hosted site articles, wiki, and Pages source current.
- Every feature article covers behavior, configuration, failure modes, security, verification, and suggested related articles.
- The landing site presents every feature, uses local assets, has tabbed navigation, search/regex, localization/funny controls, notifications, appearance settings, and accessible responsive layouts.
- Every push and manual dispatch runs tests before creating exactly one uniquely tagged non-draft release with a real Windows installer and verified dim-sum asset. Failed tests create no release.
- Workflows use hosted runners first, explicit least privilege, pinned actions, and the token chain `RELEASE_TOKEN`, then `ORG_TOKEN`, then `GITHUB_TOKEN`.
- Never predict CI, installer, deployment, or release success. Record observed status and evidence.

## Git and GitHub discipline

- Use the `git` CLI for Git and the `gh` CLI for GitHub. Do not substitute a connector, browser, or raw client for repository operations.
- Inspect status and diff before commit; preserve unrelated work.
- Commit messages use a concise English subject and an English plus playful Hong Kong Cantonese body. Humor may roast code behavior, never people.
- Finish repository-changing work committed on and pushed to the default branch. Verify the upstream default branch contains the intended commit.
- Inspect branches, worktrees, and stashes before completion; never delete uncommitted, unmerged, or unpushed work.
- Maintain one rolling progress Discussion and one per-release changelog Announcement with exact commits, checks, installers, and honest state.
- Scan open issues in this repository and the canonical shared-instructions repository throughout work. Implement actionable issues or record the exact blocker.
- Never expose secrets, private infrastructure, local usernames, absolute external paths, or internal conversational vocabulary in public artifacts.

## Verification

- Run unit, renderer-domain, IPC/service, real Electron smoke, LibreOffice integration, installer, landing-site, and packaging tests in proportion to changes.
- Exercise valid, invalid, no-match, Unicode, multiline, zero-width, capture, adversarial, and plain-versus-regex cases.
- Validate common Windows layouts at 100%, 125%, 150%, and 200%, including bilingual labels and narrow widths.
- A task is complete only when the requested behavior, documentation, installer, release, hosted site, and upstream evidence are genuinely complete or an exact external blocker is recorded.

