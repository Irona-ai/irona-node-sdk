// src/UseAiToolsClient.ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import fs from "fs";
import path from "path";

const ACCOUNTS_FILE = path.resolve(__dirname, "connectedAccounts.json");

export interface UseAiToolsPayload {
  userId: string;
  provider: string;
  prompt: string;
}

export class UseAiToolsClient {
  private composio: Composio;

  constructor(apiKey?: string) {
    if (!apiKey && !process.env.COMPOSIO_API_KEY) {
      throw new Error("Missing COMPOSIO_API_KEY in environment or constructor");
    }
    this.composio = new Composio({ apiKey: apiKey || process.env.COMPOSIO_API_KEY! });
  }

  // Execute a toolkit action with debug logging
  public async execute(payload: UseAiToolsPayload) {
    const { userId, provider, prompt } = payload;
    console.log("🚀 Execute called with:", payload);

    if (!userId || !provider || !prompt) throw new Error("Missing userId, provider, or prompt");

    const connectedAccounts = this.loadConnectedAccounts();
    const key = `${userId}_${provider}`;
    const connectedAccountId = connectedAccounts[key];
    if (!connectedAccountId) {
      console.error(`❌ Provider not connected: ${provider}`);
      throw new Error(`${provider} not connected. Complete OAuth first.`);
    }

    // 1️⃣ Fetch toolkit actions dynamically
    console.log(`🔎 Fetching toolkit actions for provider: ${provider}`);
    const toolsArray = await this.composio.tools.get(userId, { toolkits: [provider.toUpperCase()] });
    console.log("📦 Tools array fetched:", JSON.stringify(toolsArray, null, 2));

    const allActions: string[] = toolsArray.flatMap((tool: any) => tool.actions || []);
    console.log("📋 All available actions:", allActions);

    const fallbackAction = "GMAIL_LIST_MESSAGES";

    if (!allActions || allActions.length === 0) {
      console.warn(`⚠️ No actions found for ${provider}. Using fallback: ${fallbackAction}`);
      const response = await this.composio.tools.execute(fallbackAction, {
        userId,
        connectedAccountId,
        arguments: {},
      });
      console.log("✅ Fallback executed, result:", response);
      return { action: fallbackAction, result: response, note: "Fallback used" };
    }

    // 2️⃣ Ask AI to select the best action
    console.log("🤖 Asking AI to select the best action from available actions...");
    const aiAction = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content: `You are an assistant that selects the best toolkit action. Available actions: ${allActions.join(
            ", "
          )}. Respond ONLY with the exact action name.`,
        },
        { role: "user", content: prompt },
      ],
    });

    const aiActionRaw = aiAction.text.trim();
    console.log("🤖 AI raw action output:", aiActionRaw);

    // Case-insensitive match with available actions
    const actionName = allActions.find((a) => a.toLowerCase() === aiActionRaw.toLowerCase());

    if (!actionName) {
      console.warn("⚠️ AI action not recognized. Falling back:", aiActionRaw);
      const response = await this.composio.tools.execute(fallbackAction, {
        userId,
        connectedAccountId,
        arguments: {},
      });
      console.log("✅ Fallback executed, result:", response);
      return { action: fallbackAction, result: response, note: "Fallback used" };
    }

    // 3️⃣ Ask AI to generate arguments for the selected action
    console.log(`🤖 Generating arguments for action: ${actionName}`);
    let actionArgs: any = {};
    try {
      const aiArgs = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content: `You are an assistant that converts a user prompt into arguments for the toolkit action ${actionName}. 
Return only a valid JSON object with keys matching the action's expected arguments.`,
          },
          { role: "user", content: prompt },
        ],
      });
      console.log("📝 AI arguments raw output:", aiArgs.text);
      actionArgs = JSON.parse(aiArgs.text.trim());
    } catch (err) {
      console.warn("⚠️ Failed to parse AI arguments, using empty object. Error:", err);
      actionArgs = {};
    }

    // 4️⃣ Execute the selected action
    console.log(`⚡ Executing action: ${actionName} with arguments:`, actionArgs);
    const response = await this.composio.tools.execute(actionName, {
      userId,
      connectedAccountId,
      arguments: actionArgs,
    });
    console.log("✅ Action executed successfully, result:", response);

    return { action: actionName, arguments: actionArgs, result: response };
  }

  // Initiate OAuth / API key flow
  public async initiateAuth(provider: string, userId: string) {
    console.log(`🔑 Initiating OAuth for provider: ${provider}`);
    const authConfigId = process.env[`COMPOSIO_${provider.toUpperCase()}_AUTH_CONFIG_ID`];
    if (!authConfigId) throw new Error(`Missing auth config ID for ${provider}`);

    const redirectUri = `${process.env.BASE_URL}/api/composio-callback?userId=${userId}&provider=${provider}`;

    const connRequest = await this.composio.connectedAccounts.initiate(userId, authConfigId, {
      callbackUrl: redirectUri,
    });

    console.log("🔗 OAuth redirect URL:", connRequest.redirectUrl);
    return connRequest.redirectUrl;
  }

  // Handle OAuth callback
  public async handleCallback(provider: string, connectedAccountId: string, userId: string) {
    console.log(`🔄 Handling OAuth callback for ${provider}, connectedAccountId: ${connectedAccountId}`);
    if (!connectedAccountId) throw new Error("Missing connectedAccountId");

    const connectedAccounts = this.loadConnectedAccounts();
    connectedAccounts[`${userId}_${provider}`] = connectedAccountId;
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(connectedAccounts, null, 2));

    console.log("✅ Connected account saved successfully");
    return { id: connectedAccountId, status: "connected" };
  }

  // Load stored connected accounts
  private loadConnectedAccounts(): Record<string, string> {
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        const data = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
        console.log("📂 Loaded connected accounts:", data);
        return JSON.parse(data);
      }
    } catch (err) {
      console.error("❌ Error reading connectedAccounts.json:", err);
    }
    return {};
  }
}
