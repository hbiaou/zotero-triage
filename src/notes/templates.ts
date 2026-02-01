/**
 * Template functions for literature note generation
 *
 * Provides YAML frontmatter generation and formatting utilities
 * for creating structured literature notes from Zotero items.
 */

import type { ZoteroItem } from '../db/zotero-connector';

/**
 * Escape a string for safe YAML output.
 *
 * - Returns empty string for null/undefined
 * - Wraps in double quotes if contains special characters
 * - Escapes internal quotes and backslashes
 *
 * @param str - String to escape
 * @returns YAML-safe string
 */
export function escapeYaml(str: string | null | undefined): string {
  if (str === null || str === undefined) {
    return '';
  }

  // Check if string needs quoting
  const needsQuoting =
    str.includes(':') ||
    str.includes('#') ||
    str.includes('"') ||
    str.includes("'") ||
    str.includes('\n') ||
    str.includes('\r') ||
    str.startsWith(' ') ||
    str.startsWith('\t') ||
    str.endsWith(' ') ||
    str.endsWith('\t') ||
    str.startsWith('-') ||
    str.startsWith('[') ||
    str.startsWith('{') ||
    str.startsWith('*') ||
    str.startsWith('&') ||
    str.startsWith('!') ||
    str.startsWith('|') ||
    str.startsWith('>') ||
    str.startsWith('%') ||
    str.startsWith('@') ||
    str.startsWith('`') ||
    str === 'true' ||
    str === 'false' ||
    str === 'null' ||
    str === 'yes' ||
    str === 'no' ||
    /^\d/.test(str);

  if (!needsQuoting) {
    return str;
  }

  // Escape backslashes first, then double quotes
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return `"${escaped}"`;
}

/**
 * Format an array of authors for YAML list format.
 *
 * @param authors - Array of author names
 * @returns YAML formatted author list
 */
export function formatAuthorsYaml(authors: string[]): string {
  if (!authors || authors.length === 0) {
    return '  - "Unknown"';
  }

  return authors
    .map(author => {
      // Always quote author names to handle special characters
      const escaped = author
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      return `  - "${escaped}"`;
    })
    .join('\n');
}

/**
 * Format an array of tags for YAML list format.
 *
 * @param tags - Array of tag names
 * @returns YAML formatted tag list, or empty string if no tags
 */
export function formatTagsYaml(tags: string[]): string {
  if (!tags || tags.length === 0) {
    return '';
  }

  return tags
    .map(tag => {
      const escaped = tag
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      return `  - "${escaped}"`;
    })
    .join('\n');
}

/**
 * Format an array of collections for YAML list format.
 *
 * Similar to formatTagsYaml, but for collection names.
 *
 * @param collections - Array of collection names
 * @returns YAML formatted collection list, or empty string if no collections
 */
export function formatCollectionsYaml(collections: string[]): string {
  if (!collections || collections.length === 0) {
    return '';
  }

  return collections
    .map(collection => {
      const escaped = collection
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      return `  - "${escaped}"`;
    })
    .join('\n');
}

/**
 * Format abstract for YAML block scalar.
 *
 * Uses the folded style (>) for multiline text.
 *
 * @param abstract - Abstract text
 * @returns YAML formatted abstract block
 */
export function formatAbstractYaml(abstract: string | null): string {
  if (!abstract) {
    return '';
  }

  // Normalize whitespace and indent each line for block scalar
  const lines = abstract
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => `  ${line.trim()}`)
    .join('\n');

  return `>\n${lines}`;
}

/**
 * Generate YAML frontmatter for a Zotero item.
 *
 * Creates a complete frontmatter block with all available metadata.
 *
 * @param item - Zotero item to generate frontmatter for
 * @returns Complete YAML frontmatter string including delimiters
 */
export function generateFrontmatter(item: ZoteroItem): string {
  const createdDate = new Date().toISOString().split('T')[0];
  const zoteroLink = `zotero://select/items/0_${item.itemKey}`;

  const lines: string[] = [
    '---',
    `title: ${escapeYaml(item.title)}`,
    'authors:',
    formatAuthorsYaml(item.authors),
    `year: ${escapeYaml(item.year || 'Unknown')}`,
    `doi: ${escapeYaml(item.doi)}`,
    `isbn: ${escapeYaml(item.isbn)}`,
    `journal: ${escapeYaml(item.journal)}`,
    `publisher: ${escapeYaml(item.publisher)}`,
    `volume: ${escapeYaml(item.volume)}`,
    `issue: ${escapeYaml(item.issue)}`,
    `pages: ${escapeYaml(item.pages)}`,
    `item-type: ${escapeYaml(item.itemType)}`,
    `zotero-key: ${item.itemKey}`,
    `zotero-link: ${zoteroLink}`,
    `pdf-path: ${escapeYaml(item.pdfPath)}`,
  ];

  // Add tags if present
  if (item.tags && item.tags.length > 0) {
    lines.push('tags:');
    lines.push(formatTagsYaml(item.tags));
  } else {
    lines.push('tags: []');
  }

  // Add collections if present
  if (item.collections && item.collections.length > 0) {
    lines.push('collections:');
    lines.push(formatCollectionsYaml(item.collections));
  } else {
    lines.push('collections: []');
  }

  // Add abstract with block scalar formatting
  if (item.abstract) {
    lines.push(`abstract: ${formatAbstractYaml(item.abstract)}`);
  } else {
    lines.push('abstract: ""');
  }

  lines.push(`created: ${createdDate}`);
  lines.push('status: unread');
  lines.push('---');

  return lines.join('\n');
}

/**
 * Generate the note body template.
 *
 * Provides structured headings for user to fill in.
 *
 * @returns Markdown note body template
 */
export function generateNoteBody(): string {
  return `
## Summary



## Key Points

-

## Notes



## Quotes

`;
}

/**
 * Domain type for template selection.
 */
export type Domain = 'Academic' | 'Software' | 'Farming' | 'General';

/**
 * Generate Academic domain template for literature notes.
 *
 * Uses the ACADEMIC_TEMPLATE.md structure with sections for:
 * Abstract, Context, Objectives, Niche, Connections, Implications,
 * Speculation, Emphasis, and References to Check Out.
 *
 * @param item - Zotero item to generate template for
 * @returns Complete Academic template with frontmatter and sections
 */
export function generateAcademicTemplate(item: ZoteroItem): string {
  const createdDate = new Date().toISOString().split('T')[0];
  const zoteroLink = `zotero://select/items/0_${item.itemKey}`;
  const title = item.title || 'Untitled';

  // Build frontmatter
  const frontmatter = [
    '---',
    'note_type: literature-note',
    `zotero_item_type: ${escapeYaml(item.itemType)}`,
    'knowledge_domain: Academic',
    'source: zotero',
    `zotero_key: ${item.itemKey}`,
    `authors:`,
    formatAuthorsYaml(item.authors),
    `year: ${escapeYaml(item.year || 'Unknown')}`,
    `title: ${escapeYaml(title)}`,
    `journal_or_publisher: ${escapeYaml(item.journal || item.publisher || '')}`,
    `doi: ${escapeYaml(item.doi || '')}`,
    `url: ${escapeYaml(item.url || '')}`,
    `date_processed: ${createdDate}`,
    'evidence_level: <FullText | Notes | Abstract | MetadataOnly>',
    'template_used: ACADEMIC',
    '---',
  ].join('\n');

  // Build template body
  const body = `
# 👨🏻‍🎓 ${title}

## Abstract

<Author-provided abstract if available.
If not available, explicitly state: "Abstract not available in Zotero data.">

---

## Context

**Significance and background of the research problem.**

- Broader scientific, ecological, technical, or theoretical context
- Problem setting as described by the authors
- Societal, environmental, or disciplinary relevance (ONLY if explicitly stated)

> _If context is not clearly stated in the source, note the limitation._

---

## Objectives

**Purpose, goals, and research questions or hypotheses.**

- Main objective(s)
- Research questions and/or hypotheses (verbatim when possible)
- Scope and boundaries of the study

---

## Niche

**Specific gap or limitation the research addresses.**

- What is missing, unresolved, or insufficient in prior work
- How the authors position their contribution relative to existing literature

---

## Connections

**Conceptual, theoretical, and methodological grounding.**

### Theoretical & Conceptual Framework

- Theories, models, or paradigms explicitly referenced
- Assumptions or presuppositions guiding the study

### Key Concepts & Variables

- **Concept / Variable** — definition as used by the authors
- Relationships between variables or concepts (e.g. causal, correlational, hierarchical)

> _Do not infer relationships not stated or tested._

---

## Implications

**Key findings, conclusions, and contributions.**

### Main Results

- Empirical findings or analytical outcomes
- Supported vs unsupported hypotheses (if applicable)

### Contributions

- Theoretical contributions
- Methodological contributions
- Practical or policy-relevant implications (ONLY if stated)

---

## Speculation

**Author-identified future directions and open questions.**

- Suggested avenues for further research
- Limitations acknowledged by the authors
- New questions explicitly raised

> _Do NOT add your own speculative ideas._

---

## Emphasis

**Integrated synthesis of the study.**

- How the findings fit into the broader research landscape
- Why this work matters within its field
- Central takeaway in one cohesive narrative

---

## References to Check Out

- References explicitly mentioned as important by the authors
- Seminal works cited in framing or discussion

---

# Tags

#literature #academic #research #<domain> #<method> #<topic1> #<topic2>
`;

  return frontmatter + '\n' + body;
}

/**
 * Generate Software domain template for literature notes.
 *
 * Uses the SOFTWARE_TUTORIAL_TEMPLATE.md structure with sections for:
 * Overview, Context, Objectives, Core Concepts, Procedures, Code,
 * Constraints, Implications, Open Issues, and Key Takeaways.
 *
 * @param item - Zotero item to generate template for
 * @returns Complete Software template with frontmatter and sections
 */
export function generateSoftwareTemplate(item: ZoteroItem): string {
  const createdDate = new Date().toISOString().split('T')[0];
  const zoteroLink = `zotero://select/items/0_${item.itemKey}`;
  const title = item.title || 'Untitled';

  // Build frontmatter
  const frontmatter = [
    '---',
    'note_type: literature-note',
    `zotero_item_type: ${escapeYaml(item.itemType)}`,
    'knowledge_domain: Software',
    'source: zotero',
    `zotero_key: ${item.itemKey}`,
    `authors_or_instructor:`,
    formatAuthorsYaml(item.authors),
    `year: ${escapeYaml(item.year || 'Unknown')}`,
    `title: ${escapeYaml(title)}`,
    'platform_or_language: <if applicable>',
    `url: ${escapeYaml(item.url || '')}`,
    `date_processed: ${createdDate}`,
    'evidence_level: <FullText | Notes | Transcript | MetadataOnly>',
    'template_used: SOFTWARE',
    '---',
  ].join('\n');

  // Build template body
  const body = `
# 💻 ${title}

## Overview

- Purpose of the tool, system, or workflow
- Target users and use cases
- Problem it aims to solve

---

## Context

- Technical or practical background
- Limitations of existing tools or approaches
- Motivation for development

---

## Objectives

- Intended functionality
- Performance or usability goals
- Design objectives stated by the authors/instructors

---

## Core Concepts & Architecture

- Main components or modules
- Key abstractions or design principles
- Dependencies or integrations

---

## Procedures / Workflow

**Exact steps as presented in the source.**

1. …
2. …

> _Preserve order, parameters, and commands verbatim._

---

## Code, Commands & Configuration

\`\`\`text
<verbatim snippets only>
\`\`\`

---

## Constraints & Limitations

- Known limitations

- Assumptions or prerequisites

- Performance or scalability considerations

---

## Implications & Use Cases

- Practical applications

- Research or production relevance

- Recommended contexts of use

---

## Open Issues / Future Work

- Explicitly stated future improvements

- Known unresolved problems

---

## Key Takeaways

- What the reader should remember

- Why this tool or approach is important

---

## Tags

#literature #software #tooling #programming #<language> #<topic1> #<topic2>
`;

  return frontmatter + '\n' + body;
}

/**
 * Generate Farming domain template for literature notes.
 *
 * Uses the FARMING_TUTORIAL_TEMPLATE.md structure with sections for:
 * Context, Objectives, System Components, Step-by-Step Practices,
 * Timing, Outcomes, Variations, Limitations, and Key Takeaways.
 *
 * @param item - Zotero item to generate template for
 * @returns Complete Farming template with frontmatter and sections
 */
export function generateFarmingTemplate(item: ZoteroItem): string {
  const createdDate = new Date().toISOString().split('T')[0];
  const zoteroLink = `zotero://select/items/0_${item.itemKey}`;
  const title = item.title || 'Untitled';

  // Build frontmatter
  const frontmatter = [
    '---',
    'note_type: literature-note',
    `zotero_item_type: ${escapeYaml(item.itemType)}`,
    'knowledge_domain: Farming',
    'source: zotero',
    `zotero_key: ${item.itemKey}`,
    `authors_or_presenter:`,
    formatAuthorsYaml(item.authors),
    `year: ${escapeYaml(item.year || 'Unknown')}`,
    `title: ${escapeYaml(title)}`,
    'location_or_context: <if applicable>',
    `url: ${escapeYaml(item.url || '')}`,
    `date_processed: ${createdDate}`,
    'evidence_level: <FullText | Notes | Transcript | MetadataOnly>',
    'template_used: FARMING',
    '---',
  ].join('\n');

  // Build template body
  const body = `
# 🌱 ${title}

## Context

- Agroecological, climatic, or socio-economic setting
- Farming system or production context
- Constraints addressed (soil, water, labor, climate, pests)

---

## Objectives

- Production, sustainability, or resilience goals
- Problems the practice or study aims to solve

---

## System Components

- Crops, livestock, trees, inputs
- Tools and materials
- Spatial or temporal organization

---

## Step-by-Step Practices

**Practices exactly as described.**

1. …
2. …

> _Do not generalize beyond the described context._

---

## Timing & Management

- Seasonal considerations
- Labor or scheduling requirements
- Key decision points

---

## Outcomes & Implications

- Yield, resilience, or ecological outcomes
- Economic or social implications

> If stated

---

## Variations & Adaptations

- Context-specific adaptations mentioned by the source
- Conditions under which practices may change

---

## Limitations & Risks

- Failures, risks, or constraints identified
- Conditions where the practice may not apply

---

## Key Takeaways

- Core lessons
- Applicability boundaries

---

# Tags

#literature #farming #agroecology #agriculture #<crop> #<practice> #<topic>
`;

  return frontmatter + '\n' + body;
}

/**
 * Generate General domain template for literature notes.
 *
 * Uses the GENERAL_TEMPLATE.md structure with sections for:
 * Overview, Key Ideas, Structure, Notable Statements, Implications,
 * Limitations, and Takeaways.
 *
 * @param item - Zotero item to generate template for
 * @returns Complete General template with frontmatter and sections
 */
export function generateGeneralTemplate(item: ZoteroItem): string {
  const createdDate = new Date().toISOString().split('T')[0];
  const zoteroLink = `zotero://select/items/0_${item.itemKey}`;
  const title = item.title || 'Untitled';

  // Build frontmatter
  const frontmatter = [
    '---',
    'note_type: literature-note',
    `zotero_item_type: ${escapeYaml(item.itemType)}`,
    'knowledge_domain: General',
    'source: zotero',
    `zotero_key: ${item.itemKey}`,
    `authors_or_presenter:`,
    formatAuthorsYaml(item.authors),
    `year: ${escapeYaml(item.year || 'Unknown')}`,
    `title: ${escapeYaml(title)}`,
    `url: ${escapeYaml(item.url || '')}`,
    `date_processed: ${createdDate}`,
    'evidence_level: <Transcript | Notes | MetadataOnly>',
    'template_used: GENERAL',
    '---',
  ].join('\n');

  // Build template body
  const body = `
# 🧭 ${title}

## Overview

- Nature of the content
- Main theme or narrative

---

## Key Ideas

- Central arguments or points
- Supporting examples or anecdotes

---

## Structure

- How the content is organized
- Major sections or transitions

---

## Notable Statements

> Verbatim quotes when relevant

---

## Implications

- What this content suggests or argues
- Relevance to broader discussions

---

## Limitations

- Biases or subjectivity
- Missing perspectives

> ONLY if explicit

---

## Takeaways

- Main insights
- Why this content is worth keeping

---

# Tags

#literature #general #ideas #reflection #<topic1> #<topic2>
`;

  return frontmatter + '\n' + body;
}

/**
 * Get domain-specific template based on domain classification.
 *
 * Routes to the appropriate template generator based on the domain.
 * Defaults to General template if domain is unrecognized.
 *
 * @param domain - Domain classification (Academic, Software, Farming, or General)
 * @param item - Zotero item to generate template for
 * @returns Complete domain-specific template with frontmatter and sections
 */
export function getDomainTemplate(domain: Domain, item: ZoteroItem): string {
  switch (domain) {
    case 'Academic':
      return generateAcademicTemplate(item);
    case 'Software':
      return generateSoftwareTemplate(item);
    case 'Farming':
      return generateFarmingTemplate(item);
    case 'General':
      return generateGeneralTemplate(item);
    default:
      // Fallback to General template for unrecognized domains
      return generateGeneralTemplate(item);
  }
}
