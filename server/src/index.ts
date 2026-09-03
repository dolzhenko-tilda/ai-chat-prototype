import express from "express";
import cors from "cors";
import { env } from "./env.js";
import "./db/index.js"; // ensures schema is created before anything else runs
import { initRouter } from "./routes/init.js";
import { messagesRouter } from "./routes/messages.js";
import { reconcileStaleGenerationsOnStartup } from "./services/startup.js";
import { sendError } from "./utils/response.js";

reconcileStaleGenerationsOnStartup();

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/v1", initRouter);
app.use("/api/v1/messages", messagesRouter);

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
    sendError(res, 500, message);
  }
);

app.listen(env.port, () => {
  console.log(`ai-chat-prototype server listening on http://localhost:${env.port}`);
  console.log(`LLM base URL: ${env.llmBaseUrl} (model: ${env.llmModelId})`);
});
