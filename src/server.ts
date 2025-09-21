import express, { Request, Response } from "express";
import { IronaAI } from "./index";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create IronaAI instance
let irona: IronaAI;

(async () => {
  try {
    irona = await IronaAI.createInstance({
      apiKey: process.env.IRONAAI_API_KEY,
    });
    console.log("✅ IronaAI initialized");
  } catch (err) {
    console.error("❌ Failed to initialize IronaAI:", err);
  }
})();

// -------------------- ROUTES -------------------- //

// Initiate OAuth authentication
app.post("/api/initiate-auth", async (req: Request, res: Response) => {
  try {
    const { userId, provider } = req.body;
    if (!userId || !provider) {
      res.status(400).json({ error: "Missing userId or provider" });
      return;
    }

    const authUrl = await irona.tools.initiateAuth(provider, userId);
    res.json({ authUrl });
  } catch (err: any) {
    console.error("❌ Initiate Auth Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// OAuth callback
app.get("/api/composio-callback", async (req: Request, res: Response) => {
  try {
    const { userId, provider, connectedAccountId } = req.query;

    if (
      !userId || !provider || !connectedAccountId ||
      typeof userId !== "string" || typeof provider !== "string" || typeof connectedAccountId !== "string"
    ) {
      res.status(400).json({ error: "Missing or invalid query params" });
      return;
    }

    const connectedAccount = await irona.tools.handleCallback(provider, connectedAccountId, userId);

    res.json({ success: true, connectedAccount });
  } catch (err: any) {
    console.error("❌ OAuth Callback Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Execute a Composio toolkit action
app.post("/api/execute-tool", async (req: Request, res: Response) => {
  try {
    const { userId, provider, prompt } = req.body;

    if (!userId || !provider || !prompt) {
      res.status(400).json({ error: "Missing userId, provider, or prompt" });
      return;
    }

    const result = await irona.tools.execute({ userId, provider, prompt });
    res.json({ result });
  } catch (err: any) {
    console.error("❌ Execute Tool Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
