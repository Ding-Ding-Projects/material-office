# Material Office documentation

> **Status:** these articles document the `0.1.0` Windows release. Build-specific proof lives in the exact GitHub Actions run, immutable Release, installer attestation, and Pages deployment.

The landing site presents product articles as browser-style tabs. This repository copy is the durable source-level reference.

## Categories

- [Core surfaces](core/README.md): Start Center, Components, Commands, Dialogs, Settings.
- [Editors](editors/README.md): Writer, Calc, Impress, Draw, Base, Math.
- [Customization](customization/README.md): tabs/search/regex, appearance/localization, notifications/accessibility.
- [Data](data/README.md): local version history and changelog.
- [Integration](integration/README.md): LibreOffice, catalog-locked UNO dispatch, and external editors.
- [Release](release/README.md): Windows installer and documentation hosting.
- [Legal](legal/README.md): license, third-party notices, and image provenance.

There is no HTTP application API, so Postman collections are not applicable. Electron IPC is private to the packaged app and intentionally unavailable over a network.
