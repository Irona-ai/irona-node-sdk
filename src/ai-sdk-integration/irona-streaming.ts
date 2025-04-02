import { IronaAI } from "../index";
import { Config, ErrorResponse } from "../types";

interface StreamUI {
  update: (text: string) => void;
  done: (text: string) => void;
}

const createStreamableUI = (): StreamUI => ({
  update: (_text: string) => {},
  done: (_text: string) => {}
});

/**
 * IronaStreaming provides enhanced streaming functionality using Vercel's AI SDK
 */
export class IronaStreaming {
  private ironaAI: IronaAI;
  
  /**
   * Create a new IronaStreaming instance
   * @param config Configuration options
   */
  constructor(config: Config = {}) {
    this.ironaAI = IronaAI.create(config);
  }
  
  /**
   * Create a streamable UI component that updates as the AI generates content
   * 
   * @param messages Array of messages to send to the AI
   * @param options Additional options for the request
   * @returns A streamable UI component that updates in real-time
   */
  async createStream(
    messages: Array<{role: "system" | "user" | "assistant", content: string}>,
    options: {
      model?: string;
      temperature?: number;
      onStart?: () => void;
      onToken?: (token: string) => void;
      onComplete?: (fullText: string) => void;
    } = {}
  ) {
    const {
      model = "openai/gpt-4o-mini",
      temperature = 0.7,
      onStart,
      onToken,
      onComplete
    } = options;
    
    // Create a streamable UI component
    const ui = createStreamableUI();
    
    try {
      // Call onStart callback if provided
      if (onStart) onStart();
      
      // Ensure messages array is not empty
      if (!messages || messages.length === 0) {
        throw new Error("Messages array cannot be empty");
      }

      // Create streaming completion request
      const response = await this.ironaAI.completions.create({
        messages: [messages[0], ...messages.slice(1)],
        models: [model],
        temperature,
        stream: true
      });
      
      // Check for errors
      if ('error' in response) {
        ui.done((response as ErrorResponse).error);
        return ui;
      }
      
      let fullText = '';
      
      // Process the stream
      for await (const chunk of response.response) {
        const token = chunk.content || '';
        fullText += token;
        
        // Update the UI
        ui.update(fullText);
        
        // Call onToken callback if provided
        if (onToken && token) onToken(token);
      }
      
      // Mark the UI as done
      ui.done(fullText);
      
      // Call onComplete callback if provided
      if (onComplete) onComplete(fullText);
      
      return ui;
    } catch (error) {
      // Handle errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      ui.done(`Error: ${errorMessage}`);
      return ui;
    }
  }
  
  /**
   * Stream a response to a user prompt
   * 
   * @param userPrompt User prompt to respond to
   * @param options Additional options for the request
   * @returns An async generator that yields tokens as they are generated
   */
  async *streamResponse(
    userPrompt: string,
    options: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
    } = {}
  ): AsyncGenerator<string> {
    const {
      systemPrompt = "You are a helpful assistant.",
      model = "openai/gpt-4o-mini",
      temperature = 0.7
    } = options;
    
    try {
      // Create streaming completion request
      const response = await this.ironaAI.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        models: [model],
        temperature,
        stream: true
      });
      
      // Check for errors
      if ('error' in response) {
        yield `Error: ${(response as ErrorResponse).error}`;
        return;
      }
      
      // Yield each token as it's generated
      for await (const chunk of response.response) {
        if (chunk.content) {
          yield chunk.content;
        }
      }
    } catch (error) {
      // Handle errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield `Error: ${errorMessage}`;
    }
  }
  
  /**
   * Process a streaming response with a callback function
   * 
   * @param userPrompt User prompt to respond to
   * @param callback Function to call with each token
   * @param options Additional options for the request
   * @returns The complete generated text
   */
  async streamWithCallback(
    userPrompt: string,
    callback: (token: string, isComplete: boolean) => void,
    options: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
    } = {}
  ): Promise<string> {
    let fullText = '';
    
    try {
      // Process each token in the stream
      for await (const token of this.streamResponse(userPrompt, options)) {
        fullText += token;
        callback(token, false);
      }
      
      // Call the callback one last time with the complete flag
      callback(fullText, true);
      
      return fullText;
    } catch (error) {
      // Handle errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      callback(`Error: ${errorMessage}`, true);
      return `Error: ${errorMessage}`;
    }
  }
}