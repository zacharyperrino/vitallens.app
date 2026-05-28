// Simulated body/face biomarker analysis engine

const biomarkerCategories = {
    face: [
        {
            name: 'Skin Hydration', zone: 'Overall Face', icon: '💧',
            results: ['Well hydrated — healthy glow present', 'Mild dehydration detected — consider increasing water intake', 'Moderate dehydration — dry patches noted around cheeks'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Under-Eye Analysis', zone: 'Periorbital Region', icon: '👁️',
            results: ['Minimal dark circles — adequate sleep and iron levels', 'Mild dark circles — possible sleep deficiency or iron low', 'Pronounced dark circles & puffiness — check kidney function, allergies, sleep quality'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Skin Tone Evenness', zone: 'Cheeks & Forehead', icon: '✨',
            results: ['Even skin tone — balanced hormones', 'Mild hyperpigmentation — possible sun damage or hormonal fluctuation', 'Uneven tone with visible patches — hormonal imbalance or liver stress'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Lip Health', zone: 'Lips', icon: '👄',
            results: ['Healthy pink color — good circulation and B12 levels', 'Slightly pale lips — possible iron deficiency or anemia', 'Dry/cracked lips — B vitamin deficiency, dehydration'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Jawline Definition', zone: 'Jaw & Chin', icon: '🦴',
            results: ['Well-defined jawline — healthy weight and lymphatic flow', 'Mild puffiness — possible water retention or inflammation', 'Significant puffiness — check thyroid function, lymphatic drainage'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Forehead Lines', zone: 'Forehead', icon: '🧠',
            results: ['Minimal lines — good hydration and low stress', 'Light horizontal lines — early signs of stress or gut issues', 'Pronounced lines — chronic stress, possible digestive concerns'],
            severity: ['good', 'moderate', 'concerning']
        },
    ],
    body: [
        {
            name: 'Posture Assessment', zone: 'Spine & Shoulders', icon: '🧍',
            results: ['Good upright posture — balanced musculature', 'Mild forward head posture — tech neck developing', 'Rounded shoulders with anterior pelvic tilt — fascia restrictions likely'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Skin Elasticity', zone: 'Arms & Torso', icon: '🔬',
            results: ['Good skin elasticity — adequate collagen production', 'Mild loss of elasticity — consider collagen and vitamin C', 'Significant elasticity loss — possible nutrient deficiencies'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Nail Health', zone: 'Fingernails', icon: '💅',
            results: ['Strong, smooth nails — good mineral balance', 'Brittle nails with slight ridges — possible zinc or biotin deficiency', 'White spots & ridging — zinc, calcium, or selenium deficiency'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Hair Vitality', zone: 'Scalp & Hair', icon: '💇',
            results: ['Thick, shiny hair — excellent nutrition and hormonal balance', 'Mild thinning or dullness — check iron, biotin, vitamin D', 'Notable thinning — thyroid, hormonal, or significant nutritional deficit'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Body Composition', zone: 'Overall', icon: '⚖️',
            results: ['Healthy body composition — balanced muscle-to-fat ratio', 'Slightly elevated body fat — adjust diet and exercise', 'Composition imbalance — comprehensive lifestyle review recommended'],
            severity: ['good', 'moderate', 'concerning']
        },
        {
            name: 'Fascia Assessment', zone: 'Connective Tissue', icon: '🧬',
            results: ['Healthy fascia mobility — good range of motion', 'Mild fascial restrictions — incorporate stretching and myofascial release', 'Significant fascial adhesions — deep tissue work and mobility training needed'],
            severity: ['good', 'moderate', 'concerning']
        },
    ],
};

export function analyzeBody(imageFile, type = 'face') {
    const category = biomarkerCategories[type] || biomarkerCategories.face;

    const results = category.map(marker => {
        const idx = Math.floor(Math.random() * 3);
        return {
            name: marker.name,
            zone: marker.zone,
            icon: marker.icon,
            finding: marker.results[idx],
            severity: marker.severity[idx],
            confidence: Math.floor(Math.random() * 15) + 82,
        };
    });

    const goodCount = results.filter(r => r.severity === 'good').length;
    const overallScore = Math.round((goodCount / results.length) * 100);

    return {
        results,
        overallScore,
        scanType: type,
        recommendations: generateRecommendations(results),
    };
}

function generateRecommendations(results) {
    const recs = [];
    const concerning = results.filter(r => r.severity === 'concerning');
    const moderate = results.filter(r => r.severity === 'moderate');

    if (concerning.length > 0) {
        recs.push({
            priority: 'high',
            text: `${concerning.length} area(s) need attention. Consider consulting a healthcare professional for: ${concerning.map(c => c.name).join(', ')}.`,
        });
    }
    if (moderate.length > 0) {
        recs.push({
            priority: 'medium',
            text: `Monitor these areas: ${moderate.map(m => m.name).join(', ')}. Lifestyle adjustments may help.`,
        });
    }
    if (concerning.length === 0 && moderate.length === 0) {
        recs.push({
            priority: 'low',
            text: 'All markers look healthy! Continue your current wellness routine.',
        });
    }
    return recs;
}
