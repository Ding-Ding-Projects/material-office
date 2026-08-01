# Material Components

## Behavior

Buttons, fields, switches, checkboxes, radios, sliders, progress, semantic colors, focus, and notifications respond to real state changes. Every appearance target exposes an anchored editor by context menu.

## Configuration

Use Settings or context-menu **Edit appearance…** to change color, typography, spacing, radius, density, and scale. Per-element overrides persist and can be reset.

## Failure modes

Unsupported font effects remain visible with a platform-capability explanation. Invalid colors keep the user’s input visible and do not replace the last valid rendered value.

## Security

Color conversion and font previews run locally. No font, palette, sample, or appearance file is uploaded.

## Verification

Renderer tests round-trip required color spaces, alpha, gamut/clipping metadata, and contrast. Electron smoke verifies live selection controls.

## Suggested articles

[Appearance and localization](../customization/appearance-localization.md) · [Notifications and accessibility](../customization/notifications-accessibility.md)

