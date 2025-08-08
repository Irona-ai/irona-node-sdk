jest.mock('../../src/utils/providerAndModelUtils', () => ({
  extractMediaTypeArrayFromMessages: jest.fn().mockReturnValue([]),
  getSupportedProviderAndModelArray: jest.fn().mockImplementation((models: string[]) =>
    models.map(model => {
      const [provider, ...modelParts] = model.split('/');
      return { provider, model: modelParts.join('/') };
    })
  ),
  validateAndGetProviderAndModel: jest.fn().mockImplementation((model: string) => {
    const [provider, ...modelParts] = model.split('/');
    return { provider, model: modelParts.join('/') };
  }),
}));

export const mockExtractMediaTypeArrayFromMessages = require('../../src/utils/providerAndModelUtils').extractMediaTypeArrayFromMessages as jest.Mock;
export const mockGetSupportedProviderAndModelArray = require('../../src/utils/providerAndModelUtils').getSupportedProviderAndModelArray as jest.Mock;
export const mockValidateAndGetProviderAndModel = require('../../src/utils/providerAndModelUtils').validateAndGetProviderAndModel as jest.Mock;

export const resetProviderUtilsMocks = () => {
  mockExtractMediaTypeArrayFromMessages.mockReset().mockReturnValue([]);
  mockGetSupportedProviderAndModelArray.mockReset().mockImplementation((models: string[]) =>
    models.map(model => {
      const [provider, ...modelParts] = model.split('/');
      return { provider, model: modelParts.join('/') };
    })
  );
  mockValidateAndGetProviderAndModel.mockReset().mockImplementation((model: string) => {
    const [provider, ...modelParts] = model.split('/');
    return { provider, model: modelParts.join('/') };
  });
};