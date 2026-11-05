/** Model roles preserve explicit selections. Unset slots use the selected CLI's default.
 * Legacy model exports remain for user-edited harness imports; catalogs live in the provider adapters.
 */

import { effortCap } from "./effort-cap.ts";
import type { AnyRecord } from "../types/harness.d.ts";
import type { RunRoles } from "../types/host-api.d.ts";

/** The three jobs a run has. Runs keep them as keys (`roles`, `efforts`): never rename a value. */
export const RoleKey = {
  Planner: "planner",
  Builder: "builder",
  Judge: "judge",
} as const;
export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

/** The fields of a run that role resolution reads and stamps. */
export interface RoleRun {
  engine?: string;
  model?: string;
  roles?: RunRoles;
  rolesApplied?: boolean;
  builderEngine?: string;
  judgeEngine?: string;
  judgeModel?: string;
  effort?: string;
}

/** One model row a composer menu offers. */
export interface ModelRow {
  id: string;
  label: string;
  detail: string;
}

/** The id of every engine the studio runs. The app's copy is `EngineId` in its providers table. */
export const EngineId = {
  ClaudeCode: "claude-code",
  Codex: "codex",
  Bonsai: "bonsai",
  Ollama: "ollama",
  OpenCode: "opencode",
  OpenRouter: "openrouter",
  Opper: "opper",
  LocalServer: "local-server",
  Grok: "grok",
  Cursor: "cursor",
  Genex: "genex",
} as const;
export type EngineId = (typeof EngineId)[keyof typeof EngineId];

export function supportsSessions(
  descriptor: { supportsSessions?: boolean; kind?: string } | null | undefined,
): boolean {
  return descriptor?.supportsSessions ?? descriptor?.kind === "delegated";
}
/** Session engines that are not delegated presets: they hold a session and can cross roles too. */
const SESSION_ENGINES: readonly string[] = [
  EngineId.Bonsai,
  EngineId.OpenCode,
  EngineId.OpenRouter,
  EngineId.Opper,
  EngineId.LocalServer,
  EngineId.Grok,
  EngineId.Cursor,
  EngineId.Genex,
];

/** Session engines: the delegated ones, and the others that hold a session (`SESSION_ENGINES`). */
export function hasSessionRoles(engine: string | null | undefined): boolean {
  return isDelegated(engine) || SESSION_ENGINES.includes(engine as string);
}

/** The completion-only local engines whose jobs run on their own models in the classic loop. */
const COMPLETION_ROLE_ENGINES = new Set<string>([EngineId.Ollama]);

/** Can this engine take a job of a game run: a session engine, or a completion-only local one. */
export function takesRoles(engine: string | null | undefined): boolean {
  return hasSessionRoles(engine) || (engine != null && COMPLETION_ROLE_ENGINES.has(engine));
}

/**
 * May a run on `engine` send this job to `other`? Never the orchestrator, never to its own engine,
 * and both must take roles. Workers go only to a session engine, since the director hires every
 * worker as a session; reviewers ask `engine.complete`, so any engine that takes roles serves.
 */
export function crossesTo(engine: string | null | undefined, key: string, other: string | null | undefined): boolean {
  if (!CROSSABLE.has(key) || !other || other === engine) return false;
  if (!takesRoles(engine) || !takesRoles(other)) return false;
  return key === RoleKey.Judge || hasSessionRoles(other);
}

export const FABLE = "claude-fable-5-1";
export const OPUS = "opus";
export const SOL = "gpt-5.6-sol";
export const TERRA = "gpt-5.6-terra";

/** The rows the composer offers under Claude Code, in menu order. */
export const CLAUDE_CODE_MODELS: ModelRow[] = [];

/**
 * The rows the composer offers under Codex, in menu order. The engine replaces this at
 * runtime with whatever the signed-in account's own catalogue lists (Codex keeps it in
 * `models_cache.json`); this is the fallback when that file has never been written, and the
 * table the harness reasons about when it has no engine to ask.
 */
export const CODEX_MODELS: ModelRow[] = [];

/** Every subscription engine the studio can run a run on, and the models each offers. */
export const ENGINE_MODELS: Record<string, ModelRow[]> = {
  [EngineId.ClaudeCode]: CLAUDE_CODE_MODELS,
  [EngineId.Codex]: CODEX_MODELS,
};

/** Ids of the delegated ("your subscription, their harness") engines, in preference order. */
export const DELEGATED_ENGINES = [EngineId.ClaudeCode, EngineId.Codex];

/** The engine's name as a person says it, for a role line that names one. */
export const ENGINE_LABELS: Record<string, string> = {
  [EngineId.ClaudeCode]: "Claude Code",
  [EngineId.Codex]: "Codex",
  [EngineId.Cursor]: "Cursor",
  [EngineId.Genex]: "Genex",
};

/** "Claude Code", "Codex", or the id itself for an engine nobody named. */
export function engineLabel(engine: string | null | undefined): string {
  return ENGINE_LABELS[engine as string] ?? String(engine ?? "");
}

/** True when this engine hires a vendor harness — the engines that have roles at all. */
export function isDelegated(engine: string | null | undefined): boolean {
  return engine === EngineId.ClaudeCode || engine === EngineId.Codex;
}

/** The catalog for a session provider, or `[]` for a completion-only engine. */
export function modelsFor(engine: string | null | undefined): ModelRow[] {
  return ENGINE_MODELS[engine as string] ?? [];
}

/** The three jobs, in the order the roles page shows them. */
export const ROLES: Array<{ key: RoleKey; label: string; detail: string }> = [
  { key: RoleKey.Planner, label: "Orchestrator", detail: "leads the Loop" },
  { key: RoleKey.Builder, label: "Workers", detail: "the workers the lead starts" },
  { key: RoleKey.Judge, label: "Judges", detail: "second opinions the lead asks for" },
];

/**
 * Resolve a single pick into the three roles. `undefined` in a slot means "the engine's own
 * default" — the same convention `engine.complete` and `engine.delegate` already use.
 */
export function resolveRoles(
  _engine: string | null | undefined,
  model: string | null | undefined,
): Pick<RunRoles, RoleKey> {
  const picked = model && model !== "default" ? String(model) : undefined;
  return { planner: picked, builder: picked, judge: picked };
}

/** The jobs the composer may send to another engine. Never the orchestrator. */
const CROSSABLE = new Set<string>([RoleKey.Builder, RoleKey.Judge]);

/**
 * Explicit roles from the composer, cleaned: "default"/empty → undefined (the engine's own
 * default), unknown keys dropped. Null when nothing usable was given, so callers fall back to
 * the preset table.
 *
 * `roles.engines` may put the workers or the judges on another engine. It is kept only where it
 * means something: an engine other than the run's own that the run may send that job to
 * (`crossesTo`) — workers only to a session engine, reviewers to a completion-only local engine
 * too. The record carries `engines` with just those slots — and none at all when nothing is
 * crossed, so a single-subscription record reads byte for byte as it always did.
 */
export function normalizeRoles(engine: string, input: unknown): RunRoles | null {
  if (!input || typeof input !== "object") return null;
  // What the composer sent, before it is checked field by field below.
  const roles = input as AnyRecord;
  const out: AnyRecord = {};
  const engines: Record<string, string> = {};
  let any = false;
  const given: AnyRecord = roles.engines && typeof roles.engines === "object" ? roles.engines : {};
  for (const { key } of ROLES) {
    const other = crossedEngine(engine, key, given);
    if (other) engines[key] = other;
    const slot = slotModel(roles[key], Boolean(other));
    if (!slot.given) continue;
    any = true;
    out[key] = slot.model;
  }
  if (!any) return null;
  // A slot the composer left out inherits the preset for that engine's default pick.
  const preset = resolveRoles(engine, undefined);
  for (const { key } of ROLES) if (!(key in out)) out[key] = preset[key];
  if (Object.keys(engines).length) out.engines = engines;
  const efforts = namedEfforts(roles.efforts);
  if (Object.keys(efforts).length) out.efforts = efforts;
  return out as RunRoles;
}

/**
 * One slot as the composer sent it: a model id, "default"/empty for the engine's own default,
 * or not given (left to the preset).
 */
function slotModel(raw: unknown, crossed: boolean): { given: boolean; model?: string } {
  // A slot sent to the other engine with no model named: that engine's own default.
  if (raw === undefined || raw === null) return { given: crossed, model: undefined };
  const id = String(raw).trim();
  return { given: true, model: id && id !== "default" ? id : undefined };
}

/** The other engine a slot was sent to, or "" when it stays on the run's own. */
function crossedEngine(engine: string, key: string, given: AnyRecord): string {
  const other = typeof given[key] === "string" ? given[key].trim() : "";
  return crossesTo(engine, key, other) ? other : "";
}

/** The efforts the composer named, one per role, and nothing else it sent. */
function namedEfforts(input: unknown): Record<string, string> {
  const efforts: Record<string, string> = {};
  if (!input || typeof input !== "object") return efforts;
  const given = input as AnyRecord;
  for (const { key } of ROLES) if (typeof given[key] === "string") efforts[key] = given[key];
  return efforts;
}

/** The engine a role runs on inside a roles record: the run's own unless the record crossed it. */
function engineOfRole(engine: string, roles: RunRoles | null | undefined, key: string): string {
  return (roles?.engines as Record<string, string | undefined> | undefined)?.[key] ?? engine;
}

/** Short human name for a model id in a role line ("Fable plans · Opus builds & judges"). */
export function roleName(engine: string, model: string | undefined): string {
  if (model === undefined || model === "default") return isDelegated(engine) ? "default" : "same";
  return String(model);
}

/**
 * One line for the picker: what a pick (or an explicit roles record) means for the run. Local
 * engines have nothing to explain; a delegated pick spells out the split so nobody is
 * surprised by the receipt. `roles` is the explicit per-role selection, when there is one.
 */
export function describeRoles(engine: string, model?: string | null, roles: unknown = null): string {
  if (!hasSessionRoles(engine)) return "";
  const resolved = normalizeRoles(engine, roles) ?? resolveRoles(engine, model);
  // A role on the other subscription says so by name: "Opus on Claude Code builds".
  const name = (key: RoleKey): string => {
    const on = engineOfRole(engine, resolved, key);
    const who = roleName(on, resolved[key]);
    return on === engine ? who : `${who} on ${engineLabel(on)}`;
  };
  const planner = name(RoleKey.Planner);
  const builder = name(RoleKey.Builder);
  const judge = name(RoleKey.Judge);
  if (planner === builder && builder === judge) return `${planner} plans, builds and judges`;
  if (builder === judge) return `${planner} plans · ${builder} builds & judges`;
  return `${planner} plans · ${builder} builds · ${judge} judges`;
}

/**
 * Stamp a run spec with its roles once, at launch. `run.model` stays the builders' model —
 * every build site already reads it — the planner reads `run.roles.planner`, the critics
 * `run.judgeModel`. Explicit roles on the spec (the composer's roles page) are applied as
 * given; a spec that already carries applied roles (a resume, a re-dispatch) is returned as
 * it is, because resolving twice from the builders' model would demote the planner.
 */
export function withRoles<T extends RoleRun>(run: T): T & RoleRun & { roles: RunRoles } {
  const engine = run.engine ?? EngineId.Ollama;
  const explicit = normalizeRoles(engine, run.roles);
  if (run.roles && run.rolesApplied) return run as T & RoleRun & { roles: RunRoles };
  const roles: RunRoles = explicit ?? resolveRoles(engine, run.model);
  const next: RoleRun = { ...run, roles, rolesApplied: true };
  if (roles.builder === undefined) delete next.model;
  else next.model = roles.builder;
  // The workers' engine is written only when it is not the run's own, so a run on one
  // subscription carries nothing new; every build site reads `roleEngine(run, RoleKey.Builder)`.
  const builderEngine = engineOfRole(engine, roles, RoleKey.Builder);
  if (builderEngine !== engine) next.builderEngine = builderEngine;
  else delete next.builderEngine;
  // The composer's crossed judge wins over a judgeEngine the spec arrived with (the reference
  // path's pickJudge); with nothing crossed the spec's own answer stands, then the run's engine.
  const judgeEngine = roles.engines?.judge ?? run.judgeEngine ?? engine;
  next.judgeEngine = judgeEngine;
  // The judges' model speaks for the engine it was picked on — the run's own, or the one the
  // composer crossed to. A critic on any other engine keeps that engine's own default; the
  // policy only speaks for the engine it was resolved on.
  if (judgeEngine === engine || roles.engines?.judge === judgeEngine) {
    if (roles.judge !== undefined) next.judgeModel = roles.judge;
    else delete next.judgeModel;
  }
  return next as T & RoleRun & { roles: RunRoles };
}

/**
 * The engine a job runs on. The orchestrator's is the run's own; the workers' and the judges'
 * may be the other subscription (`run.builderEngine`, `run.judgeEngine`). Every site that
 * starts a builder or asks a critic reads this, never `run.engine`.
 */
export function roleEngine(run: RoleRun | null | undefined, key: string): string {
  const engine = run?.engine ?? EngineId.Ollama;
  if (key === RoleKey.Builder) return run?.builderEngine ?? engine;
  if (key === RoleKey.Judge) return run?.judgeEngine ?? engine;
  return engine;
}

/**
 * A model id that is valid on `engine`, or undefined for that engine's own default. The
 * builders' pick where the builders run there, else the orchestrator's, else the judges'.
 * Before two subscriptions could share a run every job's model was valid everywhere; now a
 * Codex slug handed to the Claude CLI is a session that never starts, so a site that speaks to
 * an engine other than the one its model was picked on asks here.
 */
export function modelOn(run: RoleRun | null | undefined, engine?: string | null): string | undefined {
  const target = engine ?? run?.engine ?? EngineId.Ollama;
  if (roleEngine(run, RoleKey.Builder) === target) return run?.model;
  if (roleEngine(run, RoleKey.Planner) === target) return run?.roles?.planner;
  if (roleEngine(run, RoleKey.Judge) === target) return run?.judgeModel;
  return undefined;
}

/**
 * The orchestrator's model: `run.roles.planner`, or — on a spec no policy has stamped yet —
 * the one model it carries, when that model is the run's own engine's to use.
 */
export function plannerModel(run: RoleRun | null | undefined): string | undefined {
  return (
    run?.roles?.planner ??
    (roleEngine(run, RoleKey.Builder) === roleEngine(run, RoleKey.Planner) ? run?.model : undefined)
  );
}

/**
 * How a Codex, OpenCode, Grok Build or Cursor session spells a studio tool. Claude Code (on a plan or on
 * Genex credits) receives the
 * studio's tools as MCP tools and calls them by name; the others have no tool channel of the studio's, so the
 * studio ships a bridge and the session runs it as a shell command. The two spellings are the ONLY thing in
 * the whole harness that branches on the engine, and every prompt that mentions a tool renders
 * it through `toolCall` — a Claude session that reads a bridge command tries to run it, and a
 * Codex session that reads an `mcp__` name asks for a tool it does not have.
 *
 * The literal must agree with `BRIDGE_DIR` in `src/substrate/engines/studio-bridge.ts`, which
 * is where the file is actually written; the harness seed cannot import from the app, so a
 * conformance test holds the two together.
 */
export const BRIDGE_TOOL_CMD = "node .studio/bridge/tool.mjs";

/** The engines whose sessions are Claude Code's and take the studio's tools as MCP tools (Genex runs Claude Code). */
const MCP_ENGINES: readonly string[] = [EngineId.ClaudeCode, EngineId.Genex];

/** True when this engine's session calls the studio's tools by their MCP names. */
function speaksMcp(engine: string | null | undefined): boolean {
  return MCP_ENGINES.includes(engine as string);
}

/** The engines whose sessions reach the studio's tools through the bridge command. */
const BRIDGE_ENGINES: readonly string[] = [EngineId.Codex, EngineId.OpenCode, EngineId.Grok, EngineId.Cursor];

/** One studio tool, spelled the way this engine's session must write it. */
export function toolCall(engine: string | null | undefined, name: unknown): string {
  const tool = String(name ?? "");
  if (speaksMcp(engine)) return `mcp__studio__${tool}`;
  if (BRIDGE_ENGINES.includes(engine as string)) return `${BRIDGE_TOOL_CMD} ${tool}`;
  // A local engine drives its tools through the studio's own tool loop, where a tool is its
  // bare name and neither spelling exists.
  return tool;
}

/** The clause at the head of a TOOLS block: how this engine calls the tools listed under it. */
export function toolSyntax(engine: string | null | undefined): string {
  if (speaksMcp(engine)) return "call each one by its name, mcp__studio__<name>";
  if (BRIDGE_ENGINES.includes(engine as string)) return `run each one as \`${BRIDGE_TOOL_CMD} <name> --field=value\``;
  return "call each one by its name";
}

/** The effort the user chose for `role`: the composer's primary dial belongs to the planner, never another provider's worker. */
export function chosenEffort(run: RoleRun, role: string): string | undefined {
  return run.roles?.efforts?.[role as RoleKey] ?? (role === RoleKey.Planner ? run.effort : undefined);
}

/** The effort `role` runs at: the user's choice for it, a worker's and a reviewer's capped (effort-cap.ts). */
export function roleEffort(run: RoleRun, role: string): string | undefined {
  return effortCap(chosenEffort(run, role), role === RoleKey.Planner);
}
