/**
 * Which subscription models the picker shows when nobody chose: the newest version of each
 * family, from the provider's newest generation. A model's family and version are read from its
 * provider id (Claude's resolved model, Codex's slug), never from its display name, so a new
 * release replaces the one before it without a table to keep. An id that cannot be read stays
 * in the picker: a model named some new way must never vanish. A catalog of hundreds (OpenRouter,
 * Opper, OpenCode) starts instead with its first few: the newest GPT and Claude it lists, a vendor at a
 * time, then the rest in the order the provider lists them, its free models only when it lists
 * nothing else. Settings choices (`state/model-picker.ts`) override the rule per model; the
 * provider's default always shows.
 */
import { EngineStatusCode, LoginSource } from "../shared/engine-descriptor.ts";
import { EngineId, isMetered } from "../shared/providers.ts";

/** A catalog row as the lineup reads it. */
export interface LineupModel {
  id: string;
  label: string;
  resolvedModel?: string;
  providerDefault?: boolean;
  free?: boolean;
}

/** A model's family and version, read from its provider id. */
interface Lineage {
  family: string;
  major: number;
  minor: number;
}

/** The id that means "whatever the CLI is set to"; it is no model of its own. */
const DEFAULT_MODEL = "default";
/** Catalogs too long to list whole, and how many of their first models the picker lists. */
const FIRST_FEW: Partial<Record<string, number>> = {
  [EngineId.OpenRouter]: 3,
  [EngineId.Opper]: 3,
  [EngineId.OpenCode]: 3,
  [EngineId.Cursor]: 3,
};

/** `claude-opus-5-5`, `claude-opus-5`, `claude-haiku-4-5-20251001`. */
const CLAUDE_ID = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/;
/** `gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.5`. */
const CODEX_ID = /^gpt-(\d+)(?:\.(\d+))?(?:-([a-z]+))?$/;
/** The small families a vendor makes beside its larger models; at one version they come after. */
const SMALL_FAMILIES: ReadonlySet<string> = new Set(["haiku", "mini", "nano"]);
const isSmall = (lineage: Lineage): boolean => SMALL_FAMILIES.has(lineage.family);
/** A Claude id in a metered catalog: `claude-opus-5-5`, or OpenRouter's `claude-sonnet-4.5`. */
const VENDOR_CLAUDE_ID = /^claude-([a-z]+)-(\d+)(?:[-.](\d{1,2}))?(?:-\d{8})?$/;
/** A context variant such as `[1m]` names the same model. */
const VARIANT_SUFFIX = /\[[^\]]*\]$/;

function claudeLineage(model: LineupModel): Lineage | undefined {
  const match = CLAUDE_ID.exec(modelBase(model.resolvedModel ?? model.id));
  if (!match) return undefined;
  return { family: match[1] ?? "", major: Number(match[2]), minor: Number(match[3] ?? 0) };
}

function codexLineage(model: LineupModel): Lineage | undefined {
  const match = CODEX_ID.exec(model.id);
  if (!match) return undefined;
  return { family: match[3] ?? "", major: Number(match[1]), minor: Number(match[2] ?? 0) };
}

const LINEAGE: Partial<Record<string, (model: LineupModel) => Lineage | undefined>> = {
  [EngineId.ClaudeCode]: claudeLineage,
  [EngineId.Codex]: codexLineage,
};

const lineageOf = (engine: string, model: LineupModel): Lineage | undefined => LINEAGE[engine]?.(model);

/** The vendors a metered catalog's `vendor/model` ids are read for, and how. */
const VENDOR_LINEAGE: Partial<Record<string, (id: string) => Lineage | undefined>> = {
  anthropic: (id) => {
    const match = VENDOR_CLAUDE_ID.exec(id);
    return match ? { family: match[1] ?? "", major: Number(match[2]), minor: Number(match[3] ?? 0) } : undefined;
  },
  openai: (id) => codexLineage({ id, label: id }),
};

/** A metered catalog's model as its vendor and version, when its id can be read. */
function vendorRead(model: LineupModel): (Read & { vendor: string }) | undefined {
  const slash = model.id.indexOf("/");
  const vendor = model.id.slice(0, slash);
  const lineage = slash > 0 ? VENDOR_LINEAGE[vendor]?.(model.id.slice(slash + 1)) : undefined;
  return lineage ? { model, lineage, vendor } : undefined;
}

/**
 * A long catalog's models, best first: each vendor's newest GPT or Claude in turn (a vendor at a
 * time, in the order the catalog first names them), then every model it cannot read, as listed.
 */
function newestFirst(listed: readonly LineupModel[], runnable: ReadonlySet<string>): LineupModel[] {
  const vouched = new Set([...runnable].map((id) => id.slice(0, id.indexOf("/"))));
  const byVendor = new Map<string, Read[]>();
  for (const read of listed.map(vendorRead)) {
    // A vendor whose runnable models are known offers only those.
    const refused = read && vouched.has(read.vendor) && !runnable.has(read.model.id);
    if (read && !refused) byVendor.set(read.vendor, [...(byVendor.get(read.vendor) ?? []), read]);
  }
  const queues = [...byVendor.values()].map((reads) =>
    reads.toSorted(
      (a, b) =>
        Number(isNewer(b.lineage, a.lineage)) - Number(isNewer(a.lineage, b.lineage)) ||
        Number(isSmall(a.lineage)) - Number(isSmall(b.lineage)),
    ),
  );
  const ranked: LineupModel[] = [];
  for (let round = 0; queues.some((queue) => round < queue.length); round++) {
    for (const queue of queues) {
      const read = queue[round];
      if (read) ranked.push(read.model);
    }
  }
  // Once some models are known to run, nobody vouches for the rest: they wait under Older models.
  if (runnable.size > 0 && ranked.length > 0) return ranked;
  return [...ranked, ...listed.filter((model) => !ranked.includes(model))];
}

/** No models vouched for: a long catalog's own rule. */
const NOBODY: ReadonlySet<string> = new Set();
/** The engine that says which of another engine's vendor models run for this person, and the vendor. */
const RUNNABLE_SOURCE: Partial<Record<string, { engine: string; vendor: string }>> = {
  [EngineId.OpenCode]: { engine: EngineId.Codex, vendor: "openai" },
};

/**
 * The `vendor/model` ids a long catalog is known to run for this person: for OpenCode, the GPT
 * models a ChatGPT plan runs, as a signed-in Codex lists them (OpenAI refuses others on a plan,
 * though OpenCode lists them). Empty when nobody can say.
 */
export function runnableModels(
  engine: string,
  engines: readonly { id: string; status: { code: string }; models: readonly LineupModel[] }[],
): ReadonlySet<string> {
  const source = RUNNABLE_SOURCE[engine];
  const plan = source && engines.find((candidate) => candidate.id === source.engine);
  if (!source || plan?.status.code !== EngineStatusCode.Ready) return NOBODY;
  return new Set(
    plan.models.filter((model) => model.id !== DEFAULT_MODEL).map((model) => `${source.vendor}/${model.id}`),
  );
}

/**
 * A model id without its context variant. The CLI lists one model under different ids as its
 * cache warms (`claude-fable-5-1[1m]`, then `claude-fable-5-1`), so a saved pick is matched on this.
 */
export const modelBase = (id: string): string => id.replace(VARIANT_SUFFIX, "");

const versionText = (lineage: Lineage): string =>
  lineage.minor ? `${lineage.major}.${lineage.minor}` : String(lineage.major);

const isNewer = (a: Lineage, b: Lineage): boolean => a.major > b.major || (a.major === b.major && a.minor > b.minor);

const sameVersion = (a: Lineage, b: Lineage): boolean => a.major === b.major && a.minor === b.minor;

type Read = { model: LineupModel; lineage: Lineage };

/** Of two rows for one family, the newer; for the same model, the provider default, else the first listed. */
function preferred(kept: Read | undefined, next: Read): Read {
  if (!kept || isNewer(next.lineage, kept.lineage)) return next;
  const promotes = sameVersion(next.lineage, kept.lineage) && next.model.providerDefault && !kept.model.providerDefault;
  return promotes ? next : kept;
}

/** The ids the picker shows by default, in the provider's order. */
export function latestModels(
  engine: string,
  models: readonly LineupModel[],
  runnable: ReadonlySet<string> = NOBODY,
): Set<string> {
  const listed = models.filter((model) => model.id !== DEFAULT_MODEL);
  const firstFew = FIRST_FEW[engine];
  if (firstFew !== undefined) {
    // A sign-in's models start the list; the free ones start it only when there is nothing else.
    const paid = listed.filter((model) => !model.free);
    return new Set(
      newestFirst(paid.length ? paid : listed, runnable)
        .slice(0, firstFew)
        .map((model) => model.id),
    );
  }
  const read = listed.flatMap((model) => {
    const lineage = lineageOf(engine, model);
    return lineage ? [{ model, lineage }] : [];
  });
  const generation = Math.max(...read.map((entry) => entry.lineage.major));
  const newest = new Map<string, Read>();
  for (const entry of read) {
    if (entry.lineage.major !== generation) continue;
    newest.set(entry.lineage.family, preferred(newest.get(entry.lineage.family), entry));
  }
  const kept = new Set([...newest.values()].map((entry) => entry.model.id));
  const unread = (model: LineupModel) => !read.some((entry) => entry.model === model);
  return new Set(listed.filter((model) => kept.has(model.id) || unread(model)).map((model) => model.id));
}

/** The ids the picker shows: the rule, then the person's Settings choices; the provider default always. */
export function shownModels(
  engine: string,
  models: readonly LineupModel[],
  choices: Readonly<Record<string, boolean>> = {},
  runnable: ReadonlySet<string> = NOBODY,
  lineup = true,
): Set<string> {
  const latest = lineup ? latestModels(engine, models, runnable) : NOBODY;
  const shown = (model: LineupModel) => model.providerDefault === true || (choices[model.id] ?? latest.has(model.id));
  return new Set(models.filter((model) => model.id !== DEFAULT_MODEL && shown(model)).map((model) => model.id));
}

/**
 * Does an engine's catalog offer its default lineup? Not a paid one with no account behind it,
 * unless what it lists runs free: OpenCode with no provider signed in starts with its own free
 * models.
 */
export function offersLineup(engine: {
  id: string;
  account?: { source: string } | null;
  models: readonly LineupModel[];
}): boolean {
  const unpaid = isMetered(engine.id) && engine.account?.source === LoginSource.None;
  return !unpaid || engine.models.some((model) => model.free);
}

/**
 * The name a row shows: the provider's, with the version read from its id put after the family
 * name when the provider left it out (a cold Claude cache says "Opus" for Opus 5.5).
 */
export function modelName(engine: string, model: LineupModel): string {
  const lineage = model.id === DEFAULT_MODEL ? undefined : lineageOf(engine, model);
  if (!lineage?.family) return model.label;
  const version = versionText(lineage);
  const head = model.label.slice(0, lineage.family.length);
  const namesFamily = head.toLowerCase() === lineage.family;
  if (!namesFamily || model.label.includes(version)) return model.label;
  return `${head} ${version}${model.label.slice(lineage.family.length)}`;
}
