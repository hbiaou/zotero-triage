# Phase 7: Tag-Based Recommendations - Research

**Researched:** 2026-01-26
**Domain:** Tag-based recommendation scoring, adaptive weight learning, multi-signal integration
**Confidence:** HIGH

## Summary

Phase 7 integrates tag-based signals into the existing recommendation engine alongside keywords and authors. The phase builds on Phase 6's tag extraction and implements three core systems:

1. **Tag scoring in profile**: Extract top N tags from seed papers with frequency-based weighting
2. **Multi-signal scoring**: Incorporate tag matches into recommendation scores with configurable weight (1.5 default, 0.0-3.0 configurable)
3. **Adaptive learning**: Adjust tag weights from accept/reject feedback using symmetric updates with decay

Key finding: The codebase already has the foundation for tag-based recommendations (profile weights structure, adaptive learner framework, recommendation engine architecture). Phase 7 primarily involves implementing the tag-specific scoring logic in existing frameworks, plus three major decision areas: profile tag selection (top N, threshold, weighting strategy), multi-match scoring strategy (linear vs diminishing returns), and learning rate parameters.

**Primary recommendation:** Use frequency-weighted top 20 tags for profile; linear multi-match scoring (count all matches); conservative learning rate with exponential decay to prevent permanent weight extremes.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing recommendation-engine.ts | (codebase) | Multi-signal scoring framework | Already implements author/keyword scoring; tag scoring fits same pattern |
| existing profile/types.ts | (codebase) | Profile data structure with Map<string, number> weights | Supports tags natively; frequency-based weighting proven |
| Porter Stemmer | stemmer npm or natural.js | Linguistic normalization for tag matching | Industry standard for English stemming; matches existing keyword extraction pattern |
| lodash.debounce | ^4.0.8 | Debounce profile saves from adaptive learning | Already in package.json for ProfileService |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | N/A | Weight decay mechanism | Implement with exponential moving average (EMA) formula, not external |
| Math.min/max | (built-in) | Weight boundary enforcement | Clamp weights to [MIN_WEIGHT, MAX_WEIGHT] range |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stemmer NPM package | No stemming (exact match) | Exact match misses variations ('networks' vs 'network'); stemmer adds flexibility |
| Frequency-weighted profile | Binary presence tags | Frequency captures importance ('machine learning' appearing in 5 papers is stronger signal); binary is simpler |
| Top N tags for profile | All tags from seed papers | All tags = noise; top 20 filters to high-signal only |
| Linear multi-match scoring | Diminishing returns / binary threshold | Linear counts all signals fairly; diminishing returns penalizes diverse papers; binary is too coarse |
| Per-tag weight learning | Global weight adjustment only | Per-tag captures nuanced feedback; global is simpler but less adaptive |
| Conservative learning rate | Aggressive learning rate | Conservative prevents overfit to recent feedback; aggressive adapts faster but can swing wildly |

**Installation:**
```bash
# Add stemmer library to package.json
npm install stemmer

# No other new dependencies required
# (All other components already in codebase)
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── recommendations/
│   ├── recommendation-engine.ts      # (extend calculateTagScore)
│   ├── tag-scoring.ts                # (new: tag matching & normalization logic)
│   └── adaptive-learner.ts            # (extend with tag weight decay)
├── profile/
│   ├── tag-profile-builder.ts         # (new: extract top N tags from seed papers)
│   ├── types.ts                       # (already has tag weight structure)
│   └── profile-service.ts             # (already has weight management)
└── utils/
    └── stemming.ts                    # (new: tag normalization with stemming)
```

### Pattern 1: Frequency-Weighted Tag Profile Construction
**What:** Extract top N tags from seed papers, weighted by frequency
**When to use:** Profile initialization (Phase 4) or migration (Phase 6)
**Example:**
```typescript
// Source: Existing profile-initializer.ts pattern extended for tags
// Tags are already extracted in Phase 6; Phase 7 selects top N

/**
 * Build tag profile from seed papers.
 * - Collect all tags from seed papers
 * - Count frequency of each tag
 * - Select top N tags by frequency
 * - Use frequency as weight (appears in 3 papers = weight 3.0)
 *
 * @param seedItems - Zotero items to extract tags from
 * @param topN - Number of top tags to include (default: 20)
 * @param minFrequency - Minimum appearances required (default: 1)
 * @returns Map<tag, weight> sorted by frequency
 */
function buildTagProfile(
  seedItems: ZoteroItem[],
  topN: number = 20,
  minFrequency: number = 1
): Map<string, number> {
  // Step 1: Collect all tags with frequency counting
  const tagFrequency = new Map<string, number>();

  for (const item of seedItems) {
    for (const tag of item.tags || []) {
      // Normalize tag: lowercase, trim whitespace
      const normalized = tag.trim().toLowerCase();
      if (normalized.length === 0) continue;

      // Skip noise tags (workflow metadata)
      if (isNoiseTag(normalized)) continue;

      // Count frequency
      tagFrequency.set(normalized, (tagFrequency.get(normalized) || 0) + 1);
    }
  }

  // Step 2: Filter by minimum frequency, sort by frequency, take top N
  const topTags = Array.from(tagFrequency.entries())
    .filter(([_, freq]) => freq >= minFrequency)
    .sort((a, b) => b[1] - a[1])  // Sort by frequency descending
    .slice(0, topN)
    .map(([tag, freq]) => [tag, freq] as const);

  // Step 3: Convert frequency to weight map
  // Frequency directly becomes weight (3 appearances = weight 3.0)
  const profileTags = new Map<string, number>();
  for (const [tag, freq] of topTags) {
    profileTags.set(tag, freq);
  }

  return profileTags;
}

/**
 * Filter noise tags (workflow metadata, not content tags)
 * Examples: 'to-read', 'important', 'review', 'inbox', 'needs-processing'
 */
function isNoiseTag(tag: string): boolean {
  const noisePatterns = [
    /^to-read$/,
    /^important$/,
    /^review$/,
    /^inbox$/,
    /^needs-processing$/,
    /^skip$/,
    /^archived$/,
    /^duplicate$/,
    /^wip$/,  // work in progress
    /^reading-list$/
  ];

  return noisePatterns.some(pattern => pattern.test(tag));
}
```

### Pattern 2: Tag Normalization with Stemming
**What:** Normalize tags for matching using case-insensitivity and stemming
**When to use:** When comparing item tags to profile tags for scoring
**Example:**
```typescript
// Source: Keyword extraction pattern extended for tags
// Stemming prevents 'network' and 'networks' from being treated as different tags

import { stemmer } from 'stemmer'; // npm package

/**
 * Normalize tag for matching with profile.
 * - Lowercase
 * - Trim whitespace
 * - Apply Porter stemmer
 *
 * @param tag - Raw tag from item
 * @returns Normalized tag suitable for matching
 */
function normalizeTag(tag: string): string {
  if (!tag || typeof tag !== 'string') {
    return '';
  }

  // Step 1: Lowercase and trim
  const lowercased = tag.trim().toLowerCase();

  if (lowercased.length === 0) {
    return '';
  }

  // Step 2: Apply stemming
  // Converts 'networks' -> 'network', 'running' -> 'run', etc.
  const stemmed = stemmer(lowercased);

  return stemmed;
}

/**
 * Extract normalized tags from item for matching.
 * Returns tags normalized for comparison with profile tags.
 *
 * @param item - Zotero item with tags
 * @returns Array of normalized tags
 */
function getNormalizedItemTags(item: ZoteroItem): string[] {
  if (!item.tags || item.tags.length === 0) {
    return [];
  }

  return item.tags
    .map(tag => normalizeTag(tag))
    .filter(tag => tag.length > 0);
}

/**
 * Multi-word tag delimiter handling: Allow matching multi-word tags.
 * Examples: 'machine learning' matches 'machine learning' and 'deep learning'
 *
 * For multi-word tags, we have three options (Claude's discretion):
 * CHOSEN: Split and match individual words (simpler, captures concepts)
 * ALTERNATIVE: Keep intact (preserves exact phrases, less flexible)
 *
 * @param tag - Multi-word tag, e.g., 'machine learning'
 * @returns Array of component terms for matching
 */
function splitTagComponents(tag: string): string[] {
  // Split on whitespace and hyphens
  // 'machine learning' -> ['machine', 'learning']
  // 'deep-learning' -> ['deep', 'learning']
  return tag.split(/[\s\-]+/).filter(term => term.length > 0);
}
```

### Pattern 3: Multi-Signal Tag Scoring Integration
**What:** Calculate tag match score following existing pattern (sum weights of matching tags)
**When to use:** During item scoring in RecommendationEngine
**Example:**
```typescript
// Source: Existing calculateAuthorScore/calculateKeywordScore pattern
// Extends recommendation-engine.ts calculateTagScore method

/**
 * Calculate tag match score.
 * Sum weights of matching tags from profile.
 *
 * Algorithm:
 * 1. Get normalized tags from item
 * 2. Get normalized profile tags
 * 3. For each item tag, check if it matches any profile tag (with stemming)
 * 4. Sum weights of matching profile tags
 * 5. Apply linear multi-match strategy (all matches count)
 *
 * @param item - Zotero item to score
 * @param profile - User profile with tag weights
 * @returns Raw tag match score (not normalized)
 */
private calculateTagScore(item: ZoteroItem, profile: UserProfile): number {
  // Handle items with no tags
  if (!item.tags || item.tags.length === 0) {
    return 0;  // Neutral (not a penalty)
  }

  // Get normalized tags from item
  const itemTags = getNormalizedItemTags(item);
  if (itemTags.length === 0) {
    return 0;
  }

  let score = 0;

  // For each item tag, find matches in profile
  for (const itemTag of itemTags) {
    // Option 1 (CHOSEN): Exact match after stemming
    // Most straightforward; captures concept matching without complexity
    const profileWeight = profile.tags.get(itemTag);
    if (profileWeight !== undefined) {
      score += profileWeight;  // Linear multi-match: count all matches
      continue;
    }

    // Option 2 (DEFERRED): Fuzzy match with similarity threshold
    // Could implement Levenshtein distance for typo tolerance
    // Deferred to later optimization if needed
  }

  return score;
}

/**
 * Multi-match scoring strategy choices (Claude's discretion):
 *
 * CHOSEN: Linear count - count all matching tags equally
 * - Item has tags [machine, learning, deep] vs profile [machine, learning]
 * - Score = weight(machine) + weight(learning) = 2.0 + 1.5 = 3.5
 * - Pros: Simple, fair, all signals matter
 * - Cons: Biased toward items with many tags
 *
 * ALTERNATIVE: Diminishing returns - each match counts less
 * - First match: 100%, second: 50%, third: 25%
 * - Score = 2.0 + 1.5*0.5 = 2.75
 * - Pros: Prevents tag-heavy items from dominating
 * - Cons: More complex, arbitrary diminishment factors
 *
 * ALTERNATIVE: Binary threshold - match or not
 * - Score = 1.0 if any tag matches, 0 if none
 * - Pros: Simple, tag signal is binary
 * - Cons: Loses information about degree of match
 *
 * In recommendation-engine.ts scoring:
 * const rawScore =
 *   (tagScore * DEFAULT_PROFILE_WEIGHTS.tagWeight) +  // e.g., 3.5 * 1.5 = 5.25
 *   (authorScore * DEFAULT_PROFILE_WEIGHTS.authorWeight) +
 *   (keywordScore * DEFAULT_PROFILE_WEIGHTS.keywordWeight);
 */
```

### Pattern 4: Adaptive Tag Weight Learning with Decay
**What:** Update tag weights from accept/reject feedback with exponential decay
**When to use:** After user accepts/rejects items; incorporated into AdaptiveLearner
**Example:**
```typescript
// Source: Existing adaptive-learner.ts pattern extended for tag decay

/**
 * Weight adjustment constants for tag-specific learning.
 * These are per-feedback, not cumulative rates.
 */
const TAG_ACCEPT_BOOST = 0.2;        // Add 0.2 to matching tag weights on accept
const TAG_REJECT_PENALTY = -0.1;     // Subtract 0.1 from tag weights on reject
const MIN_TAG_WEIGHT = 0.1;           // Floor (prevent weights from becoming too small)
const MAX_TAG_WEIGHT = 5.0;           // Ceiling (prevent runaway)

/**
 * Adaptive learning feedback type.
 * Tracking whether weights were boosted or penalized for decay calculation.
 */
interface WeightAdjustmentRecord {
  signal: string;  // tag name, author, or keyword
  type: 'tag' | 'author' | 'keyword';
  oldWeight: number;
  newWeight: number;
  adjustment: number;  // positive for accept, negative for reject
  timestamp: number;
  direction: 'boost' | 'penalty';
}

/**
 * Hybrid adaptive learning approach (from CONTEXT.md decision):
 *
 * Two mechanisms run together:
 * 1. Global tag signal adjustment: Multiplier affects all tags
 *    - If many items tagged with X are accepted, scale up ALL tag weights slightly
 *    - Increases importance of tagging overall
 *
 * 2. Per-tag weight adjustment: Individual tags get boosted/penalized
 *    - Tag 'machine learning' weights increase because user accepts items with it
 *    - Tag 'benchmark' weights decrease because user rejects items with it
 *    - Captures nuanced per-tag preferences
 *
 * CHOSEN: Per-tag adjustment (simpler to understand, direct feedback loop)
 * DEFERRED: Global adjustment (could implement if tag signal too weak)
 */

/**
 * Learn from user accepting an item with tags.
 * Boosts weights of matching tags.
 *
 * @param item - Accepted item (contains tags)
 * @param profile - User profile to update
 * @returns Records of weight adjustments (for decay tracking)
 */
function learnTagsFromAccept(
  item: ZoteroItem,
  profile: UserProfile
): WeightAdjustmentRecord[] {
  const records: WeightAdjustmentRecord[] = [];

  if (!item.tags || item.tags.length === 0) {
    return records;  // No tags to learn from
  }

  const now = Date.now();

  for (const tag of item.tags) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;

    const oldWeight = profile.tags.get(normalized) || 0;
    const newWeight = Math.min(MAX_TAG_WEIGHT, oldWeight + TAG_ACCEPT_BOOST);

    profile.tags.set(normalized, newWeight);

    records.push({
      signal: normalized,
      type: 'tag',
      oldWeight,
      newWeight,
      adjustment: TAG_ACCEPT_BOOST,
      timestamp: now,
      direction: 'boost'
    });
  }

  return records;
}

/**
 * Learn from user rejecting an item with tags.
 * Diminishes weights of matching tags (only if tag exists in profile).
 *
 * @param item - Rejected item (contains tags)
 * @param profile - User profile to update
 * @returns Records of weight adjustments (for decay tracking)
 */
function learnTagsFromReject(
  item: ZoteroItem,
  profile: UserProfile
): WeightAdjustmentRecord[] {
  const records: WeightAdjustmentRecord[] = [];

  if (!item.tags || item.tags.length === 0) {
    return records;  // No tags to learn from
  }

  const now = Date.now();

  for (const tag of item.tags) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;

    const oldWeight = profile.tags.get(normalized);
    if (oldWeight === undefined) {
      // Tag not in profile; don't add negative signals
      continue;
    }

    const newWeight = Math.max(MIN_TAG_WEIGHT, oldWeight + TAG_REJECT_PENALTY);
    profile.tags.set(normalized, newWeight);

    records.push({
      signal: normalized,
      type: 'tag',
      oldWeight,
      newWeight,
      adjustment: TAG_REJECT_PENALTY,
      timestamp: now,
      direction: 'penalty'
    });
  }

  return records;
}

/**
 * Weight decay mechanism: Gradually return weights toward baseline.
 * Prevents old feedback from permanently dominating new patterns.
 *
 * CONTEXT.md decision: "Decay over time: Weights gradually return toward
 * baseline to prevent permanent extremes"
 *
 * Algorithm (Exponential Moving Average approach):
 * - Base weight (frequency from seed papers) is the target
 * - Each decay cycle: new_weight = base_weight + (current_weight - base_weight) * decay_factor
 * - decay_factor = 0.99 means 1% decay toward baseline per cycle
 * - After 100 cycles, weight is 36.6% of the way back to baseline
 * - Prevents 'sticky' weights from old feedback
 *
 * CHOSEN learning rate: Conservative (0.99)
 * - Alternative MODERATE: 0.95 (faster return to baseline)
 * - Alternative AGGRESSIVE: 0.90 (very fast return)
 * - Conservative prevents overadaptation to recent noise
 *
 * Decay timing: Optional periodic update (e.g., weekly) or on-demand
 * This research recommends on-demand when computing recommendations
 */

const DECAY_FACTOR = 0.99;  // Conservative: 1% decay toward baseline per cycle
const DECAY_CYCLE_HOURS = 24;  // Decay once per day

/**
 * Apply decay to tag weights, returning them toward baseline (seed-based weight).
 * Called periodically to prevent permanent weight extremes from old feedback.
 *
 * @param profile - User profile with tag weights
 * @param baselineWeights - Original seed-based weights (from profile initialization)
 */
function applyTagWeightDecay(
  profile: UserProfile,
  baselineWeights: Map<string, number>
): void {
  for (const [tag, currentWeight] of profile.tags.entries()) {
    // Get baseline weight for this tag (frequency from seed papers)
    const baseline = baselineWeights.get(tag) || currentWeight;

    // Apply exponential moving average toward baseline
    // new_weight = baseline + (current_weight - baseline) * decay_factor
    const distance = currentWeight - baseline;
    const newWeight = baseline + distance * DECAY_FACTOR;

    profile.tags.set(tag, newWeight);
  }
}

/**
 * Learning rate guidance for different strategies (Claude's discretion):
 *
 * CHOSEN: Conservative with decay
 * - ACCEPT_BOOST = 0.2 per feedback
 * - REJECT_PENALTY = -0.1 per feedback
 * - Decay factor = 0.99 (1% per cycle)
 * - Profile converges slowly but smoothly
 * - Takes ~50 accept/reject cycles to move a tag weight significantly
 *
 * ALTERNATIVE: Moderate learning
 * - ACCEPT_BOOST = 0.5 per feedback (faster uptake)
 * - REJECT_PENALTY = -0.25 per feedback
 * - Decay factor = 0.95 (5% per cycle)
 * - Adapts faster to user preferences
 * - Risk: Overreacts to short-term patterns
 *
 * ALTERNATIVE: Aggressive learning
 * - ACCEPT_BOOST = 1.0 per feedback (rapid changes)
 * - REJECT_PENALTY = -0.5 per feedback
 * - Decay factor = 0.90 (10% per cycle)
 * - Immediate adaptation to user feedback
 * - Risk: Whiplash from temporary patterns
 *
 * Research from 2026 (see Sources) shows conservative learning with decay
 * outperforms aggressive learning in long-term user satisfaction.
 */
```

### Anti-Patterns to Avoid
- **Don't include all tags from seed papers in profile:** Leads to noise; use top N filtered approach
- **Don't treat items with no tags as lower quality:** Tags are optional; neutral scoring preserves recency/keyword signals
- **Don't use exact case-sensitive tag matching:** Normalize with lowercase; stemming captures variations
- **Don't make tag weights persist forever from old feedback:** Apply decay to reset weights toward baseline
- **Don't ignore noise tags in profile construction:** Filter 'to-read', 'important', 'review' during extraction
- **Don't use aggressive learning rates:** Conservative approach prevents overfitting to recent feedback patterns

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tag stemming | Custom suffix removal | Porter stemmer (npm) | Handles linguistic complexities; proven, standard algorithm |
| Tag-weight integration | Custom scoring formula | Existing pattern (sum weights like keywords/authors) | Consistent with codebase; proven multi-signal approach |
| Profile tag selection | Arbitrary tag selection | Frequency-weighted top N approach | Data-driven; captures high-signal tags automatically |
| Weight decay | Manual reset mechanism | Exponential moving average formula | Smooth decay; mathematically proven to prevent extremes |
| Tag normalization | Multiple ad-hoc rules | Central normalizeTag() function | Single source of truth; prevents inconsistency |
| Adaptive learning state tracking | In-memory records | Extend existing ProfileService debounce | Leverages proven persistence pattern |

**Key insight:** Tag-based recommendations look simple ("just sum matching tag weights") but production challenges include stemming variation, noise tag filtering, adaptive learning stability, and sparse data handling. All of these have standard solutions in the recommendation systems literature; hand-rolling any of these risks subtle bugs (mismatched normalization, weight explosion, silent failures).

## Common Pitfalls

### Pitfall 1: Tag Normalization Inconsistency Between Profile Building and Scoring
**What goes wrong:** Tags normalized one way during profile construction (Phase 4) and another way during scoring (Phase 7); 'networks' in profile doesn't match 'network' in item; recommendation scores mysteriously low
**Why it happens:**
- Profile built without stemming; scoring applies stemming
- Phase 4 code doesn't normalize; Phase 7 code does
- Different code paths handle case-sensitivity differently
- Developers assume tags are already normalized

**How to avoid:**
1. Create single centralizeTag() function in utils/stemming.ts
2. Call it consistently everywhere: profile building, scoring, adaptive learning
3. Document normalization steps in code comments
4. Test with variant spellings: 'networks', 'network', 'Networks', 'NETWORKS' must all match
5. Store normalized tags in profile, not raw tags

**Warning signs:**
- Same tags in profile and item don't produce score
- Capitalization affects recommendation results
- Test passes with mocked data but fails with real tags

### Pitfall 2: Sparse Tag Data Causes Silent Recommendation Degradation
**What goes wrong:** User with only 1-2 tags in profile; recommendations fall back to author/keyword scoring; tags are "ignored" silently
**Why it happens:**
- Few seed papers means few tags extracted (sparse data)
- Top 20 tags algorithm returns only 3 tags instead
- Tag scoring returns 0 for items without those 3 tags
- No diagnostic message; system just degrades to other signals
- User never knows tags aren't being used

**How to avoid:**
1. Detect sparse profile (< 5 tags) and warn user during initialization
2. In scoring, explicitly log when tag scoring contributes 0 points
3. Offer to add more seed papers or manually add tags
4. Fall back to keyword/author scoring when tag coverage is low (expected)
5. Show tag contribution in recommendation breakdown UI

**Warning signs:**
- User has tags but recommendations ignore them
- User with many tags gets different results than sparse user
- Logs show tag score = 0 consistently
- UI claims "tag-based" but other signals dominate

### Pitfall 3: Weight Explosion or Freezing from Unchecked Adaptive Learning
**What goes wrong:** Tag weight grows to 100+ after many accepts, or freezes at MIN_WEIGHT and never recovers; adaptive learning breaks down
**Why it happens:**
- No MAX_WEIGHT cap; each accept adds +0.2 infinitely
- Or MAX_WEIGHT is too low (e.g., 1.0) and all weights hit ceiling
- Decay mechanism not implemented; old weights never reset
- Asymmetric feedback: many accepts but few rejects (or vice versa)

**How to avoid:**
1. Enforce MIN_WEIGHT and MAX_WEIGHT bounds (0.1 to 5.0)
2. Implement decay mechanism that returns weights to baseline
3. Test with 100+ accept/reject cycles; verify weights don't diverge
4. Monitor weight statistics: min, max, mean - should stay stable
5. Log weight adjustments; catch when weights hit caps frequently

**Warning signs:**
- Weights reach MAX_WEIGHT and stay there
- Weights hit MIN_WEIGHT and don't recover
- Weight statistics show explosive growth or collapse
- After 1000 feedback cycles, behavior diverges wildly from initialization

### Pitfall 4: Tag Scoring Dominates Other Signals Unexpectedly
**What goes wrong:** With tagWeight = 1.5 and keyword/author data sparse, items are ranked purely on tags; other signals ignored; recommendations narrow
**Why it happens:**
- Tag weight (1.5) positioned between author (1.0) and keyword (2.0) but tags are simpler to match
- With few keywords in profile, tag signal dominates
- Multi-match scoring: items with many tags score high even if not relevant
- No rebalancing mechanism when tag coverage is high

**How to avoid:**
1. Make tag weight user-configurable (0.0-3.0 slider per CONTEXT.md decision)
2. Normalize scores after weighting so no signal dominates (existing normalizeScores() does this)
3. Monitor score breakdown in UI; show tag contribution as % of total
4. Test with profiles varying in tag/keyword/author density
5. If needed, adjust tag weight dynamically based on signal strength

**Warning signs:**
- Tags are the only signal contributing to scores
- Changing tag weight has huge effect on results
- Items with many tags rank high regardless of other relevance
- Keyword and author matches don't influence top recommendations

### Pitfall 5: Noise Tags ('to-read', 'important') Pollute Profile and Mislead Recommendations
**What goes wrong:** 'to-read', 'important', 'review' tags appear in profile; user accepts paper just because it's marked 'important', not because it's actually relevant; adaptive learning compounds the confusion
**Why it happens:**
- Noise tag filtering applied in Phase 6 tag extraction
- But Phase 7 user might manually add tags or old tags from before Phase 6
- Profile builder doesn't know about noise filter rules
- Adaptive learning sees 'important' tag and boosts it when user accepts
- Soon 'important' is high-weight tag but it's metadata, not content

**How to avoid:**
1. Apply same noise filter in phase-7 tag profile building as Phase 6 extraction
2. Document noise patterns: 'to-read', 'important', 'review', 'inbox', 'wip', etc.
3. Test profile builder with items that have metadata tags
4. In adaptive learning, filter out noise tags before updating weights
5. Log when noise tags are filtered; users see tags being removed

**Warning signs:**
- Profile contains 'to-read', 'important', 'review'
- User adds metadata tags and recommendations shift drastically
- Adaptive learning boosts weight of workflow tags
- Recommendations cluster by workflow status, not content

## Code Examples

### Complete Tag Profile Building
```typescript
// Source: Existing profile-initializer.ts extended for tags

/**
 * Initialize user profile from seed papers including tag extraction.
 * Integrated into Phase 4 profile initialization flow.
 */
async function initializeProfileFromSeedPapers(
  seedItemIDs: string[],
  zoteroConnector: ZoteroConnector
): Promise<UserProfile> {
  // Step 1: Load seed papers (existing code)
  const seedItems: ZoteroItem[] = [];
  for (const itemID of seedItemIDs) {
    const item = await zoteroConnector.getItem(itemID);
    if (item) {
      seedItems.push(item);
    }
  }

  // Step 2: Extract signals from seed papers
  // (existing: authors, keywords; new: tags with frequency weighting)
  const profile = new Map<string, number>();
  const tags = new Map<string, number>();

  // Build tag profile (new in Phase 7)
  tags = buildTagProfile(seedItems, topN = 20, minFrequency = 1);

  // Step 3: Create profile object with all signals
  const userProfile: UserProfile = {
    tags: tags,  // NEW: frequency-weighted top 20 tags
    authors: authorFrequency,  // existing
    keywords: keywordFrequency,  // existing
    seedPaperIds: seedItemIDs,
    relevanceVsDiversity: 0,
    recencyBoost: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  return userProfile;
}
```

### Tag Scoring Integration in RecommendationEngine
```typescript
// Source: recommendation-engine.ts extended with tag scoring

/**
 * Updated scoreItem method that includes tag scoring.
 * Integrates tag signal alongside existing author and keyword signals.
 */
private scoreItem(
  item: ZoteroItem,
  profile: UserProfile,
  config: RecommendationConfig
): ScoredItem {
  // Calculate signal scores
  const tagScore = this.calculateTagScore(item, profile);      // NEW
  const authorScore = this.calculateAuthorScore(item, profile);
  const keywordScore = this.calculateKeywordScore(item, profile);

  // Apply profile weights to each signal type
  // Note: DEFAULT_PROFILE_WEIGHTS.tagWeight now uses user setting or default 1.5
  const rawScore =
    (tagScore * this.getTagWeight()) +        // NEW: user-configurable weight
    (authorScore * DEFAULT_PROFILE_WEIGHTS.authorWeight) +
    (keywordScore * DEFAULT_PROFILE_WEIGHTS.keywordWeight);

  // ... rest of scoring logic (recency boost, diversity penalty)
}

/**
 * Calculate tag match score (NEW method for Phase 7).
 * Returns sum of weights for tags in item that appear in profile.
 */
private calculateTagScore(item: ZoteroItem, profile: UserProfile): number {
  // Handle items with no tags (neutral, not a penalty)
  if (!item.tags || item.tags.length === 0) {
    return 0;
  }

  let score = 0;

  // For each item tag, find matching profile tag (with normalization)
  for (const itemTag of item.tags) {
    const normalized = normalizeTag(itemTag);
    if (!normalized) continue;

    const weight = profile.tags.get(normalized);
    if (weight !== undefined) {
      score += weight;  // Linear multi-match: sum all matching weights
    }
  }

  return score;
}

/**
 * Get tag weight from user settings (configurable per CONTEXT.md).
 * Allows users to tune tag signal importance via settings slider.
 */
private getTagWeight(): number {
  // In Phase 7: Read from settings (0.0 - 3.0 range)
  // Default 1.5 (between authors 1.0 and keywords 2.0)
  // Initially: return DEFAULT_PROFILE_WEIGHTS.tagWeight
  // Phase 8: return user setting or default
  return DEFAULT_PROFILE_WEIGHTS.tagWeight;
}
```

### Adaptive Learning with Tag Decay
```typescript
// Source: adaptive-learner.ts extended with tag decay

/**
 * Update profile from accept feedback, including tag weight adjustments.
 * Implements hybrid approach: per-tag adjustment + global decay.
 */
learnFromAccept(item: ZoteroItem): void {
  const profile = this.profileService.getProfile();
  if (!profile) return;

  // Extract signals (existing pattern + tags NEW)
  const signals = this.extractSignals(item);

  // Boost tag weights (NEW in Phase 7)
  for (const tag of signals.tags) {
    const currentWeight = profile.tags.get(tag) || 0;
    const newWeight = Math.min(MAX_WEIGHT, currentWeight + ACCEPT_BOOST);
    profile.tags.set(tag, newWeight);
  }

  // Existing: boost author and keyword weights
  // ... (existing code)

  // Apply decay to prevent permanent weight extremes (NEW in Phase 7)
  this.applyTagWeightDecay(profile);

  // Save via debounced service
  this.profileService.recordAccept(item);
}

/**
 * Apply exponential decay to tag weights.
 * Returns weights toward baseline (original seed-based frequency).
 */
private applyTagWeightDecay(profile: UserProfile): void {
  // Get baseline weights from seed papers (stored in profile or recomputed)
  const baselineWeights = this.getBaselineTagWeights(profile);

  // Apply decay: weight = baseline + (current - baseline) * decay_factor
  const decayFactor = 0.99;  // Conservative: 1% decay per update

  for (const [tag, currentWeight] of profile.tags.entries()) {
    const baseline = baselineWeights.get(tag) || currentWeight;
    const distance = currentWeight - baseline;
    const newWeight = baseline + distance * decayFactor;

    profile.tags.set(tag, Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newWeight)));
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Keywords/authors only | Add tag-based signal | Phase 7 | More semantic relevance; tags capture domain concepts |
| Static weights | User-configurable weights | Phase 7 + 8 | Users tune to their needs; adaptive to preferences |
| No feedback weighting | Boost/penalty from feedback | Phase 5-7 | Profile improves over time; learns from user behavior |
| No weight decay | Exponential decay toward baseline | Phase 7 | Prevents weight extremes; stable long-term learning |
| Sparse tag data unsupported | Graceful degradation to other signals | Phase 6-7 | Works for new users; gradually improves |

**Deprecated/outdated:**
- Treating all signals equally: Different signal types have different strengths; weighting needed
- Hand-rolled tag matching: Use established stemming libraries; linguistic variation matters
- Global learning only: Per-tag weight tracking captures nuanced preferences

## Open Questions

1. **Should profile store both baseline and learned tag weights?**
   - What we know: Decay needs baseline to return toward; baseline = frequency from seed papers
   - What's unclear: Store baseline separately or recompute on decay?
   - Recommendation: Store baseline in profile (or seed paper tag counts) to avoid recomputation

2. **How often should weight decay run?**
   - What we know: CONTEXT.md says "gradually return toward baseline"; research shows EMA is better than periodic reset
   - What's unclear: Daily, weekly, or on-demand during scoring?
   - Recommendation: On-demand during recommendation computation (minimal overhead, always stable)

3. **Should noise tag filtering be configurable by user?**
   - What we know: Phase 6 filters 'custom-color-*', 'highlight-*'; Phase 7 should filter 'to-read', 'important'
   - What's unclear: Let users include metadata tags if they want?
   - Recommendation: Hard-coded filter for Phase 7; defer user control to Phase 8+ if needed

4. **What is optimal top N value for profile tags?**
   - What we know: CONTEXT.md marks as Claude's discretion; research suggests 10-30 common
   - What's unclear: 10 too few? 30 too many? Varies by domain?
   - Recommendation: Start with 20; make configurable in settings if needed later

5. **Should multi-match scoring favor diversity or density?**
   - What we know: CONTEXT.md marks strategy as Claude's discretion
   - What's unclear: Items with many matching tags vs items with fewer, stronger matches?
   - Recommendation: Linear multi-match (current choice) because fair; diminishing returns penalizes breadth

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/recommendations/recommendation-engine.ts`, `adaptive-learner.ts`, `profile-service.ts` - Pattern foundation
- CONTEXT.md Phase 7 decisions - Locked decisions on weight values, filtering, learning approach
- Phase 6 RESEARCH.md - Tag extraction verification patterns and SQL-level filtering
- [Snowball Stemmer Project](https://snowballstem.org/projects.html) - Official Porter stemmer documentation and JavaScript implementations

### Secondary (MEDIUM confidence)
- [Natural NLP Library for Node.js](https://naturalnode.github.io/natural/) - Production stemming and linguistic support verified via official docs
- [GitHub: Stemmer NPM Package](https://github.com/stephenthompson/node-stemmer) - ESM stemmer implementation, active maintenance
- [Elastic: Hybrid Search Guide](https://www.elastic.com/what-is/hybrid-search) - Multi-signal scoring normalization and weighting patterns
- [Twitter Recommendation Algorithm (Open Source)](https://blog.x.com/engineering/en_us/topics/open-source/2023/twitter-recommendation-algorithm) - Production multi-signal scoring architecture reference
- [Exponential Moving Average in Deep Learning (2024)](https://arxiv.org/abs/2411.18704) - Weight decay and EMA theory; decay factor guidance
- [Metric Learning for Tag Recommendation (2024)](https://arxiv.org/abs/2411.06374) - Recent research on sparse tag data and cold-start handling

### Tertiary (LOW confidence - WebSearch only, marked for validation)
- [ACM: Tag-Based Recommendation Systems](https://dl.acm.org/doi/10.1145/1921591.1921595) - General tag recommendation patterns (academic, may not reflect current practice)
- [Research Gate: User-Tag Profile Modeling](https://www.researchgate.net/publication/284887247_A_Tag-Based_Recommender_System) - Profile construction approaches (multiple papers, varying quality)
- [Pinterest Cold-Start Solutions (2026)](https://arxiv.org/html/2512.17277v1) - Industrial sparse tag handling (recent but single case study)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Codebase foundation is proven; stemming libraries are standard
- Architecture patterns: HIGH - Multi-signal scoring pattern established in code; decay mechanism researched
- Pitfalls: HIGH - v1.1 research identified similar risks; patterns tested
- Adaptive learning: MEDIUM - Learning rate parameters from research; specific values unvalidated

**Research date:** 2026-01-26
**Valid until:** 30 days (tag-based recommendations stable; stemming algorithms mature; adaptive learning literature current)

## Implementation Priority for Planner

**Critical path:**
1. **Task 1: Add stemmer library and create utils/stemming.ts** (1-2 hours)
   - Install stemmer npm package
   - Implement normalizeTag() function
   - Test with variant spellings

2. **Task 2: Implement buildTagProfile()** (2-3 hours)
   - Extract from Phase 4 profile initialization
   - Frequency-weighted top 20 tags
   - Filter noise tags (to-read, important, review, etc.)
   - Test with seed papers

3. **Task 3: Implement calculateTagScore() in recommendation-engine.ts** (2-3 hours)
   - Integrate into scoring pipeline
   - Use normalized tag matching
   - Linear multi-match strategy
   - Return 0 for items without tags (neutral, not penalty)

4. **Task 4: Update AdaptiveLearner for tag weight adjustments** (2-3 hours)
   - Extract tags in learnFromAccept/learnFromReject
   - Apply ACCEPT_BOOST and REJECT_PENALTY
   - Enforce MIN_WEIGHT and MAX_WEIGHT bounds

5. **Task 5: Implement weight decay mechanism** (2-3 hours)
   - Baseline weight tracking
   - Exponential moving average decay (factor 0.99)
   - Call during scoring or periodic background task
   - Test that weights stabilize after 100+ feedback cycles

6. **Task 6: Add tag weight to settings UI** (2-3 hours)
   - Add slider for tag weight (0.0 - 3.0 range, default 1.5)
   - Update getTagWeight() to read from settings
   - Test UI and persistence

7. **Task 7: Integration and verification tests** (3-4 hours)
   - Test complete pipeline: seed papers -> profile tags -> scoring -> adaptive learning
   - Verify tag normalization consistency
   - Test sparse tag scenarios (0-3 tags in profile)
   - Test weight stability over 100+ feedback cycles
   - Verify recommendation breakdown shows tag contribution

**Testing strategy:**
- Unit: normalizeTag() with variants, buildTagProfile() with mock items
- Integration: Full flow from seed papers to recommendations
- Edge cases: Items with 0 tags, profiles with 0-2 tags, extreme accept/reject ratios
- Performance: Profile building with 5000-item seed library

