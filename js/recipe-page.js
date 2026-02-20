/**
 * recipe-page.js — Recipe Detail Page Logic
 * Renders ingredients, steps, nutrition, and editable notes
 */

let currentRecipe = null;
let checkedIngredients = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await recipeDB.init();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) { redirectHome(); return; }

  currentRecipe = recipeDB.getById(id);
  if (!currentRecipe) { redirectHome(); return; }

  renderRecipePage(currentRecipe);
  bindPageEvents();
});

function redirectHome() {
  window.location.href = 'index.html';
}

// ── Main Render ───────────────────────────────────────────────
function renderRecipePage(recipe) {
  const cat = CATEGORIES[recipe.category] || { label: recipe.category, emoji: '🍽️', color: '#888' };
  document.title = `${recipe.name} — Team KD's Recipes`;

  // Hero
  const visualWrap = document.getElementById('hero-visual');
  if (recipe.thumbnail) {
    visualWrap.innerHTML = `<img class="recipe-hero-img" src="${recipe.thumbnail}" alt="${recipe.name}"
      onerror="this.outerHTML='<span class=\'recipe-hero-emoji\'>${recipe.emoji || cat.emoji}</span>'">`;
  } else {
    document.getElementById('hero-emoji').textContent = recipe.emoji || cat.emoji;
  }
  document.getElementById('hero-category').textContent   = `${cat.emoji} ${cat.label}`;
  document.getElementById('hero-title').textContent      = recipe.name;

  // Stats row
  buildStatsRow(recipe);

  // Tags
  buildTagsRow(recipe.tags || []);

  // Source link
  const srcEl = document.getElementById('hero-source');
  if (recipe.source) {
    srcEl.href = recipe.source;
    srcEl.classList.remove('hidden');
  } else {
    srcEl.classList.add('hidden');
  }

  // GitHub page link
  const ghEl = document.getElementById('hero-gh-link');
  const settings = getSettings();
  if (settings.githubOwner && settings.githubRepo) {
    const ghUrl = `https://${settings.githubOwner}.github.io/${settings.githubRepo}/recipes/${recipe.id}.html`;
    ghEl.href = ghUrl;
    ghEl.classList.remove('hidden');
  } else {
    ghEl.classList.add('hidden');
  }

  // Ingredients + Steps — or link-out banner if this is a link-only recipe
  const isLinkOut = (!recipe.ingredients || recipe.ingredients.length === 0)
                 && (!recipe.steps || recipe.steps.length === 0)
                 && recipe.source;

  if (isLinkOut) {
    renderLinkOutBanner(recipe.source);
  } else {
    renderIngredients(recipe.ingredients || []);
    renderNutrition(recipe.nutrition, recipe.calories, recipe.servings);
    renderSteps(recipe.steps || []);
  }

  // Notes
  document.getElementById('notes-textarea').value = recipe.notes || '';

  // Ratings
  renderRatings(recipe);

  // Description (if any)
  if (recipe.description) {
    const descEl = document.getElementById('recipe-description');
    if (descEl) {
      descEl.textContent = recipe.description;
      descEl.classList.remove('hidden');
    }
  }
}

function buildStatsRow(recipe) {
  const container = document.getElementById('recipe-stats-row');
  const stats = [];
  if (recipe.calories != null) stats.push({ icon: '🔥', val: recipe.calories + ' cal', lbl: 'Per Serving' });
  if (recipe.servings)   stats.push({ icon: '👥', val: recipe.servings, lbl: 'Servings' });
  if (recipe.prepTime)   stats.push({ icon: '⏱', val: recipe.prepTime, lbl: 'Prep Time' });
  if (recipe.cookTime)   stats.push({ icon: '🍳', val: recipe.cookTime, lbl: 'Cook Time' });
  if (recipe.totalTime)  stats.push({ icon: '⏰', val: recipe.totalTime, lbl: 'Total Time' });

  container.innerHTML = stats.map(s => `
    <div class="recipe-stat">
      <span class="stat-icon">${s.icon}</span>
      <div>
        <div class="stat-val">${escHtml(String(s.val))}</div>
        <div class="stat-lbl">${s.lbl}</div>
      </div>
    </div>`).join('');
}

function buildTagsRow(tags) {
  const container = document.getElementById('recipe-tags-row');
  container.innerHTML = tags.map(t =>
    `<span class="tag">${escHtml(t)}</span>`
  ).join('');
}

// ── Link-out Banner ───────────────────────────────────────────
function renderLinkOutBanner(sourceUrl) {
  // Hide the ingredient, nutrition, and steps cards
  document.getElementById('ingredient-list')?.closest('.detail-card')?.style.setProperty('display', 'none');
  document.getElementById('nutrition-card')?.style.setProperty('display', 'none');
  document.getElementById('steps-list')?.closest('.detail-card')?.style.setProperty('display', 'none');

  let hostname = sourceUrl;
  try { hostname = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch (_) {}

  const banner = document.createElement('div');
  banner.className = 'linkout-banner';
  banner.innerHTML = `
    <p>The full recipe details are on the original site — we've saved this as a bookmark.</p>
    <a href="${escHtml(sourceUrl)}" target="_blank" rel="noopener" class="btn-linkout">
      🔗 View Full Recipe on ${escHtml(hostname)} →
    </a>`;

  // Prepend to the main content column
  const main = document.querySelector('.detail-main');
  if (main) {
    main.prepend(banner);
  }
}

// ── Ingredients ───────────────────────────────────────────────
function renderIngredients(ingredients) {
  const container = document.getElementById('ingredient-list');
  if (!ingredients.length) {
    container.innerHTML = `<p class="text-muted" style="font-size:0.9rem;padding:8px 0">No ingredients recorded.</p>`;
    return;
  }

  container.innerHTML = '';
  ingredients.forEach((item, idx) => {
    if (!item.trim()) {
      // Blank line = visual separator
      const sep = document.createElement('div');
      sep.className = 'ingredient-separator';
      sep.style.cssText = 'height:8px';
      container.appendChild(sep);
      return;
    }

    const el = document.createElement('div');
    el.className = `ingredient-item${checkedIngredients.has(idx) ? ' checked' : ''}`;
    el.dataset.idx = idx;
    el.innerHTML = `
      <div class="ingredient-check">${checkedIngredients.has(idx) ? '✓' : ''}</div>
      <span>${escHtml(item)}</span>`;

    el.addEventListener('click', () => {
      if (checkedIngredients.has(idx)) {
        checkedIngredients.delete(idx);
        el.classList.remove('checked');
        el.querySelector('.ingredient-check').textContent = '';
      } else {
        checkedIngredients.add(idx);
        el.classList.add('checked');
        el.querySelector('.ingredient-check').textContent = '✓';
      }
    });

    container.appendChild(el);
  });
}

// ── Nutrition ─────────────────────────────────────────────────
function renderNutrition(nut, fallbackCal, servings) {
  const container = document.getElementById('nutrition-grid');
  nut = nut || {};

  const cal = nut.calories || fallbackCal || 0;
  const items = [
    { val: cal,           lbl: 'Calories',    highlight: true },
    { val: nut.fat,       lbl: 'Total Fat' },
    { val: nut.carbs,     lbl: 'Carbs' },
    { val: nut.protein,   lbl: 'Protein' },
    { val: nut.fiber,     lbl: 'Fiber' },
    { val: nut.sugar,     lbl: 'Sugar' },
    { val: nut.sodium,    lbl: 'Sodium' },
    { val: nut.saturatedFat, lbl: 'Sat. Fat' },
  ].filter(i => i.val != null && i.val !== '');

  if (!items.length) {
    container.closest('.detail-card').classList.add('hidden');
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="nutrition-item">
      <div class="n-val${item.highlight ? ' highlight' : ''}">${escHtml(String(item.val))}</div>
      <div class="n-lbl">${item.lbl}</div>
    </div>`).join('');

  if (servings) {
    const note = document.getElementById('nutrition-note');
    if (note) note.textContent = `Per serving (${servings} servings total)`;
  }
}

// ── Steps ─────────────────────────────────────────────────────
function renderSteps(steps) {
  const container = document.getElementById('steps-list');
  if (!steps.length) {
    container.innerHTML = `<p class="text-muted" style="font-size:0.9rem">No cooking steps recorded.</p>`;
    return;
  }

  container.innerHTML = steps.map((step, i) => `
    <div class="step-item">
      <div class="step-num">${i + 1}</div>
      <div class="step-text">${escHtml(step)}</div>
    </div>`).join('');
}

// ── Ratings ──────────────────────────────────────────────────
function renderRatings(recipe) {
  const ratings = recipe.ratings || {};
  setRatingInput('katie', ratings.katie);
  setRatingInput('dan', ratings.dan);

  ['katie', 'dan'].forEach(person => {
    const input = document.getElementById(`${person}-rating`);
    if (!input) return;
    input.addEventListener('input', function () {
      updateRatingDots(person, this.value);
      this.classList.toggle('has-value', this.value !== '');
    });
  });
}

function setRatingInput(person, score) {
  const input = document.getElementById(`${person}-rating`);
  if (!input) return;
  if (score != null) {
    input.value = score;
    input.classList.add('has-value');
    updateRatingDots(person, score);
  } else {
    input.value = '';
    input.classList.remove('has-value');
    updateRatingDots(person, 0);
  }
}

function updateRatingDots(person, score) {
  const container = document.getElementById(`${person}-dots`);
  if (!container) return;
  const n = Math.min(10, Math.max(0, parseInt(score) || 0));
  container.innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<span class="rating-dot${i < n ? ' filled' : ''}"></span>`
  ).join('');
}

async function saveRatings() {
  const katieVal = document.getElementById('katie-rating').value;
  const danVal   = document.getElementById('dan-rating').value;

  const ratings = {
    katie: katieVal !== '' ? Math.min(10, Math.max(0, parseInt(katieVal))) : null,
    dan:   danVal   !== '' ? Math.min(10, Math.max(0, parseInt(danVal)))   : null,
  };

  const result = await recipeDB.update(currentRecipe.id, { ratings });
  currentRecipe.ratings = ratings;

  if (result && result._syncOk === false) {
    showPageToast(`⚠️ Ratings saved locally but GitHub sync failed: ${result._syncError}`, 'warning');
  } else {
    const badge = document.getElementById('ratings-saved-badge');
    if (badge) { badge.classList.add('show'); setTimeout(() => badge.classList.remove('show'), 3000); }
    showPageToast('Ratings saved!', 'success');
  }
}

// ── Edit Details Panel ────────────────────────────────────────
function openEditDetails() {
  const panel = document.getElementById('edit-details-panel');

  // Populate category select with all available categories
  const catSelect = document.getElementById('edit-category');
  catSelect.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) =>
    `<option value="${key}"${key === currentRecipe.category ? ' selected' : ''}>${cat.emoji} ${cat.label}</option>`
  ).join('');

  // Populate fields from current recipe
  document.getElementById('edit-name').value     = currentRecipe.name    || '';
  document.getElementById('edit-calories').value = currentRecipe.calories != null ? currentRecipe.calories : '';
  document.getElementById('edit-servings').value = currentRecipe.servings != null ? currentRecipe.servings : '';
  document.getElementById('edit-prep').value     = currentRecipe.prepTime || '';
  document.getElementById('edit-cook').value     = currentRecipe.cookTime || '';

  panel.style.display = 'block';
  document.getElementById('edit-name').focus();
}

function closeEditDetails() {
  document.getElementById('edit-details-panel').style.display = 'none';
}

async function saveEditDetails() {
  const name     = document.getElementById('edit-name').value.trim();
  const category = document.getElementById('edit-category').value;
  const calRaw   = document.getElementById('edit-calories').value;
  const servRaw  = document.getElementById('edit-servings').value;
  const prepTime = document.getElementById('edit-prep').value.trim();
  const cookTime = document.getElementById('edit-cook').value.trim();

  if (!name) { showPageToast('Recipe name cannot be empty', 'error'); return; }

  const calories  = calRaw  !== '' ? parseInt(calRaw,  10) : 0;
  const servings  = servRaw !== '' ? parseInt(servRaw, 10) : (currentRecipe.servings || 0);
  // Keep nutrition.calories in sync with the top-level calories field
  const nutrition = { ...(currentRecipe.nutrition || {}), calories };

  const btn = document.getElementById('btn-save-details');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const result = await recipeDB.update(currentRecipe.id, { name, category, calories, servings, prepTime, cookTime, nutrition });

  btn.disabled = false;
  btn.textContent = '💾 Save Changes';

  if (result && result._syncOk === false) {
    showPageToast(`⚠️ Saved locally but GitHub sync failed: ${result._syncError}`, 'warning');
  } else {
    const badge = document.getElementById('details-saved-badge');
    if (badge) { badge.classList.add('show'); setTimeout(() => badge.classList.remove('show'), 3000); }
    showPageToast('Recipe updated!', 'success');
  }

  // Update local copy and re-render the affected hero elements immediately
  Object.assign(currentRecipe, { name, category, calories, servings, prepTime, cookTime, nutrition });
  const cat = CATEGORIES[category] || { label: category, emoji: '🍽️' };
  document.getElementById('hero-title').textContent    = name;
  document.getElementById('hero-category').textContent = `${cat.emoji} ${cat.label}`;
  document.title = `${name} — Team KD's Recipes`;
  buildStatsRow(currentRecipe);
  renderNutrition(currentRecipe.nutrition, currentRecipe.calories, currentRecipe.servings);
}

// ── Notes ─────────────────────────────────────────────────────
function bindPageEvents() {
  // Back button
  document.getElementById('btn-back').addEventListener('click', () => {
    history.length > 1 ? history.back() : (window.location.href = 'index.html');
  });

  // Save notes
  document.getElementById('btn-save-notes').addEventListener('click', saveNotes);

  // Auto-save notes on ctrl+s
  document.getElementById('notes-textarea').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveNotes();
    }
  });

  // Delete recipe
  const deleteBtn = document.getElementById('btn-delete-recipe');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${currentRecipe.name}"? This cannot be undone.`)) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting…';
      const result = await recipeDB.remove(currentRecipe.id);
      if (result._syncOk === false) {
        showPageToast(`⚠️ Deleted locally but GitHub sync failed: ${result._syncError}`, 'warning');
        deleteBtn.disabled = false;
        deleteBtn.textContent = '🗑 Delete Recipe';
      } else {
        showPageToast('Recipe deleted', 'info');
        setTimeout(() => { window.location.href = 'index.html'; }, 1000);
      }
    });
  }

  // Clear ingredient checks
  const clearBtn = document.getElementById('btn-clear-checks');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      checkedIngredients.clear();
      renderIngredients(currentRecipe.ingredients || []);
    });
  }

  // Save ratings
  const ratingsBtn = document.getElementById('btn-save-ratings');
  if (ratingsBtn) ratingsBtn.addEventListener('click', saveRatings);

  // Print
  const printBtn = document.getElementById('btn-print');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  // Edit details
  const editBtn = document.getElementById('btn-edit-details');
  if (editBtn) editBtn.addEventListener('click', openEditDetails);

  const cancelEditBtn = document.getElementById('btn-cancel-edit');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditDetails);

  const saveDetailsBtn = document.getElementById('btn-save-details');
  if (saveDetailsBtn) saveDetailsBtn.addEventListener('click', saveEditDetails);
}

function saveNotes() {
  const notes = document.getElementById('notes-textarea').value;
  recipeDB.saveNote(currentRecipe.id, notes);
  currentRecipe.notes = notes;

  const badge = document.getElementById('notes-saved-badge');
  badge.classList.add('show');
  setTimeout(() => badge.classList.remove('show'), 3000);

  showPageToast('Notes saved!', 'success');
}

// ── Toast ─────────────────────────────────────────────────────
function showPageToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
}

// ── Utils ─────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
