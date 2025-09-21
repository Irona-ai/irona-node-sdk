"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
// import cors from "cors";
const index_1 = require("./index"); // updated IronaAI class
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middlewares
// app.use(cors());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Create IronaAI instance
let irona;
(async () => {
    try {
        irona = await index_1.IronaAI.createInstance({
            apiKey: process.env.IRONAAI_API_KEY,
        });
        console.log("✅ IronaAI initialized");
    }
    catch (err) {
        console.error("❌ Failed to initialize IronaAI:", err);
    }
})();
// -------------------- ROUTES -------------------- //
// Initiate OAuth authentication (frontend sends only userId + provider)
app.post("/api/initiate-auth", async (req, res) => {
    try {
        const { userId, provider } = req.body;
        if (!userId || !provider) {
            res.status(400).json({ error: "Missing userId or provider" });
            return;
        }
        const authUrl = await irona.tools.initiateAuth(provider, userId);
        res.json({ authUrl });
    }
    catch (err) {
        console.error("❌ Initiate Auth Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Handle OAuth callback (Composio redirect)
app.get("/api/composio-callback", async (req, res) => {
    try {
        const { userId, provider, connectionRequestId } = req.query;
        if (!userId ||
            !provider ||
            !connectionRequestId ||
            typeof userId !== "string" ||
            typeof provider !== "string" ||
            typeof connectionRequestId !== "string") {
            res.status(400).json({ error: "Missing or invalid query params" });
            return;
        }
        const connectedAccount = await irona.tools.handleCallback(provider, connectionRequestId, userId);
        res.json({
            success: true,
            connectedAccount,
        });
    }
    catch (err) {
        console.error("❌ OAuth Callback Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Execute a Composio toolkit action
app.post("/api/execute-tool", async (req, res) => {
    try {
        const { userId, provider, prompt } = req.body;
        if (!userId || !provider || !prompt) {
            res.status(400).json({ error: "Missing userId, provider, or prompt" });
            return;
        }
        const result = await irona.tools.execute({ userId, provider, prompt });
        res.json({ result });
    }
    catch (err) {
        console.error("❌ Execute Tool Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Test route
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
