# Local version history

## Behavior

An isolated Git repository under Electron user data snapshots documents, records, tabs/groups, appearance, notifications, integrations, and settings. The Windows package carries a checksum-pinned Git-for-Windows MinGit runtime, so history does not depend on a developer tool already being installed. Revisions are labeled from the main process by the real state change. Restore writes the selected state and immediately records the restore as a new revision.

Pruning is an explicit reviewed operation. It rebuilds the isolated branch from exactly the newest configured number of logical snapshots, preserves each retained snapshot, action, and recorded event time, atomically swaps the branch tip, then expires unreachable reflogs and objects. Restore remains append-only after pruning: restoring any retained snapshot creates a new newest revision.

## Configuration

The History surface composes text/regex search, typed date range, presets, and multi-select action filters derived from recorded entries. Retention accepts 10–10,000 snapshots. Editing that number only saves the preference; **Prune now…** opens a blocking review that states the permanent effect and requires an explicit checkbox before removal. The refreshed history view marks the newest retained revision as current. Export remains available under Settings.

## Failure modes

Unchanged state records nothing. A missing, modified, or non-executable bundled runtime disables history with an exact diagnostic but never rolls back the primary operation. Invalid or incompatible snapshots are rejected before replacing current stores. Pruning refuses a dirty or malformed history checkout and leaves the existing branch tip intact if retained-chain validation or the compare-and-swap fails. A cleanup failure is reported honestly rather than claiming unreachable objects were removed.

## Security

History lives outside user folders, disables hooks, accepts exact revision hashes only, and never runs revision expressions. Pruning accepts only an integer limit; the renderer cannot provide a repository path, ref, revision, action, command, or Git argument. The branch rewrite is confined through `git -C` to the main-process-owned isolated checkout and uses an expected-old-tip `update-ref` transaction. Packaged mode resolves only the fixed app-owned Git executable; it cannot substitute a `PATH` executable. Every process uses an absolute executable, argument array, `shell: false`, and bounded output. Encrypted records remain encrypted when introduced.

## Verification

Tests initialize an isolated repository, record content/settings including a state larger than 8 MiB, restore transactionally, prove the old state remains in ancestry, and verify a new restore snapshot exists. Prune tests create twelve real snapshots, retain exactly the newest ten with their actions/timestamps, prove a discarded revision is unreachable after garbage collection, verify an unrelated directory is untouched, and restore a retained snapshot as an eleventh append-only revision. Packaged smoke performs two real snapshots and a restore through the bundled runtime.

## Suggested articles

[Settings](../core/settings.md) · [Tabs and search](../customization/tabs-search-regex.md) · [Changelog](changelog.md)
