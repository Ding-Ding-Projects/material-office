# Settings

## Behavior

Settings is tabbed into Language, Appearance, Tabs, History, Integrations, Notifications, and Accessibility. Each tab owns a search field and full adjacent regex builder.

## Configuration

Settings persist atomically under Electron user data and are included in local history. Language mode, two funny levels, theme, density, accent, font, scale, dim-sum behavior, narrator, history retention, and editor choice update the live UI. Changing history retention saves only the 10–10,000 preference; a separate **Prune now…** control shows the permanent effect and requires review before older local snapshots are removed.

## Failure modes

Invalid values are rejected by main-process validation. A history write failure is reported but does not roll back the setting the user chose. A prune failure leaves the current workspace open, refreshes nothing speculatively, and reports the exact failure in a persistent nonblocking notification.

## Security

Unknown prototype keys, oversized graphs, cyclic values, and non-JSON data are rejected. No setting exposes arbitrary process arguments or paths to the renderer.

## Verification

Unit tests cover schema bounds, concurrent updates, exact prune IPC, and the reviewed-action wiring. Electron smoke confirms language and funny-level controls are present and functional.

## Suggested articles

[Appearance and localization](../customization/appearance-localization.md) · [Version history](../data/version-history.md) · [LibreOffice integration](../integration/libreoffice.md)
