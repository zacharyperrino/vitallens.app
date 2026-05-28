// ─── USDA FoodData Central API ───────────────────────────────
// Replaces the static foods.js nutrition database.
// Docs: https://fdc.nal.usda.gov/api-guide.html

const API_BASE = '/api';

// ── In-memory cache ───────────────────────────────────────────
const nutritionCache = new Map();

// ── Label → search query map ──────────────────────────────────
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
    zucchini: 'zucchini cooked',
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
    edamame: 'edamame cooked',
    miso: 'miso soup',
    tahini: 'tahini sesame butter',
    hummus: 'hummus',
    guacamole: 'avocado guacamole',

};

// ── Main lookup ───────────────────────────────────────────────

/**
 * Look up nutrition for a detected food label.
 * @param {string} yoloLabel — e.g. "grilled_chicken", "brown_rice"
 * @param {number} grams — portion size in grams
 */
export async function getNutritionForFood(yoloLabel, grams = 150, cookingMethod = null) {
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
export async function searchFood(query, grams = 100) {
    const encodedQuery = encodeURIComponent(query);
    const res = await fetch(
        `${API_BASE}/nutrition/search?query=${encodedQuery}&grams=${grams}`,
        { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Nutrition search failed: ${res.status}`);
    }
    return await res.json();
}

/**
 * Look up a specific food by USDA FDC ID.
 */
export async function getFoodById(fdcId, grams = 100) {
    const cacheKey = `fdc_${fdcId}_${grams}`;
    if (nutritionCache.has(cacheKey)) return nutritionCache.get(cacheKey);
    const res = await fetch(
        `${API_BASE}/nutrition/food/${fdcId}?grams=${grams}`,
        { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`Nutrition lookup failed: ${res.status}`);
    const result = await res.json();
    nutritionCache.set(cacheKey, result);
    return result;
}

// ── Normalization ─────────────────────────────────────────────

function normalizeNutrition(food, queryName, grams) {
    const nutrients = food.foodNutrients || [];
    const scale = grams / 100;

    const get = (ids) => {
        const ids_arr = Array.isArray(ids) ? ids : [ids];
        for (const id of ids_arr) {
            const n = nutrients.find(n =>
                n.nutrientId === id ||
                n.nutrient?.id === id ||
                n.number === String(id)
            );
            if (n) {
                const val = n.value ?? n.amount ?? 0;
                return Number((val * scale).toFixed(2));
            }
        }
        return 0;
    };

    const calories = get([1008, 2047, 2048]);
    const protein = get([1003]);
    const fat = get([1004]);
    const carbs = get([1005]);
    const fiber = get([1079]);
    const sugar = get([1063, 2000]);
    const sodium = get([1093]);
    const satFat = get([1258]);
    const cholesterol = get([1253]);
    const potassium = get([1092]);
    const calcium = get([1087]);
    const iron = get([1089]);
    const vitaminC = get([1162]);
    const vitaminD = get([1114, 1110]);
    const vitaminB12 = get([1178]);
    const magnesium = get([1090]);
    const zinc = get([1095]);

    const micronutrients = buildMicronutrients({
        calcium, iron, vitaminC, vitaminD, vitaminB12,
        potassium, magnesium, zinc, sodium, cholesterol,
    });

    return {
        name: food.description || queryName,
        fdcId: food.fdcId,
        dataType: food.dataType,
        grams,
        calories,
        protein: Number(protein.toFixed(1)),
        fat: Number(fat.toFixed(1)),
        carbs: Number(carbs.toFixed(1)),
        fiber: Number(fiber.toFixed(1)),
        sugar: Number(sugar.toFixed(1)),
        sodium: Math.round(sodium),
        saturated_fat: Number(satFat.toFixed(1)),
        cholesterol: Math.round(cholesterol),
        potassium: Math.round(potassium),
        micronutrients,
        digestibility: estimateDigestibility({ fiber, fat, protein, carbs }),
        healthRating: estimateHealthRating({ fiber, sugar, satFat, sodium, protein, vitaminC }),
        source: 'USDA FoodData Central',
    };
}

function buildMicronutrients({ calcium, iron, vitaminC, vitaminD, vitaminB12, potassium, magnesium, zinc, sodium, cholesterol }) {
    const rdas = {
        'Calcium': { value: calcium, unit: 'mg', rda: 1000 },
        'Iron': { value: iron, unit: 'mg', rda: 18 },
        'Vitamin C': { value: vitaminC, unit: 'mg', rda: 90 },
        'Vitamin D': { value: vitaminD, unit: 'mcg', rda: 20 },
        'Vitamin B12': { value: vitaminB12, unit: 'mcg', rda: 2.4 },
        'Potassium': { value: potassium, unit: 'mg', rda: 3500 },
        'Magnesium': { value: magnesium, unit: 'mg', rda: 400 },
        'Zinc': { value: zinc, unit: 'mg', rda: 11 },
        'Sodium': { value: sodium, unit: 'mg', rda: 2300 },
        'Cholesterol': { value: cholesterol, unit: 'mg', rda: 300 },
    };

    return Object.entries(rdas)
        .filter(([_, d]) => d.value > 0)
        .map(([name, d]) => ({
            name,
            amount: `${d.value}${d.unit}`,
            rda: Math.min(999, Math.round((d.value / d.rda) * 100)),
        }));
}

function estimateDigestibility({ fiber, fat, protein, carbs }) {
    let score = 85;
    if (fat > 20) score -= 10;
    if (fiber > 8) score -= 5;
    if (protein > 30) score += 5;
    if (carbs > 50) score -= 5;
    return Math.max(50, Math.min(100, Math.round(score)));
}

function estimateHealthRating({ fiber, sugar, satFat, sodium, protein, vitaminC }) {
    let score = 65;
    score += Math.min(15, fiber * 2);
    score += Math.min(10, protein * 0.5);
    score += Math.min(5, vitaminC * 0.1);
    score -= Math.min(20, sugar * 1.5);
    score -= Math.min(15, satFat * 2);
    score -= Math.min(10, (sodium / 2300) * 10);
    return Math.max(0, Math.min(100, Math.round(score)));
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