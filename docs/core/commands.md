# Command Explorer

## Behavior

The explorer loads 2,433 verified LibreOffice command records, gives every tuple a stable ID, searches by label/scope/area/URI, and shows the exact decoded `.uno:` command. Run is enabled only when a verified LibreOffice installation and broker capability are available.

## Configuration

Choose a product scope and use plain text or the adjacent regex builder. Command identity uses the complete URI; duplicate visible labels remain distinct.

## Failure modes

State-dependent LibreOffice commands may reject a context that does not support them. The app reports the exact failure and never turns a dispatch attempt into a false success.

## Security

The renderer sends only a bundled catalog ID. The main process resolves and verifies that ID; arbitrary UNO strings, macros, paths, or command arguments are rejected.

## Verification

Build-time checks assert exactly 2,433 rows. Unit tests cover ID validation, HTML entity decoding, scope mapping, broker arguments, timeout, and malformed broker output.

## Suggested articles

[UNO command broker](../integration/uno-command-broker.md) · [LibreOffice integration](../integration/libreoffice.md) · [Tabs and search](../customization/tabs-search-regex.md)

