/**
 * Router Factory — creates the appropriate router based on config.
 *
 * Two router types:
 *   api   — HTTP-based routing (any compatible endpoint)
 *   local — zero-latency, zero-cost classification (ClawRouter port)
 *
 * When no router config is provided, defaults to Irona's API router.
 *
 * Resolution order:
 * 1. config.router (explicit config)
 * 2. ROUTER_TYPE env var
 * 3. Default: Irona API router
 */

import { IronaRouterClient } from '../irona-router-client/IronaRouterClient';
import type { Config } from '../types';
import { logger } from '../utils/logger';

import { APIRouter } from './api-router';
import { LocalRouter } from './local';
import type { Router, RouterConfig } from './types';

export function resolveRouterConfig(
  configuredRouter?: RouterConfig
): RouterConfig | null {
  if (configuredRouter) return configuredRouter;

  const routerType = process.env.ROUTER_TYPE?.toLowerCase();

  if (routerType === 'api') {
    const baseUrl = process.env.ROUTER_BASE_URL;
    const apiKey = process.env.ROUTER_API_KEY;
    const endpoint = process.env.ROUTER_ENDPOINT;

    if (baseUrl == null || baseUrl === '' || apiKey == null || apiKey === '') {
      throw new Error(
        'ROUTER_TYPE=api requires ROUTER_BASE_URL and ROUTER_API_KEY environment variables.'
      );
    }

    return {
      type: 'api',
      baseUrl,
      apiKey,
      endpoint: endpoint ?? '',
    };
  }

  if (routerType === 'local') {
    return { type: 'local' };
  }

  // Default: Irona API router (null signals "use built-in default")
  return null;
}

export function createRouter(config: Config): Router {
  const routerConfig = resolveRouterConfig(config.router);

  if (routerConfig == null) {
    logger.info('[RouterFactory] Using default Irona API router');
    return new IronaRouterClient(config);
  }

  switch (routerConfig.type) {
    case 'api':
      logger.info(
        `[RouterFactory] Using API router: ${routerConfig.baseUrl}${routerConfig.endpoint ?? ''}`
      );
      return new APIRouter(routerConfig);

    case 'local':
      logger.info(
        '[RouterFactory] Using local router (zero-latency classification)'
      );
      return new LocalRouter(routerConfig.scoringConfig);

    default:
      logger.info('[RouterFactory] Falling back to default Irona API router');
      return new IronaRouterClient(config);
  }
}
