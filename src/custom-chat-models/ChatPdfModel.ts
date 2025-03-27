/* eslint-disable @typescript-eslint/no-explicit-any */
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
import {
  CoreAssistantMessage,
  CoreMessage,
  CoreSystemMessage,
  CoreUserMessage,
  streamText,
} from "ai";
import { openai } from "@ai-sdk/openai";
import {
  DocumentContentPayload,
  MessagePayload,
} from "@/schemas/common.schema";

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
    return "perplexity";
  }
  private validateInputMessages(messages: any[]): void {
    if (!messages.length) {
      throw new Error("No messages provided.");
    }
    messages.forEach((message) => {
      if (Array.isArray(message.content)) {
        const documentCount = message.content.filter(
          (item: any) => item.type === "document"
        ).length;
        if (documentCount > 1) {
          console.warn("Only the last PDF/document will be used for chat.");
        }
      }
    });
  }
  private convertLangchainMessages(originalMessages: any[]): MessagePayload[] {
    return originalMessages.map((m) => {
      const type = m.getType();
      return {
        role: type === "human" ? "user" : type === "ai" ? "assistant" : type,
        content: m.content,
      };
    });
  }
  private async transformMessagesForCompletions(
    messages: BaseMessage[]
  ): Promise<CoreMessage[]> {
    // Convert LangChain message objects to normal message format
    const formattedMessages = this.convertLangchainMessages(messages);

    const previousMessages = formattedMessages.slice(0, -1);
    const latestMessage = formattedMessages[messages.length - 1];

    if (
      !Array.isArray(latestMessage.content) ||
      latestMessage.content.length === 0
    ) {
      throw new Error("Last message content is missing or invalid.");
    }

    // Extract document details from the last message
    const pdfDocumentDetails = latestMessage.content[0] as DocumentContentPayload;

    let pdfFileBuffer: ArrayBuffer | null = null;

    try {
      const pdfResponse = await axios.get(pdfDocumentDetails.source.url, {
        responseType: "arraybuffer",
      });
      pdfFileBuffer = pdfResponse.data;
    } catch (error) {
      console.error("Failed to fetch PDF:", error);
      throw new Error("Failed to fetch the document for processing.");
    }

    const finalMessageContent = [
      {
        type: "file",
        data: pdfFileBuffer,
        mimeType: "application/pdf",
        filename: pdfDocumentDetails.filename || "document.pdf",
      },
      ...latestMessage.content.slice(1), // Append the rest of the content
    ];

    // Construct final messages
    const processedMessages = [
      ...previousMessages,
      { ...latestMessage, content: finalMessageContent },
    ];

    return processedMessages.map((message) => {
      if (message.role === "system") {
        return {
          role: "system",
          content: message.content,
        } as CoreSystemMessage;
      } else if (message.role === "user") {
        return { role: "user", content: message.content } as CoreUserMessage;
      } else {
        return {
          role: "assistant",
          content: message.content,
        } as CoreAssistantMessage;
      }
    });
  }

  private parseLLMResponseToAIMessage(data: any): AIMessageFields {
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

  async _call(messages: BaseMessage[]): Promise<any> {
    throw new Error("Not implemented");
  }
  async *_streamResponseChunks(
    messages: any[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    this.validateInputMessages(messages);
    try {
      const finalMessages: CoreMessage[] = await this.transformMessagesForCompletions(messages);
      //   const { textStream, usagePromise, responsePromise, finishReasonPromise } =
      try {
        const { textStream } = await streamText({
          model: openai("gpt-4o"),
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
            console.error(
              "Error in ChatPdf streaming generator:",
              (error as Error).message
            );
            const message = (error as Error).message;
            throw new Error(message);
          }
        }
      } catch (error) {
        console.error("Error in completions:", (error as Error).message);
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
