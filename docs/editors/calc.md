# Calc

## Behavior

Calc provides editable sheets, cell selection, formula bar, sheet creation, and safe formulas for arithmetic, references, ranges, `SUM`, `AVERAGE`, `MIN`, `MAX`, and `COUNT`. CSV export reflects stored raw values.

## Configuration

Sheets, active cell, raw formulas, formats, zoom, search, and tab state persist with the workspace.

## Failure modes

Cycles, division by zero, unknown names, invalid references, and type errors remain explicit spreadsheet errors. Unsupported office functions are never evaluated as JavaScript.

## Security

The parser tokenizes and evaluates a bounded grammar without `eval` or `Function`. Formula text never leaves the device.

## Verification

Renderer tests cover precedence, right-associative powers, ranges, Unicode strings, cycles, error propagation, and JavaScript-injection attempts.

## Suggested articles

[UNO command broker](../integration/uno-command-broker.md) · [Version history](../data/version-history.md) · [Tabs and search](../customization/tabs-search-regex.md)

