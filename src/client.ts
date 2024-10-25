import IronaAI from "./IronaAI";
const body = {
  "messages": [
        {"role": "system", "content": "You are a world class software developer."},
        {"role": "assistant", "content": "How can I help you today?"},
        {"role": "user", "content": "Write a merge sort in python"}
  ],
  "llm_providers": [
    {
      "provider": "openai",
      "model": "gpt-4-1106-preview"
    },
    {
        "provider": "openai",
        "model": "gpt-4-turbo"
    },
    {
      "provider": "anthropic",
      "model": "claude-3-opus-20240229"
    }
  ]
};

(async () => {
    const apiKey = process.env.IRONAAI_API_KEY;
    console.log(apiKey);

    if (!apiKey) {
        throw new Error("IRONAAI_API_KEY is not set in the environment variables.");
    }
    const sdkClient = new IronaAI({apiKey});

    try {
        // Select a model
        const modelResponse = await sdkClient.modelSelect(body);
        console.log("Model selected:", JSON.stringify(modelResponse.data));

        // Generate a completion based on the selected model
        // const completion = await sdkClient.completions("Hello, world!", modelResponse.model);
        // console.log("Generated completion:", completion);
    } catch (error) {
        console.error("Error in SDK usage:", error);
    }
})();
