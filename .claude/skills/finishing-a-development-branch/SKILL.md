---
name: finishing-a-development-branch
description: Use when implementation is complete and all tests pass - verifies tests, squash-merges the feature branch into the base branch as a single commit, and cleans up the worktree and branch
---

# Finishing a Development Branch

## Overview

Complete development work by squash-merging it into the base branch as a single commit.

**Core principle:** Verify tests → Detect environment → Squash-merge into base → Verify merged result → Clean up.

This skill ALWAYS ends with the work merged into the base branch (usually `main`) as ONE squash commit. There is no options menu — merging is the only outcome. The only thing that stops the merge is failing tests.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before merging, verify tests pass on the feature branch:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot merge until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Detect Environment

**Determine workspace state — it decides how cleanup works in Step 5:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

| State | Cleanup |
|-------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo) | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Provenance-based (see Step 5) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | No cleanup (externally managed) |

### Step 3: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 4: Squash-Merge into Base

```bash
# Capture feature state before leaving the worktree
FEATURE_BRANCH=$(git branch --show-current)   # empty if detached HEAD
FEATURE_SHA=$(git rev-parse HEAD)

# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

git checkout <base-branch>
git pull

# Squash-merge: stages all feature changes as one set, no merge commit
git merge --squash "$FEATURE_SHA"
git commit -m "feat: <one-line summary of the whole feature>"
```

- Merge the SHA, not the branch name — works for both named branches and detached HEAD.
- The single commit message must summarize the entire feature (use the plan/spec title), not the last task.

**Verify tests on the merged result:**

```bash
<test command>
```

**If tests fail on the merged result:** STOP. Report the failures. Do NOT clean up the worktree or delete the feature branch — they are needed to investigate. The base branch likely moved since the feature branched; fix forward before any cleanup.

**If tests pass:** Report "Squash-merged into <base-branch> as <commit-sha>: <commit message>", then continue to Step 5.

### Step 4b: Check Off ROADMAP Phase

If the feature's spec references a ROADMAP phase (look at the top of the spec for a
`ROADMAP: Phase ...` line), tick that phase's checkbox in the ROADMAP file on the base branch
and commit it (`docs: check off ROADMAP phase <N>`). If the spec has no phase reference, skip.

### Step 5: Cleanup Workspace

**Only runs after the merged result passes tests.**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=<the feature worktree path captured in Step 4>
```

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Skip to branch deletion.

**If worktree path is under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`:** Superpowers created this worktree — we own cleanup.

```bash
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**Otherwise:** The host environment (harness) owns this workspace. Do NOT remove it. If your platform provides a workspace-exit tool, use it. Otherwise, leave the workspace in place.

**Then delete the feature branch (if it was a named branch):**

```bash
git branch -D "$FEATURE_BRANCH"
```

Note: `-D` (force) is required — after a squash merge, git does not consider the branch merged, so `-d` refuses.

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code into the base branch
- **Fix:** Always verify tests before merging, and again on the merged result

**Using a regular merge instead of `--squash`**
- **Problem:** Feature's intermediate commits (one per TDD step) pollute base branch history
- **Fix:** Always `git merge --squash` + one commit summarizing the feature

**Using `git branch -d` after a squash merge**
- **Problem:** Fails with "not fully merged" — squash merges aren't tracked as merges
- **Fix:** Use `git branch -D` after confirming the squash commit is on the base branch

**Deleting branch before removing worktree**
- **Problem:** Worktree still references the branch
- **Fix:** Merge first, remove worktree, then delete branch

**Running git worktree remove from inside the worktree**
- **Problem:** Command fails silently when CWD is inside the worktree being removed
- **Fix:** Always `cd` to main repo root before `git worktree remove`

**Cleaning up harness-owned worktrees**
- **Problem:** Removing a worktree the harness created causes phantom state
- **Fix:** Only clean up worktrees under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on the result
- Create a merge commit (`git merge` without `--squash`) — base history must get exactly one commit per feature
- Push or force-push (merge is local; the user decides when to push)
- Clean up the worktree or delete the branch before the merged result passes tests
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree

**Always:**
- Verify tests before merging AND on the merged result
- Squash-merge the SHA, commit with a single feature-level message
- `cd` to main repo root before checkout/merge/worktree removal
- Run `git worktree prune` after removal
