# Security policy

## Supported versions

Material Office has no published release yet. Security reports against the unreleased `0.1.0` candidate are accepted, but there is currently no supported installer version. This section will name supported release lines only after a release is published and verified.

## Report a vulnerability

Use GitHub private vulnerability reporting for this repository. Do not post credentials, private documents, exploit payloads containing personal data, or sensitive machine details in a public issue.

Include the affected version, Windows build, observed impact, minimum reproduction steps, and whether LibreOffice was involved. A report does not need a working exploit when the trust-boundary violation is clear.

## Security model

- Renderer sandboxing, context isolation, and narrow validated IPC. Packaged UI assets use the exact `material-office://app/` origin; a bounded allowlist blocks alternate hosts, ports, queries, traversal, non-asset extensions, and changing files.
- Denied popups, navigation, webviews, and permission requests.
- Main-owned absolute paths and process arguments with `shell: false`.
- Catalog-locked UNO commands, bounded conversions, unique profiles, and no document-content logging.
- Local-only workspace state and isolated append-only history.
- Bundled scripts, fonts, command data, and imagery; no analytics or CDN assets. CSP, same-origin resource policy, MIME nosniff, and hardened Electron-fuse checks are implemented and locally tested; no public packaged executable has completed the external release workflow yet.

Locally built unsigned installers can trigger Windows reputation warnings. There is no public installer or release checksum to verify yet. When distribution begins, verify the exact release checksum, provenance record, license notices, and repository source; signed distribution remains future work.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for Electron/Chromium, MinGit, and LibreOffice licensing boundaries, and [the dim-sum provenance record](docs/legal/classic-har-gow-provenance.md) for the bundled image.
