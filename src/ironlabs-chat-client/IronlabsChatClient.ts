import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createMistral, mistral } from '@ai-sdk/mistral';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { createPerplexity, perplexity } from '@ai-sdk/perplexity';
import { createTogetherAI, togetherai } from '@ai-sdk/togetherai';
import { createXai, xai } from '@ai-sdk/xai';
import type { LanguageModel, ModelMessage } from 'ai';
import {
  extractReasoningMiddleware,
  generateText,
  stepCountIs,
  streamText,
  wrapLanguageModel,
} from 'ai';

import { BadRequestError, MissingApiKeyError } from '../errors';
import type { LLMGatewayCostData, ProviderName } from '../responseTypes';
import { CompletionsResponse } from '../responseTypes';
import type { Router } from '../router/types';
import type { MessagePayload } from '../schemas/common.schema';
import { CompletionsSchema } from '../schemas/completions.schema';
import type { CompletionsPayload } from '../schemas/completions.schema';
import { ModelSelectSchema } from '../schemas/modelSelect.schema';
import type { ModelSelectPayload } from '../schemas/modelSelect.schema';
import {
  providerApiKeyName,
  doesModelSupportMediaTypes,
  doesModelSupportWebSearch,
  getModelPrefix,
  getOpenRouterIdentifier,
} from '../supported_models';
import type { Config, GatewayConfig, ProviderConfig } from '../types';
import {
  OPENROUTER_DEFAULT_BASE_URL,
  SUPPORTED_MODELS_DEFAULT_URL,
} from '../utils/constants';
import { detectGatewayTypeFromUrl } from '../utils/gatewayType';
import type { GatewayType } from '../utils/gatewayType';
import { createLLMGatewayFetchWrapper } from '../utils/llmGatewayFetchWrapper';
import { buildLLMGatewayExtraBody } from '../utils/llmGatewayMapper';
import type { LLMGatewayExtraBody } from '../utils/llmGatewayMapper';
import { logger } from '../utils/logger';
import { createOpenRouterFetchWrapper } from '../utils/openRouterFetchWrapper';
import type { OpenRouterUserMessage } from '../utils/openRouterFetchWrapper';
import { buildOpenRouterExtraBody } from '../utils/openRouterMapper';
import type { OpenRouterExtraBody } from '../utils/openRouterMapper';
import { buildOpenRouterUserMessages } from '../utils/openRouterMessageConverter';
import {
  extractMediaTypeArrayFromMessages,
  validateAndGetProviderAndModel,
} from '../utils/providerAndModelUtils';
import { ReasoningConfig } from '../utils/reasoningConfig';
import type { ReasoningEffort } from '../utils/reasoningConfig';
import { validateSchema } from '../utils/requestValidator';
export { CompletionsResponse };

export class IronlabsChatClient {
  // Media types the @ai-sdk/openai adapter accepts natively for file parts.
  // Everything outside this set causes the adapter to throw before the HTTP
  // request is made, so we fall back to embedding the content as a text part.
  private static readonly OPENAI_NATIVE_FILE_RE =
    /^(image\/|audio\/(wav|mpeg|mp3)|application\/pdf)/;

  // Restrict file fetches to HTTPS only to mitigate SSRF.
  // Full private-IP / hostname blocklist is tracked in a separate ticket.
  private static assertHttpsUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestError(`Invalid file URL: ${url}`);
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestError(
        `File URL must use HTTPS (got "${parsed.protocol}"): ${url}`
      );
    }
  }

  private readonly gatewayProvider?: ReturnType<typeof createOpenAI>['chat'];
  // Single source of truth for which gateway flavour we're talking to. Both
  // payload-mapping (`isOpenRouter`/`isLLMGateway` checks below) and model-name
  // resolution branch off this rather than re-parsing the URL each time.
  private readonly gatewayType: GatewayType;
  private readonly openRouterFallbackKey: string;

  constructor(
    private readonly config: Config,
    private readonly ironaRouter: Router
  ) {
    this.gatewayProvider = this.createGatewayProvider(this.config.gateway);
    this.gatewayType = detectGatewayTypeFromUrl(this.config.gateway?.baseUrl);
    this.openRouterFallbackKey =
      config.openRouterFallbackKey ?? process.env.OPENROUTER_API_KEY ?? '';
  }

  /**
   * Processes a completions request and retries with fallback models if necessary.
   */
  async completions(payload: CompletionsPayload): Promise<CompletionsResponse> {
    // Validate input
    const validationResult = validateSchema(CompletionsSchema, payload);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.errors);
    }

    // Detect file parts (image/PDF/video) in messages once, before the retry loop.
    // Images always use OpenRouter when available. PDFs prefer LLM Gateway when
    // configured, otherwise fall back to OpenRouter. Videos are handled separately
    // and always route through OpenRouter. Non-file requests use whatever gateway
    // is configured unchanged.
    const fileMediaTypes = extractMediaTypeArrayFromMessages(payload.messages);
    const hasImageParts = fileMediaTypes.includes('image');
    const hasPdfParts = fileMediaTypes.includes('pdf');
    const hasVideoParts = fileMediaTypes.includes('video');
    const hasFileParts = fileMediaTypes.length > 0;
    const openRouterFallbackKey = this.openRouterFallbackKey;

    // Images: Always use OpenRouter when available (preserves existing behavior)
    // PDFs: Use OpenRouter only if LLM Gateway is not configured
    // Videos: Always use OpenRouter when available (special case)
    const useOpenRouterForImages =
      hasImageParts && openRouterFallbackKey !== '';
    const useOpenRouterForPdfs =
      hasPdfParts && openRouterFallbackKey !== '' && !this.isLLMGateway();
    const useOpenRouterFallback =
      useOpenRouterForImages || useOpenRouterForPdfs;
    const forceVideoThroughOpenRouter =
      hasVideoParts && this.isLLMGateway() && openRouterFallbackKey !== '';

    if (hasVideoParts && this.isLLMGateway() && openRouterFallbackKey === '') {
      throw new BadRequestError(
        'Video input is not supported by LLM Gateway. Set OPENROUTER_API_KEY to enable automatic video routing through OpenRouter.'
      );
    }

    if (hasVideoParts && !this.isLLMGateway() && openRouterFallbackKey === '') {
      logger.warn(
        '[IronlabsChatClient] Video input detected but no OPENROUTER_API_KEY — video may not be supported by the configured provider.'
      );
    }

    if (hasFileParts) {
      const routingInfo = [];
      if (hasImageParts) {
        routingInfo.push(
          `Images: ${useOpenRouterForImages ? 'OpenRouter' : 'configured gateway'}`
        );
      }
      if (hasPdfParts) {
        const pdfRoute =
          this.isLLMGateway() && !useOpenRouterForPdfs
            ? 'LLM Gateway'
            : useOpenRouterForPdfs
              ? 'OpenRouter'
              : 'configured gateway';
        routingInfo.push(`PDFs: ${pdfRoute}`);
      }
      if (hasVideoParts) {
        routingInfo.push(
          `Videos: ${forceVideoThroughOpenRouter ? 'OpenRouter (forced)' : useOpenRouterFallback ? 'OpenRouter' : 'configured gateway'}`
        );
      }
      logger.info(
        `[IronlabsChatClient][completions] Messages contain file parts (${fileMediaTypes.join(', ')}). ${routingInfo.join(', ')}.`
      );
    }

    const selectedModel =
      payload.models.length === 1
        ? this.selectSingleModel(payload)
        : await this.selectBestModel(payload);
    const { provider, model } = selectedModel;

    // Prepare the model priority queue
    // If `fallbackModels` is provided in the `completions()` function payload, they will take precedence over `config.fallbackModels` for model prioritization.
    const modelPriorityQueue = [
      ...(provider !== null && model !== null ? [{ provider, model }] : []),
      ...(payload.fallbackModels ?? this.config.fallbackModels ?? []).map(
        fallback => validateAndGetProviderAndModel(fallback)
      ),
    ];

    // Attempt execution for each model in the priority queue
    let attemptNumber = 1;
    for (const { provider, model } of modelPriorityQueue) {
      logger.info(
        `[IronlabsChatClient][completions] Attempt ${attemptNumber}: Invoking chat completions with provider: ${provider}, model: ${model}`
      );
      try {
        const supportsWebSearch = doesModelSupportWebSearch(provider, model);
        const response = await this.invokeChatCompletions(
          provider,
          model,
          payload,
          supportsWebSearch,
          useOpenRouterFallback,
          openRouterFallbackKey,
          forceVideoThroughOpenRouter,
          false,
          hasVideoParts
        );
        logger.info(
          `[IronlabsChatClient][completions] Attempt ${attemptNumber}: Successfully executed chat completions with provider: ${provider}, model: ${model}`
        );
        return response; // Return on first success
      } catch (error) {
        logger.error(
          `\n[IronlabsChatClient][completions] Attempt ${attemptNumber}: Error with ${provider}/${model}: ${
            (error as Error).message
          }`
        );
      }
      attemptNumber++;
    }
    // All queue retries failed — attempt OpenRouter as final fallback.
    if (openRouterFallbackKey !== '' && modelPriorityQueue.length > 0) {
      const { provider: orProvider, model: orModel } = modelPriorityQueue[0];
      logger.info(
        `[IronlabsChatClient][completions] All attempts failed. Attempting OpenRouter fallback for ${orProvider}/${orModel}`
      );
      try {
        const supportsWebSearch = doesModelSupportWebSearch(
          orProvider,
          orModel
        );
        return await this.retryViaOpenRouter(
          orProvider,
          orModel,
          payload,
          supportsWebSearch,
          openRouterFallbackKey,
          hasVideoParts
        );
      } catch (fallbackErr) {
        logger.error(
          `[IronlabsChatClient][completions] OpenRouter fallback also failed: ${(fallbackErr as Error).message}`
        );
      }
    }
    throw new Error(
      `[IronlabsChatClient][completions] All attempts to process the completions request failed. Please verify the providers and models in your configuration.`
    );
  }

  private selectSingleModel(body: CompletionsPayload) {
    const { provider, model } = validateAndGetProviderAndModel(body.models[0]);
    const mediaInputsArray = extractMediaTypeArrayFromMessages(body.messages);
    const supportsMediaTypes = doesModelSupportMediaTypes(
      provider,
      model,
      mediaInputsArray
    );

    if (!supportsMediaTypes) {
      throw new BadRequestError(
        `Model ${provider}/${model} does not support required media types: ${mediaInputsArray.join(
          ', '
        )}. Please choose a model that supports the requested media types. You can visit ${SUPPORTED_MODELS_DEFAULT_URL} to see the list of supported models.`
      );
    }

    return { provider, model };
  }

  /**
   * Handles the invocation of chat completions to a specific provider and model.
   * `useOpenRouterFallback` and `openRouterFallbackKey` are resolved once in
   * `completions()` — based on file parts in messages — and passed here so every
   * retry in the priority queue uses the same routing decision.
   */
  private async invokeChatCompletions(
    provider: string,
    model: string,
    payload: CompletionsPayload,
    supportsWebSearch: boolean,
    useOpenRouterFallback: boolean,
    openRouterFallbackKey: string,
    forceVideoThroughOpenRouter = false,
    forceOpenRouterFallback = false,
    hasVideoParts = false
  ): Promise<CompletionsResponse> {
    try {
      // When a gateway is configured, ALL providers route through it.
      // Provider-specific API keys are ignored for routing (BYOK is handled
      // at the gateway/account level, e.g. OpenRouter dashboard).
      // Exception: video parts with LLM Gateway always bypass to OpenRouter.
      const isUsingGateway = this.gatewayProvider !== undefined;
      const effectiveUseOpenRouterFallback =
        forceVideoThroughOpenRouter ||
        forceOpenRouterFallback ||
        (useOpenRouterFallback && !this.hasDirectProviderKey(provider));
      const effectiveIsUsingGateway =
        isUsingGateway || effectiveUseOpenRouterFallback;

      if (!effectiveIsUsingGateway) {
        this.loadApiKeyForProvider(provider, model);
      }

      // When routing through an OpenAI-compatible gateway (OpenRouter, LLM Gateway,
      // etc.) the Vercel AI SDK's OpenAI adapter rejects PDF file parts supplied
      // as URLs. Fetch and base64-encode them here before conversion.
      const resolvedMessages = effectiveIsUsingGateway
        ? await this.resolveFileUrlsToBase64(payload.messages)
        : payload.messages;

      // Convert messages to Vercel AI SDK format
      const vercelMessages = this.convertToVercelMessages(resolvedMessages);

      let fullModelName = model;
      if (!effectiveIsUsingGateway && provider === 'togetherai') {
        const modelPrefix = getModelPrefix(provider, model);
        if (modelPrefix !== null && modelPrefix !== undefined) {
          fullModelName = `${modelPrefix}/${model}`;
        }
      }
      // OpenRouter fallback takes priority over any configured gateway for model
      // name resolution — files always use the OpenRouter identifier.
      if (effectiveUseOpenRouterFallback) {
        const orName = getOpenRouterIdentifier(provider, fullModelName);
        if (orName !== null && orName !== '') {
          fullModelName = orName;
        }
      } else if (isUsingGateway) {
        fullModelName = this.resolveGatewayModelName(provider, fullModelName);
      }

      // Pick the gateway-specific extra body + fetch wrapper based on the
      // configured gateway hostname. OpenRouter uses `plugins`, LLM Gateway
      // uses `web_search` — same reasoning shape, different search shape.
      const isOpenRouter =
        effectiveUseOpenRouterFallback ||
        (isUsingGateway && this.isOpenRouterGateway());
      const isLLMGateway =
        !effectiveUseOpenRouterFallback &&
        isUsingGateway &&
        this.isLLMGateway();
      let llmGatewayCost: LLMGatewayCostData | null = null;
      let openRouterExtra: OpenRouterExtraBody | undefined;
      let llmGatewayExtra: LLMGatewayExtraBody | undefined;
      if (isOpenRouter) {
        openRouterExtra = buildOpenRouterExtraBody({
          reasoningEffort: payload.reasoningEffort,
          search: payload.search,
          supportsWebSearch,
          provider,
          model,
        });
      } else if (isLLMGateway) {
        llmGatewayExtra = buildLLMGatewayExtraBody({
          reasoningEffort: payload.reasoningEffort,
          search: payload.search,
          supportsWebSearch,
          provider,
          model,
        });
      }

      // When routing through OpenRouter and the messages contain video_url parts,
      // build OpenRouter-native user messages. The fetch wrapper will substitute
      // these into the outgoing request body, replacing the Vercel AI SDK's
      // serialisation (which uses an image placeholder for video_url parts).
      let openRouterUserMessages: OpenRouterUserMessage[] | undefined;
      if (isOpenRouter && hasVideoParts) {
        openRouterUserMessages = buildOpenRouterUserMessages(resolvedMessages);
      }

      const captureGatewayCost = (cost: LLMGatewayCostData): void => {
        llmGatewayCost = cost;
      };
      const gatewayFactory = isOpenRouter
        ? effectiveUseOpenRouterFallback
          ? createOpenAI({
              baseURL: OPENROUTER_DEFAULT_BASE_URL,
              apiKey: openRouterFallbackKey,
              name: 'openrouter',
              fetch: createOpenRouterFetchWrapper(
                openRouterExtra ?? {},
                globalThis.fetch,
                openRouterUserMessages,
                captureGatewayCost
              ),
            }).chat
          : this.getOpenRouterModelFactory(
              openRouterExtra ?? {},
              openRouterUserMessages,
              captureGatewayCost
            )
        : isLLMGateway
          ? this.getLLMGatewayModelFactory(llmGatewayExtra, captureGatewayCost)
          : undefined;

      const modelFactory =
        gatewayFactory ??
        this.getModelInstance(
          provider,
          fullModelName,
          payload.reasoningEffort,
          effectiveIsUsingGateway
        );

      if (!modelFactory) {
        throw new Error(`No model factory found for provider: ${provider}`);
      }

      const baseModel = modelFactory(fullModelName);

      // When the gateway fetch wrapper injects delta.reasoning as
      // <think>…</think> tags, wrap the model so the AI SDK extracts those
      // tags into reasoning-delta stream parts. Both mappers omit the
      // reasoning field for 'off'/undefined — its presence means active.
      const shouldExtractGatewayReasoning =
        (isOpenRouter && openRouterExtra?.reasoning !== undefined) ||
        (isLLMGateway && llmGatewayExtra?.reasoning !== undefined);

      const finalModel = shouldExtractGatewayReasoning
        ? (wrapLanguageModel({
            model: baseModel as Parameters<
              typeof wrapLanguageModel
            >[0]['model'],
            middleware: extractReasoningMiddleware({ tagName: 'think' }),
          }) as LanguageModel)
        : baseModel;

      // Prepare base configuration
      const baseConfig: {
        model: LanguageModel;
        messages: ModelMessage[];
        temperature?: number;
        maxOutputTokens?: number;
        tools?: Parameters<typeof streamText>[0]['tools'];
        stopWhen?: Parameters<typeof streamText>[0]['stopWhen'];
        providerOptions?: Parameters<typeof streamText>[0]['providerOptions'];
      } = {
        model: finalModel,
        messages: vercelMessages,
        temperature: payload.temperature,
        maxOutputTokens: payload.maxTokens,
      };

      // Handle tools from payload
      let tools = payload.tools ? { ...payload.tools } : {};

      // Add search tools if search is enabled (skip for gateways — OpenRouter
      // handles search via plugins in the request body, not native tools)
      if (
        !effectiveIsUsingGateway &&
        provider === 'openai' &&
        payload.search === true &&
        supportsWebSearch
      ) {
        tools = { ...tools, web_search_preview: openai.tools.webSearch({}) };
      }

      if (
        !effectiveIsUsingGateway &&
        provider === 'google' &&
        payload.search === true &&
        supportsWebSearch
      ) {
        tools = { ...tools, google_search: google.tools.googleSearch({}) };
      }

      // Add tools to config if there are any
      if (Object.keys(tools).length > 0) {
        baseConfig.tools = tools as Parameters<typeof streamText>[0]['tools'];
      }

      // Enable multi-step calls only when payload.tools are provided
      if (payload.tools && Object.keys(payload.tools).length > 0) {
        baseConfig.stopWhen = stepCountIs(5);
      }

      if (
        !effectiveIsUsingGateway &&
        provider === 'xai' &&
        payload.search === true &&
        supportsWebSearch
      ) {
        baseConfig.providerOptions = {
          xai: {
            searchParameters: {
              mode: 'on',
            },
          },
        };
      }
      // Helper function to apply reasoning configuration
      const applyReasoningConfig = (
        config: Record<string, unknown>
      ): Record<string, unknown> => {
        if (effectiveIsUsingGateway) {
          return config;
        }
        if (
          provider === 'togetherai' ||
          provider === 'mistral' ||
          provider === 'perplexity'
        ) {
          // For these providers, reasoning is handled by middleware that comes under <think> xml, not provider options
          return config;
        }
        return ReasoningConfig.applyReasoningConfig(
          config,
          provider,
          model,
          payload.reasoningEffort
        );
      };

      if (payload.stream === true) {
        const streamConfig = (
          payload.reasoningEffort
            ? applyReasoningConfig({
                ...baseConfig,
              })
            : {
                ...baseConfig,
              }
        ) as Parameters<typeof streamText>[0];

        const stream = streamText(streamConfig);

        // Prevent unhandled promise rejections. streamText exposes many settled
        // promises (content/text/reasoning/sources/toolCalls/finishReason/usage/…)
        // that ALL reject with the underlying error when a provider yields no
        // output or a chunk fails validation (e.g. a malformed url_citation
        // annotation). We only ever consume `fullStream`, so any of these left
        // without a handler rejects unhandled and crashes the host process
        // (Node exit 128 / uncaughtException — which in turn kills pino's
        // logging worker). Attach no-op catch handlers to every settled promise
        // — `fullStream` is a fresh tee per access, so this does not disturb
        // stream iteration.
        const swallowRejection = (): void => {};
        for (const settled of [
          stream.content,
          stream.text,
          stream.reasoning,
          stream.reasoningText,
          stream.files,
          stream.sources,
          stream.toolCalls,
          stream.staticToolCalls,
          stream.dynamicToolCalls,
          stream.toolResults,
          stream.staticToolResults,
          stream.dynamicToolResults,
          stream.finishReason,
          stream.usage,
          stream.totalUsage,
          stream.warnings,
          stream.steps,
          stream.request,
          stream.response,
          stream.providerMetadata,
        ]) {
          void settled.catch(swallowRejection);
        }

        // Return the stream immediately — no early validation.
        // Errors are caught inline via the error-handling wrapper below
        // and will propagate up to completions() for fallback retry.
        const doOpenRouterFallback = (
          orKey: string
        ): Promise<CompletionsResponse> =>
          this.retryViaOpenRouter(
            provider,
            model,
            payload,
            supportsWebSearch,
            orKey,
            hasVideoParts
          );
        const fullStream = {
          async *[Symbol.asyncIterator]() {
            let chunkCount = 0;
            let textChunkCount = 0;
            try {
              for await (const part of stream.fullStream) {
                if (part.type === 'error') {
                  const err = part.error as {
                    name?: string;
                    statusCode?: number;
                    message?: string;
                  };
                  const errMsg =
                    err.message ?? err.name ?? JSON.stringify(part.error);
                  throw new Error(
                    `${errMsg}${err.statusCode !== undefined ? ` (status ${err.statusCode})` : ''}`
                  );
                }
                if (part.type === 'text-delta') {
                  textChunkCount++;
                }
                chunkCount++;
                yield part;
              }
              if (chunkCount === 0) {
                throw new Error(
                  `Empty stream response from ${provider}/${model}`
                );
              }
              // Ground-truth gateway cost (LLM Gateway or OpenRouter — both
              // report it as usage.cost/cost_details). Emitted under one part
              // type so consumers read a single mechanism regardless of gateway.
              if (llmGatewayCost !== null) {
                yield { type: 'llmgateway-cost' as const, ...llmGatewayCost };
              }
            } catch (err) {
              logger.error(
                `[IronlabsChatClient][completions][invokeChatCompletions] Stream failed for ${provider}/${model}: ${err}`
              );
              // Only attempt the OR fallback if no text has been delivered yet.
              // Mid-stream recovery after real text would produce interleaved
              // output (partial A + complete OR), which is semantically broken.
              // Metadata-only parts (step-start, response) are safe to discard.
              if (
                !isOpenRouter &&
                !forceOpenRouterFallback &&
                openRouterFallbackKey !== '' &&
                textChunkCount === 0
              ) {
                logger.info(
                  `[IronlabsChatClient][completions][invokeChatCompletions] Attempting OpenRouter fallback for ${provider}/${model}`
                );
                try {
                  const fallback = await doOpenRouterFallback(
                    openRouterFallbackKey
                  );
                  if (fallback.response.fullStream !== undefined) {
                    for await (const part of fallback.response.fullStream) {
                      yield part;
                    }
                  }
                  return;
                } catch (fallbackErr) {
                  logger.error(
                    `[IronlabsChatClient][completions][invokeChatCompletions] OpenRouter fallback also failed for ${provider}/${model}: ${(fallbackErr as Error).message}`
                  );
                }
              }
              throw new Error(
                `Streaming failed for provider: ${provider}, model: ${model}.\n${
                  (err as Error).message
                }`
              );
            }
          },
        };

        return {
          response: { fullStream },
          provider,
          model,
        };
      } else {
        const generateConfig = (
          payload.reasoningEffort
            ? applyReasoningConfig({
                ...baseConfig,
              })
            : {
                ...baseConfig,
              }
        ) as Parameters<typeof generateText>[0];
        try {
          const response = await generateText(generateConfig);
          return {
            response: {
              content: response.text,
              reasoningContent: response.reasoning,
              role: 'assistant',
            },
            provider,
            model,
          };
        } catch (error) {
          logger.error(
            `[IronlabsChatClient] Non-stream request failed for ${provider}/${model}: ${error}`
          );
          throw error;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to execute chat completions for provider: ${provider}, model: ${model}.\n${
          (error as Error).message
        }\n`
      );
    }
  }

  private retryViaOpenRouter(
    provider: string,
    model: string,
    payload: CompletionsPayload,
    supportsWebSearch: boolean,
    orKey: string,
    hasVideoParts = false
  ): Promise<CompletionsResponse> {
    return this.invokeChatCompletions(
      provider,
      model,
      payload,
      supportsWebSearch,
      false,
      orKey,
      true,
      false,
      hasVideoParts
    );
  }

  /**
   * Fetches URL-based file/document parts for gateway routing.
   * For media types natively supported by the OpenAI-compatible adapter
   * (image/*, audio/wav|mp3, application/pdf) the bytes are base64-encoded
   * and kept as file parts. For everything else — a generic fallback — the
   * fetched content is embedded as a text part so the adapter never throws.
   */
  private async resolveFileUrlsToBase64(
    messages: MessagePayload[]
  ): Promise<MessagePayload[]> {
    return Promise.all(
      messages.map(async msg => {
        if (msg.role !== 'user' || typeof msg.content === 'string') {
          return msg;
        }

        const resolvedParts = await Promise.all(
          msg.content.map(async part => {
            if (
              part.type === 'file' &&
              typeof part.data === 'string' &&
              (part.data.startsWith('https://') ||
                part.data.startsWith('http://'))
            ) {
              IronlabsChatClient.assertHttpsUrl(part.data);
              const res = await fetch(part.data);
              if (!res.ok) {
                throw new Error(
                  `Failed to fetch file part (${res.status}): ${part.data}`
                );
              }
              if (
                !IronlabsChatClient.OPENAI_NATIVE_FILE_RE.test(part.mediaType)
              ) {
                return { type: 'text' as const, text: await res.text() };
              }
              const base64 = Buffer.from(await res.arrayBuffer()).toString(
                'base64'
              );
              return { ...part, data: base64 };
            }

            if (part.type === 'document' && part.source.type === 'url') {
              IronlabsChatClient.assertHttpsUrl(part.source.url);
              const res = await fetch(part.source.url);
              if (!res.ok) {
                throw new Error(
                  `Failed to fetch document part (${res.status}): ${part.source.url}`
                );
              }
              const base64 = Buffer.from(await res.arrayBuffer()).toString(
                'base64'
              );
              return {
                ...part,
                source: {
                  type: 'base64' as const,
                  data: base64,
                  media_type: part.source.media_type,
                },
              };
            }

            return part;
          })
        );

        return { ...msg, content: resolvedParts } as MessagePayload;
      })
    );
  }

  /**
   * Converts messages to Vercel AI SDK format
   */
  private convertToVercelMessages(messages: MessagePayload[]): ModelMessage[] {
    return messages.map((msg): ModelMessage => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        } as ModelMessage;
      }

      if (msg.role === 'user') {
        const parts = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          } else if (part.type === 'image') {
            return { type: 'image' as const, image: part.image };
          } else if (part.type === 'image_url') {
            // OpenAI-style image_url → AI SDK image part. The SDK accepts
            // both HTTPS URLs and `data:image/...;base64,...` strings here.
            return { type: 'image' as const, image: part.image_url.url };
          } else if (part.type === 'file') {
            return {
              type: 'file' as const,
              data: part.data,
              mediaType: part.mediaType ?? 'application/pdf',
            };
          } else if (part.type === 'document') {
            // Anthropic-style document → AI SDK file part. `source.url` (an
            // HTTPS URL) or `source.data` (base64) both feed straight into
            // the SDK's BinaryDataSchema-compatible `data` field.
            const source = part.source;
            const data = source.type === 'url' ? source.url : source.data;
            return {
              type: 'file' as const,
              data,
              mediaType: source.media_type ?? 'application/pdf',
            };
          } else if (part.type === 'video_url') {
            // video_url is not understood by the Vercel AI SDK. We use an image
            // placeholder here so the SDK doesn't throw; the OpenRouter fetch
            // wrapper replaces the entire user message with the correctly-formatted
            // video_url content before the request reaches OpenRouter.
            return { type: 'image' as const, image: part.video_url.url };
          }
          throw new Error(
            `Unsupported user message part type: ${(part as { type: string }).type}`
          );
        });
        return { role: 'user', content: parts } as ModelMessage;
      }

      if (msg.role === 'assistant') {
        const parts = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          } else if (part.type === 'reasoning') {
            return { type: 'reasoning' as const, text: part.text };
          } else if (part.type === 'file') {
            return {
              type: 'file' as const,
              data: part.data,
              mediaType: part.mediaType,
            };
          } else if (part.type === 'tool-call') {
            return {
              type: 'tool-call' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            };
          }
          throw new Error(
            `Unsupported assistant message part type: ${(part as { type: string }).type}`
          );
        });
        return { role: 'assistant', content: parts } as ModelMessage;
      }

      if (msg.role === 'tool') {
        const parts = msg.content.map(part => ({
          type: 'tool-result' as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        }));
        return { role: 'tool', content: parts } as ModelMessage;
      }

      throw new Error(
        `Unsupported message role: ${(msg as { role: string }).role}`
      );
    });
  }

  /**
   * Gets the appropriate model instance
   */
  private getModelInstance(
    provider: string,
    model: string,
    reasoningEffort?: ReasoningEffort,
    isUsingGateway = false
  ) {
    if (isUsingGateway && this.gatewayProvider) {
      return this.gatewayProvider;
    }

    // Check for programmatic provider config → create custom SDK instance
    const customInstance = this.createCustomProviderInstance(provider);
    if (customInstance !== undefined) {
      if (
        ReasoningConfig.supportsReasoningMiddleware(
          provider as ProviderName,
          model
        )
      ) {
        return (modelName: string) => {
          const baseModel = customInstance(modelName);
          return ReasoningConfig.createEnhancedModelWithReasoning(
            baseModel,
            reasoningEffort
          );
        };
      }
      return customInstance;
    }

    // Default provider instances (read API keys from env vars)
    const providerModels = {
      openai,
      anthropic,
      google,
      mistral,
      perplexity,
      togetherai,
      xai,
    };
    if (!(provider in providerModels)) {
      return undefined;
    }
    if (
      ReasoningConfig.supportsReasoningMiddleware(
        provider as ProviderName,
        model
      )
    ) {
      return (modelName: string) => {
        const baseModel =
          providerModels[provider as keyof typeof providerModels](modelName);
        return ReasoningConfig.createEnhancedModelWithReasoning(
          baseModel,
          reasoningEffort
        );
      };
    }
    return providerModels[provider as keyof typeof providerModels];
  }

  private createGatewayProvider(gateway?: GatewayConfig) {
    if (!gateway) {
      return undefined;
    }

    const provider = createOpenAI({
      baseURL: gateway.baseUrl,
      apiKey: gateway.apiKey,
      headers: gateway.headers,
      name: gateway.providerName ?? 'gateway',
    });
    // Use .chat to force the Chat Completions API (/chat/completions).
    // The default call uses the Responses API (/responses) which most
    // gateways (OpenRouter, etc.) do not support.
    return provider.chat;
  }

  private isOpenRouterGateway(): boolean {
    return this.gatewayType === 'openrouter';
  }

  private isLLMGateway(): boolean {
    return this.gatewayType === 'llmgateway';
  }

  /**
   * Returns an OpenRouter-flavoured gateway model factory: a per-request
   * `createOpenAI()` instance whose fetch merges OpenRouter-specific params
   * (`reasoning`, `plugins`, `provider`) into the body. When
   * `openRouterUserMessages` is provided the wrapper substitutes those
   * pre-formatted messages for user-role entries (used for video_url support).
   */
  private getOpenRouterModelFactory(
    extraBody: OpenRouterExtraBody,
    openRouterUserMessages?: OpenRouterUserMessage[],
    onCost?: (data: LLMGatewayCostData) => void
  ): ReturnType<typeof createOpenAI>['chat'] | undefined {
    if (this.config.gateway === undefined) {
      return undefined;
    }
    return createOpenAI({
      baseURL: this.config.gateway.baseUrl,
      apiKey: this.config.gateway.apiKey,
      headers: this.config.gateway.headers,
      name: this.config.gateway.providerName ?? 'gateway',
      fetch: createOpenRouterFetchWrapper(
        extraBody,
        globalThis.fetch,
        openRouterUserMessages,
        onCost
      ),
    }).chat;
  }

  /**
   * Returns an LLM Gateway-flavoured model factory: a per-request
   * `createOpenAI()` instance whose fetch merges LLM Gateway-specific params
   * (`reasoning`, `web_search`) and cleans up `delta.reasoning` tokens.
   * The wrapper is created even with an empty extra body so the cleanup runs.
   */
  private getLLMGatewayModelFactory(
    extraBody: LLMGatewayExtraBody | undefined,
    onCost?: (data: LLMGatewayCostData) => void
  ): ReturnType<typeof createOpenAI>['chat'] | undefined {
    if (this.config.gateway === undefined) {
      return undefined;
    }
    return createOpenAI({
      baseURL: this.config.gateway.baseUrl,
      apiKey: this.config.gateway.apiKey,
      headers: this.config.gateway.headers,
      name: this.config.gateway.providerName ?? 'gateway',
      fetch: createLLMGatewayFetchWrapper(
        extraBody ?? {},
        globalThis.fetch,
        onCost
      ),
    }).chat;
  }

  private resolveGatewayModelName(provider: string, model: string): string {
    const gateway = this.config.gateway;
    if (!gateway) {
      return model;
    }

    if (this.isOpenRouterGateway()) {
      const openRouterModelName = getOpenRouterIdentifier(provider, model);
      if (openRouterModelName !== null && openRouterModelName !== '') {
        return openRouterModelName;
      }
    }

    // LLM Gateway accepts bare model names (no `provider/` prefix). Strip any
    // existing prefix so requests pass its validation regardless of how the
    // model was supplied. See https://llmgateway.io/migration/openrouter
    if (this.isLLMGateway()) {
      return model.startsWith(`${provider}/`)
        ? model.slice(provider.length + 1)
        : model;
    }

    const includeProviderInModelName =
      gateway.includeProviderInModelName ?? true;
    if (!includeProviderInModelName) {
      return model;
    }

    if (model.startsWith(`${provider}/`)) {
      return model;
    }

    return `${provider}/${model}`;
  }

  private extractModelSelectPayloadFromCompletionsPayload(
    body: CompletionsPayload
  ): ModelSelectPayload {
    const modelSelectBody = {} as ModelSelectPayload;

    // Get the keys from ModelSelectSchema
    const modelSelectKeys = Object.keys(
      ModelSelectSchema.shape
    ) as (keyof ModelSelectPayload)[];

    // Extract only the matching keys from CompletionsPayload
    modelSelectKeys.forEach(key => {
      if (key in body) {
        (modelSelectBody as Record<string, unknown>)[key] =
          body[key as keyof CompletionsPayload];
      }
    });

    return modelSelectBody;
  }

  private async selectBestModel(body: CompletionsPayload) {
    logger.info(
      `[IronlabsChatClient][selectBestModel] Models provided: ${
        body.models?.length || 0
      }, calling model-select endpoint`
    );
    try {
      const response = await this.ironaRouter.modelSelect(
        this.extractModelSelectPayloadFromCompletionsPayload(body)
      );

      // Handle errors from the model selection
      // Not using fallbacks here to remove duplicacy as they are added in model priority queue
      if (response.error !== null && response.error !== undefined) {
        logger.warn(
          `[IronlabsChatClient][selectBestModel][IronaML] Model selection error: ${JSON.stringify(
            response.error,
            null,
            2
          )}`
        );
        return { provider: null, model: null };
      }

      return response.providers[0];
    } catch (error) {
      logger.error(
        `[IronlabsChatClient][selectBestModel] Model selection error: ${
          (error as Error).message
        }`
      );
      return { provider: null, model: null };
    }
  }

  /**
   * Checks if a provider has a direct API key (programmatic config or env var).
   * Used to decide whether to bypass OpenRouter for file requests and route
   * directly through the native SDK, which supports a broader set of file types.
   */
  private hasDirectProviderKey(provider: string): boolean {
    const providerConf = this.config.providers?.[provider];
    if (providerConf?.apiKey !== undefined && providerConf.apiKey !== '') {
      return true;
    }
    const envKeyName = providerApiKeyName(provider);
    if (envKeyName === undefined) {
      return false;
    }
    const envVal = process.env[envKeyName];
    return envVal !== undefined && envVal !== '';
  }

  /**
   * Creates a custom provider SDK instance when programmatic config (apiKey/baseUrl)
   * is provided. This avoids mutating process.env — each provider gets its own
   * SDK instance with the key baked in.
   */
  private createCustomProviderInstance(provider: string) {
    const providerConf: ProviderConfig | undefined =
      this.config.providers?.[provider];
    if (providerConf === undefined) {
      return undefined;
    }

    const opts: { apiKey: string; baseURL?: string } = {
      apiKey: providerConf.apiKey,
    };
    if (providerConf.baseUrl !== undefined && providerConf.baseUrl !== '') {
      opts.baseURL = providerConf.baseUrl;
    }

    switch (provider) {
      case 'openai':
        return createOpenAI(opts);
      case 'anthropic':
        return createAnthropic(opts);
      case 'google':
        return createGoogleGenerativeAI(opts);
      case 'mistral':
        return createMistral(opts);
      case 'perplexity':
        return createPerplexity(opts);
      case 'togetherai':
        return createTogetherAI(opts);
      case 'xai':
        return createXai(opts);
      default:
        return undefined;
    }
  }

  private loadApiKeyForProvider(provider: string, model: string) {
    // Check programmatic config first
    const providerConf = this.config.providers?.[provider];
    if (providerConf?.apiKey !== undefined && providerConf.apiKey !== '') {
      return providerConf.apiKey;
    }
    // Fall back to env var
    const apiKeyName = providerApiKeyName(provider);
    const apiKey = process.env[apiKeyName];
    if (apiKey === undefined || apiKey === '') {
      throw new MissingApiKeyError(
        `The environment variable ${apiKeyName} is missing or empty. Please ensure that ${apiKeyName} is set in the environment variables for the ${provider}/${model} model.`
      );
    }
    return apiKey;
  }
}
