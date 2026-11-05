/**
 * Opper: a metered API engine on the studio's own pi-ai loop, its key kept in the secret store.
 *
 * Runs pi-ai against a real local HTTP server (`helpers/fake-opper.ts`), so the provider wiring, the
 * key in the Authorization header, streaming, tool calls, usage and every failure's mapping are
 * exercised for real, with no network and no account.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { after, describe, it } from "node:test";
import { EngineRegistry } from "../../src/substrate/engines/registry.ts";
import { OpperEngine, cleanApiKey, opperModels } from "../../src/substrate/engines/opper.ts";
import { EngineError } from "../../src/substrate/engines/types.ts";
import { memoryKeyStore, type ApiKeyStore } from "../../src/substrate/provider-keys.ts";
import { SecretStorageUnavailableError } from "../../src/substrate/secrets.ts";
import { SecretStorageIssue } from "../../src/shared/secret-storage.ts";
import { CATALOG, GOOD_KEY, startFakeOpper, type FakeOpper } from "../helpers/fake-opper.ts";
import type { FakeReply } from "../helpers/fake-ollama.ts";
import { tmpDir } from "../helpers/tmp.ts";

const servers: FakeOpper[] = [];
after(async () => {
  await Promise.all(servers.map((server) => server.close()));
});

async function fake(options?: Parameters<typeof startFakeOpper>[0]): Promise<FakeOpper> {
  const server = await startFakeOpper(options);
  servers.push(server);
  return server;
}

async function engineFor(server: FakeOpper, keys: ApiKeyStore = memoryKeyStore(GOOD_KEY)) {
  const root = await tmpDir("opper-");
  return new OpperEngine({ root: path.join(root, "engine"), keys, baseUrl: server.baseUrl });
}

const SONNET = "claude-sonnet-4-6";
const CODER = "vendor/free-coder";
const COMPLETIONS = "/v3/compat/chat/completions";

/** A model row that calls tools, with the given reasoning efforts. */
const thinker = (id: string, supported?: string[]) => ({
  id,
  opper: { type: "llm", capabilities: ["text", "tools"], ...(supported ? { reasoning: { supported } } : {}) },
});

describe("Opper's catalog", () => {
  it("lists only models that call tools, with their context, reply cap, vision, thinking and price", () => {
    const rows = opperModels({ data: CATALOG });
    assert.deepEqual(
      rows.map((row) => row.id),
      [SONNET, CODER],
      "a model without tool calling, an embedding model and a routing graph cannot run the studio's loop",
    );
    const [sonnet, coder] = rows;
    assert.equal(sonnet?.label, "Claude Sonnet 4.6", "the name Opper shows");
    assert.equal(sonnet?.contextWindow, 200_000);
    assert.equal(sonnet?.maxTokens, 32_768, "the reply cap is the studio's, under the provider's own");
    assert.equal(sonnet?.supportsVision, true);
    assert.equal(sonnet?.supportsThinking, true);
    assert.deepEqual(sonnet?.efforts, ["low", "medium", "high"]);
    assert.equal(sonnet?.defaultEffort, "low");
    assert.equal(sonnet?.note, "$3.00 in / $15.00 out per M tokens");
    assert.equal(coder?.maxTokens, 10_000, "a quarter of a small context");
    assert.equal(coder?.supportsVision, false);
    assert.equal(coder?.efforts, undefined, "a model that does not think has no dial");
    assert.equal(coder?.note, "Free");
  });

  it("offers only the efforts a model accepts, and names it by its id when the list gives no name", () => {
    const [high, none, unsaid] = opperModels({
      data: [thinker("high-only", ["high", "xhigh"]), thinker("no-dial", []), thinker("unsaid")],
    });
    assert.deepEqual(high?.efforts, ["high"]);
    assert.equal(high?.defaultEffort, "high", "low is not offered, so the one it accepts");
    assert.equal(high?.label, "high-only");
    for (const row of [none, unsaid]) {
      assert.equal(row?.supportsThinking, false, row?.id);
      assert.equal(row?.efforts, undefined, row?.id);
    }
    assert.equal(unsaid?.note, undefined, "no price is shown when the list quotes none");
  });

  it("leaves out models that answer with images or audio, though they call tools", () => {
    const entry = (id: string, output?: string[]) => ({
      ...thinker(id),
      ...(output ? { architecture: { output_modalities: output } } : {}),
    });
    const rows = opperModels({
      data: [entry("image-maker", ["image", "text"]), entry("speaker", ["text", "audio"]), entry("coder", ["text"])],
    });
    assert.deepEqual(
      rows.map((row) => row.id),
      ["coder"],
    );
    assert.deepEqual(
      opperModels({ data: [entry("older-listing")] }).map((row) => row.id),
      ["older-listing"],
      "a listing that names no output is taken as text",
    );
  });

  it("refuses a catalog that is not one, and skips entries it cannot read", () => {
    for (const body of [null, {}, { data: "x" }, "[]"])
      assert.throws(() => opperModels(body), /could not be read/, JSON.stringify(body));
    const rows = opperModels({ data: [null, 7, { id: 3, opper: { capabilities: ["tools"] } }, CATALOG[1]] });
    assert.deepEqual(
      rows.map((row) => row.id),
      [CODER],
    );
  });

  it("is read with the key, one row per model, and lists nothing without a key", async () => {
    const server = await fake();
    const engine = await engineFor(server);
    await engine.refreshModels(true);
    assert.deepEqual(
      (await engine.models()).map((row) => row.id),
      [SONNET, CODER],
    );
    const read = server.requests.find((request) => request.path.startsWith("/v3/compat/models"));
    assert.equal(read?.path, "/v3/compat/models?view=simplified");
    assert.equal(read?.authorization, `Bearer ${GOOD_KEY}`);

    const keyless = await fake();
    const engineKeyless = await engineFor(keyless, memoryKeyStore(null));
    await engineKeyless.refreshModels(true);
    assert.deepEqual(await engineKeyless.models(), []);
    assert.equal(keyless.requests.length, 0, "nothing is asked of Opper without a key");
  });

  it("keeps nothing stale as fresh when a read fails", async () => {
    const broken = await fake({ catalog: { status: 200, body: "{not json" } });
    const engineBroken = await engineFor(broken);
    await engineBroken.refreshModels(true);
    assert.deepEqual(await engineBroken.models(), []);
    assert.equal(engineBroken.catalogSnapshot().state, "unavailable");
    assert.equal(engineBroken.catalogSnapshot().problem?.code, "malformed");

    const down = await engineFor(await fake({ catalog: { status: 503, body: "{}" } }));
    await down.refreshModels(true);
    assert.equal(down.catalogSnapshot().problem?.code, "provider");
  });
});

describe("Opper's key", () => {
  it("says what to do at each step: no key, a refused key, a good key, a locked store", async () => {
    const server = await fake();
    const none = await engineFor(server, memoryKeyStore(null));
    const missing = await none.status();
    assert.equal(missing.code, "needs_login");
    assert.match(missing.remedy ?? "", /Settings › Model Providers/);

    const refused = await (await engineFor(server, memoryKeyStore("op-not-a-key-this-server-takes"))).status();
    assert.equal(refused.code, "needs_login");
    assert.match(refused.detail, /did not accept/);

    assert.equal((await (await engineFor(server)).status()).code, "ready");
    assert.ok(
      server.requests.some((request) => request.path === "/v3/me"),
      "the key is checked where checking spends nothing",
    );

    const locked: ApiKeyStore = {
      read: async () => {
        throw new SecretStorageUnavailableError(SecretStorageIssue.NoKeyring);
      },
      write: async () => {},
      clear: async () => {},
    };
    const lockedStatus = await (await engineFor(server, locked)).status();
    assert.equal(lockedStatus.code, "error");
    assert.match(lockedStatus.detail, /secret store is locked/);
  });

  it("says Opper could not be reached when it answers neither yes nor no", async () => {
    const status = await (await engineFor(await fake({ keyStatus: 503 }))).status();
    assert.equal(status.code, "error");
    assert.match(status.detail, /could not be reached \(HTTP 503\)/);
  });

  it("saves a pasted key only when Opper takes it, reads the key's models, and forgets it on request", async () => {
    const server = await fake();
    const keys = memoryKeyStore(null);
    const engine = await engineFor(server, keys);
    await engine.refreshModels(true);
    assert.deepEqual(await engine.models(), []);
    assert.equal((await engine.saveKey("op-wrong-key-00000000000000000")).code, "needs_login");
    assert.equal(await keys.read(), null, "a refused key is not kept");
    assert.equal((await engine.saveKey(`  ${GOOD_KEY}\n`)).code, "ready");
    assert.equal(await keys.read(), GOOD_KEY, "kept trimmed");
    await engine.refreshModels();
    assert.deepEqual(
      (await engine.models()).map((row) => row.id),
      [SONNET, CODER],
      "the list is the new key's",
    );
    assert.equal((await engine.clearKey()).code, "needs_login");
    assert.equal(await keys.read(), null);
  });

  it("refuses what cannot be a key before asking anyone, and stores nothing (hostile input)", async () => {
    const server = await fake();
    const keys = memoryKeyStore(null);
    const engine = await engineFor(server, keys);
    const hostile: unknown[] = [
      "",
      "   ",
      "short",
      `${GOOD_KEY}\nX-Injected: 1`,
      `${GOOD_KEY} ${GOOD_KEY}`,
      "k".repeat(4096),
      42,
      null,
      { key: GOOD_KEY },
      [GOOD_KEY],
    ];
    for (const value of hostile) {
      assert.equal(cleanApiKey(value), null, JSON.stringify(value)?.slice(0, 40));
      const status = await engine.saveKey(value);
      assert.equal(status.code, "needs_login");
      assert.doesNotMatch(JSON.stringify(status), /op-test-0123/, "the answer never carries a key");
    }
    assert.equal(await keys.read(), null);
    assert.equal(
      server.requests.filter((request) => request.path === "/v3/me").length,
      0,
      "Opper was never asked about a value that cannot be a key",
    );
  });
});

describe("Opper completions", () => {
  it("streams a reply with the key as a bearer, the model's own id, and the price pi-ai computes", async () => {
    const server = await fake({
      replies: [{ text: "Hello from the gateway", usage: { prompt: 1_000_000, completion: 0 } }],
    });
    const engine = await engineFor(server);
    const deltas: string[] = [];
    const response = await engine.complete({
      model: SONNET,
      systemPrompt: "Build games.",
      messages: [{ role: "user", content: "hi" }],
      onDelta: (delta) => deltas.push(delta),
    });
    assert.equal(response.message.content, "Hello from the gateway");
    assert.equal(deltas.join(""), "Hello from the gateway");
    assert.equal(response.engine, "opper");
    assert.equal(response.usage.engine, "opper");
    assert.equal(response.usage.cost_usd, 3, "a million prompt tokens at $3 per million");
    const call = server.requests.find((request) => request.path === COMPLETIONS);
    assert.equal(call?.authorization, `Bearer ${GOOD_KEY}`);
    const body = call?.body as { model?: string; store?: unknown; messages?: Array<{ role: string }> } | undefined;
    assert.equal(body?.model, SONNET);
    assert.equal(body?.messages?.[0]?.role, "system", "the system prompt in the system role");
    assert.equal(body && "store" in body, false, "no field the compatible endpoint does not take");
  });

  it("sends the reasoning effort the model accepts, else the model's own", async () => {
    const sent = async (model: string, effort: string): Promise<unknown> => {
      const server = await fake({ models: [...CATALOG, thinker("high-only", ["high"])] });
      await (await engineFor(server)).complete({ model, effort, messages: [{ role: "user", content: "x" }] });
      const call = server.requests.find((request) => request.path === COMPLETIONS);
      return (call?.body as { reasoning_effort?: unknown } | undefined)?.reasoning_effort;
    };
    assert.equal(await sent(SONNET, "max"), "high", "the wider scale is clamped into low, medium and high");
    assert.equal(await sent(SONNET, "minimal"), "low");
    assert.equal(await sent(SONNET, "medium"), "medium");
    assert.equal(await sent("high-only", "low"), "high", "an effort the model refuses becomes its default");
    assert.equal(await sent(CODER, "high"), undefined, "a model that does not think gets no dial");
  });

  it("runs tool calls and refuses what the model cannot do before paying for a request", async () => {
    const server = await fake({
      replies: [{ toolCalls: [{ id: "call-1", name: "probe", arguments: { depth: 2 } }] }],
    });
    const engine = await engineFor(server);
    const tools = [{ name: "probe", description: "probe", parameters: { type: "object", properties: {} } }];
    const response = await engine.complete({ model: CODER, messages: [{ role: "user", content: "go" }], tools });
    assert.deepEqual(response.message.tool_calls, [{ id: "call-1", name: "probe", arguments: { depth: 2 } }]);

    const completions = () => server.requests.filter((request) => request.path === COMPLETIONS).length;
    const sent = completions();
    await assert.rejects(
      engine.complete({
        model: CODER,
        messages: [{ role: "user", content: "look", images: [{ data: "aGk=", mimeType: "image/png" }] }],
      }),
      /cannot see images/,
    );
    await assert.rejects(
      engine.complete({ model: "vendor/chat-only", messages: [{ role: "user", content: "x" }] }),
      (err) => err instanceof EngineError && err.kind === "unavailable",
    );
    await assert.rejects(engine.complete({ messages: [{ role: "user", content: "x" }] }), /Pick an Opper model/);
    assert.equal(completions(), sent, "no refused request reached the provider");
  });

  it("maps every failure by its status: throttled, refused, out of credits, down", async () => {
    const rows: Array<[FakeReply, string]> = [
      [{ httpStatus: 429, body: '{"error":{"message":"Rate limit exceeded"}}' }, "rate_limit"],
      [{ httpStatus: 401, body: '{"error":{"message":"bad key"}}' }, "auth"],
      [{ httpStatus: 402, body: '{"error":{"message":"Insufficient credits"}}' }, "usage_limit"],
      [{ httpStatus: 502, body: '{"error":{"message":"upstream"}}' }, "unavailable"],
      [{ cutAfter: "half a rep" }, "unavailable"],
    ];
    for (const [reply, kind] of rows) {
      const engine = await engineFor(await fake({ replies: [reply] }));
      await assert.rejects(
        engine.complete({ model: CODER, messages: [{ role: "user", content: "x" }] }),
        (err) => err instanceof EngineError && err.kind === kind && err.engine === "opper",
        JSON.stringify(reply),
      );
    }
  });

  it("never puts the key in an error, even when the provider echoes it back", async () => {
    const echo = `{"error":{"message":"bad header Bearer ${GOOD_KEY}"}}`;
    const engine = await engineFor(await fake({ replies: [{ httpStatus: 400, body: echo }] }));
    const error = await engine.complete({ model: CODER, messages: [{ role: "user", content: "x" }] }).then(
      () => assert.fail("the request was refused"),
      (err: Error) => err,
    );
    assert.doesNotMatch(`${error.message} ${error.stack ?? ""}`, /0123456789abcdef0123456789abcdef/);
  });

  it("says the key is missing as a sign-in failure, without sending anything", async () => {
    const server = await fake();
    const engine = await engineFor(server, memoryKeyStore(null));
    await assert.rejects(
      engine.complete({ model: CODER, messages: [{ role: "user", content: "x" }] }),
      (err) => err instanceof EngineError && err.kind === "auth",
    );
    assert.equal(server.requests.length, 0);
  });

  it("compacts before a request that would not fit, from an estimate it reports as one", async () => {
    const engine = await engineFor(await fake());
    const readings: unknown[] = [];
    const long = "word ".repeat(30_000);
    await assert.rejects(
      engine.complete({
        model: CODER,
        messages: [{ role: "user", content: long }],
        contextPolicy: { mode: "default" },
        onContext: (reading) => readings.push(reading),
      }),
      (err) => err instanceof EngineError && err.kind === "context_overflow",
    );
    assert.equal((readings[0] as { source?: string }).source, "estimated");
    await assert.rejects(
      engine.complete({
        model: CODER,
        messages: [{ role: "user", content: "word ".repeat(12_000) }],
        contextPolicy: { mode: "custom", thresholdPercent: 50 },
      }),
      (err) => err instanceof EngineError && err.kind === "context_threshold",
    );
  });
});

describe("Opper sessions", () => {
  it("runs a Genex session on the picked model: its tools, its events and its result are Opper's", async () => {
    const server = await fake({
      replies: [{ toolCalls: [{ id: "look-1", name: "inspect", arguments: {} }] }, { text: "Looked." }],
    });
    const engine = await engineFor(server);
    const cwd = await tmpDir("opper-game-");
    const events: Array<{ type: string; payload: unknown }> = [];
    const result = await engine.delegate({
      cwd,
      model: CODER,
      prompt: "Inspect the game",
      readOnly: true,
      liveTools: [{ name: "inspect", description: "inspect", parameters: { type: "object", properties: {} } }],
      onLiveTool: async () => ({ text: "observed" }),
      onEvent: (event) => events.push(event),
    });
    assert.equal(result.ok, true);
    assert.equal(result.engine, "opper");
    assert.equal(result.model, CODER);
    assert.equal(result.summary, "Looked.");
    const activity = events.filter((event) => event.type === "activity").map((event) => event.payload);
    assert.ok(activity.length > 0);
    assert.ok(activity.every((payload) => (payload as { engine: string }).engine === "opper"));
    await assert.rejects(engine.delegate({ cwd, prompt: "x" }), /Pick an Opper model/);
  });

  it("says the key is missing before a session starts", async () => {
    const engine = await engineFor(await fake(), memoryKeyStore(null));
    await assert.rejects(
      engine.delegate({ cwd: await tmpDir("opper-game-"), model: CODER, prompt: "x" }),
      (err) => err instanceof EngineError && err.kind === "auth",
    );
  });
});

describe("Opper in the registry", () => {
  it("is described as a metered beta session engine that needs its key, and is never a fallback", async () => {
    const server = await fake();
    const registry = new EngineRegistry();
    registry.register(await engineFor(server, memoryKeyStore(null)));
    const [described] = await registry.describe();
    assert.equal(described?.id, "opper");
    assert.equal(described?.kind, "direct");
    assert.equal(described?.supportsSessions, true);
    assert.equal(described?.status.code, "needs_login");
    assert.equal(described?.provider?.billing, "metered");
    assert.equal(described?.provider?.beta, true);
    assert.equal(described?.defaultModel, null, "no model is picked for the person");

    const ready = new EngineRegistry();
    ready.register(await engineFor(server));
    assert.deepEqual(await ready.fallbackFor("claude-code", { kind: "rate_limit" }), []);
    assert.equal(await ready.firstReady(), null);
  });
});
