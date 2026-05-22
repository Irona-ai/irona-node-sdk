global.fetch = jest.fn();

export const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
