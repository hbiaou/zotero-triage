# Phase 11: Preflight Modal & Integration - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Display a library health check modal before onboarding that shows trash count, duplicate count, and group library advisories. Users must acknowledge warnings before proceeding to wizard. This phase integrates existing detection services (from Phase 10) into UI, not creating new detection capabilities.

</domain>

<decisions>
## Implementation Decisions

### Modal Presentation & Timing
- Preflight check appears **before wizard opens** (not between steps or as optional button)
- User must **acknowledge warnings** (click "I Understand" or similar) before proceeding to wizard
- Cannot skip by dismissing — must acknowledge each warning
- If preflight checks fail/error: **show error message + allow bypass** with "Continue Without Check" button
- Library filter selection: **Claude's discretion** (determine if preflight includes filter dropdown or assumes all libraries based on UX flow)

### Advisory Display & Tone
- **Color-coded severity levels**: red (critical like duplicates), yellow (warnings like trash), blue (info like group libraries)
- **Direct & actionable messaging tone**: clear directives like "Empty trash to improve accuracy" (not gentle suggestions)
- **Full detail upfront**: show count + message + explanation + action suggestions all visible immediately (no progressive disclosure)
- **Exact counts always shown**: "47 items in trash" not ranges or qualitative terms

### Progress & Performance
- Progress UI: **Claude's discretion** (choose between progress bar with phases, spinner with status, or percentage with estimates)
- Timeout handling: **show extended wait message** after 15s ("Large library detected. This may take up to a minute...") — keep checking, no skip option
- Execution order: **Claude's discretion** (sequential vs parallel checks based on performance trade-offs)
- Minimum loading duration: **Claude's discretion** (determine if instant results or 200ms minimum to avoid UI flash)

### Action Guidance & Links
- Trash advisory actions: **manual instructions only** ("In Zotero, go to Trash collection to review") — no deep links
- Duplicate advisory actions: **manual navigation instructions** ("In Zotero, go to Duplicate Items in left sidebar") — no direct URI available per research
- Group library advisory: **no action needed** — purely informational ("Group libraries automatically excluded from recommendations")
- Educational content: **no expandable sections** — keep advisories concise with actionable info only (no "Why does this matter?" tooltips)

### Claude's Discretion
- Library filter dropdown inclusion in preflight modal
- Progress UI design (bar/spinner/percentage)
- Sequential vs parallel check execution
- Minimum loading state duration
- Exact color palette and icon choices for severity levels
- Button copy for acknowledgment ("I Understand" vs "Continue" vs other)
- Error message wording when checks fail

</decisions>

<specifics>
## Specific Ideas

- Color-coding should follow standard severity patterns: red = critical, yellow = warning, blue = info
- Messaging should be direct and actionable — tell user what to do, not just what exists
- All counts must be precise — no approximations or ranges
- No progressive disclosure — show everything upfront so user can scan and acknowledge quickly

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-preflight-modal-&-integration*
*Context gathered: 2026-01-28*
