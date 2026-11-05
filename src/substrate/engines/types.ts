import type { ModelCatalogStatus } from "../../shared/model-catalog.ts";
import type { LocalServerInfo } from "../../shared/local-server.ts";
import type { ProviderUsage } from "../../shared/provider-usage.ts";
import type { ModelPreferences } from "../../shared/model-preferences.ts";
import type { EngineAccount, EngineKind, EngineStatus } from "../../shared/engine-descriptor.ts";
import type { ChatActivityPhase } from "../../shared/chat-activity.ts";
import type { ContextMeasurement } from "../../shared/context.ts";
import { EngineFailureKind } from "../../shared/engine-requests.ts";
import { SECOND_MS } from "../../shared/duration.ts";
import type {
  PermissionDecision,
  PermissionGrant,
  PermissionMode,
  ToolPermissionAnswer,
} from "../../shared/permissions.ts";
import type { NeverTouchList } from "./never-touch.ts";
/** What the UI reads about an engine is a contract; it lives in `shared/engine-descriptor.ts`. */
export type { EngineAccount, EngineStatus, EngineStatusCode } from "../../shared/engine-descriptor.ts";
/**
 * Engine interface — layer 3 of the pie.
 *
 * Two kinds of builder, one interface, chosen per task and recorded in the log:
 *
 *  - **direct** (`complete`): the studio's own turn loop drives the model and executes tools
 *    itself. v1: Ollama through pi-ai. This is the unlimited unattended workhorse (D8).
 *  - **delegated** (`delegate`): a vendor harness does the whole build itself; we mirror its
 *    events into our log and improve the *brief* it reads. Two of them: Claude Code through the
 *    Agent SDK, and Codex through `codex exec` on a ChatGPT subscription. Each authenticates
 *    with its own subscription login (D8 — we never see or store a token), and each translates
 *    its own event stream into the one vocabulary the studio's log speaks.
 *
 * The API keys the studio holds are OpenRouter's, Opper's (`opper.ts`) and a local server's
 * (`local-server.ts`), direct engines on the same pi-ai path as Ollama's: each key is pasted in
 * Settings, kept in the OS secret store, and never leaves main.
 * OpenCode is a third delegated harness, which keeps its own sign-ins in its own store.
 */
import type { Message } from "../types.ts";
import type {
  CompleteResponse,
  DelegateCaptureGrant,
  DelegateDirectorGrant,
  DelegateImage,
  DelegateResult,
  LiveToolResult,
  LiveToolSpec,
  MessageFrom,
  SteerMessage,
  StudioToolSpec,
  ToolDefinition,
} from "../../shared/engine-requests.ts";
/** The serializable request and answer shapes cross the harness RPC; they live in `shared/engine-requests.ts`. */
export type {
  CompleteResponse,
  DelegateCaptureGrant,
  DelegateDirectorGrant,
  DelegateImage,
  DelegateResult,
  LiveToolResult,
  LiveToolSpec,
  SteerMessage,
  StudioToolSpec,
  ToolDefinition,
};

/** Where an engine's model row got its context window. */
export const ModelContextSource = {
  Catalog: "catalog",
  Configured: "configured",
  Unknown: "unknown",
} as const;
export type ModelContextSource = (typeof ModelContextSource)[keyof typeof ModelContextSource];

export interface EngineModel {
  /** Discovery row identity, distinct from the value sent for execution. */
  providerId?: string;
  /** Provider catalog default; local CLI configuration may choose differently. */
  providerDefault?: boolean;
  resolvedModel?: string;
  id: string;
  label: string;
  contextWindow: number;
  supportsFast?: boolean;
  contextSource?: ModelContextSource;
  hardLimitTokens?: number;
  maxTokens: number;
  /** Agentic use requires tool calling; models without it are offered for chat/judging only. */
  supportsTools: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  /**
   * Reasoning efforts this model actually accepts, best-effort from the engine's own catalogue.
   * The composer offers exactly these; a provider that does not advertise a dial gets none.
   */
  efforts?: string[];
  /** What the model thinks at when nobody says — shown as the "auto" row's second line. */
  defaultEffort?: string;
  sizeBytes?: number;
  installed?: boolean;
  /** Set when the catalog knows a better current pick than what is installed. */
  stale?: boolean;
  /** Set on a short alias the CLI resolves to another listed model, so pickers list that model once. */
  aliasOf?: string;
  note?: string;
  /** Runs at no cost and with no account (OpenCode's own free models). */
  free?: boolean;
}

export interface CompleteRequest {
  model?: string;
  systemPrompt?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  /**
   * Reasoning effort ("low" | "medium" | "high" | "max") for models that think. Local thinking
   * models default deep (Qwen3.8 ships at xhigh — minutes per answer); unattended runs set this
   * low so an unattended loop iterates instead of meditating.
   */
  effort?: string;
  preferences?: ModelPreferences;
  signal?: AbortSignal;
  /**
   * Wall-clock ceiling for this one completion. Engines that spawn a subprocess (Claude Code)
   * enforce it themselves — a hung CLI keeps the RPC in flight, which mutes wedge detection,
   * so the stall would otherwise be invisible and permanent. Surfaces as EngineError "timeout".
   */
  timeoutMs?: number;
  /** Streaming text deltas, forwarded to the UI. */
  onDelta?: (delta: string) => void;
  onContext?: (measurement: import("../../shared/context.ts").ContextMeasurement) => void;
  onActivity?: (phase: import("../../shared/chat-activity.ts").ChatActivityPhase) => void;
  /** Host-owned policy, applied by paths that can compact before retrying inference. */
  contextPolicy?: import("../../shared/context.ts").ContextPolicy;
}

/**
 * What a delegation reports through `DelegateRequest.onEvent`: the studio's own signals, plus the
 * contractor's messages mirrored in the compacted Claude Code shape (`assistant`, `user`,
 * `system`, `result`). Read by `main/core/delegation.ts`, which logs them: never rename a value.
 */
export const DelegateEventType = {
  /** The session started thinking, calling a tool or compacting (`DelegateActivity`). */
  Activity: "activity",
  /** A context reading or a compaction boundary. */
  Context: "context",
  /** Claude Code's own context meter, read from its telemetry. */
  ContextUsage: "context_usage",
  /** A chunk of the reply the user is watching arrive. */
  TextDelta: "text_delta",
  /** A chunk of a local model's reply. */
  AssistantDelta: "assistant_delta",
  Stderr: "stderr",
  /** A note the studio put in front of the session (an output limit, a progress check). */
  Status: "status",
  /** The contractor said the game reached a moment worth seeing. */
  Checkpoint: "checkpoint",
  System: "system",
  Assistant: "assistant",
  User: "user",
  Result: "result",
  RateLimitEvent: "rate_limit_event",
  /** The session read a steered message here (`DelegateRequest.steer`): it reads in the chat at this point. */
  SteerDelivered: "steer_delivered",
} as const;
export type DelegateEventType = (typeof DelegateEventType)[keyof typeof DelegateEventType];

/** A mirrored contractor message: its payload is the compacted message itself. */
type MirroredEventType =
  | typeof DelegateEventType.System
  | typeof DelegateEventType.Assistant
  | typeof DelegateEventType.User
  | typeof DelegateEventType.Result
  | typeof DelegateEventType.RateLimitEvent;

/** What a session is doing now, for the chat's activity line. */
export interface DelegateActivity {
  phase: ChatActivityPhase;
  engine: string;
  sessionId?: string | undefined;
  /** The tool a local session is calling. */
  tool?: string;
}

/** A context reading, or (with `compacted`) the boundary a compaction left. */
export type DelegateContext = Partial<ContextMeasurement> & {
  compacted?: boolean;
  compactionId?: string;
  checkpointId?: string;
  parentCheckpoint?: string | undefined;
  thresholdPercent?: number;
};

/** One event a delegation reports, typed by what it carries. */
export type DelegateEvent =
  | { type: typeof DelegateEventType.Activity; payload: DelegateActivity }
  | { type: typeof DelegateEventType.Context; payload: DelegateContext }
  | { type: typeof DelegateEventType.ContextUsage; payload: DelegateContext }
  | { type: typeof DelegateEventType.TextDelta; payload: { streamId: string; delta: string; replace?: boolean } }
  | { type: typeof DelegateEventType.AssistantDelta; payload: { text: string } }
  | { type: typeof DelegateEventType.Stderr; payload: string }
  | { type: typeof DelegateEventType.Status; payload: { message: string } }
  | { type: typeof DelegateEventType.Checkpoint; payload: { note: string } }
  | { type: typeof DelegateEventType.SteerDelivered; payload: { id: string } }
  | { type: MirroredEventType; payload: unknown };

export interface DelegateRequest {
  contextPolicy?: import("../../shared/context.ts").ContextPolicy;
  /** The person's words for a chat turn (`from`), or a brief for a session nobody answers. */
  prompt: string;
  /**
   * Who wrote `prompt` (`HarnessDelegateParams.from`): the person's words alone, or Genex's own
   * message, which the engine shows as not the person's (`genex-mark-prompts.ts`). Absent: a brief.
   */
  from?: MessageFrom;
  /**
   * What the session should know for its whole life (Genex's context, its plugins and their
   * guidance), said once beside the engine's own system prompt instead of in every message. Only an
   * engine with a system channel is sent it (Claude Code's append, Codex's developer instructions on
   * its app server); any other, and a new `codex exec` session, reads it as the first notice of a new
   * session. A resumed session keeps the text it started with.
   */
  system?: string;
  /** Genex's own lines that ride beside the prompt, each a block of its own ahead of it, unmarked: the engine marks them (`genex-mark-prompts.ts`). */
  notices?: readonly string[];
  cwd: string;
  model?: string;
  /** Reasoning effort for the contractor's model ("low" | "medium" | "high" | "max"). */
  effort?: string;
  preferences?: ModelPreferences;
  signal?: AbortSignal;
  /** No default: a chat build runs until it is done or the user stops it. Runs may set a cap. */
  maxTurns?: number;
  /**
   * Wall-clock ceiling for the whole delegation. When it passes, the studio aborts the
   * contractor and reports the partial build (stopReason `deadline`, session id kept for
   * resume) — a spent time budget is an outcome, never a crash.
   */
  timeoutMs?: number;
  /** Continue a previous contractor session (its id from a prior result) instead of starting fresh. */
  resume?: string;
  /**
   * Compact Now: the `resume` session compacts itself with its provider's own compaction and no
   * turn runs; `prompt` is not sent. Only an engine that `compactsNatively` takes it.
   */
  compact?: boolean;
  /** Stills folders the user named outside this workspace — readable, not writable. */
  extraReads?: string[];
  /** Sibling folders the contractor must not Read — other games, not stills. */
  denyReads?: string[];
  /** Host-stored folder trust; never taken from an editable harness RPC parameter. */
  trustedProjectSettings?: boolean;
  /** Every message the contractor emits, for mirroring into our event log. */
  onEvent?: (event: DelegateEvent) => void;
  /**
   * The checkpoint made real: when set, the studio's `checkpoint` tool reports its note as before
   * and then answers what this answers (Genex's checkpoint of the game folder, its plugins' steps
   * around the snapshot, `main/core/plugin-hooks.ts`). Absent, the tool only shows the note.
   */
  onCheckpoint?: (note: string) => Promise<string>;
  /**
   * Studio intake tools exposed to the contractor as MCP tools (`mcp__studio__<name>`) — the
   * bridge that lets a Loop chat session ask a question or launch a build itself. Flat schemas
   * only (string properties). Calls are reported back in `studioToolCalls`; the harness owns
   * the actual execution. The session otherwise keeps the full contractor tool set.
   */
  interviewTools?: StudioToolSpec[];
  /**
   * Give the contractor eyes on its own build: when set, the engine exposes an MCP tool
   * (`mcp__studio__capture`) whose handler is `onCapture` — the studio renders the build in a
   * hidden pooled preview and saves frames the contractor can Read mid-turn. `selfCapture` is
   * the serializable half that crosses the RPC from the harness; the studio injects the
   * matching `onCapture` closure itself — a function never travels over RPC.
   */
  selfCapture?: DelegateCaptureGrant;
  /** `page`: a .html file in the workspace to capture in place of the game. `cameras` is accepted from older callers and ignored: a capture photographs the page. */
  onCapture?: (args: { cameras?: string; page?: string }) => Promise<string>;
  /**
   * The computer: with a `selfCapture` grant the builder also gets `computer` — hands
   * and eyes on one pooled window that keeps running between actions. `false` withholds it
   * (a session that must only capture).
   */
  computer?: boolean;

  /**
   * The director: the run's orchestrating session. Its cwd is the run's integration
   * worktree (`root`) — or, for a waking run's lead, the game folder, leading that worktree; it gets the computer tool on a window of its own (`look` points that window at
   * any build of the run), capture, and the harness's run tools — workers, a second opinion,
   * merges, finish — which the studio forwards to the harness process that owns them. The
   * serializable half; the studio injects the closures.
   */
  director?: DelegateDirectorGrant;
  liveTools?: LiveToolSpec[];
  onLiveTool?: (name: string, args: Record<string, unknown>) => Promise<LiveToolResult>;
  /**
   * A session that may look and talk but never edit or run commands (a reviewer, a reader worker).
   * Never a run's lead: the host seats every lead as a full agent.
   */
  readOnly?: boolean;
  /** A Loop's reviewer: the folder it reads (its cwd is a home of its own, which its brief must not name as the build). */
  reviewer?: { reads: string };
  /**
   * Stills that go into the builder's prompt as image blocks: the
   * reference frames on a facet's first iteration, reference|build pair images when a style
   * or vision check is failing. A path in a text prompt is not a picture.
   */
  images?: DelegateImage[];
  /**
   * This delegation is the chat's current turn, and the person's messages may reach it mid-turn
   * (only for an engine with `steersMidTurn`). The engine calls `ready` once, as soon as it knows
   * whether this session takes input mid-turn: with `send`, which hands one message in and says
   * whether the session took it, or with null. A message taken is either read by the session —
   * reported the moment it is (`onEvent` type `steer_delivered`, payload `{id}`) and listed in
   * `steered` — or not delivered, and the caller queues it again.
   */
  steer?: { ready(send: SteerSend | null): void };
  /**
   * A person is answering this chat and chose how it may act (Claude Code's permission modes).
   * Present only for a game chat's own session answering a message the person sent: the host
   * decides that from what it recorded, never the harness. Absent, the engine keeps the
   * unattended contract: sandboxed shell, edits in the workspace, no questions.
   */
  permissions?: DelegatePermissions;
  /**
   * A build's lead in a game chat: the chat's main agent, limited only by
   * the chat's mode and the rules the person saved. Its session gets Claude Code's tools, no sandbox
   * and no blanket shell, in its chat's Auto, Accept edits or Bypass, else in Manual
   * (`LeadAsks.mode`), which the picker switches while it runs (`onControl`); every tool call but a
   * read or the studio's own is screened by the host first (`LeadAsks.screen`, to ask first while the
   * chat is in a mode its session could not be switched to), and each question goes to the host,
   * which answers it for the chat's mode. Only the host sets it (the harness's
   * `engine.delegate` has no such field), never together with `permissions`.
   */
  leadAsks?: LeadAsks;
  /**
   * A worker of a chat's lead, in the chat's mode: its seat, as the host found and built it. Only
   * the host sets it (the harness asks with a grant the host honours on its own finding), never
   * together with `permissions` or `leadAsks`. Absent, the engine keeps the unattended contract.
   */
  worker?: WorkerSeat;
}

/**
 * A worker's seat: the mode it runs in (the chat's, mapped for the engine; Plan keeps it
 * read-only), the folders it may write, what it never reaches in any mode, whether it may search
 * the web, and how it asks. Claude Code boxes it in every mode: Bypass writing the home folder and
 * `writeRoots`, Auto, Accept edits and Manual only `writeRoots`; Codex always boxes it (codex.ts
 * `workerBox`).
 */
export interface WorkerSeat {
  id: string;
  title: string;
  mode: PermissionMode;
  /** Absolute real folders its box lets it write: its working folder, the chat's granted folders, plugin folders. */
  writeRoots: string[];
  neverTouch: NeverTouchList;
  /** It may search and read the web even as a reader. */
  research: boolean;
  /** How its questions reach the chat; absent for a seat whose engine cannot ask. */
  asks?: WorkerAsks;
}

/** One tool call Claude Code wants to make and cannot decide alone. */
export interface PermissionAsk {
  tool: string;
  input: Record<string, unknown>;
  toolUseId: string;
  title?: string;
  displayName?: string;
  description?: string;
  reason?: string;
  blockedPath?: string;
  /** Claude Code's "always" suggestions, translated; empty when it offered none. */
  always: PermissionGrant[];
  agentId?: string;
}

/** A running session's mode, as the composer's picker reaches it. */
export interface PermissionControl {
  /** Rejects with an error whose `code` is a `ModeSwitchFailure` when the session will not switch. */
  setMode(mode: PermissionMode): Promise<void>;
}

/**
 * The host's own deny when the work ended around a question (a Stop, the turn's end): Claude reads
 * its words as they are, never as the person's. Only the host builds one; no answer the Studio UI
 * sends carries `withdrawn` (`permissionAnswer` builds each answer afresh).
 */
export interface WithdrawnAnswer {
  decision: typeof PermissionDecision.Deny;
  withdrawn: true;
  message: string;
}

/** How a question ends: the person's answer, or the host's withdrawal. */
export type PermissionReply = ToolPermissionAnswer | WithdrawnAnswer;

/** What a session that asks is handed: its standing grants, the host files it never edits, and the way to ask. */
export interface DelegateAsks {
  /** Saved "always allow" rules for this game and this chat, in Claude Code's rule syntax. */
  allow: string[];
  /** Folders granted for this chat, beyond the workspace and `extraReads`. */
  directories: string[];
  /** Host-owned paths no mode may edit (absolute). The engine's `protectedPaths` are also unreadable. */
  protectWrites: string[];
  /** Ask the person; resolves with their answer, or a deny when the work ends first. */
  ask(request: PermissionAsk, signal: AbortSignal): Promise<PermissionReply>;
  /**
   * The composer's picker's reach into the running session, while it takes control requests;
   * called with null when it stops.
   */
  onControl?(control: PermissionControl | null): void;
}

/** One tool call, as the host screens it before Claude Code's own rules and mode decide on it. */
export interface ScreenedCall {
  tool: string;
  input: Record<string, unknown>;
  /** The call's id, as its question carries it (`PermissionAsk.toolUseId`) if the host asks first. */
  toolUseId?: string;
}

/**
 * The host's word that a call must be asked about, whatever the session's mode would decide: a
 * lead running in Auto, Accept edits or Bypass whose chat is in another mode it could not be
 * switched to. `reason` is the question's reason.
 */
export interface AskFirst {
  askFirst: true;
  reason: string;
}

/**
 * What a build's lead is handed: a session that asks, and the host's word
 * on each tool call before anything else decides it. Claude Code applies its mode and allow rules
 * (the saved ones, a game's own `.claude` settings) before it asks, so only a check that runs ahead
 * of them holds while the chat is in a mode the session could not be switched to.
 */
export interface LeadAsks extends DelegateAsks {
  /**
   * The mode its session starts in: its chat's Auto, Accept edits or Bypass, Manual otherwise. The
   * picker switches it the same way while it runs (`onControl`).
   */
  mode:
    | typeof PermissionMode.Auto
    | typeof PermissionMode.AcceptEdits
    | typeof PermissionMode.Bypass
    | typeof PermissionMode.Manual;
  /**
   * The host's deny for this call, in its own words, its demand to ask first, or null to leave it
   * to the session's rules, mode and questions. Asked for every call but a read or one of the
   * studio's own tools, each time: the chat's mode is read then, not when the session started.
   */
  screen(call: ScreenedCall): Promise<WithdrawnAnswer | AskFirst | null>;
}

/**
 * What a worker that asks is handed: a lead's way of asking (its questions go to the chat; its own
 * ways to ask or to plan are refused; its mode is never its own to change), naming the worker.
 * Only the host builds it.
 */
export interface WorkerAsks extends LeadAsks {
  worker: { id: string; title: string };
}

/** What a session a person is answering is handed: its mode as well, and the picker's reach into it. */
export interface DelegatePermissions extends DelegateAsks {
  mode: PermissionMode;
  /** The mode the session actually runs in, as it reports it (start, and each change). */
  onMode?(mode: string): void;
}

/** Hands one steered message into a running session; false when the session will not take it. */
export type SteerSend = (message: SteerMessage) => boolean;

/** The failure kinds (and `isContextFailure`) live in `shared/engine-requests.ts`, beside the results they end. */
export { EngineFailureKind, isContextFailure } from "../../shared/engine-requests.ts";

/**
 * Engine failures the harness reacts to by policy. Rate limits matter most in v1: subscriptions
 * throttle server-side, and the run must survive it by pausing or falling back to local.
 */
export class EngineError extends Error {
  readonly kind: EngineFailureKind;
  readonly engine: string;
  readonly retryAfterMs?: number;
  constructor(kind: EngineFailureKind, engine: string, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "EngineError";
    this.kind = kind;
    this.engine = engine;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export interface Engine {
  usageSnapshot?: () => ProviderUsage | null;
  /**
   * Subscription engines: the plan's limits, read from the provider without starting a turn. Null
   * when the plan shares none; a throw when they could not be read.
   */
  readUsage?(): Promise<ProviderUsage | null>;
  /** Subscription engines: login source and CLI summary for Settings. */
  account?(): Promise<EngineAccount>;
  /** A local server engine: the saved server for Settings, or null while none is saved. */
  server?(): Promise<LocalServerInfo | null>;
  readonly id: string;
  readonly label: string;
  readonly kind: EngineKind;
  /** Can execute a persisted workspace session (including direct local engines). */
  readonly supportsSessions?: boolean;
  /**
   * Takes the person's messages into a running delegation (`DelegateRequest.steer`). A session
   * engine without it is steered by interrupting its turn and resuming the same session.
   */
  readonly steersMidTurn?: boolean;
  /** Its delegated sessions honour `DelegateRequest.permissions` and ask mid-turn. */
  readonly permissionPrompts?: boolean;
  /** Compacts a session in place with the provider's own compaction (`DelegateRequest.compact`). */
  readonly compactsNatively?: boolean;
  dispose?(): Promise<void>;
  /** Cheap liveness/auth probe used by the UI and by engine fallback. */
  status(): Promise<EngineStatus>;
  models(): Promise<EngineModel[]>;
  catalogSnapshot?(): ModelCatalogStatus;
  refreshModels?(force?: boolean): Promise<void>;
  /** Local engines: delete an installed model from this Mac. */
  removeModel?(id: string): Promise<void>;
  /** A copy of a local model that runs with a larger context, and the copy's id (Ollama). */
  raiseContext?(id: string): Promise<string>;
  /** One-shot completion. Direct engines use this for the whole tool loop; Claude Code uses it only as the isolated critic (no tools, no game folder). */
  complete?(request: CompleteRequest): Promise<CompleteResponse>;
  /** Build a game. Delegated engines (Claude Code) take a brief and work in a workspace. */
  delegate?(request: DelegateRequest): Promise<DelegateResult>;
  defaultModel?(): Promise<string | null>;
}

/** How many characters of an HTTP error body an engine error quotes. */
const HTTP_BODY_EXCERPT_CHARS = 200;

/** An HTTP failure from a model server, as the engine error the run policy reacts to. */
export function classifyHttpFailure(engine: string, status: number, body: string): EngineError {
  const excerpt = body.slice(0, HTTP_BODY_EXCERPT_CHARS);
  if (status === 429) {
    const retry = /retry-after[:= ]+(\d+)/i.exec(body);
    return new EngineError(
      EngineFailureKind.RateLimit,
      engine,
      `rate limited: ${excerpt}`,
      retry ? Number(retry[1]) * SECOND_MS : undefined,
    );
  }
  if (status === 401 || status === 403) {
    return new EngineError(EngineFailureKind.Auth, engine, `not authorised: ${excerpt}`);
  }
  // A metered account out of credits: waiting in the run never refills it.
  if (status === 402) return new EngineError(EngineFailureKind.UsageLimit, engine, `out of credits: ${excerpt}`);
  if (status >= 500)
    return new EngineError(EngineFailureKind.Unavailable, engine, `engine error ${status}: ${excerpt}`);
  return new EngineError(EngineFailureKind.Other, engine, `HTTP ${status}: ${excerpt}`);
}
