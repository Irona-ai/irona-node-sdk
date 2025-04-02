import { describe, it, beforeEach, expect, vi, afterEach } from 'vitest';
import { IronaAISDK, IronaFunctionCalling, IronaStructuredOutput, IronaStreaming } from '../../src/ai-sdk-integration';
import { WeatherSchema, RecipeSchema, PersonSchema } from '../../src/ai-sdk-integration/schemas';
import { IronaAI } from '../../src/index';
import { z } from 'zod';

// Mock the IronaAI class
vi.mock('../../src/index', () => {
  const mockCompletionsCreate = vi.fn();
  
  return {
    IronaAI: {
      create: vi.fn().mockImplementation(() => ({
        completions: {
          create: mockCompletionsCreate
        }
      }))
    }
  };
});

describe('IronaAISDK Integration', () => {
  let sdk: IronaAISDK;
  
  beforeEach(() => {
    vi.clearAllMocks();
    sdk = new IronaAISDK({ apiKey: 'sk_test_key' });
  });

  it('should create an instance with all components', () => {
    expect(sdk.structured).toBeInstanceOf(IronaStructuredOutput);
    expect(sdk.functions).toBeInstanceOf(IronaFunctionCalling);
    expect(sdk.streaming).toBeInstanceOf(IronaStreaming);
  });

  it('should create an instance asynchronously', async () => {
    const instance = await IronaAISDK.create({ apiKey: 'sk_test_key' });
    expect(instance).toBeInstanceOf(IronaAISDK);
    expect(instance.structured).toBeInstanceOf(IronaStructuredOutput);
  });
});

describe('IronaStructuredOutput Integration', () => {
  let structured: IronaStructuredOutput;
  const mockCreate = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    (IronaAI.create as any).mockImplementation(() => ({
      completions: {
        create: mockCreate
      }
    }));
    structured = new IronaStructuredOutput({ apiKey: 'sk_test_key' });
  });

  it('should generate structured output based on schema', async () => {
    // Mock successful completion response
    mockCreate.mockResolvedValueOnce({
      response: {
        content: JSON.stringify({
          temperature: 23,
          condition: "sunny",
          humidity: 65,
          windSpeed: 10
        })
      }
    });

    const result = await structured.generate(
      'What is the weather like in Paris?',
      WeatherSchema
    );

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ 
          role: 'user',
          content: 'What is the weather like in Paris?' 
        })
      ])
    }));

    expect(result).toEqual({
      temperature: 23,
      condition: "sunny",
      humidity: 65,
      windSpeed: 10
    });
  });

  it('should handle JSON wrapped in code blocks', async () => {
    mockCreate.mockResolvedValueOnce({
      response: {
        content: '```json\n{"temperature":25,"condition":"cloudy","humidity":70,"windSpeed":15}\n```'
      }
    });

    const result = await structured.generate(
      'What is the weather like in London?',
      WeatherSchema
    );

    expect(result).toEqual({
      temperature: 25,
      condition: "cloudy",
      humidity: 70,
      windSpeed: 15
    });
  });

  it('should return error response when API call fails', async () => {
    mockCreate.mockResolvedValueOnce({
      error: 'API Error',
      error_trace: [{ provider: null, model: null, error: 'API Error' }]
    });

    const result = await structured.generate(
      'What is the weather like in Berlin?',
      WeatherSchema
    );

    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('error_trace');
  });

  it('should handle validation errors', async () => {
    mockCreate.mockResolvedValueOnce({
      response: {
        content: JSON.stringify({
          temperature: 23,
          condition: "extremely hot", // Invalid enum value
          humidity: 65,
          windSpeed: 10
        })
      }
    });

    const result = await structured.generate(
      'What is the weather like in Tokyo?',
      WeatherSchema
    );

    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('Structured output generation failed');
  });



it('should batch generate multiple schema outputs', async () => {
    // First mock response - Weather
    mockCreate.mockResolvedValueOnce({
      response: {
        content: JSON.stringify({
          temperature: 23,
          condition: "sunny",
          humidity: 65,
          windSpeed: 10
        })
      }
    });
    
    // Second mock response - Weather (not Recipe)
    mockCreate.mockResolvedValueOnce({
      response: {
        content: JSON.stringify({
          temperature: 18,
          condition: "cloudy",
          humidity: 70,
          windSpeed: 15
        })
      }
    });
  
    const results = await structured.batchGenerate([
      { prompt: 'Weather in Paris?', schema: WeatherSchema },
      { prompt: 'Weather in London?', schema: WeatherSchema }
    ]);
  
    expect(results.length).toBe(2);
    // Check first weather result
    expect(results[0]).toMatchObject({
      temperature: 23,
      condition: "sunny",
      humidity: 65,
      windSpeed: 10
    });
    // Check second weather result
    expect(results[1]).toMatchObject({
      temperature: 18,
      condition: "cloudy",
      humidity: 70,
      windSpeed: 15
    });
  
    // Verify API calls
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ 
          content: 'Weather in Paris?' 
        })
      ])
    }));
    expect(mockCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ 
          content: 'Weather in London?' 
        })
      ])
    }));
  });
});

describe('IronaFunctionCalling Integration', () => {
  let functions: IronaFunctionCalling;
  const mockCreate = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    (IronaAI.create as any).mockImplementation(() => ({
      completions: {
        create: mockCreate
      }
    }));
    functions = new IronaFunctionCalling({ apiKey: 'sk_test_key' });
  });

  it('should execute a tool with valid arguments', async () => {
    const result = await functions.execute('getWeather', {
      location: 'Paris',
      unit: 'celsius'
    });

    expect(result).toMatchObject({
      temperature: expect.any(Number),
      condition: expect.any(String),
      humidity: expect.any(Number),
      windSpeed: expect.any(Number),
      location: 'Paris',
      unit: 'celsius'
    });
  });

  it('should return error response for unknown tool', async () => {
    const result = await functions.execute('unknownTool' as any, {});
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('Unknown tool');
  });

  it('should validate tool arguments against schema', async () => {
    const result = await functions.execute('getWeather', {
      // @ts-ignore - Testing runtime validation
      location: 123,
      unit: 'celsius'
    });

    expect(result).toHaveProperty('error');
  });

  it('should register custom tool implementation', async () => {
    const customImpl = vi.fn().mockResolvedValue({
      temperature: 100,
      condition: "sunny",
      humidity: 50,
      windSpeed: 5,
      location: "Custom",
      unit: "fahrenheit"
    });
    
    functions.registerTool('getWeather', customImpl);
    
    const result = await functions.execute('getWeather', {
      location: 'Custom',
      unit: 'fahrenheit'
    });
    
    expect(customImpl).toHaveBeenCalled();
    expect(result).toMatchObject({
      temperature: 100,
      location: "Custom",
      unit: "fahrenheit"
    });
  });

  it('should run with AI to select and execute appropriate tool', async () => {
    mockCreate.mockResolvedValueOnce({
      response: {
        content: JSON.stringify({
          toolName: "getWeather",
          parameters: {
            location: "Berlin", 
            unit: "celsius"
          }
        })
      }
    });

    const result = await functions.runWithAI('What is the weather in Berlin?');

    expect(mockCreate).toHaveBeenCalled();
    expect(result).toHaveProperty('toolName', 'getWeather');
    expect(result).toHaveProperty('result');
    expect((result as any).result).toHaveProperty('location', 'Berlin');
  });

  it('should handle AI JSON response wrapped in code blocks', async () => {
    mockCreate.mockResolvedValueOnce({
      response: {
        content: '```json\n{"toolName":"calculateDistance","parameters":{"startLocation":"New York","endLocation":"Boston"}}\n```'
      }
    });

    const result = await functions.runWithAI('How far is New York from Boston?');

    expect(result).toHaveProperty('toolName', 'calculateDistance');
    expect((result as any).result).toHaveProperty('startLocation', 'New York');
    expect((result as any).result).toHaveProperty('endLocation', 'Boston');
  });
});

describe('IronaStreaming Integration', () => {
  let streaming: IronaStreaming;
  const mockCreate = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    (IronaAI.create as any).mockImplementation(() => ({
      completions: {
        create: mockCreate
      }
    }));
    streaming = new IronaStreaming({ apiKey: 'sk_test_key' });
  });

  it('should create a stream for UI components', async () => {
    // Mock the createStreamableUI function from ai/rsc
    const mockUI = {
      update: vi.fn(),
      done: vi.fn()
    };
    vi.mock('../index', () => ({
      createStreamableUI: vi.fn().mockReturnValue(mockUI)
    }));

    // Mock streaming response
    const mockStreamResponse = {
      response: {
        [Symbol.asyncIterator]: async function* () {
          yield { content: 'Hello' };
          yield { content: ' world!' };
        }
      }
    };
    mockCreate.mockResolvedValueOnce(mockStreamResponse);
    
    const onStart = vi.fn();
    const onToken = vi.fn();
    const onComplete = vi.fn();
    
    await streaming.createStream(
      [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Say hello' }
      ],
      { onStart, onToken, onComplete }
    );
    
    expect(onStart).toHaveBeenCalled();
    expect(onToken).toHaveBeenCalledWith('Hello');
    expect(onToken).toHaveBeenCalledWith(' world!');
    expect(onComplete).toHaveBeenCalledWith('Hello world!');
    
  });

  it('should handle errors in stream creation', async () => {
    const mockUI = {
      update: vi.fn(),
      done: vi.fn()
    };
    vi.mock('../index', () => ({
      createStreamableUI: vi.fn().mockReturnValue(mockUI)
    }));

    mockCreate.mockRejectedValueOnce(new Error('Stream error'));
    
    await streaming.createStream(
      [{ role: 'user', content: 'Say hello' }]
    );
    
    
  });

  it('should stream response tokens using async generator', async () => {
    // Mock streaming response
    const mockStreamResponse = {
      response: {
        [Symbol.asyncIterator]: async function* () {
          yield { content: 'Hello' };
          yield { content: ' world!' };
        }
      }
    };
    mockCreate.mockResolvedValueOnce(mockStreamResponse);
    
    const generator = streaming.streamResponse('Say hello');
    
    const tokens: string[] = [];
    for await (const token of generator) {
      tokens.push(token);
    }
    
    expect(tokens).toEqual(['Hello', ' world!']);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      stream: true
    }));
  });

  it('should process streaming response with callback function', async () => {
    // Mock streaming response
    const mockStreamIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield 'Hello';
        yield ' world!';
      }
    };
    
    // Replace streamResponse with a mock that returns our iterator
    const streamResponseSpy = vi.spyOn(streaming, 'streamResponse')
      .mockImplementation(() => mockStreamIterator as any);
    
    const callback = vi.fn();
    const result = await streaming.streamWithCallback('Say hello', callback);
    
    expect(streamResponseSpy).toHaveBeenCalledWith('Say hello', expect.any(Object));
    expect(callback).toHaveBeenCalledWith('Hello', false);
    expect(callback).toHaveBeenCalledWith(' world!', false);
    expect(callback).toHaveBeenCalledWith('Hello world!', true);
    expect(result).toBe('Hello world!');
  });
});