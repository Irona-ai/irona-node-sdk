jest.mock('../../src/supported_models', () => ({
  doesModelSupportMediaTypes: jest.fn().mockReturnValue(true),
  doesModelSupportWebSearch: jest.fn().mockReturnValue(false),
  getModelPrefix: jest.fn().mockReturnValue(null),
  providerApiKeyName: jest.fn().mockImplementation((provider: string) => {
    const mapping: { [key: string]: string } = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
      togetherai: 'TOGETHERAI_API_KEY',
    };
    return mapping[provider] || `${provider.toUpperCase()}_API_KEY`;
  }),
}));

export const mockDoesModelSupportMediaTypes = require('../../src/supported_models').doesModelSupportMediaTypes as jest.Mock;
export const mockDoesModelSupportWebSearch = require('../../src/supported_models').doesModelSupportWebSearch as jest.Mock;
export const mockProviderApiKeyName = require('../../src/supported_models').providerApiKeyName as jest.Mock;

export const resetSupportedModelsMocks = () => {
  mockDoesModelSupportMediaTypes.mockReset().mockReturnValue(true);
  mockDoesModelSupportWebSearch.mockReset().mockReturnValue(false);
  mockProviderApiKeyName.mockReset().mockImplementation((provider: string) => {
    const mapping: { [key: string]: string } = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
    };
    return mapping[provider] || `${provider.toUpperCase()}_API_KEY`;
  });
};