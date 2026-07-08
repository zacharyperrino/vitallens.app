// Shared between profile.js and onboarding.js — single source of truth
// for the conditions/goals lists and unit conversion.
export const CONDITIONS = [
  'IBS', 'Diabetes', 'Hypertension', 'Anxiety', 'Depression',
  'ADHD', 'Hypothyroid', 'PCOS', 'Acne', 'Eczema',
  'Asthma', 'Arthritis', 'Migraines', 'GERD', 'Celiac',
  'Crohns', 'Sleep Apnea', 'Endometriosis', 'High Cholesterol', 'Chronic Fatigue',
];

export const GOAL_OPTIONS = [
  'Lose weight',
  'Build muscle',
  'Improve energy',
  'Longevity',
  'General health',
];

export const inchesToCm = v => v * 2.54;
export const cmToInches = v => v / 2.54;
export const lbsToKg = v => v / 2.2046226218;
export const kgToLbs = v => v * 2.2046226218;
