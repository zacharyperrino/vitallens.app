// Simulated food analysis engine
export const foodDatabase = {
    'salad': {
        calories: 220, protein: 8, carbs: 18, fat: 14, fiber: 6, name: 'Mixed Green Salad', micronutrients: [
            { name: 'Vitamin A', amount: '156μg', rda: 78 }, { name: 'Vitamin C', amount: '45mg', rda: 50 },
            { name: 'Vitamin K', amount: '120μg', rda: 100 }, { name: 'Folate', amount: '90μg', rda: 23 },
            { name: 'Iron', amount: '2.1mg', rda: 12 }, { name: 'Potassium', amount: '420mg', rda: 9 },
        ]
    },
    'chicken': {
        calories: 335, protein: 38, carbs: 0, fat: 19, fiber: 0, name: 'Grilled Chicken Breast', micronutrients: [
            { name: 'Vitamin B6', amount: '0.9mg', rda: 53 }, { name: 'Vitamin B12', amount: '0.3μg', rda: 13 },
            { name: 'Niacin', amount: '13mg', rda: 81 }, { name: 'Selenium', amount: '28μg', rda: 51 },
            { name: 'Phosphorus', amount: '230mg', rda: 18 }, { name: 'Zinc', amount: '2mg', rda: 18 },
        ]
    },
    'rice': {
        calories: 206, protein: 4, carbs: 45, fat: 0.4, fiber: 0.6, name: 'Steamed White Rice', micronutrients: [
            { name: 'Thiamine', amount: '0.2mg', rda: 17 }, { name: 'Niacin', amount: '2.3mg', rda: 14 },
            { name: 'Iron', amount: '1.2mg', rda: 7 }, { name: 'Manganese', amount: '0.7mg', rda: 30 },
            { name: 'Selenium', amount: '12μg', rda: 22 }, { name: 'Folate', amount: '58μg', rda: 15 },
        ]
    },
    'salmon': {
        calories: 367, protein: 34, carbs: 0, fat: 22, fiber: 0, name: 'Baked Salmon Fillet', micronutrients: [
            { name: 'Vitamin D', amount: '14μg', rda: 70 }, { name: 'Vitamin B12', amount: '4.8μg', rda: 200 },
            { name: 'Omega-3', amount: '2.3g', rda: 144 }, { name: 'Selenium', amount: '41μg', rda: 75 },
            { name: 'Niacin', amount: '9mg', rda: 56 }, { name: 'Phosphorus', amount: '280mg', rda: 22 },
        ]
    },
    'avocado': {
        calories: 240, protein: 3, carbs: 13, fat: 22, fiber: 10, name: 'Fresh Avocado', micronutrients: [
            { name: 'Vitamin K', amount: '26μg', rda: 22 }, { name: 'Vitamin C', amount: '12mg', rda: 13 },
            { name: 'Potassium', amount: '727mg', rda: 15 }, { name: 'Folate', amount: '121μg', rda: 30 },
            { name: 'Vitamin E', amount: '2.7mg', rda: 18 }, { name: 'Magnesium', amount: '44mg', rda: 10 },
        ]
    },
    'eggs': {
        calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, name: 'Scrambled Eggs (2)', micronutrients: [
            { name: 'Vitamin A', amount: '160μg', rda: 80 }, { name: 'Vitamin D', amount: '2μg', rda: 10 },
            { name: 'Vitamin B12', amount: '0.9μg', rda: 38 }, { name: 'Selenium', amount: '22μg', rda: 40 },
            { name: 'Choline', amount: '294mg', rda: 53 }, { name: 'Riboflavin', amount: '0.5mg', rda: 38 },
        ]
    },
    'smoothie': {
        calories: 280, protein: 8, carbs: 52, fat: 6, fiber: 5, name: 'Berry Smoothie', micronutrients: [
            { name: 'Vitamin C', amount: '85mg', rda: 94 }, { name: 'Manganese', amount: '1.4mg', rda: 61 },
            { name: 'Vitamin K', amount: '28μg', rda: 23 }, { name: 'Potassium', amount: '380mg', rda: 8 },
            { name: 'Folate', amount: '36μg', rda: 9 }, { name: 'Calcium', amount: '150mg', rda: 12 },
        ]
    },
    'steak': {
        calories: 480, protein: 42, carbs: 0, fat: 34, fiber: 0, name: 'Ribeye Steak', micronutrients: [
            { name: 'Vitamin B12', amount: '6.9μg', rda: 288 }, { name: 'Zinc', amount: '11mg', rda: 100 },
            { name: 'Iron', amount: '3.5mg', rda: 19 }, { name: 'Niacin', amount: '8.5mg', rda: 53 },
            { name: 'Selenium', amount: '33μg', rda: 60 }, { name: 'Phosphorus', amount: '220mg', rda: 18 },
        ]
    },
};

const foodCombinations = [
    {
        foods: ['meat', 'fruit'], type: 'bad', title: 'Meat + Fruit',
        explanation: 'Fruit digests much faster than meat. When eaten together, the fruit ferments in the stomach while waiting for the meat to digest, producing gas and toxins. This neutralizes stomach acid needed for protein digestion.'
    },
    {
        foods: ['dairy', 'fruit'], type: 'bad', title: 'Dairy + Fruit',
        explanation: 'Combining dairy with acidic fruits curdles the milk in the stomach, creating a heavy and difficult-to-digest mixture. This can lead to bloating and impaired nutrient absorption.'
    },
    {
        foods: ['protein', 'starch'], type: 'bad', title: 'Heavy Protein + Starch',
        explanation: 'Proteins require acidic digestive enzymes while starches require alkaline. Eaten together, they can neutralize each other, leading to incomplete digestion and fermentation.'
    },
    {
        foods: ['melon', 'other'], type: 'bad', title: 'Melon + Other Foods',
        explanation: 'Melons digest extremely quickly and should be eaten alone. Combined with slower-digesting foods, they ferment and cause digestive discomfort.'
    },
    {
        foods: ['leafy_greens', 'healthy_fat'], type: 'good', title: 'Greens + Healthy Fats',
        explanation: 'Fat-soluble vitamins (A, D, E, K) in leafy greens are much better absorbed when paired with healthy fats like olive oil or avocado. This combination can increase nutrient absorption by up to 300%.'
    },
    {
        foods: ['iron', 'vitamin_c'], type: 'good', title: 'Iron-Rich Foods + Vitamin C',
        explanation: 'Vitamin C significantly enhances non-heme iron absorption. Pairing iron-rich foods like spinach with citrus can boost iron uptake by up to 6x.'
    },
    {
        foods: ['turmeric', 'black_pepper'], type: 'good', title: 'Turmeric + Black Pepper',
        explanation: 'Piperine in black pepper increases curcumin bioavailability by 2000%. This ancient Ayurvedic combination maximizes the anti-inflammatory benefits of turmeric.'
    },
    {
        foods: ['fermented', 'fiber'], type: 'good', title: 'Fermented Foods + Fiber',
        explanation: 'Probiotics from fermented foods thrive on prebiotic fiber. This synbiotic combination strengthens gut microbiome diversity and improves digestive health.'
    },
];

export function analyzeFood(imageFile) {
    // Simulate food analysis — randomly select a food
    const keys = Object.keys(foodDatabase);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const food = { ...foodDatabase[key] };

    // Add slight random variation
    food.calories = Math.round(food.calories * (0.9 + Math.random() * 0.2));
    food.protein = Math.round(food.protein * (0.9 + Math.random() * 0.2) * 10) / 10;
    food.carbs = Math.round(food.carbs * (0.9 + Math.random() * 0.2) * 10) / 10;
    food.fat = Math.round(food.fat * (0.9 + Math.random() * 0.2) * 10) / 10;

    // Select relevant food combinations
    const relevantCombos = foodCombinations
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

    return {
        food,
        combinations: relevantCombos,
        healthRating: Math.floor(Math.random() * 30) + 65,
        digestibilityScore: Math.floor(Math.random() * 25) + 70,
    };
}

export function getRandomFoodCombo() {
    return foodCombinations[Math.floor(Math.random() * foodCombinations.length)];
}
