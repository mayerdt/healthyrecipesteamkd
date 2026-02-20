# deploy.ps1 — Safe push that NEVER overwrites live recipe data
# Usage: powershell -ExecutionPolicy Bypass -File deploy.ps1
#
# Why this exists:
#   data/recipes.json is written by the browser via the GitHub Contents API.
#   We use --skip-worktree so git never stages local changes to this file,
#   meaning a git push can never overwrite the live recipe data on GitHub.

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
