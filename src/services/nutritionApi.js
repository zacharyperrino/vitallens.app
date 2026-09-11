// ─── USDA FoodData Central API ───────────────────────────────
// Replaces the static foods.js nutrition database.
// Docs: https://fdc.nal.usda.gov/api-guide.html

import { apiFetch } from '../utils/api.js';

// ── In-memory cache ───────────────────────────────────────────
const nutritionCache = new Map();

// ── Label search query map ──────────────────────────────────
const LABEL_TO_QUERY = {
    // Proteins
    steak: 'beef steak grilled', beef_steak: 'beef steak grilled',
    ribeye: 'beef ribeye steak', sirloin: 'beef sirloin steak',
    chicken: 'chicken breast grilled', grilled_chicken: 'chicken breast grilled',
    fried_chicken: 'chicken fried', rotisserie_chicken: 'chicken rotisserie',
    salmon: 'salmon cooked', sashimi: 'salmon raw',
    shrimp: 'shrimp cooked', tuna: 'tuna cooked',
    pork: 'pork loin cooked', bacon: 'bacon cooked',
    hot_dog: 'hot dog beef', hamburger: 'hamburger beef patty',
    burger: 'hamburger beef', lamb: 'lamb cooked',
    turkey: 'turkey breast cooked', duck: 'duck cooked',
    eggs: 'scrambled eggs', fried_egg: 'fried egg',
    omelette: 'egg omelette', boiled_egg: 'hard boiled egg',
    tofu: 'tofu firm', tempeh: 'tempeh cooked',

    // Carbs / grains
    rice: 'rice white cooked', white_rice: 'rice white cooked',
    brown_rice: 'rice brown cooked', fried_rice: 'rice fried',
    pasta: 'pasta cooked', spaghetti: 'spaghetti cooked',
    bread: 'bread white', sourdough: 'bread sourdough',
    pizza: 'pizza cheese', noodles: 'noodles cooked',
    ramen: 'ramen noodles soup', udon: 'udon noodles cooked',
    bibimbap: 'rice mixed vegetables korean',
    sushi: 'sushi roll', burrito: 'burrito beef',
    sandwich: 'sandwich turkey', wrap: 'wrap chicken tortilla',
    pancake: 'pancakes plain', waffle: 'waffle plain',
    croissant: 'croissant butter', bagel: 'bagel plain',
    cereal: 'corn flakes cereal', oatmeal: 'oatmeal cooked',
    granola: 'granola', muffin: 'muffin blueberry',
    tortilla: 'tortilla flour',

    // Vegetables
    broccoli: 'broccoli cooked', broccoli_raab: 'broccoli cooked',
    salad: 'mixed green salad', caesar_salad: 'caesar salad',
    spinach: 'spinach cooked', kale: 'kale cooked',
    carrot: 'carrot raw', tomato: 'tomato raw',
    cucumber: 'cucumber raw', lettuce: 'romaine lettuce',
    corn: 'corn cooked', potato: 'potato baked',
    sweet_potato: 'sweet potato baked', fries: 'french fries',
    onion: 'onion raw', mushroom: 'mushrooms cooked',
    bell_pepper: 'bell pepper raw', avocado: 'avocado raw',
    asparagus: 'asparagus cooked', green_beans: 'green beans cooked',
    peas: 'peas cooked', cauliflower: 'cauliflower cooked',
    edamame: 'edamame cooked', zucchini: 'zucchini cooked',
    eggplant: 'eggplant cooked', cabbage: 'cabbage cooked',
    yellow_squash: 'summer squash cooked',
    summer_squash: 'summer squash cooked',
    butternut_squash: 'butternut squash cooked',
    acorn_squash: 'acorn squash cooked',

    // Fruits
    apple: 'apple raw', banana: 'banana raw',
    orange: 'orange raw', strawberry: 'strawberries raw',
    blueberry: 'blueberries raw', mango: 'mango raw',
    grapes: 'grapes raw', watermelon: 'watermelon raw',
    pineapple: 'pineapple raw', peach: 'peach raw',
    pear: 'pear raw', kiwi: 'kiwi raw',
    raspberry: 'raspberries raw', blackberry: 'blackberries raw',

    // Dairy
    cheese: 'cheddar cheese', mozzarella: 'mozzarella cheese',
    yogurt: 'greek yogurt plain', milk: 'whole milk',
    butter: 'butter unsalted', ice_cream: 'ice cream vanilla',
    cream_cheese: 'cream cheese', cottage_cheese: 'cottage cheese',

    // Snacks / other
    chips: 'potato chips', cookie: 'chocolate chip cookie',
    cake: 'chocolate cake', chocolate: 'dark chocolate',
    popcorn: 'popcorn air popped', almonds: 'almonds raw',
    peanut_butter: 'peanut butter', hummus: 'hummus',
    soup: 'chicken soup', curry: 'chicken curry',
    chicken_curry: 'chicken curry', beef_curry: 'beef curry',
    stir_fry: 'vegetable stir fry', beef_stir_fry: 'beef stir fry',
    tacos: 'taco beef', nachos: 'nachos cheese',
    donut: 'donut glazed', smoothie: 'fruit smoothie',
    juice: 'orange juice', coffee: 'coffee black',
    beer: 'beer regular', wine: 'red wine',
    protein_bar: 'protein bar', energy_bar: 'energy bar',
    // Sauces & condiments
    chimichurri: 'parsley sauce',
    hot_sauce: 'hot sauce',
    soy_sauce: 'soy sauce',
    ketchup: 'ketchup',
    mayo: 'mayonnaise',
    mustard: 'mustard',
    ranch: 'ranch dressing',
    vinaigrette: 'salad dressing',
    pesto: 'pesto sauce',
    gravy: 'beef gravy',
    salsa: 'tomato salsa',

    // Specialty mushrooms
    chanterelle: 'mushrooms cooked',
    chanterelle_mushrooms: 'mushrooms cooked',
    shiitake: 'shiitake mushrooms cooked',
    portobello: 'portobello mushroom cooked',
    oyster_mushroom: 'mushrooms cooked',
    cremini: 'mushrooms cooked',

    // Other specialty items
    truffle: 'mushrooms cooked',
    miso: 'miso soup',
    tahini: 'tahini sesame butter',
    guacamole: 'avocado guacamole',

};

// ── Main lookup ───────────────────────────────────────────────

/**
 * Look up nutrition for a detected food label.
 * @param {string} yoloLabel — e.g. "grilled_chicken", "brown_rice"
 * @param {number} grams — portion size in grams
 */
async function getNutritionForFood(yoloLabel, grams = 150, cookingMethod = null) {
    const cacheKey = `${yoloLabel}_${grams}`;
    if (nutritionCache.has(cacheKey)) return nutritionCache.get(cacheKey);

    const normalized = yoloLabel.toLowerCase().replace(/_/g, ' ').trim();
    const labelKey = yoloLabel.toLowerCase().replace(/\s+/g, '_');
    let query = LABEL_TO_QUERY[labelKey] || LABEL_TO_QUERY[normalized] || normalized;
    // Append cooking method if not already in query and not a generic method
    if (cookingMethod && cookingMethod !== 'unknown' && !query.includes(cookingMethod)) {
        const methodMap = {
            grilled: 'grilled', fried: 'fried', steamed: 'steamed',
            baked: 'baked', roasted: 'roasted', raw: 'raw',
            boiled: 'boiled', sauteed: 'sauteed',
        };
        const method = methodMap[cookingMethod.toLowerCase()];
        if (method) query = query + ' ' + method;
    }
    try {
        // Try primary query first
        let result = await searchFood(query, grams);

        // If no result, try first word only as fallback
        if (!result) {
            const firstWord = query.split(' ')[0];
            console.log(`[NutritionAPI] Fallback to single word: "${firstWord}"`);
            result = await searchFood(firstWord, grams);
        }

        if (result) nutritionCache.set(cacheKey, result);
        return result;
    } catch (err) {
        // If query fails with 400, retry with first word only
        try {
            const firstWord = query.split(' ')[0];
            console.log(`[NutritionAPI] Retry with: "${firstWord}"`);
            const result = await searchFood(firstWord, grams);
            if (result) nutritionCache.set(cacheKey, result);
            return result;
        } catch {
            console.error(`[NutritionAPI] Failed for ${yoloLabel}:`, err.message);
            return null;
        }
    }
}

/**
 * Search USDA FoodData Central.
 * Fixed URL encoding — Survey (FNDDS) was causing 400 errors.
 */
async function searchFood(query, grams = 100) {
    const encodedQuery = encodeURIComponent(query);
    const res = await apiFetch(
        `/api/nutrition/search?query=${encodedQuery}&grams=${grams}`,
        { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Nutrition search failed: ${res.status}`);
    }
    return await res.json();
}

// ── Batch operations ──────────────────────────────────────────

/**
 * Batch fetch nutrition for multiple detected foods in parallel.
 */
export async function batchNutritionLookup(detections) {
    const results = await Promise.allSettled(
        detections.map(d => getNutritionForFood(d.label, d.grams, d.cooking_method))
    );
    // Preserve null for failed lookups — don't filter, keep index alignment
    return results.map(r => {
        if (r.status === 'fulfilled' && r.value !== null) return r.value;
        console.warn(`[NutritionLookup] Failed for item:`, r.reason?.message || 'null result');
        return null;
    });
}

/**
 * Aggregate nutrition from multiple food items into a single total.
 */
export function aggregateNutrition(items) {
    if (!items || items.length === 0) return null;
    if (items.length === 1) return items[0];

    return {
        name: items.map(i => i.name).join(' & '),
        grams: items.reduce((s, i) => s + (i.grams || 0), 0),
        calories: round(items, 'calories'),
        protein: round(items, 'protein'),
        fat: round(items, 'fat'),
        carbs: round(items, 'carbs'),
        fiber: round(items, 'fiber'),
        sugar: round(items, 'sugar'),
        sodium: Math.round(items.reduce((s, i) => s + (i.sodium || 0), 0)),
        saturated_fat: round(items, 'saturated_fat'),
        micronutrients: mergeMicronutrients(items),
        healthRating: Math.round(items.reduce((s, i) => s + (i.healthRating || 0), 0) / items.length),
        digestibility: Math.round(items.reduce((s, i) => s + (i.digestibility || 0), 0) / items.length),
        source: 'USDA FoodData Central',
    };
}

function round(items, key) {
    return Number(items.reduce((s, i) => s + (i[key] || 0), 0).toFixed(1));
}

function mergeMicronutrients(items) {
    const merged = {};
    items.forEach(item => {
        (item.micronutrients || []).forEach(m => {
            if (!merged[m.name]) {
                merged[m.name] = { ...m };
            } else {
                const existing = parseFloat(merged[m.name].amount);
                const adding = parseFloat(m.amount);
                const unit = m.amount.replace(/[\d.]/g, '');
                merged[m.name].amount = `${(existing + adding).toFixed(1)}${unit}`;
                merged[m.name].rda = Math.min(999, merged[m.name].rda + m.rda);
            }
        });
    });
    return Object.values(merged);
}