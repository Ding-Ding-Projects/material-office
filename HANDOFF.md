# Handoff

## Current state

Material Office 0.1.0 is a Windows-only Electron release with an original Material Design renderer and explicit LibreOffice integration. The app, test suites, landing-site source, browser-demo source, installer workflow, and documentation are maintained together in this repository. Build-specific proof belongs to the exact GitHub Actions run, immutable Release, attestation, Pages deployment, and rolling progress Discussion; this source file does not predict a run's outcome.

## Verification baseline

- Main-process service tests cover persistence, bundled and isolated Git history, transactional large-state restore, validation, LibreOffice discovery/launch/conversion, and bounded workspace state.
- Renderer-domain tests cover localization, colors, spreadsheet formulas, MathML, regex safety, and tab/group semantics.
- Electron smoke automation exercises all eleven surfaces, Base table/query/form/report behavior, anchored appearance persistence, a real bundled-Git snapshot/restore, the 2,433-command catalog, LibreOffice availability, local modules/assets, and the rendered home workspace.
- Landing-site tests build both the Vinext Sites package and the configurable-base static Vite Pages artifact, then verify the full local catalog, legal mirrors, release image, and candidate-versus-published release-link states.
- The minimal five-binary Git runtime and complete Git/libiconv/gettext corresponding-source bundle are pinned, locally verified, release-gated, and published alongside each successful installer build.

## Operational notes

- LibreOffice must be discovered by absolute path; Windows office file associations are not authoritative.
- Unsaved in-app documents export to honest portable HTML, CSV, or JSON. Office-format conversion requires a real source file and LibreOffice.
- App-owned history lives under Electron user data, uses the packaged checksum-pinned five-file Git runtime, and records restores as new revisions.
- The hosted workflow pins official LibreOffice `26.2.5` by MSI SHA-256 and Authenticode signer and must pass genuine HTML/FODT-to-PDF conversions plus the bundled-Python PyUNO import before packaging can publish.
- The Windows installer is Authenticode-unsigned until a code-signing identity is provided through an approved secret store. It is per-user, non-elevating, `asInvoker`, checksum-published, and cryptographically tied to its repository/workflow identity through GitHub build-provenance attestation.

## Next maintainer checks

1. Run `npm ci && npm test && npm run prepare:git-sources && npm run dist:win && npm run verify:package && npm run verify:fuses` on Windows.
2. Run `npm test` in `landing/`; this preserves the Vinext Sites build and verifies the separate static Pages build.
3. Verify that the latest immutable release contains one installer, checksum, provenance record, notices, listed dim-sum PNG, component/source manifests, exact corresponding-source archives, recipe archive, and passing installer attestation.
4. Recheck open issues, the rolling progress Discussion, the per-release Announcement, hosting, wiki, and default-branch containment for the exact completed commit.
