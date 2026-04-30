jest.mock('../../src/ironlabs-router-client/IronlabsRouterClient');

import type { IronlabsRouterClient } from '../../src/ironlabs-router-client/IronlabsRouterClient';

export const createMockRouterClient = (): jest.Mocked<IronlabsRouterClient> => {
  return {
    modelSelect: jest.fn(),
  } as any;
};

export const setupRouterSuccess = (
  mockRouter: jest.Mocked<IronlabsRouterClient>,
  provider = 'openai',
  model = 'gpt-4o-mini'
) => {
  mockRouter.modelSelect.mockResolvedValue({
    providers: [{ provider, model }],
    fallbackProviders: [],
    error: null,
    success: true,
    message: 'OK',
    statusCode: 200,
  });
};

export const setupRouterError = (
  mockRouter: jest.Mocked<IronlabsRouterClient>
) => {
  mockRouter.modelSelect.mockResolvedValue({
    providers: [],
    fallbackProviders: [],
    error: 'Router error',
    success: false,
    message: 'Router error',
    statusCode: 500,
  });
};

export const setupRouterNetworkError = (
  mockRouter: jest.Mocked<IronlabsRouterClient>
) => {
  mockRouter.modelSelect.mockRejectedValue(new Error('Network error'));
};
