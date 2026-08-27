import express from "express";
import cors from "cors";
import { env } from "./env.js";
import "./db/index.js"; // ensures schema is created before anything else runs
import { chatsRouter } from "./routes/chats.js";
import { reconcileStaleGenerationsOnStartup } from "./services/startup.js";

reconcileStaleGenerationsOnStartup();

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/chats", chatsRouter);

// Centralized error handler: turns unexpected exceptions into a 4xx/5xx JSON
// body instead of an opaque connection drop (see spec section 8: edge cases).
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    console.error("[unhandled]", err);
    if (res.headersSent) return;
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
);

app.listen(env.port, () => {
  console.log(`ai-chat-prototype server listening on http://localhost:${env.port}`);
  console.log(`LLM base URL: ${env.llmBaseUrl} (model: ${env.llmModelId})`);
});
