/* eslint-disable @typescript-eslint/no-explicit-any */
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  BaseMessage,
  AIMessageChunk,
} from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import axios from "axios";
import { ChatModelConfig } from "../types";

/**
 * Perplexity model for LangChain.
 */
export class ChatPerplexity extends SimpleChatModel {
  private apiKey: string;
  private model: string;

  constructor(chatModelConfig: ChatModelConfig) {
    super(chatModelConfig);
    const { apiKey, modelName, ...rest } = chatModelConfig;
    this.apiKey = apiKey;
    this.model = modelName;
  }

  _llmType(): string {
    return "perplexity";
  }

  async _call(messages: BaseMessage[]): Promise<any> {
    if (!messages.length) {
      throw new Error("No messages provided.");
    }
    // Pass `runManager?.getChild()` when invoking internal runnables to enable tracing
    // await subRunnable.invoke(params, runManager?.getChild());
    if (typeof messages[0].content !== "string") {
      throw new Error("Multimodal messages are not supported.");
    }
    try {
      const { data } = await axios.post<{
        choices: [{ message: { content: string } }];
      }>(
        "https://api.perplexity.ai/chat/completions",
        {
          model: this.model,
          messages: messages.map((m) => ({
            role: m.getType() === "human" ? "user" : m.getType(),
            content: m.content,
          })),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      return new AIMessage(data.choices[0].message.content);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Perplexity API error: ${error.response.statusText}`);
      }
      throw error;
    }
  }
  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    if (!messages.length) {
      throw new Error("No messages provided.");
    }
    // Pass `runManager?.getChild()` when invoking internal runnables to enable tracing
    // await subRunnable.invoke(params, runManager?.getChild());
    if (typeof messages[0].content !== "string") {
      throw new Error("Multimodal messages are not supported.");
    }
    try {
      const response = await axios.post(
        "https://api.perplexity.ai/chat/completions",
        {
          model: this.model,
          messages: messages.map((m) => ({
            role: m.getType() === "human" ? "user" : m.getType(),
            content: m.content,
          })),
          stream: true, // Conceptual flag for streaming response
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          responseType: "stream",
        }
      );

      let buffer = "";
      for await (const chunkBuffer of response.data) {
        // Accumulate the chunk buffer
        buffer += chunkBuffer.toString();

        // Split the buffer into separate chunks by line breaks
        const rawPayloads = buffer.split("\r\n");
        buffer = rawPayloads.pop() || ""; // Save any leftover data in the buffer

        // Process each chunk
        for (const rawPayload of rawPayloads) {
          if (rawPayload.includes("[DONE]")) {
            return; // End the stream once we hit the "[DONE]" marker
          }

          if (!rawPayload.trim() || !rawPayload.startsWith("data:")) {
            continue;
          }

          try {
            // Parse the JSON payload
            const payload = JSON.parse(rawPayload.replace("data: ", ""));
            const textChunk = payload?.choices?.[0]?.delta?.content ?? "";
            const finish_reason = payload?.choices?.[0]?.finish_reason;

            if (textChunk) {
              yield new ChatGenerationChunk({
                message: new AIMessageChunk({
                  content: textChunk,
                  usage_metadata: {
                    input_tokens: payload?.usage?.prompt_tokens,
                    output_tokens: payload?.usage?.completion_tokens,
                    total_tokens: payload?.usage?.total_tokens,
                  },
                  response_metadata: {
                    finish_reason: finish_reason,
                    finishReason: finish_reason,
                  },
                }),
                text: textChunk,
              });
            }
            await runManager?.handleLLMNewToken(textChunk);
          } catch (err) {
            // Handle any errors in JSON parsing (e.g., incomplete or malformed JSON)
            console.error("Failed to parse chunk:", rawPayload, err);
          }
        }
      }
    } catch (error) {
      console.error("Error in streaming generator:", error);
      throw error;
    }
  }
}