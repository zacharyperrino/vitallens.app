import { icons } from '../icons.js';

// Eastern Medicine knowledge base

export const doshaData = {
    vata: {
        name: 'Vata',
        element: 'Air + Ether',
        icon: icons.wind,
        color: 'var(--accent-purple)',
        colorDim: 'var(--accent-purple-dim)',
        qualities: ['Light', 'Dry', 'Cold', 'Mobile', 'Quick'],
        bodyType: 'Thin frame, long limbs, dry skin',
        personality: 'Creative, enthusiastic, quick-thinking, restless',
        strengths: ['Creativity', 'Flexibility', 'Quick learner', 'Multitasking'],
        imbalanceSigns: ['Anxiety', 'Insomnia', 'Dry skin', 'Constipation', 'Joint pain', 'Cold extremities'],
        foods: {
            favor: ['Warm soups', 'Cooked grains', 'Root vegetables', 'Ghee', 'Warm milk', 'Nuts & seeds'],
            avoid: ['Raw salads', 'Cold drinks', 'Dry crackers', 'Caffeine', 'Carbonated drinks'],
        },
        herbs: ['Ashwagandha', 'Ginger', 'Cinnamon', 'Cardamom', 'Licorice root'],
        lifestyle: ['Regular sleep schedule', 'Warm oil massage (Abhyanga)', 'Gentle yoga', 'Meditation', 'Warm baths'],
    },
    pitta: {
        name: 'Pitta',
        element: 'Fire + Water',
        icon: icons.zap,
        color: 'var(--accent-coral)',
        colorDim: 'var(--accent-coral-dim)',
        qualities: ['Hot', 'Sharp', 'Oily', 'Light', 'Intense'],
        bodyType: 'Medium build, warm skin, strong metabolism',
        personality: 'Ambitious, focused, intellectual, competitive',
        strengths: ['Leadership', 'Determination', 'Sharp intellect', 'Good digestion'],
        imbalanceSigns: ['Irritability', 'Heartburn', 'Skin rashes', 'Inflammation', 'Excessive hunger', 'Overheating'],
        foods: {
            favor: ['Cooling foods', 'Sweet fruits', 'Coconut', 'Leafy greens', 'Cucumber', 'Mint tea'],
            avoid: ['Spicy foods', 'Fermented foods', 'Red meat', 'Alcohol', 'Fried foods'],
        },
        herbs: ['Brahmi', 'Amalaki', 'Neem', 'Rose petal', 'Coriander'],
        lifestyle: ['Cool-down activities', 'Moonlight walks', 'Swimming', 'Nature time', 'Avoid overworking'],
    },
    kapha: {
        name: 'Kapha',
        element: 'Earth + Water',
        icon: icons.leaf,
        color: 'var(--accent-green)',
        colorDim: 'var(--accent-green-dim)',
        qualities: ['Heavy', 'Slow', 'Cool', 'Oily', 'Stable'],
        bodyType: 'Larger frame, soft skin, strong endurance',
        personality: 'Calm, nurturing, patient, loyal',
        strengths: ['Stability', 'Endurance', 'Compassion', 'Strong immunity'],
        imbalanceSigns: ['Weight gain', 'Lethargy', 'Congestion', 'Water retention', 'Depression', 'Oversleeping'],
        foods: {
            favor: ['Light, warm meals', 'Legumes', 'Bitter greens', 'Honey', 'Spicy foods', 'Herbal teas'],
            avoid: ['Heavy dairy', 'Fried foods', 'Sweet desserts', 'Cold foods', 'Excessive salt'],
        },
        herbs: ['Trikatu', 'Guggulu', 'Tulsi', 'Triphala', 'Ginger'],
        lifestyle: ['Vigorous exercise', 'Early rising', 'Dry brushing', 'Variety in routine', 'Stimulating activities'],
    },
};

export const doshaQuiz = [
    {
        question: 'What best describes your body frame?',
        options: [
            { text: 'Thin, light, tall or short, narrow shoulders', dosha: 'vata' },
            { text: 'Medium build, proportional, athletic', dosha: 'pitta' },
            { text: 'Larger build, broad shoulders, solid frame', dosha: 'kapha' },
        ],
    },
    {
        question: 'How is your natural skin?',
        options: [
            { text: 'Dry, rough, thin, cool to touch', dosha: 'vata' },
            { text: 'Warm, slightly oily, sensitive, prone to redness', dosha: 'pitta' },
            { text: 'Thick, oily, smooth, cool, moist', dosha: 'kapha' },
        ],
    },
    {
        question: 'How is your digestion?',
        options: [
            { text: 'Irregular — sometimes good, sometimes bloated', dosha: 'vata' },
            { text: 'Strong — I get very hungry and irritable if I miss a meal', dosha: 'pitta' },
            { text: 'Slow but steady — I can skip meals without issue', dosha: 'kapha' },
        ],
    },
    {
        question: 'How do you handle stress?',
        options: [
            { text: 'I become anxious, worried, or overwhelmed', dosha: 'vata' },
            { text: 'I become frustrated, angry, or critical', dosha: 'pitta' },
            { text: 'I withdraw, become complacent, or eat for comfort', dosha: 'kapha' },
        ],
    },
    {
        question: 'What is your sleep pattern?',
        options: [
            { text: 'Light sleeper, difficulty falling asleep, wake easily', dosha: 'vata' },
            { text: 'Moderate sleep, can fall asleep but wake in the night', dosha: 'pitta' },
            { text: 'Deep, heavy sleep — hard to wake up, love sleeping in', dosha: 'kapha' },
        ],
    },
    {
        question: 'Your natural learning style?',
        options: [
            { text: 'Quick to learn, quick to forget', dosha: 'vata' },
            { text: 'Focused learner, sharp memory', dosha: 'pitta' },
            { text: 'Slow to learn, but never forget', dosha: 'kapha' },
        ],
    },
    {
        question: 'What climate do you prefer?',
        options: [
            { text: 'Warm, humid — I dislike cold and wind', dosha: 'vata' },
            { text: 'Cool, well-ventilated — I overheat easily', dosha: 'pitta' },
            { text: 'Warm and dry — I dislike cold and damp', dosha: 'kapha' },
        ],
    },
];

export const faceMappingZones = [
    {
        id: 'forehead', name: 'Forehead', organ: 'Small Intestine / Bladder', position: { top: '8%', left: '30%', width: '40%', height: '15%' },
        signs: ['Redness: traditionally linked to stress or digestion', 'Acne: traditionally linked to diet and digestion', 'Lines: traditionally linked to worry or excess sugar'],
        tcmMeridian: 'Bladder & Small Intestine Meridian',
        recommendations: ['Improve digestion with warm, cooked foods', 'Reduce processed sugar and alcohol', 'Practice stress management techniques']
    },
    {
        id: 'betweenBrows', name: 'Between Brows', organ: 'Liver', position: { top: '22%', left: '40%', width: '20%', height: '10%' },
        signs: ['Vertical lines: traditionally read as liver qi stagnation', 'Redness: traditionally linked to rich foods or alcohol', 'Puffiness: traditionally linked to held-in emotion'],
        tcmMeridian: 'Liver & Gallbladder Meridian',
        recommendations: ['Reduce alcohol and greasy foods', 'Practice anger management', 'Eat more bitter greens to support liver']
    },
    {
        id: 'leftCheek', name: 'Left Cheek', organ: 'Stomach / Liver', position: { top: '40%', left: '10%', width: '22%', height: '20%' },
        signs: ['Breakouts: traditionally read as stomach or liver qi', 'Redness: traditionally linked to diet and heat', 'Dryness: traditionally read as lung qi'],
        tcmMeridian: 'Stomach & Lung Meridian',
        recommendations: ['Check for food sensitivities', 'Eat more cooling foods', 'Practice deep breathing exercises']
    },
    {
        id: 'rightCheek', name: 'Right Cheek', organ: 'Lungs / Large Intestine', position: { top: '40%', left: '68%', width: '22%', height: '20%' },
        signs: ['Breakouts: traditionally read as lung qi', 'Redness: traditionally linked to smoke or air quality', 'Dullness: traditionally linked to circulation'],
        tcmMeridian: 'Lung & Large Intestine Meridian',
        recommendations: ['Improve air quality in your environment', 'Practice breathwork and cardio exercise', 'Increase antioxidant-rich foods']
    },
    {
        id: 'nose', name: 'Nose', organ: 'Heart / Cardiovascular', position: { top: '30%', left: '38%', width: '24%', height: '18%' },
        signs: ['Redness: traditionally linked to circulation', 'Blackheads: traditionally read as heart qi stagnation', 'Swelling: traditionally linked to internal heat'],
        tcmMeridian: 'Heart Meridian',
        recommendations: ['Gentle cardiovascular movement', 'Favour lighter, less processed meals', 'Notice how sleep and stress affect this area']
    },
    {
        id: 'chin', name: 'Chin', organ: 'Reproductive / Hormonal', position: { top: '72%', left: '30%', width: '40%', height: '15%' },
        signs: ['Breakouts: traditionally linked to hormonal rhythm', 'Darkness: traditionally read as kidney qi', 'Puffiness: traditionally linked to lymphatic flow'],
        tcmMeridian: 'Kidney & Reproductive Meridian',
        recommendations: ['Keep a regular sleep rhythm', 'Stay well hydrated', 'Notice patterns across your cycle or month']
    },
    {
        id: 'jawline', name: 'Jawline', organ: 'Colon / Lymphatic', position: { top: '62%', left: '12%', width: '76%', height: '12%' },
        signs: ['Breakouts: traditionally linked to digestion', 'Puffiness: traditionally linked to lymphatic flow', 'Tension: often linked to stress or jaw clenching'],
        tcmMeridian: 'Large Intestine & Stomach Meridian',
        recommendations: ['Support colon health with fiber and water', 'Practice lymphatic drainage massage', 'Release jaw tension with relaxation techniques']
    },
];

export const tongueDiagnosis = [
    { condition: 'Pale Tongue', meaning: 'Qi or blood pattern — traditionally linked to low energy', recommendation: 'Iron-rich foods, warming herbs' },
    { condition: 'Red Tongue', meaning: 'Excess heat pattern — traditionally linked to stress or overheating', recommendation: 'Cooling foods, peppermint tea, reduce spicy foods' },
    { condition: 'Purple Tongue', meaning: 'Blood stasis pattern — traditionally linked to circulation', recommendation: 'Increase movement, turmeric, and warming spices' },
    { condition: 'Thick White Coating', meaning: 'Cold and dampness pattern — traditionally linked to digestion', recommendation: 'Warm, cooked foods, ginger tea, avoid dairy' },
    { condition: 'Yellow Coating', meaning: 'Heat and dampness pattern — traditionally linked to rich food and alcohol', recommendation: 'Bitter herbs, reduce alcohol and sugar' },
    { condition: 'Cracked Tongue', meaning: 'Yin pattern — traditionally linked to dryness', recommendation: 'Hydrating foods, marshmallow root, adequate water' },
    { condition: 'Swollen/Tooth-marked', meaning: 'Spleen qi pattern — traditionally linked to digestion', recommendation: 'Easy-to-digest meals, avoid raw/cold foods' },
];
