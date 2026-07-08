// Simulated stool analysis engine

const bristolScale = [
    { type: 1, name: 'Separate hard lumps', description: 'Severe constipation', health: 'concerning', icon: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' },
    { type: 2, name: 'Lumpy & sausage-like', description: 'Mild constipation', health: 'moderate', icon: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' },
    { type: 3, name: 'Sausage with cracks', description: 'Normal — slightly dry', health: 'good', icon: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-neutral);"></span>' },
    { type: 4, name: 'Smooth, soft sausage', description: 'Ideal — optimal digestion', health: 'excellent', icon: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-green);"></span>' },
    { type: 5, name: 'Soft blobs', description: 'Lacking fiber', health: 'moderate', icon: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-neutral);"></span>' },
    { type: 6, name: 'Fluffy, mushy pieces', description: 'Mild inflammation', health: 'moderate', icon: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' },
    { type: 7, name: 'Watery, no solid', description: 'Diarrhea — possible infection', health: 'concerning', icon: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' },
];

const colorAnalysis = [
    { color: 'Brown', meaning: 'Normal — healthy bile processing', health: 'good' },
    { color: 'Dark Brown', meaning: 'Normal — adequate fiber and hydration', health: 'good' },
    { color: 'Light Brown/Tan', meaning: 'May indicate low bile — check liver/gallbladder', health: 'moderate' },
    { color: 'Green', meaning: 'Rapid transit or high leafy green intake', health: 'moderate' },
    { color: 'Yellow', meaning: 'Possible fat malabsorption or celiac indicators', health: 'concerning' },
    { color: 'Black', meaning: 'Upper GI bleed possible — seek medical attention', health: 'concerning' },
    { color: 'Red-streaked', meaning: 'Lower GI issue possible — consult physician', health: 'concerning' },
    { color: 'Clay/Pale', meaning: 'Bile duct obstruction possible — urgent medical review', health: 'concerning' },
];

const deficiencyIndicators = [
    { name: 'Magnesium', sign: 'Hard, dry stools (Type 1-2)', recommendation: 'Increase magnesium-rich foods: nuts, seeds, dark chocolate, leafy greens' },
    { name: 'Fiber', sign: 'Loose or irregular consistency', recommendation: 'Aim for 25-35g daily: whole grains, vegetables, legumes, fruits' },
    { name: 'Probiotics', sign: 'Foul odor or irregular frequency', recommendation: 'Add fermented foods: yogurt, kefir, sauerkraut, kimchi' },
    { name: 'Digestive Enzymes', sign: 'Undigested food particles', recommendation: 'Consider digestive enzyme supplement, eat slowly, chew thoroughly' },
    { name: 'Hydration', sign: 'Dark color, hard consistency', recommendation: 'Drink at least 8 glasses of water daily, increase electrolytes' },
    { name: 'Bile Production', sign: 'Light colored or floating stools', recommendation: 'Support liver health: dandelion tea, bitter greens, milk thistle' },
];

export function analyzeStool(imageData) {
    const { data, width, height } = imageData;

    // ── 1. Color Heuristics (Sample 100 random pixels) ───────
    let sumR = 0, sumG = 0, sumB = 0, count = 100;
    for (let i = 0; i < count; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const idx = (y * width + x) * 4;
        sumR += data[idx]; sumG += data[idx + 1]; sumB += data[idx + 2];
    }
    const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;

    // Map avg color to nearest category in colorAnalysis
    let bestColor = colorAnalysis[0];
    let minDiff = Infinity;

    // Mock color mapping — in reality, we'd use Lab colorspace or predefined RGB ranges
    // Brown: ~100, 60, 30
    // Green: ~60, 100, 40
    // Yellow: ~180, 160, 40
    const colorCenters = [
        { r: 90, g: 60, b: 30, cat: colorAnalysis[0] }, // Brown
        { r: 70, g: 45, b: 25, cat: colorAnalysis[1] }, // Dark Brown
        { r: 160, g: 130, b: 80, cat: colorAnalysis[2] }, // Light Brown
        { r: 80, g: 120, b: 50, cat: colorAnalysis[3] }, // Green
        { r: 200, g: 180, b: 50, cat: colorAnalysis[4] }, // Yellow
        { r: 30, g: 25, b: 20, cat: colorAnalysis[5] }, // Black
        { r: 180, g: 60, b: 50, cat: colorAnalysis[6] }, // Red
        { r: 210, g: 200, b: 180, cat: colorAnalysis[7] }, // Pale
    ];

    colorCenters.forEach(center => {
        const diff = Math.sqrt((center.r - avgR) ** 2 + (center.g - avgG) ** 2 + (center.b - avgB) ** 2);
        if (diff < minDiff) { minDiff = diff; bestColor = center.cat; }
    });

    // ── 2. Texture Heuristics (Variance of luminance) ────────
    let sumL = 0, sumSqL = 0;
    for (let i = 0; i < count; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const idx = (y * width + x) * 4;
        const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        sumL += l; sumSqL += l * l;
    }
    const meanL = sumL / count;
    const varianceL = (sumSqL / count) - (meanL * meanL);

    // Map variance to Bristol Scale
    // Low variance = Smooth (Type 4, 7)
    // High variance = Lumpy/Cracked (Type 1, 2, 3)
    let bristolIdx = 3; // Default Type 4
    if (varianceL > 1500) bristolIdx = 1; // Type 2 (Lumpy)
    else if (varianceL > 800) bristolIdx = 2; // Type 3 (Cracked)
    else if (varianceL < 150) bristolIdx = 6; // Type 7 (Watery)
    else if (varianceL < 400) bristolIdx = 3; // Type 4 (Smooth)

    // Adjust based on overall lightness (Harder stools often darker/lower L)
    if (meanL < 50 && bristolIdx <= 2) bristolIdx = 0; // Type 1 (Severe constipation)
    if (meanL > 180 && bristolIdx >= 3) bristolIdx = 5; // Type 6 (Mushy)

    const bristol = bristolScale[bristolIdx];
    const color = bestColor;

    // Select 2-3 relevant deficiency indicators based on results
    const relevantDeficiencies = [];
    if (bristol.type <= 2) relevantDeficiencies.push(deficiencyIndicators[0], deficiencyIndicators[4]); // Magnesium, Hydration
    if (bristol.type >= 5) relevantDeficiencies.push(deficiencyIndicators[1], deficiencyIndicators[2]); // Fiber, Probiotics
    if (color.health === 'concerning' && color.color === 'Yellow') relevantDeficiencies.push(deficiencyIndicators[3], deficiencyIndicators[5]); // Enzymes, Bile

    // Fill if empty
    if (relevantDeficiencies.length < 2) {
        relevantDeficiencies.push(deficiencyIndicators[Math.floor(Math.random() * deficiencyIndicators.length)]);
    }

    // Gut health score
    let gutScore = 75;
    if (bristol.health === 'excellent') gutScore = 90 + Math.floor(Math.random() * 8);
    else if (bristol.health === 'good') gutScore = 75 + Math.floor(Math.random() * 15);
    else if (bristol.health === 'moderate') gutScore = 50 + Math.floor(Math.random() * 15);
    else gutScore = 25 + Math.floor(Math.random() * 20);

    // Penalty for bad color
    if (color.health === 'concerning') gutScore -= 20;

    const frequency = ['1x daily (optimal)', '2x daily (healthy)', '1x every 2 days (low)', '3x daily (high)'];
    const freqIdx = Math.floor(Math.random() * frequency.length);

    return {
        bristolType: bristol,
        color: color,
        deficiencies: [...new Set(relevantDeficiencies)],
        gutHealthScore: Math.max(5, gutScore),
        frequency: frequency[freqIdx],
        transitTime: `${12 + Math.floor(Math.random() * 40)} hours`,
        hydrationLevel: Math.floor(Math.random() * 40) + 55,
        microbiomeDiversity: Math.floor(Math.random() * 30) + 55,
        recommendations: [
            gutScore > 80 ? 'Maintain current dietary habits — gut health is strong' : 'Increase prebiotic fiber and probiotic-rich foods',
            bristol.type <= 2 ? 'Increase water and magnesium intake' : bristol.type >= 6 ? 'Add more soluble fiber and reduce inflammatory foods' : 'Consistency looks appropriate',
            'Regular exercise supports healthy gut motility',
        ],
    };
}
