"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPerplexity = void 0;
const chat_models_1 = require("@langchain/core/language_models/chat_models");
const messages_1 = require("@langchain/core/messages");
const outputs_1 = require("@langchain/core/outputs");
const axios_1 = __importDefault(require("axios"));
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
/**
 * Perplexity model for LangChain.
 */
class ChatPerplexity extends chat_models_1.SimpleChatModel {
    apiKey;
    model;
    constructor(chatModelConfig) {
        super(chatModelConfig);
        const { apiKey, modelName } = chatModelConfig;
        this.apiKey = apiKey;
        this.model = modelName;
    }
    _llmType() {
        return "perplexity";
    }
    validateMessages(messages) {
        if (!messages.length) {
            throw new Error("No messages provided.");
        }
        for (const message of messages) {
            // Pass `runManager?.getChild()` when invoking internal runnables to enable tracing
            // await subRunnable.invoke(params, runManager?.getChild());
            if (typeof message.content !== "string") {
                throw new Error("Multimodal messages are not supported.");
            }
        }
    }
    mapResponseToAIMessage(data) {
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
    async _call(messages) {
        this.validateMessages(messages);
        try {
            const { data } = await axios_1.default.post(PERPLEXITY_URL, {
                model: this.model,
                messages: messages.map((m) => ({
                    role: m.getType() === "human" ? "user" : m.getType(),
                    content: m.content,
                })),
            }, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });
            const aiMessageFields = this.mapResponseToAIMessage(data);
            return new messages_1.AIMessage(aiMessageFields);
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response) {
                throw new Error(`Perplexity API error: ${error.response.statusText}`);
            }
            throw error;
        }
    }
    async *_streamResponseChunks(messages, _options, runManager) {
        this.validateMessages(messages);
        try {
            const response = await axios_1.default.post(PERPLEXITY_URL, {
                model: this.model,
                messages: messages.map((m) => {
                    const type = m.getType();
                    return {
                        role: type === "human" ? "user" : type === "ai" ? "assistant" : type,
                        content: m.content,
                    };
                }),
                stream: true, // Conceptual flag for streaming response
            }, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
                responseType: "stream",
            });
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
                            yield new outputs_1.ChatGenerationChunk({
                                message: new messages_1.AIMessageChunk({
                                    id: payload?.id,
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
                                    additional_kwargs: {
                                        citations: payload?.citations,
                                    },
                                }),
                                text: textChunk,
                            });
                        }
                        await runManager?.handleLLMNewToken(textChunk);
                    }
                    catch (err) {
                        // Handle any errors in JSON parsing (e.g., incomplete or malformed JSON)
                        console.error("Failed to parse chunk:", rawPayload, err);
                    }
                }
            }
        }
        catch (error) {
            console.error("Error in Perplexity streaming generator:", error.message);
            const message = error.message;
            throw new Error(message);
        }
    }
}
exports.ChatPerplexity = ChatPerplexity;
