import { ChatPerplexity } from "./perplexity.ts";
export const foo = async () => {
  const model = new ChatPerplexity({
    apiKey: "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",
    modelName: "llama-3.1-sonar-large-128k-online",
    maxRetries: 5,
  });
  const stream = true;
  if (stream) {
    const response = await model.stream([
      { role: "human", content: "I am an LLM" },
    ]);
    let res = "";
    for await (const chunk of response) {
      console.log(chunk);
      res += chunk.content;
    }
    console.log(JSON.stringify(res, null, 2));
  } else {
    const response = await model.invoke([
      { role: "human", content: "I am an LLM" },
    ]);
    console.log(JSON.stringify(response.content, null, 2));
  }
}
