# External editor integration

## Behavior

Material Office can discover supported Windows editors and open the active document in one selected editor. Built-in discovery checks known absolute installation locations for Visual Studio Code, VSCodium, Notepad++, Sublime Text, and Cursor. A user may add another Windows executable through a main-process native file picker. The preferred editor and verified custom-editor records persist in app settings.

Only a document already known to the main-process document store can be opened. The renderer supplies an opaque document ID and editor ID; it cannot supply the target path, executable path, command-line arguments, or working directory. The main process resolves the current native document path and launches the editor with exactly one path argument and `shell: false`.

## Configuration

Open **Settings → Integrations**, choose a discovered editor, or select **Choose executable…** to validate a custom `.exe`. **Open active file** is available only when the active document has a native file. The `MATERIAL_OFFICE_EDITOR` development override is accepted only as an absolute existing Windows executable and does not create a renderer path capability.

## Failure modes

- No installed editor found: the list remains usable through **Choose executable…**.
- Custom selection is canceled: no setting changes.
- Missing or non-`.exe` custom path: validation rejects it.
- Document has no native file: the app reports that an in-app-only record cannot be opened externally.
- Document or editor disappeared after selection: the main process returns an exact not-found error without launching another program.
- Editor does not accept folders: a folder target is rejected; document opening is unaffected.

Informational failures use a persistent, reviewable notification. The app does not silently fall back to Windows file associations or another executable.

## Security

Native pickers and path resolution remain in the main process. Custom editor records are size-bounded, limited to twenty entries, validated as absolute `.exe` files, and protected from ordinary renderer settings patches. Launch uses an absolute executable, an argument array, `shell: false`, hidden process startup, bounded output, and no renderer-controlled flags. Document paths are not returned to the renderer as a general file-system capability.

## Verification

Unit tests cover known-location discovery, duplicate suppression, custom executable validation, the environment override, missing targets, folder capability, `shell: false`, and exact launch arguments. IPC tests prove that a stored document ID resolves in the main process and that raw paths, unknown document IDs, unknown editor IDs, null payloads, and removed generic editor channels are rejected.

## Suggested articles

[Settings](../core/settings.md) · [LibreOffice integration](libreoffice.md) · [Security policy](../../SECURITY.md)
