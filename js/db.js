/**
 * db.js — Recipe Data Management Layer
 * Handles localStorage CRUD + optional GitHub API sync
 */

const DB_KEY = 'healthyrecipes_db';
const SETTINGS_KEY = 'healthyrecipes_settings';

// ── Default Settings ──────────────────────────────────────────
const DEFAULT_SETTINGS = {
  githubToken: '',
  githubOwner: '',
  githubRepo: '',
  githubBranch: 'main',
};

// ── Category Definitions ──────────────────────────────────────
const CATEGORIES = {
  soups:       { label: 'Soups & Stews',        emoji: '🍜', color: '#FF6B6B' },
  pasta:       { label: 'Pasta & Noodles',       emoji: '🍝', color: '#FFA94D' },
  salads:      { label: 'Salads',                emoji: '🥗', color: '#51CF66' },
  meat:        { label: 'Meat & Poultry',        emoji: '🍖', color: '#E64980' },
  seafood:     { label: 'Seafood',               emoji: '🐟', color: '#339AF0' },
  vegetables:  { label: 'Vegetables & Sides',    emoji: '🥦', color: '#40C057' },
  casseroles:  { label: 'Casseroles & Bakes',    emoji: '🥘', color: '#CC5DE8' },
  mexican:     { label: 'Mexican & Tex-Mex',     emoji: '🌮', color: '#FF6B35' },
  asian:       { label: 'Asian Cuisine',         emoji: '🍱', color: '#F03E3E' },
  breakfast:   { label: 'Breakfast & Brunch',    emoji: '🥐', color: '#F59F00' },
  pizza:       { label: 'Pizza & Flatbreads',    emoji: '🍕', color: '#D9480F' },
  desserts:    { label: 'Desserts & Sweets',     emoji: '🎂', color: '#AE3EC9' },
};

// ── RecipeDB Class ────────────────────────────────────────────
class RecipeDB {
  constructor() {
    this._data = null;
  }

  /** Load recipes — always from GitHub API first when credentials exist so all devices stay in sync */
  async init() {
    const s = getSettings();

    // 1) If GitHub is configured, fetch the canonical copy directly via API.
    //    This bypasses any CDN/localStorage cache so every device always gets
    //    the same data regardless of what's stored locally.
    if (s.githubToken && s.githubOwner && s.githubRepo) {
      try {
        const content = await this._ghReadFile(s, 'data/recipes.json');
        if (content) {
          this._data = JSON.parse(content);
          this._persist(); // keep localStorage in sync as a write-through cache
          return;
        }
      } catch (e) {
        console.warn('[db] GitHub fetch failed, falling back to localStorage:', e.message);
      }
    }

    // 2) Fall back to localStorage cache (works offline or before GitHub is set up)
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        this._data = JSON.parse(raw);
        return;
      } catch (e) {
        console.warn('DB parse error, reloading seed data', e);
      }
    }

    // 3) Last resort: load the static seed file bundled with the app
    await this._loadSeed();
  }

  async _loadSeed() {
    try {
      const resp = await fetch('data/recipes.json');
      const json = await resp.json();
      this._data = { recipes: json.recipes || [], version: json.version };
      this._persist();
    } catch (e) {
      console.error('Failed to load seed data', e);
      this._data = { recipes: [], version: '1.0' };
    }
  }

  _persist() {
    localStorage.setItem(DB_KEY, JSON.stringify(this._data));
  }

  /** Get all recipes */
  getAll() {
    return (this._data?.recipes || []).slice();
  }

  /** Get by ID */
  getById(id) {
    return this._data?.recipes?.find(r => r.id === id) || null;
  }

  /** Get recipes for a category */
  getByCategory(cat) {
    return this.getAll().filter(r => r.category === cat);
  }

  /** Search across name, tags, ingredients */
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();
    return this.getAll().filter(r => {
      return (
        r.name.toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        (r.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (r.ingredients || []).some(i => i.toLowerCase().includes(q)) ||
        (CATEGORIES[r.category]?.label || '').toLowerCase().includes(q)
      );
    });
  }

  /** Add a new recipe */
  async add(recipe) {
    if (!recipe.id) recipe.id = this._genId();
    recipe.dateAdded = recipe.dateAdded || new Date().toISOString().slice(0, 10);
    this._data.recipes.push(recipe);
    this._persist();
    await this._syncToGitHub();
    return recipe;
  }

  /** Update an existing recipe */
  async update(id, updates) {
    const idx = this._data.recipes.findIndex(r => r.id === id);
    if (idx === -1) return null;
    this._data.recipes[idx] = { ...this._data.recipes[idx], ...updates, lastModified: new Date().toISOString().slice(0, 10) };
    this._persist();
    await this._syncToGitHub();
    return this._data.recipes[idx];
  }

  /** Save notes for a recipe (quick path, no GitHub sync) */
  saveNote(id, notes) {
    const idx = this._data.recipes.findIndex(r => r.id === id);
    if (idx === -1) return;
    this._data.recipes[idx].notes = notes;
    this._data.recipes[idx].lastModified = new Date().toISOString().slice(0, 10);
    this._persist();
    // Async GitHub sync – fire and forget for notes
    this._syncToGitHub().catch(() => {});
  }

  /** Delete a recipe */
  async remove(id) {
    this._data.recipes = this._data.recipes.filter(r => r.id !== id);
    this._persist();
    await this._syncToGitHub();
  }

  /** Export all data as JSON string */
  exportJSON() {
    return JSON.stringify(this._data, null, 2);
  }

  /** Import from JSON string (merges by ID, adds new) */
  importJSON(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      const incoming = Array.isArray(imported) ? imported : (imported.recipes || []);
      const existing = new Map(this._data.recipes.map(r => [r.id, r]));
      incoming.forEach(r => existing.set(r.id, r));
      this._data.recipes = Array.from(existing.values());
      this._persist();
      return { success: true, count: incoming.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** Statistics */
  stats() {
    const recipes = this.getAll();
    const catCounts = {};
    recipes.forEach(r => { catCounts[r.category] = (catCounts[r.category] || 0) + 1; });
    return {
      total: recipes.length,
      categories: Object.keys(catCounts).length,
      withNotes: recipes.filter(r => r.notes && r.notes.trim()).length,
      catCounts,
    };
  }

  _genId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ── GitHub Sync ─────────────────────────────────────────────

  /** Fetch a file's decoded text content from the GitHub API */
  async _ghReadFile(s, path) {
    const url = `https://api.github.com/repos/${s.githubOwner}/${s.githubRepo}/contents/${path}?ref=${s.githubBranch || 'main'}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${s.githubToken}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return decodeURIComponent(escape(atob(d.content.replace(/\n/g, ''))));
  }

  async _syncToGitHub() {
    const s = getSettings();
    if (!s.githubToken || !s.githubOwner || !s.githubRepo) return;
    try {
      await this._ghUpdateFile(s, 'data/recipes.json', JSON.stringify(this._data, null, 2));
    } catch (e) {
      console.warn('GitHub sync failed:', e.message);
    }
  }

  async _ghUpdateFile(s, path, content) {
    const url = `https://api.github.com/repos/${s.githubOwner}/${s.githubRepo}/contents/${path}`;
    const headers = {
      'Authorization': `Bearer ${s.githubToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    // Get current SHA
    let sha;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) { const d = await res.json(); sha = d.sha; }
    } catch (_) {}

    const body = {
      message: `recipe-tracker: auto-sync ${new Date().toISOString().slice(0,10)}`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: s.githubBranch || 'main',
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  /** Save a scraped recipe as its own HTML page in GitHub */
  async saveRecipePage(recipe) {
    const s = getSettings();
    if (!s.githubToken || !s.githubOwner || !s.githubRepo) return false;
    try {
      const html = generateRecipePageHTML(recipe);
      await this._ghUpdateFile(s, `recipes/${recipe.id}.html`, html);
      return true;
    } catch (e) {
      console.warn('Failed to save recipe page to GitHub:', e.message);
      return false;
    }
  }
}

// ── Settings ─────────────────────────────────────────────────
function getSettings() {
  // Priority: localStorage (manual override) > SITE_CONFIG (baked-in) > DEFAULT_SETTINGS
  const siteDefaults = (typeof SITE_CONFIG !== 'undefined') ? SITE_CONFIG : {};
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    // Only use a stored value if it's non-empty, so SITE_CONFIG wins over empty strings
    const merged = { ...DEFAULT_SETTINGS, ...siteDefaults };
    for (const [k, v] of Object.entries(stored)) {
      if (v !== '' && v != null) merged[k] = v;
    }
    return merged;
  } catch (_) { return { ...DEFAULT_SETTINGS, ...siteDefaults }; }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getSettings(), ...settings }));
}

// ── Generate standalone recipe HTML page ─────────────────────
function generateRecipePageHTML(recipe) {
  const cat = CATEGORIES[recipe.category] || { label: recipe.category, emoji: '🍽️' };
  const ingredientItems = (recipe.ingredients || []).map(i =>
    i.trim() === '' ? `<li class="ingredient-separator-plain"></li>` : `<li>• ${escHtml(i)}</li>`
  ).join('\n');
  const stepItems = (recipe.steps || []).map((s, i) =>
    `<li><span class="step-n">${i + 1}</span>${escHtml(s)}</li>`
  ).join('\n');
  const nut = recipe.nutrition || {};
  const nutritionRows = Object.entries(nut).filter(([k]) => k !== 'calories').map(([k, v]) =>
    `<tr><td>${escHtml(toTitleCase(k))}</td><td>${escHtml(String(v))}</td></tr>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(recipe.name)} — Recipe</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px 20px 60px; color: #1a1a1a; background: #fafaf7; }
  .back { display: inline-block; margin-bottom: 20px; color: #FF6B35; font-weight: 600; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  h1 { font-family: Georgia, serif; font-size: 2.2rem; margin-bottom: 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; font-size: 0.88rem; color: #666; }
  .meta span { background: #f0ede8; border-radius: 99px; padding: 4px 12px; font-weight: 600; }
  .meta .cal { background: linear-gradient(135deg,#FF6B35,#FF8C5A); color: white; }
  h2 { font-family: Georgia, serif; font-size: 1.4rem; border-bottom: 2px solid #FF6B35; padding-bottom: 6px; margin: 32px 0 16px; }
  ul.ingredients { padding: 0; list-style: none; }
  ul.ingredients li { padding: 8px 0; border-bottom: 1px solid #f0ede8; font-size: 0.97rem; }
  ul.ingredients li:last-child { border: none; }
  .ingredient-separator-plain { padding: 0 !important; border: none !important; height: 8px !important; }
  ol.steps { padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 18px; }
  ol.steps li { display: flex; gap: 16px; align-items: flex-start; }
  .step-n { min-width: 32px; height: 32px; background: #FF6B35; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; margin-top: 2px; }
  table.nut { border-collapse: collapse; width: 100%; max-width: 400px; }
  table.nut td { padding: 7px 12px; border: 1px solid #e8e5df; font-size: 0.88rem; }
  table.nut tr:nth-child(odd) td { background: #fafaf7; }
  .notes-box { background: #fffbe6; border: 1.5px solid #ffd43b; border-radius: 10px; padding: 16px 20px; margin-top: 12px; font-size: 0.94rem; line-height: 1.7; white-space: pre-wrap; }
  .source { margin-top: 8px; font-size: 0.82rem; color: #999; }
  .source a { color: #FF6B35; }
  .generated { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e8e5df; font-size: 0.75rem; color: #bbb; }
</style>
</head>
<body>
<a class="back" href="../index.html">← Back to Team KD's Recipes</a>
<p style="font-size:0.8rem;color:#999;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:8px">${cat.emoji} ${escHtml(cat.label)}</p>
<h1>${recipe.emoji || '🍽️'} ${escHtml(recipe.name)}</h1>
<div class="meta">
  <span class="cal">🔥 ${recipe.calories} cal / serving</span>
  ${recipe.servings ? `<span>👥 ${recipe.servings} servings</span>` : ''}
  ${recipe.prepTime ? `<span>⏱ Prep: ${escHtml(recipe.prepTime)}</span>` : ''}
  ${recipe.cookTime ? `<span>🍳 Cook: ${escHtml(recipe.cookTime)}</span>` : ''}
  ${(recipe.tags || []).map(t => `<span>${escHtml(t)}</span>`).join('')}
</div>
${recipe.source ? `<p class="source">Original source: <a href="${escHtml(recipe.source)}" target="_blank" rel="noopener">${escHtml(recipe.source)}</a></p>` : ''}

<h2>📋 Ingredients</h2>
<ul class="ingredients">
${ingredientItems}
</ul>

<h2>👨‍🍳 Instructions</h2>
<ol class="steps">
${stepItems}
</ol>

${Object.keys(nut).length > 0 ? `
<h2>📊 Nutrition Facts <small style="font-size:0.7em;font-weight:400;color:#888">(per serving)</small></h2>
<table class="nut">
<tr><td><strong>Calories</strong></td><td><strong>${nut.calories || recipe.calories}</strong></td></tr>
${nutritionRows}
</table>` : ''}

${recipe.notes ? `
<h2>📝 Notes</h2>
<div class="notes-box">${escHtml(recipe.notes)}</div>` : ''}

<p class="generated">Team KD's Recipes — saved ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toTitleCase(str) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

// ── Singleton export ──────────────────────────────────────────
const recipeDB = new RecipeDB();
