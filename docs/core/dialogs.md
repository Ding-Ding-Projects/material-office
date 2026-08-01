# Dialogs

## Behavior

Options, Save As, and Print demonstrate real fields and decisions. Informational results use notifications; dialogs block only when a save/discard, print, or other required decision is pending.

## Configuration

Save type and print range are selected inside their dialog. Settings are persisted by the same validated main-process store as the dedicated Settings surface.

## Failure modes

Canceled dialogs make no change. Invalid paths stay in the field with inline error details. Unsaved tab close requires an explicit save or discard choice.

## Security

Passwords are not implemented as decorative fields and are never stored in workspace JSON. A future password workflow must use a protected secret store and native consent boundary.

## Verification

Electron smoke opens the Dialogs surface; keyboard and focus behavior are exercised in the renderer’s event flow.

## Suggested articles

[Settings](settings.md) · [Notifications and accessibility](../customization/notifications-accessibility.md) · [Windows installer](../release/windows-installer.md)

