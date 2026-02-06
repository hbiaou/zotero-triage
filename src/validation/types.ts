
export interface ValidationError {
  type: 'schema' | 'metadata' | 'hallucination' | 'structure';
  severity: 'error' | 'warning';
  field?: string;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
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
