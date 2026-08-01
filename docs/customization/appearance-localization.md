# Appearance and localization

## Behavior

Right-click any appearance target for **Edit appearance…**; Shift+right-click opens a tab editor directly. The anchored editor covers installed-font discovery and free entry, variable axes, size, weight, italic/oblique, underline and strike variants, overline, capitalization, small caps, baseline, outline, shadow, glow, character/word/line spacing, direction, alignment, shape, state colors, live preview, named presets, import/export, per-element reset, and global reset. Language modes are English, playful Hong Kong Cantonese, and compact bilingual.

## Configuration

English and Cantonese funny levels persist independently from 1–5. Levels style every message category without changing facts or actions. Theme, density, accent, font, weight, and 100–200% scale update live. User presets and per-element values are included in append-only workspace history.

## Failure modes

Unsupported font axes and properties remain visible with a capability explanation and saved values remain intact. Invalid theme files, files over 64 KiB, and unknown schema versions are rejected without replacing the current preview. Out-of-gamut colors warn before clipping. Bilingual text wraps instead of clipping at narrow widths.

## Security

Color/font work and installed-font enumeration are local and user-initiated. Imported appearance JSON is size-bounded, schema-versioned, copied through a primitive allowlist, and may not supply script, URLs, selectors, prototype keys, or arbitrary executable content.

## Verification

Tests cover all required color spaces, alpha, contrast, gamut metadata, five distinct variants per language, independent bilingual selection, immutable fact placeholders, and static action coverage. Real Electron smoke opens the anchored editor, changes a property, applies it, and verifies the exact element receives the persisted style.

## Suggested articles

[Material Components](../core/components.md) · [Settings](../core/settings.md) · [Notifications and accessibility](notifications-accessibility.md)
