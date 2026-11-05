/**
 * The scripted engines of a fixture session: Ollama, Claude Code, Codex, OpenCode, Grok Build, Cursor,
 * Genex, OpenRouter, Opper and local server stand-ins that answer from fixed text, never reach an
 * account, a key, a server or the network, and start no vendor worker. Markers in
 * the user's words (`fixture:pending`, `fixture:stream`, `fixture:plan`, …) choose the script.
 */
import { ChatActivityPhase } from "../../shared/chat-activity.ts";
import { RunControl } from "../../shared/chat-run.ts";
import { EngineKind, EngineStatusCode } from "../../shared/engine-descriptor.ts";
import { EngineFailureKind, StopReason } from "../../shared/engine-requests.ts";
import { HOUR_MS } from "../../shared/duration.ts";
import { EngineId } from "../../shared/providers.ts";
import { GENEX_HELPER_MODEL, GENEX_MODELS, GenexAccess, isGenexAccess } from "../../shared/genex-build.ts";
import { genexStatus } from "../../substrate/engines/genex.ts";
import { MODEL_LIMIT_PREFIX } from "../../shared/provider-usage.ts";
import { type LocalServerInfo, LocalServerKind } from "../../shared/local-server.ts";
import {
  type CompleteRequest,
  DelegateEventType,
  type DelegateRequest,
  type DelegateResult,
  type Engine,
  EngineError,
  type EngineStatus,
} from "../../substrate/engines/types.ts";
import { BACKDROP_SYSTEM_PROMPT, REPAIR_OPENING } from "../core/backdrop-generation-prompts.ts";
import { GAME_NAME_SYSTEM_PROMPT } from "../core/game-naming-prompts.ts";
import { FIXTURE_MODEL } from "./fixture-kit.ts";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { ReasoningEffort } from "../../shared/model-preferences.ts";

const DAY_MS = 24 * HOUR_MS;
const FIXTURE_ENGINES = [
  EngineId.Ollama,
  EngineId.ClaudeCode,
  EngineId.Codex,
  EngineId.OpenCode,
  EngineId.Grok,
  EngineId.Cursor,
  EngineId.Genex,
  EngineId.OpenRouter,
  EngineId.Opper,
  EngineId.LocalServer,
] as const;
/** The fixture engines the studio's own loop drives: the local model, OpenRouter's and Opper's APIs, a local server. */
const DIRECT_FIXTURES: ReadonlySet<string> = new Set([
  EngineId.Ollama,
  EngineId.OpenRouter,
  EngineId.Opper,
  EngineId.LocalServer,
]);
const READY_STATUS: EngineStatus = { code: EngineStatusCode.Ready, detail: "AG-933 fixture; no account or network" };
/** No local server is connected in a fixture session, so the picker's lists stay as they were. */
const NO_LOCAL_SERVER: EngineStatus = {
  code: EngineStatusCode.NotInstalled,
  detail: "AG-933 fixture; no local server is connected",
};
/** The server a ready local server stand-in reaches: TabbyAPI's default address, with a key kept. */
const FIXTURE_SERVER: LocalServerInfo = {
  url: "http://127.0.0.1:5000/v1",
  kind: LocalServerKind.TabbyApi,
  hasKey: true,
};
/** Cursor's CLI is not on a fixture session's computer, so the picker's lists stay as they were. */
const NO_CURSOR: EngineStatus = { code: EngineStatusCode.NotInstalled, detail: "AG-933 fixture; no Cursor CLI" };
/** No Opper key is saved in a fixture session, so the picker's lists stay as they were. */
const NO_OPPER_KEY: EngineStatus = { code: EngineStatusCode.NeedsLogin, detail: "AG-933 fixture; no Opper key" };
/**
 * The status each fixture starts with when the session names none: ready, but for the local server,
 * Cursor, Opper (no key) and Genex, whose account is signed out until `STUDIO_FIXTURE_USAGE_FILE`
 * says otherwise.
 */
const DEFAULT_STATUS: Partial<Record<string, EngineStatus>> = {
  [EngineId.LocalServer]: NO_LOCAL_SERVER,
  [EngineId.Cursor]: NO_CURSOR,
  [EngineId.Opper]: NO_OPPER_KEY,
  [EngineId.Genex]: genexStatus(GenexAccess.SignIn),
};
/**
 * How each subscription's plan limits answer, read again on every read so a reviewer can change it
 * while the window is open: a JSON file named by `STUDIO_FIXTURE_USAGE_FILE`, for example
 * `{"claude-code":"slow","codex":"failed"}`. `slow` answers after `SLOW_USAGE_MS`, `failed` throws,
 * `none` shares no limits, `signed_out` also makes the subscription signed out, `ready` makes a
 * stand-in that starts not installed (Cursor's) or signed out (Genex's) ready; Genex also takes any of
 * genex.games's access words (`needs_plan`, `out_of_credits`, `paused`, …); anything else, or no
 * file, answers the fixed limits at once.
 */
const FixtureUsage = { Slow: "slow", Failed: "failed", None: "none", SignedOut: "signed_out", Ready: "ready" } as const;
const SLOW_USAGE_MS = 8000;
const SIGNED_OUT_STATUS: EngineStatus = { code: EngineStatusCode.NeedsLogin, detail: "AG-933 fixture; signed out" };

/** How `id`'s plan limits answer now (`STUDIO_FIXTURE_USAGE_FILE`). */
function fixtureUsageMode(id: string): string | null {
  const file = process.env.STUDIO_FIXTURE_USAGE_FILE;
  if (!file) return null;
  try {
    const modes: unknown = JSON.parse(readFileSync(file, "utf8"));
    const mode = modes && typeof modes === "object" ? (modes as Record<string, unknown>)[id] : null;
    return typeof mode === "string" ? mode : null;
  } catch {
    return null;
  }
}

/** A subscription stand-in's plan limits, as `STUDIO_FIXTURE_USAGE_FILE` says they answer. */
async function readFixtureUsage(id: EngineId) {
  const mode = fixtureUsageMode(id);
  if (mode === FixtureUsage.Failed) throw new Error("fixture: the plan's limits could not be read");
  if (mode === FixtureUsage.None) return null;
  if (mode === FixtureUsage.Slow) await sleep(SLOW_USAGE_MS);
  return fixtureUsage(id);
}

/** How long naming a game takes, so home's Naming step can be seen. */
const NAMING_DELAY_MS = 2500;
/** How long making a background takes, so the panel's progress can be seen. */
const BACKDROP_DELAY_MS = 1500;
/** A description holding this gets a shader the GPU refuses first, so the repair can be seen. */
const BROKEN_BACKDROP_MARKER = "fixture:broken";
/** How long a scripted plan takes to come back, so its progress can be seen. */
const PLAN_DELAY_MS = 1200;
/** Pauses between streamed pieces: a Studio reply, a slow one, and a game chat's. */
const STUDIO_PIECE_MS = 25;
const SLOW_PIECE_MS = 60;
const STREAM_PIECE_MS = 35;
/** A long reply arrives as fast as a quick model writes: about 1,500 characters a second. */
const LONG_PIECE_CHARS = 12;
const LONG_PIECE_MS = 8;
/** How many sections the long reply has; each is a heading, prose, a list and a code block. */
const LONG_REPLY_SECTIONS = 12;
/** What the fixture engines answer and refuse, word for word. */
const MESSAGE = {
  plainReply: "Fixture response. No new build was started.",
  gameName: "Tiny Island Fishing",
  backdropTitle: "Fixture Waves",
  studioReply:
    "Fixture Studio reply: game chats build games. This conversation explains Studio, its runs, and the instruction changes in Activity.",
  studioFollowUp: "Fixture follow-up: the earlier conversation and recorded Studio activity are still in context.",
  streamedReply:
    "The bridge is ready. **You can cross the river now.** I kept the path level with the river bank and added rails along both sides. The village lights are warm and the cover is ready in Assets. You can try the crossing in the preview. The water keeps moving beneath it.",
  modelLimit: "You have reached your model limit. Choose another model.",
  stoppedByYou: "stopped by you",
  commandReply:
    "Converting the engine recordings needs ffmpeg, and my sandbox can’t download it. Run this once, then I’ll convert them:\n\n```bash\nbrew install ffmpeg\n```",
  commandFollowUp: "ffmpeg is in. Converting the engine recordings now.",
} as const;
/** The marker whose game-chat reply is long and code-heavy, streamed fast: what drawing a long reply costs. */
const LONG_STREAM_MARKER = "fixture:stream-long";
/** The marker that keeps a fixture session working until a real Stop. */
const PENDING_MARKER = "fixture:pending";
/** The marker whose reply offers the user a command to run, as a reply the sandbox blocked does. */
const COMMAND_MARKER = "fixture:command";
/** The session a command reply opens; the turn that tells it how the command went resumes it. */
const COMMAND_SESSION = "fixture-command-v1";

/**
 * First launch: an empty library, Claude Code waiting for a sign-in, Codex, OpenCode, Grok Build and
 * Cursor not installed, OpenRouter and Opper with no key, and no local server.
 */
export const FIRST_LAUNCH_STATUS: Record<string, EngineStatus> = {
  [EngineId.ClaudeCode]: {
    code: EngineStatusCode.NeedsLogin,
    detail: "AG-933 fixture; sign-in is refused in fixture sessions",
  },
  [EngineId.Codex]: { code: EngineStatusCode.NotInstalled, detail: "AG-933 fixture; no Codex app" },
  [EngineId.OpenCode]: { code: EngineStatusCode.NotInstalled, detail: "AG-933 fixture; no OpenCode CLI" },
  [EngineId.Grok]: { code: EngineStatusCode.NotInstalled, detail: "AG-933 fixture; no Grok Build CLI" },
  [EngineId.Cursor]: NO_CURSOR,
  [EngineId.OpenRouter]: { code: EngineStatusCode.NeedsLogin, detail: "AG-933 fixture; no OpenRouter key" },
  [EngineId.Opper]: NO_OPPER_KEY,
  [EngineId.LocalServer]: NO_LOCAL_SERVER,
};

export function fixtureEngines(directChat = false, statuses: Record<string, EngineStatus> = {}): Engine[] {
  // The pending sessions of this fixture: a steered one is resumed and keeps working.
  const pendingSessions = new Set<string>();
  return FIXTURE_ENGINES.map((id) => fixtureEngine(id, directChat, statuses, pendingSessions));
}

function fixtureEngine(
  id: EngineId,
  directChat: boolean,
  statuses: Record<string, EngineStatus>,
  pendingSessions: Set<string>,
): Engine {
  const direct = DIRECT_FIXTURES.has(id);
  // Ollama completes one turn at a time; OpenRouter, Opper and a local server hold Genex sessions, as the real ones do.
  const local = id === EngineId.Ollama;
  return {
    id,
    label: `${id} [fixture]`,
    kind: direct ? EngineKind.Direct : EngineKind.Delegated,
    supportsSessions: !(directChat && local),
    // Claude Code reads the person's messages mid-turn; Codex is interrupted and resumed instead.
    ...(id === EngineId.ClaudeCode ? { steersMidTurn: true } : {}),
    status: async () => fixtureStatus(id, statuses),
    // A local server stand-in names its server only while the session has it ready.
    ...(id === EngineId.LocalServer
      ? {
          server: async () =>
            (statuses[id] ?? NO_LOCAL_SERVER).code === EngineStatusCode.Ready ? FIXTURE_SERVER : null,
        }
      : {}),
    models: async () => (id === EngineId.Genex ? genexFixtureModels() : fixtureModels(direct)),
    defaultModel: async () => (id === EngineId.Genex ? GENEX_HELPER_MODEL : FIXTURE_MODEL),
    // Deterministic plan limits so the composer's usage panel has something honest to show; only a
    // subscription has a plan, and Genex its monthly credits.
    ...(isSubscriptionFixture(id) || id === EngineId.Genex ? { readUsage: () => readFixtureUsage(id) } : {}),
    complete: (request: CompleteRequest) => completeFixture(id, request),
    delegate: (request: DelegateRequest) => delegateFixture(id, request, pendingSessions),
  };
}

/** The one model every stand-in but Genex offers. */
function fixtureModels(direct: boolean) {
  return [
    {
      id: FIXTURE_MODEL,
      label: "Fixture v1",
      efforts: [ReasoningEffort.Low, ReasoningEffort.Medium, ReasoningEffort.High],
      defaultEffort: ReasoningEffort.Medium,
      supportsFast: !direct,
      contextWindow: 200000,
      maxTokens: 8192,
      supportsTools: true,
      supportsVision: true,
      supportsThinking: true,
    },
  ];
}

/** Genex's three models, as genex.games lists them. */
function genexFixtureModels() {
  return GENEX_MODELS.map((model) => ({
    ...model,
    contextWindow: 200000,
    maxTokens: 64000,
    supportsTools: true,
    supportsVision: true,
    supportsThinking: true,
  }));
}

/** A stand-in's status: as `STUDIO_FIXTURE_USAGE_FILE` sets it, else as the session names it, else its default. */
function fixtureStatus(id: EngineId, statuses: Record<string, EngineStatus>): EngineStatus {
  const mode = fixtureUsageMode(id);
  if (id === EngineId.Genex && isGenexAccess(mode)) return genexStatus(mode);
  if (mode === FixtureUsage.SignedOut) return SIGNED_OUT_STATUS;
  if (mode === FixtureUsage.Ready) return READY_STATUS;
  return statuses[id] ?? DEFAULT_STATUS[id] ?? READY_STATUS;
}

/** A subscription's stand-in: the only fixtures with plan limits. */
const isSubscriptionFixture = (id: EngineId): boolean => id === EngineId.ClaudeCode || id === EngineId.Codex;

function fixtureUsage(id: EngineId) {
  const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
  if (id === EngineId.Genex)
    return {
      measuredAt: new Date().toISOString(),
      windows: [{ id: "credits", label: "Monthly credits", percent: 30, resetsAt: inDays(12) }],
    };
  if (id === EngineId.Codex)
    return {
      measuredAt: new Date().toISOString(),
      plan: "pro",
      windows: [{ id: "codex:10080", label: "Weekly limit", percent: 76, resetsAt: inDays(3) }],
    };
  return {
    measuredAt: new Date().toISOString(),
    plan: "max",
    windows: [
      {
        id: "five_hour",
        label: "5-hour limit",
        percent: 12,
        resetsAt: new Date(Date.now() + 3.9 * HOUR_MS).toISOString(),
      },
      { id: "seven_day", label: "Weekly · all models", percent: 52, resetsAt: inDays(5) },
      { id: `${MODEL_LIMIT_PREFIX}fable`, label: "Weekly · Fable", percent: 100, resetsAt: inDays(5) },
    ],
  };
}

/** A completion as the scripted engines return one. */
function reply(id: EngineId, content: string, usage: Record<string, number> = {}) {
  return {
    engine: id,
    model: FIXTURE_MODEL,
    stopReason: "stop",
    message: { role: "assistant" as const, content },
    usage,
  };
}

async function completeFixture(id: EngineId, request: CompleteRequest) {
  // A game started from home is named first, whatever markers its request carries.
  if (request.systemPrompt === GAME_NAME_SYSTEM_PROMPT) {
    await sleep(NAMING_DELAY_MS, undefined, { signal: request.signal }).catch(() => {});
    return reply(id, MESSAGE.gameName);
  }
  const latestUser = request.messages.findLast((message) => message.role === "user")?.content ?? "";
  if (request.systemPrompt === BACKDROP_SYSTEM_PROMPT) {
    await sleep(BACKDROP_DELAY_MS, undefined, { signal: request.signal }).catch(() => {});
    return reply(id, backdropReply(latestUser));
  }
  if (latestUser.includes(PENDING_MARKER)) await pending(request.signal, id);
  if (request.systemPrompt?.startsWith("You are the Harness assistant")) return studioReply(id, request, latestUser);
  const transcript = JSON.stringify(request.messages);
  const asksForPlan = request.systemPrompt?.includes("planning-only") && transcript.includes("fixture:plan");
  if (asksForPlan) return planReply(id, transcript);
  if (transcript.includes("fixture:stream")) {
    request.onActivity?.(ChatActivityPhase.Thinking);
    await streamPieces(id, request, MESSAGE.streamedReply, { size: 3, pauseMs: STREAM_PIECE_MS });
    return reply(id, MESSAGE.streamedReply);
  }
  return reply(id, MESSAGE.plainReply);
}

/**
 * A background's waves. The first answer to a `fixture:broken` description returns a float as a
 * colour; a repair gets the working one.
 */
function backdropReply(request: string): string {
  const broken = request.includes(BROKEN_BACKDROP_MARKER) && !request.includes(REPAIR_OPENING);
  const result = broken ? "wave" : "vec4f(color, 1.0)";
  return `Title: ${MESSAGE.backdropTitle}
\`\`\`wgsl
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = bd_centered(uv);
  let wave = 0.5 + 0.5 * sin(p.x * 6.0 * backdrop.scale + backdrop.time + sin(p.y * 4.0 + backdrop.time * 0.7) * 2.0);
  let band = smoothstep(0.02, 0.0, abs(fract(p.y * 5.0 * backdrop.scale + wave * 0.6) - 0.5) - 0.2);
  var color = bd_glow(backdrop.page.rgb, backdrop.accent.rgb, wave * 0.18);
  color = bd_glow(color, backdrop.ink.rgb, band * 0.7);
  return ${result};
}
\`\`\``;
}

/** The Studio thread's assistant: a first reply, a follow-up, or nothing for `fixture:failure`. */
async function studioReply(id: EngineId, request: CompleteRequest, latestUser: string) {
  let content = studioReplyText(latestUser);
  const images = request.messages.reduce((count, message) => count + (message.images?.length ?? 0), 0);
  if (images && content) content += ` Received ${images} attached image.`;
  request.onActivity?.(ChatActivityPhase.Thinking);
  // This marker leaves enough time to inspect and navigate during a real stream.
  const slowStream = latestUser.includes("fixture:stream");
  await streamPieces(id, request, content, {
    size: slowStream ? 3 : 8,
    pauseMs: slowStream ? SLOW_PIECE_MS : STUDIO_PIECE_MS,
    studio: true,
  });
  return reply(id, content, { input_tokens: 1234 });
}

function studioReplyText(latestUser: string): string {
  if (latestUser.includes("follow up")) return MESSAGE.studioFollowUp;
  if (latestUser.includes("fixture:failure")) return "";
  return MESSAGE.studioReply;
}

/** Stream `content` in pieces of `size` characters; a Stop between pieces aborts. */
async function streamPieces(
  id: EngineId,
  request: CompleteRequest,
  content: string,
  pace: { size: number; pauseMs: number; studio?: boolean },
): Promise<void> {
  const stopped = pace.studio ? "Fixture Studio reply stopped" : "Fixture streaming stopped";
  for (const piece of content.match(new RegExp(`.{1,${pace.size}}`, "g")) ?? []) {
    if (request.signal?.aborted) throw new EngineError(EngineFailureKind.Aborted, id, stopped);
    request.onDelta?.(piece);
    await sleep(pace.pauseMs);
  }
}

/** A game chat's reply, streamed as a session's text deltas arrive; the whole text is its summary. */
async function streamChatReply(id: EngineId, request: DelegateRequest, content: string): Promise<string> {
  for (const delta of content.match(new RegExp(`[\\s\\S]{1,${LONG_PIECE_CHARS}}`, "g")) ?? []) {
    if (request.signal?.aborted) throw new EngineError(EngineFailureKind.Aborted, id, "Fixture streaming stopped");
    request.onEvent?.({ type: DelegateEventType.TextDelta, payload: { streamId: "fixture-long-reply", delta } });
    await sleep(LONG_PIECE_MS);
  }
  return content;
}

/** A plan for review: blue, or purple once the user asked for purple; `fixture:plan-unavailable` hits a limit. */
async function planReply(id: EngineId, transcript: string) {
  await sleep(PLAN_DELAY_MS);
  if (id === EngineId.ClaudeCode && transcript.includes("fixture:plan-unavailable"))
    throw new EngineError(EngineFailureKind.UsageLimit, id, MESSAGE.modelLimit);
  const revised = transcript.includes("purple");
  const plan = [
    "### A rotating cube",
    "- Use the existing `<canvas>` in `src/main.js`.",
    revised ? "- Use a purple material." : "- Use a blue material.",
    "### Build steps",
    ...Array.from(
      { length: 12 },
      (_, i) =>
        `${i + 1}. Check the camera and the cube controls inside the existing game. Keep the scene responsive when the window changes size.`,
    ),
  ].join("\n");
  return reply(id, plan);
}

async function delegateFixture(id: EngineId, request: DelegateRequest, pendingSessions: Set<string>) {
  const reads = steerReads(request);
  if (request.resume === COMMAND_SESSION) return reads.answer(commandReply(id, MESSAGE.commandFollowUp));
  if (request.prompt.includes(COMMAND_MARKER)) return reads.answer(commandReply(id, MESSAGE.commandReply));
  if (request.interviewTools?.some((tool) => tool.name === "ask_user"))
    return reads.answer(interviewReply(id, request));
  const stopped = await pendingSession(id, request, pendingSessions);
  if (stopped) return reads.answer(stopped);
  // After a closed Loop run the chat's own session holds the run's controls: it reads the run first.
  const controls = request.liveTools?.some((tool) => tool.name === RunControl.RunStatus);
  if (controls && request.onLiveTool) await request.onLiveTool(RunControl.RunStatus, {});
  const long = request.prompt.includes(LONG_STREAM_MARKER);
  const summary = long ? await streamChatReply(id, request, longReply()) : MESSAGE.plainReply;
  return reads.answer({
    ok: true,
    engine: id,
    model: FIXTURE_MODEL,
    turns: 1,
    usage: {},
    sessionId: "fixture-chat-v1",
    summary,
  });
}

/**
 * Steer: a message sent while this session works is read at once, where the turn is; the result
 * lists what was read, and nothing is taken once the session has answered.
 */
function steerReads(request: DelegateRequest) {
  const steered: string[] = [];
  let answered = false;
  request.steer?.ready((message) => {
    if (answered) return false;
    steered.push(message.id);
    queueMicrotask(() => request.onEvent?.({ type: DelegateEventType.SteerDelivered, payload: { id: message.id } }));
    return true;
  });
  return {
    answer: <T extends object>(result: T) => {
      answered = true;
      return { ...result, steered: [...steered] };
    },
  };
}

/**
 * A pending session waits for a real stop, and stays pending when resumed to read a steered
 * message. Stopped, it hands back its session like a real engine instead of throwing; null when
 * this session is not a pending one.
 */
async function pendingSession(
  id: EngineId,
  request: DelegateRequest,
  pendingSessions: Set<string>,
): Promise<DelegateResult | null> {
  const resumed = request.resume && pendingSessions.has(request.resume) ? request.resume : null;
  const asked = request.prompt.includes(PENDING_MARKER);
  if (!asked && !resumed) return null;
  const sessionId = resumed ?? `fixture-pending-${pendingSessions.size + 1}`;
  pendingSessions.add(sessionId);
  try {
    await pending(request.signal, id);
    return null;
  } catch {
    return {
      ok: false,
      engine: id,
      model: FIXTURE_MODEL,
      turns: 1,
      usage: {},
      sessionId,
      summary: "",
      stopReason: StopReason.Stopped,
      errorText: MESSAGE.stoppedByYou,
    };
  }
}

/** A reply in the command's session: the one that hands the user a command, or the one after it ran. */
function commandReply(id: EngineId, summary: string) {
  return {
    ok: true,
    engine: id,
    model: FIXTURE_MODEL,
    turns: 1,
    usage: {},
    sessionId: COMMAND_SESSION,
    summary,
  };
}

/** The build interview: one question first, then the answer understood. */
function interviewReply(id: EngineId, request: DelegateRequest) {
  const question = {
    name: "ask_user",
    args: {
      recap: "A night scene needs a place first.",
      question: "Where should the scene take place?",
      options: "Ashlands (Recommended) | Open terrain and mushroom trees\nTown street | Buildings and lanterns",
    },
  };
  return {
    ok: true,
    engine: id,
    model: FIXTURE_MODEL,
    turns: 1,
    usage: {},
    sessionId: "fixture-interview-v1",
    summary: request.resume
      ? "A coast at night, understood."
      : "I can build a small scene with a clear sense of place.",
    studioToolCalls: request.resume ? [] : [question],
  };
}

function pending(signal: AbortSignal | undefined, id: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    const abort = () =>
      reject(new EngineError(EngineFailureKind.Aborted, id, "Fixture pending operation aborted by real Stop"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

/** About ten thousand characters of Markdown a coding reply is made of: headings, prose, lists, code and a table. */
function longReply(): string {
  const sections = Array.from({ length: LONG_REPLY_SECTIONS }, (_, i) =>
    [
      `### Step ${i + 1}: the bridge's ${["deck", "rails", "lamps", "water"][i % 4]}`,
      "The bridge keeps its deck level with the river bank, and every plank snaps to the same grid so the player never catches a foot on a seam. **Nothing here changes the camera.**",
      "- Keep the `planks` group under one parent so a single matrix update moves them all.",
      "- Reuse the `MeshStandardMaterial` instead of making one per plank.",
      "- Leave `castShadow` off for the rails; the lamps cast enough.",
      "```js",
      `export function buildSection${i}(scene, planks) {`,
      "  const group = new THREE.Group();",
      "  for (let x = 0; x < planks; x++) {",
      "    const plank = new THREE.Mesh(PLANK_GEOMETRY, WOOD);",
      "    plank.position.set(x * 0.42 - planks * 0.21, 0, 0);",
      "    group.add(plank);",
      "  }",
      "  scene.add(group);",
      "  return group;",
      "}",
      "```",
    ].join("\n"),
  );
  const table = [
    "| Part | Draw calls | Triangles |",
    "| --- | --- | --- |",
    "| Deck | 1 | 2,400 |",
    "| Rails | 2 | 960 |",
  ];
  return [...sections, table.join("\n")].join("\n\n");
}
