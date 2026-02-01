---
phase: 15-content-extraction-&-classification-pipeline
plan: 05
subsystem: notes
tags: [templates, domain-classification, literature-notes, typescript]

# Dependency graph
requires:
  - phase: 15-02
    provides: Domain classification system with Academic, Software, Farming, General domains
provides:
  - Domain-specific template variants for all 4 domains
  - getDomainTemplate() function for template selection by domain
  - Domain type for type-safe template routing
affects: [16-accept-workflow-integration, enrichment-flows, template-based-note-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Domain-specific template generators with frontmatter + body structure
    - Template selection via getDomainTemplate() switch statement

key-files:
  created: []
  modified:
    - src/notes/templates.ts

key-decisions:
  - "Template content preserved exactly from user-provided files without modification"
  - "Frontmatter includes domain-specific fields (knowledge_domain, template_used, evidence_level)"
  - "Title placeholder replacement with item.title from ZoteroItem"
  - "Default fallback to General template for unrecognized domains"
  - "Domain type union ('Academic' | 'Software' | 'Farming' | 'General') for type safety"

patterns-established:
  - "Template generators return frontmatter + body as single string"
  - "Domain-specific emojis in headers (👨🏻‍🎓 Academic, 💻 Software, 🌱 Farming, 🧭 General)"
  - "Evidence level as placeholder in frontmatter for future enrichment integration"

# Metrics
duration: 4min
completed: 2026-02-01
---

# Phase 15 Plan 05: Domain-Specific Templates Summary

**Four domain-specific template generators (Academic, Software, Farming, General) with getDomainTemplate() routing function**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-01T17:00:01Z
- **Completed:** 2026-02-01T17:03:44Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Integrated four user-provided domain templates into TypeScript functions
- Created type-safe Domain union type for template selection
- Implemented getDomainTemplate() routing function with fallback to General
- All templates preserve exact structure from user-provided markdown files

## Task Commits

Each task was committed atomically:

1. **Tasks 1 & 2: Add domain-specific template variants and getDomainTemplate function** - `60216b9` (feat)

**Note:** Tasks 1 and 2 were combined into a single commit as they represent a cohesive feature (template variants + router function).

## Files Created/Modified
- `src/notes/templates.ts` - Added 4 domain template generators (generateAcademicTemplate, generateSoftwareTemplate, generateFarmingTemplate, generateGeneralTemplate), Domain type, and getDomainTemplate routing function

## Decisions Made

1. **Template content preserved exactly as provided** - User templates from tmp/templates/ integrated without modification to maintain approved structure
2. **Title placeholder replacement** - Templates use {{Title}} placeholder; replaced with item.title from ZoteroItem at generation time
3. **Frontmatter domain tracking** - Each template includes knowledge_domain field matching its domain type
4. **Evidence level as placeholder** - Frontmatter includes evidence_level field as placeholder for future enrichment integration
5. **Default fallback to General** - getDomainTemplate() defaults to General template for unrecognized domains

## Deviations from Plan

None - plan executed exactly as written. All four templates integrated from tmp/templates/ without modification.

## Issues Encountered

None - templates loaded successfully, TypeScript compilation passed without errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Templates ready for enrichment integration.**

The four domain-specific templates are now accessible via getDomainTemplate(domain, item) and ready for integration into the Accept workflow (Phase 16) and enrichment flows.

**Key integration points:**
- Classification modal (15-03) outputs Domain classification
- getDomainTemplate() consumes Domain + ZoteroItem
- Returns complete template with frontmatter and structured sections
- Templates match exact specifications from user-provided files

**Gap 1 (CRITICAL) CLOSED:** Domain-specific template variants now exist and are accessible programmatically.

---
*Phase: 15-content-extraction-&-classification-pipeline*
*Completed: 2026-02-01*
