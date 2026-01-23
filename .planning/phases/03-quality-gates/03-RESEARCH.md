# Phase 3: Quality Gates - Research

**Researched:** 2026-01-23
**Domain:** Metadata validation, schema configuration, YAML enrichment, validation UI patterns
**Confidence:** HIGH

## Summary

Phase 3 implements a configurable validation system that blocks incomplete items before import, shows exactly what's missing, and provides paths to fix metadata. The research validates that **Zod** is the standard for TypeScript schema validation with excellent error reporting, Obsidian's `Modal` class provides confirmation dialogs, and Zotero's database exposes all necessary fields for comprehensive validation. Enhanced YAML frontmatter includes publication details, categorization, and content signals beyond Phase 1 basics.

Key findings:
- Zod is the industry standard for TypeScript-first schema validation with minimal bundle size
- Obsidian's Modal class (not FuzzySuggestModal) is the right pattern for confirmation dialogs
- Zotero item types have documented fields; journal articles require DOI/year/journal, books require ISBN/year/publisher
- Validation error display best practices: inline errors near fields + summary list at top + clear blocking message
- zotero://select URI protocol works cross-platform for opening items in Zotero
- YAML frontmatter can include optional fields with placeholders to make structure explicit

**Primary recommendation:** Use Zod for validation schemas with per-item-type definitions, implement a confirmation Modal for override actions showing what's missing, store validation rules in plugin settings as toggleable field lists, enhance YAML with publication details + tags + keywords using optional fields with placeholders.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.0+ | Schema validation with TypeScript inference | Industry standard for TypeScript validation; minimal bundle; built-in error formatting |
| obsidian | latest | Modal for confirmation dialogs | Official API; handles keyboard/mouse events properly |
| (existing) sql.js | 1.13.0+ | Field extraction from Zotero | Already integrated Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod-validation-error | 1.5+ | User-friendly error messages | Converts ZodError to readable text for UI display |
| (existing) lodash.debounce | 4.0.8 | Settings saves | Already in use Phase 1 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod | JSON Schema manually | Manual schema writing; no type inference; larger validation code |
| Zod | Ajv (JSON Schema validator) | More complex setup; separate schema definition from validation |
| Modal | FuzzySuggestModal | FuzzySuggestModal is for search/selection; Modal is for decisions/confirmation |
| Modal confirmation | Notice with links | Notice is too brief for complex decisions; Modal provides full context |

**Installation:**
```bash
npm install zod zod-validation-error
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── validation/
│   ├── validation-service.ts       # Orchestrate validation logic
│   ├── schemas/
│   │   ├── item-schemas.ts         # Per-item-type Zod schemas
│   │   └── quality-gate-config.ts  # User-configurable rules
│   └── types.ts                    # ValidationResult, QualityGateConfig
├── ui/
│   ├── override-modal.ts           # Confirmation Modal for override
│   ├── validation-error-display.ts # Error list rendering
│   └── triage-view.ts              # (extend with validation badge)
├── settings.ts                      # (extend with quality gate settings)
├── main.ts                          # (register validation on import)
└── notes/
    └── note-generator.ts           # (extend YAML generation)
```

### Pattern 1: Zod Schema Per Item Type
**What:** Define validation rules as Zod schemas, one per item type
**When to use:** At plugin startup; used for all validation checks
**Example:**
```typescript
// Source: Zod docs + Phase 3 requirements
import { z } from 'zod';

// Define schemas for different item types
const JournalArticleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  creators: z.array(z.object({
    firstName: z.string(),
    lastName: z.string()
  })).min(1, 'At least one author is required'),
  publicationTitle: z.string().min(1, 'Journal name is required'),
  date: z.string().min(1, 'Publication year is required'),
  DOI: z.string().min(1, 'DOI is required').optional().refine(
    val => !val || /^10\.\S+\/\S+$/.test(val),
    'Invalid DOI format'
  ),
});

const BookSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  creators: z.array(z.object({
    firstName: z.string(),
    lastName: z.string()
  })).min(1, 'At least one author or editor is required'),
  date: z.string().min(1, 'Publication year is required'),
  publisher: z.string().min(1, 'Publisher is required'),
  ISBN: z.string().min(1, 'ISBN is required').optional(),
});

// Schema map keyed by item type
const ITEM_TYPE_SCHEMAS: Record<string, z.ZodSchema> = {
  'journalArticle': JournalArticleSchema,
  'book': BookSchema,
  // ... other item types
};
```

### Pattern 2: Validation Service with Error Formatting
**What:** Validate item against schema; return structured errors
**When to use:** Before accepting an item for import
**Example:**
```typescript
// Source: Zod + zod-validation-error docs
import { z, ZodError } from 'zod';
import { generateErrorMessage } from 'zod-validation-error';

interface ValidationResult {
  valid: boolean;
  errors: string[]; // Human-readable error messages
  missingFields: string[]; // Field names only for UI display
}

class ValidationService {
  constructor(
    private schemas: Record<string, z.ZodSchema>,
    private config: QualityGateConfig
  ) {}

  validate(item: ZoteroItem): ValidationResult {
    // Get schema for this item type
    const itemTypeKey = item.itemType.toLowerCase().replace(/\s+/g, '');
    const schema = this.schemas[itemTypeKey];

    if (!schema) {
      return { valid: true, errors: [], missingFields: [] };
    }

    // Validate against schema
    const result = schema.safeParse(item);

    if (result.success) {
      return { valid: true, errors: [], missingFields: [] };
    }

    // Extract errors
    const errorMessage = generateErrorMessage(result.error);
    const errors = errorMessage.split('\n').filter(e => e.trim());

    // Extract field names from ZodError
    const missingFields = result.error.issues
      .filter(issue => issue.code === 'too_small' || issue.code === 'invalid_type')
      .map(issue => {
        // issue.path is ['fieldName'], join for nested
        const field = issue.path.join('.');
        return field || 'unknown';
      });

    return {
      valid: false,
      errors,
      missingFields: [...new Set(missingFields)]
    };
  }
}
```

### Pattern 3: Configurable Quality Gate Rules
**What:** Store per-item-type required fields in plugin settings
**When to use:** Settings tab; validation initialization
**Example:**
```typescript
// Source: Phase 3 CONTEXT.md + Phase 2 settings patterns
interface QualityGateConfig {
  enabled: boolean; // Block by default per CONTEXT.md
  rules: Record<string, {
    itemType: string;
    requiredFields: string[];
  }>;
}

const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = {
  enabled: true,
  rules: {
    'journalArticle': {
      itemType: 'Journal Article',
      requiredFields: [
        'title',
        'creators', // at least one author
        'publicationTitle', // journal name
        'date', // year
        'DOI'
      ]
    },
    'book': {
      itemType: 'Book',
      requiredFields: [
        'title',
        'creators', // at least one author/editor
        'date', // year
        'publisher'
      ]
    }
  }
};

// In settings.ts, extend display():
containerEl.createEl('h2', { text: 'Quality Gates' });

new Setting(containerEl)
  .setName('Block incomplete items')
  .setDesc('Prevent import of items with missing required fields')
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.qualityGate.enabled)
    .onChange(async (value) => {
      this.plugin.settings.qualityGate.enabled = value;
      await this.plugin.saveSettings();
    }));

// For each item type, render checkboxes
Object.values(DEFAULT_QUALITY_GATE_CONFIG.rules).forEach(rule => {
  containerEl.createEl('h3', { text: rule.itemType });

  AVAILABLE_FIELDS[rule.itemType].forEach(field => {
    new Setting(containerEl)
      .setName(field)
      .addToggle(toggle => toggle
        .setValue(rule.requiredFields.includes(field))
        .onChange(async (value) => {
          if (value) {
            rule.requiredFields.push(field);
          } else {
            rule.requiredFields = rule.requiredFields.filter(f => f !== field);
          }
          await this.plugin.saveSettings();
        }));
  });
});
```

### Pattern 4: Override Confirmation Modal
**What:** Modal dialog showing missing fields, asking for confirmation to proceed
**When to use:** When validation fails and user clicks "Override"
**Example:**
```typescript
// Source: Obsidian Modal API docs
import { App, Modal } from 'obsidian';

interface OverrideConfirmOptions {
  item: ZoteroItem;
  missingFields: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

class OverrideConfirmModal extends Modal {
  constructor(
    app: App,
    private options: OverrideConfirmOptions
  ) {
    super(app);
  }

  onOpen(): void {
    const { containerEl } = this;
    containerEl.createEl('h2', { text: 'Import with missing fields?' });

    // Item info
    containerEl.createDiv({
      cls: 'override-item-info',
      text: `${this.options.item.title} by ${this.options.item.creators[0]?.lastName || 'Unknown'}`
    });

    // Missing fields list
    const missingDiv = containerEl.createDiv({ cls: 'override-missing' });
    missingDiv.createEl('h3', { text: 'Missing fields:' });
    const list = missingDiv.createEl('ul');
    this.options.missingFields.forEach(field => {
      list.createEl('li', { text: field });
    });

    // Warning
    containerEl.createDiv({
      cls: 'override-warning',
      text: 'Imported notes may be incomplete. You can edit the metadata in Zotero and re-import later.'
    });

    // Action buttons
    const actions = containerEl.createDiv({ cls: 'modal-button-container' });

    const confirmBtn = actions.createEl('button', {
      cls: 'mod-cta',
      text: 'Import Anyway'
    });
    confirmBtn.addEventListener('click', () => {
      this.options.onConfirm();
      this.close();
    });

    const cancelBtn = actions.createEl('button', {
      text: 'Cancel'
    });
    cancelBtn.addEventListener('click', () => {
      this.options.onCancel();
      this.close();
    });
  }

  onClose(): void {
    const { containerEl } = this;
    containerEl.empty();
  }
}

// Usage in batch triage:
if (!validationResult.valid && config.enabled) {
  new OverrideConfirmModal(app, {
    item: item,
    missingFields: validationResult.missingFields,
    onConfirm: () => {
      // Force import
      importItem(item, { skipValidation: true });
    },
    onCancel: () => {
      // Do nothing
    }
  }).open();
}
```

### Pattern 5: Validation Error Display in Triage Card
**What:** Show validation status on card; indicate if item is blocked
**When to use:** During batch triage, when displaying item card
**Example:**
```typescript
// Source: Phase 2 triage-card pattern + validation
interface TriageCardOptions {
  item: ZoteroItem;
  validationResult?: ValidationResult;
  onAccept: (item: ZoteroItem) => void;
  onReject: (item: ZoteroItem) => void;
  onDefer: (item: ZoteroItem) => void;
}

function createTriageCard(
  container: HTMLElement,
  options: TriageCardOptions
): HTMLElement {
  const { item, validationResult, onAccept, onReject, onDefer } = options;
  const card = container.createDiv({ cls: 'zotbridge-triage-card' });

  // Header with badge
  const header = card.createDiv({ cls: 'triage-card-header' });
  header.createSpan({ cls: 'item-type-badge', text: item.itemType });

  // Validation status badge (if applicable)
  if (validationResult && !validationResult.valid) {
    const warningBadge = header.createSpan({
      cls: 'validation-warning-badge',
      text: `${validationResult.missingFields.length} field(s) missing`
    });
    warningBadge.title = validationResult.missingFields.join(', ');
  }

  // Title
  card.createEl('h3', {
    cls: 'triage-card-title',
    text: item.title || 'Untitled'
  });

  // Meta
  const meta = card.createDiv({ cls: 'triage-card-meta' });
  const authors = item.creators.slice(0, 2)
    .map(c => `${c.lastName}, ${c.firstName}`)
    .join('; ') || 'Unknown author';
  meta.createSpan({ text: `${authors} (${item.date || 'n.d.'})` });

  // Validation errors (if any)
  if (validationResult && !validationResult.valid) {
    const errorDiv = card.createDiv({ cls: 'triage-card-validation-errors' });
    errorDiv.createEl('strong', { text: 'Issues found:' });
    const list = errorDiv.createEl('ul');
    validationResult.errors.forEach(error => {
      list.createEl('li', { text: error });
    });

    // Link to fix in Zotero
    const fixLink = errorDiv.createEl('a', {
      cls: 'validation-fix-link',
      text: 'Open in Zotero to fix'
    });
    fixLink.href = `zotero://select/items/0_${item.itemKey}`;
  }

  // Abstract
  if (item.abstract) {
    const abstractText = item.abstract.length > 200
      ? item.abstract.substring(0, 200) + '...'
      : item.abstract;
    card.createDiv({
      cls: 'triage-card-abstract',
      text: abstractText
    });
  }

  // Action buttons
  const actions = card.createDiv({ cls: 'triage-card-actions' });

  // If validation fails, show Accept with warning
  const acceptBtn = actions.createEl('button', {
    cls: validationResult && !validationResult.valid
      ? 'triage-btn triage-btn-accept-warning'
      : 'triage-btn triage-btn-accept',
    text: validationResult && !validationResult.valid ? 'Accept Anyway' : 'Accept'
  });
  acceptBtn.addEventListener('click', () => onAccept(item));

  const deferBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-defer',
    text: 'Defer'
  });
  deferBtn.addEventListener('click', () => onDefer(item));

  const rejectBtn = actions.createEl('button', {
    cls: 'triage-btn triage-btn-reject',
    text: 'Reject'
  });
  rejectBtn.addEventListener('click', () => onReject(item));

  return card;
}
```

### Pattern 6: Enhanced YAML Frontmatter with Metadata
**What:** Generate YAML with additional fields beyond Phase 1 basics
**When to use:** Note generation in note-generator.ts
**Example:**
```typescript
// Source: Phase 1 note-generator + Phase 3 enrichment
interface EnhancedZoteroItem extends ZoteroItem {
  volume?: string;
  issue?: string;
  pages?: string;
  tags: string[];
  keywords?: string[];
  collections: string[];
}

function generateEnhancedFrontmatter(item: EnhancedZoteroItem): string {
  const escapeYaml = (str: string | null | undefined): string => {
    if (!str) return '';
    if (str.includes(':') || str.includes('#') || str.includes('"')) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  };

  const authorsYaml = item.creators.length > 0
    ? item.creators.map(a => `  - "${a.lastName}, ${a.firstName}"`).join('\n')
    : '  - Unknown';

  const tagsYaml = item.tags.length > 0
    ? item.tags.map(t => `  - ${escapeYaml(t)}`).join('\n')
    : '  []';

  const keywordsYaml = item.keywords && item.keywords.length > 0
    ? item.keywords.map(k => `  - ${escapeYaml(k)}`).join('\n')
    : '  []';

  const collectionsYaml = item.collections.length > 0
    ? item.collections.map(c => `  - ${escapeYaml(c)}`).join('\n')
    : '  []';

  const zoteroLink = `zotero://select/items/0_${item.itemKey}`;

  return `---
title: ${escapeYaml(item.title)}
authors:
${authorsYaml}
year: ${item.date || 'Unknown'}
item-type: ${item.itemType}
publication-title: ${escapeYaml(item.publicationTitle || '')}
volume: "${item.volume || ''}"
issue: "${item.issue || ''}"
pages: "${item.pages || ''}"
doi: "${item.DOI || ''}"
isbn: "${item.ISBN || ''}"
tags:
${tagsYaml}
keywords:
${keywordsYaml}
collections:
${collectionsYaml}
zotero-key: ${item.itemKey}
zotero-link: ${zoteroLink}
pdf-path: ${escapeYaml(item.pdfPath)}
abstract: >
  ${item.abstract?.replace(/\n/g, '\n  ') || 'No abstract available.'}
created: ${new Date().toISOString().split('T')[0]}
---
`;
}
```

### Anti-Patterns to Avoid
- **Validating every keystroke in settings:** Debounce validation, only validate on save
- **Hardcoding validation rules:** Always load from config/settings; never hardcode per-field decisions
- **Modal for every validation error:** Use batch error summary first; Modal only for override confirmation
- **Storing full error objects in UI:** Convert ZodError to human-readable strings with zod-validation-error
- **Custom error messages in schema:** Let Zod provide defaults; only customize when necessary

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation | Custom type checking | Zod schema | Type safety + error formatting; Zod is industry standard |
| Error formatting | Manual error message construction | zod-validation-error | Handles nested errors, arrays, edge cases |
| Confirmation dialog | Custom modal HTML | Obsidian Modal class | Proper keyboard handling, theme integration |
| Field documentation | Custom help text system | Setting description + title | Obsidian provides native patterns |
| Link formatting | String templates | `zotero://select/items/0_{itemKey}` | Cross-platform URI; tested in community |

**Key insight:** Zod schemas encode validation rules as code, making them testable, versioned, and maintainable. Manual JSON Schema or custom validators multiply edge cases and error reporting complexity.

## Common Pitfalls

### Pitfall 1: Validation Blocks Legitimate Items
**What goes wrong:** User's valid items are rejected due to overly strict rules
**Why it happens:** Config defaults too strict; field detection misses optional fields that are present
**How to avoid:**
- Default to "warning" mode (show errors but allow import) until user explicitly enables blocking
- Test with real Zotero libraries before release
- Provide easy access to override (one click, confirmation shown)
- Log items that fail validation for debugging
**Warning signs:** User reports "can't import anything," common item types blocked

### Pitfall 2: Missing Fields Due to Schema Mismatch
**What goes wrong:** Validation says field is missing when Zotero has the data
**Why it happens:** Zotero field names don't match schema keys; optional fields treated as required
**How to avoid:**
- Map Zotero field names to schema properties before validation (e.g., `publicationTitle` -> `journal`)
- Verify field extraction query returns all expected fields
- Test validation against actual Zotero items before release
**Warning signs:** Validation fails on items that clearly have the field in Zotero

### Pitfall 3: Override Modal Appears Too Often
**What goes wrong:** User gets confirmation dialog on every import attempt
**Why it happens:** Validation triggered on every card action, not just on accept
**How to avoid:**
- Only run validation on accept action, not on defer/reject
- Cache validation results during batch generation
- Don't re-validate items that user has already seen
**Warning signs:** User frustration; multiple modals per batch

### Pitfall 4: zotero://select URIs Don't Work
**What goes wrong:** Link to "fix in Zotero" doesn't open Zotero on user's system
**Why it happens:** URI handler not registered; protocol not supported on OS; link format wrong
**How to avoid:**
- Use format: `zotero://select/items/0_{itemKey}` (not variations)
- Test on Windows, Mac, Linux before release
- Provide fallback: "Manual fix: Search for [title] in Zotero"
- Warn users on Linux with Snap that snap sandbox blocks protocol handlers
**Warning signs:** Clicking link does nothing; console shows no errors

### Pitfall 5: Validation Settings UI Is Confusing
**What goes wrong:** User doesn't understand per-type field toggles; sets wrong config
**Why it happens:** Too many options; unclear labeling; no preview of what gets blocked
**How to avoid:**
- Group settings by item type clearly with headings
- Show field descriptions (e.g., "Journal name" not just "publicationTitle")
- Add "Reset to defaults" button
- Include help text explaining blocking behavior
**Warning signs:** User reports unexpected blocks; settings look random in code

### Pitfall 6: Zotero Metadata Has Wrong Data Type
**What goes wrong:** Validation expects string, gets array or object
**Why it happens:** SQL query extracts wrong data structure; edge case in Zotero schema
**How to avoid:**
- Extract and inspect actual Zotero field values before finalizing schema
- Use `.optional()` on fields that may be null/undefined
- Type-coerce strings that might be arrays: `z.union([z.string(), z.array(z.string())]).transform(v => Array.isArray(v) ? v : [v])`
**Warning signs:** Validation errors mention "expected string, got array"

## Code Examples

### Complete Validation Service
```typescript
// Source: Zod docs + Phase 3 requirements
import { z, ZodError } from 'zod';
import { generateErrorMessage } from 'zod-validation-error';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  missingFields: string[];
}

class ValidationService {
  private schemas: Record<string, z.ZodSchema>;

  constructor(
    private config: QualityGateConfig,
    private connector: ZoteroConnector
  ) {
    this.schemas = this.buildSchemas();
  }

  private buildSchemas(): Record<string, z.ZodSchema> {
    return {
      'journalArticle': z.object({
        title: z.string().min(1),
        creators: z.array(z.any()).min(1),
        publicationTitle: z.string().min(1),
        date: z.string().min(1),
        DOI: this.config.rules['journalArticle'].requiredFields.includes('DOI')
          ? z.string().min(1)
          : z.string().optional()
      }),
      'book': z.object({
        title: z.string().min(1),
        creators: z.array(z.any()).min(1),
        date: z.string().min(1),
        publisher: z.string().min(1),
        ISBN: this.config.rules['book'].requiredFields.includes('ISBN')
          ? z.string().min(1)
          : z.string().optional()
      })
    };
  }

  validate(item: ZoteroItem): ValidationResult {
    if (!this.config.enabled) {
      return { valid: true, errors: [], missingFields: [] };
    }

    const itemTypeKey = item.itemType.toLowerCase().replace(/\s+/g, '');
    const schema = this.schemas[itemTypeKey];

    if (!schema) {
      return { valid: true, errors: [], missingFields: [] };
    }

    const result = schema.safeParse(item);

    if (result.success) {
      return { valid: true, errors: [], missingFields: [] };
    }

    const errorMessage = generateErrorMessage(result.error);
    const errors = errorMessage.split('\n').filter(e => e.trim());

    const missingFields = result.error.issues
      .filter(issue => issue.code === 'too_small')
      .map(issue => issue.path.join('.'))
      .filter((field): field is string => field.length > 0);

    return {
      valid: false,
      errors,
      missingFields: [...new Set(missingFields)]
    };
  }
}
```

### Settings Tab Extension
```typescript
// Source: Phase 1 settings pattern + quality gate config
containerEl.createEl('h2', { text: 'Quality Gates' });

new Setting(containerEl)
  .setName('Block incomplete items')
  .setDesc('Prevent import if required fields are missing (can be overridden)')
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.qualityGate.enabled)
    .onChange(async (value) => {
      this.plugin.settings.qualityGate.enabled = value;
      await this.plugin.saveSettings();
    }));

containerEl.createEl('h3', { text: 'Required Fields by Type' });

Object.entries(this.plugin.settings.qualityGate.rules).forEach(([key, rule]) => {
  const section = containerEl.createDiv({ cls: 'quality-gate-section' });
  section.createEl('h4', { text: rule.itemType });

  // Common fields for this type
  const commonFields = ['title', 'creators', 'date'];
  const typeSpecificFields = key === 'journalArticle'
    ? ['publicationTitle', 'DOI', 'volume', 'issue', 'pages']
    : key === 'book'
    ? ['publisher', 'ISBN']
    : [];

  [...commonFields, ...typeSpecificFields].forEach(field => {
    const isRequired = rule.requiredFields.includes(field);

    new Setting(section)
      .setName(field.replace(/([A-Z])/g, ' $1').trim())
      .addToggle(toggle => toggle
        .setValue(isRequired)
        .onChange(async (value) => {
          if (value) {
            if (!rule.requiredFields.includes(field)) {
              rule.requiredFields.push(field);
            }
          } else {
            rule.requiredFields = rule.requiredFields.filter(f => f !== field);
          }
          await this.plugin.saveSettings();
        }));
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom validation logic | Zod schemas | 2023+ | Type-safe, reusable, error formatting built-in |
| Manual error messages | zod-validation-error | 2024+ | Converts errors to human-readable text |
| FuzzySuggestModal for decisions | Modal for confirmation | N/A | Better UX for blocking decisions |
| Custom error display UI | Inline + summary pattern | 2024+ | Supported by research; better UX |
| Hard-coded validation rules | Settings-based config | N/A | Users control strictness |

**Deprecated/outdated:**
- Custom regex validation in settings: Zod handles this more reliably
- Validation via try-catch on note creation: Validate before user action, not after

## Open Questions

1. **Which Zotero item types to support initially**
   - What we know: CONTEXT.md specifies journal articles and books
   - What's unclear: Should Phase 3 include conference papers, theses, reports, etc.?
   - Recommendation: Start with journal article + book; provide config structure to add more later

2. **Tag filtering rules**
   - What we know: CONTEXT.md mentions "tag inclusion/exclusion patterns" as Claude's discretion
   - What's unclear: Regex patterns vs. exact match vs. startswith?
   - Recommendation: Simple startswith first; regex in future if needed

3. **Zotero field availability edge cases**
   - What we know: Most bibliographic fields exist in Zotero schema
   - What's unclear: How do optional fields behave in sql.js queries? Null vs. empty string vs. missing?
   - Recommendation: Test with real Zotero database; normalize empty string to null in validation

## Sources

### Primary (HIGH confidence)
- [Zod GitHub](https://github.com/colinhacks/zod) - Official schema validation library; TypeScript-first design
- [Zod Documentation](https://zod.dev/) - API reference and patterns
- [zod-validation-error NPM](https://www.npmjs.com/package/zod-validation-error) - Error formatting library
- [Obsidian Modal API](https://docs.obsidian.md/Plugins/User+interface/Modals) - Official Modal class documentation
- [Zotero Item Types and Fields](https://www.zotero.org/support/kb/item_types_and_fields) - Official field documentation
- Phase 2 RESEARCH.md - Established Obsidian UI patterns

### Secondary (MEDIUM confidence)
- [zotero-link plugin GitHub](https://github.com/vanakat/zotero-link) - zotero:// URI format verification
- [Zotero Forums - Adding Items](https://forums.zotero.org/discussion/1265/specifications-for-zoteros-data-fields) - Community knowledge on field requirements
- [MDN Form Validation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation) - Web standards for validation UX
- [Inline Validation UX Patterns](https://smart-interface-design-patterns.com/articles/inline-validation-ux/) - Industry UX research
- [Smashing Magazine - Error Messages UX](https://www.smashingmagazine.com/2022/08/error-messages-ux-design/) - Error display best practices

### Tertiary (LOW confidence)
- Stack Overflow discussions on Zod (community usage patterns, not official)

## Metadata

**Confidence breakdown:**
- Standard stack (Zod): HIGH - Industry standard, official docs, active development
- Validation patterns: HIGH - Established UX research + Obsidian API
- Zotero fields: HIGH - Official documentation
- Modal patterns: HIGH - Obsidian API + successful plugins
- Configuration structure: MEDIUM - Inferred from CONTEXT.md decisions; needs validation in implementation
- Deep-linking: MEDIUM - Verified via zotero-link plugin; cross-platform reliability needs testing

**Research date:** 2026-01-23
**Valid until:** 30 days (Zod/Obsidian API stable; Zotero schema changes infrequently)
