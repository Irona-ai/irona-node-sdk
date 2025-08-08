// Global test setup
beforeEach(() => {
  // Reset modules between tests to ensure clean state
  jest.resetModules();
});

afterEach(() => {
  // Clear all mocks after each test
  jest.clearAllMocks();
  
  // Restore console methods if they were mocked
  if ((console.log as any).mockRestore) {
    (console.log as any).mockRestore();
  }
  if ((console.warn as any).mockRestore) {
    (console.warn as any).mockRestore();
  }
  if ((console.error as any).mockRestore) {
    (console.error as any).mockRestore();
  }
});