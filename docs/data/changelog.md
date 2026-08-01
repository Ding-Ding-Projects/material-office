# Changelog

> **Status:** `0.1.0` is the first Windows release entry, dated 2026-07-31 and code-named **Classic Har Gow · 蝦餃**.

## Behavior

The in-app viewer covers every released version with version, date, bilingual dim-sum code name, categorized changes, local image, search, advanced typed/calendar date range, copy, and Markdown export. Build-specific URLs and artifact proof remain in the immutable GitHub Release rather than being invented by the offline app.

## Configuration

Language and funny levels style narrative copy without changing versions, dates, code names, security impact, or breaking-change facts.

## Failure modes

Missing historical notes remain explicitly empty; the app never invents entries. Invalid dates stay visible with an inline error.

## Security

Changelog data is bundled and treated as inert text. Export uses a local Blob and never opens a remote writer.

## Verification

Electron smoke verifies the release code name and viewer controls. Release automation checks the real tag, installer, checksum, attestation, notices, provenance, and image before the documentation deployment is allowed to present a published record.

## Suggested articles

[Windows installer](../release/windows-installer.md) · [Documentation site](../release/documentation-site.md) · [Notifications](../customization/notifications-accessibility.md)
