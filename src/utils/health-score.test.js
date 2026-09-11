import { describe, it, expect } from 'vitest';
import { computeHealthScore, getHealthInsights } from './health-score.js';

// Fixtures with known domain scores (see the formulas in health-score.js).
const nutrition = { dailyNutrition: { calories: 2000 } }; // nutrition = 85
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
      const r = computeHealthScore(nutrition);
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
      const r = computeHealthScore({ ...nutrition, ...sleep });
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
      const r = computeHealthScore({ ...nutrition, ...sleep });
      expect(r.overall).toBe(92);
      expect(r.grade).toBe('A+');
    });

    it('keeps the composite inside the range of the logged domain scores', () => {
      const r = computeHealthScore({ ...nutrition, ...sleep, exerciseLog: [{}] }); // exercise = 60
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
      });
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
      });
      expect(r.breakdown.nutrition).toBe(40);
      expect(r.breakdown.sleep).toBe(30);
    });
  });

  describe('environment', () => {
    it('omits the environment domain entirely when no environmental data exists', () => {
      const r = computeHealthScore({ ...nutrition, ...sleep });
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

    it('is 0 with fewer than two weekly scores', () => {
      expect(computeHealthScore({ weeklyScores: [] }).trend).toBe(0);
      expect(computeHealthScore({ weeklyScores: [80] }).trend).toBe(0);
      expect(computeHealthScore({}).trend).toBe(0);
    });

    it('is reported even when the score itself is insufficient', () => {
      const r = computeHealthScore({ weeklyScores: [60, 65] });
      expect(r.state).toBe('insufficient_data');
      expect(r.trend).toBe(5);
    });
  });
});

describe('getHealthInsights', () => {
  const titles = (data) => getHealthInsights(data).map((i) => i.title);

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
