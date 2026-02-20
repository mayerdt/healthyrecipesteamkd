# deploy.ps1 — Safe push that NEVER overwrites live recipe data
# Usage: powershell -ExecutionPolicy Bypass -File deploy.ps1
#
# ─────────────────────────────────────────────────────────────────────────────
# ARCHITECTURE — READ THIS BEFORE USING RAW GIT PUSH
# ─────────────────────────────────────────────────────────────────────────────
# data/recipes.json is the live recipe database. It is written directly to
# GitHub by the BROWSER via the GitHub Contents API (PUT /contents/...) every
# time a recipe is added, updated, rated, or deleted.
#
# This means GitHub's main branch gets new commits from the browser at any
# time — completely outside your local git history. If you run `git push`
# without pulling first, git will reject it (non-fast-forward). If you run
# `git push --force`, you WIPE all the live recipe data.
#
# THE FIX — this script does three things:
#   1. Marks data/recipes.json with --skip-worktree so git never stages it.
#      Even after `git pull` restores it locally, git treats it as invisible.
#   2. Runs `git pull --rebase` to incorporate any browser-written recipe
#      commits from GitHub before pushing.
#   3. Runs `git push` normally (never --force).
#
# IF THIS SCRIPT FAILS (e.g. terminal stuck in vim / rebase conflict):
#   - Press q or :q! to escape the editor, then `git rebase --abort`
#   - Fallback: push files directly via GitHub Contents API (see README.md)
#     then sync local: `git fetch origin; git reset --hard origin/main`
#     then re-run: `git update-index --skip-worktree data/recipes.json`
# ─────────────────────────────────────────────────────────────────────────────

Set-Location $PSScriptRoot

# Step 1: Ensure data/recipes.json is marked skip-worktree
#         (git won't stage or push local changes to it)
$tracked = git ls-files data/recipes.json
if ($tracked) {
    $flags = git ls-files -v data/recipes.json
    if ($flags -notmatch '^S') {
        Write-Host "Marking data/recipes.json as skip-worktree..."
        git update-index --skip-worktree data/recipes.json
    }
}

# Step 2: Stage any pending code changes (data/recipes.json is safely skipped)
git add -A

# Step 3: Pull remote changes (incorporates any API recipe commits) then push
Write-Host "Pulling remote changes..."
git pull --rebase
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: pull --rebase failed. Aborting deploy."
    git rebase --abort 2>$null
    exit 1
}

Write-Host "Pushing..."
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: push failed."
    exit 1
}

Write-Host "Done! Recipe data on GitHub is preserved."
