import { describe, it, expect } from 'vitest';
import { computeHealthScore, getHealthInsights } from './health-score.js';

// Fixtures with known domain scores (see the formulas in health-score.js).
// Nutrition is only scored against the user's own calorie target.
const TARGETS = { target_calories: 2000 };
const nutrition = { dailyNutrition: { calories: 2000 } }; // nutrition = 85 with TARGETS
const sleep = { sleepLog: [{ hours: 7.5 }, { hours: 7.5 }] }; // sleep = 100
const GRADES = ['A+', 'A', 'B', 'C', 'D'];

describe('computeHealthScore', () => {
  describe('insufficient data', () => {
    it('returns insufficient_data with a null score for empty input', () => {
      const r = computeHealthScore({});
      expect(r.state).toBe('insufficient_data');
      expect(r.overall).toBeNull();
      expect(r.grade).toBeNull();
      expect(r.domainsLogged).toEqual([]);
    });

    it('tolerates being called with no argument at all', () => {
      expect(computeHealthScore().state).toBe('insufficient_data');
    });

    it('returns insufficient_data when only one domain is logged', () => {
      const r = computeHealthScore(nutrition, TARGETS);
      expect(r.state).toBe('insufficient_data');
      expect(r.overall).toBeNull();
      expect(r.domainsLogged).toEqual(['nutrition']);
      // The lone domain is still scored in the breakdown for the UI.
      expect(r.breakdown.nutrition).toBe(85);
    });

    it('does not treat a zero-calorie day or an empty log as a logged domain', () => {
      const r = computeHealthScore({
        dailyNutrition: { calories: 0 },
        exerciseLog: [],
        sleepLog: [{ hours: 7.5 }],
      });
      expect(r.domainsLogged).toEqual(['sleep']);
      expect(r.state).toBe('insufficient_data');
    });
  });

  describe('composite score', () => {
    it('produces a numeric 0-100 score and a letter grade once two domains exist', () => {
      const r = computeHealthScore({ ...nutrition, ...sleep }, TARGETS);
      expect(r.state).toBe('ok');
      expect(typeof r.overall).toBe('number');
      expect(Number.isInteger(r.overall)).toBe(true);
      expect(r.overall).toBeGreaterThanOrEqual(0);
      expect(r.overall).toBeLessThanOrEqual(100);
      expect(GRADES).toContain(r.grade);
      expect(r.domainsLogged).toEqual(['nutrition', 'sleep']);
    });

    it('re-normalises weights over the domains that are present', () => {
      // nutrition=85 (w .25) + sleep=100 (w .20) -> 85*(.25/.45) + 100*(.20/.45) = 91.67 -> 92.
      // Without re-normalisation the raw weighted sum would be a nonsensical 41.
      const r = computeHealthScore({ ...nutrition, ...sleep }, TARGETS);
      expect(r.overall).toBe(92);
      expect(r.grade).toBe('A+');
    });

    it('keeps the composite inside the range of the logged domain scores', () => {
      const r = computeHealthScore({ ...nutrition, ...sleep, exerciseLog: [{}] }, TARGETS); // exercise = 60
      const scores = Object.values(r.breakdown);
      expect(r.overall).toBeGreaterThanOrEqual(Math.min(...scores));
      expect(r.overall).toBeLessThanOrEqual(Math.max(...scores));
    });

    it('scores all six domains when everything is logged', () => {
      const r = computeHealthScore({
        ...nutrition,
        ...sleep,
        exerciseLog: [{}, {}, {}],
        habits: { smoking: false, alcohol: 'none', water: 8 },
        bodyScans: [{ overall_score: 72 }],
        environmental: { airQuality: 'good' },
      }, TARGETS);
      expect(r.state).toBe('ok');
      expect(r.domainsLogged).toHaveLength(6);
      expect(r.breakdown).toEqual({
        nutrition: 85,
        exercise: 80,
        sleep: 100,
        habits: 90,
        bodyMarkers: 72,
        environment: 85,
      });
    });

    it('maps the composite to grade bands', () => {
      // habits: 80 - 30 (smoking) - 20 (heavy alcohol) = 30 (w .15); sleep = 100 (w .20)
      // -> 30*(.15/.35) + 100*(.20/.35) = 70 -> 'B'
      const r = computeHealthScore({ ...sleep, habits: { smoking: true, alcohol: 'heavy' } });
      expect(r.overall).toBe(70);
      expect(r.grade).toBe('B');
    });

    it('clamps domain scores to their documented floors', () => {
      const r = computeHealthScore({
        dailyNutrition: { calories: 6000 }, // 85 - 133 -> clamped to 40
        sleepLog: [{ hours: 1 }], // 100 - 97.5 -> floored at 30
      }, TARGETS);
      expect(r.breakdown.nutrition).toBe(40);
      expect(r.breakdown.sleep).toBe(30);
    });
  });

  describe('nutrition target', () => {
    it('scores intake against the user\'s own calorie target', () => {
      const r = computeHealthScore({ dailyNutrition: { calories: 2400 } }, { target_calories: 2400 });
      expect(r.breakdown.nutrition).toBe(85);
      expect(r.breakdown.nutrition).toBeGreaterThan(80);
      expect(r.domainsLogged).toEqual(['nutrition']);
    });

    it('does not score nutrition at all without a numeric target', () => {
      for (const targets of [undefined, null, {}, { target_calories: null }, { target_calories: 0 }, { target_calories: 'soon' }]) {
        const r = computeHealthScore({ ...nutrition, ...sleep }, targets);
        expect(r.breakdown.nutrition).toBeUndefined();
        expect(r.domainsLogged).toEqual(['sleep']);
        expect(r.state).toBe('insufficient_data');
      }
    });

    it('leaves nutrition unscored when the targets could not be loaded', () => {
      const r = computeHealthScore({ ...nutrition, ...sleep }, { error: true });
      expect(r.breakdown.nutrition).toBeUndefined();
      expect(r.domainsLogged).toEqual(['sleep']);
    });

    it('never falls back to a default 2000 kcal target', () => {
      // 2000 kcal would score 85 against a 2000 default; against the real 3000 target it is 52.
      const r = computeHealthScore(nutrition, { target_calories: 3000 });
      expect(r.breakdown.nutrition).toBeCloseTo(51.67, 1);
    });
  });

  describe('body markers', () => {
    it('ignores scans with a null score and uses the latest scored scan', () => {
      const r = computeHealthScore({ bodyScans: [{ overall_score: null, scan_type: 'heart' }, { overall_score: 64 }] });
      expect(r.breakdown.bodyMarkers).toBe(64);
    });

    it('does not score body markers when every scan is unscored', () => {
      const r = computeHealthScore({ bodyScans: [{ overall_score: null }] });
      expect(r.breakdown).not.toHaveProperty('bodyMarkers');
    });
  });

  describe('environment', () => {
    it('omits the environment domain entirely when no environmental data exists', () => {
      const r = computeHealthScore({ ...nutrition, ...sleep }, TARGETS);
      expect(r.breakdown).not.toHaveProperty('environment');
      expect(r.domainsLogged).not.toContain('environment');
    });

    it('scores environment from air quality when present', () => {
      const score = (airQuality) =>
        computeHealthScore({ environmental: { airQuality } }).breakdown.environment;
      expect(score('good')).toBe(85);
      expect(score('moderate')).toBe(65);
      expect(score('poor')).toBe(45);
    });
  });

  describe('trend', () => {
    it('is the last weekly score minus the previous one', () => {
      expect(computeHealthScore({ weeklyScores: [70, 75, 82] }).trend).toBe(7);
      expect(computeHealthScore({ weeklyScores: [80, 74] }).trend).toBe(-6);
    });

    it('is null (no trend yet) with fewer than two weekly scores', () => {
      expect(computeHealthScore({ weeklyScores: [] }).trend).toBeNull();
      expect(computeHealthScore({ weeklyScores: [80] }).trend).toBeNull();
      expect(computeHealthScore({}).trend).toBeNull();
    });

    it('is reported even when the score itself is insufficient', () => {
      const r = computeHealthScore({ weeklyScores: [60, 65] });
      expect(r.state).toBe('insufficient_data');
      expect(r.trend).toBe(5);
    });
  });
});

describe('getHealthInsights', () => {
  const titles = (data, targets = TARGETS) => getHealthInsights(data, targets).map((i) => i.title);

  it('prompts for more logging when data is insufficient', () => {
    expect(titles({})).toContain('Log a little more to unlock your score');
    expect(titles({})).not.toContain('Gentle reminder');
  });

  it('adds a neutral tip instead once the score is available', () => {
    expect(titles({ ...nutrition, ...sleep })).toContain('Gentle reminder');
  });

  it('never comments on a domain that was not logged', () => {
    const t = titles({ ...nutrition, ...sleep });
    expect(t).not.toContain('Room to move');
    expect(t).not.toContain('Habits are weighing on your score');
  });

  it('asks for a calorie target instead of scoring nutrition against a default', () => {
    expect(titles(nutrition, null)).toContain('Nutrition is not scored yet');
    expect(titles(nutrition, null)).not.toContain('Nutrition looks steady');
    expect(titles(nutrition, TARGETS)).not.toContain('Nutrition is not scored yet');
    expect(titles(nutrition, TARGETS)).toContain('Nutrition looks steady');
  });

  it('reports a failed targets load instead of asking for a target to be set', () => {
    const t = titles(nutrition, { error: true });
    expect(t).toContain('Nutrition is not scored right now');
    expect(t).not.toContain('Nutrition is not scored yet');
    expect(t).not.toContain('Nutrition looks steady');
    expect(getHealthInsights(nutrition, { error: true }).find((i) => i.title === 'Nutrition is not scored right now').text)
      .toMatch(/couldn't be loaded/);
    // A missing target still gets the "set one" prompt, never the load-failure copy.
    expect(titles(nutrition, null)).not.toContain('Nutrition is not scored right now');
  });

  it('flags a low sleep score and a habits problem when those domains say so', () => {
    const t = titles({
      ...nutrition,
      sleepLog: [{ hours: 4 }], // 47.5
      habits: { smoking: true, alcohol: 'heavy' }, // 30
    });
    expect(t).toContain('Sleep worth a look');
    expect(t).toContain('Habits are weighing on your score');
  });
});
