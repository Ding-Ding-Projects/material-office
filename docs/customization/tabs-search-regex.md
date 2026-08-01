# Tabs, groups, search, and regex

## Behavior

Tabs reorder by drag, pin into a protected region, move into named/colorable groups, persist across restart, and expose context/keyboard management. Current-strip, per-group, group-name, and master searches each retain independent mode, query, pattern, flags, validation, and results. Bulk close supports containing and exact inverse not-containing predicates with a reviewed preview.

## Configuration

Plain text is the default. The adjacent `.*` affordance opens an anchored builder with guided literals, character classes, anchors, groups, alternation, quantifiers, raw pattern, flags, sample, matches, captures, copy, and export.

## Failure modes

Empty queries and invalid patterns never close tabs. Pinned tabs/groups are excluded unless explicitly included; unsaved tabs require a decision. Stale previews are rejected when pin/group/unsaved state changes.

## Security

Regex input is length-bounded and evaluated in a disposable worker with a deadline. Aggregate collection size is bounded, zero-width matches always advance, and patterns/samples are not transmitted or persisted unexpectedly.

## Verification

Tests cover all four searches, group lifecycle, visible-title matching, inverse parity, Unicode, multiline, zero-width, captures, worker timeouts, pinned-group protection, unsaved protection, and time-of-check/time-of-use changes.

## Suggested articles

[Settings](../core/settings.md) · [Version history](../data/version-history.md) · [Command Explorer](../core/commands.md)

