
export interface ValidationError {
  type: 'schema' | 'metadata' | 'hallucination' | 'structure';
  severity: 'error' | 'warning';
  field?: string;
  message: string;
  details?: Record<string, any>;
}

export interface Hallucination {
  claim: string;
  reason: string;
  severity: 'warning' | 'error';
  evidenceQuote?: string;
}

export interface Correction {
  type: 'typo' | 'name_variant' | 'title_variant' | 'doi' | 'url' | 'journal' | 'date' | 'other';
  original: string;
  suggested: string;
  confidence: number;
  sourceOfTruth: {
    kind: 'zotero_metadata' | 'pdf_evidence';
    field: string;
    value: string;
  };
  locationHint?: string;
}

export interface HallucinationRepair {
  claim: string;
  action: 'rewritten' | 'removed' | 'marked_unsupported';
  replacement: string;
  support?: {
    kind: 'zotero_metadata' | 'pdf_evidence';
    quoteOrValue: string;
  };
}

export interface SkippedItem {
  item: string;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  hallucinations?: Hallucination[];
  corrections?: Correction[];
  updatedBody?: string;
  autoAppliedCorrections?: Correction[];
  hallucinationRepairs?: HallucinationRepair[];
  skipped?: SkippedItem[];
}

export interface QualityGateConfig {
  enabled: boolean;
  rules: Record<string, {
    itemType: string;
    requiredFields: string[];
  }>;
}

export const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = {
  enabled: true,
  rules: {
    journalArticle: {
      itemType: 'Journal Article',
      requiredFields: ['title', 'creators', 'publicationTitle', 'date', 'DOI']
    },
    book: {
      itemType: 'Book',
      requiredFields: ['title', 'creators', 'date', 'publisher']
    }
  }
};
