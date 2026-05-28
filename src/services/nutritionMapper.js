/**
 * nutritionMapper.js
 *
 * Converts AI food predictions → nutrition data
 * Used after YOLO detects a food label.
 *
 * Later this becomes your local nutrition database.
 */

// ------------------------------------
// BASIC FOOD DATABASE (starter set)
// values per ~100g serving
// ------------------------------------

export const FOOD_DB = {
  steak: {
    calories: 271,
    protein: 26,
    carbs: 0,
    fat: 19
  },

  pizza: {
    calories: 266,
    protein: 11,
    carbs: 33,
    fat: 10
  },

  burger: {
    calories: 295,
    protein: 17,
    carbs: 30,
    fat: 14
  },

  sushi: {
    calories: 130,
    protein: 6,
    carbs: 28,
    fat: 0.3
  },

  salad: {
    calories: 33,
    protein: 2,
    carbs: 6,
    fat: 0.4
  },

  pasta: {
    calories: 131,
    protein: 5,
    carbs: 25,
    fat: 1.1
  }
};

// ------------------------------------
// LABEL NORMALIZATION
// (YOLO labels aren't always clean)
// ------------------------------------

function normalizeLabel(label) {
  if (!label) return "";

  return label
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();
}

// ------------------------------------
// MAIN FUNCTION
// ------------------------------------

export function getNutritionFromLabel(label) {
  const normalized = normalizeLabel(label);

  // direct match
  if (FOOD_DB[normalized]) {
    return FOOD_DB[normalized];
  }

  // fuzzy contains match (simple but effective)
  for (const key of Object.keys(FOOD_DB)) {
    if (normalized.includes(key)) {
      return FOOD_DB[key];
    }
  }

  // fallback if unknown food
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    unknown: true
  };
}