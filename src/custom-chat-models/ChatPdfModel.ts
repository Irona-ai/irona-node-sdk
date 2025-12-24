import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import {
  BaseMessage,
  AIMessageChunk,
  AIMessageFields,
} from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import axios from "axios";
import { ChatModelConfig } from "../types";
import { CoreMessage, FilePart, ImagePart, streamText, TextPart } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  DocumentContentPayload,
  MessagePayload,
} from "../schemas/common.schema";
import { logger } from "../utils/logger";

interface PerplexityResponse {
  id?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices: Array<{
    message: {
      content: string;
      role?: string;
    };
    finish_reason?: string;
  }>;
}

/**
 * ChatPdf model for LangChain.
 */
export class ChatPdfModel extends SimpleChatModel {
  private apiKey: string;
  private model: string;

  constructor(chatModelConfig: ChatModelConfig) {
    super(chatModelConfig);
    const { apiKey, modelName } = chatModelConfig;
    this.apiKey = apiKey;
    this.model = modelName;
  }

  _llmType(): string {
    return "chatpdf";
  }
  private validateInputMessages(messages: BaseMessage[]): void {
    if (!messages.length) {
      throw new Error("No messages provided.");
    }
  }
  private convertLangchainMessages(originalMessages: BaseMessage[]): MessagePayload[] {
    return originalMessages.map((m) => {
      const type = m.getType();
      return {
        role: type === "human" ? "user" : type === "ai" ? "assistant" : type,
        content: m.content,
      };
    });
  }
  private async fetchDocumentContent(
    contentItem: DocumentContentPayload
  ): Promise<FilePart> {
    try {
      return {
        type: "file",
        data: contentItem.source.url,
        mediaType: "application/pdf",
        filename: contentItem.filename || "document.pdf",
      };
    } catch (error) {
      logger.error(`Failed to fetch PDF: ${error}`);
      throw new Error("Failed to fetch the document for processing.");
    }
  }

  private async transformMessagesForCompletions(
    messages: BaseMessage[]
  ): Promise<CoreMessage[]> {
    const formattedMessages = this.convertLangchainMessages(messages);

    return Promise.all(
      formattedMessages.map(async (message) => {
        let transformedContent: (TextPart | ImagePart | FilePart)[] = [];

        if (Array.isArray(message.content)) {
          transformedContent = await Promise.all(
            message.content.map(async (contentItem) => {
              if (contentItem.type === "document")
                return this.fetchDocumentContent(contentItem);
              if (contentItem.type === "image_url")
                return { type: "image", image: contentItem.image_url.url } as ImagePart;
              if (contentItem.type === "text" || contentItem.type === "reasoning")
                return { type: "text", text: contentItem.text } as TextPart;
              return { type: "text", text: "" } as TextPart;
            })
          );
        }

        return {
          role: message.role,
          content:
            message.role === "system"
              ? JSON.stringify(transformedContent)
              : transformedContent,
        } as CoreMessage;
      })
    );
  }

  private parseLLMResponseToAIMessage(data: PerplexityResponse): AIMessageFields {
    return {
      id: data?.id,
      usage_metadata: {
        input_tokens: data?.usage?.prompt_tokens,
        output_tokens: data?.usage?.completion_tokens,
        total_tokens: data?.usage?.total_tokens,
      },
      content: data.choices[0]?.message?.content || "",
      additional_kwargs: { ...data },
      response_metadata: {
        finish_reason: data?.choices?.[0]?.finish_reason,
      },
    };
  }

  async _call(_messages: BaseMessage[]): Promise<string> {
    throw new Error("Not implemented");
  }
  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    this.validateInputMessages(messages);
    try {
      const finalMessages: CoreMessage[] =
        await this.transformMessagesForCompletions(messages);
      //   const { textStream, usagePromise, responsePromise, finishReasonPromise } =


      try {
        const { textStream } = await streamText({
          model: openai(this.model),
          messages: finalMessages,
        });
        //   const finishReason = await finishReasonPromise;
        //   const usage = await usagePromise;
        //   const response = await responsePromise;

        for await (const streamedChunk of textStream) {
          try {
            yield new ChatGenerationChunk({
              message: new AIMessageChunk({
                //   id: response?.id,
                content: streamedChunk,
                //   usage_metadata: {
                //     input_tokens: usage?.promptTokens,
                //     output_tokens: usage?.completionTokens,
                //     total_tokens: usage?.totalTokens,
                //   },
                //   response_metadata: {
                //     finish_reason: finishReason?.status?.value,
                //     finishReason: finishReason?.status?.value,
                //   },
              }),
              text: streamedChunk,
            });
            await runManager?.handleLLMNewToken(streamedChunk);
          } catch (error) {
            logger.error(
              `Error in ChatPdf streaming generator: ${(error as Error).message}`
            );
            const message = (error as Error).message;
            throw new Error(message);
          }
        }
      } catch (error) {
        logger.error(`Error in completions: ${(error as Error).message}`);
        const message = (error as Error).message;
        throw new Error(message);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Perplexity API error: ${error.response.statusText}`);
      }
      throw error;
    }
  }
}
