// ─── Food Scan API Service ────────────────────────────────────
import { batchNutritionLookup, aggregateNutrition } from './nutritionApi.js';
import { analyzeImageWithVision } from './visionApi.js';

const API_BASE = '/api';

const PORTION_MULTIPLIERS = { small: 0.7, medium: 1.0, large: 1.4 };

const PORTION_BASELINES = {
    steak: 200, beef_steak: 200, chicken: 180, grilled_chicken: 180,
    salmon: 170, burger: 220, pizza: 150, pasta: 180, rice: 160,
    white_rice: 160, brown_rice: 170, fried_rice: 200, noodles: 180,
    ramen: 350, bread: 60, sandwich: 200, broccoli: 90, salad: 120,
    fries: 130, chips: 90, potato: 180, eggs: 120, omelette: 150,
    soup: 240, curry: 200, sushi: 150, tacos: 180, default: 150,
};

export async function lookupBarcode(barcode) {
    try {
        const res = await fetch(`${API_BASE}/barcode-lookup`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, userId: getDeviceId() }),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Lookup failed (${res.status})`); }
        return await res.json();
    } catch (err) { console.warn('[FoodScanApi] Barcode lookup error:', err.message); return getMockProduct(barcode); }
}

export async function parseNutritionLabel(imageFile) {
    try {
        const formData = new FormData();
        formData.append('image', imageFile);
        const res = await fetch(`${API_BASE}/ocr-parse`, { method: 'POST', body: formData });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `OCR failed`); }
        return await res.json();
    } catch (err) { console.warn('[FoodScanApi] OCR error:', err.message); return getMockOcrResult(); }
}

export async function getHealthScore(nutrition, additives = []) {
    try {
        const res = await fetch(`${API_BASE}/health-score`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nutrition, additives }),
        });
        if (!res.ok) throw new Error(`Score failed`);
        return await res.json();
    } catch (err) { return computeLocalScore(nutrition, additives); }
}

function generateMealHash(foods) {
    const labels = foods
        .map(f => (f.label || f.name || '').toLowerCase().trim())
        .filter(Boolean)
        .sort()
        .join('|');
    return btoa(labels).slice(0, 32);
}

export async function getMealAnalysis(imageFiles, portion = 'medium') {
    const files = Array.isArray(imageFiles) ? imageFiles : [imageFiles];

    // Analyze all images in parallel
    console.log(`[MealAnalysis] Processing ${files.length} image(s)`);
    const visionResults = await Promise.all(files.map(f => analyzeImageWithVision(f)));

    // Merge detections from all images
    const allDetections = visionResults.flatMap(r => r.detections || []);
    const mergedDetections = mergeMultiImageDetections(allDetections);
    console.log(`[MealAnalysis] Multi-image merge: ${allDetections.length} total detections → ${mergedDetections.length} after merge`);
    let detections = mergedDetections;
    if (detections.length === 0) throw new Error('No food detected. Try a clearer photo.');

    const primaryResult = visionResults[0];

    // ── Restaurant detection ──────────────────────────────────
    let restaurantDetected = false;
    let restaurantName = null;
    try {
        const restaurantRes = await fetch(`${API_BASE}/restaurant/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mealDescription: primaryResult.meal_description || '',
                foods: detections.map(d => ({ label: d.label, display_name: d.display_name })),
                restaurant_detected: primaryResult.restaurant_detected || 'none',
                restaurant_confidence: primaryResult.restaurant_confidence || 0,
            }),
        });
        if (restaurantRes.ok) {
            const restaurantData = await restaurantRes.json();
            if (restaurantData.detected) {
                console.log(`[MealAnalysis] Restaurant detected: ${restaurantData.restaurantName}`);
                restaurantDetected = true;
                restaurantName = restaurantData.restaurantName;
                detections = restaurantData.matchedItems.map((item, i) => ({
                    ...detections[i] || item,
                    restaurantNutrition: item.restaurantMatch || null,
                }));
            }
        }
    } catch (restaurantErr) {
        console.warn('[MealAnalysis] Restaurant detection skipped:', restaurantErr.message);
    }
    // ─────────────────────────────────────────────────────────

    const validDetections = dedupeDetections(detections.filter(d => (d.confidence || 0) >= 0.25));
    if (validDetections.length === 0) throw new Error('No foods detected with sufficient confidence.');

    const portionMultiplier = PORTION_MULTIPLIERS[portion] || 1.0;
    const detectionInputs = validDetections.map(det => {
        const label = (det.label || '').toLowerCase().trim();
        const grams = Math.round((det.estimated_grams || getPortionBaseline(label)) * portionMultiplier);
        console.log(`[MealAnalysis] ${label} | cooking_method: ${det.cooking_method || 'none'}`);
        return {
            label, grams,
            confidence: det.confidence || 0.5,
            box: det.box || null,
            display_name: det.display_name || label,
            restaurantNutrition: det.restaurantNutrition || null,
            cooking_method: det.cooking_method || null,
        };
    });

    const nutritionResults = await batchNutritionLookupWithRestaurant(detectionInputs);
    if (nutritionResults.length === 0) throw new Error('Could not find nutrition data. Try a clearer photo.');

    const foodItems = nutritionResults.map((nutrition, i) => {
        const det = detectionInputs[i] || detectionInputs[0];
        return {
            id: (nutrition.name || det.label).toLowerCase().replace(/\s+/g, '_'),
            name: nutrition.name || det.display_name,
            group: inferFoodGroup(det.label),
            grams: nutrition.grams,
            confidence: det.confidence,
            box: det.box,
            nutrients: {
                calories: nutrition.calories,
                protein: nutrition.protein,
                carbs: nutrition.carbs,
                fat: nutrition.fat,
                fiber: nutrition.fiber,
                sugar: nutrition.sugar,
                sodium: nutrition.sodium,
            },
            micronutrients: nutrition.micronutrients || [],
            healthRating: nutrition.healthRating,
            digestibility: nutrition.digestibility,
            source: nutrition.source,
        };
    });

    const finalItems = dedupeFoods(foodItems).filter(item => item.confidence >= 0.25).sort((a, b) => b.confidence - a.confidence);
    const aggregated = aggregateNutrition(nutritionResults);

    return {
        food: {
            name: restaurantName ? `${restaurantName} meal` : aggregated.name,
            calories: aggregated.calories,
            protein: aggregated.protein,
            carbs: aggregated.carbs,
            fat: aggregated.fat,
            fiber: aggregated.fiber,
            sugar: aggregated.sugar,
            sodium: aggregated.sodium,
            micronutrients: aggregated.micronutrients || [],
        },
        foods: finalItems,
        detections,
        healthRating: aggregated.healthRating,
        digestibilityScore: aggregated.digestibility,
        combinations: generateFoodCombinations(finalItems),
        confidence: finalItems[0]?.confidence || 0.5,
        meal_description: primaryResult.meal_description,
        meal_context: primaryResult.meal_context,
        cuisine_type: primaryResult.cuisine_type,
        meal_setting: primaryResult.meal_setting,
        scale_anchor_found: primaryResult.scale_anchor_found,
        restaurant_detected: restaurantDetected,
        restaurant_name: restaurantName,
        source: restaurantDetected ? `${restaurantName} (official nutrition data)` : 'USDA FoodData Central',
    };
}

// ── Nutrition lookup with restaurant data priority ────────────

async function batchNutritionLookupWithRestaurant(detectionInputs) {
    const results = await Promise.all(
        detectionInputs.map(async (det) => {
            if (det.restaurantNutrition) {
                console.log(`[MealAnalysis] Using restaurant data for: ${det.label}`);
                return {
                    name: det.restaurantNutrition.name || det.display_name,
                    grams: det.restaurantNutrition.grams || det.grams,
                    calories: det.restaurantNutrition.calories || 0,
                    protein: det.restaurantNutrition.protein || 0,
                    carbs: det.restaurantNutrition.carbs || 0,
                    fat: det.restaurantNutrition.fat || 0,
                    fiber: det.restaurantNutrition.fiber || 0,
                    sugar: 0,
                    sodium: det.restaurantNutrition.sodium || 0,
                    micronutrients: [],
                    healthRating: 55,
                    digestibility: 60,
                    source: `${det.restaurantNutrition.restaurant} (official nutrition data)`,
                };
            }
            return null;
        })
    );

    const needsUSDA = detectionInputs.filter((_, i) => !results[i]);
    console.log(`[MealAnalysis] ${needsUSDA.length} items need USDA:`, needsUSDA.map(d => d.label));
    if (needsUSDA.length > 0) {
        const usdaResults = await batchNutritionLookup(needsUSDA);
        let usdaIndex = 0;
        results.forEach((r, i) => {
            if (!r) results[i] = usdaResults[usdaIndex++] || null;
        });
    }

    return results.filter(Boolean);
}

// ── Multi-image merge ─────────────────────────────────────────

function mergeMultiImageDetections(allDetections) {
    const merged = {};
    allDetections.forEach(det => {
        const key = (det.label || '').toLowerCase().trim().replace(/\s+/g, '_');
        if (!merged[key]) {
            merged[key] = { ...det, sightings: 1 };
        } else {
            merged[key].sightings++;
            merged[key].confidence = Math.min(0.99, merged[key].confidence + (det.confidence * 0.15));
            if (det.estimated_grams && merged[key].estimated_grams) {
                merged[key].estimated_grams = Math.round((merged[key].estimated_grams + det.estimated_grams) / 2);
            }
        }
    });
    return Object.values(merged).sort((a, b) => b.confidence - a.confidence);
}

// ── Helpers ───────────────────────────────────────────────────

function getPortionBaseline(label) {
    return PORTION_BASELINES[label.replace(/\s+/g, '_')] || PORTION_BASELINES.default;
}

function inferFoodGroup(label) {
    const l = (label || '').toLowerCase();
    if (/steak|chicken|salmon|beef|pork|tuna|shrimp|egg|tofu|turkey|lamb/.test(l)) return 'protein';
    if (/rice|pasta|bread|pizza|noodle|ramen|potato|fries|chips|tortilla|wrap|burrito/.test(l)) return 'starch';
    if (/broccoli|salad|spinach|carrot|tomato|lettuce|kale|peas|vegetable|cucumber|pepper/.test(l)) return 'vegetable';
    if (/apple|banana|orange|berry|mango|grape|fruit|peach|pineapple|watermelon/.test(l)) return 'fruit';
    if (/milk|cheese|yogurt|butter|dairy|cream/.test(l)) return 'dairy';
    if (/cake|cookie|ice_cream|donut|dessert|chocolate|muffin/.test(l)) return 'dessert';
    return 'other';
}

function generateFoodCombinations(items) {
    const groups = items.map(i => i.group);
    const combos = [];
    if (groups.includes('protein') && groups.includes('vegetable')) combos.push({ type: 'good', title: 'Balanced meal pairing', explanation: 'Protein and vegetables create a balanced, filling meal with sustained energy release.' });
    if (groups.includes('starch') && groups.includes('dessert')) combos.push({ type: 'bad', title: 'Heavy carb combination', explanation: 'Stacking refined starches with dessert significantly increases glycemic load.' });
    if (groups.includes('protein') && groups.includes('starch')) combos.push({ type: 'good', title: 'Complete macronutrient profile', explanation: 'Protein and carbohydrates together support muscle recovery and sustained energy.' });
    if (combos.length === 0) combos.push({ type: 'good', title: 'Varied meal composition', explanation: 'Your meal contains a variety of food types.' });
    return combos;
}

function dedupeDetections(detections) {
    const seen = new Set();
    return detections.filter(det => {
        const key = (det.label || '').toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function dedupeFoods(items) {
    const kept = [];
    items.forEach(item => {
        const existing = kept.find(k => k.id === item.id);
        if (!existing) kept.push(item);
        else if (item.confidence > existing.confidence) Object.assign(existing, item);
    });
    return kept;
}

function getDeviceId() {
    let id = localStorage.getItem('vitallens_device_id');
    if (!id) { id = 'device_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('vitallens_device_id', id); }
    return id;
}

function computeLocalScore(n, additives = []) {
    let score = 60;
    score -= Math.min(20, (n.sugar || 0) * 1.5);
    score -= Math.min(15, (n.sodium || 0) * 0.012);
    score += Math.min(10, (n.fiber || 0) * 2.0);
    score += Math.min(10, (n.protein || 0) * 0.8);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const rating = score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : 'Poor';
    return { score, rating, color: score >= 75 ? '#4CAF50' : score >= 50 ? '#FFC107' : '#F44336', positives: [], negatives: [], breakdown: {} };
}

function getMockProduct(barcode) {
    return {
        product: { barcode, name: 'Unknown Product', brand: '', ingredients: '', nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, sodium: 0 }, nutriscore: null, nova_group: null, image_url: null },
        healthScore: { score: 50, rating: 'Good', color: '#FFC107', positives: [], negatives: ['Server not connected'], breakdown: {} },
        additives: { analyzed: [], summary: { total: 0, high: 0, moderate: 0, low: 0 } },
    };
}

function getMockOcrResult() {
    return { nutrition: { calories: 0, protein: 0, carbs: 0, sugar: 0, fat: 0, saturated_fat: 0, fiber: 0, sodium: 0 }, servingSize: { amount: 100, unit: 'g' }, rawText: '[Mock] Server not connected', confidence: 0, warnings: ['Server not connected'] };
}