# deploy.ps1 — Safe push that NEVER overwrites live recipe data
# Usage: powershell -ExecutionPolicy Bypass -File deploy.ps1
#
# Why this exists:
#   data/recipes.json is written by the browser via the GitHub Contents API.
#   A plain `git push --force` would overwrite it with the empty local file.
#   This script removes the file from git tracking, then pulls + pushes safely.

Set-Location $PSScriptRoot

# Step 1: Untrack data/recipes.json from git index (stop git from managing it)
$tracked = git ls-files data/recipes.json
if ($tracked) {
    Write-Host "Removing data/recipes.json from git tracking..."
    git rm --cached data/recipes.json
}

# Step 2: Stage any pending changes
git add -A

# Step 3: Pull remote changes (incorporates any API recipe commits) then push
Write-Host "Pulling remote changes..."
git pull --rebase

Write-Host "Pushing..."
git push

Write-Host "Done! Recipe data on GitHub is preserved."
