"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPdfModel = void 0;
const chat_models_1 = require("@langchain/core/language_models/chat_models");
const messages_1 = require("@langchain/core/messages");
const outputs_1 = require("@langchain/core/outputs");
const axios_1 = __importDefault(require("axios"));
const ai_1 = require("ai");
const openai_1 = require("@ai-sdk/openai");
/**
 * ChatPdf model for LangChain.
 */
class ChatPdfModel extends chat_models_1.SimpleChatModel {
    apiKey;
    model;
    constructor(chatModelConfig) {
        super(chatModelConfig);
        const { apiKey, modelName } = chatModelConfig;
        this.apiKey = apiKey;
        this.model = modelName;
    }
    _llmType() {
        return "chatpdf";
    }
    validateInputMessages(messages) {
        if (!messages.length) {
            throw new Error("No messages provided.");
        }
    }
    convertLangchainMessages(originalMessages) {
        return originalMessages.map((m) => {
            const type = m.getType();
            return {
                role: type === "human" ? "user" : type === "ai" ? "assistant" : type,
                content: m.content,
            };
        });
    }
    async fetchDocumentContent(contentItem) {
        try {
            return {
                type: "file",
                data: contentItem.source.url,
                mimeType: "application/pdf",
                filename: contentItem.filename || "document.pdf",
            };
        }
        catch (error) {
            console.error("Failed to fetch PDF:", error);
            throw new Error("Failed to fetch the document for processing.");
        }
    }
    async transformMessagesForCompletions(messages) {
        const formattedMessages = this.convertLangchainMessages(messages);
        return Promise.all(formattedMessages.map(async (message) => {
            let transformedContent = [];
            if (Array.isArray(message.content)) {
                transformedContent = await Promise.all(message.content.map(async (contentItem) => {
                    if (contentItem.type === "document")
                        return this.fetchDocumentContent(contentItem);
                    if (contentItem.type === "image_url")
                        return { type: "image", image: contentItem.image_url.url };
                    return { type: "text", text: contentItem.text };
                }));
            }
            return {
                role: message.role,
                content: message.role === "system"
                    ? JSON.stringify(transformedContent)
                    : transformedContent,
            };
        }));
    }
    parseLLMResponseToAIMessage(data) {
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
        throw new Error("Not implemented");
    }
    async *_streamResponseChunks(messages, _options, runManager) {
        this.validateInputMessages(messages);
        try {
            const finalMessages = await this.transformMessagesForCompletions(messages);
            //   const { textStream, usagePromise, responsePromise, finishReasonPromise } =
            // console.log("finalMessages", JSON.stringify(finalMessages, null, 2));
            try {
                const { textStream } = await (0, ai_1.streamText)({
                    model: (0, openai_1.openai)(this.model),
                    messages: finalMessages,
                });
                //   const finishReason = await finishReasonPromise;
                //   const usage = await usagePromise;
                //   const response = await responsePromise;
                for await (const streamedChunk of textStream) {
                    try {
                        yield new outputs_1.ChatGenerationChunk({
                            message: new messages_1.AIMessageChunk({
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
                    }
                    catch (error) {
                        console.error("Error in ChatPdf streaming generator:", error.message);
                        const message = error.message;
                        throw new Error(message);
                    }
                }
            }
            catch (error) {
                console.error("Error in completions:", error.message);
                const message = error.message;
                throw new Error(message);
            }
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response) {
                throw new Error(`Perplexity API error: ${error.response.statusText}`);
            }
            throw error;
        }
    }
}
exports.ChatPdfModel = ChatPdfModel;
