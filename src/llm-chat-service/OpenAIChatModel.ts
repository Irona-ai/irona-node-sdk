import { ChatOpenAI } from "@langchain/openai";
import { ChatModelConfig } from "../types";
/*
import { OpenAI } from "@langchain/openai";

const { ChatOpenAI } = require("@langchain/openai");
require("dotenv").config();
async function main() {
  const chat = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o-mini",
    temperature: 0,
  });
  //   const aiMsg = await chat.invoke([
  //     {
  //       role: "system",
  //       content:
  //         "You are a helpful assistant that translates English to French. Translate the user sentence.",
  //     },
  //     {
  //       role: "user",
  //       content: "I want you",
  //     },
  //   ]);
  //   console.log(aiMsg);
  //   console.log(aiMsg.content);

//   const stream = await chat.stream([["human", "Tell me a long story about bears."]]);

//   for await (const chunk of stream) {
//     console.log(chunk);
//   }


}

*/

export function OpenAIChatModel(chatModelConfig: ChatModelConfig){
    const chatModel = new ChatOpenAI(chatModelConfig);
    return chatModel;
}