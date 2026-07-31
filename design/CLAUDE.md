# Project directive — LibreOffice Material

**The LibreOffice suite GUI must adopt the Material Design 3 system defined in this project.**

The canonical design is `LibreOffice Material.dc.html` (interactive prototype) and the
native token contract in the codebase at
`vcl/uiconfig/theme_definitions/material/definition.xml`. All suite surfaces —
Start Center, Writer, Calc, Impress, Draw, Base, Math, shared dialogs, and every
component — must match this design.

## Non-negotiable design rules
- **Tokens, not literals.** Components consume the semantic roles (color, shape,
  metric, typography) from `definition.xml`; never hard-code Material colors in
  application code.
- **Palettes:** MD3 baseline purple. Light + dark are the two shipped schemes;
  high contrast restores the native baseline and bypasses Material drawing.
  - Light primary `#6750A4` / container `#E8DEF8`; surface `#FFFBFE`.
  - Dark primary `#D0BCFF` / container `#4F378B`; surface `#141218`.
- **Shape:** 8 corner roles — checkbox 3, indicator 4, focus 6, small 8,
  control 10, container 12, toolbar 18, pill 20 (px).
- **Type:** body/label/title roles; native font identity preserved (Segoe UI on
  Windows), 100–200% non-shrinking scale, bounded minimum weights.
- **Density:** two profiles — compact (keyboard/mouse expert default) and
  comfortable (touch/zoom). Focus visibility and hit-area predictability never vary.
- **Accessibility:** every action keyboard reachable, persistent visible focus,
  color never the only carrier of meaning, reduced-motion alternative for all motion.

## Honesty contract (keep from ROADMAP.md / MATERIAL_DESIGN.md)
Distinguish implemented source from build/runtime-verified behavior. Do not claim a
build, screenshot, or accessibility result that has not actually been produced.

## Platform
Primary target for these mockups: Windows 11 (classic menubar+toolbar and the
tabbed notebookbar/ribbon are both supported chrome layouts).

## Whole-codebase scope — every module adopts this design
The directive applies across the entire LibreOffice source tree. No registered UI
surface is exempt. Module → surface ownership:

| Module(s) | Surface that must adopt Material |
| --- | --- |
| `vcl` | All native widget primitives (buttons, fields, tabs, lists, trees, scrollbars, sliders, progress, menus) — the token source |
| `sfx2` | Start Center, document shell, sidebar shell, common dialogs |
| `framework` | Menubar, toolbars, notebookbar, status bar, command surfaces |
| `svx`, `svtools`, `svl` | Shared controls, sidebar panels, color/area/line dialogs, rulers |
| `cui` | Options, Customize, Character/Paragraph, special-character, template dialogs |
| `sw` | Writer authoring, styles, review, tables, navigator |
| `sc` | Calc grid, formula bar, sheet tabs, data/pivot/chart flows |
| `sd` | Impress slides/animation/presenter console; Draw canvas/objects/layers |
| `starmath` | Math formula editor + symbol selection |
| `dbaccess`, `reportdesign`, `forms` | Base data, queries, forms, reports |
| `chart2` | Chart editing surfaces |
| `formula` | Formula/function wizard |
| `fpicker` | File open/save pickers |
| `desktop` | App lifecycle, recovery, extensions, onboarding |
| `xmlsecurity`, `uui` | Certificate, signature, and interaction dialogs |
| `extras`, `icon-themes` | Templates, gallery assets, icon pipeline |

Follow `ROADMAP.md` sequencing: shared VCL primitives + Start Center first, then
Writer → Calc → Impress/Draw → Base/Math → suite-wide hardening.

## Git
Every task that lands must be committed and pushed per `AGENTS.md`. (Design mockups
in this project are authored as `.dc.html`; the native implementation lives in the
modules above.)

## Per-project local git repository
- **Every project has its own local git repository.** Initialize one at the
  project root (`git init`) if it does not already exist; the whole project is
  version-controlled locally, independent of any remote.
- **Commit as work lands.** Each completed task is committed to the local repo
  with a clear message; history is preserved, never squashed away.
- **Saving includes the repo.** Whenever the project is saved, exported, or
  downloaded, the `.git` directory travels with it, so the full local history is
  part of the saved artifact (do not add `.git` to ignore/exclusion lists for
  exports).
- A configured remote is optional; pushing is in addition to — never a
  replacement for — the local repository.
- **Auto-save every undoable change.** Every single movement, edit, or any
  action that can be undone is automatically committed to the local git repo as
  it happens — each undoable step becomes a commit (or an equivalent
  auto-snapshot), so the git history is a complete, replayable record of the
  work with nothing lost between manual commits.
