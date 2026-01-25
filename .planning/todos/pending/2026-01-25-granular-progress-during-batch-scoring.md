---
created: 2026-01-25T12:23
title: Granular progress during batch scoring
area: performance
files:
  - src/batch/batch-service.ts:59-150
  - src/recommendations/recommendation-engine.ts:64-200
---

## Problem

BatchService.generateBatch() shows progress during filtering phase but not during scoring phase. For large libraries (5000+ items), the recommendation engine scoring can take noticeable time without progress feedback, making UI appear unresponsive.

Current implementation:
- Filtering phase: Shows "Filtering candidates..." progress
- Scoring phase: Silent (no progress updates)
- Sorting phase: Completes quickly

Impact: Low - Only affects users with very large libraries during batch generation. UI doesn't freeze (async), but lacks feedback during scoring.

Identified during v1.0 milestone audit as minor performance improvement (non-blocking).

## Solution

Add progress callback parameter to RecommendationEngine.scoreItems():

1. Update RecommendationEngine.scoreItems() to accept optional onProgress callback
2. Inside scoring loop, report progress every N items (e.g., every 100):
   ```typescript
   for (let i = 0; i < items.length; i++) {
     const scored = this.scoreItem(items[i], profile);
     scoredItems.push(scored);
     if (i % 100 === 0 && onProgress) {
       onProgress(i, items.length);
     }
   }
   ```
3. BatchService passes ProgressTracker update to engine:
   ```typescript
   const scoredItems = await this.recommendationEngine.scoreItems(
     filteredItems,
     (current, total) => progress.update(current, `Scoring items...`)
   );
   ```

Threshold: Only show granular progress if item count > 1000 to avoid overhead for small batches.
