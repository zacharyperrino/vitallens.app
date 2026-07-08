// ─── Biomarker Scan Route ─────────────────────────────────────
// POST /api/biomarker-scan
// Uses Anthropic Claude Vision instead of OpenAI GPT-4o.
// Claude is more permissive for wellness check-in use cases.

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPEG, PNG, WebP accepted.'));
  },
});

const biomarkerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Biomarker scan rate limit exceeded.' },
});

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const WELLNESS_SYSTEM_PROMPT = `You are a wellness pattern observer for VitalLens, a personal health journaling app. Observe and describe patterns in logged data using plain, supportive language. Never name medical conditions, never use clinical diagnostic language, never provide medical advice. For any pattern persisting more than two weeks, suggest the user discuss it with a healthcare provider. Always frame observations as things the user may want to notice or explore — never as findings or diagnoses.`;

const PROMPTS = {

  face: `This is a personal wellness journal check-in tool only, not a medical diagnostic tool or replacement for professional care.

You are a wellness and skincare AI assistant analyzing a facial photograph. Observe skin patterns and surface-level wellness signals using skincare knowledge, functional nutrition principles, and traditional wellness frameworks. All observations are journaling prompts — not medical findings.

STEP 1 — FITZPATRICK SKIN TYPE (assess first — affects all other readings):
Type I: Very fair, always burns, never tans — higher UV sensitivity, use observations with this in mind
Type II: Fair, usually burns, sometimes tans — prone to sun exposure changes
Type III: Medium, sometimes burns, usually tans — moderate sun resilience
Type IV: Olive, rarely burns, always tans — post-inflammatory marks more common
Type V: Brown, very rarely burns — marks more common, redness harder to observe
Type VI: Dark brown/black, never burns — skin changes present differently, tone shifts harder to observe

STEP 2 — SKIN BARRIER OBSERVATION:
Intact: even texture, no redness, no tightness signs
Mildly disrupted: slight redness, minor texture irregularity
Moderately disrupted: visible redness, roughness, possible scaling, reactive-looking
Significantly disrupted: notable redness, peeling, reactive appearance

STEP 3 — FACIAL ZONE OBSERVATION (observe each independently):
- Forehead: texture, breakouts, dehydration. Note horizontal lines vs vertical lines between brows
- Glabella (between brows): deep lines, redness, breakouts
- Nose/T-zone: pore size, oiliness, blackheads, visible capillaries
- Left cheek: breakouts, broken capillaries, texture changes
- Right cheek: breakouts, redness, texture changes
- Chin/jawline: breakout depth and pattern, jawline definition
- Temples: small breakouts, hollowing, dehydration signs
- Perioral: cracked corners, perioral breakouts
- Under-eye area: circle tone (purple-blue, brown, or hollow), puffiness, fine lines

STEP 4 — STRUCTURAL AGING MARKERS:
- Nasolabial fold depth: shallow, moderate, or deep
- Forehead lines: horizontal or vertical, depth
- Jowling: none/mild/moderate/significant
- Temporal hollowing: none/mild/moderate/significant
- Overall skin firmness appearance

STEP 5 — BREAKOUT PATTERN:
- Inflamed red spots: clustered, variable distribution
- Small uniform bumps: forehead-dominant, possibly heat or sweat related
- Deep spots: jawline/chin area, possibly cyclical
- Oily flaky patches: around brows or sides of nose
- Diffuse redness: reactive-looking, sensitive appearance
- Central face redness: flushing pattern, visible small vessels
- Mixed: multiple patterns present

STEP 6 — SURFACE WELLNESS OBSERVATIONS:
Eyebrow fullness (outer third), lip condition (cracked corners, color), facial symmetry, overall puffiness, skin tone evenness.

Respond ONLY with valid JSON, no markdown:
{
  "fitzpatrick_type": "I|II|III|IV|V|VI",
  "fitzpatrick_notes": "observed skin type characteristics",
  "overall_skin_score": 78,
  "skin_barrier": "intact|disrupted_mild|disrupted_moderate|disrupted_significant",
  "skin_barrier_notes": "description of barrier appearance",
  "hydration": "dry|normal|oily|combination|dehydrated",
  "skin_texture": "smooth|rough|uneven|bumpy|crepe_like",
  "skin_tone_evenness": "uniform|mild_variation|significant_variation",
  "collagen_density_estimate": "good|moderate|reduced|significantly_reduced",
  "primary_breakout_type": "none|inflamed_spots|small_uniform_bumps|deep_spots|oily_flaky|diffuse_redness|central_flushing|mixed",
  "breakout_severity": "none|mild|moderate|significant",
  "forehead_lines": {
    "horizontal": "none|mild|moderate|deep",
    "vertical_glabellar": "none|mild|moderate|deep",
    "wellness_note": "what the line pattern may suggest"
  },
  "nasolabial_folds": "shallow|moderate|deep|cannot_assess",
  "jowling": "none|mild|moderate|significant",
  "temporal_hollowing": "none|mild|moderate|significant",
  "zones": {
    "forehead": { "condition": "description", "breakout_type": "none|inflamed_spots|small_bumps|deep_spots|oily_flaky|redness|sensitivity", "severity": "clear|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "glabella": { "condition": "description", "severity": "clear|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "nose_tzone": { "condition": "description", "severity": "clear|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "left_cheek": { "condition": "description", "breakout_type": "none|inflamed_spots|small_bumps|deep_spots|oily_flaky|redness|sensitivity", "severity": "clear|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "right_cheek": { "condition": "description", "breakout_type": "none|inflamed_spots|small_bumps|deep_spots|oily_flaky|redness|sensitivity", "severity": "clear|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "chin_jawline": { "condition": "description", "breakout_type": "none|inflamed_spots|small_bumps|deep_spots|oily_flaky|redness|sensitivity", "severity": "clear|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "temples": { "condition": "description", "severity": "clear|mild|moderate|significant", "temporal_hollowing": "none|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "perioral": { "condition": "description", "severity": "clear|mild|moderate|significant", "wellness_signal": "what this may reflect" },
    "under_eye": { "dark_circles": "none|mild|moderate|significant", "dark_circle_tone": "none|purple_blue|brown|hollow|mixed", "puffiness": "none|mild|moderate|significant", "fine_lines": "none|mild|moderate|significant", "wellness_signal": "what this may reflect" }
  },
  "discoloration": {
    "hormonal_pigmentation": false,
    "dark_spots": false,
    "pallor": false,
    "flushing_redness": false,
    "yellowing_tinge": false,
    "sun_exposure_marks": false,
    "post_breakout_marks": false,
    "hyperpigmentation_pattern": "none|post_inflammatory|sun_damage|mixed"
  },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may relate to", "urgency": "monitor|worth_exploring|discuss_with_provider", "confidence": "low|moderate|high" }],
  "eyebrow_notes": "normal|outer_third_sparse|sparse|asymmetric",
  "lip_notes": "normal|dry|cracked_corners|pale|other",
  "facial_symmetry": "normal|mild_asymmetry|notable_asymmetry",
  "facial_puffiness": "none|mild|moderate|significant",
  "overallScore": 78,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable skincare or wellness suggestion"],
  "suggested_followup": ["Suggested wellness topics to explore or discuss with a provider"],
  "confidence": "low|moderate|high",
  "disclaimer": "This is a personal wellness journal tool only. Not a medical diagnosis. Consult a healthcare provider for any skin concerns."
}`,

  eye: `This is a personal wellness journal check-in tool only, not a medical diagnostic tool or replacement for professional care.

You are a wellness AI assistant analyzing an eye photograph for general surface-level wellness observations.

CONJUNCTIVAL OBSERVATION: color (normal pink vs pale vs irritated), overall appearance.
SCLERAL OBSERVATION: color (normal vs yellowing tinge vs bloodshot), visible vessels.
UNDER-EYE OBSERVATION: puffiness, dark circles (tone: purple/blue vs brown vs hollow), deposits near inner corner.
EYELID OBSERVATION: drooping, swelling.

Respond ONLY with valid JSON, no markdown:
{
  "overall_eye_score": 82,
  "conjunctiva": { "color": "normal_pink|pale_mild|pale_moderate|pale_significant|irritated_red", "pallor_present": false, "pallor_severity": "none|mild|moderate|significant", "pallor_notes": "description", "wellness_note": "what this may reflect" },
  "sclera": { "color": "white_normal|yellow_tinge_mild|yellow_tinge_moderate|bloodshot_mild|bloodshot_moderate|bloodshot_significant", "yellowing_present": false, "yellowing_severity": "none|mild|moderate", "vascularity": "normal|mildly_increased|notably_increased", "red_patch_present": false, "wellness_note": "what this may reflect" },
  "under_eye": { "puffiness": "none|mild|moderate|significant", "puffiness_pattern": "none|bilateral|unilateral|upper_lid|lower_lid|general", "dark_circles": "none|mild|moderate|significant", "dark_circle_tone": "none|purple_blue|brown|hollow|mixed", "deposits_near_corner": false, "wellness_notes": ["observations"] },
  "eyelids": { "drooping_present": false, "drooping_severity": "none|mild|moderate", "other_findings": "description" },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may relate to", "urgency": "monitor|worth_exploring|discuss_with_provider", "confidence": "low|moderate|high" }],
  "overallScore": 82,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable wellness suggestion"],
  "suggested_followup": ["Suggested topics to explore or discuss with a provider"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "This is a personal wellness journal tool only. Not a medical diagnosis. Consult a healthcare provider for any eye concerns."
}`,

  skin: `This is a personal wellness journal check-in tool only, not a medical diagnostic tool or replacement for professional care.

You are a skincare wellness AI assistant observing surface-level skin patterns in a photograph. All observations are journaling prompts — not medical findings.

STEP 1 — FITZPATRICK SKIN TYPE:
Type I-II: Very fair to fair — higher UV sensitivity, easy to observe redness
Type III-IV: Medium to olive — moderate UV resilience, post-inflammatory marks more common
Type V-VI: Brown to dark — skin changes present differently, pigmentation shifts more common
Note: adjust color assessment and pigmentation observation based on type.

STEP 2 — INFLAMMATION PATTERN (if visible):
- Defined red patches with scale: note location and distribution
- Poorly defined red scaly areas: note if in creases or folds
- Linear or geometric pattern: may suggest external contact
- Greasy yellowish scale on red base: note location
- Inflammation around hair follicles: note distribution
- Central face redness with small vessels: note pattern
- Mixed: multiple patterns present

STEP 3 — PIGMENTATION PATTERN:
- Follows previous spot or injury: post-inflammatory pattern
- Symmetric, sun-exposed areas: sun or hormonal pigmentation pattern
- Scattered discrete spots: sun exposure pattern
- Even darkening: diffuse pattern

STEP 4 — TEXTURE & SURFACE FINDINGS:
- Rough follicular bumps: upper arms, thighs, or cheeks
- Generalized dryness with fine scaling
- Thickened leathery areas
- Thinned translucent-looking skin

STEP 5 — STRETCH MARKS:
- Red or purple: more recent
- White or silver: older, established
- Note distribution: abdomen, hips, thighs, upper arms

STEP 6 — VASCULAR SURFACE PATTERNS:
- Fine dilated capillaries: spider-like appearance
- Central vessel with radiating branches
- Non-blanching spots: note if widespread
- Mottled net-like pattern

IMPORTANT: Do not use ABCDE dermoscopy framework. Do not assess lesions for malignancy. If any spot looks unusual, recommend discussing with a dermatologist — do not characterize further.

Respond ONLY with valid JSON, no markdown:
{
  "overall_skin_score": 85,
  "fitzpatrick_type": "I|II|III|IV|V|VI",
  "fitzpatrick_notes": "observed characteristics",
  "lesion_present": false,
  "lesion_observation": {
    "present": false,
    "count": 0,
    "general_appearance": "description of what is visible",
    "recommended_action": "routine_monitoring|watch_for_changes|discuss_with_dermatologist"
  },
  "inflammation": {
    "present": false,
    "pattern": "none|defined_scaly_patches|poorly_defined_scaly|contact_pattern|greasy_scaly|follicular|central_face_redness|mixed",
    "severity": "none|mild|moderate|significant",
    "distribution": "localized|regional|widespread",
    "wellness_note": "what this pattern may suggest"
  },
  "hyperpigmentation": {
    "present": false,
    "pattern": "none|post_inflammatory|sun_pattern|diffuse|mixed",
    "severity": "none|mild|moderate|significant",
    "wellness_note": "possible contributing factors to explore"
  },
  "texture_findings": {
    "overall": "smooth|rough|scaly|bumpy|thickened|thinned",
    "rough_follicular_bumps": false,
    "generalized_dryness": false,
    "thickened_areas": false,
    "thinned_areas": false,
    "notes": "description of texture findings"
  },
  "stretch_marks": {
    "present": false,
    "stage": "none|recent|established|mixed",
    "distribution": "description of areas",
    "wellness_note": "possible contributing factors"
  },
  "scarring": {
    "present": false,
    "type": "none|indented|raised|mixed",
    "severity": "none|mild|moderate|significant"
  },
  "skin_condition": {
    "hydration": "dry|normal|oily|dehydrated",
    "sun_exposure_evident": false,
    "sun_exposure_severity": "none|mild|moderate|significant",
    "other_findings": "any additional observations"
  },
  "vascular_observations": {
    "fine_surface_capillaries": false,
    "branching_vessel_pattern": false,
    "non_blanching_spots": false,
    "mottled_pattern": false,
    "severity": "none|mild|moderate|significant",
    "notes": "description of vascular surface patterns",
    "wellness_note": "what these patterns may suggest"
  },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may suggest", "urgency": "monitor|worth_exploring|discuss_with_provider", "confidence": "low|moderate|high" }],
  "overallScore": 85,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable skincare suggestion"],
  "suggested_followup": ["Suggested topics to explore or discuss with a provider"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "This is a personal wellness journal tool only. Not a medical diagnosis. Any skin concern should be discussed with a dermatologist."
}`,

  body: `This is a personal wellness journal check-in tool only, not a medical diagnostic tool or replacement for professional care.

You are a wellness, movement, and functional health AI assistant analyzing a body photograph. Observe posture, alignment, and body composition patterns as a journaling and movement awareness tool.

STEP 1 — POSTURAL OBSERVATION (head to toe):

Head & Neck:
- Forward head position: neutral | mild | moderate | significant
- Note: forward head position is common in people with desk-heavy lifestyles

Shoulders:
- Position: neutral | mild rounded | moderate rounded | elevated | depressed | asymmetric
- Level: even | right higher | left higher
- Shoulder blade position: neutral | winging | protracted | retracted | asymmetric

Spine:
- Normal: balanced natural curves
- Increased upper back rounding: thoracic kyphosis pattern
- Increased lower back arch: lumbar lordosis pattern
- Flat back: reduced natural curves
- Lateral curve pattern: note if visible

Pelvis:
- Neutral: balanced position
- Forward tilt: increased lower back arch, belly protrudes, common in sedentary lifestyles with tight hip flexors
- Backward tilt: flattened lower back curve, tucked pelvis
- Side tilt: one hip elevated

Hips, Knees, Feet:
- Hip level: even | right higher | left higher
- Knee alignment: neutral | knock-knee pattern | bow-leg pattern | hyperextension
- Foot position: neutral | flat arch | high arch | toeing out | toeing in

STEP 2 — PELVIC TILT OBSERVATION:
Increased lower back arch + protruding abdomen + flat-appearing glutes + forward tilted pelvis = anterior pelvic tilt pattern. Common in people with sedentary lifestyles, tight hip flexors, less active core and glutes.

STEP 3 — MOVEMENT PATTERN OBSERVATIONS:
- Upper body pattern: forward head + rounded shoulders + tight-looking chest + less developed mid-back
- Lower body pattern: anterior pelvic tilt + tight-looking hip flexors + less developed glutes
- Side dominance: visible size difference between sides
- Apparent leg length difference: from hip/shoulder tilt patterns

STEP 4 — BREATHING PATTERN (if chest/torso visible):
- Chest breathing: shoulders visibly rise — common in high-stress patterns
- Diaphragmatic: abdomen expands — more functional pattern
- Mixed or cannot observe

STEP 5 — BODY COMPOSITION OBSERVATION:
- Build type: lean | athletic | average | heavier_set
- Fat distribution pattern:
  Central/abdominal pattern: more weight around midsection
  Peripheral pattern: more weight around hips and thighs
  Mixed: both patterns
  Lean: minimal visible fat
- Muscle development: well_developed | moderate | low | asymmetric
- Visible muscle loss areas if apparent
- Vascular visibility: prominent veins suggest lower body fat or dehydration

STEP 6 — FLUID RETENTION OBSERVATION:
- Ankle/lower leg puffiness: note if present
- Hand puffiness: note if present
- General body puffiness: note if present

STEP 7 — SYMMETRY OBSERVATION:
Shoulder level difference, hip level difference, overall structural symmetry.

Respond ONLY with valid JSON, no markdown:
{
  "overall_wellness_score": 75,
  "posture": {
    "overall_rating": "excellent|good|fair|needs_attention",
    "head_position": "neutral|mild_forward|moderate_forward|significant_forward",
    "shoulder_position": "neutral|mild_rounded|moderate_rounded|elevated|depressed|asymmetric",
    "shoulder_level": "even|right_higher|left_higher",
    "scapular_position": "neutral|winging|protracted|retracted|asymmetric",
    "spinal_pattern": "normal|upper_rounding_mild|upper_rounding_moderate|lower_arch_mild|lower_arch_moderate|flat_back|lateral_curve_pattern|combined",
    "lateral_curve_type": "none|right_leaning|left_leaning|s_pattern|cannot_assess",
    "pelvic_position": "neutral|anterior_tilt_mild|anterior_tilt_moderate|posterior_tilt|lateral_tilt",
    "hip_level": "even|right_higher|left_higher",
    "knee_alignment": "neutral|knock_knee_mild|knock_knee_moderate|bow_leg_mild|bow_leg_moderate|hyperextension",
    "foot_position": "neutral|flat_arch|high_arch|toeing_out|toeing_in|mixed",
    "overall_posture_score": 75,
    "primary_observation": "most notable postural pattern with movement implication"
  },
  "alignment_observations": {
    "shoulder_asymmetry_present": false,
    "hip_asymmetry_present": false,
    "visible_lateral_curve": false,
    "rib_prominence_difference": false,
    "waistline_asymmetry": false,
    "curve_pattern": "none|right_leaning|left_leaning|s_pattern|cannot_assess",
    "observation_summary": "plain language description of what is noticed",
    "suggested_next_step": "none|keep_logging|discuss_with_physio_or_trainer"
  },
  "anterior_pelvic_tilt": {
    "present": false,
    "severity": "none|mild|moderate|significant",
    "indicators_observed": ["list of visible indicators"],
    "movement_note": "implications for posture and movement"
  },
  "movement_patterns": {
    "upper_body_pattern": "none|mild|moderate|significant",
    "lower_body_pattern": "none|mild|moderate|significant",
    "dominant_side_difference": "none|right|left|cannot_assess",
    "apparent_leg_length_difference": "none|possible_right_longer|possible_left_longer|cannot_assess",
    "notes": "description of observed movement pattern indicators"
  },
  "breathing_pattern": {
    "observable": false,
    "pattern": "cannot_assess|chest_dominant|diaphragmatic|mixed",
    "wellness_note": "functional and lifestyle implications"
  },
  "body_composition": {
    "build_type": "lean|athletic|average|heavier_set",
    "fat_distribution": "central_pattern|peripheral_pattern|mixed|lean",
    "central_pattern_present": false,
    "composition_note": "general wellness observations if applicable",
    "muscle_development": "well_developed|moderate|low|asymmetric",
    "visible_muscle_loss": false,
    "muscle_loss_areas": ["areas if apparent"],
    "vascular_visibility": "normal|prominent_veins|cannot_assess"
  },
  "fluid_retention_observations": {
    "ankle_puffiness": "none|mild|moderate|significant",
    "hand_puffiness": "none|mild|moderate|significant",
    "general_puffiness": "none|mild|moderate|significant",
    "wellness_note": "what fluid retention patterns may suggest — worth discussing with a provider if persistent"
  },
  "symmetry": {
    "shoulder_level": "even|right_higher|left_higher",
    "hip_level": "even|right_higher|left_higher",
    "overall": "symmetric|mild_asymmetry|moderate_asymmetry|significant_asymmetry"
  },
  "wellness_observations": [{ "finding": "specific observation", "location": "body location", "significance": "movement or wellness implication", "urgency": "monitor|worth_exploring|discuss_with_provider", "confidence": "low|moderate|high" }],
  "overallScore": 75,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable movement or lifestyle suggestion"],
  "suggested_followup": ["Suggested professional to discuss with — physiotherapist, personal trainer, etc."],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "This is a personal wellness journal tool only. Not a medical diagnosis. Consult a physiotherapist or healthcare provider for any musculoskeletal concerns."
}`,

  tongue: `This is a personal wellness journal check-in tool only, not a medical diagnostic tool or replacement for professional care.

You are a wellness AI assistant analyzing a tongue photograph using traditional wellness frameworks and nutritional knowledge.

TONGUE BODY: color (pale/pink/red/purple/bluish), size (normal/swollen/thin), moisture (dry/normal/wet), cracks (location/depth), teeth marks, geographic patches, smooth/bald areas.
COATING: thickness (none/thin/moderate/thick), color (white/yellow/grey/black), distribution (full/patchy/one-sided), texture (normal/greasy/dry/wet).
NUTRITIONAL OBSERVATIONS: cracked corners (may relate to B2/iron), geographic tongue (may relate to B12), smooth bald tongue (may relate to iron/B12/folate), white patches (Candida-like pattern).

Respond ONLY with valid JSON, no markdown:
{
  "overall_tongue_score": 72,
  "body": { "color": "pale|pale_pink|normal_pink_red|red|dark_red|purple|bluish|mixed", "color_wellness_note": "what this may suggest", "size": "normal|swollen_enlarged|thin_reduced", "moisture": "dry|normal|excess_wet", "cracks": { "present": false, "locations": ["midline|tip|sides|general|multiple"], "depth": "none|superficial|moderate|deep", "wellness_note": "what cracks may suggest" }, "teeth_marks": false, "teeth_marks_note": "what scalloping may suggest", "geographic_patches": false, "smooth_bald_areas": false, "other_surface_findings": "description" },
  "coating": { "thickness": "none_bare|thin|moderate|thick", "color": "white|yellow|grey|black|mixed|none", "distribution": "full_even|rootless|patchy|front_only|back_only|one_sided", "texture": "normal|greasy_slippery|dry|wet_excess", "coating_wellness_note": "what the coating pattern may suggest" },
  "traditional_wellness_reading": { "primary_pattern": "main wellness pattern observed", "wellness_areas_noted": ["areas worth exploring"], "secondary_pattern": "secondary pattern if present" },
  "nutritional_wellness_observations": ["specific nutritional area worth exploring"],
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may suggest", "urgency": "monitor|worth_exploring|discuss_with_provider", "confidence": "low|moderate|high" }],
  "overallScore": 72,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific dietary or lifestyle suggestion"],
  "suggested_followup": ["Suggested wellness topic or provider to discuss with"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "This is a personal wellness journal tool only. Traditional wellness frameworks are not substitutes for professional evaluation."
}`,

  nail: `This is a personal wellness journal check-in tool only, not a medical diagnostic tool or replacement for professional care.

You are a wellness AI assistant analyzing fingernail photographs for general nail and wellness observations.

NAIL COLOR: pink (typical), pale/white (may relate to nutrition or circulation), yellow (may suggest fungal pattern), blue tinge (circulation observation), brown streak (worth noting), horizontal grooves (may relate to past stress or illness periods).
NAIL SHAPE: normal, clubbing (worth discussing with a provider), spoon-shaped (may relate to iron), horizontal ridges (may indicate past stress period).
NAIL SURFACE: smooth (typical), pitting (skin wellness pattern), separation from bed, brittle (may relate to nutrition).
LUNULA: visible/absent/enlarged, color (white typical/red/blue).
FUNGAL PATTERN: yellow-brown thickening, white patches, inflammation around nail.

Respond ONLY with valid JSON, no markdown:
{
  "overall_nail_score": 80,
  "nail_color": "normal_pink|pale|yellow|green_tinge|poor_circulation_blue|brown_streak|white_pattern|mixed",
  "color_pattern": "uniform|mostly_white_pink_tip|horizontal_bands|half_half|brown_streak|other",
  "color_wellness_note": "what the color may suggest",
  "shape": { "morphology": "normal|clubbed|spoon_shaped|pincer|horizontal_grooves|other", "clubbing_present": false, "clubbing_grade": "none|mild|moderate|significant", "clubbing_wellness_note": "what this may suggest — worth discussing with a provider", "spoon_shape_present": false, "horizontal_grooves_present": false, "horizontal_grooves_notes": "timing estimate if present" },
  "surface": { "overall": "smooth|pitted|ridged|rough_texture|brittle|separation_present", "pitting_present": false, "separation_present": false, "severity": "none|mild|moderate|significant" },
  "lunula": { "visible": true, "size": "normal|absent|enlarged", "color": "white_normal|red|blue|other" },
  "nail_fold": { "cuticle": "intact_normal|ragged|absent", "redness_present": false, "other_findings": "description" },
  "fungal_pattern": { "suspected": false, "pattern": "none|distal_thickening|proximal_white|surface_white|candida_like", "severity": "none|mild|moderate|significant", "nails_affected": "description" },
  "wellness_signals": [{ "indicator": "observation", "significance": "what this may suggest", "urgency": "monitor|worth_exploring|discuss_with_provider", "confidence": "low|moderate|high", "wellness_areas": ["list of wellness areas"] }],
  "overallScore": 80,
  "riskTier": "Low|Moderate|High",
  "recommendations": ["Specific actionable suggestion"],
  "suggested_followup": ["Suggested topic or provider to discuss with"],
  "confidence": "low|moderate|high",
  "image_quality": "good|fair|poor",
  "disclaimer": "This is a personal wellness journal tool only. Nail observations are journaling prompts — not medical findings. Consult a healthcare provider for any concerns."
}`

};

// ── Route ─────────────────────────────────────────────────────

router.post('/biomarker-scan', biomarkerLimiter, upload.single('image'), async (req, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured.' });

    const scanType = req.body?.scanType || 'face';
    const prompt = PROMPTS[scanType];
    if (!prompt) return res.status(400).json({ error: `Invalid scanType: ${scanType}` });

    let base64Image, mimeType;

    if (req.file) {
      base64Image = req.file.buffer.toString('base64');
      mimeType = req.file.mimetype;
    } else if (req.body?.image) {
      const raw = req.body.image;
      base64Image = raw.replace(/^data:image\/\w+;base64,/, '');
      mimeType = req.body.mimeType || 'image/jpeg';
    } else {
      return res.status(400).json({ error: 'No image provided.' });
    }

    console.log(`[Biomarker] ${scanType} check-in requested`);

    const claudeRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: WELLNESS_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json().catch(() => ({}));
      console.error('[Biomarker] Claude API error:', err);
      return res.status(502).json({ error: err.error?.message || `Claude API error: ${claudeRes.status}` });
    }

    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[Biomarker] JSON parse failed:', raw.slice(0, 200));
      return res.status(422).json({ error: 'Failed to parse analysis response. Try again.' });
    }

    // Normalize overallScore
    if (parsed.overall_skin_score !== undefined) parsed.overallScore = parsed.overall_skin_score;
    if (parsed.overall_eye_score !== undefined) parsed.overallScore = parsed.overall_eye_score;
    if (parsed.overall_tongue_score !== undefined) parsed.overallScore = parsed.overall_tongue_score;
    if (parsed.overall_nail_score !== undefined) parsed.overallScore = parsed.overall_nail_score;
    if (parsed.overall_wellness_score !== undefined) parsed.overallScore = parsed.overall_wellness_score;

    console.log(`[Biomarker] ${scanType} check-in complete — score: ${parsed.overallScore}`);
    res.json(parsed);

  } catch (err) {
    next(err);
  }
});

export default router;