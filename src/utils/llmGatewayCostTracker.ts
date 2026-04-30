import { logger } from './logger';

export interface LLMGatewayModelPricing {
  modelId: string;
  modelName: string;
  providerId: string;
  inputPrice: string;
  outputPrice: string;
  cachedInputPrice: string | null;
  imageInputPrice: string | null;
  requestPrice: string;
  webSearchPrice: string | null;
  discount: string | null;
}

export interface CostBreakdown {
  hasDiscount: boolean;
  totalCost: number;
}

// ── Internal Types ────────────────────────────────────────────────────────────

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

interface RawProviderMapping {
  modelId?: string;
  providerId?: string;
  modelName?: string;
  inputPrice?: string | null;
  outputPrice?: string | null;
  cachedInputPrice?: string | null;
  imageInputPrice?: string | null;
  requestPrice?: string | null;
  webSearchPrice?: string | null;
  discount?: string | null;
  status?: string;
  routingTotalRequests?: number | null;
}

interface RawModel {
  id?: string;
  modelProviderMappings?: RawProviderMapping[];
  mappings?: RawProviderMapping[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERNAL_MODELS_URL = 'https://internal.llmgateway.io/internal/models';
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Cost Tracker ──────────────────────────────────────────────────────────────

export class LLMGatewayCostTracker {
  private readonly index = new Map<string, LLMGatewayModelPricing>();
  private cacheExpiresAt = 0;

  constructor(private readonly apiKey: string) {}

  calculateCost(
    pricing: LLMGatewayModelPricing,
    usage: TokenUsage
  ): CostBreakdown {
    const discount = toFloat(pricing.discount);
    const actualCost =
      usage.promptTokens * toFloat(pricing.inputPrice) +
      usage.completionTokens * toFloat(pricing.outputPrice);
    const hasDiscount = discount > 0;
    return {
      hasDiscount,
      totalCost: hasDiscount ? actualCost * (1 - discount) : actualCost,
    };
  }

  async calculateCostForModel(
    gatewayModelName: string,
    usage: TokenUsage,
    provider?: string,
    rawModel?: string
  ): Promise<CostBreakdown | null> {
    await this.ensureLoaded();

    for (const key of lookupCandidates(gatewayModelName, provider, rawModel)) {
      const pricing = this.index.get(key);
      if (pricing !== undefined) {
        return this.calculateCost(pricing, usage);
      }
    }

    logger.warn(
      `[LLMGatewayCostTracker] No pricing found for model: ${gatewayModelName}`
    );
    return null;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async ensureLoaded(): Promise<void> {
    if (Date.now() < this.cacheExpiresAt) return;
    try {
      const rawModels = await this.fetchRawModels();
      this.index.clear();
      let count = 0;
      for (const raw of rawModels) {
        const mappings = dedup(raw.modelProviderMappings ?? raw.mappings ?? []);
        const entries = buildEntries(raw.id ?? '', mappings);
        if (entries.length > 0) {
          populateIndex(this.index, entries, mappings);
          count++;
        }
      }
      this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      logger.info(`[LLMGatewayCostTracker] Loaded pricing for ${count} models`);
    } catch (err) {
      logger.warn(
        `[LLMGatewayCostTracker] Failed to load model pricing: ${err}`
      );
    }
  }

  private async fetchRawModels(): Promise<RawModel[]> {
    const res = await fetch(INTERNAL_MODELS_URL, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(
        `LLM Gateway models API: HTTP ${res.status} ${res.statusText}`
      );
    }
    const data = (await res.json()) as
      | RawModel[]
      | { data: RawModel[] }
      | { models: RawModel[] };
    if (Array.isArray(data)) return data;
    if ('data' in data) return data.data ?? [];
    if ('models' in data) return data.models ?? [];
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toFloat(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/** Removes duplicate provider mappings (same providerId + modelName). */
function dedup(mappings: RawProviderMapping[]): RawProviderMapping[] {
  const seen = new Set<string>();
  return mappings.filter(m => {
    const key = `${m.providerId ?? ''}/${m.modelName ?? ''}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

/** Converts active provider mappings into normalised pricing entries. */
function buildEntries(
  modelId: string,
  mappings: RawProviderMapping[]
): LLMGatewayModelPricing[] {
  if (modelId === '') return [];
  return mappings
    .filter(m => m.status === undefined || m.status === 'active')
    .map(m => ({
      modelId,
      modelName: m.modelName ?? modelId,
      providerId: m.providerId ?? '',
      inputPrice: m.inputPrice ?? '0',
      outputPrice: m.outputPrice ?? '0',
      cachedInputPrice: m.cachedInputPrice ?? null,
      imageInputPrice: m.imageInputPrice ?? null,
      requestPrice: m.requestPrice ?? '0',
      webSearchPrice: m.webSearchPrice ?? null,
      discount: m.discount ?? null,
    }));
}

/**
 * Picks the best entry for the bare model key:
 * - Prefer providers with routing traffic (routingTotalRequests > 0)
 * - Among those, pick the highest discount
 * - Fall back to highest discount overall when no traffic data exists
 */
function bestEntry(
  entries: LLMGatewayModelPricing[],
  mappings: RawProviderMapping[]
): LLMGatewayModelPricing {
  const traffic = new Map(
    mappings.map(m => [m.providerId ?? '', m.routingTotalRequests ?? 0])
  );
  const routed = entries.filter(e => (traffic.get(e.providerId) ?? 0) > 0);
  const pool = routed.length > 0 ? routed : entries;
  return pool.reduce((best, cur) =>
    toFloat(cur.discount) > toFloat(best.discount) ? cur : best
  );
}

function populateIndex(
  index: Map<string, LLMGatewayModelPricing>,
  entries: LLMGatewayModelPricing[],
  mappings: RawProviderMapping[]
): void {
  // Bare model id → best entry (accounts for which provider LLM Gateway actually routes to)
  const best = bestEntry(entries, mappings);
  if (!index.has(best.modelId)) index.set(best.modelId, best);

  // Provider-specific key → exact entry for that provider
  for (const entry of entries) {
    if (entry.providerId !== '') {
      const key = `${entry.providerId}/${entry.modelId}`;
      if (!index.has(key)) index.set(key, entry);
    }
  }
}

/**
 * Ordered list of keys to try when looking up a model.
 * Most specific (provider/model) first, bare name last.
 */
function lookupCandidates(
  gatewayModelName: string,
  provider?: string,
  rawModel?: string
): string[] {
  const seen = new Set<string>();
  const add = (key?: string): string[] =>
    key !== undefined && key !== '' && !seen.has(key)
      ? (seen.add(key), [key])
      : [];

  const candidates: string[] = [
    ...(provider !== undefined ? add(`${provider}/${gatewayModelName}`) : []),
    ...(provider !== undefined && rawModel !== undefined
      ? add(`${provider}/${rawModel}`)
      : []),
    ...add(gatewayModelName),
    ...add(rawModel),
  ];

  const slash = gatewayModelName.indexOf('/');
  if (slash !== -1) candidates.push(...add(gatewayModelName.slice(slash + 1)));

  return candidates;
}
