"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UseAiToolsClient = void 0;
// src/UseAiToolsClient.ts
const ai_1 = require("ai");
const openai_1 = require("@ai-sdk/openai");
const core_1 = require("@composio/core");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ACCOUNTS_FILE = path_1.default.resolve(__dirname, "connectedAccounts.json");
class UseAiToolsClient {
    composio;
    constructor(apiKey) {
        if (!apiKey && !process.env.COMPOSIO_API_KEY) {
            throw new Error("Missing COMPOSIO_API_KEY in environment or constructor");
        }
        this.composio = new core_1.Composio({ apiKey: apiKey || process.env.COMPOSIO_API_KEY });
    }
    // Execute a toolkit action
    async execute(payload) {
        const { userId, provider, prompt } = payload;
        if (!userId || !provider || !prompt)
            throw new Error("Missing userId, provider, or prompt");
        const connectedAccounts = this.loadConnectedAccounts();
        const key = `${userId}_${provider}`;
        const connectedAccountId = connectedAccounts[key];
        if (!connectedAccountId)
            throw new Error(`${provider} not connected. Complete OAuth first.`);
        // Fetch toolkit actions
        const toolsArray = await this.composio.tools.get(userId, { toolkits: [provider.toUpperCase()] });
        const allActions = toolsArray.flatMap((tool) => tool.actions || []);
        const fallbackAction = "GMAIL_LIST_LABELS";
        if (!allActions || allActions.length === 0) {
            const response = await this.composio.tools.execute(fallbackAction, {
                userId,
                connectedAccountId,
                arguments: {},
            });
            return { action: fallbackAction, result: response, note: "Fallback used" };
        }
        // AI selects best action
        const aiAction = await (0, ai_1.generateText)({
            model: (0, openai_1.openai)("gpt-4o-mini"),
            messages: [
                { role: "system", content: `Available actions: ${allActions.join(", ")}. Respond ONLY with action name.` },
                { role: "user", content: prompt },
            ],
        });
        const actionName = aiAction.text.trim();
        if (!allActions.includes(actionName))
            throw new Error(`AI could not map prompt to valid action: ${actionName}`);
        // AI parses arguments
        let actionArgs = {};
        try {
            const aiArgs = await (0, ai_1.generateText)({
                model: (0, openai_1.openai)("gpt-4o-mini"),
                messages: [
                    { role: "system", content: `Convert user prompt into arguments for ${actionName}. Return valid JSON.` },
                    { role: "user", content: prompt },
                ],
            });
            actionArgs = JSON.parse(aiArgs.text.trim());
        }
        catch { }
        const response = await this.composio.tools.execute(actionName, {
            userId,
            connectedAccountId,
            arguments: actionArgs,
        });
        return { action: actionName, arguments: actionArgs, result: response };
    }
    // Initiate OAuth / API key flow (frontend sends only userId + provider)
    async initiateAuth(provider, userId) {
        const authConfigId = process.env[`COMPOSIO_${provider.toUpperCase()}_AUTH_CONFIG_ID`];
        if (!authConfigId)
            throw new Error(`Missing auth config ID for ${provider}`);
        // Redirect URL to handle callback
        const redirectUri = `${process.env.BASE_URL}/api/composio-callback?userId=${userId}&provider=${provider}`;
        const connRequest = await this.composio.connectedAccounts.initiate(userId, authConfigId, {
            callbackUrl: redirectUri,
        });
        return connRequest.redirectUrl;
    }
    // Handle OAuth callback
    async handleCallback(provider, connectionRequestId, userId) {
        const connectedAccount = await this.composio.connectedAccounts.waitForConnection(connectionRequestId);
        const connectedAccounts = this.loadConnectedAccounts();
        connectedAccounts[`${userId}_${provider}`] = connectedAccount.id;
        fs_1.default.writeFileSync(ACCOUNTS_FILE, JSON.stringify(connectedAccounts, null, 2));
        return connectedAccount;
    }
    loadConnectedAccounts() {
        try {
            if (fs_1.default.existsSync(ACCOUNTS_FILE)) {
                return JSON.parse(fs_1.default.readFileSync(ACCOUNTS_FILE, "utf-8"));
            }
        }
        catch (err) {
            console.error("❌ Error reading connectedAccounts.json:", err);
        }
        return {};
    }
}
exports.UseAiToolsClient = UseAiToolsClient;
