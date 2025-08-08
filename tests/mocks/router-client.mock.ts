jest.mock('../../src/irona-router-client/IronaRouterClient');

import { IronaRouterClient } from '../../src/irona-router-client/IronaRouterClient';

export const createMockRouterClient = (): jest.Mocked<IronaRouterClient> => {
  return {
    modelSelect: jest.fn(),
  } as any;
};

export const setupRouterSuccess = (mockRouter: jest.Mocked<IronaRouterClient>, provider = 'openai', model = 'gpt-4o-mini') => {
  mockRouter.modelSelect.mockResolvedValue({
    providers: [{ provider, model }],
  });
};

export const setupRouterError = (mockRouter: jest.Mocked<IronaRouterClient>) => {
  mockRouter.modelSelect.mockResolvedValue({
    error: 'Router error',
  });
};

export const setupRouterNetworkError = (mockRouter: jest.Mocked<IronaRouterClient>) => {
  mockRouter.modelSelect.mockRejectedValue(new Error('Network error'));
};