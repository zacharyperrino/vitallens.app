import { icons } from '../icons.js';

// ─── Composite wellness score ─────────────────────────────────
// Scores ONLY the domains the user has actually logged. With fewer than two
// logged domains the result is `insufficient_data` — never a fabricated
// number. Weights are re-normalized over the domains present.

const WEIGHTS = {
    nutrition: 0.25,
    exercise: 0.20,
    sleep: 0.20,
    habits: 0.15,
    bodyMarkers: 0.10,
    environment: 0.10,
};
const MIN_DOMAINS = 2;

export function computeHealthScore(data = {}) {
    const scores = {};

    const cal = Number(data.dailyNutrition?.calories) || 0;
    if (cal > 0) scores.nutrition = clamp(85 - Math.abs(cal - 2000) / 30, 40, 100);

    const sessions = (data.exerciseLog || []).length;
    if (sessions > 0) scores.exercise = Math.min(100, 50 + sessions * 10);

    const sleep = data.sleepLog || [];
    if (sleep.length > 0) {
        const avg = sleep.reduce((s, e) => s + (Number(e.hours) || 0), 0) / sleep.length;
        if (avg > 0) scores.sleep = Math.max(30, 100 - Math.abs(avg - 7.5) * 15);
    }

    if (data.habits) {
        let h = 80;
        if (data.habits.smoking) h -= 30;
        if (data.habits.alcohol === 'heavy') h -= 20;
        else if (data.habits.alcohol === 'moderate') h -= 5;
        if (data.habits.water >= 8) h += 10;
        scores.habits = clamp(h, 20, 100);
    }

    const scans = data.bodyScans || [];
    const latestScore = Number(scans[0]?.overall_score ?? scans[0]?.overallScore);
    if (scans.length > 0 && Number.isFinite(latestScore)) scores.bodyMarkers = clamp(latestScore, 0, 100);

    const air = data.environmental?.airQuality;
    if (air) scores.environment = air === 'good' ? 85 : air === 'moderate' ? 65 : 45;

    const present = Object.keys(scores);
    const trend = data.weeklyScores?.length > 1
        ? data.weeklyScores[data.weeklyScores.length - 1] - data.weeklyScores[data.weeklyScores.length - 2]
        : 0;

    if (present.length < MIN_DOMAINS) {
        return { state: 'insufficient_data', overall: null, grade: null, breakdown: scores, domainsLogged: present, trend };
    }

    const totalWeight = present.reduce((s, k) => s + WEIGHTS[k], 0);
    const composite = present.reduce((s, k) => s + scores[k] * (WEIGHTS[k] / totalWeight), 0);
    const overall = Math.round(composite);
    const grade = overall >= 90 ? 'A+' : overall >= 80 ? 'A' : overall >= 70 ? 'B' : overall >= 60 ? 'C' : 'D';

    return { state: 'ok', overall, grade, breakdown: scores, domainsLogged: present, trend };
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ─── Rule-based observations (only for logged domains) ────────
export function getHealthInsights(healthData) {
    const score = computeHealthScore(healthData);
    const b = score.breakdown;
    const insights = [];

    if (b.sleep != null && b.sleep < 70) {
        insights.push({ type: 'warning', icon: icons.moon, title: 'Sleep worth a look',
            text: 'Your recent sleep entries are below your usual range. Many people find a consistent wind-down time helps.', color: 'var(--accent-amber)' });
    }
    if (b.habits != null && b.habits < 60) {
        insights.push({ type: 'alert', icon: icons.alert, title: 'Habits are weighing on your score',
            text: 'A couple of logged habits are pulling this number down. Small, steady changes tend to move it most.', color: 'var(--accent-amber)' });
    }
    if (b.nutrition != null && b.nutrition > 80) {
        insights.push({ type: 'positive', icon: icons.leaf, title: 'Nutrition looks steady',
            text: 'Your logged intake is close to your target. Keep the variety going.', color: 'var(--accent-green)' });
    }
    if (b.exercise != null && b.exercise < 65) {
        insights.push({ type: 'suggestion', icon: icons.activity, title: 'Room to move',
            text: 'A few more logged sessions this week would lift this domain. Short walks count.', color: 'var(--accent-blue)' });
    }
    if (score.state === 'insufficient_data') {
        insights.push({ type: 'suggestion', icon: icons.sparkle, title: 'Log a little more to unlock your score',
            text: 'Your wellness score appears once you have logged at least two areas — for example a meal and a night of sleep.', color: 'var(--accent)' });
    } else {
        insights.push({ type: 'positive', icon: icons.sparkle, title: 'Gentle reminder', text: getTip(), color: 'var(--accent-teal)' });
    }
    return insights;
}

// Neutral, non-quantified prompts. No unsourced physiological claims.
function getTip() {
    const tips = [
        'A short walk after a meal is a gentle way to support steady energy through the afternoon.',
        'A few slow breaths before bed can make it easier to settle.',
        'Getting some daylight soon after waking helps many people feel more alert.',
        'Keeping a glass of water nearby makes it easier to drink steadily through the day.',
        'Eating without a screen makes it easier to notice when you feel full.',
        'A consistent bedtime — even on weekends — tends to make mornings easier.',
    ];
    return tips[Math.floor(Math.random() * tips.length)];
}
