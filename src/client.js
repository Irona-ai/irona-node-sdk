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
        // { role: "system", content: "You are a world class software developer." },
        // { role: "assistant", content: "How can I help you today?" },
        { role: "user", content: "write a 100 words story" },
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
    ],
};
(async () => {
    const apiKey = process.env.IRONAAI_API_KEY;
    console.log(apiKey);
    if (!apiKey) {
        throw new Error("IRONAAI_API_KEY is not set in the environment variables.");
    }
    const sdkClient = new IronaAI_1.default({ apiKey });
    // try {
    //     // Select a model
    //     const modelResponse = await sdkClient.modelSelect(body);
    //     console.log("Model selected:", JSON.stringify(modelResponse.data));
    // } catch (error) {
    //     console.error("Error in SDK usage:", error);
    // }
    try {
        const data = {
            model: "openai/gpt-3.5-turbo",
            messages: body.messages,
            temperature: 0.7,
            stream: true,
        };
        const chatResponse = await sdkClient.completions(process.env.OPENAI_API_KEY, data);
        for await (const chunk of chatResponse) {
            logger_1.logger.info(JSON.stringify(chunk, null, 2));
        }
        logger_1.logger.info("Chat Response:\n" + JSON.stringify(chatResponse, null, 2));
    }
    catch (error) {
        console.error("Error in SDK Completion usage:", error);
    }
})();
