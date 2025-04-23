import { OpenAI } from "openai";
import Anthropic from "@anthropic-ai/sdk";
import MistralClient from "@mistralai/mistralai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatModelConfig, Config } from "../types";
import { MissingApiKeyError, BadRequestError } from "../errors";
import { providerApiKeyName } from "../supported_models";
import { validateSchema } from "../utils/requestValidator";
import {
  CompletionsPayload,
  CompletionsSchema,
} from "../validators/completions.validator";
import {
  ModelSelectPayload,
  ModelSelectSchema,
} from "../validators/modelSelect.validator";
import { IronaRouterClient } from "../irona-router-client/IronaRouterClient";
import { validateAndGetProviderAndModel } from "../utils/validateAndGetProviderAndModel";
import { MessagePayload } from "@/validators/common.validators";
import { Base } from "@/irona-router-client/base";
import { createParser } from 'eventsource-parser';
//import OpenAI from 'openai';
import { GatewayConfig, GatewayResponse } from '../model-gateway/gatewayInterface';

export class IronaChatClient {
  private modelInstances: Record<string, any> = {};
  private openaiClient: OpenAI;
  private gatewayConfig?: GatewayConfig;

  constructor(
    private readonly config: Config,
    private readonly ironaRouter: IronaRouterClient
  ) {
    // Initialize OpenAI client with gateway URL
    this.openaiClient = new OpenAI({
      baseURL: config.gatewayUrl || 'https://proxy.irona.ai/v1/gateway',
      apiKey: config.apiKey || process.env.IRONAAI_API_KEY
    });

    // Store gateway config
    this.gatewayConfig = {
      extraBody: {
        models: config.fallback_models || [],
        tradeoff: config.tradeoff || 'quality',
        router_id: config.router_id
      }
    };
  }
  // Add gateway method
  public async gateway(payload: CompletionsPayload): Promise<GatewayResponse> {
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: 'irona',
        messages: payload.messages,
        temperature: payload.temperature,
        max_tokens: payload.maxTokens,
        stream: payload.stream,
        ...this.gatewayConfig?.extraBody
      });

      return {
        id: typeof response === 'object' && 'id' in response ? response.id : '',
        choices: 'choices' in response ? response.choices.map(choice => ({
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message.content || ''
          },
          finish_reason: choice.finish_reason
        })) : [],
        created: 'created' in response ? response.created : Date.now(),
        model: 'model' in response ? response.model : 'unknown',
        usage: (!('_events' in response) && 'usage' in response) ? response.usage as { prompt_tokens: number, completion_tokens: number, total_tokens: number } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    } catch (error) {
      console.error('Gateway error:', error);
      throw new Error(`Gateway request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Processes a completions request and retries with fallback models if necessary.
   */
  async completions(payload: CompletionsPayload) {
    // Validate input
    const validationResult = validateSchema(CompletionsSchema, payload);
    if (!validationResult.success) {
      return {
        error: validationResult.errors,
        error_trace: [{
          provider: null,
          model: null,
          error: validationResult.errors,
        }]
      };
    }

    // Error trace to keep track of all errors encountered
    const errorTrace = [];

    try {
      // Select the best model
      const modelSelectResult = await this.selectBestModel(payload);
      
      if (modelSelectResult.error) {
        errorTrace.push({
          provider: null,
          model: null,
          error: `Model selection failed: ${modelSelectResult.error}`,
        });
      }
      
      const { provider, model } = modelSelectResult;

      // Prepare the model priority queue
      // If `fallback_models` is provided in the `completions()` function payload, they will take precedence over `config.fallback_models` for model prioritization.
      const modelPriorityQueue = [
        ...(provider && model ? [{ provider, model }] : []),
        ...(payload.fallback_models ?? this.config.fallback_models ?? []).map(
          (fallback) => validateAndGetProviderAndModel(fallback)
        ),
      ];

      // Attempt execution for each model in the priority queue
      for (const { provider, model } of modelPriorityQueue) {
        console.log(
          `Invoking chat completions with provider: ${provider}, model: ${model}`
        );
        try {
          const response = await this.invokeChatCompletions(
            provider,
            model,
            payload
          );
          console.log(
            `Successfully executed chat completions with provider: ${provider}, model: ${model}`
          );
          
          // If there were previous errors, include them in the response
          if (errorTrace.length > 0) {
            return {
              ...response,
              error_trace: errorTrace,
              recovered: true,
            };
          }
          
          return response; // Return on first success
        } catch (error) {
          // Add error to trace
          errorTrace.push({
            provider,
            model,
            error: (error as Error).message,
          });
          
          console.error(`Error with ${provider}/${model}: ${(error as Error).message}`);
        }
      }

      // If all retries fail, return a structured error response
      return {
        error: "All attempts to process the completions request failed. Please verify the providers and models in your configuration.",
        error_trace: errorTrace,
      };
    } catch (error) {
      // Catch any unexpected errors
      return {
        error: `Unexpected error: ${(error as Error).message}`,
        error_trace: [...errorTrace, {
          provider: null,
          model: null,
          error: (error as Error).message,
        }],
      };
    }
  }

// Add this helper function to the IronaChatClient class to normalize streaming responses
private transformProviderStream(
  responseStream: any,
  provider: string,
  model: string
): ReadableStream {
  // Different providers have different stream formats
  if (provider === 'openai') {
    // For OpenAI, we need to extract content from the chunks
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(new TextEncoder().encode(content));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
  } else if (provider === 'anthropic') {
    // For Anthropic, transform their events to text chunks
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const content = chunk.content?.[0]?.text || '';
            if (content) {
              controller.enqueue(new TextEncoder().encode(content));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
  } else {
    // For other providers that might return a fetch Response
    return responseStream;
  }
}
// In your invokeChatCompletions method, when returning streaming responses:


  /**
   * Handles the invocation of chat completions to a specific provider and model.
   */
  private async invokeChatCompletions(
    provider: string,
    model: string,
    payload: CompletionsPayload
  ) {
    try {
      const apiKey = this.loadApiKeyForProvider(provider, model);
      const formattedMessages = this.formatInputMessages(payload.messages, model);
      
      // Common options for all providers
      const options = {
        temperature: payload?.temperature,
        maxTokens: payload?.maxTokens,
        maxRetries: payload?.maxRetries ?? 2,
      };

      let response: { content: string; role: string };
      let streamResponse: ReadableStream;
      switch (provider) {
        case "anthropic": {
          const client = this.getAnthropicClient(apiKey);
          if (payload.stream) {
            const stream = await client.messages.create({
              model,
              messages: this.formatMessagesForAnthropic(formattedMessages),
              max_tokens: options.maxTokens,
              temperature: options.temperature,
              stream: true,
            });
            streamResponse = this.transformProviderStream(stream, provider, model);
            return {
              response: stream,
              provider,
              model,
            };
          } else {
            const result = await client.messages.create({
              model,
              messages: this.formatMessagesForAnthropic(formattedMessages),
              max_tokens: options.maxTokens,
              temperature: options.temperature,
            });
            response = {
              content: result.content[0].text,
              role: "assistant"
            };
          }
          break;
        }
        case "openai": {
          const client = this.getOpenAIClient(apiKey);
          if (payload.stream) {
            const stream = await client.chat.completions.create({
              model,
              messages: this.formatMessagesForOpenAI(formattedMessages),
              max_tokens: options.maxTokens,
              temperature: options.temperature,
              stream: true,
            });
            streamResponse = this.transformProviderStream(stream, provider, model);
            return {
              response: streamResponse,
              provider,
              model,
            };
          } else {
            const result = await client.chat.completions.create({
              model,
              messages: this.formatMessagesForOpenAI(formattedMessages),
              max_tokens: options.maxTokens,
              temperature: options.temperature,
            });
            response = {
              content: result.choices[0].message.content,
              role: "assistant"
            };
          }
          break;
        }
        case "mistral": {
          const client = this.getMistralClient(apiKey);
          if (payload.stream) {
            const stream = await client.chatStream({
              model,
              messages: this.formatMessagesForMistral(formattedMessages),
              maxTokens: options.maxTokens,
              temperature: options.temperature,
            });
            return {
              response: stream,
              provider,
              model,
            };
          } else {
            const result = await client.chat({
              model,
              messages: this.formatMessagesForMistral(formattedMessages),
              maxTokens: options.maxTokens,
              temperature: options.temperature,
            });
            response = {
              content: result.choices[0].message.content,
              role: "assistant"
            };
          }
          break;
        }
        case "google": {
          const client = this.getGoogleAIClient(apiKey);
          const modelInstance = client.getGenerativeModel({ model: model });
          if (payload.stream) {
            const stream = await modelInstance.generateContentStream({
              contents: this.formatMessagesForGoogle(formattedMessages),
              generationConfig: {
                maxOutputTokens: options.maxTokens,
                temperature: options.temperature,
              },
            });
            return {
              response: stream,
              provider,
              model,
            };
          } else {
            const result = await modelInstance.generateContent({
              contents: this.formatMessagesForGoogle(formattedMessages),
              generationConfig: {
                maxOutputTokens: options.maxTokens,
                temperature: options.temperature,
              },
            });
            response = {
              content: result.response.text(),
              role: "assistant"
            };
          }
          break;
        }
        case "togetherai": {
          // Using fetch directly for Together AI as they don't have an official SDK
          const url = 'https://api.together.xyz/v1/completions';
          const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          };
          
          const body = {
            model,
            prompt: this.formatMessagesForTogether(formattedMessages),
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            stream: payload.stream
          };
          
          if (payload.stream) {
            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(body)
            });
            
            if (!response.ok) {
              throw new Error(`TogetherAI API error: ${response.statusText}`);
            }
            
            return {
              response: response.body,
              provider,
              model,
            };
          } else {
            const fetchResponse = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(body)
            });
            
            if (!fetchResponse.ok) {
              throw new Error(`TogetherAI API error: ${fetchResponse.statusText}`);
            }
            
            const result = await fetchResponse.json();
            response = {
              content: result.choices[0].text || result.choices[0].message?.content || '',
              role: "assistant"
            };
          }
          break;
        }
        case "perplexity": {
          // Using fetch directly for Perplexity as they don't have an official SDK
          const url = 'https://api.perplexity.ai/chat/completions';
          const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          };
          
          const body = {
            model,
            messages: this.formatMessagesForPerplexity(formattedMessages),
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            stream: payload.stream
          };
          
          if (payload.stream) {
            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(body)
            });
            
            if (!response.ok) {
              throw new Error(`Perplexity API error: ${response.statusText}`);
            }
            
            return {
              response: response.body,
              provider,
              model,
            };
          } else {
            let fetchResponse = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(body)
            });
            
            if (!fetchResponse.ok) {
              throw new Error(`Perplexity API error: ${fetchResponse.statusText}`);
            }
            
            const result = await fetchResponse.json();
            response = {
              content: result.choices[0].message.content,
              role: "assistant"
            };
          }
          break;
        }
        default:
          throw new Error(`No implementation found for provider: ${provider}`);
      }

      return {
        response,
        provider,
        model,
      };
    } catch (error) {
      throw new Error(
        `Failed to execute chat completions for provider: ${provider}, model: ${model}.\n${
          (error as Error).message
        }`
      );
    }
  }

  private extractModelSelectPayloadFromCompletionsPayload(
    body: CompletionsPayload
  ): ModelSelectPayload {
    const modelSelectBody: any = {};

    // Get the keys from ModelSelectSchema
    const modelSelectKeys = Object.keys(
      ModelSelectSchema.shape
    ) as (keyof ModelSelectPayload)[];

    // Extract only the matching keys from CompletionsPayload
    modelSelectKeys.forEach((key) => {
      if (key in body) {
        modelSelectBody[key] = body[key];
      }
    });

    return modelSelectBody;
  }

  private async selectBestModel(body: CompletionsPayload) {
    if (body.models && body.models.length === 1) {
      return validateAndGetProviderAndModel(body.models[0]);
    }

    try {
      const response = await this.ironaRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );
      
      // Handle errors from the model selection
      if (response && response.error) {
        // Still provide fallback providers for error recovery
        const providers = response.fallback_providers || [];
        if (providers.length > 0) {
          return providers[0];
        }
        return { provider: null, model: null, error: response.error };
      }
      
      return response.providers[0];
    } catch (error) {
      console.error(`Model selection error: ${(error as Error).message}`);
      return { provider: null, model: null, error: (error as Error).message };
    }
  }

  private loadApiKeyForProvider(provider: string, model: string) {
    const apiKeyName = providerApiKeyName(provider);
    const apiKey = process.env[apiKeyName];
    if (!apiKey) {
      throw new MissingApiKeyError(
        `The environment variable ${apiKeyName} is missing or empty. Please ensure that ${apiKeyName} is set in the environment variables for the ${provider}/${model} model.`
      );
    }
    return apiKey;
  }

  private getOpenAIClient(apiKey: string) {
    if (!this.modelInstances["openai"]) {
      this.modelInstances["openai"] = new OpenAI({ apiKey });
    }
    return this.modelInstances["openai"];
  }

  private getAnthropicClient(apiKey: string) {
    if (!this.modelInstances["anthropic"]) {
      this.modelInstances["anthropic"] = new Anthropic({ apiKey });
    }
    return this.modelInstances["anthropic"];
  }

  private getMistralClient(apiKey: string) {
    if (!this.modelInstances["mistral"]) {
      this.modelInstances["mistral"] = new MistralClient(apiKey);
    }
    return this.modelInstances["mistral"];
  }

  private getGoogleAIClient(apiKey: string) {
    if (!this.modelInstances["google"]) {
      this.modelInstances["google"] = new GoogleGenerativeAI(apiKey);
    }
    return this.modelInstances["google"];
  }

  // Format message for each provider
  private formatMessagesForOpenAI(messages: MessagePayload[]) {
    return messages.map(message => ({
      role: message.role,
      content: message.content
    }));
  }

  private formatMessagesForAnthropic(messages: MessagePayload[]) {
    // Extract system message if present
    const systemMessage = messages.find(m => m.role === "system");
    const userMessages = messages.filter(m => m.role !== "system");
    
    return userMessages.map(message => ({
      role: message.role,
      content: message.content
    }));
  }

  private formatMessagesForMistral(messages: MessagePayload[]) {
    return messages.map(message => ({
      role: message.role,
      content: message.content
    }));
  }

  private formatMessagesForGoogle(messages: MessagePayload[]) {
    return messages.map(message => ({
      role: message.role,
      parts: [{ text: message.content }]
    }));
  }

  private formatMessagesForTogether(messages: MessagePayload[]) {
    // Simple implementation - would need to be improved for production
    return messages.map(m => 
      `${m.role}: ${m.content}`
    ).join('\n');
  }

  private formatMessagesForPerplexity(messages: MessagePayload[]) {
    return messages.map(message => ({
      role: message.role,
      content: message.content
    }));
  }

  /**
   * Formats messages for "o1" models by remapping the "system" role to "user".
   * This is a workaround to handle limitations in "o1" models ("o1", "o1-mini", "o1-preview") that do not support the "system" role directly.
   * @param {MessagePayload[]} messages - List of input messages containing role and content.
   * @param {string} model - Target model name. If the model belongs to the "o1" family, roles are remapped.
   * @returns {MessagePayload[]} - Messages with "system" roles remapped to "user" for "o1" models.
   */
  private formatInputMessages = (messages: MessagePayload[], model: string) => {
    const o1Models = ["o1", "o1-mini", "o1-preview"];

    return o1Models.includes(model)
      ? messages.map((m) => ({
          role: m.role === "system" ? "user" : m.role,
          content: m.content,
        }))
      : messages;
  };
}
