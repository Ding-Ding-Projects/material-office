# Math

## Behavior

Math provides a command editor, symbol palette, and live MathML for literals, operators, fractions, superscript/subscript, square roots, groups, and common Greek symbols.

## Configuration

Formula source, document title, zoom, appearance, tab, and language settings persist locally.

## Failure modes

Malformed or unsupported syntax produces an inline actionable error without discarding the source text. LibreOffice Math remains available for full StarMath behavior.

## Security

Formula parsing uses a bounded original grammar. Every text-bearing MathML node is escaped and arbitrary markup is never inserted.

## Verification

Renderer tests cover supported constructs, malformed syntax, node limits, and injection attempts. Electron smoke confirms rendered MathML.

## Suggested articles

[UNO command broker](../integration/uno-command-broker.md) · [Appearance](../customization/appearance-localization.md)

