import { FOOD_NUTRITION_DB } from "./foods.js";

export function calculateNutrition(foodKey, grams = 100) {
    if (!foodKey) return null;

    const food = FOOD_NUTRITION_DB[foodKey];

    if (!food) {
        console.warn("Food not found in DB:", foodKey);
        return null;
    }

    if (!food.per100g) {
        console.warn("Food has no per100g data:", foodKey);
        return null;
    }

    const scale = grams / 100;
    const nutrients = {};

    for (const [key, value] of Object.entries(food.per100g)) {
        nutrients[key] = Number((value * scale).toFixed(2));
    }

    return {
        name: food.name,
        group: food.group,
        grams,
        nutrients
    };
}