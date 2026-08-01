# Notifications and accessibility

## Behavior

Informational, progress, success, and non-decision errors appear as corner notifications. Warnings/errors remain until dismissed; history stays reviewable. All controls have keyboard paths, visible focus, accessible names/states, screen-reader structure, and reduced-motion behavior.

## Configuration

Users can enable the optional serialized narrator, select English/Cantonese/Both, change funny levels, disable the dim-sum surprise, reduce motion, and scale the interface.

## Failure modes

A notification/history write failure never blocks the requested user action. Narration cancels superseded lines, never overlaps, and yields when accessibility/reduced-sound conditions are active.

## Security

Notifications never include secrets or full document content. External links are optional explicit actions, not auto-navigation.

## Verification

Electron smoke verifies the live stack. UI captures are reviewed at high Windows scale for clipping, overlap, focus, and target size; forced-color CSS uses native system colors.

## Suggested articles

[Settings](../core/settings.md) · [Appearance and localization](appearance-localization.md) · [Dialogs](../core/dialogs.md)

