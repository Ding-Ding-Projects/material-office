# Writer

## Behavior

Writer provides an editable paged document, semantic headings, rich-text formatting, lists, alignment, word count, autosave, tabs, local history, and Save Material Office Word. The custom `.mow` package contains the document plus an embedded Git bundle, so each save is committed and a restore is a new commit that can itself be undone. Portable unsaved content exports honestly as HTML; a real office-format document opens in LibreOffice.

## Configuration

Font, size, style, alignment, line spacing, page zoom, properties visibility, language, and appearance follow live persisted controls.

## Failure modes

Browser rich text cannot promise perfect ODT or DOCX round trips. Originals are preserved; native conversion is attempted only through LibreOffice and output is checked.

## Security

Saved rich HTML is sanitized to an allowlist; scripts, event attributes, arbitrary styles, and unsafe links are removed.

## Verification

Electron smoke verifies the editable Writer page. Persistence tests snapshot workspace content and restore it as a new revision.

## Suggested articles

[LibreOffice integration](../integration/libreoffice.md) · [Version history](../data/version-history.md) · [Appearance](../customization/appearance-localization.md)
