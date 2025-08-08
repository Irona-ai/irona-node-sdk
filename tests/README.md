# Test Suite Documentation

## Structure

```
tests/
├── unit/                # Unit tests organized by feature
│   └── completions/     # Tests for completions functionality
│       ├── single-model.test.ts   # Single model scenarios
│       ├── multi-model.test.ts    # Multiple model routing
│       ├── edge-cases.test.ts     # Error handling & validation
│       └── web-search.test.ts     # Web search integration
├── mocks/              # Centralized mock definitions
│   ├── ai-sdk.mock.ts           # AI SDK mocks (generateText, streamText)
│   ├── supported-models.mock.ts # Model support validation mocks
│   ├── provider-utils.mock.ts   # Provider utility mocks
│   └── router-client.mock.ts    # Router client mocks
├── utils/              # Test utilities and helpers
│   └── test-helpers.ts          # Shared test utilities
└── setup.ts            # Global test setup

```

## Running Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
```

## Writing New Tests

### 1. Import mocks first
Always import mock files before importing the code being tested:

```typescript
// Import mocks before anything else
import '../../mocks/ai-sdk.mock';
import '../../mocks/supported-models.mock';
import '../../mocks/provider-utils.mock';

// Then import your code
import { IronaChatClient } from '../../../src/irona-chat-client/IronaChatClient';
```

### 2. Use test helpers
Use the provided test helpers for common operations:

```typescript
import { 
  createTestPayload,      // Create single-model payload
  createMultiModelPayload,// Create multi-model payload
  setupTestEnv,          // Setup environment variables
  mockConsole            // Mock console methods
} from '../../utils/test-helpers';
```

### 3. Reset mocks in beforeEach
Always reset mocks to ensure test isolation:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  resetSupportedModelsMocks();
  resetProviderUtilsMocks();
  setupTestEnv();
  mockConsole();
});
```

### 4. Use descriptive test names
Group related tests using `describe` blocks and use clear test names:

```typescript
describe('Feature Name', () => {
  describe('Specific Scenario', () => {
    it('should do something specific', async () => {
      // test code
    });
  });
});
```

## Mock Utilities

### AI SDK Mocks
- `setupSuccessfulGeneration(text)`: Mock successful text generation
- `setupSuccessfulStream()`: Mock successful streaming
- `setupStreamError()`: Mock streaming error

### Router Client Mocks
- `createMockRouterClient()`: Create a mock router client
- `setupRouterSuccess(mockRouter, provider, model)`: Mock successful routing
- `setupRouterError(mockRouter)`: Mock router error
- `setupRouterNetworkError(mockRouter)`: Mock network error

### Model Support Mocks
- `mockDoesModelSupportMediaTypes`: Control media type support
- `mockDoesModelSupportWebSearch`: Control web search support
- `resetSupportedModelsMocks()`: Reset to defaults

## Adding New Test Files

1. Create a new file in the appropriate directory (e.g., `tests/unit/feature-name/`)
2. Follow the import order convention (mocks first)
3. Use the test helpers and mock utilities
4. Add descriptive comments for complex test scenarios
5. Ensure all async operations are properly awaited

## Best Practices

1. **Keep tests focused**: Each test should verify one specific behavior
2. **Use meaningful assertions**: Be specific about what you're testing
3. **Mock external dependencies**: Never make real API calls in tests
4. **Test edge cases**: Include error scenarios and boundary conditions
5. **Maintain test independence**: Tests should not depend on each other