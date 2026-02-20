/**
 * app.js — Main Page Application Logic
 * Renders categories, recipe cards, search/filter, add-recipe modal
 */

// ── State ─────────────────────────────────────────────────────
let currentFilter = 'all';
let currentSearch = '';
let addModalTab   = 'url';
let pendingRecipe = null;   // recipe being previewed before save

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await recipeDB.init();
  renderStats();
  renderCategoryBar();
  renderRecipes();
  bindEvents();
});

// ── Render ────────────────────────────────────────────────────
function renderStats() {
  const s = recipeDB.stats();
  document.getElementById('stat-total').textContent   = s.total;
  document.getElementById('stat-cats').textContent    = s.categories;
  document.getElementById('stat-notes').textContent   = s.withNotes;
}

function renderCategoryBar() {
  const s      = recipeDB.stats();
  const counts = s.catCounts;
  const inner  = document.getElementById('cat-bar-inner');

  // Build pills — only show categories that have recipes + "All"
  const all = document.createElement('button');
  all.className = `cat-pill${currentFilter === 'all' ? ' active' : ''}`;
  all.dataset.cat = 'all';
  all.innerHTML = `✨ All<span class="cat-count">${s.total}</span>`;
  inner.innerHTML = '';
  inner.appendChild(all);

  for (const [key, info] of Object.entries(CATEGORIES)) {
    const count = counts[key] || 0;
    if (count === 0) continue;
    const btn = document.createElement('button');
    btn.className = `cat-pill${currentFilter === key ? ' active' : ''}`;
    btn.dataset.cat = key;
    btn.innerHTML = `<span class="cat-emoji">${info.emoji}</span>${info.label}<span class="cat-count">${count}</span>`;
    inner.appendChild(btn);
  }
}

function renderRecipes() {
  const container = document.getElementById('recipes-container');
  let recipes = currentSearch
    ? recipeDB.search(currentSearch)
    : recipeDB.getAll();

  if (currentFilter !== 'all') {
    recipes = recipes.filter(r => r.category === currentFilter);
  }

  container.innerHTML = '';

  if (recipes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${currentSearch ? '🔍' : '🍽️'}</div>
        <h3>${currentSearch ? 'No recipes found' : 'No recipes yet'}</h3>
        <p>${currentSearch ? `No recipes match "${escHtml(currentSearch)}"` : 'Add your first recipe using the + button below!'}</p>
        ${!currentSearch ? `<button class="btn btn-primary" onclick="openAddModal()">➕ Add Recipe</button>` : ''}
      </div>`;
    return;
  }

  if (currentFilter !== 'all') {
    // Single-category view
    const cat = CATEGORIES[currentFilter];
    const section = buildCategorySection(currentFilter, cat, recipes);
    container.appendChild(section);
  } else {
    // Group by category
    const grouped = {};
    recipes.forEach(r => {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r);
    });
    // Preserve category order
    for (const key of Object.keys(CATEGORIES)) {
      if (!grouped[key] || grouped[key].length === 0) continue;
      const section = buildCategorySection(key, CATEGORIES[key], grouped[key]);
      container.appendChild(section);
    }
    // Unknown categories
    for (const [key, list] of Object.entries(grouped)) {
      if (CATEGORIES[key]) continue;
      const section = buildCategorySection(key, { label: key, emoji: '🍽️', color: '#888' }, list);
      container.appendChild(section);
    }
  }
}

function buildCategorySection(key, info, recipes) {
  const section = document.createElement('section');
  section.className = 'category-section';
  section.id = `cat-${key}`;
  section.style.setProperty('--cat-color', info.color);

  section.innerHTML = `
    <div class="section-header">
      <div class="section-emoji">${info.emoji}</div>
      <div class="section-title-group">
        <h2>${info.label}</h2>
        <div class="section-count">${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="section-accent"></div>
    </div>
    <div class="recipe-grid" id="grid-${key}"></div>`;

  const grid = section.querySelector(`#grid-${key}`);
  recipes.forEach(recipe => grid.appendChild(buildRecipeCard(recipe)));
  return section;
}

function buildRecipeCard(recipe) {
  const cat  = CATEGORIES[recipe.category] || { label: recipe.category, emoji: '🍽️', color: '#888' };
  const card = document.createElement('article');
  card.className = 'recipe-card';
  card.style.setProperty('--card-color-bg', hexToRgba(cat.color, 0.12));
  card.style.setProperty('--badge-bg', hexToRgba(cat.color, 0.12));
  card.style.setProperty('--badge-color', cat.color);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View ${recipe.name}`);

  const hasNotes = recipe.notes && recipe.notes.trim();
  const timeStr  = recipe.totalTime || recipe.cookTime || '';

  card.innerHTML = `
    <div class="card-emoji-wrap">
      <span class="card-emoji">${recipe.emoji || cat.emoji}</span>
      <div class="card-badges">
        ${hasNotes ? `<span class="badge-notes">📝 Notes</span>` : ''}
      </div>
    </div>
    <div class="card-body">
      <div class="card-name">${highlightText(recipe.name, currentSearch)}</div>
      <div class="card-meta">
        <span class="card-cat-badge">${cat.emoji} ${cat.label}</span>
      </div>
      <div class="card-info-row">
        <span class="cal-badge"><span class="flame">🔥</span> ${recipe.calories} cal</span>
        ${timeStr ? `<span class="time-badge">⏱ ${timeStr}</span>` : ''}
      </div>
      ${recipe.tags && recipe.tags.length ? `
      <div class="tags-row">
        ${recipe.tags.slice(0, 3).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
      </div>` : ''}
      ${buildCardRatings(recipe.ratings)}
    </div>`;

  const goToRecipe = () => {
    window.location.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;
  };
  card.addEventListener('click', goToRecipe);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') goToRecipe(); });
  return card;
}

// ── Event Bindings ────────────────────────────────────────────
function bindEvents() {
  // Search
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', debounce(e => {
    currentSearch = e.target.value.trim();
    renderCategoryBar();
    renderRecipes();
  }, 250));

  // Category filter
  document.getElementById('cat-bar-inner').addEventListener('click', e => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    currentFilter = pill.dataset.cat;
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    renderRecipes();
  });

  // FAB / Add Recipe buttons
  document.getElementById('fab-add').addEventListener('click', openAddModal);
  document.getElementById('btn-add-header').addEventListener('click', openAddModal);

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);

  // Modal close buttons
  document.getElementById('add-modal-close').addEventListener('click', closeAddModal);
  document.getElementById('settings-modal-close').addEventListener('click', closeSettings);

  // Close modals on overlay click
  document.getElementById('add-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddModal();
  });
  document.getElementById('settings-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSettings();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAddModal(); closeSettings(); }
  });

  // Add modal tabs
  document.querySelectorAll('.modal-tab').forEach(btn => {
    btn.addEventListener('click', () => switchAddTab(btn.dataset.tab));
  });

  // Fetch recipe from URL
  document.getElementById('btn-fetch-recipe').addEventListener('click', fetchRecipeFromURL);
  document.getElementById('recipe-url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') fetchRecipeFromURL();
  });

  // Confirm add recipe
  document.getElementById('btn-confirm-add').addEventListener('click', confirmAddRecipe);

  // Save settings
  document.getElementById('btn-save-settings').addEventListener('click', saveSettingsForm);

  // Export / Import
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', importData);

  // Reset seed data
  document.getElementById('btn-reset-data').addEventListener('click', resetData);
}

// ── Add Recipe Modal ─────────────────────────────────────────
function openAddModal() {
  document.getElementById('add-modal-overlay').classList.add('active');
  document.getElementById('recipe-url-input').focus();
  pendingRecipe = null;
  resetAddForm();
}

function closeAddModal() {
  document.getElementById('add-modal-overlay').classList.remove('active');
  pendingRecipe = null;
  resetAddForm();
}

function resetAddForm() {
  document.getElementById('recipe-url-input').value = '';
  document.getElementById('scrape-status').className = 'scrape-status hidden';
  document.getElementById('recipe-preview-section').classList.add('hidden');
  document.getElementById('manual-form-section').classList.add('hidden');
  document.getElementById('btn-confirm-add').classList.add('hidden');
  clearManualForm();
}

function switchAddTab(tab) {
  addModalTab = tab;
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-url').classList.toggle('hidden', tab !== 'url');
  document.getElementById('tab-manual').classList.toggle('hidden', tab !== 'manual');

  if (tab === 'manual') {
    document.getElementById('manual-form-section').classList.remove('hidden');
    document.getElementById('btn-confirm-add').classList.remove('hidden');
    document.getElementById('recipe-preview-section').classList.add('hidden');
  } else {
    document.getElementById('manual-form-section').classList.add('hidden');
  }
}

async function fetchRecipeFromURL() {
  const url = document.getElementById('recipe-url-input').value.trim();
  if (!url) { showToast('Please enter a URL', 'error'); return; }

  // Validate URL
  try { new URL(url); } catch (_) { showToast('Please enter a valid URL', 'error'); return; }

  setFetchBtn(true);
  showScrapeStatus('loading', '⏳ Fetching recipe...');
  document.getElementById('recipe-preview-section').classList.add('hidden');
  document.getElementById('btn-confirm-add').classList.add('hidden');
  pendingRecipe = null;

  try {
    const recipe = await scraper.scrape(url);
    pendingRecipe = recipe;

    if (recipe._scrapeOk) {
      showScrapeStatus('success', '✅ Recipe found! Review the details below and save.');
      renderRecipePreview(recipe);
      document.getElementById('recipe-preview-section').classList.remove('hidden');
    } else {
      showScrapeStatus('warning',
        "⚠️ Couldn't auto-fill from this site — we've pre-filled what we could. " +
        "Complete the details below and we'll link out to the original recipe."
      );
    }

    document.getElementById('manual-form-section').classList.remove('hidden');
    document.getElementById('btn-confirm-add').classList.remove('hidden');
    populateManualForm(recipe);
  } catch (err) {
    // Safety net — scraper.scrape() should never throw, but just in case
    showScrapeStatus('warning',
      "⚠️ Couldn't reach that site. Fill in the details below and we'll link out."
    );
    document.getElementById('manual-form-section').classList.remove('hidden');
    document.getElementById('btn-confirm-add').classList.remove('hidden');
    document.getElementById('man-source').value = url;
    const guessedName = url.split('/').filter(Boolean).pop()
      ?.replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase()) || '';
    document.getElementById('man-name').value = guessedName;
  } finally {
    setFetchBtn(false);
  }
}

function setFetchBtn(loading) {
  const btn = document.getElementById('btn-fetch-recipe');
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span class="spin">⏳</span> Fetching...'
    : '🔍 Fetch Recipe';
}

function showScrapeStatus(type, msg) {
  const el = document.getElementById('scrape-status');
  el.className = `scrape-status ${type}`;
  el.textContent = msg;
}

function renderRecipePreview(recipe) {
  const el = document.getElementById('recipe-preview');
  const cat = CATEGORIES[recipe.category] || { label: recipe.category, emoji: '🍽️' };
  el.innerHTML = `
    <div class="preview-header">
      <span class="preview-emoji">${recipe.emoji || cat.emoji}</span>
      <div>
        <h4>${escHtml(recipe.name || 'Untitled Recipe')}</h4>
        <div class="preview-badges">
          <span class="card-cat-badge" style="background:${hexToRgba(cat.color||'#888',0.12)};color:${cat.color||'#888'}">${cat.emoji} ${cat.label}</span>
          ${recipe.calories ? `<span class="cal-badge">🔥 ${recipe.calories} cal</span>` : ''}
        </div>
      </div>
    </div>
    <div class="preview-meta">
      <strong>Ingredients found:</strong> ${recipe.ingredients.length}<br>
      <strong>Steps found:</strong> ${recipe.steps.length}<br>
      ${recipe.servings ? `<strong>Servings:</strong> ${recipe.servings}<br>` : ''}
      ${recipe.totalTime ? `<strong>Total time:</strong> ${recipe.totalTime}<br>` : ''}
    </div>`;
}

function populateManualForm(recipe) {
  safeSet('man-name', recipe.name || '');
  safeSet('man-category', recipe.category || 'meat');
  safeSet('man-calories', recipe.calories || '');
  safeSet('man-servings', recipe.servings || '');
  safeSet('man-prep', recipe.prepTime || '');
  safeSet('man-cook', recipe.cookTime || '');
  safeSet('man-emoji', recipe.emoji || '');
  safeSet('man-source', recipe.source || '');
  safeSet('man-ingredients', (recipe.ingredients || []).join('\n'));
  safeSet('man-steps', (recipe.steps || []).join('\n\n'));
  const tags = (recipe.tags || []).join(', ');
  safeSet('man-tags', tags);
}

function clearManualForm() {
  ['man-name','man-category','man-calories','man-servings','man-prep','man-cook',
   'man-emoji','man-source','man-ingredients','man-steps','man-tags','man-notes'].forEach(id => safeSet(id, ''));
}

async function confirmAddRecipe() {
  const name = (document.getElementById('man-name').value || '').trim();
  if (!name) { showToast('Recipe name is required', 'error'); return; }

  const ingredientsRaw = (document.getElementById('man-ingredients').value || '').trim();
  const stepsRaw       = (document.getElementById('man-steps').value || '').trim();
  const tagsRaw        = (document.getElementById('man-tags').value || '').trim();

  const recipe = {
    name,
    category:    document.getElementById('man-category').value || 'meat',
    calories:    parseInt(document.getElementById('man-calories').value) || 0,
    servings:    parseInt(document.getElementById('man-servings').value) || 4,
    prepTime:    (document.getElementById('man-prep').value || '').trim(),
    cookTime:    (document.getElementById('man-cook').value || '').trim(),
    totalTime:   '',
    emoji:       (document.getElementById('man-emoji').value || '').trim(),
    source:      (document.getElementById('man-source').value || '').trim(),
    notes:       (document.getElementById('man-notes').value || '').trim(),
    ingredients: ingredientsRaw ? ingredientsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [],
    steps:       stepsRaw ? stepsRaw.split(/\n{2,}|\n(?=\d+[\.\)]\s)/).map(s => s.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean) : [],
    tags:        tagsRaw ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    nutrition:   pendingRecipe?.nutrition || {},
  };

  if (!recipe.emoji) {
    recipe.emoji = (CATEGORIES[recipe.category] || { emoji: '🍽️' }).emoji;
  }

  const btn = document.getElementById('btn-confirm-add');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const saved = await recipeDB.add(recipe);

    closeAddModal();
    renderStats();
    renderCategoryBar();
    renderRecipes();

    // Scroll to new recipe
    setTimeout(() => {
      const section = document.getElementById(`cat-${saved.category}`);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    if (saved._syncOk) {
      showToast(`✅ "${saved.name}" added & synced to GitHub!`, 'success');
    } else {
      showToast(`✅ "${saved.name}" added locally — ⚠️ GitHub sync failed: ${saved._syncError}`, 'warning');
    }
  } catch (e) {
    showToast('Error saving recipe: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save Recipe';
  }
}

// ── Settings Modal ────────────────────────────────────────────
function openSettings() {
  const s = getSettings();
  safeSet('set-token', s.githubToken);
  safeSet('set-owner', s.githubOwner);
  safeSet('set-repo', s.githubRepo);
  safeSet('set-branch', s.githubBranch || 'main');
  document.getElementById('settings-modal-overlay').classList.add('active');
}

function closeSettings() {
  document.getElementById('settings-modal-overlay').classList.remove('active');
}

function saveSettingsForm() {
  saveSettings({
    githubToken:  (document.getElementById('set-token').value || '').trim(),
    githubOwner:  (document.getElementById('set-owner').value || '').trim(),
    githubRepo:   (document.getElementById('set-repo').value || '').trim(),
    githubBranch: (document.getElementById('set-branch').value || 'main').trim(),
  });
  showToast('Settings saved!', 'success');
  closeSettings();
}

// ── Export / Import ───────────────────────────────────────────
function exportData() {
  const json = recipeDB.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `recipes-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Data exported!', 'success');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const result = recipeDB.importJSON(evt.target.result);
    if (result.success) {
      renderStats();
      renderCategoryBar();
      renderRecipes();
      showToast(`✅ Imported ${result.count} recipes!`, 'success');
    } else {
      showToast('Import failed: ' + result.error, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetData() {
  if (!confirm('This will reset all recipes to the original seed data. Your added recipes and notes will be lost. Continue?')) return;
  localStorage.removeItem('healthyrecipes_db');
  recipeDB.init().then(() => {
    renderStats();
    renderCategoryBar();
    renderRecipes();
    closeSettings();
    showToast('Data reset to original recipes', 'info');
  });
}

// ── Toast Notifications ───────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ── Utilities ─────────────────────────────────────────────────
function highlightText(text, query) {
  if (!query) return escHtml(text);
  const safe = escHtml(text);
  const re = new RegExp(`(${escRegex(query)})`, 'gi');
  return safe.replace(re, '<mark>$1</mark>');
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function safeSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)},${alpha})`;
}

function buildCardRatings(ratings) {
  if (!ratings) return '';
  const parts = [];
  if (ratings.katie != null) parts.push(`<span class="card-rating-pill">💕 <span class="r-person">Katie</span>&nbsp;${ratings.katie}/10</span>`);
  if (ratings.dan   != null) parts.push(`<span class="card-rating-pill">🧔 <span class="r-person">Dan</span>&nbsp;${ratings.dan}/10</span>`);
  if (!parts.length) return '';
  return `<div class="card-ratings">${parts.join('')}</div>`;
}
