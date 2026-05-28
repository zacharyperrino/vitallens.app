// Health score computation algorithm

export function computeHealthScore(data) {
    const weights = {
        nutrition: 0.20,
        exercise: 0.15,
        sleep: 0.15,
        habits: 0.15,
        bodyMarkers: 0.10,
        gutHealth: 0.10,
        environment: 0.08,
        mentalWellness: 0.07,
    };

    const scores = {};

    // Nutrition score
    const cal = data.dailyNutrition?.calories || 0;
    scores.nutrition = cal > 0 ? Math.min(100, Math.max(40, 85 - Math.abs(cal - 2000) / 30)) : 70;

    // Exercise score
    const exerciseCount = (data.exerciseLog || []).length;
    scores.exercise = Math.min(100, 50 + exerciseCount * 10);

    // Sleep score
    const sleepEntries = data.sleepLog || [];
    if (sleepEntries.length > 0) {
        const avgHours = sleepEntries.reduce((s, e) => s + (e.hours || 7), 0) / sleepEntries.length;
        scores.sleep = Math.max(30, 100 - Math.abs(avgHours - 7.5) * 15);
    } else {
        scores.sleep = 68;
    }

    // Habits score
    let habitScore = 80;
    if (data.habits?.smoking) habitScore -= 30;
    if (data.habits?.alcohol === 'heavy') habitScore -= 20;
    else if (data.habits?.alcohol === 'moderate') habitScore -= 5;
    if (data.habits?.water >= 8) habitScore += 10;
    scores.habits = Math.max(20, Math.min(100, habitScore));

    // Body markers
    const bodyScans = data.bodyScans || [];
    scores.bodyMarkers = bodyScans.length > 0 ? (bodyScans[0]?.overallScore || 70) : 72;

    // Gut health
    const stoolScans = data.stoolScans || [];
    scores.gutHealth = stoolScans.length > 0 ? (stoolScans[0]?.gutHealthScore || 72) : 72;

    // Environment
    const env = data.environmental || {};
    scores.environment = env.airQuality === 'good' ? 85 : env.airQuality === 'moderate' ? 65 : 45;

    // Mental wellness (derived from sleep + habits)
    scores.mentalWellness = Math.round((scores.sleep * 0.4 + scores.habits * 0.3 + scores.exercise * 0.3));

    // Weighted composite
    let composite = 0;
    Object.keys(weights).forEach(key => {
        composite += (scores[key] || 70) * weights[key];
    });

    return {
        overall: Math.round(composite),
        breakdown: scores,
        grade: composite >= 90 ? 'A+' : composite >= 80 ? 'A' : composite >= 70 ? 'B' : composite >= 60 ? 'C' : 'D',
        trend: data.weeklyScores?.length > 1
            ? (data.weeklyScores[data.weeklyScores.length - 1] - data.weeklyScores[data.weeklyScores.length - 2])
            : 0,
    };
}

export function getHealthInsights(healthData) {
    const insights = [];
    const score = computeHealthScore(healthData);

    if (score.breakdown.sleep < 70) {
        insights.push({
            type: 'warning',
            icon: '😴',
            title: 'Sleep Needs Attention',
            text: 'Your sleep score is below optimal. Aim for 7-8 hours of quality sleep. Consider limiting screen time before bed.',
            color: 'var(--accent-amber)',
        });
    }

    if (score.breakdown.habits < 60) {
        insights.push({
            type: 'alert',
            icon: '⚠️',
            title: 'Habit Impact on Health',
            text: 'Certain habits are significantly impacting your health score. Small changes can lead to major improvements.',
            color: 'var(--accent-coral)',
        });
    }

    if (score.breakdown.nutrition > 80) {
        insights.push({
            type: 'positive',
            icon: '🥗',
            title: 'Great Nutrition',
            text: 'Your nutritional intake is well-balanced. Keep up the good work with diverse, whole foods.',
            color: 'var(--accent-green)',
        });
    }

    if (score.breakdown.exercise < 65) {
        insights.push({
            type: 'suggestion',
            icon: '🏃',
            title: 'Move More',
            text: 'Increasing physical activity can boost your overall health score significantly. Even 20 minutes daily helps.',
            color: 'var(--accent-blue)',
        });
    }

    // Always add a positive insight
    insights.push({
        type: 'positive',
        icon: '💡',
        title: 'Daily Tip',
        text: getTip(),
        color: 'var(--accent-teal)',
    });

    return insights;
}

function getTip() {
    const tips = [
        'Drinking warm lemon water in the morning supports liver detoxification and boosts metabolism.',
        'Grounding (walking barefoot on earth) for 15 minutes reduces inflammation markers by up to 30%.',
        'Deep diaphragmatic breathing for 5 minutes activates the parasympathetic nervous system.',
        'Morning sunlight exposure within 30 min of waking regulates circadian rhythm and improves sleep quality.',
        'Cold exposure (cold showers) for 2-3 minutes increases norepinephrine and boosts immunity.',
        'Chewing food 20-30 times per bite significantly improves nutrient absorption and reduces bloating.',
        'A 10-minute post-meal walk reduces blood sugar spikes by up to 30%.',
        'Tongue scraping in the morning removes overnight bacterial buildup and improves taste sensitivity.',
    ];
    return tips[Math.floor(Math.random() * tips.length)];
}
