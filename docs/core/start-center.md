# Start Center

## Behavior

The Start Center opens existing files, creates original in-app Writer/Calc/Impress/Draw/Base/Math records, searches recent work, and resumes a document in a browser-style tab. Native office files are opened through the verified LibreOffice executable rather than Windows file associations.

## Configuration

Theme, density, language, funny levels, search mode, recent ordering, and dim-sum surprise behavior come from persisted app settings. Recent search is plain-text-first and has its own adjacent regex builder.

## Failure modes

If LibreOffice is unavailable, internal editing remains usable and the app reports that native conversion/launch is disabled. Canceled Windows file dialogs do not create history or notifications.

## Security

The renderer never receives a general file-system capability. A native dialog grants one selected path to a validated main-process method.

## Verification

Electron smoke checks load the Start Center after visiting all other surfaces, confirm six sample/recent documents, and capture the rendered home workspace.

## Suggested articles

[LibreOffice integration](../integration/libreoffice.md) · [Tabs and search](../customization/tabs-search-regex.md) · [Version history](../data/version-history.md)

