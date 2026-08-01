# Roadmap

## Shipped in 0.1.0

- Windows Electron shell and all eleven product surfaces.
- Original in-app Writer, Calc, Impress, Draw, Base, and Math editing models.
- Durable workspace state and append-only local Git history.
- Material appearance, localization, funny-level, notification, tab/group, regex, and changelog systems.
- Explicit LibreOffice discovery, conversion, native launch, and catalog-locked UNO dispatch.
- Windows x64 NSIS packaging; a test-gated release workflow; a five-file Git runtime with complete corresponding-source inputs; genuine hosted LibreOffice conversion gates; cryptographic installer provenance; and separate Vinext Sites plus static Vite Pages builds.

## 0.1.0 acceptance gate

- Run the complete Windows package, install, launch, uninstall, LibreOffice, and landing-site gates in GitHub Actions.
- Exercise the configured MinGit corresponding-source distribution gate in the hosted workflow and verify every published source/recipe asset by download readback.
- Publish and verify exactly one installer release, checksum, image asset, provenance and legal records, corresponding-source assets, and unique immutable tag.
- Publish and verify the documentation site and browser demo, then add only confirmed public URLs to the repository and app.
- Record and verify the release date, code name, immutable tag, installer digest, attestation, and hosted URLs for the exact successful run.

## Next

- Expand import previews for complex ODF and OOXML documents while preserving originals; native fidelity remains a LibreOffice-only workflow.
- Add signed installer publication when a Windows code-signing identity becomes available.
- Broaden screen-reader automation across Windows Narrator and third-party assistive technology.
- Add hardware-backed performance measurements for very large spreadsheets and long documents.

## Later

- Optional user-approved synchronization providers without changing local-first defaults.
- More LibreOffice command context diagnostics and guided recovery for state-dependent commands.
- Additional verified, unused dim-sum release code names from the bundled catalog.
