
# IronaAI Node SDK (Setup Guide)

This SDK helps you easily access IronaAI's model-routing API using JavaScript or TypeScript.  
It chooses the best AI model based on **cost**, **latency**, or **performance** for your specific use case.

---

## 🔧 Installation & Setup

### Step 1: Open VS Code Terminal  
Use the shortcut:  
```bash
Ctrl + Shift + `
```

### Step 2: Clone the Repository  
Run the following command in the terminal:  
```bash
git clone https://github.com/Irona-ai/irona-node-sdk.git

cd irona-node-sdk
```

### Step 3: Navigate to the Example Folder  
You can do this either by:

- Opening `example` folder via:  
  `File > Open Folder > example`

**OR**

- Running this command:  
```bash
cd example
```

---

## 🌐 API Key Setup

1. Inside the `example` folder, create a new file named `.env`  
2. Paste the following keys (replace with your actual API keys):

```env
IRONAAI_API_KEY='your_irona_api_key'
OPENAI_API_KEY='your_openai_api_key'
TOGETHER_API_KEY='your_together_api_key'
REPLICATE_API_KEY='your_replicate_api_key'
ANTHROPIC_API_KEY='your_anthropic_api_key'
GOOGLE_API_KEY='your_google_api_key'
MISTRAL_API_KEY='your_mistral_api_key'
```

> Generate your keys from:
> - [IronaAI](https://app.irona.ai)  
> - [OpenAI](https://openai.com/api)  
> - [TogetherAI](https://api.together.ai)  
> - [Replicate](https://replicate.com)  
> - [Anthropic](https://anthropic.com)  
> - [Google AI](https://ai.google.dev/)  
> - [Mistral](https://console.mistral.ai/)

---

## 🧪 Testing the SDK

### Step 4: Check Node.js Installation  
```bash
node -v
```

If Node.js is not installed, download it from [Node.js official site](https://nodejs.org)

### Step 5: Install Dependencies  
```bash
npm i 
or 
npm install
```

### Step 6: Run the Example  
Navigate to the `example` folder and run:  
```bash
node basicExample.js
```
## Running Tests

### Unit Tests
We use Vitest for our testing framework. To run tests:

```bash
# Run specific test file
npx vitest src/tests/unit/FucntionCallingStrucuredOutput.test.ts
npx vitest src/tests/unit/getChatModel.test.ts
npx vitest src/tests/E2E/FCSOgetchatModel.test.ts
# Run all tests
npx vitest
---
```

## 📘 Key Concepts

- **models**: List of AI providers and models to choose from.  
- **tradeoff**: Optimization target, such as `'cost'`, `'latency'`, or `'performance'`.

---

## ❗ Error Handling

The SDK returns **typed responses**.  
If there’s an error, the response will contain an `error` property with the message.  
Make sure to check this in your code.

> The SDK also picks up pricing info from an env variable: `SUPPORTED_MODELS_URL` (if set).

---

## 📩 Support

For issues or questions, please:
- Open an issue on GitHub: [IronaAI GitHub](https://github.com/Irona-ai/irona-node-sdk)
- Or email: **support@irona.ai**

---

## 📄 License

Released under the **MIT License**.
