# Archived design-reference scope

The files in this directory are the original interaction and visual-design reference for Material Office. They are not the application runtime.

Material Office is a new Windows-only Electron application. Its maintained implementation lives under `src/`; it integrates with an installed LibreOffice instance through explicit, validated process and UNO boundaries. Do not copy or adapt source code from any other office application or external project. LibreOffice is the only permitted upstream code reference, recorded by the repository's `original-code-reference/libreoffice-core` submodule.

The design reference remains useful for visual comparison across the Start Center, Writer, Calc, Impress, Draw, Base, Math, shared components, commands, history, and dialogs. New behavior must be implemented independently in the Electron application and verified in its own tests.

Repository-wide contribution, security, accessibility, release, and documentation requirements live in the root `AGENTS.md` and feature documentation under `docs/`.
