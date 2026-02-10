/**
 * Router Factory — creates the appropriate router based on config.
 *
 * Resolution order:
 * 1. config.router (explicit config)
 * 2. ROUTER_TYPE env var
 * 3. Default: IronaRouterClient
 */

import { IronaRouterClient } from '../irona-router-client/IronaRouterClient';
import type { Config } from '../types';
import { logger } from '../utils/logger';
import { APIRouter } from './api-router';
import { LocalRouter } from './local';
import type { Router, RouterConfig } from './types';

export function resolveRouterConfig(configuredRouter?: RouterConfig): RouterConfig {
  if (configuredRouter) return configuredRouter;

  const routerType = process.env.ROUTER_TYPE?.toLowerCase();

  if (routerType === 'api') {
    const baseUrl = process.env.ROUTER_BASE_URL;
    const apiKey = process.env.ROUTER_API_KEY;
    const endpoint = process.env.ROUTER_ENDPOINT;

    if (!baseUrl || !apiKey) {
      throw new Error(
        'ROUTER_TYPE=api requires ROUTER_BASE_URL and ROUTER_API_KEY environment variables.',
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

  // Default: Irona router
  return { type: 'irona' };
}

export function createRouter(config: Config): Router {
  const routerConfig = resolveRouterConfig(config.router);

  switch (routerConfig.type) {
    case 'irona':
      logger.info('[RouterFactory] Using Irona router');
      return new IronaRouterClient(config);

    case 'api':
      logger.info(`[RouterFactory] Using API router: ${routerConfig.baseUrl}${routerConfig.endpoint ?? ''}`);
      return new APIRouter(routerConfig);

    case 'local':
      logger.info('[RouterFactory] Using local router (zero-latency classification)');
      return new LocalRouter(routerConfig.scoringConfig);

    default:
      logger.info('[RouterFactory] Falling back to Irona router');
      return new IronaRouterClient(config);
  }
}
