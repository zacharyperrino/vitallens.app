// AI Health Copilot — client-side conversational health engine
import { store } from '../store.js';

/* ─── Data summarizer ─────────────────────────────────────────── */

function getHealthContext() {
    const d = store.getAll();
    const p = d.profile || {};
    const meals = d.meals || [];
    const scans = d.scanHistory || [];
    const bodyScans = d.bodyScans || [];
    const hr = d.hrReadings || [];
    const labs = d.labResults || [];
    const exercise = d.exerciseLog || [];
    const sleep = d.sleepLog || [];
    const habits = d.habits || {};
    const env = d.environmental || {};
    const dosha = d.dosha;
    const nutr = d.dailyNutrition || {};
    const streaks = d.streaks || {};
    const strava = d.strava || {};
    const oura = d.oura || {};

    // Compute quick aggregates
    const todayISO = new Date().toISOString().slice(0, 10);
    const todayMeals = meals.filter(m => (m.timestamp || '').startsWith(todayISO));
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const weekMeals = meals.filter(m => (m.timestamp || '') >= weekAgo);
    const weekExercise = exercise.filter(e => (e.timestamp || e.date || '') >= weekAgo);
    const weekSleep = sleep.filter(s => (s.timestamp || s.date || '') >= weekAgo);
    const recentScans = scans.slice(0, 5);
    const recentLabs = labs.slice(0, 5);

    const avgSleep = weekSleep.length
        ? (weekSleep.reduce((s, e) => s + (parseFloat(e.hours || e.duration) || 0), 0) / weekSleep.length).toFixed(1)
        : null;

    const totalExMins = weekExercise.reduce((s, e) => s + (parseInt(e.duration || e.minutes) || 0), 0);

    const bmi = (p.height && p.weight)
        ? (parseFloat(p.weight) / ((parseFloat(p.height) / 100) ** 2)).toFixed(1)
        : null;

    return {
        profile: p, bmi,
        nutrition: { daily: nutr, todayMeals, weekMeals, totalMeals: meals.length },
        exercise: { weekExercise, totalExMins, totalSessions: exercise.length, stravaConnected: !!strava.accessToken },
        sleep: { weekSleep, avgSleep, totalEntries: sleep.length },
        scans: { recent: recentScans, total: scans.length, bodyScans },
        labs: { recent: recentLabs, total: labs.length },
        hr: { readings: hr.slice(0, 10), total: hr.length },
        habits, env, dosha, streaks,
        healthScore: d.healthScore || 0,
        weeklyScores: d.weeklyScores || [],
        oura: {
            connected: !!oura.accessToken,
            readiness: oura.readiness || [],
            sleep: oura.sleep || [],
            activity: oura.activity || []
        }
    };
}

/* ─── Intent classifier ───────────────────────────────────────── */

const INTENTS = [
    { key: 'greeting', patterns: [/^(hi|hello|hey|howdy|sup|yo|good\s*(morning|evening|afternoon))/i] },
    { key: 'nutrition', patterns: [/nutri/i, /diet/i, /calori/i, /macro/i, /protein/i, /carb/i, /fat\b/i, /food/i, /meal/i, /eat/i] },
    { key: 'exercise', patterns: [/exercis/i, /workout/i, /fitness/i, /steps/i, /run/i, /training/i, /active/i, /strava/i] },
    { key: 'sleep', patterns: [/sleep/i, /rest/i, /insomnia/i, /tired/i, /fatigue/i, /nap/i] },
    { key: 'labs', patterns: [/lab/i, /blood/i, /test result/i, /cholesterol/i, /glucose/i, /hemoglobin/i, /vitamin/i, /iron/i] },
    { key: 'scan', patterns: [/scan/i, /biomarker/i, /body scan/i, /face scan/i, /skin/i, /eye/i, /jaundice/i] },
    { key: 'heartrate', patterns: [/heart\s*rate/i, /pulse/i, /hr\b/i, /hrv/i, /bpm/i, /rppg/i] },
    { key: 'bmi', patterns: [/bmi/i, /body mass/i, /weight/i, /height/i, /overweight/i, /underweight/i] },
    { key: 'dosha', patterns: [/dosha/i, /ayurved/i, /vata/i, /pitta/i, /kapha/i] },
    { key: 'habits', patterns: [/habit/i, /smoking/i, /alcohol/i, /caffeine/i, /water/i, /hydrat/i] },
    { key: 'stress', patterns: [/stress/i, /mental/i, /anxiety/i, /mood/i, /mindful/i, /meditat/i] },
    { key: 'streak', patterns: [/streak/i, /consistency/i, /progress/i, /goal/i] },
    { key: 'readiness', patterns: [/readi/i, /recover/i, /oura/i, /ring/i, /prepared/i] },
    { key: 'score', patterns: [/health\s*score/i, /overall/i, /grade/i, /how\s*am\s*i/i, /summary/i, /overview/i] },
    { key: 'trend', patterns: [/trend/i, /over\s*time/i, /improv/i, /getting\s*(better|worse)/i, /change/i, /history/i] },
    { key: 'tips', patterns: [/tip/i, /advice/i, /suggest/i, /recommend/i, /should\s*i/i, /help/i, /what\s*can/i, /how\s*(to|do)/i] },
];

function classifyIntent(msg) {
    const lower = msg.toLowerCase().trim();
    for (const intent of INTENTS) {
        if (intent.patterns.some(p => p.test(lower))) return intent.key;
    }
    return 'general';
}

/* ─── Response generators ─────────────────────────────────────── */

const generators = {

    greeting(ctx) {
        const name = ctx.profile.name || 'Explorer';
        const hour = new Date().getHours();
        const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        return {
            text: `${greet}, ${name}! 👋\n\nI'm your VitalLens Health Copilot. I can analyze your nutrition, sleep, exercise, scan results, labs, and more.\n\nTry asking me:\n• "How's my nutrition this week?"\n• "Analyze my sleep patterns"\n• "What do my scan results show?"`,
            chips: ['How\'s my score?', 'Nutrition summary', 'Sleep analysis', 'Scan results'],
        };
    },

    nutrition(ctx) {
        const { daily, todayMeals, weekMeals, totalMeals } = ctx.nutrition;
        const cals = daily.calories || 0;
        const prot = daily.protein || 0;
        const carbs = daily.carbs || 0;
        const fat = daily.fat || 0;

        let text = `## 🍎 Nutrition Analysis\n\n`;
        text += `**Today's Intake**\n`;
        text += `| Macro | Amount | Target |\n|-------|--------|--------|\n`;
        text += `| Calories | ${cals} kcal | ~2,000 |\n`;
        text += `| Protein | ${prot}g | ~50g |\n`;
        text += `| Carbs | ${carbs}g | ~250g |\n`;
        text += `| Fat | ${fat}g | ~65g |\n\n`;
        text += `📊 **Meals today:** ${todayMeals.length} | **This week:** ${weekMeals.length} | **All time:** ${totalMeals}\n\n`;

        if (cals === 0 && todayMeals.length === 0) {
            text += `⚠️ No meals logged today. Use the Food Scanner to snap a photo of your next meal!\n`;
        } else if (prot < 30) {
            text += `💡 **Tip:** Your protein looks low. Consider adding eggs, Greek yogurt, or lean chicken to your next meal.\n`;
        } else if (cals > 2500) {
            text += `💡 **Tip:** Calorie intake is above average. Focus on nutrient-dense foods and portion control.\n`;
        } else {
            text += `✅ Your nutrition looks balanced! Keep up the great work.\n`;
        }

        return {
            text,
            chips: ['Exercise summary', 'Sleep analysis', 'Any tips?'],
            stats: [
                { label: 'Calories', value: `${cals}`, color: 'teal' },
                { label: 'Protein', value: `${prot}g`, color: 'blue' },
                { label: 'Meals Today', value: `${todayMeals.length}`, color: 'purple' },
            ],
        };
    },

    exercise(ctx) {
        const { weekExercise, totalExMins, totalSessions, stravaConnected } = ctx.exercise;
        let text = `## 🏃 Exercise Analysis\n\n`;
        text += `**This week:** ${weekExercise.length} sessions • ${totalExMins} minutes total\n`;
        text += `**All time:** ${totalSessions} sessions logged\n\n`;

        const target = 150; // WHO recommended minutes/week
        const pct = Math.min(100, Math.round((totalExMins / target) * 100));
        text += `📊 **Weekly target:** ${totalExMins}/${target} min (${pct}%)\n\n`;

        if (totalExMins === 0) {
            text += `⚠️ No exercise logged this week. Even a 20-minute walk can boost your mood and cardiovascular health!\n`;
        } else if (totalExMins >= target) {
            text += `🎉 You've hit the WHO recommended 150 min/week — excellent!\n`;
        } else {
            const remaining = target - totalExMins;
            text += `💡 You need **${remaining} more minutes** to hit the weekly target. A quick jog or yoga session can help!\n`;
        }

        if (stravaConnected) {
            text += `\n✅ Strava is connected — your activities sync automatically.\n`;
        } else {
            text += `\n💡 Connect Strava in the Log → Exercise tab to sync workouts automatically.\n`;
        }

        if (weekExercise.length > 0) {
            text += `\n**Recent workouts:**\n`;
            weekExercise.slice(0, 3).forEach(e => {
                const type = e.type || e.activity || 'Workout';
                const dur = e.duration || e.minutes || '?';
                text += `• ${type} — ${dur} min\n`;
            });
        }

        return {
            text,
            chips: ['Nutrition summary', 'Sleep analysis', 'Tips for exercise'],
            stats: [
                { label: 'This Week', value: `${totalExMins} min`, color: 'blue' },
                { label: 'Sessions', value: `${weekExercise.length}`, color: 'teal' },
                { label: 'Target', value: `${pct}%`, color: pct >= 100 ? 'green' : 'amber' },
            ],
        };
    },

    sleep(ctx) {
        const { weekSleep, avgSleep, totalEntries } = ctx.sleep;
        let text = `## 😴 Sleep Analysis\n\n`;
        text += `**This week:** ${weekSleep.length} entries logged\n`;
        text += `**Average sleep:** ${avgSleep || 'N/A'} hours/night\n`;

        if (ctx.oura.connected && ctx.oura.sleep.length > 0) {
            const ouraLatest = ctx.oura.sleep[0];
            text += `**Oura Sleep Score:** ${ouraLatest.score} (Optimal)\n`;
            const durationHrs = (ouraLatest.total_sleep / 3600).toFixed(1);
            text += `**Oura Sleep Duration:** ${durationHrs} hours\n`;
        }

        text += `**Total entries:** ${totalEntries}\n\n`;

        if (weekSleep.length === 0) {
            text += `⚠️ No sleep data this week. Log your sleep in the Log tab to get personalized insights.\n`;
        } else {
            const avg = parseFloat(avgSleep) || 0;
            if (avg < 6) {
                text += `🔴 **Alert:** Averaging less than 6 hours. Chronic sleep deprivation increases risk of heart disease, obesity, and cognitive decline.\n\n`;
                text += `💡 **Tips:**\n• Set a consistent bedtime alarm\n• Avoid screens 1 hour before bed\n• Keep your room cool (65-68°F)\n• Limit caffeine after 2 PM\n`;
            } else if (avg < 7) {
                text += `🟡 **Borderline:** You're below the recommended 7-9 hours. Try adding 30 minutes to your sleep schedule.\n`;
            } else if (avg <= 9) {
                text += `✅ Your sleep duration is in the **optimal 7-9 hour range**. Great job!\n`;
            } else {
                text += `⚠️ Sleeping more than 9 hours regularly may indicate an underlying condition. Consider consulting your doctor.\n`;
            }

            if (weekSleep.length >= 3) {
                const qualities = weekSleep.map(s => s.quality || s.score || 0).filter(q => q > 0);
                if (qualities.length > 0) {
                    const avgQ = (qualities.reduce((a, b) => a + b, 0) / qualities.length).toFixed(0);
                    text += `\n📊 **Average sleep quality:** ${avgQ}/10\n`;
                }
            }
        }

        return {
            text,
            chips: ['Exercise summary', 'Nutrition summary', 'Stress tips'],
            stats: [
                { label: 'Avg Hours', value: avgSleep || '—', color: 'purple' },
                { label: 'Entries', value: `${weekSleep.length}`, color: 'teal' },
            ],
        };
    },

    labs(ctx) {
        const { recent, total } = ctx.labs;
        let text = `## 🧪 Lab Results Summary\n\n`;
        text += `**Total lab entries:** ${total}\n\n`;

        if (total === 0) {
            text += `No lab results logged yet. Go to Log → Labs to add your blood work, metabolic panel, or other test results for personalized analysis.\n`;
        } else {
            text += `**Recent results:**\n`;
            recent.forEach(lab => {
                const name = lab.name || lab.test || 'Test';
                const val = lab.value || lab.result || '—';
                const unit = lab.unit || '';
                const status = lab.status || lab.severity || 'normal';
                const icon = status === 'normal' || status === 'good' ? '✅' : status === 'high' || status === 'elevated' ? '🔴' : '🟡';
                text += `${icon} **${name}:** ${val} ${unit} — ${status}\n`;
            });

            const abnormal = recent.filter(l => l.status !== 'normal' && l.status !== 'good' && l.severity !== 'good');
            if (abnormal.length > 0) {
                text += `\n⚠️ ${abnormal.length} result(s) outside normal range. Please discuss with your healthcare provider.\n`;
            } else {
                text += `\n✅ All recent results appear within normal ranges.\n`;
            }
        }

        return {
            text,
            chips: ['Health score', 'Scan results', 'Any concerns?'],
            stats: [
                { label: 'Total Labs', value: `${total}`, color: 'blue' },
                { label: 'Recent', value: `${recent.length}`, color: 'teal' },
            ],
        };
    },

    scan(ctx) {
        const { recent, total } = ctx.scans;
        let text = `## 🔬 Scan Results\n\n`;
        text += `**Total scans:** ${total}\n\n`;

        if (total === 0) {
            text += `No scans yet! Use the Biomarker Scanner to run a Face Scan, Eye Check, Heart Rate measurement, Skin Check, or Body Scan.\n`;
        } else {
            text += `**Recent scans:**\n`;
            recent.forEach(s => {
                const mode = s.mode || s.type || 'Scan';
                const score = s.overallScore || s.score || '—';
                const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString() : 'Recent';
                const risk = s.riskLevel || (score >= 80 ? 'Low Risk' : score >= 50 ? 'Moderate' : 'High Risk');
                const icon = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
                text += `${icon} **${mode}** — Score: ${score}% • ${risk} • ${date}\n`;
            });

            // Look for trends
            if (recent.length >= 2) {
                const scores = recent.map(s => s.overallScore || s.score || 0);
                const latest = scores[0];
                const prev = scores[1];
                const diff = latest - prev;
                if (diff > 5) text += `\n📈 Your latest scan improved by **+${diff}%** compared to the previous one!\n`;
                else if (diff < -5) text += `\n📉 Your latest scan dropped by **${diff}%** — consider following the recommendations.\n`;
                else text += `\n📊 Scan results are stable. Keep monitoring regularly.\n`;
            }
        }

        return {
            text,
            chips: ['Heart rate data', 'Lab results', 'Health score'],
            stats: [
                { label: 'Total Scans', value: `${total}`, color: 'purple' },
            ],
        };
    },

    heartrate(ctx) {
        const { readings, total } = ctx.hr;
        let text = `## 💓 Heart Rate Data\n\n`;
        text += `**Total readings:** ${total}\n\n`;

        if (total === 0) {
            text += `No heart rate data yet. Use the Biomarker Scanner → Heart Rate mode to measure your resting heart rate using rPPG technology.\n`;
        } else {
            const bpms = readings.map(r => r.bpm || r.hr || 0).filter(b => b > 0);
            if (bpms.length > 0) {
                const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
                const min = Math.min(...bpms);
                const max = Math.max(...bpms);
                text += `| Metric | Value |\n|--------|-------|\n`;
                text += `| Average | ${avg} BPM |\n`;
                text += `| Lowest | ${min} BPM |\n`;
                text += `| Highest | ${max} BPM |\n\n`;

                if (avg < 60) text += `💡 Below 60 BPM — if you're an athlete, this is normal (bradycardia). Otherwise, consult your doctor.\n`;
                else if (avg <= 100) text += `✅ Your resting heart rate is in the **normal 60-100 BPM range**.\n`;
                else text += `⚠️ Resting HR above 100 BPM (tachycardia). If persistent, consult your healthcare provider.\n`;

                // Fitness zones
                if (avg >= 60 && avg < 70) text += `🏆 This is an excellent resting heart rate, suggesting good cardiovascular fitness.\n`;
            }
        }

        return {
            text,
            chips: ['Scan results', 'Exercise summary', 'Stress tips'],
            stats: total > 0 ? [
                { label: 'Latest', value: `${readings[0]?.bpm || '—'} BPM`, color: 'coral' },
                { label: 'Readings', value: `${total}`, color: 'teal' },
            ] : [],
        };
    },

    bmi(ctx) {
        const { profile, bmi } = ctx;
        let text = `## ⚖️ Body Composition\n\n`;

        if (!bmi) {
            text += `I need your height and weight to calculate BMI. Update your Profile to get personalized body composition insights.\n`;
        } else {
            const b = parseFloat(bmi);
            let category, icon;
            if (b < 18.5) { category = 'Underweight'; icon = '🟡'; }
            else if (b < 25) { category = 'Normal'; icon = '🟢'; }
            else if (b < 30) { category = 'Overweight'; icon = '🟡'; }
            else { category = 'Obese'; icon = '🔴'; }

            text += `| Metric | Value |\n|--------|-------|\n`;
            text += `| Height | ${profile.height} cm |\n`;
            text += `| Weight | ${profile.weight} kg |\n`;
            text += `| BMI | ${bmi} |\n`;
            text += `| Category | ${icon} ${category} |\n\n`;

            if (category === 'Normal') {
                text += `✅ Your BMI is within the healthy range. Maintain with balanced nutrition and regular exercise.\n`;
            } else if (category === 'Underweight') {
                text += `💡 Consider increasing caloric intake with nutrient-dense foods. Consult a nutritionist for personalized guidance.\n`;
            } else {
                text += `💡 Focus on a balanced diet and aim for 150+ min/week of moderate exercise. Small, consistent changes yield the best results.\n`;
            }

            text += `\n> ⚠️ BMI is a rough screening tool and doesn't account for muscle mass, bone density, or body fat distribution.\n`;
        }

        return {
            text,
            chips: ['Nutrition summary', 'Exercise plan', 'Health score'],
            stats: bmi ? [
                { label: 'BMI', value: bmi, color: parseFloat(bmi) < 25 ? 'green' : 'amber' },
                { label: 'Weight', value: `${profile.weight} kg`, color: 'teal' },
            ] : [],
        };
    },

    dosha(ctx) {
        const dosha = ctx.dosha;
        let text = `## 🧘 Ayurvedic Dosha\n\n`;

        if (!dosha) {
            text += `You haven't taken the Dosha Quiz yet! Go to the Ayurveda section from the dashboard to discover your constitution (Prakriti).\n\n`;
            text += `The three doshas are:\n• **Vata** — Air & Space: Creative, energetic, tends toward anxiety\n• **Pitta** — Fire & Water: Focused, driven, tends toward inflammation\n• **Kapha** — Earth & Water: Calm, steady, tends toward lethargy\n`;
        } else {
            const doshaName = typeof dosha === 'string' ? dosha : dosha.primary || dosha.name || 'Unknown';
            text += `Your dominant dosha is: **${doshaName}** 🌿\n\n`;

            const advice = {
                Vata: { foods: 'warm, cooked, oily foods', avoid: 'cold, raw, dry foods', exercise: 'yoga, walking, swimming', time: 'maintain regular routines' },
                Pitta: { foods: 'cooling, sweet, bitter foods', avoid: 'spicy, acidic, fried foods', exercise: 'swimming, moonlit walks, moderate cardio', time: 'avoid midday sun' },
                Kapha: { foods: 'light, warm, spicy foods', avoid: 'heavy, sweet, oily foods', exercise: 'vigorous cardio, HIIT, running', time: 'wake early, stay active' },
            };

            const rec = advice[doshaName] || advice.Vata;
            text += `**Recommendations for ${doshaName}:**\n`;
            text += `• 🍽️ **Favor:** ${rec.foods}\n`;
            text += `• 🚫 **Limit:** ${rec.avoid}\n`;
            text += `• 🏃 **Exercise:** ${rec.exercise}\n`;
            text += `• ⏰ **Lifestyle:** ${rec.time}\n`;
        }

        return {
            text,
            chips: ['Health score', 'Nutrition tips', 'Sleep analysis'],
        };
    },

    habits(ctx) {
        const h = ctx.habits;
        let text = `## 🧬 Habits Profile\n\n`;
        text += `| Habit | Status |\n|-------|--------|\n`;
        text += `| 🚬 Smoking | ${h.smoking ? '🔴 Yes' : '✅ No'} |\n`;
        text += `| 🍷 Alcohol | ${h.alcohol || 'None'} |\n`;
        text += `| ☕ Caffeine | ${h.caffeine || 'Moderate'} |\n`;
        text += `| 💧 Water | ${h.water || 8} glasses/day |\n\n`;

        if (h.smoking) text += `⚠️ Smoking is the #1 preventable cause of death. Consider cessation resources.\n\n`;
        const waterGoal = 8;
        const water = parseInt(h.water) || 0;
        if (water < waterGoal) {
            text += `💧 You're drinking ${water}/${waterGoal} glasses. Try keeping a water bottle at your desk and setting hourly reminders.\n`;
        } else {
            text += `✅ Great hydration! ${water} glasses/day meets the recommended intake.\n`;
        }

        return {
            text,
            chips: ['Sleep analysis', 'Exercise summary', 'Health score'],
        };
    },

    stress(ctx) {
        const { sleep, exercise, habits } = ctx;
        let text = `## 🧠 Stress & Mental Wellness\n\n`;
        text += `Here's what your data suggests about stress management:\n\n`;

        // Sleep quality as stress indicator
        const avgSleep = parseFloat(sleep.avgSleep) || 0;
        if (avgSleep > 0 && avgSleep < 6) {
            text += `🔴 **Sleep deficit detected** — averaging ${sleep.avgSleep}h/night. Poor sleep significantly amplifies stress.\n\n`;
        } else if (avgSleep >= 7) {
            text += `✅ **Sleep is adequate** (${sleep.avgSleep}h/night) — this supports stress resilience.\n\n`;
        }

        // Exercise as stress buffer
        if (exercise.totalExMins >= 150) {
            text += `✅ **Active lifestyle** — ${exercise.totalExMins} min/week. Exercise is one of the best stress buffers.\n\n`;
        } else {
            text += `💡 **More movement helps** — even 20 min/day of walking reduces cortisol levels.\n\n`;
        }

        // Caffeine
        if (habits.caffeine === 'high' || habits.caffeine === 'heavy') {
            text += `⚠️ High caffeine intake may worsen anxiety. Consider switching to green tea after noon.\n\n`;
        }

        text += `**Quick stress-relief techniques:**\n`;
        text += `• 🫁 Box breathing: 4-4-4-4 count (inhale-hold-exhale-hold)\n`;
        text += `• 🧘 5-min body scan meditation\n`;
        text += `• 🚶 10-minute nature walk\n`;
        text += `• ✍️ 3 things you're grateful for today\n`;

        return {
            text,
            chips: ['Sleep analysis', 'Exercise tips', 'Health score'],
        };
    },

    readiness(ctx) {
        if (!ctx.oura.connected) {
            return {
                text: `## 💍 Oura Readiness\n\nIt looks like your Oura Ring isn't connected yet. Integrating Oura allows me to analyze your daily recovery, HRV balance, and activity preparation.\n\nConnect your ring in the **Profile** section to get started!`,
                chips: ['How to connect?', 'View profile', 'Health score'],
            };
        }

        const latest = ctx.oura.readiness[0];
        const prev = ctx.oura.readiness[1];
        let text = `## 💍 Oura Readiness Analysis\n\n`;
        text += `# ${latest.score} / 100\n\n`;

        if (prev) {
            const diff = latest.score - prev.score;
            text += `📊 **Trend:** ${diff >= 0 ? '+' : ''}${diff} points compared to yesterday.\n\n`;
        }

        text += `**Recovery Insights:**\n`;
        if (latest.score >= 85) {
            text += `🔥 **Optimal Readiness!** Your body is fully recovered and ready for high-intensity activity today.\n`;
        } else if (latest.score >= 70) {
            text += `✅ **Good Recovery.** You're balanced and ready for a standard training session.\n`;
        } else {
            text += `⚠️ **Pay Attention.** Your recovery is lower than usual. Consider a lighter active recovery day or more rest.\n`;
        }

        const contributors = latest.contributors || {};
        text += `\n**Key Factors:**\n`;
        text += `• Sleep Balance: ${contributors.sleep_balance}/100\n`;
        text += `• Recovery Index: ${contributors.recovery_index}/100\n`;
        text += `• HRV Balance: ${contributors.hrv_balance}/100\n`;

        return {
            text,
            chips: ['Sleep analysis', 'Exercise summary', 'Tips for recovery'],
            stats: [
                { label: 'Readiness', value: `${latest.score}`, color: latest.score >= 85 ? 'green' : 'teal' },
                { label: 'HRV Bal', value: `${contributors.hrv_balance}`, color: 'blue' },
            ],
        };
    },

    streak(ctx) {
        const s = ctx.streaks;
        let text = `## 🔥 Streaks & Progress\n\n`;
        text += `| Streak | Days |\n|--------|------|\n`;
        text += `| 📊 Logging | ${s.logging || 0} days |\n`;
        text += `| 🏃 Exercise | ${s.exercise || 0} days |\n`;
        text += `| 😴 Sleep Tracking | ${s.sleep || 0} days |\n\n`;

        const total = (s.logging || 0) + (s.exercise || 0) + (s.sleep || 0);
        if (total === 0) {
            text += `Start logging daily to build your streaks! Consistency is key to health improvement.\n`;
        } else if (total > 15) {
            text += `🎉 Impressive consistency! Your commitment to tracking is fueling better health decisions.\n`;
        } else {
            text += `💡 Keep it up! Aim for 7+ day streaks to build lasting habits.\n`;
        }

        return {
            text,
            chips: ['Health score', 'Nutrition summary', 'Tips'],
        };
    },

    score(ctx) {
        const score = ctx.healthScore;
        const scores = ctx.weeklyScores;
        let grade;
        if (score >= 90) grade = 'A';
        else if (score >= 80) grade = 'B';
        else if (score >= 70) grade = 'C';
        else if (score >= 60) grade = 'D';
        else grade = 'F';

        let text = `## 📊 Health Score Overview\n\n`;
        text += `# ${score} / 100  •  Grade: ${grade}\n\n`;

        if (scores.length > 1) {
            const trend = scores[scores.length - 1] - scores[0];
            const arrow = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';
            text += `${arrow} **Weekly trend:** ${trend > 0 ? '+' : ''}${trend} points\n\n`;
        }

        text += `**Score breakdown factors:**\n`;
        text += `• 🍎 Nutrition — meal logging and macros\n`;
        text += `• 🏃 Exercise — workout frequency and duration\n`;
        text += `• 😴 Sleep — hours and consistency\n`;
        text += `• 🧬 Habits — smoking, alcohol, hydration\n`;
        text += `• 🔬 Body — scan results and biomarkers\n`;
        text += `• 🌍 Environment — air and water quality\n\n`;

        if (score >= 80) text += `✅ You're in great shape! Focus on maintaining your current habits.\n`;
        else if (score >= 60) text += `💡 There's room to improve. Focus on your weakest category for the biggest score boost.\n`;
        else text += `⚠️ Your score needs attention. Start with basics: sleep 7+ hours, log meals, and exercise 3x/week.\n`;

        return {
            text,
            chips: ['Nutrition details', 'Exercise summary', 'Sleep analysis', 'Improvement tips'],
            stats: [
                { label: 'Score', value: `${score}`, color: score >= 80 ? 'green' : score >= 60 ? 'amber' : 'coral' },
                { label: 'Grade', value: grade, color: 'teal' },
            ],
        };
    },

    trend(ctx) {
        const scores = ctx.weeklyScores;
        let text = `## 📈 Trends Over Time\n\n`;

        if (scores.length > 1) {
            const latest = scores[scores.length - 1];
            const earliest = scores[0];
            const diff = latest - earliest;
            text += `**Health Score Trend (last ${scores.length} data points):**\n`;
            text += `${scores.map((s, i) => `Day ${i + 1}: ${s}`).join(' → ')}\n\n`;
            text += `${diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️'} **Net change:** ${diff > 0 ? '+' : ''}${diff} points\n\n`;
        }

        // Scan trends
        const scans = ctx.scans.recent;
        if (scans.length >= 2) {
            text += `**Scan Score Trend:**\n`;
            scans.slice(0, 5).reverse().forEach(s => {
                const score = s.overallScore || s.score || 0;
                const date = s.timestamp ? new Date(s.timestamp).toLocaleDateString() : '';
                text += `• ${date}: ${score}% (${s.mode || s.type || 'Scan'})\n`;
            });
            text += `\n`;
        }

        // Exercise trend
        if (ctx.exercise.totalSessions > 0) {
            text += `**Exercise:** ${ctx.exercise.totalExMins} min this week (${ctx.exercise.weekExercise.length} sessions)\n`;
        }

        if (ctx.nutrition.totalMeals > 0) {
            text += `**Nutrition:** ${ctx.nutrition.totalMeals} meals logged total\n`;
        }

        text += `\n💡 Log consistently to see clearer trends. The more data, the better my analysis becomes!\n`;

        return {
            text,
            chips: ['Health score', 'Scan results', 'Improvement tips'],
        };
    },

    tips(ctx) {
        let text = `## 💡 Personalized Tips\n\n`;
        const tips = [];

        // Generate data-driven tips
        if ((ctx.nutrition.todayMeals || []).length === 0) {
            tips.push('📸 **Scan your next meal** — consistent food logging improves diet quality by 20%.');
        }
        if ((ctx.sleep.avgSleep && parseFloat(ctx.sleep.avgSleep) < 7) || ctx.sleep.totalEntries === 0) {
            tips.push('😴 **Prioritize sleep** — aim for 7-9 hours. Set a bedtime alarm 30 min before your target.');
        }
        if (ctx.exercise.totalExMins < 150) {
            tips.push('🏃 **Move more** — you need ' + (150 - ctx.exercise.totalExMins) + ' more minutes this week to hit WHO guidelines.');
        }
        if (ctx.scans.total === 0) {
            tips.push('🔬 **Run your first scan** — the Biomarker Scanner can check skin health, eye indicators, and heart rate.');
        }
        if (ctx.labs.total === 0) {
            tips.push('🧪 **Log your labs** — blood work is one of the best health monitoring tools.');
        }
        if (ctx.habits.smoking) {
            tips.push('🚬 **Quit smoking** — even reducing by 50% significantly lowers disease risk.');
        }
        if ((parseInt(ctx.habits.water) || 0) < 6) {
            tips.push('💧 **Drink more water** — dehydration impacts energy, cognition, and skin health.');
        }
        if (!ctx.dosha) {
            tips.push('🧘 **Take the Dosha Quiz** — discover your Ayurvedic constitution for personalized wellness advice.');
        }
        if (ctx.streaks.logging < 3) {
            tips.push('🔥 **Build a streak** — log something daily for 7 days to build a health tracking habit.');
        }

        if (tips.length === 0) {
            tips.push('🎉 **You\'re doing great!** Keep maintaining your current health habits.');
            tips.push('📊 **Review your analytics** — check the Insights page for deeper pattern analysis.');
        }

        // Show top 5 most relevant tips
        tips.slice(0, 5).forEach(tip => { text += `${tip}\n\n`; });

        return {
            text,
            chips: ['Health score', 'Nutrition details', 'Sleep tips'],
        };
    },

    general(ctx) {
        let text = `I'm not sure what you're asking about, but here's what I can help with:\n\n`;
        text += `• 🍎 **Nutrition** — "How's my diet?" or "Calorie summary"\n`;
        text += `• 🏃 **Exercise** — "Exercise this week" or "Am I active enough?"\n`;
        text += `• 😴 **Sleep** — "Sleep analysis" or "Am I sleeping enough?"\n`;
        text += `• 🧪 **Labs** — "Lab results" or "Blood work summary"\n`;
        text += `• 🔬 **Scans** — "Scan results" or "Biomarker trends"\n`;
        text += `• 💓 **Heart Rate** — "Heart rate data" or "My pulse"\n`;
        text += `• ⚖️ **BMI** — "What's my BMI?" or "Body composition"\n`;
        text += `• 🧘 **Ayurveda** — "My dosha" or "Ayurvedic tips"\n`;
        text += `• 📊 **Score** — "Health score" or "How am I doing?"\n`;
        text += `• 📈 **Trends** — "Am I improving?" or "Show my trends"\n`;
        text += `• 💡 **Tips** — "Give me advice" or "What should I do?"\n`;

        return {
            text,
            chips: ['Health score', 'Nutrition', 'Sleep', 'Tips'],
        };
    },
};

/* ─── Public API ──────────────────────────────────────────────── */

export class HealthCopilot {
    constructor() {
        this.history = [];
    }

    /**
     * Process a user message and return a rich response.
     * @param {string} message - The user's input
     * @returns {{ text: string, chips?: string[], stats?: Array<{label,value,color}> }}
     */
    chat(message) {
        const intent = classifyIntent(message);
        const ctx = getHealthContext();
        const generator = generators[intent] || generators.general;
        const response = generator(ctx);

        // Store in session memory
        this.history.push({ role: 'user', text: message, timestamp: Date.now() });
        this.history.push({ role: 'assistant', text: response.text, intent, timestamp: Date.now() });

        return response;
    }

    /** Get welcome message */
    getWelcome() {
        const ctx = getHealthContext();
        return generators.greeting(ctx);
    }

    /** Get session history */
    getHistory() {
        return this.history;
    }

    /** Clear session */
    clearSession() {
        this.history = [];
    }
}
