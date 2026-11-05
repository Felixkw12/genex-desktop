/**
 * A real HTTP server speaking the part of Opper's API the engine uses: the key check (`/v3/me`), the
 * OpenAI-compatible model list (`/v3/compat/models`, which answers only to a key) and the
 * `chat/completions` SSE stream. pi-ai does real HTTP and SSE against it, so the engine's provider
 * wiring, key handling and failure mapping are exercised for real, with no network and no account.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type FakeReply, writeChatCompletion } from "./fake-ollama.ts";

/** A key this server accepts. */
export const GOOD_KEY = "op-test-0123456789abcdef0123456789abcdef";

export interface FakeOpperOptions {
  /** The model list's `data`. */
  models?: unknown[];
  /** Replace the whole `/compat/models` answer: a status and a raw body. */
  catalog?: { status: number; body: string };
  /** Keys the server accepts; any other is refused with 401. */
  keys?: string[];
  /** The status `/me` answers for an accepted key (an outage: 503). */
  keyStatus?: number;
  replies?: FakeReply[];
}

export interface FakeOpper {
  baseUrl: string;
  requests: Array<{ path: string; body: unknown; authorization: string | undefined }>;
  close: () => Promise<void>;
}

/**
 * Two models that call tools (a pool that sees and thinks, a catalog row that does neither), one
 * that cannot call tools, an embedding model and a routing graph.
 */
export const CATALOG = [
  {
    id: "claude-sonnet-4-6",
    object: "model",
    context_length: 200_000,
    architecture: { modality: "text+image->text", input_modalities: ["text", "image"], output_modalities: ["text"] },
    pricing: { prompt: "0.000003", completion: "0.000015" },
    opper: {
      kind: "pool",
      type: "llm",
      display_name: "Claude Sonnet 4.6",
      capabilities: ["text", "tools", "vision", "structured_output", "reasoning"],
      max_output_tokens: 64_000,
      reasoning: { supported: ["none", "low", "medium", "high"] },
    },
  },
  {
    id: "vendor/free-coder",
    object: "model",
    context_length: 40_000,
    architecture: { modality: "text->text", input_modalities: ["text"], output_modalities: ["text"] },
    pricing: { prompt: "0", completion: "0" },
    opper: { kind: "model", type: "llm", display_name: "Free Coder", capabilities: ["text", "tools"] },
  },
  {
    id: "vendor/chat-only",
    object: "model",
    context_length: 8_192,
    pricing: { prompt: "0.000001", completion: "0.000001" },
    opper: { kind: "model", type: "llm", capabilities: ["text"] },
  },
  {
    id: "vendor/embedder",
    object: "model",
    context_length: 8_192,
    pricing: { prompt: "0.0000001", completion: "0" },
    opper: { kind: "model", type: "embedding", capabilities: ["text", "tools"] },
  },
  {
    id: "dynamic/my-router",
    object: "model",
    context_length: 100_000,
    opper: { kind: "dynamic_route", capabilities: ["text", "tools"] },
  },
];

export async function startFakeOpper(options: FakeOpperOptions = {}): Promise<FakeOpper> {
  const keys = options.keys ?? [GOOD_KEY];
  const replies = [...(options.replies ?? [])];
  const requests: FakeOpper["requests"] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      const url = req.url ?? "/";
      requests.push({ path: url, body, authorization: req.headers.authorization });
      const json = (value: unknown, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      const keyGiven = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      if (!keys.includes(keyGiven)) return json({ error: { message: "invalid API key", code: 401 } }, 401);
      if (url === "/v3/me") return json({ organization: { name: "Test" }, blocked: false }, options.keyStatus ?? 200);
      if (url.startsWith("/v3/compat/models")) {
        if (options.catalog) {
          res.writeHead(options.catalog.status, { "content-type": "application/json" });
          return res.end(options.catalog.body);
        }
        return json({ object: "list", data: options.models ?? CATALOG });
      }
      if (url.startsWith("/v3/compat/chat/completions"))
        return writeChatCompletion(res, body, replies.shift() ?? { text: "ok" });
      json({ error: `unhandled ${url}` }, 404);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v3`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
