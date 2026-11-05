/** Model roles preserve explicit selections. Unset slots use the selected CLI's default.
 * Legacy model exports remain for user-edited harness imports; catalogs live in the provider adapters.
 */
import { ReasoningEffort } from "./model-preferences.ts";
import type { RunRoles } from "./protocol.ts";
import { EngineId } from "./providers.ts";

export const FABLE = "claude-fable-5-1";
export const OPUS = "opus";
export const SOL = "gpt-5.6-sol";
export const TERRA = "gpt-5.6-terra";

export type RoleKey = "planner" | "builder" | "judge";
export interface RoleRow {
  readonly key: RoleKey;
  readonly label: string;
  readonly detail: string;
}
export interface EngineModelRow {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

/** The rows the composer offers under Claude Code, in menu order. */
export const CLAUDE_CODE_MODELS: readonly EngineModelRow[] = [];

/** The fallback rows under Codex when the account's own catalogue has never been written. */
export const CODEX_MODELS: readonly EngineModelRow[] = [];

/** Every subscription engine the studio can run a run on, and the models each offers. */
export const ENGINE_MODELS: Readonly<Record<string, readonly EngineModelRow[]>> = {
  [EngineId.ClaudeCode]: CLAUDE_CODE_MODELS,
  [EngineId.Codex]: CODEX_MODELS,
};

/** Ids of the delegated ("your subscription, their harness") engines, in preference order. */
export const DELEGATED_ENGINES: readonly string[] = [EngineId.ClaudeCode, EngineId.Codex];

/** The engine's name as a person says it, for a role line that names one. */
export const ENGINE_LABELS: Readonly<Record<string, string>> = {
  [EngineId.ClaudeCode]: "Claude Code",
  [EngineId.Codex]: "Codex",
  [EngineId.Cursor]: "Cursor",
  [EngineId.Genex]: "Genex",
};

/** The three jobs, in the order the roles page shows them. */
export const ROLES: readonly RoleRow[] = [
  { key: "planner", label: "Orchestrator", detail: "leads the Loop" },
  { key: "builder", label: "Workers", detail: "the workers the lead starts" },
  { key: "judge", label: "Judges", detail: "second opinions the lead asks for" },
];

/** The jobs the composer may send to another engine. Never the orchestrator. */
const CROSSABLE: ReadonlySet<RoleKey> = new Set(["builder", "judge"]);

const own = (record: object, key: string) => Object.hasOwn(record, key);

/** "Claude Code", "Codex", or the id itself for an engine nobody named. */
export function engineLabel(engine: string | null | undefined): string {
  return (engine != null && own(ENGINE_LABELS, engine) ? ENGINE_LABELS[engine] : undefined) ?? String(engine ?? "");
}

/** True when this engine hires a vendor harness — the engines that have roles at all. */
export function isDelegated(engine: string | null | undefined): boolean {
  return engine === EngineId.ClaudeCode || engine === EngineId.Codex;
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
const COMPLETION_ROLE_ENGINES: ReadonlySet<string> = new Set([EngineId.Ollama]);

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
  if (!CROSSABLE.has(key as RoleKey) || !other || other === engine) return false;
  if (!takesRoles(engine) || !takesRoles(other)) return false;
  return key === "judge" || hasSessionRoles(other);
}

/** The catalog for a session provider, or `[]` for a completion-only engine. */
export function modelsFor(engine: string | null | undefined): readonly EngineModelRow[] {
  return (engine != null && own(ENGINE_MODELS, engine) ? ENGINE_MODELS[engine] : undefined) ?? [];
}

/**
 * Resolve a single pick into the three roles. `undefined` in a slot means "the engine's own
 * default".
 */
export function resolveRoles(_engine: string, model: string | null | undefined): RunRoles {
  const picked = model && model !== "default" ? String(model) : undefined;
  return { planner: picked, builder: picked, judge: picked };
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

/**
 * Explicit roles from the composer, cleaned: "default"/empty → undefined (the engine's own
 * default), unknown keys dropped; null when nothing usable was given. `engines` is kept only for
 * a slot the run may send to that engine (`crossesTo`), and `efforts` only for string values.
 */
export function normalizeRoles(engine: string, roles: unknown): RunRoles | null {
  const given = record(roles);
  if (!given) return null;
  const engines = crossedEngines(engine, given);
  const out = namedModels(given, engines);
  if (!out) return null;
  // A slot the composer left out inherits the preset for that engine's default pick.
  const preset = resolveRoles(engine, undefined);
  for (const { key } of ROLES) if (!(key in out)) out[key] = preset[key];
  if (Object.keys(engines).length) out.engines = engines;
  const efforts = keptEfforts(given);
  if (efforts) out.efforts = efforts;
  return out;
}

type CrossedEngines = NonNullable<RunRoles["engines"]>;

/** The slots the composer sent to another engine the run may send them to. Never the orchestrator. */
function crossedEngines(engine: string, given: Record<string, unknown>): CrossedEngines {
  const engines: CrossedEngines = {};
  const crossed = record(given.engines) ?? {};
  for (const { key } of ROLES) {
    if (key === "planner") continue;
    const raw = crossed[key];
    const other = typeof raw === "string" ? raw.trim() : "";
    if (crossesTo(engine, key, other)) engines[key] = other;
  }
  return engines;
}

/** The models the composer named per role, or null when it named none (and crossed no empty slot). */
function namedModels(given: Record<string, unknown>, engines: CrossedEngines): RunRoles | null {
  const out: RunRoles = {};
  let any = false;
  for (const { key } of ROLES) {
    const value = given[key];
    if (value === undefined || value === null) {
      // A slot sent to the other engine with no model named: that engine's own default.
      if (key !== "planner" && engines[key]) {
        any = true;
        out[key] = undefined;
      }
      continue;
    }
    any = true;
    const id = String(value).trim();
    out[key] = id && id !== "default" ? id : undefined;
  }
  return any ? out : null;
}

/** The efforts the composer named per role, as strings; null when it named none. */
function keptEfforts(given: Record<string, unknown>): Partial<Record<RoleKey, string>> | null {
  const efforts = record(given.efforts);
  if (!efforts) return null;
  const kept: Partial<Record<RoleKey, string>> = {};
  for (const { key } of ROLES) {
    const effort = efforts[key];
    if (typeof effort === "string") kept[key] = effort;
  }
  return Object.keys(kept).length ? kept : null;
}

/** The engine a role runs on inside a roles record: the run's own unless the record crossed it. */
function engineOfRole(engine: string, roles: RunRoles, key: RoleKey): string {
  return (key === "planner" ? undefined : roles.engines?.[key]) ?? engine;
}

/** Short human name for a model id in a role line ("Fable plans · Opus builds & judges"). */
export function roleName(engine: string | null | undefined, model: string | null | undefined): string {
  if (model === undefined || model === "default") return isDelegated(engine) ? "default" : "same";
  return String(model);
}

/**
 * One line for the picker: what a pick (or an explicit roles record) means for the run. Local
 * engines have nothing to explain.
 */
export function describeRoles(engine: string, model: string | null | undefined, roles: unknown = null): string {
  if (!hasSessionRoles(engine)) return "";
  const resolved = normalizeRoles(engine, roles) ?? resolveRoles(engine, model);
  // A role on the other subscription says so by name: "Opus on Claude Code builds".
  const name = (key: RoleKey) => {
    const on = engineOfRole(engine, resolved, key);
    const who = roleName(on, resolved[key]);
    return on === engine ? who : `${who} on ${engineLabel(on)}`;
  };
  const planner = name("planner");
  const builder = name("builder");
  const judge = name("judge");
  if (planner === builder && builder === judge) return `${planner} plans, builds and judges`;
  if (builder === judge) return `${planner} plans · ${builder} builds & judges`;
  return `${planner} plans · ${builder} builds · ${judge} judges`;
}

/** Every effort an engine names, from least to most thinking. */
const EFFORT_ORDER: readonly string[] = Object.values(ReasoningEffort);

/**
 * The most a worker or a reviewer thinks. Deeper thinking fills a round's context with tokens
 * nobody reads, paid again on every later call, and outlasts a reviewer's few minutes; the lead
 * plans at the user's own setting.
 */
export const WORKER_EFFORT_CEILING = ReasoningEffort.High;

/**
 * The effort `role` runs at for the user's `effort`: the lead's as set; a worker's or a reviewer's
 * at most `WORKER_EFFORT_CEILING`, so a lower setting is every role's. A level no engine names is
 * left as it is. The seed's copy is loop/effort-cap.ts `effortCap`.
 */
export function roleEffortCap(role: RoleKey, effort: string | undefined): string | undefined {
  if (effort === undefined || role === "planner") return effort;
  return EFFORT_ORDER.indexOf(effort) > EFFORT_ORDER.indexOf(WORKER_EFFORT_CEILING) ? WORKER_EFFORT_CEILING : effort;
}
