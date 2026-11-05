/**
 * Permission modes and tool permission requests for a game chat: the five modes Claude Code
 * offers and the Allow / Deny questions it asks, answered in the chat instead of a terminal. Every
 * engine's chat session follows the chat's mode as far as it can (`permissionModesFor`).
 *
 * Whoever answers the person in a game chat asks: the chat's own session, and a build's lead on
 * Claude Code while it answers a message the person sent. Workers of the
 * chat's lead follow the chat's mode: Bypass in a box that writes the home folder too, Auto, Accept
 * edits and Manual in a box that writes only their folders, Plan read-only; their questions wait in the chat, naming the
 * worker, until the person answers, and "always" counts for the whole chat. A Codex worker cannot
 * ask, so it is always boxed. In every mode, Bypass included, a worker never reaches a sign-in,
 * Genex's own data or another game (the never-touch list). A web Loop snapshots the game before its
 * first turn; the Unreal Loop's lead takes its first snapshot at its first save point, so its
 * in-place workers before then have only the chat's checkpoints behind them. Other unattended work (a reviewer, a second opinion, an
 * older run's builders) keeps the sandboxed contract of the engine that runs it. The host decides which is
 * which from what it recorded itself, and keeps the mode and every saved grant; the harness can
 * neither read nor set them, and no agent's message ever counts as the person's answer.
 */
import { tc, t } from "./i18n.ts";
import { EngineId } from "./providers.ts";

/** Claude Code's permission modes, in their SDK spelling. */
export const PermissionMode = {
  Auto: "auto",
  /** Claude Code's `default`, which its own picker calls Manual. */
  Manual: "default",
  AcceptEdits: "acceptEdits",
  Plan: "plan",
  Bypass: "bypassPermissions",
} as const;
export type PermissionMode = (typeof PermissionMode)[keyof typeof PermissionMode];

/** The modes in the order the composer lists them (and the digits that pick them). */
export const PERMISSION_MODES: readonly PermissionMode[] = [
  PermissionMode.Auto,
  PermissionMode.Manual,
  PermissionMode.AcceptEdits,
  PermissionMode.Plan,
  PermissionMode.Bypass,
];

/** A chat that never chose starts here, as Claude Code recommends. */
export const DEFAULT_PERMISSION_MODE: PermissionMode = PermissionMode.Auto;

/** The modes a plan approval continues in, and the only ones a new chat may inherit. */
export type SteadyPermissionMode =
  | typeof PermissionMode.Auto
  | typeof PermissionMode.Manual
  | typeof PermissionMode.AcceptEdits;

/**
 * The modes a pick in one chat also gives new chats. Plan and Bypass are chosen chat by chat, so
 * no chat runs without asking unless someone confirmed that in it.
 */
export const STEADY_PERMISSION_MODES: ReadonlySet<PermissionMode> = new Set<PermissionMode>([
  PermissionMode.Auto,
  PermissionMode.Manual,
  PermissionMode.AcceptEdits,
]);

/** Why a mode is not offered for an engine, as the composer's menu says it. */
export const UnavailableModeReason = {
  /** The engine's session cannot stop mid-turn to ask (Codex, a harness tool loop). */
  CannotAsk: "cannot_ask",
  /** The engine's commands always run in the studio's sandbox (Bonsai). */
  AlwaysSandboxed: "always_sandboxed",
} as const;
export type UnavailableModeReason = (typeof UnavailableModeReason)[keyof typeof UnavailableModeReason];

/** How an engine's chat session follows the chat's mode. */
interface EnginePermissions {
  /** The modes it honours, in the composer's order. */
  modes: readonly PermissionMode[];
  /** Why it honours no other. */
  withheld: UnavailableModeReason;
  /** It shows a plan mid-turn (`ExitPlanMode`) rather than by ending its turn with it. */
  plansMidTurn?: true;
}

/**
 * Each engine's row. Claude Code asks mid-turn in every mode, and so does Genex, which runs it. Bonsai's tools run in the studio,
 * which asks before each edit or command; its commands always run in the studio's sandbox, so it
 * has no Bypass. Codex has no Manual or Accept edits: Auto keeps its sandbox (on its app server, what
 * the sandbox would not run is asked about and settled by the Auto check), Plan only reads, Bypass
 * drops its sandbox. OpenRouter's, Opper's and a local server's tools run in the studio's own
 * session loop, as Bonsai's do.
 * OpenCode (`opencode run`), Grok Build (`grok -p`) and Cursor (`cursor-agent --print`) cannot ask
 * mid-turn: Auto runs them in the studio's sandbox, Plan reads only, and Grok Build's Bypass runs it
 * as the person outside that sandbox, as Codex's does. Any other engine (Ollama, whose tools run in the harness, or one added later) keeps its
 * own sandboxed contract, which is Auto.
 */
const ENGINE_PERMISSIONS: Readonly<Record<string, EnginePermissions>> = {
  [EngineId.ClaudeCode]: { modes: PERMISSION_MODES, withheld: UnavailableModeReason.CannotAsk, plansMidTurn: true },
  [EngineId.Genex]: { modes: PERMISSION_MODES, withheld: UnavailableModeReason.CannotAsk, plansMidTurn: true },
  [EngineId.Bonsai]: {
    modes: [PermissionMode.Auto, PermissionMode.Manual, PermissionMode.AcceptEdits, PermissionMode.Plan],
    withheld: UnavailableModeReason.AlwaysSandboxed,
  },
  [EngineId.Codex]: {
    modes: [PermissionMode.Auto, PermissionMode.Plan, PermissionMode.Bypass],
    withheld: UnavailableModeReason.CannotAsk,
  },
  [EngineId.OpenRouter]: {
    modes: [PermissionMode.Auto, PermissionMode.Manual, PermissionMode.AcceptEdits, PermissionMode.Plan],
    withheld: UnavailableModeReason.AlwaysSandboxed,
  },
  [EngineId.Opper]: {
    modes: [PermissionMode.Auto, PermissionMode.Manual, PermissionMode.AcceptEdits, PermissionMode.Plan],
    withheld: UnavailableModeReason.AlwaysSandboxed,
  },
  [EngineId.LocalServer]: {
    modes: [PermissionMode.Auto, PermissionMode.Manual, PermissionMode.AcceptEdits, PermissionMode.Plan],
    withheld: UnavailableModeReason.AlwaysSandboxed,
  },
  [EngineId.OpenCode]: {
    modes: [PermissionMode.Auto, PermissionMode.Plan],
    withheld: UnavailableModeReason.CannotAsk,
  },
  [EngineId.Grok]: {
    modes: [PermissionMode.Auto, PermissionMode.Plan, PermissionMode.Bypass],
    withheld: UnavailableModeReason.CannotAsk,
  },
  [EngineId.Cursor]: {
    modes: [PermissionMode.Auto, PermissionMode.Plan],
    withheld: UnavailableModeReason.CannotAsk,
  },
};

/** What an engine that has no row honours: its own sandboxed contract. */
const UNLISTED_ENGINE: EnginePermissions = { modes: [PermissionMode.Auto], withheld: UnavailableModeReason.CannotAsk };

function enginePermissions(engine: string): EnginePermissions {
  return Object.hasOwn(ENGINE_PERMISSIONS, engine) ? ENGINE_PERMISSIONS[engine] : UNLISTED_ENGINE;
}

/** The modes an engine's chat session honours; every engine has at least Auto. */
export function permissionModesFor(engine: string): readonly PermissionMode[] {
  return enginePermissions(engine).modes;
}

/** The mode an engine runs a chat in: the chat's own when the engine honours it, else Auto. */
export function engineMode(engine: string, mode: PermissionMode): PermissionMode {
  return permissionModesFor(engine).includes(mode) ? mode : PermissionMode.Auto;
}

/** Why an engine does not honour a mode, or null when it does. */
export function unavailableModeReason(engine: string, mode: PermissionMode): UnavailableModeReason | null {
  const row = enginePermissions(engine);
  return row.modes.includes(mode) ? null : row.withheld;
}

/**
 * Whether an engine shows a plan by ending its turn with it (the host then asks for approval and
 * continues the session), rather than asking mid-turn as Claude Code does with `ExitPlanMode`.
 */
export function plansByTurn(engine: string): boolean {
  const row = enginePermissions(engine);
  return !row.plansMidTurn && row.modes.includes(PermissionMode.Plan);
}

/** The modes a plan approved on an engine may continue in, in the plan card's order. */
export function planContinuations(engine: string): SteadyPermissionMode[] {
  const modes = permissionModesFor(engine);
  return [PermissionMode.Auto, PermissionMode.AcceptEdits, PermissionMode.Manual].filter((mode) =>
    modes.includes(mode),
  );
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && (PERMISSION_MODES as readonly string[]).includes(value);
}

/** A mode a new chat may start in, and a plan approval may continue in. */
export function isSteadyPermissionMode(value: unknown): value is SteadyPermissionMode {
  return isPermissionMode(value) && STEADY_PERMISSION_MODES.has(value);
}

/**
 * The menu's words: Claude Code's mode names, each described in one line of the menu, in the
 * app's language. A function, as main reads it too and sets its language after loading.
 */
export function permissionModeWords(): Record<PermissionMode, { label: string; description: string }> {
  return {
    [PermissionMode.Auto]: { label: tc("permission mode", "Auto"), description: t("Stops only for risky actions") },
    [PermissionMode.Manual]: { label: tc("permission mode", "Manual"), description: t("Asks before every change") },
    [PermissionMode.AcceptEdits]: { label: t("Accept edits"), description: t("Edits files without asking") },
    [PermissionMode.Plan]: { label: tc("permission mode", "Plan"), description: t("Plans first, asks to proceed") },
    [PermissionMode.Bypass]: { label: t("Bypass permissions"), description: t("Never asks, works anywhere") },
  };
}

/** The tool whose question is a plan waiting for approval. */
export const PLAN_TOOL = "ExitPlanMode";

/**
 * Tools whose bare name as a rule allows every command or every file. Claude Code hides "always"
 * when its rule would reach that far; the SDK drops the flag that says so, so the studio never
 * offers, saves or believes one.
 */
export const WHOLE_TOOL_RULES: ReadonlySet<string> = new Set([
  "Bash",
  "PowerShell",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "Read",
]);

/** What an "always" answer grants. */
export const GrantKind = { Rule: "rule", Mode: "mode", Directory: "directory" } as const;
export type GrantKind = (typeof GrantKind)[keyof typeof GrantKind];

/** Where a rule applies: every chat of the game, or this conversation. */
export const RuleScope = { Game: "game", Chat: "chat" } as const;
export type RuleScope = (typeof RuleScope)[keyof typeof RuleScope];

/**
 * What "always" grants, translated from Claude Code's suggestions. A `game` rule is saved for
 * every chat of that game; a `chat` rule, a mode and a folder last for this conversation.
 * Rules use Claude Code's syntax: `Bash(npm test:*)`, `Read(//Users/me/refs/**)`, `WebFetch(domain:x.com)`.
 */
export type PermissionGrant =
  | { kind: typeof GrantKind.Rule; rule: string; scope: RuleScope }
  | { kind: typeof GrantKind.Mode; mode: PermissionMode }
  | { kind: typeof GrantKind.Directory; path: string };

/** A request waits, then ends allowed or denied. Persisted: never rename a value. */
export const ToolPermissionState = { Pending: "pending", Allowed: "allowed", Denied: "denied" } as const;
export type ToolPermissionState = (typeof ToolPermissionState)[keyof typeof ToolPermissionState];

/**
 * Who settled a request: the person, the work ending around it, nobody answering a lead's or a run
 * worker's card in time (`timeout`), or the person's switch to Bypass (`mode`). Persisted: never
 * rename a value.
 */
export const ToolPermissionBy = {
  User: "user",
  Stop: "stop",
  Turn: "turn",
  Restart: "restart",
  Timeout: "timeout",
  /** The person switched the chat to Bypass while the card waited: allowed, as Bypass asks nothing. */
  Mode: "mode",
} as const;
export type ToolPermissionBy = (typeof ToolPermissionBy)[keyof typeof ToolPermissionBy];

/** How a request was allowed: once, or with its `always` grants. Persisted: never rename a value. */
export const PermissionGranted = { Once: "once", Always: "always" } as const;
export type PermissionGranted = (typeof PermissionGranted)[keyof typeof PermissionGranted];

/** Payload of the thread custom event `tool_permission`: one pending row, then one settled row, same id. */
export interface ToolPermissionEvent {
  requestId: string;
  project: string;
  threadId: string;
  /** Claude Code's tool name: Bash, Edit, Write, Read, WebFetch, ExitPlanMode, mcp__…, SandboxNetworkAccess. */
  tool: string;
  /** Claude Code's own sentence, e.g. "Claude wants to run npm install". */
  title?: string;
  /** Short noun phrase, e.g. "Run command". */
  displayName?: string;
  /** Subtitle; for Bash, the command's own description. */
  description?: string;
  /** Why Claude Code asks (terminal escapes removed). */
  reason?: string;
  blockedPath?: string;
  /** The one thing to decide on: the command, the file path, the URL or host. */
  subject?: string;
  /** The tool input, bounded for the log. */
  input: Record<string, unknown>;
  /** ExitPlanMode: the plan to approve, as Markdown. */
  plan?: string;
  /** What "always" would grant; absent when Claude Code offers no standing permission. */
  always?: PermissionGrant[];
  /** Set when a subagent asked. */
  agentId?: string;
  /** Set when a worker of the chat's lead asked: the card names it. */
  worker?: { id: string; title: string };
  state: ToolPermissionState;
  by?: ToolPermissionBy;
  /** Settled allow: once, or with its `always` grants. */
  granted?: PermissionGranted;
  /** Settled plan approval: the mode work continues in. */
  mode?: PermissionMode;
  /** Settled deny: what the person told Claude to do instead. */
  message?: string;
}

/** Is this request a plan waiting for approval? */
export function isPlanRequest(event: { tool?: string; plan?: unknown }): boolean {
  return event.plan !== undefined || event.tool === PLAN_TOOL;
}

/** The person's answers to a `tool_permission` card. */
export const PermissionDecision = {
  Allow: "allow",
  Always: "always",
  ApprovePlan: "approve_plan",
  Deny: "deny",
} as const;
export type PermissionDecision = (typeof PermissionDecision)[keyof typeof PermissionDecision];

/** The person's answer to a `tool_permission` card. */
export type ToolPermissionAnswer =
  | { decision: typeof PermissionDecision.Allow }
  | { decision: typeof PermissionDecision.Always }
  | { decision: typeof PermissionDecision.ApprovePlan; mode: SteadyPermissionMode }
  | { decision: typeof PermissionDecision.Deny; message?: string };

/**
 * Why a running session's mode could not be switched, as a typed code on the error the engine's
 * live control rejects with. Only `AutoUnavailable` is an answer about the plan or the model.
 */
export const ModeSwitchFailure = {
  /** Claude Code refused Auto for this plan or model: the session goes on asking first. */
  AutoUnavailable: "auto_unavailable",
  /** The session no longer takes control requests, or cannot change its mode. */
  Unreachable: "unreachable",
} as const;
export type ModeSwitchFailure = (typeof ModeSwitchFailure)[keyof typeof ModeSwitchFailure];

export interface PermissionRuleView {
  project: string;
  /** The game's title when it is still in the library. */
  title: string;
  rules: string[];
}

export interface PermissionSettingsView {
  /** The mode a new chat starts in: the last steady one chosen. */
  defaultMode: PermissionMode;
  /** Saved "always allow" rules, by game. */
  rules: PermissionRuleView[];
  /** Models whose sessions started in Manual because Auto is not available for the plan or model. */
  autoUnavailable: string[];
}
