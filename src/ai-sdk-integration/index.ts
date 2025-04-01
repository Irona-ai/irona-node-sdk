import { IronaStructuredOutput } from './irona-structured-output';
import { IronaFunctionCalling } from './irona-function-calling';
import { IronaStreaming } from './irona-streaming';
import { Config } from '../types';

/**
 * IronaAISDK is the main entry point for using Irona's AI SDK
 * with structured output and function calling capabilities
 */
export class IronaAISDK {
  /** 
   * Structured output generation capabilities
   */
  public structured: IronaStructuredOutput;
  
  /**
   * Function calling capabilities
   */
  public functions: IronaFunctionCalling;
  
  /**
   * Streaming capabilities
   */
  public streaming: IronaStreaming;
  
  /**
   * Create a new IronaAISDK instance
   * 
   * @param config Configuration options
   */
  constructor(config: Config = {}) {
    this.structured = new IronaStructuredOutput(config);
    this.functions = new IronaFunctionCalling(config);
    this.streaming = new IronaStreaming(config);
  }
  
  /**
   * Create a new IronaAISDK instance asynchronously
   * 
   * @param config Configuration options
   * @returns A new IronaAISDK instance
   */
  public static async create(config: Config = {}): Promise<IronaAISDK> {
    // Any async initialization can happen here
    return new IronaAISDK(config);
  }
}

// Export all components
export * from './irona-structured-output';
export * from './irona-function-calling';
export * from './irona-streaming';
export * from './schemas';
export * from './tools';