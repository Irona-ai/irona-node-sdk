"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const IronaAI_1 = __importDefault(require("./IronaAI"));
const logger_1 = require("./utils/logger");
require("dotenv").config();
const body = {
    messages: [
        { role: "system", content: "You are a world class software developer." },
        { role: "assistant", content: "How can I help you today?" },
        { role: "user", content: "there?" },
    ],
    llm_providers: [
        {
            provider: "openai",
            model: "gpt-4-1106-preview",
        },
        {
            provider: "openai",
            model: "gpt-4-turbo",
        },
        {
            provider: "anthropic",
            model: "claude-3-opus-20240229",
        },
        {
            provider: "togetherai",
            model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
        },
    ],
};
(async () => {
    const apiKey = process.env.IRONAAI_API_KEY;
    if (!apiKey) {
        throw new Error("IRONAAI_API_KEY is not set in the environment variables.");
    }
    const sdkClient = new IronaAI_1.default({ apiKey });
    // try {
    //   // Select a model
    //   const modelResponse = await sdkClient.modelSelect(body);
    //   console.log("Model selected:", JSON.stringify(modelResponse.data));
    // } catch (error) {
    //   console.error("Error in SDK usage:", error);
    // }
    const openAI = "openai/gpt-3.5-turbo";
    const togetherAI = "togetherai/mistralai/Mixtral-8x7B-Instruct-v0.1";
    const anthropicAI = "anthropic/claude-3-haiku";
    const mistralAI = "mistralai/mistral-large-latest";
    const googleGenAI = "google-genai/gemini-1.5-flash";
    try {
        const data = {
            model: googleGenAI,
            messages: body.messages,
            temperature: 0.7,
            maxTokens: 20,
            stream: true,
        };
        const chatResponse = await sdkClient.completions(
        //   process.env.OPENAI_API_KEY as string,
        // process.env.TOGETHER_API_KEY as string,
        //   process.env.ANTHROPIC_API_KEY as string,
        //  process.env.MISTRAL_API_KEY as string,
        process.env.GOOGLE_API_KEY, data);
        try {
            for await (const chunk of chatResponse) {
                logger_1.logger.info(JSON.stringify(chunk, null, 2));
            }
        }
        catch (error) { }
        logger_1.logger.info("Chat Response:\n" + JSON.stringify(chatResponse, null, 2));
    }
    catch (error) {
        console.error("Error in SDK Completion usage:", error);
    }
})();
