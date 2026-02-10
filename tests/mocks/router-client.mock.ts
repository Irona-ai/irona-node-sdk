jest.mock('../../src/irona-router-client/IronaRouterClient');

import type { IronaRouterClient } from '../../src/irona-router-client/IronaRouterClient';

export const createMockRouterClient = (): jest.Mocked<IronaRouterClient> => {
  return {
    modelSelect: jest.fn(),
  } as any;
};

export const setupRouterSuccess = (
  mockRouter: jest.Mocked<IronaRouterClient>,
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
  mockRouter: jest.Mocked<IronaRouterClient>
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
  mockRouter: jest.Mocked<IronaRouterClient>
) => {
  mockRouter.modelSelect.mockRejectedValue(new Error('Network error'));
};
