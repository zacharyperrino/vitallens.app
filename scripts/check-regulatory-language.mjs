#!/usr/bin/env node
// Regulatory-language guard. Fails (exit 1) if disease/diagnostic terms
// appear in user-facing frontend copy or AI prompt files. This keeps
// VitalLens inside a general-wellness framing. Run in CI and pre-commit.
//
// TCM/traditional constructs (qi, yin, dampness) are allowed. What is NOT
// allowed is naming Western diseases/conditions or claiming to detect,
// diagnose, screen, or triage them.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'server/routes', 'server/services'];
// Terms that constitute the APP claiming to detect/infer a disease.
// (Bare 'diabetes'/'hypertension' are NOT here: a user self-reporting their
// own condition in their profile is legitimate context, not an app claim.)
const BANNED = [
  'anemia', 'jaundice', 'melanoma', 'icterus', 'xanthelasma', 'bilirubin',
  'abcde', 'bradycardia', 'tachycardia', 'conjunctival pallor', 'malignan',
  'cancerous', 'lesion triage', 'diagnosis of', 'medical diagnosis of',
  // Retired clinical-scan identifiers — must never return (audit §2.5).
  'pallor_present', 'drooping_present', 'fungal_pattern',
];
// Phrases that legitimately contain a banned substring, or are the prompt
// instructing the model to AVOID clinical language (which is desirable).
const ALLOW = [
  'not a diagnosis', 'not a medical diagnosis', 'does not diagnose',
  'not medical advice', 'we do not diagnose', 'no diagnosis',
  'never diagnose', 'not diagnoses', 'diagnoses or predictions',
  'never name medical', 'never say', 'non-clinical',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs|html)$/.test(name)) out.push(p);
  }
  return out;
}

let violations = 0;
for (const root of ROOTS) {
  let files;
  try { files = walk(root); } catch { continue; }
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const low = line.toLowerCase();
      if (ALLOW.some(a => low.includes(a))) return;
      for (const term of BANNED) {
        if (low.includes(term)) {
          console.error(`${file}:${i + 1}  banned term "${term}"\n    ${line.trim().slice(0, 100)}`);
          violations++;
        }
      }
    });
  }
}

if (violations) {
  console.error(`\n✖ ${violations} regulatory-language violation(s). Reframe to observational wellness language.`);
  process.exit(1);
}
console.log('✓ No disease/diagnostic language in user-facing copy or prompts.');
