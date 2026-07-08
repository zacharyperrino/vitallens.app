# VitalLens State File
Last updated: April 19 2026

## User ID
a68dbb2e-74ae-47e5-b2da-87f85c20231c

## Startup Checklist
1. Terminal 1: vl (API server on port 3001)
2. Terminal 2: cd "Archive 2" && npx serve . (frontend on port 3000)
3. Browser: localhost:3000
4. Verify: curl http://localhost:3001/api/restaurant/list

## Server Commands
- Start API: vl
- Start frontend: cd "/Users/zacharyperrino/Desktop/Antigravity/Archive 2" && npx serve .
- Backup vision.js: vlbak

## Phase A Status — COMPLETE ✅
- A1: Restaurant visual recognition — built, untested (no packaging available)
- A2: Correction injection — CONFIRMED WORKING
  [Vision] Injecting corrections from client hints fires on every scan
  Corrections fetched from client via getUserCorrections() in visionApi.js
  userId sent via formData in analyzeImageWithVision()
- A3: Multi-image merge — CONFIRMED WORKING
  [MealAnalysis] Processing 2 image(s) confirmed
  [MealAnalysis] Multi-image merge: 3 total detections → 3 after merge confirmed

## Current Food Scanner — What's Working
- Image compression (4MB → 137KB confirmed)
- Vision prompt v4 (quadrant scan, anchor detection, meal context, depth estimation)
- Scale anchor detection (fork, plate confirmed working)
- Correction injection into vision prompt (confirmed working)
- USDA routing through server
- Restaurant database 40+ chains
- Food name cleaning (cleanFoodName function)
- Hardcoded fallbacks: chimichurri (0.601ms), dumplings, gyoza, sauces
- Pre-scan guidance modal + tips bar
- Confirm/Replace/Remove buttons on low confidence items
- Add missing food button with USDA search
- Corrections saving to Supabase
- Meal saving + RAG embedding working
- Multi-image merge working

## Known Issues — Pending Fixes
- "yellow squash cooked" USDA 400 — cooking method stripping fix written not applied
  Fix: normalize NFD + compound cooking method regex in nutrition.js searchUSDA()
- Repeat scanning same meal creates conflicting corrections + duplicate detections
  Fix: normalize key in mergeMultiImageDetections() — lowercase + trim + replace spaces
- sautéed accent character causes USDA 400 — NFD normalization fix not applied yet
- A1 restaurant visual recognition untested with real packaging
# - soy sauce: FIXED
# - cooking method stripping: FIXED (cleanQuery now used in URL)
# - NFD normalization: FIXED
# - duplicate detections: FIXED

## Key File Paths
- Vision prompt + correction injection: Archive 2/server/routes/vision.js
- Restaurant DB: Archive 2/server/data/restaurants.js
- Restaurant route: Archive 2/server/routes/restaurant.js
- Food scanner UI: Archive 2/src/pages/food-scanner.js
- Nutrition API client: Archive 2/src/services/nutritionApi.js
- Nutrition API server: Archive 2/server/routes/nutrition.js
- Food scan API: Archive 2/src/services/foodScanApi.js
- Vision API client: Archive 2/src/services/visionApi.js
- USDA hardcoded fallbacks: Archive 2/server/routes/nutrition.js (HARDCODED_NUTRITION object)

## Next Session: Phase B (batch all together)
1. Apply pending fixes from Known Issues above first
2. Aggressive correction feedback loop
   - Weight corrections by frequency (3+ times = strong rule not hint)
   - Add portion corrections table to Supabase
   - Inject portion hints into vision prompt
3. Calorie learning from slider corrections
   - Detect slider moves >40% from detected value
   - Save to portion_corrections table
4. Cooking method impact on USDA queries
   - Pass cooking_method from vision result through to nutrition lookup
   - Append method to USDA query string

## CalAI Gap Tracker
- Gram estimation accuracy: ~70% within 20% (target 85%)
- Food identification: improving, sauces still weak
- Restaurant recognition: built, visual untested
- Repeat meal speed: not built (Phase G)
- Correction compounding: now working, needs aggressive weighting (Phase B)

## Session April 21 2026 — COMPLETE
- Phase A/B/C/D/E all done
- USDA dataType filter bug fixed (parentheses in URL causing nginx 400)
- const → let bug fixed in getNutritionForFood (was killing all nutrition lookups)
- batchNutritionLookup now preserves null instead of filtering (index alignment)
- Open Food Facts added as Tier 3 after searchUSDA
- All 4 foods now detecting: steak, squash, chimichurri, lion's mane

## Next Session
1. Verify Open Food Facts triggering correctly
2. Test A1 restaurant visual recognition
3. Phase F: Drink detection UI
4. Phase G: Meal memory
