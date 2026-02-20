/**
 * scraper.js — Recipe URL Scraper
 * Tries multiple CORS proxies + JSON-LD schema.org/Recipe extraction.
 * ALWAYS resolves — never throws. Returns { _scrapeOk: true/false, ...recipe }.
 * When _scrapeOk is false the name is guessed from the URL slug so the UI
 * can offer a graceful "link-out" recipe fallback.
 */

class RecipeScraper {

  // Each proxy has a different response format — build() makes the URL,
  // read() extracts the HTML string from the Response.
  _PROXIES = [
    {
      build: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
      read:  async r => { const d = await r.json(); return d.contents || null; },
    },
    {
      build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      read:  async r => r.text(),
    },
    {
      build: u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      read:  async r => r.text(),
    },
    {
      build: u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
      read:  async r => r.text(),
    },
    {
      build: u => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(u)}`,
      read:  async r => r.text(),
    },
  ];

  /**
   * Main entry point — NEVER throws.
   * @param {string} url
   * @returns {Object} recipe data + _scrapeOk boolean
   */
  async scrape(url) {
    const html = await this._fetchViaProxy(url);

    if (html) {
      // 1) Try JSON-LD (most recipe sites embed schema.org/Recipe)
      const jsonLD = this._extractJsonLD(html);
      if (jsonLD) {
        const recipe = this._normalizeJsonLD(jsonLD, url);
        if (recipe.name && (recipe.ingredients.length > 0 || recipe.steps.length > 0)) {
          return { ...recipe, _scrapeOk: true };
        }
      }

      // 2) Heuristic HTML parsing
      const heuristic = this._heuristicExtract(html, url);
      if (heuristic.name || heuristic.ingredients.length > 0) {
        return { ...heuristic, _scrapeOk: true };
      }
    }

    // 3) Complete failure — return skeleton with name guessed from URL slug
    return {
      _scrapeOk:   false,
      name:        this._titleFromUrl(url),
      category:    this._guessCategory('', '', this._titleFromUrl(url), []),
      emoji:       '',
      calories:    0,
      servings:    4,
      prepTime:    '',
      cookTime:    '',
      totalTime:   '',
      source:      url,
      thumbnail:   '',
      ingredients: [],
      steps:       [],
      nutrition:   {},
      tags:        [],
      notes:       '',
    };
  }

  // ── Fetch ─────────────────────────────────────────────────
  async _fetchViaProxy(url) {
    for (const proxy of this._PROXIES) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 14000);
        const res = await fetch(proxy.build(url), { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const text = await proxy.read(res);
        // Sanity check: real HTML is at least a few KB
        if (text && typeof text === 'string' && text.length > 500) return text;
      } catch (e) {
        console.warn('[scraper] proxy failed:', e.message);
      }
    }
    return null;
  }

  // ── Title from URL slug (last-resort name extraction) ─────
  _titleFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const slug = pathname.split('/').filter(Boolean).pop() || '';
      return slug
        .replace(/\.[a-z]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    } catch (_) { return ''; }
  }

  // ── JSON-LD Extraction ────────────────────────────────────
  _extractJsonLD(html) {
    const matches = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(m[1].trim());
        // Could be an array or @graph
        const nodes = Array.isArray(parsed) ? parsed :
          (parsed['@graph'] ? parsed['@graph'] : [parsed]);
        for (const node of nodes) {
          if (this._isRecipe(node)) matches.push(node);
        }
      } catch (_) {}
    }
    return matches[0] || null;
  }

  _isRecipe(node) {
    if (!node || typeof node !== 'object') return false;
    const type = node['@type'];
    if (!type) return false;
    const types = Array.isArray(type) ? type : [type];
    return types.some(t => String(t).toLowerCase().includes('recipe'));
  }

  _normalizeJsonLD(data, sourceUrl) {
    const name = this._str(data.name);
    const description = this._str(data.description);

    // Ingredients
    const ingredients = this._toArray(data.recipeIngredient).map(i => this._str(i)).filter(Boolean);

    // Steps — can be HowToStep, HowToSection, or plain strings
    const steps = this._parseInstructions(data.recipeInstructions);

    // Nutrition
    const nutrition = this._parseNutrition(data.nutrition);

    // Calories (also check top-level)
    const calories = nutrition.calories || this._parseCalNum(this._str(data.calories)) || 0;
    nutrition.calories = calories;

    // Times
    const prepTime = this._parseDuration(data.prepTime);
    const cookTime = this._parseDuration(data.cookTime);
    const totalTime = this._parseDuration(data.totalTime);

    // Servings
    const servings = this._parseServings(data.recipeYield || data.yield);

    // Image
    const image = this._parseImage(data.image);

    // Category → map to our categories
    const category = this._guessCategory(
      this._str(data.recipeCategory),
      this._str(data.recipeCuisine),
      name,
      ingredients
    );

    // Emoji
    const emoji = this._categoryEmoji(category);

    // Tags
    const tags = this._parseTags(data.keywords, data.recipeCategory, data.recipeCuisine);

    return {
      name,
      description,
      category,
      emoji,
      calories,
      servings,
      prepTime,
      cookTime,
      totalTime,
      source: sourceUrl,
      thumbnail: image,
      ingredients,
      steps,
      nutrition,
      tags,
      notes: '',
    };
  }

  // ── Heuristic Extraction (fallback) ──────────────────────
  _heuristicExtract(html, url) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const name = (
      this._metaContent(doc, 'og:title') ||
      doc.querySelector('h1')?.textContent ||
      'Unknown Recipe'
    ).trim();

    const description = (
      this._metaContent(doc, 'og:description') ||
      this._metaContent(doc, 'description') ||
      ''
    ).trim();

    const image = this._metaContent(doc, 'og:image') || '';

    // Try to find ingredients
    const ingredientEls = doc.querySelectorAll(
      '[class*="ingredient"], [itemprop="recipeIngredient"], [data-ingredient], li.ingredient'
    );
    const ingredients = Array.from(ingredientEls).map(el => el.textContent.trim()).filter(Boolean);

    // Try to find steps
    const stepEls = doc.querySelectorAll(
      '[class*="instruction"] li, [class*="step"] li, [class*="direction"] li, [itemprop="recipeInstructions"] li'
    );
    const steps = Array.from(stepEls).map(el => el.textContent.trim()).filter(Boolean);

    // Guess category from URL / title
    const category = this._guessCategory('', '', name, ingredients);
    const emoji = this._categoryEmoji(category);

    return {
      name,
      description,
      category,
      emoji,
      calories: 0,
      servings: 4,
      prepTime: '',
      cookTime: '',
      totalTime: '',
      source: url,
      thumbnail: image,
      ingredients,
      steps,
      nutrition: {},
      tags: [],
      notes: '',
    };
  }

  // ── Parsers ───────────────────────────────────────────────
  _parseInstructions(inst) {
    if (!inst) return [];
    const items = this._toArray(inst);
    const steps = [];
    for (const item of items) {
      if (typeof item === 'string') {
        const clean = item.replace(/<[^>]+>/g, '').trim();
        if (clean) steps.push(clean);
      } else if (typeof item === 'object') {
        // HowToSection has itemListElement
        if (item.itemListElement) {
          const sub = this._parseInstructions(item.itemListElement);
          steps.push(...sub);
        } else {
          const text = this._str(item.text || item.name || '');
          if (text) steps.push(text);
        }
      }
    }
    return steps;
  }

  _parseNutrition(nut) {
    if (!nut || typeof nut !== 'object') return {};
    const map = {
      calories: ['calories', 'calories'],
      fat: ['fatContent', 'totalFat'],
      saturatedFat: ['saturatedFatContent', 'saturatedFat'],
      carbs: ['carbohydrateContent', 'totalCarbohydrate'],
      fiber: ['fiberContent', 'dietaryFiber'],
      sugar: ['sugarContent', 'sugars'],
      protein: ['proteinContent', 'protein'],
      sodium: ['sodiumContent', 'sodium'],
    };
    const result = {};
    for (const [key, aliases] of Object.entries(map)) {
      for (const alias of aliases) {
        if (nut[alias]) {
          result[key] = this._str(nut[alias]);
          break;
        }
      }
    }
    if (result.calories) result.calories = this._parseCalNum(result.calories);
    return result;
  }

  _parseDuration(iso) {
    if (!iso) return '';
    // ISO 8601 duration: PT30M, PT1H30M, P0DT45M
    const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!m) return String(iso);
    const h = parseInt(m[1] || '0');
    const min = parseInt(m[2] || '0');
    if (h > 0 && min > 0) return `${h}h ${min} min`;
    if (h > 0) return `${h} hr`;
    if (min > 0) return `${min} min`;
    return String(iso);
  }

  _parseServings(raw) {
    if (!raw) return 4;
    const arr = this._toArray(raw);
    const str = arr.join(' ');
    const num = parseInt(str);
    return isNaN(num) ? 4 : num;
  }

  _parseCalNum(str) {
    if (!str) return 0;
    const m = String(str).match(/(\d+(\.\d+)?)/);
    return m ? Math.round(parseFloat(m[1])) : 0;
  }

  _parseImage(img) {
    if (!img) return '';
    if (typeof img === 'string') return img;
    if (Array.isArray(img)) return img[0]?.url || img[0] || '';
    return img.url || '';
  }

  _parseTags(keywords, category, cuisine) {
    const tags = [];
    if (keywords) {
      const kws = Array.isArray(keywords) ? keywords : String(keywords).split(',');
      tags.push(...kws.map(k => k.trim().toLowerCase()).filter(k => k.length < 25 && k));
    }
    if (category) tags.push(String(category).trim().toLowerCase());
    if (cuisine) tags.push(String(cuisine).trim().toLowerCase());
    return [...new Set(tags)].slice(0, 6);
  }

  // ── Category Guesser ──────────────────────────────────────
  _guessCategory(rawCat, cuisine, name, ingredients) {
    const text = `${rawCat} ${cuisine} ${name} ${ingredients.join(' ')}`.toLowerCase();

    const rules = [
      ['soups',      /soup|stew|chowder|broth|bisque|chili/],
      ['pasta',      /pasta|spaghetti|penne|fettuccine|rigatoni|linguine|lasagna|noodle|macaroni|tagliatelle|gnocchi|orzo/],
      ['mexican',    /taco|fajita|burrito|enchilada|quesadilla|salsa|guacamole|mexican|tex.mex|chimichanga/],
      ['asian',      /stir.fry|fried rice|ramen|pho|pad thai|sushi|teriyaki|korean|chinese|japanese|thai|vietnamese|asian|wok/],
      ['seafood',    /salmon|shrimp|fish|tuna|cod|halibut|tilapia|lobster|crab|scallop|seafood|prawn|clam|mussel/],
      ['salads',     /salad|bowl|grain bowl|buddha bowl/],
      ['breakfast',  /breakfast|brunch|egg|omelette|pancake|waffle|french toast|shakshuka|frittata|quiche/],
      ['desserts',   /cake|cookie|brownie|pie|tart|dessert|sweet|chocolate|ice cream|pudding|muffin|cupcake/],
      ['pizza',      /pizza|flatbread|focaccia|calzone/],
      ['casseroles', /casserole|bake|gratin|lasagna|pot pie/],
      ['meat',       /chicken|beef|pork|lamb|turkey|steak|roast|meatball|meatloaf|wing|rib|cutlet|tenderloin/],
      ['vegetables', /vegetable|veggie|vegan|side dish|roasted veg|cauliflower|broccoli|asparagus|green bean/],
    ];

    for (const [cat, re] of rules) {
      if (re.test(text)) return cat;
    }

    return 'meat'; // default
  }

  _categoryEmoji(cat) {
    return (CATEGORIES[cat] || { emoji: '🍽️' }).emoji;
  }

  // ── Helpers ───────────────────────────────────────────────
  _str(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.replace(/<[^>]+>/g, '').trim();
    if (typeof v === 'object' && v['@value']) return String(v['@value']).trim();
    return String(v).trim();
  }

  _toArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  _metaContent(doc, name) {
    const el =
      doc.querySelector(`meta[property="${name}"]`) ||
      doc.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') || '' : '';
  }
}

// Singleton
const scraper = new RecipeScraper();
