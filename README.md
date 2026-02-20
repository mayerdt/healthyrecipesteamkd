#  Our Recipe Tracker

A beautiful, personal recipe tracking website for family favorites. Static site that works on GitHub Pages.

##  Features

- Browse by category (Soups, Pasta, Salads, Meat, Seafood, Asian, Mexican, Breakfast, and more)
- Recipe cards with emoji icon, calories per serving, cook time, and tags
- **Scrape from URL**  paste any recipe URL to extract ingredients, steps, and nutrition automatically
- Editable notes per recipe with instant save
- Full-text search across recipe names, ingredients, and tags
- Optional GitHub Sync  auto-saves recipe data and creates individual recipe pages in this repo
- Export / Import JSON backups

##  Setup

1. Enable **GitHub Pages** (Settings  Pages  Branch: main  / root)
2. Visit `https://<your-username>.github.io/healthyrecipesteamkd`

Or run locally: `python -m http.server 8080` then open `http://localhost:8080`

##  GitHub Sync (Optional)

1. Create a Personal Access Token with `repo` scope at github.com/settings/tokens
2. Click  in the app  enter your GitHub username, repo name, and token
3. Every recipe add/update will auto-save `data/recipes.json` and create individual recipe pages

##  Structure

- `index.html`  Main recipe listing page
- `recipe.html`  Individual recipe detail page
- `data/recipes.json`  Recipe database (seed + auto-updated)
- `recipes/`  Auto-generated per-recipe HTML pages
- `css/styles.css`  All styling
- `js/db.js`  Data layer (localStorage + GitHub API)
- `js/scraper.js`  URL recipe scraper (JSON-LD + heuristic)
- `js/app.js`  Main page logic
- `js/recipe-page.js`  Recipe detail page logic
