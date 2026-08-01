# Windows installer and CI

> **Status:** `0.1.0` Windows release pipeline. A particular installer is trusted only when its exact workflow is green, its immutable Release readback matches, and `gh attestation verify` succeeds.

## Behavior

Electron Builder is configured to produce an x64 NSIS installer with per-user default, selectable destination, Start menu, desktop shortcut, retained app data on uninstall, packaged legal notices, and a checksum-pinned five-file Git-for-Windows runtime for local history. The runtime contains only `mingw64/bin/git.exe`, its four proven non-system DLL dependencies, exact upstream license texts, the MinGit package manifest, and a component manifest; package verification rejects Git Credential Manager, Bash, helper tools, or any other file. The verified Classic Har Gow PNG is accepted directly by Electron Builder as the Windows icon source. The GitHub Actions workflow tests and publishes one unique release for every successful push and manual dispatch. GitHub Pages deployment remains default-branch-only and is an additional release prerequisite on `main`; that hosted path has not run yet.

## Configuration

The workflow uses a hosted Windows runner and the token fallback `RELEASE_TOKEN`, `ORG_TOKEN`, then `GITHUB_TOKEN`. Tags combine package version, monotonic run number, and run attempt; a non-canceling concurrency group serializes publication. It pins the official LibreOffice `26.2.5` Windows x86-64 MSI by SHA-256 and Authenticode signer, installs it on the hosted runner, proves application discovery plus the bundled-Python PyUNO import, and performs genuine HTML-to-PDF and FODT-to-PDF conversions through `LibreOfficeService`. The Material Office installer is currently Authenticode-unsigned, so it is constrained to per-user, non-elevating, `asInvoker` installation. The workflow creates a GitHub build-provenance attestation over the exact installer digest, verifies it before draft creation, verifies the downloaded draft bytes again, and only then publishes. Users can run `gh attestation verify Material-Office-0.1.0-x64-Setup.exe --repo Ding-Ding-Projects/material-office` and compare the attached SHA-256 file. The release bundle includes the installer, checksum, dim-sum image, image provenance, project license, third-party notices, Git component/source manifests, official Git/libiconv/gettext source archives, and the exact Git-for-Windows libiconv/gettext recipes and patches. The source gate relies on exact upstream URLs, byte lengths, and pinned SHA-256 values; it does not claim PGP signer authentication.

## Failure modes

Any workflow-lint, dependency-audit, unit, renderer, package, fuse, minimal-Git, genuine-LibreOffice, packaged-app, installed-app, icon, uninstaller, landing-site, Pages, source, or publication failure prevents a non-draft release. Missing installer, checksum, bundled Git runtime, exact legal notice, corresponding-source asset, recipe, provenance record, or decodable dim-sum asset fails publication. A draft is removed when pre-publication upload/readback fails. Locally built unsigned installers may trigger Windows reputation warnings until a code-signing identity is available.

## Security

The checked-in workflow uses least-privilege job permissions, pinned action commits, disabled checkout credential persistence, no pull-request execution, and no secret output. Official actionlint `1.7.12` is downloaded by pinned SHA-256 before the build jobs proceed. Electron fuses are configured to disable RunAsNode, Node options, CLI inspect arguments, and legacy file-protocol privileges while enabling cookie encryption and ASAR integrity/load restrictions. The renderer loads through `material-office://app/`, whose main-process handler accepts only exact-host, query-free, traversal-safe, allowlisted assets beneath the packaged renderer root; responses add CSP, same-origin, nosniff, and no-store headers. Publication refuses to overwrite an earlier tag/release and verifies every uploaded asset through API metadata plus a full download/hash readback. Hosted enforcement remains unverified until the first workflow run.

## Verification

Local `npm test` includes offscreen Electron smoke. `npm run prepare:git-runtime && npm run verify:git-runtime` has exercised real `init`, `add`, `commit`, `log`, `show`, restore, pruning, `commit-tree`, compare-and-swap `update-ref`, reflog expiry, and `gc` with only the five runtime binaries. `npm run prepare:git-sources` has verified the complete pinned source set and deterministic recipe archive. Package verification repeats the real history path against the packaged runtime and inspects the ASAR allowlist, unpacked UNO broker, license/notices/provenance, and Electron fuse bytes. The unrun hosted configuration additionally verifies the official LibreOffice installation and conversions, executable/shortcut/window icon, silent install/uninstall, static Pages deployment, and release upload/download bytes. Its result must not be described as verified until a run completes.

## Suggested articles

[Changelog](../data/changelog.md) · [LibreOffice integration](../integration/libreoffice.md) · [Documentation site](documentation-site.md)
