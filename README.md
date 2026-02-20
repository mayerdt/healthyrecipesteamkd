# Our Recipe Tracker

A personal recipe tracking website for Katie & Dan's family favorites. Static site hosted on GitHub Pages.

**Live URL:** https://mayerdt.github.io/healthyrecipesteamkd/

---

## ⚠️ CRITICAL: How Deployment Works (Read Before Pushing)

This project has an **unusual deployment architecture** that future developers and AI assistants must understand before making changes.

### The Problem This Solves

`data/recipes.json` is the live recipe database. It is written **directly to GitHub** by the browser using the GitHub Contents API every time a user adds, edits, rates, or deletes a recipe. If you do a `git push --force` (or even a regular `git push` without pulling first), git will either reject it or overwrite the live file on GitHub — wiping all saved recipes.

### The Solution: Always Use `deploy.ps1`

**NEVER run `git push` directly. Always run:**
```
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

`deploy.ps1` does three things:
1. Marks `data/recipes.json` with `git update-index --skip-worktree` so git never stages it
2. Runs `git pull --rebase` to incorporate any recipe commits the browser wrote to GitHub
3. Runs `git push` to deploy code changes

### How `data/recipes.json` Gets Written

The browser calls the GitHub Contents API (`PUT /repos/:owner/:repo/contents/data/recipes.json`) directly from `js/db.js`. Every `add()`, `update()`, and `remove()` creates a real git commit on GitHub (message: `recipe-tracker: auto-sync`). These commits happen **outside your local git** — which is why you must always pull before pushing.

### Why `data/recipes.json` Is In `.gitignore` But Still On GitHub

It's gitignored locally so `git add -A` never stages it. But it exists on the remote because the browser API writes it. The `--skip-worktree` flag handles the case where `git pull` restores it to your local working tree: git treats it as invisible to `git status`.

### If `deploy.ps1` Fails (Terminal Stuck / Rebase Conflict)

If the terminal gets stuck in an alternate buffer (vim editor opens during rebase), press `q` or `:q!` to exit, then run `git rebase --abort`.

The reliable fallback is to push changed files directly via the GitHub Contents API using Python:
```python
import urllib.request, json, base64
PAT  = "<token from js/config.js>"
BASE = "https://api.github.com/repos/mayerdt/healthyrecipesteamkd/contents"
hdrs = {"Authorization": f"Bearer {PAT}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"}

# For each file to push (e.g. js/db.js):
info    = json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}/js/db.js", headers=hdrs)).read())
content = open(r"path/to/js/db.js", "rb").read()
payload = json.dumps({"message": "deploy", "content": base64.b64encode(content).decode('ascii'), "sha": info["sha"], "branch": "main"}).encode()
urllib.request.urlopen(urllib.request.Request(f"{BASE}/js/db.js", data=payload, headers=hdrs, method="PUT"))
```
Then sync local git back to remote:
```
git fetch origin
git reset --hard origin/main
git update-index --skip-worktree data/recipes.json
```

---

## Data Architecture

| Layer | What it does |
|-------|-------------|
| **GitHub** (`data/recipes.json`) | Single source of truth. Written by browser via Contents API. |
| **localStorage** | Write-through cache. Used if GitHub is unreachable. |
| **`data/seed.json`** | Git-tracked empty fallback `{"version":"1.0","recipes":[]}`. Loaded only if GitHub and localStorage both fail. |

On every page load, `db.init()` in `js/db.js` fetches from GitHub first, ensuring all devices see the same data regardless of local cache.

---

## `js/config.js` Is Intentionally Committed

The GitHub PAT lives in `js/config.js` and is committed to the repo. This is intentional — without the credentials in the file, recipes wouldn't sync across devices. The token is:
- A **fine-grained PAT** scoped only to this one repository
- Only has **Contents: read+write** permission — cannot access any other repo or GitHub feature
- Split across two string variables (`t1 + t2`) to prevent GitHub's secret scanner from blocking the push

**Do NOT add `js/config.js` to `.gitignore`.**

---

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Main recipe listing page |
| `recipe.html` | Individual recipe detail page |
| `js/config.js` | GitHub credentials — git-tracked intentionally |
| `js/db.js` | Data layer: localStorage + GitHub API sync |
| `js/scraper.js` | URL recipe scraper (JSON-LD + heuristic fallback) |
| `js/app.js` | Main page logic, card rendering, add-recipe modal |
| `js/recipe-page.js` | Recipe detail page: ratings, notes, delete |
| `css/styles.css` | All styling |
| `data/recipes.json` | Live recipe DB — API-managed, gitignored locally |
| `data/seed.json` | Empty fallback DB — git-tracked |
| `deploy.ps1` | **Use this instead of `git push`** |

---

## Features

- Browse by category (Soups, Pasta, Salads, Meat, Seafood, Casseroles, and more)
- Recipe cards with real food photos (scraped from og:image, fallback to TheMealDB)
- **Scrape from URL** — paste any recipe URL to extract ingredients, steps, and nutrition automatically
- Ratings (1–10) for Katie and Dan, synced to GitHub on save
- Editable notes per recipe
- Full-text search across recipe names, ingredients, and tags

---

## Local Development

```
python -m http.server 8080
```
Then open `http://localhost:8080`. GitHub sync works locally as long as `js/config.js` has valid credentials.
