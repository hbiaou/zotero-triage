---
created: 2026-01-25T12:23
title: Enhanced error messages in ProfileInitializer
area: onboarding
files:
  - src/profile/profile-initializer.ts:56-60
---

## Problem

When ProfileInitializer creates a profile from seed papers but no keywords/authors are extracted (empty profile), the process logs a warning to console but continues silently. The wizard completes successfully and shows "Setup complete!" even though the profile is effectively empty.

Impact: User thinks profile is configured, but batch generation falls back to date-sorting instead of using recommendations. No visible indication that profile initialization failed or is incomplete.

Identified during v1.0 milestone audit as minor UX gap (non-blocking).

## Solution

Add user-facing warning notice when seed papers result in empty profile:

1. In ProfileInitializer.initializeProfile() after extracting signals:
   - Check if all signal maps are empty (no tags, no authors, no keywords)
   - If empty, show Notice with warning icon:
     "Profile created but no patterns found in seed papers. Recommendations will use date-based sorting until you add more papers."

2. Consider adding "View Profile" button in notice that opens settings tab

3. Log existing console.warn for debugging but also surface to user

Alternative: Show warning in Setup Wizard completion step if profile is empty, allowing user to go back and select different seed papers.
