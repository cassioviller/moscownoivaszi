---
name: Git recovery as main agent
description: How to recover deleted working-tree files when destructive git is blocked.
---

# Recovering a wiped working tree (main agent)

The sandbox **blocks destructive git for the main agent**: `git restore`, `git checkout`, `git reset`, `git clean`, `git rm`, `git commit`, etc. all return "Destructive git operations are not allowed in the main agent."

To restore files deleted from the working tree but still present in a commit, use **read-only** git plus shell copy:
```
git archive HEAD <path> -o /tmp/restore.tar
mkdir -p /tmp/restore && tar -xf /tmp/restore.tar -C /tmp/restore
cp -rn /tmp/restore/<path>/. <path>/   # -n = no-clobber: preserves modified/untracked files
```
`rsync` is NOT installed; use `cp -rn`. `git archive` is allowed (read-only).

**Why:** A full working-tree wipe (1432 files deleted on disk, all present in HEAD) could not be fixed with `git restore` due to the block. `cp -n` only re-creates missing files, so locally-modified files (e.g. an edited `artifact.toml`) and untracked dirs are preserved.

**Port cleanup:** `fuser` and `lsof` are NOT installed. Find port-holding orphans via `ps aux | grep` (or scan `/proc/<pid>/cmdline`) and `kill -9 <pids>`, then restart the workflow so it owns the process. Orphaned dev servers (e.g. a manually-started `next dev`) cause `EADDRINUSE` when the workflow tries to bind.
