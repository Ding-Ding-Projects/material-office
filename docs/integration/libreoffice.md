# LibreOffice discovery, launch, and conversion

> This integration ships in the `0.1.0` Windows release and requires a separately installed LibreOffice.

## Behavior

The main process discovers LibreOffice by explicit override, registry, and verified standard/versioned paths. It distinguishes `soffice.exe` for visible UI, `soffice.com` for console conversion, and bundled `python.exe` for UNO. Opening or creating a native document launches the verified absolute executable.

## Configuration

An administrator may set the documented executable override outside the renderer. Users can refresh discovery or choose an installation through a native capability path.

## Failure modes

Missing executable, source, output directory, conversion filter, output file, timeout, and non-zero exit are distinct errors. Successful exit without a valid output is failure.

## Security

Every job uses `shell: false`, argument arrays, unique app-owned profiles, size/time/output bounds, allowlisted extensions and targets, disabled interaction, and cleanup. File associations may point to another office suite and are intentionally ignored.

## Verification

Unit tests cover discovery precedence, LibreOfficeDev versioned directories, GUI/console selection, profile arguments, timeout, and output validation. The release workflow installs the pinned official LibreOffice build and gates publication on real HTML/FODT-to-PDF conversions plus bundled-Python PyUNO import.

## Suggested articles

[UNO command broker](uno-command-broker.md) · [Writer](../editors/writer.md) · [Windows installer](../release/windows-installer.md)
