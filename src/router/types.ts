import type { ModelSelectResponse } from '../responseTypes';
import type { ModelSelectPayload } from '../schemas/modelSelect.schema';

/**
 * Router interface — all routing backends implement this single method.
 */
export interface Router {
  modelSelect(body: ModelSelectPayload): Promise<ModelSelectResponse>;
}

// ── Router Config ────────────────────────────────────────────────────────────

export type APIRouterConfig = {
  type: 'api';
  baseUrl: string;
  apiKey: string;
  endpoint?: string;
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
};

export type LocalRouterConfig = {
  type: 'local';
  scoringConfig?: Partial<ScoringConfig>;
};

export type RouterConfig = APIRouterConfig | LocalRouterConfig;

// ── Local Router Types (ported from ClawRouter) ──────────────────────────────

export type Tier = 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'REASONING';

export type DimensionScore = {
  name: string;
  score: number;
  signal: string | null;
};

export type ScoringResult = {
  score: number;
  tier: Tier | null; // null = ambiguous
  confidence: number;
  signals: string[];
  agenticScore?: number;
};

export type ScoringConfig = {
  tokenCountThresholds: { simple: number; complex: number };
  codeKeywords: string[];
  reasoningKeywords: string[];
  simpleKeywords: string[];
  technicalKeywords: string[];
  creativeKeywords: string[];
  imperativeVerbs: string[];
  constraintIndicators: string[];
  outputFormatKeywords: string[];
  referenceKeywords: string[];
  negationKeywords: string[];
  domainSpecificKeywords: string[];
  agenticTaskKeywords: string[];
  dimensionWeights: Record<string, number>;
  tierBoundaries: {
    simpleMedium: number;
    mediumComplex: number;
    complexReasoning: number;
  };
  confidenceSteepness: number;
  confidenceThreshold: number;
};
