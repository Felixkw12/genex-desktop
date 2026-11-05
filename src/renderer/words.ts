/**
 * Words — the one place a harness word becomes a user word.
 *
 * The harness talks to itself in run ids, facet titles, verdict sources and tool names. None of
 * that is the user's language: they asked for a game, and the only questions they ever ask are
 * "is my game being worked on?" and "what happened to it?". Every label in the app that starts
 * life inside `src/harness-seed` passes through this module first, so the translation is written
 * once, tested once (tests/conformance/words.test.ts), and cannot drift between the titlebar,
 * the rail, the chat and the graph.
 *
 * Two rules hold this module together:
 *   1. It is pure — no React, no window, and no runtime imports but the shared run rules
 *      (`shared/run-state.ts`), which decide what a round's verdict *was* (this decides what it is
 *      called), the app's words in the reader's language (`shared/i18n.ts`), and the vocabularies
 *      its tables are keyed by (the platform, how a chat's file opens, Claude Code's permission
 *      modes and their own names, an agent's screen deeds) and the time units it counts in. It is
 *      a lookup table.
 *   2. No output may carry an identifier. Run ids and commit shas belong behind "Details";
 *      `withoutIds` is the last gate every phrase passes through, so even a facet title the
 *      director invented with a sha in it comes out readable.
 */

import { InteractionObjective, InteractionSource } from "../shared/run-summary.ts";
import type { GameEngine } from "../shared/game-engine.ts";
import { WorkerStopCode } from "../shared/workers.ts";
import { type PackageManager, type SandboxProblemCode, type StartStep, StudioPlatform } from "../shared/boot.ts";
import { ChatFileOpen } from "../shared/chat-files.ts";
import { sizeWords } from "../shared/byte-size.ts";
import { homePath, pathLeaf } from "../shared/path-label.ts";
import { freeableBytes, StorageKind, type StorageFreed, type StorageSpace } from "../shared/storage-space.ts";
import { DataFolderProblem } from "../shared/data-folder.ts";
import { SkippedBy, type SkippedFile } from "../shared/chat-rewind.ts";
import { LiveBehindReason } from "../shared/live-behind.ts";
import { PlayCardAction, PlayChangeOutcome, PlayCoverRefusal, PlayMobileSupport } from "../shared/play-manage.ts";
import { AutoResumeCause, type CustomEvent, type CustomPayload, LoopRefusal } from "../shared/custom-events.ts";
import { EngineFailureKind } from "../shared/engine-requests.ts";
import { LocalServerProblem } from "../shared/local-server.ts";
import { computerSettingQuestion, type GithubLookupProblem } from "../shared/plugins.ts";
import { computerControlOffered } from "../shared/computer-control.ts";
import { CloudBuildFailure, type GenexPublishPhase, MacNotarizeFailure } from "../shared/genex.ts";
import { PlayCategory, PlayNote, PlayRemixRefusal, PlayShelf, RemixStep } from "../shared/play.ts";
import {
  InstallFailure,
  LaunchFailure,
  NativeArch,
  NativePlatform,
  type NotHere,
  WhyNotHere,
} from "../shared/play-native.ts";
import { PublishTarget } from "../shared/publish-platforms.ts";
import { CreditKind } from "../shared/play-credits.ts";
import { PurchaseProblem } from "../shared/play-purchase.ts";
import { ItemReportReason, StoreRefusal } from "../shared/store-items.ts";
import { AvatarBody, AvatarEyes, AvatarGear, BlockState } from "../shared/avatar-recipe.ts";
import { HANDLE_LENGTH, HandleState } from "../shared/handle.ts";
import { MakingKind } from "../shared/asset-making.ts";
import { ShareMiss } from "../shared/asset-library.ts";
import { RoundOutcome, roundOutcome, stoppedSource } from "../shared/run-state.ts";
import type { OutcomeView, RunEvidence } from "../shared/run-summary.ts";
import { CoreFact, LoopProfile } from "../shared/project-facts.ts";
import {
  GrantKind,
  isPlanRequest,
  permissionModeWords,
  PermissionGranted,
  PermissionMode,
  type PermissionGrant,
  type RuleScope,
  ToolPermissionBy,
  type ToolPermissionEvent,
  ToolPermissionState,
} from "../shared/permissions.ts";
import { RunSharingDeleteOutcome, type RunSharingDeleteResult } from "../shared/run-sharing.ts";
import type { ProviderBuilderUse } from "../shared/provider-skills.ts";
import type { FinishCheckState, IterationStatus } from "./run-graph.ts";
import type { LeadFace } from "./run-tree.ts";
import type { BuildOutcome } from "./run-graph-builds.ts";
import type { HealthFinding } from "../shared/preview-contract.ts";
import type { CommandState } from "./state/command-runs.ts";
import type { JobState } from "./panels/plugins/genex/genex-view.ts";
import { formatList, intlLocale, t, tc } from "../shared/i18n.ts";
import { JUDGE_PLAY_TOOL_NAME } from "../shared/chat-judge.ts";
import {
  APP_LOOK_TOOL_NAME,
  AppLookAccessKind,
  JOB_PERMISSION_TOOL,
  JobState as BackgroundJobState,
  JobStopper,
  JobTool,
} from "../shared/jobs.ts";
import { type ScreenAct, ScreenDeed } from "../shared/agent-screen.ts";
import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS } from "../shared/duration.ts";
import { type ConnectorStep, StepAction } from "./chat/connector-steps.ts";
import { MentionMiss } from "../shared/prompt-mention.ts";
import { AssetScope, LibraryKind } from "../shared/asset-library.ts";
import { KindChoice } from "./play/asset-tiles.ts";

export type ToolIcon = "think" | "write" | "run" | "read" | "see" | "game";

/** A status has two shapes: a sentence for the titlebar, and a chip for the narrow rail. */
export interface StatusWords {
  line: string;
  short: string;
}

/** How wide the rail chip may be before it is clipped — "Crash damage · round 3" fits. */
const SHORT_MAX = 24;
/** How much of a plugin's arguments a permission request quotes before it is clipped. */
const CONSENT_ARGS_MAX = 120;

const RUN_ID = /\brun_[0-9a-z]+/gi;
/**
 * Every sha the harness prints is already shortened — `head.slice(0, 10)`, `(69f573d)` in a note
 * — so a 12-character floor never fired. Seven characters is the shortest git prints, and the
 * two lookaheads (a digit and a hex letter) keep ordinary words like "defaced" and dates like
 * "20260908" out of the net.
 */
const COMMIT_SHA = /\b(?=[0-9a-f]{7,40}\b)(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gi;
/** `refs/studio/runs/run_x/integration` — a whole git ref, which stripping the run id alone leaves as rubble. */
const GIT_REF = /\brefs\/[^\s)]+/gi;

/**
 * Strip the identifiers out of a phrase. The harness stamps run ids, commit shas and git refs
 * into free text (facet titles, stop reasons, the lead's own decisions), and a user reading
 * "run_fixture123456" learns nothing — so they are removed here rather than trusted not to appear.
 */
export function withoutIds(text: string): string {
  return (
    text
      .replace(GIT_REF, "")
      .replace(RUN_ID, "")
      .replace(COMMIT_SHA, "")
      // The brackets a stripped id leaves, with the space before them: "in git (refs/…): ask" reads "in git: ask".
      .replace(/\s*\(\s*\)/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*·\s*(?=·|$)/g, "")
      .replace(/^\s*[·—-]\s*/, "")
      .trim()
  );
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Close a phrase the model wrote, so the sentence the card puts after it does not run into it.
 * A lead's plan summary and a refusal both arrive as free text with no promise of a full stop.
 */
function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function settle(words: StatusWords): StatusWords {
  return { line: withoutIds(words.line), short: clip(withoutIds(words.short), SHORT_MAX) };
}

/** Whole-status phrases: the chat's own work and the run stages that name no part. */
const PHRASES: Array<[RegExp, (match: RegExpMatchArray) => StatusWords]> = [
  [/^thinking$/i, () => ({ line: t("Thinking"), short: t("Thinking") })],
  [/^compacting the conversation$/i, () => ({ line: t("Compacting the conversation"), short: t("Compacting") })],
  [
    /^self-improving(?: · (.+))?$/i,
    (m) => ({
      line: m[1] ? t("Improving its own craft · {detail}", { detail: m[1] }) : t("Improving its own craft"),
      short: t("Improving"),
    }),
  ],
  [/^planning facets$/i, () => ({ line: t("Planning the parts"), short: t("Planning") })],
  [
    /^building the (?:shared base|starting point)$/i,
    () => ({ line: t("Building the starting point"), short: t("Starting point") }),
  ],
  [
    /^plan ready — waiting for steering$/i,
    () => ({ line: t("The plan is ready — waiting for your go-ahead"), short: t("Plan ready") }),
  ],
  [/^integrating facets$/i, () => ({ line: t("Putting the parts together"), short: t("Merging") })],
  [/^judging the merged build$/i, () => ({ line: t("Reviewing the merged build"), short: t("Reviewing") })],
  [/^integration facet$/i, () => ({ line: t("Working on the merged build"), short: t("Merging") })],
  [/^global verdict$/i, () => ({ line: t("Deciding what this build is worth"), short: t("Deciding") })],
  [
    /^director judging (.+)$/i,
    (m) => ({ line: t("The lead is reviewing {part}", { part: m[1] }), short: t("Reviewing {part}", { part: m[1] }) }),
  ],
  [
    /^director playtesting (.+)$/i,
    (m) => ({ line: t("The lead is playing {part}", { part: m[1] }), short: t("Playing {part}", { part: m[1] }) }),
  ],
  [/^director finishing$/i, () => ({ line: t("The lead is finishing the build"), short: t("Finishing") })],
  [/^director$/i, () => ({ line: t("The lead is watching the workers"), short: t("The lead") })],
  // A Loop led in place: its lead builds in the project itself, often with no workers at all.
  [/^lead in place$/i, () => ({ line: t("The lead is building in your project"), short: t("The lead") })],
  [/^lead in place finishing$/i, () => ({ line: t("A second AI is looking at your game"), short: t("Final look") })],
  [
    /^iteration (\d+) — building$/i,
    (m) => ({ line: t("Round {round} · building", { round: m[1] }), short: t("Round {round}", { round: m[1] }) }),
  ],
  [
    /^iteration (\d+) — judging blind$/i,
    (m) => ({ line: t("Round {round} · reviewing", { round: m[1] }), short: t("Round {round}", { round: m[1] }) }),
  ],
  [
    /^rate limited — retrying in (\d+)s$/i,
    (m) => ({
      line: t("The model's rate limit is holding us up — trying again in {seconds}s", { seconds: m[1] }),
      short: t("Waiting"),
    }),
  ],
  [/^scouting the game$/i, () => ({ line: t("Looking at the game as it is now"), short: t("Looking") })],
  [
    /^checking (.+) in the preview$/i,
    (m) => ({ line: t("Checking {what} in the preview", { what: m[1] }), short: t("Checking") }),
  ],
  [
    /^observation outage — retrying evidence in (\d+)s/i,
    (m) => ({
      line: t("The studio could not see the game — looking again in {seconds}s", { seconds: m[1] }),
      short: t("Looking again"),
    }),
  ],
  [
    /^(.+) is overloaded — waiting (\d+)s before retrying/i,
    (m) => ({
      line: t("{provider} is busy — trying again in {seconds}s", { provider: capitalise(m[1] ?? ""), seconds: m[2] }),
      short: t("Waiting"),
    }),
  ],
  // The chat's own two states, which name the engine to itself: the user reads the work, not the
  // tool doing it.
  [
    /^.+ interviewing for .+$/i,
    () => ({ line: t("The studio is working out what to build"), short: t("Interviewing") }),
  ],
  [/^.+ building (.+)$/i, (m) => ({ line: t("Building {what}", { what: m[1] }), short: t("Building") })],
];

/** A builder's own status: "<part> — <what it is doing>". The part keeps its own title. */
const PART_PHRASES: Array<[RegExp, (part: string, match: RegExpMatchArray) => StatusWords]> = [
  [
    /^iteration (\d+)$/i,
    (part, m) => ({
      line: t("{part} · round {round}", { part, round: m[1] }),
      short: t("{part} · round {round}", { part, round: m[1] }),
    }),
  ],
  [
    /^spike on .+$/i,
    (part) => ({ line: t("{part} · a focused fix for one check", { part }), short: t("{part} · fixing", { part }) }),
  ],
  [
    /^verifying$/i,
    (part) => ({ line: t("{part} · checking the round", { part }), short: t("{part} · checking", { part }) }),
  ],
  [
    /^fixing review findings$/i,
    (part) => ({ line: t("{part} · fixing what the review found", { part }), short: t("{part} · fixing", { part }) }),
  ],
  [
    /^reverting a regression$/i,
    (part) => ({ line: t("{part} · undoing something that broke", { part }), short: t("{part} · undoing", { part }) }),
  ],
  [
    /^provider overloaded, retrying in (\d+)s$/i,
    (part, m) => ({
      line: t("{part} · the model is busy — trying again in {seconds}s", { part, seconds: m[1] }),
      short: t("{part} · waiting", { part }),
    }),
  ],
  [
    /^waiting for its model provider \((.+)\)$/i,
    (part, m) => ({
      line: t("{part} · waiting for the model provider ({provider})", { part, provider: m[1] }),
      short: t("{part} · waiting", { part }),
    }),
  ],
];

/** The phases the harness hangs off a title with " — ": stripped when the title itself has a dash. */
const PHASE_SUFFIX =
  /\s+—\s+(iteration \d+|verifying|spike on .+|fixing review findings|reverting a regression|provider overloaded.*|waiting for its model provider.*)$/i;

/**
 * Turn a harness status line into what the user reads. The harness prefixes almost every status
 * with `run <runId> ·`; that prefix is dropped, not shortened, because the old rail chip kept
 * exactly that segment and read "run run_mtrfu5…" for the whole run.
 */
export function statusWords(status: string): StatusWords {
  const raw = (status ?? "").trim();
  if (!raw || raw.toLowerCase() === "idle") return { line: "", short: "" };
  const rest = withoutRunPrefix(raw);
  if (!rest) return settle({ line: t("The build is running"), short: t("Building") });
  // An unrecognised status still must not read "run": the run prefix was already dropped, so
  // the chip takes the first thing the harness actually named, clipped by `settle`.
  const unrecognised = { line: capitalise(rest), short: (rest.split("·")[0] ?? "").trim() || rest };
  return settle(phraseWords(rest) ?? partStatusWords(rest) ?? unrecognised);
}

/** The status with the harness's `run <runId> ·` segment dropped. */
function withoutRunPrefix(raw: string): string {
  const segments = raw
    .split("·")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const inRun = /^run(\s+\S+)?$/i.test(segments[0] ?? "");
  return (inRun ? segments.slice(1) : segments).join(" · ");
}

function phraseWords(rest: string): StatusWords | null {
  for (const [pattern, words] of PHRASES) {
    const match = rest.match(pattern);
    if (match) return words(match);
  }
  return null;
}

/**
 * A builder's status is `<title> — <phase>`, and a title the lead invented may hold a dash of
 * its own ("Crash damage — deformation — iteration 3"). Read the last dash first and keep that
 * reading only when what follows is a phase this module knows; otherwise fall back to the first
 * dash and strip a known phase off the end, so no title can carry "iteration 3" to the titlebar.
 */
function partStatusWords(rest: string): StatusWords | null {
  const lastDash = rest.match(/^(.+) — (.+)$/);
  const firstDash = rest.match(/^(.+?) — (.+)$/);
  for (const split of [lastDash, firstDash]) {
    const known = split ? knownPartPhase(split) : null;
    if (known) return known;
  }
  if (!firstDash) return null;
  const [, title = "", doing = ""] = firstDash;
  const plain = title.trim();
  const phase = doing.trim().replace(PHASE_SUFFIX, "").trim();
  return { line: phase ? `${plain} · ${phase}` : plain, short: plain };
}

function knownPartPhase([, title = "", doing = ""]: RegExpMatchArray): StatusWords | null {
  for (const [pattern, words] of PART_PHRASES) {
    const match = doing.trim().match(pattern);
    if (match) return words(title.trim(), match);
  }
  return null;
}

/**
 * The run a status line belongs to. The harness stamps `run <runId> · …` on almost every status;
 * nothing outside this module should know that grammar, but the stage does need the id itself to
 * tell "the run I am drawing" from "a run that has only just been asked for".
 */
export function runIdIn(status: string): string | null {
  return /^run (\S+)\b/.exec((status ?? "").trim())?.[1] ?? null;
}

/** Has the run been asked for but not yet drawn anything — no parts, no rounds, no build? */
export function isPlanning(status: string): boolean {
  return /^run \S+ · planning facets\b/i.test((status ?? "").trim());
}

// ── verdicts ──────────────────────────────────────────────────────────────────────────────

export interface Verdict {
  /** The harness's own winner field: "challenger" when the new round won. */
  winner?: string | null;
  satisfied?: boolean;
  /** The harness's `verdictSource`: how the decision was reached. */
  source?: string | null;
  /**
   * The round's own verdict record (`loop/verdict.ts`). Its `because` is written by the pass
   * that judged the build and already names what it measured — "2 checks that were failing now
   * pass" rather than "the checks it was given now pass". When one is there it wins; the mapping
   * below stays for every run recorded before the record existed.
   */
  record?: { because?: string | null } | null;
}

export interface VerdictWords {
  /** "kept" · "undone" · "done" — the word on the round. */
  word: string;
  /** The one sentence that says why, with no check ids in it. */
  because: string;
  /** word + because, for a single line. */
  label: string;
}

/** The harness calls the new build "challenger"; the user only ever hears "kept". */
export function isKept(winner: string | null | undefined): boolean {
  return roundOutcome({ winner }) === RoundOutcome.Accepted;
}

const UNDONE_BECAUSE: Record<string, string> = {
  invisible: t("nothing visible changed"),
  "no-move": t("the step it was asked for was not delivered"),
  unfixed: t("the must-fix was not fixed"),
  broken: t("the build was broken"),
  outage: t("the model could not be reached"),
  race: t("the game had not finished loading when it was looked at"),
};

/**
 * Does a line of prose report trouble? Only for the narration whose record carries nothing but
 * its prose — the lead's decisions, a builder's checkpoint note, a judge's sentence — until the
 * harness records a structured flag on them. Every other line's trouble is read from its record.
 */
export function soundsLikeTrouble(text: string): boolean {
  return /failed|error|could not|not delivered|stopped|unavailable|refused|broke again/i.test(text);
}

/** A round undone because its judge could not be reached, not because the build lost. */
export function judgeUnreachable(source: string | null | undefined): boolean {
  return source === "outage";
}

/**
 * A round the lead ended mid-build. Nobody judged it and nothing was thrown away — the
 * builder's work is kept on a branch — so it is neither kept nor undone, and it must never
 * wear the red of a build that broke.
 */
export function wasStopped(source: string | null | undefined): boolean {
  return stoppedSource(source);
}

/** The harness's verdict source for a round kept because nothing regressed (its `VerdictSource.NoRegression`). */
const KEPT_UNHARMED = "no-regression";

/** The harness's verdict source for a save point the lead made itself (its `VerdictSource.Lead`). */
const LEAD_SAVE = "lead";

/**
 * A round the lead kept by saving it itself: no reviewer judged it and nothing compared it side by
 * side, so it is never worded as a reviewer's verdict.
 */
export function savedByLead(source: string | null | undefined): boolean {
  return source === LEAD_SAVE;
}

/** How a save the lead made itself reads, beside the reviewers' verdicts. */
const LEAD_SAVE_WORDS: VerdictWords = {
  word: t("saved"),
  because: t("the lead looked at its own captures and saved it"),
  label: t("saved — the lead looked at its own captures and saved it"),
};

/**
 * "the judge", "no judges'", "the taste judge's": the role as a noun, after the word that makes it
 * one. A bare "judge it" is the verb and never matches.
 */
const JUDGE_NOUN = /\b(the|a|no|any|every|each|its|their)((?:\s+(?:taste|side-by-side|blind))?\s+)judge(s?)\b/gi;
/** The one participle a landing line uses for the role ("made live, not judged better"). */
const NOT_JUDGED_BETTER = /\bnot judged better\b/gi;

/**
 * A sentence the harness wrote, in the app's name for the reviewing role.
 *
 * The harness, its prompts and the models that read them call that role "judge" (`loop/judge.ts`,
 * `loop/verdict.ts`, `director/rules.ts`, `prompts/`), and that word stays there on purpose: it is
 * the models' vocabulary, and renaming it would change what they read. The app calls the same role
 * Reviewers (ModelMenu.tsx, and "reviewer" in every sentence it writes itself). So the harness's
 * sentences are reworded here, when they are shown, never at their source — which also keeps
 * runs logged before the rename reading the same. Do not "fix" the seed to say reviewer.
 */
export function reviewerWords(text: string): string {
  return text
    .replace(JUDGE_NOUN, (_, det: string, between: string, plural: string) => `${det}${between}reviewer${plural}`)
    .replace(NOT_JUDGED_BETTER, "not reviewed better");
}

/**
 * The sentence a verdict record wrote, ready for a card to print.
 *
 * `loop/verdict.ts` composes it out of the run's own material — a builder's title among it — so
 * it is model-authored text like any other and passes the same gate. Every surface that shows a
 * record's sentence (the Builds drawer, the round cards, the reviewers' sheet, the chat) reads it
 * through here rather than off the payload, in the app's role names (`reviewerWords`).
 */
export function verdictSentence(record: { because?: string | null } | null | undefined): string {
  return typeof record?.because === "string" ? reviewerWords(withoutIds(record.because)) : "";
}

/** Why an undone round was undone — the reason alone, for a card that already says "Undone". */
export function undoneBecause(source: string | null | undefined, record: Verdict["record"] = null): string {
  const written = verdictSentence(record);
  if (written) return bareReason(written);
  return UNDONE_BECAUSE[source ?? ""] ?? t("it was not clearly better than the round before");
}

/**
 * A record's sentence starts with its own verdict word ("Kept: two checks…"), because it is
 * written to stand alone. A card that already says "kept" wants the rest of it.
 */
const OWN_WORD = /^(?:kept|undone|not judged|made live|nothing was made live)\s*[:—-]\s*/i;

/** One round's verdict in three shapes: the word, the reason, and the two joined. */
export function verdictWords(verdict: Verdict): VerdictWords {
  const written = verdictSentence(verdict.record);
  if (wasStopped(verdict.source)) {
    const because = written
      ? bareReason(written)
      : t("the lead ended it before it was finished, so nobody reviewed it and the work it had done is kept");
    return { word: t("stopped"), because, label: written || t("stopped — {because}", { because }) };
  }
  if (savedByLead(verdict.source) && !written) return LEAD_SAVE_WORDS;
  // A round with no winner recorded was neither kept nor undone: nobody's verdict reached the log.
  const outcome = roundOutcome({ winner: verdict.winner, verdictSource: verdict.source });
  const word = verdictWord(verdict, outcome);
  if (written) return { word, because: bareReason(written), label: written };
  const because = unwrittenBecause(verdict, outcome);
  return { word, because, label: `${word} — ${because}` };
}

function verdictWord(verdict: Verdict, outcome: RoundOutcome): string {
  if (verdict.satisfied) return t("done");
  if (outcome === RoundOutcome.Accepted) return t("kept");
  return outcome === RoundOutcome.Rejected ? t("undone") : t("not reviewed");
}

/** Why, for a run from before the verdict record wrote its own sentence. */
function unwrittenBecause(verdict: Verdict, outcome: RoundOutcome): string {
  if (verdict.satisfied) return t("the checks it was given pass and the reviewer agrees");
  if (outcome === RoundOutcome.Accepted)
    return verdict.source === "checks"
      ? t("the checks it was given now pass, and no reviewer objected")
      : t("the reviewer preferred it to the round before");
  return outcome === RoundOutcome.Rejected ? undoneBecause(verdict.source) : t("no verdict was recorded for it");
}

/** A written sentence with its leading verdict word taken off, so a card can put its own in front. */
function bareReason(sentence: string): string {
  const rest = sentence.replace(OWN_WORD, "").replace(/\.$/, "");
  return rest ? rest.charAt(0).toLowerCase() + rest.slice(1) : sentence;
}

/** The wording every round carries — in the chat line, the graph card and the details table. */
export function verdictLabel(
  winner: string | null,
  satisfied: boolean,
  source: string | null,
  record: Verdict["record"] = null,
): string {
  return verdictWords({ winner, satisfied, source, record }).label;
}

/** The label of a round still being built when the run ended. */
export const ABANDONED_ROUND_LABEL = t("not reviewed — the run ended first");

/** The label of a round still being built, naming the step or fix it was asked for when there is one. */
export function buildingRoundLabel(asked: string | null | undefined): string {
  return asked ? t("building · move: {move}", { move: asked }) : t("building");
}

/**
 * What the side-by-side judge did with this round — the question users actually ask of it. The
 * statuses are `IterationStatus` values, typed but spelled out: this module imports no runtime
 * code from the graph that reads it.
 */
export function sideBySideWords(node: { status: IterationStatus; satisfied: boolean; source: string | null }): string {
  if (node.status === "building") return "";
  if (node.status === "stopped") return t("Not reviewed — the lead stopped this round.");
  if (savedByLead(node.source)) return t("Not reviewed — the lead saved it after looking at its own captures.");
  if (node.status === "unjudged") return t("Not reviewed — no verdict was recorded for this round.");
  if (node.status === "rolled") {
    if (node.source === "no-move") return t("Not asked — the step did not land.");
    return t("Not needed — the round was undone on the checks.");
  }
  if (node.satisfied) return t("The reviewer is satisfied with this part.");
  return node.source === "checks" || node.source === KEPT_UNHARMED
    ? t("No objection to the new build.")
    : t("The reviewer preferred the new build to the round before.");
}

/**
 * Why the run ended. The harness writes this for itself — "land=no", "autopilot finished" —
 * so the few phrases that carry a decision are named here and everything else is at least
 * stripped of ids before it reaches a screen.
 */
export function stoppedWords(reason: string | null | undefined): string {
  return stopReason(reason).said;
}

/** A stop reason read once, so no caller reads its words back. */
export interface StopReason {
  /** The reason in the user's words. */
  said: string;
  /** Whether `said` already says it was stopped: the lead's own stop, or a reason the harness wrote starting with "stopped". */
  saysStopped: boolean;
  /** When the lead stopped it: its reason without saying who stopped it, "" when it gave none; null for any other stop. */
  leadsWhy: string | null;
}

/**
 * A stop reason in the user's words, read from the reason the harness wrote: what to say, and
 * whether it was the lead that stopped it.
 */
export function stopReason(reason: string | null | undefined): StopReason {
  let raw = (reason ?? "").trim();
  if (!raw) return { said: t("it finished"), saysStopped: false, leadsWhy: null };
  // A stopped builder's reason ends with the branch its work was left on. The user is told the
  // work was kept; the branch name is the harness's own bookkeeping.
  let workKept = false;
  if (KEPT_ON_BRANCH.test(raw)) {
    raw = raw.replace(KEPT_ON_BRANCH, "").trim();
    workKept = true;
  }
  // Every close composes "<why>; <what happened to the build>". Both halves carry a reason, and
  // matching the landing half anywhere in the string used to swallow the why with it.
  const landing = LANDING_CLAUSE.test(raw);
  const why = raw.replace(LANDING_CLAUSE, "").trim();
  if (stoppedByLead(why)) return leadStop(why, workKept);
  const said = whyItEnded(why);
  if (said) return { said: withWorkKept(said, workKept), saysStopped: false, leadsWhy: null };
  if (landing || /^(?:nothing was landed|land=no)\b/i.test(why))
    return { said: t("nothing was made live"), saysStopped: false, leadsWhy: null };
  const own = withoutIds(why || raw);
  // A worker the lead stopped: the harness's own words for it ("stopped by the lead").
  const leads = LEAD_STOPPED_IN_HARNESS.test(own)
    ? leadsReason(own.replace(LEAD_STOPPED_IN_HARNESS, ""), workKept)
    : null;
  return { said: withWorkKept(own, workKept), saysStopped: /^stopped\b/i.test(own), leadsWhy: leads };
}

/**
 * "stopped by the director: fixing the starting point" — the run's own words, minus the job
 * title. The lead stopping a builder is not the owner asking for anything.
 */
function leadStop(why: string, workKept: boolean): StopReason {
  const own = why.replace(/^stopped by the director\b[:\s—-]*/i, "").trim();
  const said = own ? t("stopped by the lead — {why}", { why: withoutIds(own) }) : t("stopped by the lead");
  return {
    said: withWorkKept(said, workKept),
    saysStopped: true,
    leadsWhy: leadsReason(own && withoutIds(own), workKept),
  };
}

/** The lead's reason for a stop, without who stopped it, saying the stopped builder's work was kept when it was. */
function leadsReason(why: string, workKept: boolean): string {
  if (why) return withWorkKept(why, workKept);
  return workKept ? t("its work was kept") : "";
}

/** A stop reason, saying the stopped builder's work was kept when it was. */
function withWorkKept(why: string, workKept: boolean): string {
  return workKept ? t("{why} — its work was kept", { why }) : why;
}

/** `…; nothing was landed (land=no)` — the landing half every close appends to its reason. */
const LANDING_CLAUSE = /;\s*(?:nothing was landed|the integration branch was landed)(?:\s*\([^)]*\))?\s*$/i;
/** `… — its work so far is kept on refs/studio/…/attempts/cars2/3-stopped` — not the user's business. */
const KEPT_ON_BRANCH = /\s*—\s*its work so far is kept on \S+\s*$/i;
/** The lead stopping a builder: "stopped by the director: fixing the starting point". */
const STOPPED_BY_DIRECTOR = /^stopped by the director\b/i;
/** A worker the lead stopped, as the harness's worker pool words it: "stopped by the lead". */
const LEAD_STOPPED_IN_HARNESS = /^stopped by the lead\s*(?:—\s*)?/;
/** A wrap-up the owner asked for, whoever passed it on. */
const AT_USERS_REQUEST = /at the user.s request/i;

/** Is this the lead's own stop, not a wrap-up the owner asked for? */
function stoppedByLead(why: string): boolean {
  return STOPPED_BY_DIRECTOR.test(why) && !AT_USERS_REQUEST.test(why);
}

/** The half of a close that says why the run (or a builder) ended, in the user's words. */
function whyItEnded(why: string): string | null {
  if (!why) return null;
  if (/^stopped by the user$/i.test(why)) return t("you stopped it");
  if (AT_USERS_REQUEST.test(why)) return t("you asked it to wrap up");
  if (/^the director finished the run$/i.test(why)) return t("the lead finished the build");
  if (/^autopilot finished$/i.test(why)) return t("the build finished");
  // A lost provider paused it (harness provider-loss.ts `pauseEnding`): what to fix, never the provider's own words.
  if (/^the engine lost its sign-in\b/i.test(why))
    return t("the model provider stopped accepting the account — sign in again, then Resume");
  if (/^the engine's provider stayed down\b/i.test(why))
    return t("the model provider stayed down — Resume picks the build up");
  // The engine's own limit is the one ending a user can act on: it says when to come back.
  if (/usage cap|usage limit|session limit|rate limit/i.test(why))
    return t("the engine hit its limit — the build can pick up again when it resets");
  if (/ran out of time/i.test(why)) return t("it ran out of time");
  if (/session ended/i.test(why)) return t("the engine's session ended early");
  if (/interrupted by restart|the studio restarted/i.test(why)) return t("the studio restarted");
  // "facet budget exhausted", "wall-clock budget exhausted": a builder that reached the end of
  // the time it was given did not fail at anything.
  if (/budget exhausted/i.test(why)) return t("it used up the time it was given");
  return null;
}

/**
 * Did this part simply reach the end of the time it was given? A part whose every round was kept
 * and which then ran out of budget is not a part in trouble, and must not wear the same orange as
 * one the lead stopped or the engine cut off.
 */
export function ranToItsEnd(reason: string | null | undefined): boolean {
  return /budget exhausted|settled|yielded/i.test(reason ?? "");
}

/** Was the run ended by the owner rather than by the lead, the clock or the engine? */
export function wasCancelled(reason: string | null | undefined): boolean {
  return /^stopped by the user\b/i.test((reason ?? "").trim());
}

/**
 * A run's outcome in words (`summaryOutcome` in shared/run-summary.ts), in the three places it is
 * said: `full` in the Builds view and its details, `chat` on the chat's outcome card (a stopped
 * build's card says so in its own line, and "incomplete" checks go unmentioned), and `card` on
 * the chat's collapsible outcome, which names checks either way.
 */
export function outcomeTitle(view: OutcomeView, variant: OutcomeVariant = "full"): string {
  const { state, delivered } = view;
  const full = variant === "full";
  const available = delivered === "available" && variant !== "chat";
  switch (state) {
    case "unknown":
      return full ? t("Run status unavailable") : t("Build status unavailable");
    case "failed":
      return withAvailable(full ? t("Run failed") : t("Build failed"), available);
    case "cancelled":
      return cancelledTitle(variant, available);
    case "running":
      return delivered === "available" ? t("Building · Earlier build available") : t("Building");
    case "paused":
      return withAvailable(full ? t("Run paused") : t("Build paused"), available);
    case "finished":
      return finishedTitle(view, variant);
  }
}

type OutcomeVariant = "full" | "chat" | "card";

/** An outcome's title, saying an integrated build is there to play when one is. */
function withAvailable(title: string, available: boolean): string {
  return available ? `${title} · ${t("Integrated build available")}` : title;
}

function cancelledTitle(variant: OutcomeVariant, available: boolean): string {
  if (variant === "full") return withAvailable(t("Run cancelled"), available);
  return variant === "card" ? withAvailable(t("Build stopped"), available) : t("Build cancelled");
}

function finishedTitle({ delivered, verification, inPlace }: OutcomeView, variant: OutcomeVariant): string {
  const full = variant === "full";
  // A Loop led in the project's own folder kept its work there: no build is promised to play.
  if (inPlace) return full ? IN_PLACE_WORDS.finishedFull : IN_PLACE_WORDS.finished;
  if (delivered === "superseded")
    return full ? t("Run finished · Newer integrated build not delivered") : t("Newer integrated build not delivered");
  if (delivered !== "delivered") return full ? t("Run finished · No build delivered") : t("No new build");
  const attention = verification === "attention";
  if (full)
    return attention ? t("Build delivered · Checks need attention") : t("Build delivered · Verification incomplete");
  if (attention) return t("Changes are live · Checks need attention");
  return variant === "card" ? t("Changes are live · Checks incomplete") : t("Changes are live");
}

/** How a Loop led in its project's own folder ends, wherever its run reads: its work is kept there, never promised as a build to play in Live. */
export const IN_PLACE_WORDS = {
  finished: t("Changes are kept in your project"),
  finishedFull: t("Loop finished · Changes kept in your project"),
  /** The result node's word and the run's line. */
  kept: t("Kept in your project"),
  headline: (rounds: number) =>
    t(
      "{rounds, plural, =0 {Finished · kept in your project} one {Finished after # round · kept in your project} other {Finished after # rounds · kept in your project}}",
      { rounds },
    ),
  because: t("The Loop's work is kept in your project."),
  stoppedHeadline: (rounds: number) =>
    t(
      "{rounds, plural, =0 {Stopped · kept in your project} one {Stopped after # round · kept in your project} other {Stopped after # rounds · kept in your project}}",
      { rounds },
    ),
  stoppedBecause: t("Stopped. What it built is kept in your project."),
} as const;

/** The morning's two sentences: what the run amounts to, and what became of the build. */
export interface LoopRunWords {
  /** "Finished after 21 rounds · live in your game" */
  headline: string;
  /** why it ended, or what happened to the build */
  because: string;
}

/**
 * How a finished run reads. The old screen decided this on `victory` — a flag the lead sets
 * only when it explicitly claims one — so a run that built, merged and landed a game read
 * "Stopped after 21 rounds". What the user actually cares about is whether the build reached
 * their game, which is `landed`, so that is what the headline says.
 */
export function loopRunWords(loopRun: {
  rounds: number;
  landed: boolean | null;
  stoppedBecause?: string | null;
  /** the run stopped where it can be picked up again — a plan limit, a quit, a crash */
  paused?: boolean;
  /** the provider failure that paused it (the close's `limit.kind`), when one did */
  pausedOn?: string | null;
  /**
   * Is there a merged build to play? The card offers Play only when the run left a head of its
   * own, so the sentence may only promise one under the same condition. Unknown counts as yes,
   * which is what an older log with no head recorded means.
   */
  hasBuild?: boolean;
  /**
   * The close's own sentence about landing ("made live, a judge preferred it" / "made live, not
   * judged better"). It is the one thing the user cannot see for themselves — whether anything
   * checked the build that is now their game — so it replaces the flat promise when it is there.
   */
  landing?: string | null;
  /** How the Loop worked on its project (`run_finished.profile`): `open` kept its work in the project's own folder. */
  profile?: string | null;
  /** Why the Loop did not run at all (`run_finished.refusal`), when it didn't. */
  refusal?: LoopRefusal | null;
}): LoopRunWords {
  if (loopRun.refusal === LoopRefusal.NeedsSession) return NEEDS_SESSION_WORDS;
  const rounds = Math.max(0, Math.trunc(loopRun.rounds || 0));
  const hasBuild = loopRun.hasBuild ?? true;
  const landing = reviewerWords(withoutIds((loopRun.landing ?? "").trim()));
  const why = stoppedWords(loopRun.stoppedBecause);
  if (loopRun.paused)
    return pausedLoopRunWords(rounds, wasCancelled(loopRun.stoppedBecause), pausedWhy(loopRun.pausedOn, why));
  const inPlace = loopRun.profile === LoopProfile.Open;
  if (wasCancelled(loopRun.stoppedBecause))
    return stoppedLoopRunWords(rounds, loopRun.landed === true, hasBuild, inPlace);
  if (loopRun.landed === true && inPlace)
    return { headline: IN_PLACE_WORDS.headline(rounds), because: IN_PLACE_WORDS.because };
  if (loopRun.landed === true) {
    return {
      headline: t(
        "{rounds, plural, =0 {Finished · live in your game} one {Finished after # round · live in your game} other {Finished after # rounds · live in your game}}",
        { rounds },
      ),
      because: landing
        ? t("{landing} — open Live to play it.", { landing: capitalise(landing) })
        : t("This build is your game now — open Live to play it."),
    };
  }
  if (loopRun.landed === false) {
    // Nothing merged: the old copy promised "kept and playable" over a card with no button at all.
    return hasBuild
      ? {
          headline: t(
            "{rounds, plural, =0 {Finished · not made live yet} one {Finished after # round · not made live yet} other {Finished after # rounds · not made live yet}}",
            { rounds },
          ),
          because: t("The build is kept and playable — {why}", { why: fullStop(why) }),
        }
      : {
          headline: t(
            "{rounds, plural, =0 {Finished · nothing new} one {Finished after # round · nothing new} other {Finished after # rounds · nothing new}}",
            { rounds },
          ),
          because: t("Your game is as you left it — {why}", { why: fullStop(why) }),
        };
  }
  return {
    headline: t("{rounds, plural, =0 {Finished} one {Finished after # round} other {Finished after # rounds}}", {
      rounds,
    }),
    because: fullStop(capitalise(why)),
  };
}

/** A Loop refused on an engine that keeps no session (`LoopRefusal.NeedsSession`): its chat stays plain chat. */
const NEEDS_SESSION_WORDS: LoopRunWords = {
  headline: t("Loop not started"),
  because: t(
    "A Loop needs an engine that keeps a session of its own, and this chat's engine doesn't, so nothing was built. The chat still answers here.",
  ),
};

/** Text that ends a sentence: a full stop added only when it has no end of its own (a close's reason may). */
function fullStop(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/**
 * Why a run its model provider paused stopped, and what brings it back, from the close's typed
 * kind (`run_finished.limit.kind`). A limit keeps the close's own words (`stoppedWords`).
 */
const PAUSED_ON_WORDS = {
  [EngineFailureKind.Auth]: t(
    "the model provider stopped accepting this account — sign in again (or ask your admin to turn access back on), then press Resume",
  ),
  [EngineFailureKind.Unavailable]: t("the model provider stayed down — Resume picks the build up where it stopped"),
} as const satisfies Partial<Record<EngineFailureKind, string>>;

/** The paused run's reason: the typed provider failure's words when there are some, else the close's. */
function pausedWhy(kind: string | null | undefined, why: string): string {
  return failureWords(PAUSED_ON_WORDS, kind) ?? why;
}

/** The words a table gives an engine failure kind, or null for a kind it does not name. */
function failureWords(table: Partial<Record<EngineFailureKind, string>>, kind: unknown): string | null {
  const known = Object.values(EngineFailureKind).find((value) => value === kind);
  return known ? (table[known] ?? null) : null;
}

/** Stop and pause are one thing to the owner: the work is kept and Resume sits beside this line. */
function pausedLoopRunWords(rounds: number, stopped: boolean, why: string): LoopRunWords {
  if (stopped)
    return {
      headline: t("{rounds, plural, =0 {Stopped} one {Stopped after # round} other {Stopped after # rounds}}", {
        rounds,
      }),
      because: t("Stopped. Everything built so far is kept."),
    };
  return {
    headline: t("{rounds, plural, =0 {Paused} one {Paused after # round} other {Paused after # rounds}}", { rounds }),
    // A reason may end a sentence of its own: the card's full stop is the one it ends with.
    because: t("{why}. Everything built so far is kept.", { why: capitalise(why).replace(/[.!?…]+$/, "") }),
  };
}

/** A run the owner stopped: what reached the game, what is kept, or that nothing changed. */
function stoppedLoopRunWords(rounds: number, landed: boolean, hasBuild: boolean, inPlace: boolean): LoopRunWords {
  if (landed && inPlace)
    return { headline: IN_PLACE_WORDS.stoppedHeadline(rounds), because: IN_PLACE_WORDS.stoppedBecause };
  if (landed)
    return {
      headline: t(
        "{rounds, plural, =0 {Stopped · live in your game} one {Stopped after # round · live in your game} other {Stopped after # rounds · live in your game}}",
        { rounds },
      ),
      because: t("Stopped. What it built is in your game now."),
    };
  if (hasBuild)
    return {
      headline: t(
        "{rounds, plural, =0 {Stopped · the build so far is kept} one {Stopped after # round · the build so far is kept} other {Stopped after # rounds · the build so far is kept}}",
        { rounds },
      ),
      because: t("Stopped. Everything built so far is kept."),
    };
  return {
    headline: t("{rounds, plural, =0 {Stopped} one {Stopped after # round} other {Stopped after # rounds}}", {
      rounds,
    }),
    because: t("Stopped. Your game is as you left it."),
  };
}

// ── when something refuses ────────────────────────────────────────────────────────────────

/**
 * The studio's own refusals, in the user's words. Every one of these is an ordinary morning —
 * a builder still working in the folder, an edit of the user's own sitting there, a build that
 * cannot merge cleanly — and each used to reach the toast as the sentence a developer wrote for
 * a log, with the git command's output still attached.
 */
const PROBLEMS: Array<[RegExp, string]> = [
  [/is not a commit hash|is not in ".*"'s history/i, t("That build is not in this game's history any more.")],
  [
    /(?:a contractor|a builder) is building in .* right now/i,
    t("A worker is busy in your game folder right now — try again once it has finished."),
  ],
  [
    /uncommitted edits/i,
    t(
      "Your game folder has edits of its own, and the studio will not write over them — save or undo them, then try again.",
    ),
  ],
  [
    /conflicted with the game folder/i,
    t("That build and your game folder changed the same things, so nothing was changed."),
  ],
];

/**
 * What went wrong, for a toast. Anything the studio itself phrased passes through with its ids
 * stripped and the raw tool output cut off; anything else at least never shows a sha.
 */
export function problemWords(err: unknown): string {
  const raw = errorText(err).trim();
  if (!raw) return t("That didn't work, and nothing was changed.");
  for (const [pattern, said] of PROBLEMS) if (pattern.test(raw)) return said;
  // A trailing parenthetical is where the git or engine output is pasted; the sentence before it
  // is the studio's own.
  const plain = withoutIds(raw.replace(/\s*\([^()]{40,}\)\s*$/, "").trim());
  if (!plain) return t("That didn't work, and nothing was changed.");
  return sentence(capitalise(plain));
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "";
}

// ── the checks ────────────────────────────────────────────────────────────────────────────

/**
 * What a round's checks came to. "1 of 10 checks" reads as nine failures; on the first real run
 * nine of them were checks nothing could measure, which is the difference between "the game is
 * wrong" and "the studio couldn't look". All three surfaces say it the same way.
 *
 * The counted checks are the ones the plan asked for. A judge that keeps naming what it still
 * dislikes grows its own questions beside them, and on that run they outnumbered the plan's —
 * a part whose work was passing read "1 of 10". They are counted separately, as notes, because
 * that is what they are: a judge's opinion of the build, not the job it was given.
 */
export interface CheckBoard {
  total?: number | null;
  passing?: number | null;
  unmeasured?: number | null;
  plannedTotal?: number | null;
  plannedPassing?: number | null;
  plannedUnmeasured?: number | null;
  grownTotal?: number | null;
}

export function checkCounts(board: CheckBoard | null | undefined): string {
  if (!board) return t("No checks yet");
  const { total, passed, unmeasured, notes } = countedChecks(board);
  const failed = Math.max(0, total - passed - unmeasured);
  const parts: string[] = [];
  if (passed) parts.push(t("Passed {count}", { count: passed }));
  if (failed) parts.push(t("Failed {count}", { count: failed }));
  if (unmeasured) parts.push(t("Couldn't measure {count}", { count: unmeasured }));
  if (notes) parts.push(t("{count, plural, one {# reviewer note} other {# reviewer notes}}", { count: notes }));
  if (!total && !notes) return t("No checks yet");
  return parts.length ? parts.join(" · ") : t("No checks yet");
}

const whole = (value: number | null | undefined): number => Math.max(0, Math.trunc(value ?? 0));

/** The plan's checks, counted; a run from before the split has no planned counts: everything it measured was a check. */
function countedChecks(board: CheckBoard): { total: number; passed: number; unmeasured: number; notes: number } {
  if (typeof board.plannedTotal !== "number")
    return { total: whole(board.total), passed: whole(board.passing), unmeasured: whole(board.unmeasured), notes: 0 };
  return {
    total: whole(board.plannedTotal),
    passed: whole(board.plannedPassing),
    unmeasured: whole(board.plannedUnmeasured),
    notes: whole(board.grownTotal),
  };
}

// ── the run, as it narrates itself ──────────────────────────────────────────────────────

/** Every per-round line names the part the lead named, and never the id underneath it. */
export interface PartRound {
  facetTitle?: string | null;
  facetId?: string | null;
  iteration?: number | null;
}

function partName(part: PartRound, fallback = t("a part")): string {
  return withoutIds((part.facetTitle ?? "").trim()) || fallback;
}

/** "Crash damage · round 3" — the prefix every per-round line in the chat and the graph shares. */
export function partRoundWords(part: PartRound): string {
  const name = partName(part);
  return typeof part.iteration === "number" ? t("{part} · round {round}", { part: name, round: part.iteration }) : name;
}

/**
 * What the run is, for the records that name a reference it was given ("direction" or a bar):
 * nothing for a run that has none, which the chat already shows as the person's own message.
 */
export function runStartWords(reference: { name?: string | null; kind?: string | null } | null | undefined): string {
  const name = withoutIds((reference?.name ?? "").trim());
  if (!name || name.toLowerCase() === "unnamed") return "";
  if (reference?.kind === "direction") return t('heading in the direction of "{name}"', { name });
  return t('the bar for this build is "{name}"', { name });
}

/** How the run is organised — the first thing the user reads after pressing send. */
export function autopilotStartWords(start: {
  facets?: Array<{ id?: string | null; title?: string | null; budgetShare?: number | null }> | null;
  maxParallel?: number | null;
  director?: boolean;
}): string {
  const hands = Math.max(1, Math.trunc(start.maxParallel ?? 1));
  if (start.director) {
    return t(
      "the lead is taking this build — it looks at your game first, puts up to {count, plural, one {# worker} other {# workers}} to work, checks what they make and puts it together",
      { count: hands },
    );
  }
  const facets = start.facets ?? [];
  const named = facets
    .map((facet) => {
      const title = withoutIds((facet?.title ?? "").trim()) || t("a part");
      return typeof facet?.budgetShare === "number" ? `${title} ${Math.round(facet.budgetShare * 100)}%` : title;
    })
    .join(" · ");
  const pace =
    hands > 1
      ? t("up to {count, plural, one {# worker} other {# workers}} at once", { count: hands })
      : t("one part at a time");
  const count = facets.length;
  return named
    ? t(
        "this build is split into {count, plural, one {# part} other {# parts}} ({names}) — {pace}, each reviewed on its own",
        { count, names: named, pace },
      )
    : t("this build is split into {count, plural, one {# part} other {# parts}} — {pace}, each reviewed on its own", {
        count,
        pace,
      });
}

/**
 * The lead's own decisions, which it writes for itself: job titles, ten-character shas, git refs
 * and the provider's raw exception text. This is the busiest line of the run, so it is the one
 * that most needs saying in the user's words. The raw text stays on the event for Details.
 */
export function decisionWords(decision: string): string {
  const raw = (decision ?? "").trim();
  if (!raw) return t("a call was made without a reason");
  if (/\b(usage cap|usage limit|session limit|rate limit)\b/i.test(raw))
    return t("the model provider stopped us — waiting for the limit to reset");
  const worker = raw.match(/^(?:the )?director started worker "([^"]*)" \(([^)]*)\):\s*([\s\S]*)$/i);
  if (worker) {
    const [, title = "", terms = "", rest = ""] = worker;
    const minutes = terms
      .split(",")
      .map((part) => part.trim())
      .find((part) => /\d+\s*min/i.test(part));
    const brief = withoutIds(rest.trim());
    const task = withoutIds(title);
    const put = minutes
      ? t('the lead put a worker on "{task}" for {minutes}', { task, minutes })
      : t('the lead put a worker on "{task}"', { task });
    return brief ? `${put}: ${brief}` : put;
  }
  // The lead's own English, reworded in place: these rewrite the harness's text, not the app's.
  const said = raw
    .replace(/\s*—?\s*kept unlanded on\b.*$/i, " — so nothing was made live")
    // "stopped worker post2" — the worker's id says nothing to the person reading it.
    .replace(/\bworker\s+[a-z][a-z0-9]*[0-9][a-z0-9._-]*/gi, "a worker")
    .replace(/\bthe director\b/gi, "the lead")
    .replace(/\bdirector\b/gi, "the lead")
    .replace(/\bthe integrated build\b/gi, "this build")
    .replace(/\bthe integration branch\b/gi, "this build")
    .replace(/\bdid not pass its health pass\b/gi, "did not run when it was checked")
    .replace(/\bhealth pass\b/gi, "check that it still runs")
    .replace(/\bthe harness\b/gi, "the studio")
    .replace(/\bthe planner\b/gi, "the studio")
    .replace(/\biterations\b/gi, "rounds")
    .replace(/\biteration\b/gi, "round");
  return reviewerWords(withoutIds(said));
}

/** The step a round was asked to make, and whether it arrived. */
export function moveWords(
  move: PartRound & { what?: string | null; delivered?: boolean | null; scale?: string | null },
): string {
  const what = withoutIds((move.what ?? "").trim());
  const scale = move.scale ? ` (${withoutIds(String(move.scale))})` : "";
  return `${partRoundWords(move)}: ${stepState(move.delivered)}${what ? ` — ${what}` : ""}${scale}`;
}

function stepState(delivered: boolean | null | undefined): string {
  if (delivered === true) return t("the step landed");
  return delivered === false ? t("the step did not land") : t("asked for a step");
}

/** A must-fix the judge keeps naming, and what became of it. */
export function fixWords(
  fix: PartRound & {
    what?: string | null;
    delivered?: boolean | null;
    mandatory?: boolean | null;
    streak?: number | null;
  },
): string {
  const what = withoutIds((fix.what ?? "").trim());
  const streak =
    typeof fix.streak === "number" && fix.streak > 1
      ? ` ${t("(named {count, plural, one {# time} other {# times}} now)", { count: fix.streak })}`
      : "";
  return `${partRoundWords(fix)}: ${fixState(fix)}${what ? ` — ${what}` : ""}${streak}`;
}

function fixState(fix: { delivered?: boolean | null; mandatory?: boolean | null }): string {
  if (fix.delivered === true) return t("fixed");
  if (fix.delivered === false) return t("still there");
  return fix.mandatory ? t("must be fixed — a round that leaves it cannot be kept") : t("asked for a fix");
}

/**
 * How alive the game feels, out of the judge's own scale — or, for a game that is a screen
 * rather than a place (a board, a puzzle, a builder), how well that screen reads. The two
 * critics score different questions, so the user is told which one answered.
 */
export function livenessWords(
  alive: PartRound & {
    critic?: string | null;
    total?: number | null;
    max?: number | null;
    biggest?: string | null;
    summary?: string | null;
    grow?: string[] | null;
    polish?: string[] | null;
  },
): string {
  const question = livenessScore(alive.critic === "screen", alive.total, alive.max);
  const weakest = alive.biggest ? ` · ${t("weakest: {what}", { what: withoutIds(alive.biggest) })}` : "";
  const summary = alive.summary ? ` — ${withoutIds(alive.summary)}` : "";
  const grow = alive.grow?.length ? ` · ${t("could grow: {ideas}", { ideas: alive.grow.join(", ") })}` : "";
  const polish = alive.polish?.length ? ` · ${t("could polish: {ideas}", { ideas: alive.polish.join(", ") })}` : "";
  return `${partRoundWords(alive)}: ${question}${weakest}${summary}${grow}${polish}`;
}

/** The critic's question and its score, out of its scale when it gave one. */
function livenessScore(screen: boolean, total: number | null | undefined, max: number | null | undefined): string {
  if (typeof total !== "number") return screen ? t("how well the screen reads") : t("how alive it feels");
  if (typeof max !== "number")
    return screen
      ? t("how well the screen reads {score}", { score: total })
      : t("how alive it feels {score}", { score: total });
  return screen
    ? t("how well the screen reads {score} out of {max}", { score: total, max })
    : t("how alive it feels {score} out of {max}", { score: total, max });
}

/**
 * What took a round's model provider away (`facet_provider_outage.lost`, an engine failure kind):
 * the round waits for it, and the user reads why without the provider's own exception.
 */
const LOST_PROVIDER_WORDS = {
  [EngineFailureKind.Auth]: t("the model provider stopped accepting the account"),
  [EngineFailureKind.UsageLimit]: t("the model provider hit your plan's usage cap"),
  [EngineFailureKind.RateLimit]: t("the model provider hit your plan's session limit"),
  [EngineFailureKind.Unavailable]: t("the model provider is down"),
} as const satisfies Partial<Record<EngineFailureKind, string>>;

/** The provider is busy, or lost. The user needs the wait, never the exception text. */
export function outageWords(
  outage: PartRound & {
    phase?: string | null;
    minutes?: number | null;
    attempt?: number | null;
    /** The provider was lost, not busy (an engine failure kind): the round waits for it. */
    lost?: string | null;
  },
): string {
  const lost = failureWords(LOST_PROVIDER_WORDS, outage.lost);
  const part = partName(outage, t("this build"));
  if (lost)
    return t("{part}: {problem} — the round waits for it; nothing is counted against the build", {
      part,
      problem: lost,
    });
  const minutes = Math.max(1, Math.trunc(outage.minutes ?? 1));
  return t(
    "{part}: the model provider is busy — waiting {minutes} min before trying again (attempt {attempt}); nothing is counted against the build",
    { part, minutes, attempt: Math.max(1, Math.trunc(outage.attempt ?? 1)) },
  );
}

/** The modeller made something (AG-930) — or could not. */
export function modelWords(
  asset: PartRound & {
    name?: string | null;
    bytes?: number | null;
    ok?: boolean;
    error?: string | null;
    triangles?: number | null;
    polygons?: number | null;
  },
): string {
  const where = typeof asset.iteration === "number" ? partRoundWords(asset) : partName(asset, t("the modeller"));
  const name = withoutIds((asset.name ?? "").trim()) || t("a model");
  if (!asset.ok) {
    const error = withoutIds((asset.error ?? t("unknown error")).trim());
    return t("{where}: {name} failed — {error}", { where, name, error });
  }
  const size = kilobyteWords(asset.bytes ?? 0);
  const details = [size, modelShape(asset)].filter(Boolean).join(", ");
  return t("{where}: modelled {name} ({details})", { where, name, details });
}

const BYTES_PER_KB = 1024;

/** A size in whole kilobytes: "12 KB". */
export const kilobyteWords = (bytes: number): string => t("{size} KB", { size: Math.round(bytes / BYTES_PER_KB) });

/** How many files a line about files too large to save names before "and N more". */
const SKIPPED_FILES_NAMED = 3;

/** A listed file a `checkpoint_skipped` record can be read for: its path and its size. */
function isSkippedFile(entry: unknown): entry is SkippedFile {
  const file = entry as Partial<SkippedFile> | null;
  return typeof file?.file === "string" && file.file !== "" && typeof file.bytes === "number" && file.bytes >= 0;
}

/**
 * The change budget a checkpoint's files were left out by, when each one was under the file limit
 * (sized as the checkpoint left them out): their change was too large at once, not any of them.
 * Null when a file was over the limit, or for an older record that doesn't say its limits.
 */
function overBudget(skipped: CustomPayload<typeof CustomEvent.CheckpointSkipped>, files: SkippedFile[]): number | null {
  const { fileLimitBytes, changeLimitBytes } = skipped;
  if (typeof fileLimitBytes !== "number" || typeof changeLimitBytes !== "number") return null;
  return files.every((file) => file.bytes <= fileLimitBytes) ? changeLimitBytes : null;
}

/** A checkpoint's line for files a change too large at once left out, `limit` being its budget. */
function overBudgetWords(total: number, files: string, limit: number): string {
  return t(
    "{count, plural, one {Rewind can’t bring back # file from this change: it was over {size} at once, so the largest stayed out: {files}.} other {Rewind can’t bring back # files from this change: it was over {size} at once, so the largest stayed out: {files}.}}",
    { count: total, size: sizeWords(limit), files },
  );
}

/**
 * Files too large to save, which Rewind cannot bring back, as the chat says it: left out by a
 * message's checkpoint, or left as they were by a rewind; a checkpoint's change too large at once
 * says so rather than calling each file too large (a rewind sizes its files later, so it can't tell). Up to three names with their sizes, then how many more.
 * Null when the record names no file it can read.
 */
export function checkpointSkippedWords(skipped: CustomPayload<typeof CustomEvent.CheckpointSkipped>): string | null {
  const listed: unknown[] = Array.isArray(skipped.files) ? skipped.files : [];
  const files = listed.filter(isSkippedFile);
  if (!files.length) return null;
  const total = Math.max(files.length, typeof skipped.total === "number" ? skipped.total : 0);
  const shown = files.slice(0, SKIPPED_FILES_NAMED);
  const named = shown.map((file) => `${file.file.split("/").pop()} (${sizeWords(file.bytes)})`).join(", ");
  const which =
    total > shown.length ? t("{files} and {count} more", { files: named, count: total - shown.length }) : named;
  if (skipped.by !== SkippedBy.Rewind) {
    const budget = overBudget(skipped, files);
    if (budget !== null) return overBudgetWords(total, which, budget);
    return t(
      "{count, plural, one {Rewind can’t bring back # file that is too large to save: {files}.} other {Rewind can’t bring back # files that are too large to save: {files}.}}",
      { count: total, files: which },
    );
  }
  if (total === 1)
    return t("This file was too large to save, so the rewind left it as it is: {files}.", { files: which });
  return t("These files were too large to save, so the rewind left them as they are: {files}.", { files: which });
}

/** What the GPU draws for a model: its triangles when counted, else its polygons. */
function modelShape(asset: { triangles?: number | null; polygons?: number | null }): string {
  if (typeof asset.triangles === "number") return t("{count, plural, other {# triangles}}", { count: asset.triangles });
  return typeof asset.polygons === "number" ? t("{count, plural, other {# polygons}}", { count: asset.polygons }) : "";
}

/**
 * A plugin tool call, as a line in the chat. Studio writes one of these for every plugin call on
 * every engine path, so the user can see what a plugin was asked for, what came back, and how
 * long nothing happened — which used to be invisible on the delegated paths entirely.
 *
 * The plugin's own strings (its display name, its tool name, its error) go through `withoutIds`
 * like every other phrase the studio did not write: a plugin is as free as a model to stamp a
 * run id into its error text, and the user learns nothing from it.
 */
export interface PluginToolCallLine extends PartRound {
  pluginName?: string | null;
  /** the bare declared name (`asset`); `toolName` is the namespaced one the engine called */
  tool?: string | null;
  toolName?: string | null;
  /** absent while the call is still open — the started record has no outcome yet */
  ok?: boolean;
  error?: string | null;
  images?: number | null;
  files?: string[] | null;
}

/** `genex__asset` and `mcp__studio__genex__asset` both name the tool `asset`. */
function bareToolName(name: string): string {
  return withoutIds(name.trim())
    .replace(/^mcp__[^_]+__/i, "")
    .replace(/^[a-z0-9-]+__/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export function pluginToolWords(call: PluginToolCallLine): string {
  const where = typeof call.iteration === "number" ? partRoundWords(call) : partName(call, t("chat"));
  const plugin = withoutIds((call.pluginName ?? "").trim()) || t("a plugin");
  const tool = bareToolName(call.tool ?? call.toolName ?? "") || t("a tool");
  // The failure first, because a failed call is the only one whose own words matter more than
  // the counts. `ok` is only absent on the started record, which has no outcome to report.
  if (call.ok === false) {
    const error = withoutIds((call.error ?? t("unknown error")).trim());
    return t("{where}: {plugin} could not run {tool} — {error}", { where, plugin, tool, error });
  }
  if (call.ok !== true) return t("{where}: {plugin} is running {tool}", { where, plugin, tool });
  const files = Array.isArray(call.files) ? call.files.length : 0;
  const images = typeof call.images === "number" && call.images > 0 ? Math.trunc(call.images) : 0;
  const brought = [
    files ? t("{count, plural, one {# file} other {# files}}", { count: files }) : "",
    images ? t("{count, plural, one {# image} other {# images}}", { count: images }) : "",
  ]
    .filter(Boolean)
    .join(", ");
  return brought
    ? t("{where}: {plugin} ran {tool} — {brought}", { where, plugin, tool, brought })
    : t("{where}: {plugin} ran {tool}", { where, plugin, tool });
}

// ── connector steps ───────────────────────────────────────────────────────────────────────

/**
 * A connector or plugin as the chat names it in a work heading ("Worked in Unreal"): a bundled
 * plugin by its short name, any other by the name its record carries.
 */
const SOURCE_SHORT_NAMES: Readonly<Record<string, string>> = {
  unreal: "Unreal",
  blender: "Blender",
  genex: "Genex",
};

/** The name a step's plugin or connector goes by in the chat; the id only when nothing else names it. */
export function chatSourceName(source: { pluginId?: string | null; name?: string | null; id?: string | null }): string {
  const short = source.pluginId ? SOURCE_SHORT_NAMES[source.pluginId] : undefined;
  return short ?? (withoutIds((source.name ?? "").trim()) || withoutIds((source.id ?? "").trim()));
}

/** A step's three phrasings: the row once it ran, the live status while it runs, an error line's opening. */
interface StepPhrases {
  done: string;
  active: string;
  failed: string;
}

/** A shape a primitive tool adds, from its own name (`add_cube` → `cube`). */
const shapeOf = (tool: string): string => tool.replace(/^add_/, "").replace(/_/g, " ");

const fixed = (done: string, active: string, failed: string): StepPhrases => ({ done, active, failed });

/**
 * What each kind of step says, in the user's words (`chat/connector-steps.ts` decides the kind).
 * A step about one object names it, or the words for "one of those" when the call named none.
 */
const STEP_WORDS: Readonly<Record<StepAction, (step: ConnectorStep) => StepPhrases>> = {
  [StepAction.WroteBlueprint]: (s) =>
    s.object
      ? fixed(
          t("Wrote Blueprint {blueprint}", { blueprint: s.object }),
          t("Writing {blueprint}", { blueprint: s.object }),
          t("Couldn't write {blueprint}", { blueprint: s.object }),
        )
      : fixed(t("Wrote a Blueprint"), t("Writing a Blueprint"), t("Couldn't write a Blueprint")),
  [StepAction.MadeBlueprint]: (s) => {
    const blueprint = s.object ?? t("a Blueprint");
    return fixed(
      t("Made Blueprint {blueprint}", { blueprint }),
      t("Making Blueprint {blueprint}", { blueprint }),
      t("Couldn't make Blueprint {blueprint}", { blueprint }),
    );
  },
  [StepAction.CompiledBlueprint]: (s) => {
    const blueprint = s.object ?? t("a Blueprint");
    return fixed(
      t("Compiled {blueprint}", { blueprint }),
      t("Compiling {blueprint}", { blueprint }),
      t("Couldn't compile {blueprint}", { blueprint }),
    );
  },
  [StepAction.ReadBlueprint]: (s) => {
    const blueprint = s.object ?? t("a Blueprint");
    return fixed(
      t("Read Blueprint {blueprint}", { blueprint }),
      t("Reading {blueprint}", { blueprint }),
      t("Couldn't read {blueprint}", { blueprint }),
    );
  },
  [StepAction.EditedBlueprint]: (s) => {
    const blueprint = s.object ?? t("a Blueprint");
    return fixed(
      t("Edited Blueprint {blueprint}", { blueprint }),
      t("Editing {blueprint}", { blueprint }),
      t("Couldn't edit {blueprint}", { blueprint }),
    );
  },
  [StepAction.LookedUpNodes]: () =>
    fixed(t("Looked up Blueprint nodes"), t("Looking up Blueprint nodes"), t("Couldn't look up Blueprint nodes")),
  [StepAction.ReadGuide]: () =>
    fixed(t("Read the Blueprint guide"), t("Reading the Blueprint guide"), t("Couldn't read the Blueprint guide")),
  [StepAction.Placed]: (s) => {
    const actor = s.object ?? t("an actor");
    return fixed(
      t("Placed {actor}", { actor }),
      t("Placing {actor}", { actor }),
      t("Couldn't place {actor}", { actor }),
    );
  },
  [StepAction.AddedShape]: (s) => {
    const shape = shapeOf(s.tool);
    return fixed(
      t("Added a {shape}", { shape }),
      t("Adding a {shape}", { shape }),
      t("Couldn't add a {shape}", { shape }),
    );
  },
  [StepAction.Removed]: (s) => {
    const actor = s.object ?? t("an actor");
    return fixed(
      t("Removed {actor}", { actor }),
      t("Removing {actor}", { actor }),
      t("Couldn't remove {actor}", { actor }),
    );
  },
  [StepAction.Moved]: (s) => {
    const actor = s.object ?? t("an actor");
    return fixed(t("Moved {actor}", { actor }), t("Moving {actor}", { actor }), t("Couldn't move {actor}", { actor }));
  },
  [StepAction.OpenedLevel]: (s) => {
    const level = s.object ?? t("a level");
    return fixed(
      t("Opened level {level}", { level }),
      t("Opening {level}", { level }),
      t("Couldn't open {level}", { level }),
    );
  },
  [StepAction.LookedAtLevel]: () =>
    fixed(t("Looked at the level"), t("Looking at the level"), t("Couldn't look at the level")),
  [StepAction.LookedUpAssets]: () =>
    fixed(t("Looked through the assets"), t("Looking through the assets"), t("Couldn't look through the assets")),
  [StepAction.SavedAssets]: (s) =>
    s.count
      ? fixed(
          t("Saved {count, plural, one {# asset} other {# assets}}", { count: s.count }),
          t("Saving {count, plural, one {# asset} other {# assets}}", { count: s.count }),
          t("Couldn't save the assets"),
        )
      : fixed(t("Saved the assets"), t("Saving the assets"), t("Couldn't save the assets")),
  [StepAction.MadeMaterial]: (s) => {
    const material = s.object ?? t("a material");
    return fixed(
      t("Made material {material}", { material }),
      t("Making material {material}", { material }),
      t("Couldn't make material {material}", { material }),
    );
  },
  [StepAction.ImportedAsset]: (s) => {
    const asset = s.object ?? t("an asset");
    return fixed(
      t("Imported {asset}", { asset }),
      t("Importing {asset}", { asset }),
      t("Couldn't import {asset}", { asset }),
    );
  },
  [StepAction.RanScript]: (s) => {
    const script = s.object ?? t("a script");
    return fixed(
      t("Ran {script}", { script }),
      t("Running {script}", { script }),
      t("Couldn't run {script}", { script }),
    );
  },
  [StepAction.Played]: () => fixed(t("Played the level"), t("Playing the level"), t("Couldn't play the level")),
  [StepAction.StoppedPlay]: () => fixed(t("Stopped play"), t("Stopping play"), t("Couldn't stop play")),
  [StepAction.CheckedPlay]: () => fixed(t("Checked whether play runs"), t("Checking play"), t("Couldn't check play")),
  [StepAction.Screenshot]: () =>
    fixed(t("Took a screenshot"), t("Taking a screenshot"), t("Couldn't take a screenshot")),
  [StepAction.PlayShot]: () =>
    fixed(t("Took a play-view shot"), t("Taking a play-view shot"), t("Couldn't take a play-view shot")),
  [StepAction.HeroShot]: (s) => {
    const camera = s.object ?? t("a hero camera");
    return fixed(
      t("Took a still from {camera}", { camera }),
      t("Taking a still from {camera}", { camera }),
      t("Couldn't take a still from {camera}", { camera }),
    );
  },
  [StepAction.MotionStrip]: () =>
    fixed(t("Took a motion strip"), t("Taking a motion strip"), t("Couldn't take a motion strip")),
  [StepAction.ListedCameras]: () =>
    fixed(t("Listed the hero cameras"), t("Listing the hero cameras"), t("Couldn't list the hero cameras")),
  [StepAction.ViewportShot]: () =>
    fixed(
      t("Took a screenshot of the level"),
      t("Taking a screenshot of the level"),
      t("Couldn't take a screenshot of the level"),
    ),
  [StepAction.PictureOf]: (s) => {
    const asset = s.object ?? t("an asset");
    return fixed(
      t("Took a picture of {asset}", { asset }),
      t("Taking a picture of {asset}", { asset }),
      t("Couldn't take a picture of {asset}", { asset }),
    );
  },
  [StepAction.ReadLog]: () =>
    fixed(t("Read the editor log"), t("Reading the editor log"), t("Couldn't read the editor log")),
  [StepAction.HeldInput]: (s) => {
    const input = s.object ?? t("an input");
    return fixed(t("Held {input}", { input }), t("Holding {input}", { input }), t("Couldn't hold {input}", { input }));
  },
  [StepAction.LetGo]: () =>
    fixed(t("Let go of every input"), t("Letting go of every input"), t("Couldn't let go of every input")),
  [StepAction.ReadPlayer]: () =>
    fixed(t("Read the player's state"), t("Reading the player's state"), t("Couldn't read the player's state")),
  [StepAction.ReadControls]: () =>
    fixed(t("Read the controls"), t("Reading the controls"), t("Couldn't read the controls")),
  [StepAction.AppliedPart]: (s) => {
    const part = s.object ?? t("a part");
    return fixed(
      t("Applied part {part}", { part }),
      t("Applying part {part}", { part }),
      t("Couldn't apply part {part}", { part }),
    );
  },
  [StepAction.Retargeted]: () => fixed(t("Retargeted clips"), t("Retargeting clips"), t("Couldn't retarget clips")),
  [StepAction.Audited]: () => fixed(t("Audited the level"), t("Auditing the level"), t("Couldn't audit the level")),
  [StepAction.SetRoute]: () => fixed(t("Set the route"), t("Setting the route"), t("Couldn't set the route")),
  [StepAction.LaidTerrain]: () => fixed(t("Laid the terrain"), t("Laying the terrain"), t("Couldn't lay the terrain")),
  [StepAction.Settled]: () =>
    fixed(t("Let the game settle"), t("Letting the game settle"), t("Couldn't let the game settle")),
  [StepAction.DroveRoute]: () => fixed(t("Drove the route"), t("Driving the route"), t("Couldn't drive the route")),
  [StepAction.MeasuredRoute]: () =>
    fixed(t("Measured the route"), t("Measuring the route"), t("Couldn't measure the route")),
  [StepAction.CheckedProject]: () =>
    fixed(t("Checked the project"), t("Checking the project"), t("Couldn't check the project")),
  [StepAction.ListedToolsets]: () =>
    fixed(t("Listed the toolsets"), t("Listing the toolsets"), t("Couldn't list the toolsets")),
  [StepAction.ReadToolset]: (s) =>
    s.object
      ? fixed(
          t("Read the {toolset} toolset", { toolset: s.object }),
          t("Reading the {toolset} toolset", { toolset: s.object }),
          t("Couldn't read the {toolset} toolset", { toolset: s.object }),
        )
      : fixed(t("Read a toolset"), t("Reading a toolset"), t("Couldn't read a toolset")),
  [StepAction.Other]: (s) => fixed(`${s.toolset ?? ""} · ${s.tool}`, "", `${s.toolset ?? ""} · ${s.tool}`),
};

/** The icon a step's row carries: what kind of work it was. */
const STEP_ICONS: Readonly<Record<StepAction, ToolIcon>> = {
  [StepAction.WroteBlueprint]: "write",
  [StepAction.MadeBlueprint]: "write",
  [StepAction.CompiledBlueprint]: "write",
  [StepAction.EditedBlueprint]: "write",
  [StepAction.Placed]: "write",
  [StepAction.AddedShape]: "write",
  [StepAction.Removed]: "write",
  [StepAction.Moved]: "write",
  [StepAction.SavedAssets]: "write",
  [StepAction.MadeMaterial]: "write",
  [StepAction.ImportedAsset]: "write",
  [StepAction.AppliedPart]: "write",
  [StepAction.Retargeted]: "write",
  [StepAction.SetRoute]: "write",
  [StepAction.LaidTerrain]: "write",
  [StepAction.ReadBlueprint]: "read",
  [StepAction.LookedUpNodes]: "read",
  [StepAction.ReadGuide]: "read",
  [StepAction.LookedAtLevel]: "read",
  [StepAction.LookedUpAssets]: "read",
  [StepAction.ReadLog]: "read",
  [StepAction.ReadControls]: "read",
  [StepAction.ReadPlayer]: "read",
  [StepAction.ListedToolsets]: "read",
  [StepAction.ReadToolset]: "read",
  [StepAction.ListedCameras]: "read",
  [StepAction.Audited]: "read",
  [StepAction.MeasuredRoute]: "read",
  [StepAction.CheckedProject]: "read",
  [StepAction.Screenshot]: "see",
  [StepAction.PlayShot]: "see",
  [StepAction.ViewportShot]: "see",
  [StepAction.PictureOf]: "see",
  [StepAction.HeroShot]: "see",
  [StepAction.MotionStrip]: "see",
  [StepAction.Played]: "game",
  [StepAction.StoppedPlay]: "game",
  [StepAction.CheckedPlay]: "game",
  [StepAction.HeldInput]: "game",
  [StepAction.LetGo]: "game",
  [StepAction.Settled]: "game",
  [StepAction.DroveRoute]: "game",
  [StepAction.OpenedLevel]: "game",
  [StepAction.RanScript]: "run",
  [StepAction.Other]: "run",
};

/** What a connector is called when nothing names it. */
const A_CONNECTOR = t("a connector");
/** How long a failed step's line may be before it is clipped: one line in a narrow chat. */
const FAILURE_LINE_MAX = 120;

/**
 * An error's first sentence, on one line: its first line (with the next when the first only
 * introduces it, ending in a colon), up to its first full stop. The whole text stays in the step's
 * detail, line by line; only this opening passes through `withoutIds`.
 */
export function firstSentence(error: string): string {
  const lines = error
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const [first = "", second] = lines;
  const head = first.endsWith(":") && second ? `${first} ${second}` : first;
  const stop = head.search(/[.!?]\s/);
  return withoutIds(stop >= 0 ? head.slice(0, stop + 1) : head);
}

/**
 * A connector step's row: what it did once it ran (a failure leads with what it could not do and
 * the error's first sentence, clipped to one line), and what it is doing while it runs, with where
 * ("Writing BP_Lamp in Unreal"). A tool the table does not know reads as its toolset and tool,
 * or its connector and tool.
 */
export function connectorStepWords(
  step: ConnectorStep,
  where: string,
  outcome: { ok?: boolean; error?: string | null } = {},
): { label: string; active: string; icon: ToolIcon } {
  const icon = STEP_ICONS[step.action];
  const named = step.action === StepAction.Other && !step.toolset ? { ...step, toolset: where } : step;
  const phrases = STEP_WORDS[named.action](named);
  const active = activeStepWords(phrases.active, where);
  if (outcome.ok !== false) return { label: phrases.done, active, icon };
  const why = firstSentence(outcome.error ?? "");
  return { label: clip(why ? `${phrases.failed}: ${why}` : phrases.failed, FAILURE_LINE_MAX), active, icon };
}

/** What a step is doing while it runs, and where; a step with no phrasing of its own is work in its connector. */
function activeStepWords(doing: string, where: string): string {
  if (!doing) return t("Working in {where}", { where: where || A_CONNECTOR });
  return where ? t("{doing} in {where}", { doing, where }) : doing;
}

/** A connector's pictures in the chat: the work's play views and a row's own screenshots. */
export const CHAT_SHOT_WORDS = {
  /** A picture's tooltip, as a file the chat opens beside it says (`MAC_FILE_WORDS`). */
  opensBeside: t("Opens beside the chat"),
  playView: (n: number) => t("Play view {index}", { index: n }),
  screenshot: t("Screenshot"),
} as const;

/** "Worked in Blender and Unreal · 3 steps": the plugins a work group ran in, and how many steps. */
export function workSummaryWords(sources: readonly string[], steps: number): string {
  if (!sources.length) return t("Worked on {count, plural, one {# step} other {# steps}}", { count: steps });
  return t("Worked in {sources} · {count, plural, one {# step} other {# steps}}", {
    sources: formatList(sources),
    count: steps,
  });
}

/** A part the harness stopped because two builds running could not be judged for the same reason. */
export function circuitBreakWords(part: PartRound & { reason?: string | null }): string {
  const why =
    withoutIds((part.reason ?? "").trim()) || t("two builds in a row could not be reviewed, for the same reason");
  return t("{part} stopped: {why} — its work so far is kept", { part: partName(part), why });
}

/** A check that could not be measured where it was pointed, re-aimed or dropped. */
export function checkReplanWords(part: PartRound & { action?: string | null; why?: string | null }): string {
  const why = part.why ? ` — ${withoutIds(part.why)}` : "";
  return `${partName(part)}: ${replanWhat((part.action ?? "").toLowerCase())}${why}`;
}

function replanWhat(action: string): string {
  if (action.includes("drop")) return t("the studio dropped one of its checks");
  if (action.includes("repoint")) return t("the studio re-aimed one of its checks at another camera");
  return t("the studio changed one of its checks");
}

/** A builder that stopped to tell the studio something is wrong with the run itself. */
export function flagWords(part: PartRound & { what?: string | null }): string {
  return t("{part} raised a problem with the build: {problem}", {
    part: partName(part),
    problem: withoutIds((part.what ?? "").trim()),
  });
}

/**
 * The run's plan: what it is for, the parts it will hand out, and — only when the run is
 * actually holding for an answer — the one word that starts it. A lead writes its own summary
 * (`plan`); the programmed pipeline sends the parts alone. A plan nobody asked to review is a
 * card to read, not a question: the builders are already starting, and asking for a "go" that
 * changes nothing would be a promise the run does not keep.
 */
export function planReviewWords(plan: {
  facets?: Array<{ id?: string | null; title?: string | null }> | null;
  waitMinutes?: number | null;
  summary?: string | null;
  /** What kind of game the run decided this is (M4.5b) — the plan card's one other decision. */
  game?: { kind?: string | null } | null;
}): string {
  const parts = (plan.facets ?? []).map((facet) => withoutIds((facet?.title ?? "").trim())).filter(Boolean);
  const summary = withoutIds((plan.summary ?? "").trim());
  // The kind is written back into the game and decides the controls the studio drives before
  // every judgement and which critic reads the build. The window meant for objecting to the
  // plan used to show every part of it except that one.
  const kind = String(plan.game?.kind ?? "")
    .trim()
    .replace(/[^a-z-]/g, "");
  const declared = kind
    ? ` ${t("It treats this as a {kind} game — that decides the controls it drives before every look, and who reviews it.", { kind: kind.replace(/-/g, " ") })}`
    : "";
  const head = `${planOpening(summary, parts.join(" · "))}${declared}`;
  const waiting = Math.trunc(plan.waitMinutes ?? 0);
  return waiting > 0
    ? `${head} ${t('Say "go" to start it, or say what to change; it waits up to {minutes} min.', { minutes: Math.max(1, waiting) })}`
    : `${head} ${t("Say what to change and the workers will hear it.")}`;
}

/** The plan card's first sentence: the lead's own summary with the parts after it, or that the plan is ready. */
function planOpening(summary: string, parts: string): string {
  if (summary) return parts ? `${sentence(summary)} ${t("The parts: {parts}.", { parts })}` : sentence(summary);
  return parts ? t("the plan is ready — {parts}.", { parts }) : t("the plan is ready.");
}

/** A build that stopped where it can be picked up again, when no result card says so. */
export function pausedWords(): string {
  return t("The build stopped. Everything built so far is kept.");
}

/** Why the studio resumed a build on its own (`run_auto_resumed`), as the chat says it. */
const AUTO_RESUMED_WORDS = {
  [AutoResumeCause.LimitReset]: t("Resumed automatically after the limit reset"),
  [AutoResumeCause.LoopRestart]: t("Resumed automatically after Studio’s loop restarted"),
  [AutoResumeCause.ProviderOutage]: t("Resumed automatically to try the model provider again after its outage"),
} as const satisfies Record<AutoResumeCause, string>;

/** The chat's line for a build the studio resumed on its own; a cause this version does not know still reads. */
export function autoResumedWords(cause: unknown): string {
  const known = Object.values(AutoResumeCause).find((value) => value === cause);
  return known ? AUTO_RESUMED_WORDS[known] : t("Resumed automatically");
}

/** Settings → Harness: the switch for host auto-resume. */
export const AUTO_RESUME_SETTING_WORDS = {
  label: t("Resume builds automatically"),
  detail: t(
    "When a session limit resets, a while after a model provider’s outage, or when Studio’s loop restarts, a paused build picks up where it left off, up to twice per build. A build you stop stays stopped, and one paused on a sign-in waits for you.",
  ),
} as const;

/** Settings → Permissions: the switch that lets agents ask to control the person's computer. */
export const COMPUTER_CONTROL_SETTING_WORDS = {
  section: t("Computer control"),
  label: t("Let agents use your computer"),
} as const;

/** What the switch says on `platform`, in one line: agents ask first, or where it runs. */
export function computerControlDetail(platform: string): string {
  if (!computerControlOffered(platform)) return t("macOS and Windows only.");
  return t("They ask before each app.");
}

/** What computer control never touches on `platform`, under a computer-control card's Details. */
export function computerNeverWords(platform: string): string {
  if (platform === StudioPlatform.Windows)
    return t("It never uses password managers, Windows Settings, password prompts or Genex.");
  return t("It never uses password managers, System Settings, password prompts or Genex.");
}

export function resumedWords(parts: number): string {
  const done = Math.max(0, Math.trunc(parts || 0));
  return done
    ? t("picking up where it left off — {count, plural, one {# finished part} other {# finished parts}} kept", {
        count: done,
      })
    : t("picking up where it left off");
}

/**
 * What the stage's Reload says while Live is behind (docs/product/builds-live.md). Nothing
 * changes Live while the person watches it, so the button that would bring the change names it.
 */
const LIVE_BEHIND_WORDS = {
  [LiveBehindReason.Changed]: t("The game changed — reload to see it"),
  [LiveBehindReason.Build]: t("A new build is ready — reload to play it"),
  [LiveBehindReason.Broken]: t("This build turned out not to run — reload to go back to your game"),
} as const satisfies Record<LiveBehindReason, string>;

/** Reload's tooltip while Live is behind; the builder's own note, when it left one, follows. */
export function liveBehindWords(reason: LiveBehindReason): string {
  return LIVE_BEHIND_WORDS[reason];
}

/** Reload's accessible name while Live is behind: the tooltip, note and all. */
export function liveBehindLabel(reason: LiveBehindReason, note: string | null): string {
  const words = liveBehindWords(reason);
  return note ? `${words}: ${note}` : words;
}

/** The stage strip's tabs, Play/Stop and full screen, as their tooltips and accessible names say them. */
export const STAGE_WORDS = {
  stop: t("Stop game"),
  stopping: t("Stopping game"),
  play: t("Play game"),
  starting: t("Starting game"),
  fullScreen: t("Full screen"),
  /** The view switcher's name. */
  views: t("Game view"),
  /** The folded views' button: the switcher's name and the view it shows ("Game view: Builds"). */
  viewsButton: (view: string) => t("Game view: {view}", { view }),
  /** The view switcher's tabs; a folder with more than one Live view names each by what it shows. */
  tabs: {
    live: t("Live"),
    builds: t("Builds"),
    shop: t("Shop"),
    assets: t("Assets"),
    webGame: t("Web game"),
    unreal: "Unreal",
  },
} as const;

/** Live for a folder with no view of its own (Godot, Blender, files of its own): the latest pictures its runs kept. */
export const STILLS_WORDS = {
  /** Under the game's name while no run has kept a picture: one line, as the empty state's subtitle is. */
  none: t("Pictures show here once a Loop takes them."),
  /** A picture's alt text: the capture's label and the picture's name. */
  picture: (label: string, name: string) => (name ? `${label}: ${name}` : label),
} as const;

/** A plugin's Live card (`panels/stage/PluginCardStage.tsx`): the words Studio draws around what the plugin says. */
export const PLUGIN_CARD_WORDS = {
  /** The shot's alt text: the game's name in play. */
  playShot: (game: string) => t("{game} in play", { game }),
  /** The line while the plugin is off or has not answered, under the game's name. */
  waiting: (plugin: string) => t("Plays in {plugin}.", { plugin }),
} as const;

// ── an agent at its screen ────────────────────────────────────────────────────────────────

/** What an agent is doing at its screen, as its node says it while it happens. */
const SCREEN_DOING: Record<ScreenDeed, string> = {
  [ScreenDeed.Load]: t("Opening the game"),
  [ScreenDeed.Look]: t("Looking around"),
  [ScreenDeed.Click]: t("Clicking"),
  [ScreenDeed.Press]: t("Pressing"),
  [ScreenDeed.Type]: t("Typing"),
  [ScreenDeed.Drag]: t("Dragging"),
  [ScreenDeed.Move]: t("Moving the mouse"),
  [ScreenDeed.Scroll]: t("Scrolling"),
  [ScreenDeed.Wait]: t("Watching"),
  [ScreenDeed.Reload]: t("Reloading"),
};

/** The same deeds, done: the steps of a screen's trail. */
const SCREEN_DONE: Record<ScreenDeed, string> = {
  [ScreenDeed.Load]: t("Opened"),
  [ScreenDeed.Look]: t("Looked"),
  [ScreenDeed.Click]: t("Clicked"),
  [ScreenDeed.Press]: t("Pressed"),
  [ScreenDeed.Type]: t("Typed"),
  [ScreenDeed.Drag]: t("Dragged"),
  [ScreenDeed.Move]: t("Moved"),
  [ScreenDeed.Scroll]: t("Scrolled"),
  [ScreenDeed.Wait]: t("Watched"),
  [ScreenDeed.Reload]: t("Reloaded"),
};

/** A frame from a producer that predates deed codes: the agent is at its screen, doing something. */
const SCREEN_PLAYING = { doing: t("Playing"), done: t("Played") } as const;

/** Keys a player reads differently from the name an agent gives them. */
const KEY_WORD: Record<string, string> = {
  arrowleft: "←",
  left: "←",
  arrowright: "→",
  right: "→",
  arrowup: "↑",
  up: "↑",
  arrowdown: "↓",
  down: "↓",
  " ": "Space",
  space: "Space",
  return: "Enter",
  enter: "Enter",
  escape: "Esc",
  esc: "Esc",
  backspace: "Delete",
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  super: "⌘",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "⌥",
  option: "⌥",
};

/** The keys a Windows or Linux keyboard names in words where the Mac's carries a glyph. */
const KEY_WORD_OFF_MAC: Record<string, string> = {
  cmd: "Win",
  command: "Win",
  meta: "Win",
  super: "Win",
  alt: "Alt",
  option: "Alt",
};

function keyWord(key: string, platform: string): string {
  const lower = key.toLowerCase();
  const offMac = platform !== "" && platform !== StudioPlatform.Mac;
  if (offMac && Object.hasOwn(KEY_WORD_OFF_MAC, lower)) return KEY_WORD_OFF_MAC[lower] ?? key;
  if (Object.hasOwn(KEY_WORD, lower)) return KEY_WORD[lower] ?? key;
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Keys as a player reads them: "space" is Space, "ArrowRight" is →, "shift+w" is Shift+W; "meta"
 * is ⌘ on the Mac (or before main answers) and Win elsewhere, "alt" ⌥ or Alt.
 */
export function keysWords(keys: readonly string[], platform = ""): string {
  return keys
    .flatMap((combo) => (combo === "+" ? [combo] : combo.split("+").filter(Boolean)))
    .map((key) => keyWord(key, platform))
    .join("+");
}

/** A deed and, for a press, its keys. */
function screenWords(
  act: ScreenAct | undefined,
  words: Record<ScreenDeed, string>,
  pressing: (keys: string) => string,
  unknown: string,
  platform: string,
): string {
  if (!act || !Object.hasOwn(words, act.deed)) return unknown;
  if (act.deed === ScreenDeed.Press && act.keys?.length) return pressing(keysWords(act.keys, platform));
  return words[act.deed];
}

/** What an agent is doing at its screen, as its node says it: "Pressing Space", "Looking around". */
export const screenDoing = (act: ScreenAct | undefined, platform = ""): string =>
  screenWords(act, SCREEN_DOING, (keys) => t("Pressing {keys}", { keys }), SCREEN_PLAYING.doing, platform);

/** The same, done, as a step of its trail says it: "Pressed →", "Opened". */
export const screenDone = (act: ScreenAct | undefined, platform = ""): string =>
  screenWords(act, SCREEN_DONE, (keys) => t("Pressed {keys}", { keys }), SCREEN_PLAYING.done, platform);

/** A frame this recent is happening now. */
const SCREEN_NOW_MS = 2 * SECOND_MS;

/** A minute, in the seconds a running clock shows. */
const SECONDS_PER_MINUTE = MINUTE_MS / SECOND_MS;

/**
 * "42s", "3m 5s", "2h 10m": a running clock, as short as the time allows, and nothing under a second.
 * Between a clock's two parts is a no-break space: the status clock's figures are tabular, and the
 * house font's tabular set widens a plain space to a figure's width; this one keeps a word space's.
 */
export function clockWords(ms: number): string {
  const seconds = Math.floor(ms / SECOND_MS);
  if (ms < SECOND_MS) return "";
  if (ms < MINUTE_MS) return t("{seconds}s", { seconds });
  if (ms < HOUR_MS)
    return t("{minutes}m {seconds}s", {
      minutes: Math.floor(ms / MINUTE_MS),
      seconds: seconds % SECONDS_PER_MINUTE,
    });
  return t("{hours}h {minutes}m", {
    hours: Math.floor(ms / HOUR_MS),
    minutes: Math.floor((ms % HOUR_MS) / MINUTE_MS),
  });
}

/** How long ago a screen's frame came: "now", "3s", "2m" on a node, "3s ago" where there is room. */
export function screenAgo(at: number, now: number, { ago = false }: { ago?: boolean } = {}): string {
  const ms = Math.max(0, now - at);
  if (ms < SCREEN_NOW_MS) return t("now");
  if (ms < MINUTE_MS) {
    const seconds = Math.round(ms / SECOND_MS);
    return ago ? t("{seconds}s ago", { seconds }) : t("{seconds}s", { seconds });
  }
  const minutes = Math.round(ms / MINUTE_MS);
  return ago ? t("{minutes}m ago", { minutes }) : t("{minutes}m", { minutes });
}

// ── words several surfaces say ────────────────────────────────────────────────────────────

/** A Loop's hours as the person picked them: whole hours, else minutes. */
const loopSpan = (hours: number): string =>
  Number.isInteger(hours)
    ? t("{count, plural, one {# hour} other {# hours}}", { count: hours })
    : t("{count, plural, one {# minute} other {# minutes}}", { count: Math.round(hours * 60) });
/** A Loop that ended with something still to fix: its card in the chat and in Builds. */
export const STILL_TO_FIX_WORDS = {
  title: t("Almost there"),
  done: t("Done"),
  left: t("Still to fix"),
  keepBuilding: t("Keep building"),
  /** Why the Loop stopped, in one line under the title. */
  why: {
    time: (hours: number | null) =>
      hours === null
        ? t("Its time ran out before this was fixed.")
        : t("Your {span} ran out before this was fixed.", { span: loopSpan(hours) }),
    /** Its time ran out before the game had a final look, so nothing is listed. */
    timeUnlooked: (hours: number | null) =>
      hours === null
        ? t("Its time ran out before a final look at your game.")
        : t("Your {span} ran out before a final look at your game.", { span: loopSpan(hours) }),
    stuck: t("It kept getting this wrong, so it stopped to save your credits."),
    person: t("You stopped it before this was fixed."),
    ended: t("It stopped before this was fixed."),
  },
  /** The message Keep building sends for the person: what is left, else to go on where it stopped. */
  ask: (notDone: readonly string[]) =>
    notDone.length
      ? [t("Keep building: fix what’s left."), ...notDone.map((item) => `- ${item}`)].join("\n")
      : t("Keep building where you left off."),
} as const;

/**
 * The plan's two replies. The steering card and the composer both offer them, and a waiting plan
 * starts on exactly `go`, so each is spelled once. `go` is the word the run listens for: never translated.
 */
export const PLAN_WORDS = {
  /** the reply that starts a plan waiting for it */
  go: "go",
  /** the composer's prefill for asking for a change */
  changePrefill: t("Change the plan: "),
} as const;

/** Who asks, when a plugin's question names no plugin. */
export const A_PLUGIN = t("A plugin");

/** The steps card's own words; its rows are the plugin's. */
export const STEPS_WORDS = {
  /** Puts the card away for this game until the agent shows it again. */
  hide: t("Hide"),
  hideLabel: t("Hide this card until the agent shows it again"),
  done: t("(done)"),
  copy: t("Copy"),
  copied: t("Copied"),
  /** A step's button whose plugin is no longer installed. */
  pluginGone: t("This step's plugin isn't installed any more."),
} as const;

/** The turn-it-on card a session shows for a Genex plugin (`chat/PluginSuggestionCard.tsx`). */
export const PLUGIN_SUGGESTION_WORDS = {
  turnOn: (name: string) => t("Turn on {name}", { name }),
  install: t("Install…"),
  isOn: (name: string) => t("{name} is on", { name }),
  /** The quiet button on a plugin that is on: its page in Plugins, where it turns off again. */
  manage: t("Plugins"),
  manageLabel: (name: string) => t("Open {name} in Plugins", { name }),
  close: t("Put this suggestion away"),
  folders: (paths: string) => t("Turning it on lets its programs write in: {paths}", { paths }),
  /** A plugin loaded from a folder on this Mac: its code isn't sandboxed, and its tools ask first. */
  localAccess: t(
    "Loaded from a folder on this Mac. It runs with your access, and each of its tools asks you before an agent runs it; its own steps at Genex's moments don't ask.",
  ),
} as const;

/** Each game engine as the chat names it. */
export const GAME_ENGINE_WORDS = { web: t("the web"), unreal: "Unreal", godot: "Godot" } as const satisfies Record<
  GameEngine,
  string
>;

/**
 * What the sidebar shows beside a project that isn't a game, by the core fact it holds; a fact
 * missing here is a game's (or one no word names) and shows nothing.
 */
export const PROJECT_KIND_WORDS = {
  [CoreFact.UnrealPlugin]: t("Unreal plugin"),
  [CoreFact.BlenderAssets]: t("Blender assets"),
} as const satisfies Partial<Record<CoreFact, string>>;

// ── the chat transcript ───────────────────────────────────────────────────────────────────

/** The fixed lines, labels and prefills `chat-entries.ts` writes into the transcript. */
export const TRANSCRIPT_WORDS = {
  /** A game's engine link (`engine_linked`): one line with Undo, then what Undo did. */
  engineLinked: (game: string | undefined, engine: string, project: string) =>
    t("{game} now builds in {engine} · {project}", { game: game ?? t("This game"), engine, project }),
  /** A link whose plugin also set the project up for Genex: the same one line, the set-up first. */
  engineSetUpAndLinked: (game: string | undefined, engine: string, project: string) =>
    t("Set up {project} for Genex · {game} now builds in {engine}", { project, game: game ?? t("This game"), engine }),
  /** What Undo did: where the game builds now, and the project whose set-up it also took back. */
  engineUndone: (
    game: string | undefined,
    restored: string | undefined,
    setUp: { undone?: string; kept?: string } = {},
  ) => {
    const name = game ?? t("This game");
    if (setUp.undone)
      return restored
        ? t("Undone. {game} builds in {engine} again, and {project} is no longer set up for Genex.", {
            game: name,
            engine: restored,
            project: setUp.undone,
          })
        : t("Undone. {game} is a web game again, and {project} is no longer set up for Genex.", {
            game: name,
            project: setUp.undone,
          });
    const now = restored
      ? t("Undone. {game} builds in {engine} again.", { game: name, engine: restored })
      : t("Undone. {game} is a web game again.", { game: name });
    return setUp.kept
      ? `${now} ${t("{project} stays set up for Genex: another game uses it.", { project: setUp.kept })}`
      : now;
  },
  engineUndo: t("Undo"),
  engineUndoTitle: t("Take this back: the game builds where it did before"),
  /** An agent went ahead of the person in an app a plugin's lock guards (`agent_went_ahead`): said once. */
  wentAhead: (app: string) => t("An agent used {app} while you were playing.", { app }),
  wentAheadSettings: (app: string) => t("{app} settings", { app }),
  wentAheadSettingsTitle: (app: string) => t("Choose whether agents may use {app} while you play", { app }),
  rewound: (files: number) =>
    t(
      "{count, plural, one {The chat went back, and # game file with it.} other {The chat went back, and # game files with it.}}",
      { count: files },
    ),
  rewindUndo: t("Bring back newer version"),
  rewindUndoTitle: t("Put the game files back as they were before this rewind; the chat stays rewound"),
  rewindUndone: t("The game is back as it was before the rewind. The chat stays rewound."),
  planCancelled: t("Plan cancelled."),
  studioRestarted: t("Studio restarted"),
  workspaceRestored: t("Workspace restored"),
  toolResult: t("Tool result"),
  notAllowed: t("was not allowed to do that"),
  notAllowedDetail: t("The worker tried something outside the rules of its workspace."),
  checkpoint: t("the preview shows the current build"),
  signInAgain: (provider: string) =>
    t("{provider} needs you to sign in again. Your project is still here.", { provider }),
  rebuiltItself: t("rebuilt itself"),
  plugin: t("Plugin"),
  sayGo: t("Say go"),
  changeIt: t("Change it"),
  reviewInHarness: t("Review in Harness"),
  seeInHarness: t("See in Harness"),
  /** the tags of a reviewer's and a builder's narration rows */
  checkTag: tc("tag", "Check"),
  workerTag: t("Worker"),
  /** A job's line (`job_started`): Stop while it runs. */
  jobStop: t("Stop"),
  jobStopTitle: t("Stop this background work"),
  /** A missing macOS permission (`app_look_access`): the button opens System Settings, not Genex's own Settings. */
  openPrivacySettings: t("Open Privacy settings"),
  /** An Ollama turn its small context refused: the button makes a 16K copy of the model and picks it. */
  raiseContext: t("Raise context to 16K"),
  raisingContext: t("Raising…"),
} as const;

// ── background work ───────────────────────────────────────────────────────────────────────

/** Minutes in an hour. */
export const MINUTES_PER_HOUR = HOUR_MS / MINUTE_MS;

/** A span of whole minutes: "9 min", "1 h", "1 h 5 min". */
export function spanWords(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return t("{minutes} min", { minutes });
  const rest = minutes % MINUTES_PER_HOUR;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return rest ? t("{hours} h {minutes} min", { hours, minutes: rest }) : t("{hours} h", { hours });
}

/** A job's whole minutes: "4 min", "1 h 5 min", or `short` under a minute. */
function jobMinutes(minutes: number, short: string): string {
  const whole = Math.max(0, Math.floor(minutes));
  return whole < 1 ? short : spanWords(whole);
}

/** How a stopped job was stopped, by who stopped it; the person's and the agent's Stop read alike. */
const STOPPED_WORDS = {
  [JobStopper.Agent]: t("stopped"),
  [JobStopper.Person]: t("stopped"),
  [JobStopper.Quit]: t("stopped when Genex closed"),
  [JobStopper.ScopeEnded]: t("stopped when its work ended"),
} as const satisfies Record<JobStopper, string>;

/**
 * Where a job is, after its title: "4 min" while it runs, "finished · 4 min", "failed · 4 min",
 * "stopped", "stopped at its time limit", "stopped when Genex closed", "stopped when its work ended";
 * "ended" for a state this version does not know.
 */
export function jobStatusWords(
  state: BackgroundJobState | undefined,
  stoppedBy: JobStopper | undefined,
  minutes: number,
): string {
  if (state === BackgroundJobState.Running) return jobMinutes(minutes, t("just started"));
  if (state === BackgroundJobState.Succeeded)
    return t("finished · {time}", { time: jobMinutes(minutes, t("under a minute")) });
  if (state === BackgroundJobState.Failed)
    return t("failed · {time}", { time: jobMinutes(minutes, t("under a minute")) });
  if (state === BackgroundJobState.TimedOut) return t("stopped at its time limit");
  if (state === BackgroundJobState.Interrupted) return STOPPED_WORDS[JobStopper.Quit];
  if (state === BackgroundJobState.Stopped)
    return stoppedBy ? STOPPED_WORDS[stoppedBy] : STOPPED_WORDS[JobStopper.Agent];
  return t("ended");
}

/** A job's line: "In the background: Unreal build · Scene builder · finished · 4 min"; no status while it runs. */
export function inBackground(title: string, status: string, worker?: string): string {
  return [t("In the background: {title}", { title }), worker, status].filter(Boolean).join(" · ");
}

/** A running job's line with the minutes it has run: "In the background: Unreal build · 4 min". */
export function jobRunningLine(line: string, minutes: number): string {
  return `${line} · ${jobStatusWords(BackgroundJobState.Running, undefined, minutes)}`;
}

/** Background work by how much of it runs and how much ended: "1 running · 2 finished", a zero left out. */
export function backgroundCount(running: number, finished: number): string {
  const parts = [
    running ? t("{count} running", { count: running }) : "",
    finished ? t("{count} finished", { count: finished }) : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

// ── the lead, its workers and the finish check on the Builds graph ────────────────────────

/** A worker's status on its node and its card: what it is doing, or how it ended. Never how it works. */
export const WORKER_WORDS = {
  working: t("Working"),
  workingIn: (engine: string) => t("Working in {where}", { where: engine }),
  added: t("Added to your game"),
  done: t("Done"),
  didntFinish: t("Didn't finish"),
  /** the host refused its session: it never ran */
  notStarted: t("Not started"),
  /** it finished, changed nothing and delivered nothing */
  nothingMade: t("Nothing made"),
  stopped: t("Stopped"),
  notUsed: t("Not used"),
  /** the quotes on a worker's card */
  asked: t("The lead asked"),
  leadSaid: t("The lead"),
} as const;

/**
 * Why a worker stopped short, by the code its end record carries (`WorkerStopCode`), as its card
 * and its chat line say it. The record's own reason is the harness's text for the lead: never shown.
 */
export const WORKER_STOP_WORDS = {
  [WorkerStopCode.HostRefused]: t("Your Settings allow no more workers at once"),
  [WorkerStopCode.TurnEnded]: t("The chat turn ended first"),
  [WorkerStopCode.RunEnded]: t("The Loop ended first"),
  [WorkerStopCode.StoppedByLead]: t("The lead stopped it"),
  [WorkerStopCode.Error]: t("It ran into an error"),
  [WorkerStopCode.SandboxUnavailable]: t("Claude Code can't run workers on this computer yet"),
} as const satisfies Record<WorkerStopCode, string>;

/** Text as a sentence: its first letter capitalized, and a full stop when it has no end of its own. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?…]$/.test(capital) ? capital : `${capital}.`;
}

/** The chat's working line while the agent's work waits for the person to finish in an app a plugin guards. */
export const PERSON_FIRST_WORDS = {
  waiting: (label: string) => t("Waiting for you to finish in {app}", { app: label }),
} as const;

/**
 * A worker's one line in the chat (`chat/worker-lines.ts`): its task while it works, then what it
 * said (its own summary, else its task) and how it ended. Never an id or how it stands in the game.
 */
export const WORKER_LINE_WORDS = {
  working: (title: string) => `${title}…`,
  workingIn: (title: string, engine: string) => t("{task} in {engine}…", { task: title, engine }),
  done: (said: string) => asSentence(said),
  added: (said: string) => `${asSentence(said)} ${t("Added to your game.")}`,
  notUsed: (said: string, note: string | null) =>
    note ? `${asSentence(said)} ${t("Not used: {note}", { note })}` : `${asSentence(said)} ${t("Not used.")}`,
  didntFinish: (title: string, because: WorkerStopCode | null) =>
    because
      ? `${t("{task}: didn't finish.", { task: title })} ${asSentence(WORKER_STOP_WORDS[because])}`
      : t("{task}: didn't finish.", { task: title }),
  stopped: (title: string) => t("{task}: stopped.", { task: title }),
  /** The lead redirected a worker (`worker_steer`): the worker's task, when known, and what it was told. */
  told: (title: string | null, said: string) =>
    title ? t("Told “{task}”: {said}", { task: title, said }) : t("Told a worker: {said}", { said }),
} as const;

/**
 * The Building card's checklist (`chat/build-checklist.ts`): each step's status on its row, and the
 * card's one line, counted from the steps.
 */
export const BUILD_CHECKLIST_WORDS = {
  added: t("Added"),
  working: t("Working"),
  workingFor: (minutes: number) => t("Working · ~{minutes} min", { minutes }),
  workingRound: (round: number) => t("Working · round {round}", { round }),
  notAdded: t("Not added"),
  caption: (done: number, working: number) =>
    working ? t("{done} done · {working} working", { done, working }) : t("{done} done", { done }),
  finishing: (working: number) => (working ? t("Finishing up · {working} working", { working }) : t("Finishing up")),
  open: t("Open in Builds"),
  /** The card's toggle, as a screen reader names it. */
  toggle: t("Building: show or hide its parts"),
  /** The list's own name, for a screen reader. */
  list: t("Parts of the build"),
} as const;

/** The status line's rest while a Loop's workers work: "3 workers on it". */
export const workersOnIt = (count: number): string =>
  t("{count, plural, one {# worker} other {# workers}} on it", { count });

/** The lead's node and card: its name, and what it is doing by its face (`run-tree.ts` `LeadFace`). */
export const LEAD_WORDS = {
  name: t("The lead"),
  face: {
    working: t("Working on the next step"),
    waiting: t("Waiting for a worker"),
    paused: t("Paused"),
    done: t("Done"),
    stopped: t("Stopped"),
  } satisfies Record<LeadFace, string>,
  /** the lead's node as a screen reader names it, by face */
  heard: {
    working: t("The lead: working on the next step"),
    waiting: t("The lead: waiting for a worker"),
    paused: t("The lead: paused"),
    done: t("The lead: done"),
    stopped: t("The lead: stopped"),
  } satisfies Record<LeadFace, string>,
  /** the card's sentence by face */
  about: {
    working: t(
      "No part is working right now. The lead is deciding what comes next, or changing the game itself; a new part shows up here when it starts one.",
    ),
    waiting: t(
      "The lead is waiting for its workers. Each one is a row on the graph, named by what it was asked to do.",
    ),
    paused: t("The lead is paused with the Loop. Resume it from the chat."),
    done: t("The lead is done."),
    stopped: t("The lead stopped before it said it was done."),
  } satisfies Record<LeadFace, string>,
  /** the card's sentence for the lead at work in a tree, where each worker it starts is a row */
  aboutWorkingInTree: t("The lead is working on the next step itself; each worker it starts is a row here."),
} as const;

/** The background tile's first line, over the job's name: "In the background". */
export const JOBS_EYEBROW = t("In the background");

/** The background card: one row per job, read-only (Stop stays on the job's chat line). */
export const JOBS_WORDS = {
  title: t("In the background"),
  about: t("Long work the lead or a worker started, like a build. It runs on while the agents go on working."),
  by: (who: string) => t("Started by {who}", { who }),
  byLead: t("Started by the lead"),
} as const;

/** The finish check's node and card in Builds, named for the person as the Loop's final look at their game. */
export const FINISH_CHECK_WORDS = {
  name: t("Final look"),
  state: {
    not_yet: t("Not finished yet"),
    checking: t("Looking"),
    done: t("Done"),
    stopped: t("Not finished"),
  } satisfies Record<FinishCheckState, string>,
  about: t("Before the Loop calls it done, a second AI looks at your game."),
  /** The node's line and the card while the second AI looks. */
  checking: t("Looking at your game"),
  checkingCard: t("Looking at your game."),
  /** The node's line after a no: how many things are left. */
  leftWord: (left: number) => t("{count, plural, one {# thing} other {# things}} left", { count: left }),
  doneWord: t("All done"),
  doneCard: t("All done."),
  unanswered: t("Couldn't look this time"),
  unansweredCard: t("Couldn't look this time."),
  /** After a no, while the Loop works on. */
  keepsWorking: t("The Loop keeps working on it."),
  /** After a no, once the Loop has ended some other way. */
  endedAfterNo: t("The Loop ended before another look."),
} as const;

/**
 * A Loop's builds on the Builds graph (`run-graph-builds.ts`): each one's name and health check
 * outcome, where a worker hangs, the card that folds a build's finished workers, and the compare.
 */
export const BUILD_LINE_WORDS = {
  name: (n: number) => t("Build {number}", { number: n }),
  outcome: {
    passed: t("Passed"),
    blank: t("Blank screen"),
    errors: t("Errors"),
    failed: t("Did not pass"),
  } satisfies Record<BuildOutcome, string>,
  /** The card's line under its outcome: what made the build. */
  merged: (worker: string) => t("After {worker}", { worker }),
  leadsOwn: t("The main agent's own changes"),
  /** A merged worker's status on the build line: in that build, not yet the game. */
  addedToBuild: t("Added to your build"),
  /** A worker's first line on the graph: the build it hangs off, and why. */
  mergedInto: (n: number) => t("Merged into Build {number}", { number: n }),
  startedFrom: (n: number) => t("Started from Build {number}", { number: n }),
  startedFirst: t("Started before the first build"),
  /** The card that folds a build's finished workers, and what pressing it does. */
  folded: (count: number) => t("{count, plural, one {+# worker} other {+# workers}}", { count }),
  showAll: t("Show all"),
  showFewer: t("Show fewer"),
  foldLabel: (count: number) => t("{count, plural, one {Show # more worker} other {Show # more workers}}", { count }),
  /** The compare, when the picture is the one before it, measured. */
  unchanged: (n: number) => t("The picture did not visibly change from Build {number}.", { number: n }),
  before: (n: number) => t("Build {number}", { number: n }),
  problems: t("What the check found"),
  finding: {
    not_loaded: t("The page did not load."),
    crashed: t("The page crashed."),
    uncaught: t("The page threw an error it did not catch."),
    blank: t("The screen was blank: one flat colour, nothing drawn."),
  } satisfies Record<HealthFinding, string>,
  /** The technical details' key for the check's own words. */
  found: t("found"),
} as const;

/** An asset delivered again, beside the version before it on the run's Assets card. */
export const ASSET_VERSION_WORDS = {
  compare: t("Compare with the earlier version"),
  earlier: t("Earlier"),
  now: t("Now"),
  unchanged: t("The picture did not visibly change from the earlier version."),
} as const;

/** A worker's first line on a Loop's build line: the build its work went into, or the one it started from. */
export function workerPlaceWords(place: { build: number; merged: boolean }): string {
  if (place.merged) return BUILD_LINE_WORDS.mergedInto(place.build);
  return place.build ? BUILD_LINE_WORDS.startedFrom(place.build) : BUILD_LINE_WORDS.startedFirst;
}

/** A build in the stage's history, by what it was and the day it started; never a number or a count. */
/** The Builds bar's tabs, one for each of the chat's builds. */
export const BUILD_TABS_WORDS = {
  /** The track's name for a screen reader. */
  tabs: t("Builds"),
  /** The picker's name for a screen reader: the open build, and how many there are to pick from. */
  picker: (name: string, count: number) => t("{name}, one of {count} builds", { name, count }),
} as const;

export const BUILD_HISTORY_WORDS = {
  thisTurn: t("This chat turn"),
  thisLoop: t("This Loop"),
  turnFrom: (day: string) => t("Chat turn from {day}", { day }),
  loopFrom: (day: string) => t("Loop from {day}", { day }),
  today: t("today"),
  yesterday: t("yesterday"),
} as const;

/** A chat turn's status line and result node: its workers at work, then whether their work is in your game. */
export const TURN_WORDS = {
  working: t("Working"),
  nothingYet: t("Nothing yet"),
  live: t("Live in your game"),
  done: t("Done"),
  fromTurn: t("from this chat turn"),
} as const;

/** The macOS Privacy & Security panes app_look needs, by the names System Settings shows. */
const PRIVACY_PANE_WORDS = {
  [AppLookAccessKind.Screen]: t("Screen Recording"),
  [AppLookAccessKind.Accessibility]: t("Accessibility"),
} as const satisfies Record<AppLookAccessKind, string>;

/** What the person must allow before Genex sees app windows, naming every missing pane. */
export function appAccessMissing(missing: readonly AppLookAccessKind[]): string {
  const panes = formatList(missing.map((pane) => PRIVACY_PANE_WORDS[pane]));
  return t("Genex can't see app windows yet: allow {panes} for Genex in System Settings.", { panes });
}

/** Under an Ollama turn its context refused: what Raise context to 16K does. */
export function raiseContextOffer(model: string): string {
  return t("Genex can copy {model} to run with a 16K context. The copy shares its files, so nothing is downloaded.", {
    model,
  });
}

/** After Raise context: the chat now runs on the copy. */
export function raisedContextDone(model: string): string {
  return t("The chat now uses {model}. Send your message again.", { model });
}

/** The button for one pane when more than one is missing: "Open Accessibility settings". */
export function openPaneSettings(pane: AppLookAccessKind): string {
  return t("Open {pane} settings", { pane: PRIVACY_PANE_WORDS[pane] });
}

/** The title of a pane's button: it opens macOS System Settings, not Genex's own Settings → Privacy. */
export function privacySettingsTitle(pane: AppLookAccessKind): string {
  return t("Opens System Settings → Privacy & Security → {pane}", { pane: PRIVACY_PANE_WORDS[pane] });
}

/** The snapshot line under a restored workspace. */
export function snapshotWords(snapshotId: string): string {
  return t("Snapshot: {snapshot}", { snapshot: snapshotId });
}

/** A plugin call still out, by the plugin's name. */
export function usingPluginWords(pluginName: string | undefined): string {
  return typeof pluginName === "string" ? t("Using {plugin}", { plugin: pluginName }) : t("Using plugin");
}

/**
 * What an app update did to the harness. Four outcomes, not three: an upgrade that only takes
 * pages away must say so rather than count zero refreshed files.
 */
export function seedUpgradeWords(seed: CustomPayload<typeof CustomEvent.SeedUpgraded>): string {
  const count = (seed.added?.length ?? 0) + (seed.updated?.length ?? 0);
  const retired = seed.retired?.length ?? 0;
  const kept = seed.kept?.length ?? 0;
  const keptNote =
    kept > 0
      ? ` (${t("{count, plural, one {# self-edited file} other {# self-edited files}} kept", { count: kept })})`
      : "";
  // A kept file whose code the update moved: its edits to that code no longer reach every caller.
  const moved = (seed.moved ?? [])
    .map(
      (move) =>
        ` · ${t("the kept {file} still has its own {names}, but {callers} now use {target}", {
          file: move.from,
          names: move.names.join(", "),
          callers: move.callers.join(", "),
          target: move.to,
        })}`,
    )
    .join("");
  return `${seedUpgradeDone(count, retired)}${keptNote}${moved}`;
}

/** What the update did to the harness files: refreshed some, took pages away, both, or neither. */
function seedUpgradeDone(count: number, retired: number): string {
  if (count > 0 && retired > 0)
    return t(
      "app update refreshed {count, plural, one {# harness file} other {# harness files}} and took away {retired, plural, one {# page} other {# pages}} it no longer ships",
      { count, retired },
    );
  if (count > 0)
    return t("app update refreshed {count, plural, one {# harness file} other {# harness files}}", { count });
  if (retired > 0)
    return t("app update took away {retired, plural, one {# page} other {# pages}} it no longer ships", { retired });
  return t("app update left every harness file as it was");
}

/** The chat's row for a finished compaction: how many messages its summary replaced. */
export function compactedWords(messages: number | null | undefined): string {
  if (typeof messages !== "number") return t("Compacted the conversation");
  return t("Compacted {count, plural, one {# message} other {# messages}}", { count: messages });
}

/** The studio rewrote one of its own files while idle. */
export function improvementWords(improvement: CustomPayload<typeof CustomEvent.ImprovementApplied>): string {
  return t("the studio got better at {what} (rewrote {file} while idle)", {
    what: improvement.reason ?? improvement.file ?? t("its own craft"),
    file: improvement.file ?? t("a file"),
  });
}

/** What the lead offered to Live: its Reload plays it, since Live never changes under the user. */
export function showWords(target: string | undefined): string {
  if (target === "live") return t("the lead offered your game folder on Live's Reload");
  if (target === "integration") return t("the lead offered the merged build on Live's Reload");
  return target
    ? t("the lead offered one worker's work on Live's Reload ({target})", { target })
    : t("the lead offered one worker's work on Live's Reload");
}

type RoundPayload = CustomPayload<typeof CustomEvent.FacetIteration>;

/** Why a round ended the way it did: the lead's stop, or the verdict's own label. */
function roundWhyWords(round: RoundPayload): string {
  if (wasStopped(round.verdictSource ?? null)) return stoppedRoundWords(round.reason);
  return verdictLabel(
    round.winner ?? null,
    Boolean(round.satisfied),
    round.verdictSource ?? null,
    round.verdict ?? null,
  );
}

/** "stopped by the lead — fixing the starting point": who stopped the round, in their own words. */
function stoppedRoundWords(reason: string | undefined): string {
  if (!reason) return t("stopped — reason unavailable");
  const { said, saysStopped } = stopReason(reason);
  return saysStopped ? said : t("stopped — {because}", { because: said });
}

/** The checks a judged round moved: counts, newly passing and broken again. */
function roundScoreWords(board: RoundPayload["scoreboard"]): string {
  if (!board || typeof board.total !== "number") return "";
  // "Newly passing" counts the plan's checks; a judge's own question turning green is a note.
  const newlyPassing = board.plannedFlips ?? board.flips ?? [];
  const newly = newlyPassing.length ? ` · ${t("{count} newly passing", { count: newlyPassing.length })}` : "";
  const broke = board.regressions?.length ? ` · ${t("{count} broke again", { count: board.regressions.length })}` : "";
  return ` · ${checkCounts(board)}${newly}${broke}`;
}

function stepNoteWords(move: RoundPayload["move"]): string {
  if (!move?.what) return "";
  if (move.delivered) return ` · ${t("the step landed")}`;
  return move.delivered === false ? ` · ${t("the step was NOT delivered")}` : "";
}

/** A worker's judged round as one chat line; `nextGap` is the judge's biggest gap in plain words, or null. */
export function partRoundLine(round: RoundPayload, nextGap: string | null): string {
  const gap = nextGap === null ? "" : ` · ${t("next gap: {gap}", { gap: nextGap })}`;
  return `${partRoundWords(round)}: ${roundWhyWords(round)}${roundScoreWords(round.scoreboard)}${stepNoteWords(round.move)}${gap}`;
}

/** A judge's round of an older single-loop run as one chat line. */
export function judgeRoundLine(round: CustomPayload<typeof CustomEvent.RunIteration>, nextGap: string | null): string {
  const label = verdictLabel(round.winner ?? null, false, null, round.verdict ?? null);
  return t("round {round}: {verdict} · next gap: {gap}", {
    round: round.iteration ?? "?",
    verdict: label,
    gap: nextGap ?? t("unknown"),
  });
}

// ── the model picker ──────────────────────────────────────────────────────────────────────

/** The context panel's Compact now (`ui/ComposerLimits.tsx`). */
export const COMPACT_WORDS = {
  caption: t("Summarize the chat to free up context."),
  /** After the context reading: Auto is the only policy. */
  automatic: t("Compacts automatically"),
  /** The context panel's button, beside the reading; its tooltip is `caption`. */
  action: t("Compact"),
  running: t("Compacting…"),
  /** `/compact` while a turn or a build runs: it waits for it, so it is offered but not taken. */
  waits: t("After the current work finishes"),
  commands: t("Commands"),
} as const;

/** The model picker's section headers, row tags and reasons (`model-choices.ts`). */
export const MODEL_PICKER_WORDS = {
  unavailable: t("This model is unavailable. Check the connection or choose another model."),
  localModels: t("Local models"),
  chatGptModels: t("ChatGPT models"),
  claudeModels: t("Claude models"),
  local: t("local"),
  localStale: t("local · stale"),
  noTools: t("no tools"),
  cannotCallTools: t("This model cannot call tools, so it cannot build"),
  cannotSeeImages: t("This model cannot see images, so it cannot review screenshots"),
  subscription: t("subscription"),
  signIn: t("sign in"),
  free: t("Free"),
  /** A provider that ships before a live test proved it, in the picker and in Settings. */
  beta: t("Beta"),
} as const;

/** A subscription's accounts, in Model Providers and the composer's usage panel (`subscription-accounts.ts`). */
export const PROVIDER_ACCOUNT_WORDS = {
  terminal: t("Terminal login"),
  studio: t("Studio account"),
  numbered: (n: number) => t("Account {index}", { index: n }),
  add: t("Add account"),
  tabs: (provider: string) => t("{provider} accounts", { provider }),
  signOut: (account: string) => t("Sign out of {account}", { account }),
  signOutLine: t("Studio forgets this account"),
  switchTo: (account: string) => t("Use {account}", { account }),
  waiting: t("Waiting for your browser…"),
  openPage: t("Open page"),
  haveCode: t("Have a code?"),
  showTerminal: t("Show terminal"),
  verifying: t("Checking the sign-in…"),
  inTerminal: t("Finish signing in in Studio's terminal."),
  modelProviders: t("Model providers"),
} as const;

/** Settings → Model Providers: the metered rows, OpenCode, OpenRouter and Opper (`panels/MeteredProviders.tsx`). */
export const METERED_PROVIDER_WORDS = {
  connected: t("Connected"),
  notConnected: t("Not connected"),
  notInstalled: t("Not installed"),
  installing: t("Installing…"),
  updating: t("Updating…"),
  checking: t("Checking…"),
  signingIn: t("Signing in…"),
  saving: t("Saving…"),
  couldNotCheck: t("Couldn't check"),
  checkAgain: t("Check again"),
  tryAgain: t("Try again"),
  installGuide: t("Install guide"),
  /** A CLI Genex can't install on this computer (`installsInApp`): the person follows its guide. */
  installByGuideLine: (name: string) => t("Install {name} with its guide, then check again.", { name }),
  account: t("Account"),
  checkConnection: t("Check connection"),
  checkConnectionLine: t("Also refreshes the model list"),
  openCode: {
    name: "OpenCode",
    guide: "https://opencode.ai/docs/",
    install: t("Install OpenCode"),
    installLine: t("Install it to run models from any provider you sign in to."),
    installingLine: t("Installing OpenCode. This can take a minute."),
    signIn: t("Sign in"),
    signInLine: t("Sign in to a provider in OpenCode to run its models."),
    freeOnly: t("Free models only"),
    freeOnlyLine: t("No provider signed in. OpenCode's free models run without an account."),
    signingIn: t("Choose a provider below and finish signing in. OpenCode keeps the sign-in."),
    cancelSignIn: t("Cancel"),
    openSignInPage: t("Open sign-in page"),
    addProvider: t("Sign in to another provider…"),
    addProviderLine: t("OpenCode keeps each sign-in"),
    update: t("Update OpenCode"),
    connectedLine: t("Billed by each provider you use"),
    unreachable: t("OpenCode didn't answer. Check the installation, then try again."),
  },
  openRouter: {
    name: "OpenRouter",
    keysUrl: "https://openrouter.ai/settings/keys",
    keyLabel: t("OpenRouter API key"),
    keyPlaceholder: "sk-or-…",
    save: t("Save key"),
    getKey: t("Get a key"),
    notConnectedLine: t("Paste an API key. Requests are billed to your OpenRouter credits."),
    connectedLine: t("Billed to your OpenRouter credits"),
    refused: t("OpenRouter didn't accept that key. Check it and paste it again."),
    replace: t("Replace key…"),
    replaceLine: t("The new key is checked before it's saved"),
    remove: t("Remove key"),
    cancel: t("Cancel"),
  },
  opper: {
    name: "Opper",
    keysUrl: "https://platform.opper.ai",
    keyLabel: t("Opper API key"),
    keyPlaceholder: t("API key"),
    save: t("Save key"),
    getKey: t("Get a key"),
    notConnectedLine: t("Paste an API key. Requests are billed to your Opper credits."),
    connectedLine: t("Billed to your Opper credits"),
    refused: t("Opper didn't accept that key. Check it and paste it again."),
    replace: t("Replace key…"),
    replaceLine: t("The new key is checked before it's saved"),
    remove: t("Remove key"),
    cancel: t("Cancel"),
  },
} as const;

/** Settings → Model Providers: TypeSafe's key, for play-tests' fast decisions (`panels/FastDecisionsRow.tsx`). */
export const FAST_DECISION_WORDS = {
  name: "TypeSafe",
  keysUrl: "https://console.typesafe.ai/keys",
  keyLabel: t("TypeSafe API key"),
  keyPlaceholder: t("API key"),
  notConnectedLine: t("Optional. With a key, Unreal play-tests pick their moves with Jev, several times a second."),
  connectedLine: t("Unreal play-tests pick their moves with Jev"),
  refused: t("TypeSafe didn't accept that key. Check it and paste it again."),
  key: t("Key"),
  keyMenu: t("TypeSafe key"),
  save: t("Save key"),
  getKey: t("Get a key"),
  replace: t("Replace key…"),
  replaceLine: t("The new key is checked before it's saved"),
  remove: t("Remove key"),
  cancel: t("Cancel"),
} as const;

/** Settings → Model Providers: the person's own model server (`panels/LocalServerRow.tsx`). */
export const LOCAL_SERVER_WORDS = {
  name: t("Local server"),
  notConnectedLine: t("Use a model you run in LM Studio, llama.cpp, TabbyAPI, vLLM or KoboldCpp."),
  addressLabel: t("Server address"),
  addressPlaceholder: "http://127.0.0.1:5000/v1",
  keyLabel: t("API key"),
  keyPlaceholder: t("API key (optional)"),
  connect: t("Connect"),
  connecting: t("Connecting…"),
  saveKey: t("Save key"),
  cancel: t("Cancel"),
  found: t("Running on this computer"),
  use: t("Use"),
  foundModels: (count: number) => t("{count, plural, one {# model} other {# models}}", { count }),
  foundNeedsKey: t("asks for a key"),
  connected: t("Connected"),
  notRunning: t("Not running"),
  needsKey: t("Needs a key"),
  noModels: t("No models"),
  /** "TabbyAPI at 127.0.0.1:5000", or the address alone for a server Genex can't name. */
  serverAt: (name: string | null, host: string) => (name ? t("{name} at {host}", { name, host }) : host),
  notRunningLine: (host: string) => t("Nothing answers at {host}. Start the server, then check again.", { host }),
  needsKeyLine: (server: string) => t("{server} asks for an API key.", { server }),
  noModelsLine: (name: string) => t("Load a model in {name}, then check again.", { name }),
  theServer: t("the server"),
  menu: t("Server"),
  menuName: t("Local server options"),
  change: t("Change address…"),
  changeLine: t("Connect another server or port"),
  disconnect: t("Disconnect"),
  models: t("Models on this server"),
  context: (size: string) => t("{size} context", { size }),
  seesImages: t("sees images"),
  cannotCallTools: t("can't call tools, so it can't build"),
  /** Where TabbyAPI keeps the key it asks for: it writes one on its first start. */
  tabbyKeyHint: t("TabbyAPI writes its key to api_tokens.yml in its folder on first start."),
  otherServer: t("Running another server?"),
  connectIt: t("Connect it in Model Providers"),
  onboardingLine: t("Already running LM Studio, llama.cpp or TabbyAPI?"),
  connectServer: t("Connect your server"),
  problem: {
    [LocalServerProblem.Empty]: t("Enter the server's address, like 127.0.0.1:5000."),
    [LocalServerProblem.Malformed]: t("That isn't a server address. Enter one like http://127.0.0.1:5000/v1."),
    [LocalServerProblem.Scheme]: t("Use an address that starts with http:// or https://."),
    [LocalServerProblem.Credentials]: t(
      "Leave the user name and password out of the address. Put a key under API key.",
    ),
    [LocalServerProblem.NotLocal]: t(
      "Genex connects to servers on this computer or your local network. For a hosted API, use OpenRouter or OpenCode.",
    ),
    [LocalServerProblem.NotFound]: t(
      "Couldn't find that computer on your network. Check the name, or use its IP address.",
    ),
    [LocalServerProblem.NotAnswering]: t("Nothing answers at that address. Start the server and check the port."),
    [LocalServerProblem.NotOpenAi]: t(
      "Something answers there, but not as a model server. Check the port, and that the address ends in /v1.",
    ),
    [LocalServerProblem.NeedsKey]: t("This server asks for an API key. Paste it under API key."),
    [LocalServerProblem.KeyRefused]: t("The server didn't accept that key. Check it and paste it again."),
    [LocalServerProblem.BadKey]: t("That doesn't look like a key. Paste the whole key, with no spaces."),
    [LocalServerProblem.OwnOllama]: t("That's the Ollama on this computer. Its models are already under Local models."),
    [LocalServerProblem.StoreLocked]: t(
      "This computer's secure storage is locked or unavailable, so the key can't be saved.",
    ),
  } satisfies Record<LocalServerProblem, string>,
} as const;

/** Settings → Model Providers: which models the picker lists (`panels/PickerModels.tsx`). */
export const PICKER_MODELS_WORDS = {
  title: t("Show in the model picker"),
  group: (provider: string) => t("{provider} models in the model picker", { provider }),
  reset: t("Reset"),
  older: t("Older models"),
  olderShown: (shown: number, total: number) =>
    shown ? t("{shown} of {total} shown", { shown, total }) : String(total),
  defaultModel: t("Default"),
  alwaysShown: t("The default model is always in the picker"),
  search: t("Search models"),
  searchLabel: (provider: string) => t("Search {provider} models", { provider }),
  noMatch: (query: string) => t("No models match “{query}”", { query: query.trim() }),
} as const;

// ── notifications ─────────────────────────────────────────────────────────────────────────

/** The notification feed's rows and sources (`notifications.ts`). */
export const NOTICE_WORDS = {
  planReady: t("A plan is ready for your review."),
  planFailed: t("The plan could not be prepared."),
  buildPlanReady: t("The build plan is ready. Say go, or change it before it starts."),
  signedOut: t("Signed out. Sign in again to keep building."),
  buildFailed: t("Build failed."),
  buildStopped: t("Build stopped. Everything built so far is kept."),
  buildLive: t("Build finished. Changes are live."),
  /** A Loop that worked in its project's own folder: its work is there, which Live may only show as stills. */
  buildKept: t("Build finished. Changes are kept in your project."),
  buildNothingNew: t("Build finished without a new version."),
  newGame: t("New game"),
  harness: "Harness",
  /** A newer build of a game from Play installed (`nativeHereWords` says one is ready to play). */
  newVersion: (size: string) => t("New version · {size}. It updates when you play.", { size }),
} as const;

/** A plugin's permission question as a row: its own prompt when it wrote one. */
export function permissionWords(plugin: string, prompt: string | undefined): string {
  return prompt ? `${plugin}: ${prompt}` : t("{plugin} asks for permission.", { plugin });
}

// ── Harness activity ──────────────────────────────────────────────────────────────────────

/** The exact-edit view of a change in Activity (`ui/ProposalsTable.tsx`). */
export const SUGGESTION_WORDS = {
  seeExactEdit: t("See the exact edit"),
} as const;

/** Activity's header and its Self-improvement switch (`panels/ReviewPanel.tsx`). */
export const ACTIVITY_WORDS = {
  title: t("Activity"),
  learning: t("Self-improvement"),
  learningHint: t(
    "When off, Harness doesn’t change its own instructions. Changes it already made stay until you undo them.",
  ),
} as const;

/** The Harness chat's header button and the dialog it opens (`chat/HarnessGuide.tsx`). */
export const HARNESS_GUIDE_WORDS = {
  open: t("How it works"),
  title: t("How Harness works"),
  lead: t(
    "Harness is the set of instructions the agents follow when they build your games. It learns from every build and suggests better ways to work. You decide what changes.",
  ),
  steps: [
    { title: t("You build."), body: t("Every game chat and Loop run is recorded under Recent runs.") },
    {
      title: t("Harness looks back."),
      body: t("After a run it finds what went wrong or took extra work, and drafts an edit to its own instructions."),
    },
    {
      title: t("The edit is tested."),
      body: t(
        "Independent reviewers compare the current and edited instructions on your past requests. Only edits they prefer go on.",
      ),
    },
    {
      title: t("You decide."),
      body: t("Suggestions wait until you apply them. Every applied change can be undone."),
    },
  ],
  notes: [
    t(
      "Reviewers compare instructions; they don’t rebuild your games. An applied change isn’t proof of better results.",
    ),
    t("Turn Self-improvement off to stop learning. What Harness already learned stays until you undo it."),
  ],
  settings: t("Harness settings"),
  done: t("Done"),
} as const;

// ── app updates ───────────────────────────────────────────────────────────────────────────

/** The sidebar's Relaunch to update or Download, while a new version of the app waits (`state/update.ts`). */
export const UPDATE_WORDS = {
  restart: t("Relaunch to update"),
  restarting: t("Relaunching…"),
  /** The button's tooltip: the version a relaunch installs. */
  hint: (version: string | null) =>
    version ? t("Updates to Genex {version}", { version }) : t("Updates to the new version of Genex"),
  /** Linux: a newer release to download and install over this one. */
  download: (version: string | null) =>
    version ? t("Download Genex {version}", { version }) : t("Download the new Genex"),
  downloadHint: t("Opens the release page"),
} as const;

/** The sidebar's plugin updates line and its list, while installed plugins have newer versions waiting (`state/plugins.ts`). */
/** Genex's updated terms waiting for the person, in the sidebar and under a Genex call in the chat. */
export const GENEX_TERMS_WORDS = {
  line: t("Genex terms updated"),
  /** Opens genex.games' terms page in the browser. */
  review: t("Review"),
  reviewLabel: t("Review Genex terms on genex.games"),
} as const;

/** The sidebar's line while the open studio's agents would not start (`AgentsStartLine.tsx`). */
export const AGENTS_START_WORDS = {
  line: t("Agents didn’t start"),
  /** The line while Try again runs. */
  starting: t("Starting agents"),
  tryAgain: t("Try again"),
  /** The line's own name, which opens why. */
  detailsLabel: t("Why the agents didn’t start"),
  report: t("Send a report"),
  sending: t("Sending…"),
  /** The bare ✓'s label, once the report went. */
  sent: t("Report sent"),
  reportFailed: t("The report didn’t send. Try again in a moment."),
} as const;

export const PLUGIN_UPDATE_WORDS = {
  /** The line's name for what waits: it opens the list. */
  count: (count: number) => t("{count, plural, one {# plugin update} other {# plugin updates}}", { count }),
  /** Install what is ticked: every update, or only some of them. */
  update: (chosen: number, total: number) => {
    if (chosen < total) return t("Update {count}", { count: chosen });
    return total === 1 ? t("Update") : t("Update all");
  },
  /** The line's own button: Update, or Update N while some are unticked in the list. */
  updateLine: (chosen: number, total: number) =>
    chosen < total ? t("Update {count}", { count: chosen }) : t("Update"),
  updating: t("Updating plugins…"),
  heading: t("Plugin updates"),
  /** Beside the heading while some updates are unticked. */
  chosen: (chosen: number, total: number) => t("{chosen} of {total}", { chosen, total }),
  chooseAll: t("Choose every update"),
  openPlugins: t("Open Plugins"),
  /** A row's arrow: that plugin's own page. */
  openPlugin: (name: string) => t("Open {name}", { name }),
  /** A row's versions, for a screen reader: "from 0.3.0 to 0.4.2". */
  versions: (from: string, to: string) => t("from {from} to {to}", { from, to }),
} as const;

/** Send feedback, from the bug button at the top of the sidebar (`panels/FeedbackDialog.tsx`). */
export const FEEDBACK_WORDS = {
  title: t("Send feedback"),
  field: t("Feedback"),
  placeholder: t("What happened, and what did you expect?"),
  appLogs: t("Attach app logs"),
  appLogsDetail: t("Versions, provider status and the app's recent log, with keys and emails removed."),
  /** The chat switch, shown only while a chat is open: its game's title, or Harness. */
  chat: t("Attach this chat"),
  chatDetail: (chat: string) => t("Recent activity in {chat}, with keys and emails removed.", { chat }),
  send: t("Send"),
  sending: t("Sending…"),
  sent: t("Feedback sent. Thank you."),
  failed: t("Unable to send feedback. Try again in a moment."),
} as const;

/** Settings → About: the running version and Check for Updates (`panels/AboutSection.tsx`). */
export const ABOUT_WORDS = {
  tab: t("About"),
  product: "Genex",
  version: (version: string) => `Genex ${version}`,
  check: t("Check for Updates"),
  checking: t("Checking…"),
  current: t("You're on the latest version."),
  downloading: t("A new version is downloading. Genex offers the relaunch when it's ready."),
  ready: (version: string | null) =>
    typeof version === "string"
      ? t("Genex {version} is ready to install.", { version })
      : t("Genex update is ready to install."),
  available: (version: string | null) =>
    typeof version === "string" ? t("Genex {version} is available.", { version }) : t("Genex update is available."),
  off: t("This build doesn't check for updates."),
  system: t("Genex updates with your system: Software Updater, apt or dnf."),
  failed: t("Couldn't check for updates. Check your connection and try again."),
  restart: t("Relaunch to update"),
  download: t("Download"),
  tagline: t("The desktop app to build & publish games with AI"),
  versionLine: (version: string | null) => (version ? t("Version {version}", { version }) : t("Development build")),
  updates: t("Updates"),
  website: t("Website"),
  source: t("Source code"),
  licenses: t("Licenses"),
  copy: t("Copy version info"),
  copied: t("Copied"),
  /** What Copy version info puts on the clipboard, and the line beside it. */
  info: (version: string | null, platform: string, arch: string) =>
    `Genex ${version ?? t("development build")} · ${PLATFORM_NAMES[platform] ?? platform} · ${arch}`,
} as const;

/** Platforms by the names people know them by. */
const PLATFORM_NAMES: Partial<Record<string, string>> = {
  [StudioPlatform.Mac]: "macOS",
  [StudioPlatform.Windows]: "Windows",
  [StudioPlatform.Linux]: "Linux",
};

// ── toasts ────────────────────────────────────────────────────────────────────────────────

/** The fixed toasts of the stage and the Builds tab. */
export const TOAST_WORDS = {
  buildLive: t("This build is your game now"),
  shownBuildBroken: t("That build turned out not to run — Reload puts your game folder back on the stage."),
  packagesInstalled: t("Packages installed — building your game again."),
  packagesFailed: t("The packages could not be installed — the details are on the stage."),
} as const;

/** How many packages the setup-scripts window names before it counts the rest. */
const SCRIPTS_NAMED = 4;

/** "This game, sharp and esbuild": who brought the setup scripts a remix's install skipped. */
function scriptOwners(own: boolean, packages: readonly string[]): string {
  const names = [...(own ? [t("This game")] : []), ...packages.slice(0, SCRIPTS_NAMED)];
  const rest = packages.length - Math.min(packages.length, SCRIPTS_NAMED);
  if (rest > 0) names.push(t("{count} more", { count: rest }));
  return formatList(names);
}

/** A remix's setup scripts its script-free install skipped: the stage's offer and the window that runs them. */
export const SETUP_SCRIPTS_WORDS = {
  trouble: t("It may need the setup scripts its packages came with, which didn’t run."),
  button: t("Run setup scripts"),
  buttonTitle: t("Run the setup scripts this game’s packages came with"),
  running: t("Running…"),
  title: t("Run this game’s setup scripts?"),
  body: (own: boolean, packages: readonly string[]) =>
    t(
      "{owners} came with setup scripts written by their authors. Genex skipped them when it made your copy, and the game may need them to build. Run them only if you trust this game.",
      { owners: scriptOwners(own, packages) },
    ),
  notNow: t("Not now"),
  notNowDetail: t("The game stays as it is. You can run them later from here."),
  run: t("Run setup scripts"),
  runDetail: t("They run in Genex’s sandbox and can’t change your other games."),
} as const;

// ── the Builds tab's progress line ────────────────────────────────────────────────────────

/** The fixed titles and sentences of the Builds tab's progress line (`build-progress.ts`). */
export const PROGRESS_WORDS = {
  buildingStart: t("Building the starting point"),
  startBeforeParts: t("The starting point is built and checked before the lead delegates the parts."),
  startReady: t("The starting point is ready"),
  gettingStarted: t("Getting started"),
  leadLooking: t("The lead is looking at your game and deciding what this build needs."),
  betweenBuilds: t("Between builds"),
  nothingKept: t("Nothing kept yet"),
  planningParts: t("Planning the parts"),
  planOpens: t("The plan opens here; each part appears as it is named."),
  preparingBuilds: t("Preparing the next builds"),
  startRejected: t("The starting point was rejected; the parts carry on from an empty game."),
  startEmpty: t("The starting point runs but is empty — no scenery or gameplay yet."),
  startPassed: t("The starting point passed its checks. Each part still needs its own verdict."),
} as const;

/** "2 parts building". */
export function partsBuildingWords(parts: number): string {
  return t("{count, plural, one {# part} other {# parts}} building", { count: parts });
}

/** What a lead's run has kept while its builders work, and how many parts are done. */
export function keptSoFarWords(kept: number, finished: number): string {
  const sofar = kept
    ? t("{count, plural, one {# round} other {# rounds}} kept so far", { count: kept })
    : PROGRESS_WORDS.nothingKept;
  if (!finished) return t("{kept}.", { kept: sofar });
  return t("{kept} · {count} finished.", { kept: sofar, count: finished });
}

/** A lead's run between builders. */
export function partsFinishedWords(parts: number): string {
  return t("{count, plural, one {# part} other {# parts}} finished · the lead is deciding what comes next.", {
    count: parts,
  });
}

/** A programmed run's parts waiting on the starting point. */
export function partsWaitingWords(parts: number): string {
  return t("Every part starts from it · {count, plural, one {# part} other {# parts}} waiting.", { count: parts });
}

// ── tools ─────────────────────────────────────────────────────────────────────────────────

export interface ToolWords {
  icon: ToolIcon;
  label: string;
  /** A running call's own words, when its icon's (`TOOL_ACTIVITY_WORDS`) would say less. */
  active?: string;
}

/** The studio's own tools, in the user's words. The chip beside the row carries the argument. */
const STUDIO_TOOLS: Record<string, ToolWords> = {
  write_file: { icon: "write", label: t("wrote a file") },
  write_own_file: { icon: "write", label: t("edited itself") },
  write_skill: { icon: "write", label: t("wrote itself a skill") },
  install_tool: { icon: "write", label: t("gave itself a new tool") },
  run_command: { icon: "run", label: t("ran a command") },
  restart_studio: { icon: "run", label: t("restarted itself") },
  delegate_to_contractor: { icon: "run", label: t("handed the work to a worker") },
  read_file: { icon: "read", label: t("read a file") },
  read_own_file: { icon: "read", label: t("read itself") },
  read_skill: { icon: "read", label: t("read its own skill") },
  list_files: { icon: "read", label: t("listed the files") },
  list_own_files: { icon: "read", label: t("listed its own files") },
  stat_own_file: { icon: "read", label: t("checked one of its own files") },
  self_history: { icon: "read", label: t("read its own history") },
  list_games: { icon: "read", label: t("listed your games") },
  screenshot: { icon: "see", label: t("took a screenshot") },
  load_preview: { icon: "see", label: t("loaded the game") },
  reload_preview: { icon: "see", label: t("reloaded the game") },
  console_log: { icon: "see", label: t("read the game's console") },
  gpu_errors: { icon: "see", label: t("checked for graphics errors") },
  press_keys: { icon: "game", label: t("pressed keys") },
  click: { icon: "game", label: t("clicked") },
  look: { icon: "game", label: t("looked around") },
  check_game: { icon: "game", label: t("checked the game") },
  game_state: { icon: "game", label: t("read the game's state") },
  play_deterministic: { icon: "game", label: t("played the game") },
  new_game: { icon: "game", label: t("started a new game") },
  export_game: { icon: "game", label: t("exported the game") },
  remember: { icon: "think", label: t("remembered something") },
  forget: { icon: "think", label: t("forgot something") },
  snapshot_now: { icon: "think", label: t("saved a snapshot") },
  start_unattended_run: { icon: "run", label: t("started the build") },
  start_autopilot: { icon: "run", label: t("requested an iterative build") },
  run_status: { icon: "run", label: t("checked on the build") },
  steer_run: { icon: "run", label: t("passed on your guidance") },
  finish_run: { icon: "run", label: t("asked the workers to wrap up") },
  resume_run: { icon: "run", label: t("resumed the saved build") },
  reopen_run: { icon: "run", label: t("reopened the build") },
  continue_build: { icon: "run", label: t("continued the build") },
  show_build: { icon: "see", label: t("showed you a build") },
  land_build: { icon: "write", label: t("put the build in your game") },
  ask_user: { icon: "think", label: t("asked you a question") },
  set_game_cover: { icon: "write", label: t("painted the game's cover") },
  checkpoint: { icon: "see", label: t("marked a moment worth seeing") },
  capture: { icon: "see", label: t("captured the game"), active: t("Capturing the game") },
  // The lead's run tools. `wait` stays neutral.
  plan: { icon: "think", label: t("set out the plan"), active: t("Writing the plan") },
  goal_update: {
    icon: "think",
    label: t("noted a blocker or a new approach"),
    active: t("Noting a blocker or a new approach"),
  },
  worker_start: { icon: "run", label: t("started a worker"), active: t("Starting a worker") },
  worker_status: { icon: "read", label: t("checked on a worker"), active: t("Checking on a worker") },
  worker_steer: { icon: "run", label: t("redirected a worker") },
  worker_stop: { icon: "run", label: t("stopped a worker") },
  worker_wait: { icon: "think", label: t("waited on the workers"), active: t("Waiting on the workers") },
  worker_mark: { icon: "write", label: t("marked a worker's work") },
  // Background work and the look-only app tool, shared by the chat, leads and workers.
  [JobTool.Start]: { icon: "run", label: t("started background work"), active: t("Starting background work") },
  [JobTool.Status]: {
    icon: "read",
    label: t("checked on background work"),
    active: t("Checking on background work"),
  },
  [JobTool.Tail]: { icon: "read", label: t("read background work's output") },
  [JobTool.Stop]: { icon: "run", label: t("stopped background work") },
  [APP_LOOK_TOOL_NAME]: { icon: "see", label: t("looked at an app window"), active: t("Looking at an app window") },
  [JUDGE_PLAY_TOOL_NAME]: {
    icon: "game",
    label: t("had a judge play the game"),
    active: t("A judge is playing the game"),
  },
  wait: { icon: "think", label: t("waited"), active: t("Waiting") },
  judge: { icon: "see", label: t("reviewed a build"), active: t("Reviewing a build") },
  playtest: { icon: "game", label: t("had a build playtested"), active: t("Playtesting a build") },
  integrate: { icon: "write", label: t("merged a worker's work"), active: t("Merging a worker's work") },
  show: { icon: "see", label: t("showed you a build") },
  note: { icon: "think", label: t("noted a decision") },
  wrap_up: { icon: "run", label: t("began finishing the build"), active: t("Finishing the build") },
  finish: { icon: "run", label: t("wrapped up the build"), active: t("Wrapping up the build") },
};

/** A builder's own tools come from its SDK, in its own vocabulary — Bash, Read, Edit, MCP. */
const SDK_TOOLS: Array<[RegExp, ToolWords]> = [
  [/^mcp__studio__computer$/i, { icon: "see", label: t("looked at the game") }],
  [/^(bash|bashoutput|killshell|killbash)$/i, { icon: "run", label: t("ran a command") }],
  [/^(read|notebookread)$/i, { icon: "read", label: t("read the code") }],
  [/^(edit|multiedit|write|notebookedit)$/i, { icon: "write", label: t("edited the code") }],
  [/^(grep|glob|ls|search)$/i, { icon: "read", label: t("searched the code") }],
  [/^(webfetch|websearch)$/i, { icon: "read", label: t("looked something up"), active: t("Looking something up") }],
  [/^todowrite$/i, { icon: "think", label: t("planned its next steps") }],
  [/^(task|agent)/i, { icon: "run", label: t("asked a helper") }],
];

/**
 * One name → one row label. Studio tools and builder tools land in the same list in the chat,
 * so they are phrased the same way: past tense, lower case, no underscores.
 */
export function toolWords(name: string): ToolWords {
  const raw = (name ?? "").trim();
  const studio = STUDIO_TOOLS[raw];
  if (studio) return studio;
  for (const [pattern, words] of SDK_TOOLS) if (pattern.test(raw)) return words;
  const bare = raw.replace(/^mcp__[^_]+__/i, "");
  const known = STUDIO_TOOLS[bare];
  if (known) return known;
  // Plugins and MCP connectors share namespaced names. The namespace alone does not
  // establish which kind of source ran; the host record supplies its display name.
  const plugin = /^([a-z][a-z0-9-]*)__(.+)$/i.exec(bare);
  if (plugin)
    return {
      icon: "run",
      label: t("used a tool: {tool}", { tool: (plugin[2] ?? "").replace(/[_-]+/g, " ").trim() }),
    };
  const pretty = bare
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return { icon: "run", label: pretty ? t("used {tool}", { tool: pretty }) : t("used a tool") };
}

/** The header on a collapsed block of tool rows — one line for a whole minute of work. */
export function toolGroupHeader(steps: number): string {
  return t("{count, plural, one {# tool call} other {# tool calls}}", { count: steps });
}

// ── plugin consent ─────────────────────────────────────────────────────────────────────────

/** The chat card a plugin's question becomes: who asks, to do what, with which arguments. */
export function consentAskWords(ask: {
  pluginName?: string | null;
  tool?: string | null;
  args?: Record<string, unknown> | null;
  prompt?: string | null;
}): string {
  const who = (ask.pluginName ?? "").trim() || A_PLUGIN;
  const tool = consentToolWords(ask.tool);
  const digest = Object.entries(ask.args ?? {})
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ");
  const args = digest ? ` (${clip(digest, CONSENT_ARGS_MAX)})` : "";
  const prompt = (ask.prompt ?? "").trim();
  return `${t("{plugin} asks to run {tool}", { plugin: who, tool })}${args}${prompt ? ` — ${prompt}` : ""}`;
}

/** A connector tool's name as words (`unreal-editor__call_tool` → `call tool`). */
export const consentToolWords = (tool: string | null | undefined): string =>
  (tool ?? "").split("__").pop()?.replace(/[-_]+/g, " ").trim() || t("a tool");

/** The consent card's choices. Always allow is offered on a connector's card only. */
export const CONSENT_CHOICE_WORDS = {
  once: { label: t("Allow once"), description: t("Ask again next time.") },
  always: (source: string) => ({
    label: t("Always allow"),
    description: t("Don't ask again for this action in {source}.", { source }),
  }),
  inChat: { label: t("Allow in this chat"), description: t("Don't ask again for this action in this chat.") },
  decline: { label: t("Don't allow"), description: t("The agent carries on without it.") },
} as const;

/**
 * The studio's card that turns computer control on, asked when a plugin's Do it for me finds it
 * off: it is one setting, so it says it is for every chat.
 */
export const COMPUTER_SETTING_CARD_WORDS = {
  title: computerSettingQuestion(),
  turnOn: { label: t("Turn on"), description: t("You can turn it off in Settings → Permissions.") },
  notNow: { label: t("Not now"), description: t("Computer control stays off, and nothing is clicked.") },
} as const;

/** A waiting consent question's title when the plugin wrote no prompt of its own. */
export const consentNeededWords = (source: string | undefined): string =>
  t("{source} needs your permission", { source: source || A_PLUGIN });

/** How an approved consent question was approved: by the chat's Bypass, for the chat, for good, or once. */
function approvedWords(outcome: { by?: string | null; always?: boolean | null; chatOffered?: boolean | null }) {
  if (outcome.by === "mode") return t("Allowed in Bypass");
  const inChat = outcome.by === "chat" || (outcome.always === true && outcome.chatOffered === true);
  if (inChat) return t("Allowed in this chat");
  return outcome.always ? t("Always allowed") : t("Allowed");
}

/** A settled consent question as one line, as Claude's own are: how it ended, then whose it was. */
export const consentLineWords = (outcome: string, source: string | undefined): string =>
  `${outcome} · ${source || A_PLUGIN}`;

/** How a consent question ended, once it is no longer waiting on the user. */
export function consentOutcomeWords(outcome: {
  state?: string | null;
  by?: string | null;
  always?: boolean | null;
  chatOffered?: boolean | null;
}): string {
  if (outcome.state === "approved") return approvedWords(outcome);
  if (outcome.by === "timeout") return t("Nobody answered");
  if (outcome.by === "restart") return t("Withdrawn when the studio restarted");
  if (outcome.by === "stop" || outcome.by === "turn") return t("Withdrawn when the turn stopped");
  return t("Declined");
}

// ── tool permission ────────────────────────────────────────────────────────────────────────

const PERMISSION_EDIT_TOOLS: ReadonlySet<string> = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const PERMISSION_READ_TOOLS: ReadonlySet<string> = new Set(["Read", "Glob", "Grep"]);
/** Claude Code's prefix for a tool an MCP server offers (`mcp__server__tool`). */
const MCP_TOOL = "mcp";
const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** An MCP tool by its own name (`mcp__server__make_sprite` is "make sprite"); others as named. */
function permissionToolName(tool: string): string {
  const parts = tool.split("__");
  if (parts[0] !== MCP_TOOL || parts.length <= 2) return tool;
  return parts.slice(2).join(" ").replace(/[_-]+/g, " ").trim();
}

/** What a file tool acts on: the path it names. */
export function permissionPath(event: Partial<ToolPermissionEvent>): string | undefined {
  const input = event.input ?? {};
  const named = nonEmpty(event.subject) ?? nonEmpty(input.file_path) ?? nonEmpty(input.notebook_path);
  if (named) return named;
  return nonEmpty(input.path) ?? (PERMISSION_READ_TOOLS.has(event.tool ?? "") ? nonEmpty(input.pattern) : undefined);
}

/** A rule's path, as Claude Code writes it (`//Users/me/refs/**`), as a person reads it. */
const rulePath = (content: string): string => content.replace(/\/\*\*?$/, "").replace(/^\/\//, "/") || "/";

/** The host a web fetch opens, or the address itself when it is a bare host. */
function webHost(address: string): string {
  try {
    return new URL(address).host || address;
  } catch {
    return address;
  }
}

/** The placeholder of a permission card's own-words row: what the person tells the one who asked to do instead. */
export function permissionInsteadWords(event: Partial<ToolPermissionEvent>): string {
  return event.worker ? t("Tell the worker what to do instead…") : t("Tell Claude what to do instead…");
}

/** Who asks: a worker of the chat's lead by its title, else Claude. */
function permissionAsker(event: Partial<ToolPermissionEvent>): string {
  if (!event.worker) return "Claude";
  return nonEmpty(event.worker.title) ?? t("A worker");
}

/** What a tool that is neither a command nor a plan is about to do. */
function toolAskWords(event: Partial<ToolPermissionEvent>, tool: string): string {
  const who = permissionAsker(event);
  if (PERMISSION_EDIT_TOOLS.has(tool)) {
    const path = permissionPath(event);
    const name = path ? pathLeaf(path) : undefined;
    return name ? t("{who} wants to edit {file}", { who, file: name }) : t("{who} wants to edit a file", { who });
  }
  if (PERMISSION_READ_TOOLS.has(tool)) {
    const path = permissionPath(event);
    return path ? t("{who} wants to read {path}", { who, path }) : t("{who} wants to read files", { who });
  }
  if (tool === "WebFetch") {
    const address = nonEmpty(event.subject) ?? nonEmpty(event.input?.url);
    return address
      ? t("{who} wants to open {host}", { who, host: webHost(address) })
      : t("{who} wants to open a web page", { who });
  }
  if (tool.startsWith(`${MCP_TOOL}__`)) return t("{who} wants to use {tool}", { who, tool: permissionToolName(tool) });
  return t("{who} wants to use {tool}", {
    who,
    tool: nonEmpty(event.displayName) ?? (permissionToolName(tool) || t("a tool")),
  });
}

/**
 * A job's card: who wants to run what in the background, by the job's plain title. A lead's card
 * keeps its own words; a worker's and the chat's own name who asks. Never the command: it sits
 * folded under the card's Details.
 */
function jobAskWords(event: Partial<ToolPermissionEvent>): string {
  const own = event.worker ? undefined : nonEmpty(event.title);
  if (own) return own;
  const title = nonEmpty(event.input?.title);
  const who = permissionAsker(event);
  return title
    ? t("{who} wants to run {task} in the background", { who, task: title })
    : t("{who} wants to run something in the background", { who });
}

/** A command card's question: the command itself is on the card in full. */
export function permissionCommandWords(event: Partial<ToolPermissionEvent>): string {
  return t("{who} wants to run a command", { who: permissionAsker(event) });
}

/**
 * The card's question: Claude Code's own sentence when it wrote one, else what the tool is about
 * to do. A worker's card says what that worker wants (Claude Code's sentence names Claude). A plan
 * waiting for approval is always "Approve this plan?".
 */
export function permissionTitleWords(event: Partial<ToolPermissionEvent>): string {
  if (isPlanRequest(event)) return t("Approve this plan?");
  if (event.tool === JOB_PERMISSION_TOOL) return jobAskWords(event);
  const title = event.worker ? undefined : nonEmpty(event.title);
  if (title) return title;
  const tool = event.tool ?? "";
  if (tool === "Bash") return permissionCommandWords(event);
  return toolAskWords(event, tool);
}

/** A saved rule's tool and what it names: `Bash(npm test:*)` is Bash and `npm test:*`. */
function parsedRule(rule: string): { tool: string; content: string } {
  const parsed = /^([^(]+)\(([\s\S]*)\)$/.exec(rule.trim());
  return { tool: parsed?.[1]?.trim() ?? rule.trim(), content: parsed?.[2]?.trim() ?? "" };
}

/** `npm test:*` and `npm test *` both allow every command that starts with the prefix. */
const commandPrefix = (content: string): string | undefined => /^(.+?)(?::\*| \*)$/.exec(content)?.[1]?.trim();

/** What one rule allows, and where. */
function ruleGrantWords(rule: string, scope: RuleScope): string {
  const { tool, content } = parsedRule(rule);
  if (tool === "Bash" && content) {
    const prefix = commandPrefix(content);
    return prefix
      ? t("Always allow {prefix} commands {scope, select, chat {in this chat} other {in this game}}", { prefix, scope })
      : t("Always allow this command {scope, select, chat {in this chat} other {in this game}}", { scope });
  }
  if (tool === "Read" && content)
    return t("Always allow reading {path} {scope, select, chat {in this chat} other {in this game}}", {
      path: rulePath(content),
      scope,
    });
  if (PERMISSION_EDIT_TOOLS.has(tool) && content)
    return t("Always allow editing {path} {scope, select, chat {in this chat} other {in this game}}", {
      path: rulePath(content),
      scope,
    });
  if (tool === "WebFetch" && content.startsWith("domain:"))
    return t("Always allow {domain} {scope, select, chat {in this chat} other {in this game}}", {
      domain: content.slice(7),
      scope,
    });
  return t("Always allow {tool} {scope, select, chat {in this chat} other {in this game}}", {
    tool: permissionToolName(tool),
    scope,
  });
}

/** Settings → Permissions: a saved rule as the action it allows ("Run npm install"); the rule itself when unknown. */
export function permissionRuleWords(rule: string): string {
  const { tool, content } = parsedRule(rule);
  if (!content) return rule;
  if (tool === "Bash") return t("Run {command}", { command: commandPrefix(content) ?? content });
  if (PERMISSION_READ_TOOLS.has(tool)) return t("Read files in {path}", { path: homePath(rulePath(content)) });
  if (PERMISSION_EDIT_TOOLS.has(tool)) return t("Edit files in {path}", { path: homePath(rulePath(content)) });
  if (tool === "WebFetch" && content.startsWith("domain:"))
    return t("Open pages on {domain}", { domain: content.slice(7) });
  return rule;
}

function grantWords(grant: PermissionGrant): string {
  if (grant.kind === GrantKind.Mode) {
    if (grant.mode === PermissionMode.AcceptEdits) return t("Allow all edits in this chat");
    return t("Use {mode} in this chat", { mode: permissionModeWords()[grant.mode]?.label ?? grant.mode });
  }
  if (grant.kind === GrantKind.Directory) return t("Always allow {path} in this chat", { path: grant.path });
  return ruleGrantWords(grant.rule, grant.scope);
}

/** The "always" choice: what it would grant, and for how long. */
export function alwaysWords(grants: readonly PermissionGrant[]): string {
  if (!grants.length) return t("Always allow");
  // Every grant is named: the choice keeps all of them, so none may hide behind a count.
  return grants
    .map((grant, index) => {
      const words = grantWords(grant);
      return index ? words.charAt(0).toLowerCase() + words.slice(1) : words;
    })
    .reduce((first, next) => t("{first}, and {next}", { first, next }));
}

/**
 * What the Bypass confirmation says it reaches, on `platform` (`renderer/platform.ts`): this Mac,
 * or this computer where the studio runs on another system; macOS's words until main has said.
 */
export function bypassPermissionsWords(platform: string): string {
  return platform && platform !== StudioPlatform.Mac
    ? t(
        "Claude will run commands and change files anywhere on this computer without asking. Rewind restores only the game folder.",
      )
    : t(
        "Claude will run commands and change files anywhere on this Mac without asking. Rewind restores only the game folder.",
      );
}

/** How a request the work ended around reads. */
const PERMISSION_WITHDRAWN: Partial<Record<string, string>> = {
  [ToolPermissionBy.Stop]: t("Withdrawn when the work stopped"),
  [ToolPermissionBy.Turn]: t("Withdrawn when the turn ended"),
  [ToolPermissionBy.Restart]: t("Withdrawn by a restart"),
  [ToolPermissionBy.Timeout]: t("Withdrawn: nobody answered"),
};

/** How a permission request ended, once it no longer waits on the person. */
export function permissionOutcomeWords(event: Partial<ToolPermissionEvent>): string {
  if (event.state === ToolPermissionState.Allowed) {
    if (isPlanRequest(event) && event.mode)
      return t("Plan approved · {mode}", { mode: permissionModeWords()[event.mode]?.label ?? event.mode });
    if (event.by === ToolPermissionBy.Mode) return t("Allowed in Bypass");
    return event.granted === PermissionGranted.Always ? t("Always allowed") : t("Allowed");
  }
  const withdrawn = PERMISSION_WITHDRAWN[event.by ?? ""];
  if (withdrawn) return withdrawn;
  const message = nonEmpty(event.message);
  return message ? t("Denied · {reason}", { reason: message }) : t("Denied");
}

/** What a request was about, in a few words: a command's first line, a file's path, a page's host, a tool's name. */
function permissionSubjectWords(event: Partial<ToolPermissionEvent>): string {
  if (isPlanRequest(event)) return t("the plan");
  const tool = event.tool ?? "";
  if (tool === "Bash") {
    const command = nonEmpty(event.subject) ?? nonEmpty(event.input?.command);
    return command?.split("\n")[0]?.trim() || t("a command");
  }
  if (PERMISSION_EDIT_TOOLS.has(tool) || PERMISSION_READ_TOOLS.has(tool)) return permissionPath(event) ?? t("a file");
  if (tool === "WebFetch") {
    const address = nonEmpty(event.subject) ?? nonEmpty(event.input?.url);
    return address ? webHost(address) : t("a web page");
  }
  return nonEmpty(event.displayName) ?? (permissionToolName(tool) || t("a tool"));
}

/**
 * An answered request in one line, what came of it and then what it was about ("Allowed · npm
 * install three"); a plan approval says the mode it continues in. The rest opens below it.
 */
export function permissionLineWords(event: Partial<ToolPermissionEvent>): string {
  const approvedPlan = isPlanRequest(event) && event.state === ToolPermissionState.Allowed && event.mode;
  if (approvedPlan) return permissionOutcomeWords(event);
  const denied = event.state !== ToolPermissionState.Allowed && !PERMISSION_WITHDRAWN[event.by ?? ""];
  const outcome = denied ? t("Denied") : permissionOutcomeWords(event);
  return `${outcome} · ${permissionSubjectWords(event)}`;
}

/**
 * A running call's label by its icon. Present tense is reserved for calls with an observed start
 * and no recorded end. The chat's busy line recognises these exact words (`chat/current-work.ts`).
 */
export const TOOL_ACTIVITY_WORDS: Readonly<Record<ToolIcon, string>> = {
  read: t("Reading"),
  write: t("Editing"),
  run: t("Running a tool"),
  see: t("Inspecting the game"),
  game: t("Working on the game"),
  think: t("Thinking"),
};

/** A running call's label when its row carries none of its own. */
export const USING_A_TOOL = t("Using a tool");

/** A running call's label by its icon (`TOOL_ACTIVITY_WORDS`). */
export function toolActivityWords(icon: ToolIcon): string {
  return TOOL_ACTIVITY_WORDS[icon];
}

// ── The chat panel ─────────────────────────────────────────────────────────────────────────

/** Freeing space: Settings → Storage, the chat header's button and their confirmation. */
export const STORAGE_WORDS = {
  tab: t("Storage"),
  title: t("Free up space"),
  keeps: t("Your games, save points, paused builds and each game’s latest build stay."),
  measuring: t("Measuring…"),
  freeing: t("Freeing…"),
  nothing: t("Nothing to free up"),
  none: t("None"),
  keep: t("Keep"),
  freedNothing: t("There was nothing to free."),
} as const;

/** Settings → Storage's data folder (Windows): where Genex keeps its files, and moving them. */
export const DATA_FOLDER_WORDS = {
  title: t("Where Genex keeps its files"),
  hint: t("Build copies, pictures, chats and sign-ins. Your games stay where they are."),
  change: t("Change…"),
  checking: t("Checking…"),
  keep: t("Keep here"),
  move: t("Move and restart"),
  moveTitle: (bytes: number, to: string) => t("Move {size} to {folder}?", { size: unbrokenSize(bytes), folder: to }),
  moveBody: t(
    "Genex closes, moves its files and opens again; on another drive this takes a few minutes. Close other apps using its build copies first.",
  ),
  failed: (to: string, problem: DataFolderProblem) =>
    t("Couldn’t move to {folder}. {problem}", { folder: to, problem: DATA_FOLDER_PROBLEM_WORDS[problem] }),
  /** Old copies someone changed after the move: they stay where they were. */
  kept: (dir: string) => t("Files changed after the move stay in {folder}.", { folder: dir }),
} as const;

/** Why a picked folder can't hold Genex's files, or why a move didn't happen, by `DataFolderProblem`. */
export const DATA_FOLDER_PROBLEM_WORDS = {
  [DataFolderProblem.Unsupported]: t("Moving Genex’s files isn’t available here."),
  [DataFolderProblem.Busy]: t("Stop your builds and replies first, then move."),
  [DataFolderProblem.Same]: t("Genex already keeps its files there."),
  [DataFolderProblem.Overlaps]: t("Pick a folder outside Genex’s files, your games and Genex’s install."),
  [DataFolderProblem.Network]: t("Pick a folder on this computer, not on a network drive."),
  [DataFolderProblem.Removable]: t("Pick a drive inside this computer, not a USB stick."),
  [DataFolderProblem.FileSystem]: t("That drive can’t keep files private to you (FAT32 or exFAT). Pick an NTFS drive."),
  [DataFolderProblem.NotEmpty]: t("That folder already has files. Pick an empty one."),
  [DataFolderProblem.NoSpace]: t("There isn’t enough free space there."),
  [DataFolderProblem.Unwritable]: t("Genex couldn’t make that folder private to you."),
  [DataFolderProblem.InUse]: t("A file was in use. Close other programs and try again."),
  [DataFolderProblem.Missing]: t("That folder was gone when Genex restarted."),
  [DataFolderProblem.Failed]: t("Something went wrong. Try again."),
} as const satisfies Record<DataFolderProblem, string>;
/** Settings → Storage's games from Play (`panels/InstalledGamesSection.tsx`). */
export const INSTALLED_GAMES_WORDS = {
  title: t("Games from Play"),
  total: (count: number, size: string) => t("{count, plural, one {# game} other {# games}} · {size}", { count, size }),
  /** When a game was last played here: "Played today", "Played 3 days ago", "Not played yet". */
  played: (at: string | null, now: number) => {
    if (!at) return t("Not played yet");
    const days = Math.floor((now - Date.parse(at)) / DAY_MS);
    if (days < 1) return t("Played today");
    return days === 1 ? t("Played yesterday") : t("Played {days} days ago", { days });
  },
  remove: t("Remove"),
  savesStay: t("Saves stay when you remove a game. Getting it again starts where you left off."),
} as const;

/** The Publish dialog's Allow remixing, and its page on what remixers can do (`panels/plugins/genex/PublishRemix.tsx`). */
export const PUBLISH_REMIX_WORDS = {
  allow: t("Allow remixing"),
  rights: t("Rights"),
  rightsLabel: t("What remixers can do"),
  title: t("What remixers can do"),
  back: t("Back to Publish"),
  canHeading: t("They can"),
  can: (title: string) => [
    t("Copy and change {title}’s project to make their own game.", { title }),
    t("Publish their remix on Genex."),
  ],
  goodToKnowHeading: t("Good to know"),
  goodToKnow: [
    t("Remixes made before you turn this off stay theirs."),
    t(
      "Allow it only if you may share everything in the project. Assets bought in the Unity Asset Store or on Fab usually can’t be shared.",
    ),
  ],
  terms: t("Genex terms, section 4"),
  gotIt: t("Got it"),
  /** Why the last publish's project didn't go: remixing then stays off. */
  tooBig: t("Its project is too big to remix: Genex keeps up to 5 GB and 5,000 files."),
  notSent: t("Its project didn’t go, so no one can remix it yet."),
} as const;

/** The Publish dialog's platform rows (`panels/plugins/genex/PublishPlatforms.tsx`). */
export const PUBLISH_PLATFORM_WORDS = {
  label: t("Platforms"),
  name: {
    [PublishTarget.Web]: t("Web"),
    [PublishTarget.Mac]: t("Mac app"),
    [PublishTarget.Windows]: t("Windows app"),
    [PublishTarget.Linux]: t("Linux app"),
  } satisfies Record<PublishTarget, string>,
  /** The players a native row is for, in the ask and the reach line: "Mac", "Windows", "Linux". */
  players: { [PublishTarget.Mac]: "Mac", [PublishTarget.Windows]: "Windows", [PublishTarget.Linux]: "Linux" },
  webReady: t("Plays right away"),
  webMissing: t("Not set up for the web"),
  /** An Unreal game: Unreal has no web export. */
  webUnavailable: t("Unreal games don’t run in a browser"),
  /** What a build runs on, by its processors. */
  arch: {
    [PublishTarget.Mac]: {
      [NativeArch.Universal]: t("Apple silicon and Intel"),
      [NativeArch.Arm64]: "Apple silicon",
      [NativeArch.X64]: "Intel",
    },
    [PublishTarget.Windows]: {
      [NativeArch.Universal]: t("64-bit PCs"),
      [NativeArch.Arm64]: t("Arm PCs"),
      [NativeArch.X64]: t("64-bit PCs"),
    },
    [PublishTarget.Linux]: {
      [NativeArch.Universal]: t("64-bit PCs"),
      [NativeArch.Arm64]: t("Arm PCs"),
      [NativeArch.X64]: t("64-bit PCs"),
    },
  } satisfies Record<Exclude<PublishTarget, typeof PublishTarget.Web>, Record<NativeArch, string>>,
  /** When a build was made: "built just now", "built 5 min ago", "built 3 hours ago". */
  built: (at: string, now: number) => {
    const ms = Math.max(0, now - Date.parse(at));
    if (ms < MINUTE_MS) return t("built just now");
    if (ms < HOUR_MS) return t("built {minutes} min ago", { minutes: Math.floor(ms / MINUTE_MS) });
    if (ms < DAY_MS)
      return t("built {count, plural, one {# hour} other {# hours}} ago", { count: Math.floor(ms / HOUR_MS) });
    return t("built {count, plural, one {# day} other {# days}} ago", { count: Math.floor(ms / DAY_MS) });
  },
  stale: t("Built before your last change"),
  missing: t("Not made yet"),
  /** An Unreal game's app for another system: Unreal packages it only on that system. */
  elsewhere: {
    [PublishTarget.Mac]: t("Package it on a Mac"),
    [PublishTarget.Windows]: t("Package it on a Windows PC"),
    [PublishTarget.Linux]: t("Package it on a Linux PC"),
  } satisfies Record<Exclude<PublishTarget, typeof PublishTarget.Web>, string>,
  /** An app this computer can't make that Genex builds on its own computers, by how that goes. */
  cloudOffer: t("Genex can build it on Windows for you"),
  cloudPublishFirst: t("Publish the game first, then Genex can build it"),
  /** A build on Genex still running; its clock is beside it. */
  cloudBuilding: t("Building on Genex"),
  /** The game's project going up for a build; its clock is beside it. */
  cloudSending: t("Sending to Genex. Keep Genex open"),
  cloudSendStopped: t("Sending the project to Genex stopped"),
  /** Why it stopped, under the rows, in Genex's or the CLI's words. */
  cloudSendFailedLine: (error: string) => t("Couldn’t send the project to Genex: {error}", { error }),
  cloudFailed: {
    [CloudBuildFailure.EngineUnsupported]: t("Genex can’t build this Unreal version yet"),
    [CloudBuildFailure.Compile]: t("Genex couldn’t compile the game’s code"),
    [CloudBuildFailure.Cook]: t("Genex couldn’t cook the game’s content"),
    [CloudBuildFailure.Timeout]: t("The build on Genex took too long"),
    [CloudBuildFailure.Quota]: t("You’ve used this month’s builds on Genex"),
    [CloudBuildFailure.SourceTooBig]: t("The project is too big for Genex to build"),
    [CloudBuildFailure.NotOnGenex]: t("Publish the game first, then Genex can build it"),
    [CloudBuildFailure.Failed]: t("The build on Genex failed"),
  } satisfies Record<CloudBuildFailure, string>,
  cloudBuild: t("Build on Genex"),
  cloudBuildLabel: (name: string) => t("Build the {app} on Genex", { app: name }),
  cloudRetry: t("Try again"),
  cloudRetryLabel: (name: string) => t("Build the {app} on Genex again", { app: name }),
  /** The row's note while Genex builds it, and once its press was taken. */
  building: t("Building…"),
  cloudAsked: t("Asked Genex"),
  /** A press Genex refused before building anything, in Genex's or the CLI's words. */
  cloudRefused: (name: string, error: string) => t("Couldn’t build the {app} on Genex: {error}", { app: name, error }),
  /** A built app genex.games does not take yet: it shows, and Publish sends the web version. */
  soon: t("Coming soon"),
  soonLabel: (name: string) => t("{name}: publishing it is coming soon", { name }),
  make: t("Make with agent"),
  makeLabel: (name: string) => t("Make the {app} with the agent", { app: name }),
  /** The web row's press, for a screen reader, and what it sends through the game's chat. */
  makeWebLabel: t("Make the web version with the agent"),
  makeWebAsk: (title: string) => t("Make a web version of {title} so I can publish it on the web.", { title }),
  /** The row once Make with agent sent its ask. */
  asked: t("Asked the agent"),
  /** What "Make with agent" sends through the game's chat. */
  makeAsk: (players: string, title: string) =>
    t("Make a {players} app of {title} so I can publish it for {players} players.", { players, title }),
  /** Who plays what once it is published: "Mac and Windows players get the web version." */
  reach: (players: string) => t("{players} players get the web version.", { players }),
  /** The apps Publish sends too: "Mac app", "Mac and Windows apps". */
  apps: (players: readonly string[]) =>
    players.length > 1
      ? t("{platforms} apps", { platforms: NATIVE_WORDS.platforms(players) })
      : t("{platform} app", { platform: players[0] ?? "" }),
  alsoSends: (apps: string) => t("Publish also sends the {apps}.", { apps }),
  sending: t("Sending…"),
  sent: t("On Genex"),
  sentLabel: (name: string) => t("{name}: on Genex for desktop players", { name }),
  /** A Mac app signed and notarized under the creator's own Apple Developer ID. */
  notarized: t("notarized"),
  /** Why a Mac app went without the notarizing its creator turned on, in whole sentences. */
  notarizeFailed: {
    [MacNotarizeFailure.NotAnApp]: t("The Mac app went without notarization: it isn’t a Mac app bundle."),
    [MacNotarizeFailure.NoIdentity]: t(
      "The Mac app went without notarization: no Developer ID Application certificate is in your keychain.",
    ),
    [MacNotarizeFailure.ManyIdentities]: t(
      "The Mac app went without notarization: your keychain has several Developer ID certificates. Name one in Genex’s settings.",
    ),
    [MacNotarizeFailure.Sign]: t("The Mac app went without notarization: codesign couldn’t sign it."),
    [MacNotarizeFailure.Submit]: t(
      "The Mac app went without notarization: Apple’s notary couldn’t be reached with your saved notary profile.",
    ),
    [MacNotarizeFailure.Rejected]: t("The Mac app went without notarization: Apple’s notary rejected it."),
    [MacNotarizeFailure.Staple]: t("The Mac app went without notarization: Apple’s ticket couldn’t be attached to it."),
    [MacNotarizeFailure.Stopped]: t("The Mac app went without notarization: notarizing was stopped."),
  } satisfies Record<MacNotarizeFailure, string>,
  failed: t("Not sent"),
  failedLine: (name: string, error: string) => t("Couldn’t send the {app}: {error}", { app: name, error }),
  /** An app sent by someone other than an admin: Genex reviews it before players get it. */
  review: t("In review"),
  reviewLabel: (name: string) => t("{name}: Genex is reviewing it", { name }),
  notApproved: t("Not approved"),
  rejected: (name: string) => t("Genex didn’t approve the {app}.", { app: name }),
  rejectedLine: (name: string, reason: string) => t("Genex didn’t approve the {app}: {reason}", { app: name, reason }),
  /** A game with only apps: its main press, who can play it, and how its listing went. */
  publishApps: (apps: string) => t("Publish {apps}", { apps }),
  onlyPlayers: (players: string) => t("Only {players} players can play it.", { players }),
  held: t("Sent for review. It appears in Play once Genex approves it."),
  /** A game made in an engine with nothing Publish can send yet: no app, or none Studio can send. */
  makeFirst: t("Make a Mac, Windows or Linux app first, then publish it here."),
  makeAnyFirst: t("Make a web version or a Mac, Windows or Linux app first, then publish it here."),
  appsSoon: t("Publishing Mac, Windows and Linux apps comes with the next Genex update."),
  /** A built app older than the game's last change: the agent builds it again. */
  rebuild: t("Build again"),
  rebuildLabel: (name: string) => t("Build the {app} again with the agent", { app: name }),
  rebuildAsk: (players: string, title: string) =>
    t("Build the {players} app of {title} again so I can publish it.", { players, title }),
  rebuildFirst: (app: string) => t("The {app} is older than your last change: build it again, then publish.", { app }),
  notListed: t("The apps are on Genex, but the game isn’t in the gallery yet. Publish again to list it."),
  /** A web version on Genex the game folder no longer holds: Genex's page plays it instead of the apps. */
  webOnGenex: t("A web version is on Genex"),
  removeWeb: t("Remove"),
  removeWebLabel: t("Remove the web version from Genex"),
  webOnPage: t("The game’s page plays its web version until you remove it, so players don’t see the apps."),
  /** A web build Publish would put on a page that shows only the game's apps. */
  replacesApps: t("Publish makes this web version the game’s page, in place of its apps."),
} as const;

/** Each kind of space freeing deletes: its name and what it is. */
export const STORAGE_KIND_WORDS = {
  [StorageKind.Copies]: { label: t("Build copies"), about: t("Folders Genex made to run and show builds.") },
  [StorageKind.Pictures]: { label: t("Build pictures"), about: t("Screenshots and recordings of finished builds.") },
  [StorageKind.History]: {
    label: t("Rewind copies"),
    about: t("Versions of your games saved for Rewind and builds."),
  },
} as const satisfies Record<StorageKind, { label: string; about: string }>;

/** A size in running text, kept on one line ("1.2 GB" never breaks before its unit). */
function unbrokenSize(bytes: number): string {
  return sizeWords(bytes).replace(" ", " ");
}

/** The button that frees `space`: how much it frees, or that there is nothing to. */
export function freeUpWords(space: StorageSpace): string {
  const bytes = freeableBytes(space);
  return bytes > 0 ? t("Free up {size}", { size: sizeWords(bytes) }) : STORAGE_WORDS.nothing;
}

/** The chat header's button: how much freeing this game frees. */
export function freeGameWords(space: StorageSpace): string {
  return t("Free {size}", { size: sizeWords(freeableBytes(space)) });
}

/** The confirmation's title. */
export function freeConfirmTitle(space: StorageSpace): string {
  return t("Free up {size}?", { size: unbrokenSize(freeableBytes(space)) });
}

/** What freeing deletes and what stays: the tooltip and the confirmation's body, for one game or all. */
export function freeSpaceWords(space: StorageSpace, game?: string): string {
  const size = unbrokenSize(freeableBytes(space));
  const holds = game
    ? t("Older builds of {game} and Rewind copies take {size}.", { game, size })
    : t("Older builds and Rewind copies take {size}.", { size });
  const stays = game ? t("The game, its save points, paused builds and latest build stay.") : STORAGE_WORDS.keeps;
  return `${holds} ${stays} ${t("Older messages can still rewind the chat, but not its files.")}`;
}

/** The notice after freeing space: how much, and which working games it left alone. */
export function freedWords(freed: StorageFreed, titleOf: (game: string) => string = (game) => game): string {
  const done =
    freed.freedBytes > 0 ? t("Freed {size}.", { size: sizeWords(freed.freedBytes) }) : STORAGE_WORDS.freedNothing;
  const [only, ...more] = freed.skipped;
  if (only === undefined) return done;
  if (more.length === 0) return `${done} ${t("Left {game} alone while it works.", { game: titleOf(only) })}`;
  return `${done} ${t("Left {count, plural, one {# game} other {# games}} alone while they work.", { count: freed.skipped.length })}`;
}

/** How many included files an export notice names before it says "and N more". */
const EXPORT_LIST_LIMIT = 12;

/** The notice after a game's public files were exported. */
export function exportedWords(result: { files: number; included: string[]; excluded: string[] }): string {
  const named = result.included.slice(0, EXPORT_LIST_LIMIT).join(", ");
  const rest = result.included.length - EXPORT_LIST_LIMIT;
  const included = rest > 0 ? t("{files} and {count} more", { files: named, count: rest }) : named;
  return t("Exported {count} public files. Included: {included}. Excluded from selected roots: {excluded}.", {
    count: result.files,
    included,
    excluded: result.excluded.length,
  });
}

/** The chat's own lines outside its markup: busy labels, prefills and refusals. */
export const CHAT_WORDS = {
  stopping: t("Stopping"),
  /** A message on its way, until its row arrives. */
  sending: t("Sending"),
  /** A follow-up on its way, or waiting below the work until that work reads it. */
  sendingMessage: t("Sending…"),
  waitingForAnswer: t("Waiting for your answer"),
  describeChanges: t("Describe the changes you’d like to make"),
  /** A build's generic busy label reads as its next step instead. */
  planningNextStep: t("Planning the next step"),
  keepGoing: t("Keep going from where we left off."),
  consentSettled: t("That request is no longer waiting for an answer."),
  planSettled: t("This plan is no longer waiting for approval."),
  /** Below the one waiting card on show: how many more wait behind it. */
  moreWaiting: (count: number) => t("{count} more waiting", { count }),
} as const;

/**
 * The prompt bar's line while files are dragged over the chat, and the note a drop leaves. `files`
 * says whether what is counted includes files that are not pictures.
 */
export const COMPOSER_DROP_WORDS = {
  dropToAdd: (count: number, files: boolean) =>
    files
      ? t("Drop to add {count, plural, one {# file} other {# files}}", { count })
      : t("Drop to add {count, plural, one {# picture} other {# pictures}}", { count }),
  full: (max: number, files: boolean) =>
    files ? t("{max} files at most", { max }) : t("{max} pictures at most", { max }),
  someStayOut: (room: number, out: number, files: boolean) =>
    files
      ? t("Room for {room, plural, one {# file} other {# files}}, {out} will stay out", { room, out })
      : t("Room for {room, plural, one {# picture} other {# pictures}}, {out} will stay out", { room, out }),
  overLimit: (count: number, max: number, files: boolean) =>
    files
      ? t("{count, plural, one {# file} other {# files}} left out, {max} at most", { count, max })
      : t("{count, plural, one {# picture} other {# pictures}} left out, {max} at most", { count, max }),
  couldNotAdd: (name: string) => t("{name} couldn’t be added", { name }),
  couldNotAddMany: (count: number) => t("{count} files couldn’t be added", { count }),
  filesLeftOut: (count: number) => t("{count} files didn’t go in", { count }),
  chooseFiles: t("Choose files"),
  dismiss: t("Dismiss"),
  /** A file on the board: its chip's remove button. */
  remove: (name: string) => t("Remove {name}", { name }),
} as const;

// ── the system file manager ───────────────────────────────────────────────────────────────

/** What a button that shows a file in the system's file manager says, and its failure. */
export interface FileManagerWords {
  /** Show a folder or a game file. */
  show: string;
  /** Show an asset from its preview. */
  reveal: string;
  revealFailed: string;
}

const FINDER_WORDS: FileManagerWords = {
  show: t("Show in Finder"),
  reveal: t("Reveal in Finder"),
  revealFailed: t("Could not reveal this file in Finder."),
};

/** Windows names File Explorer; Linux has no one file manager, so the folder is named instead. */
const FILE_MANAGER_WORDS: Readonly<Record<string, FileManagerWords>> = {
  [StudioPlatform.Mac]: FINDER_WORDS,
  [StudioPlatform.Windows]: {
    show: t("Show in Explorer"),
    reveal: t("Show in Explorer"),
    revealFailed: t("Could not show this file in Explorer."),
  },
  [StudioPlatform.Linux]: {
    show: t("Show in folder"),
    reveal: t("Show in folder"),
    revealFailed: t("Could not show this file in its folder."),
  },
};

/** The file manager's words on `platform` (`renderer/platform.ts`); macOS's until main has said. */
export function fileManagerWords(platform: string): FileManagerWords {
  return FILE_MANAGER_WORDS[platform] ?? FINDER_WORDS;
}

// ── delivered assets ──────────────────────────────────────────────────────────────────────

/** What the chat's asset cards, the Assets tab and the asset viewer say. */
export const ASSET_WORDS = {
  openInAssets: t("Open in Assets"),
  /** How to move around a model in the viewer, and around a flat texture. */
  modelHint: t("Drag to turn · Scroll to zoom · Double-click to reset"),
  textureHint: t("Scroll to zoom · Double-click to reset"),
  zoomIn: t("See the picture at full size"),
  zoomOut: t("Fit the picture"),
  loading: t("Loading preview…"),
  animations: t("Animations"),
  speed: t("Speed"),
  playFailed: t("This sound could not be played"),
} as const;

/** Save, Share, select several and search on the Assets tab and in its viewer (`panels/assets/`). */
export const ASSET_LIBRARY_WORDS = {
  /** The tags on a card. */
  saved: t("Saved"),
  shared: t("Shared"),
  /** A file only in the build of a run still going: it reaches the game when the run lands. */
  building: t("In the running build"),
  buildingTip: t("Not in your game yet. It arrives when the build lands."),
  save: t("Save"),
  saveTip: t("Save to your library"),
  unsaveTip: t("Remove from Saved"),
  share: t("Share"),
  shareTip: t("Share with the community"),
  sharing: t("Sharing…"),
  /** The menu of an asset on Play: its page, and taking it off. */
  sharedMenu: t("Shared on Play"),
  openOnPlay: t("Open on Play"),
  stopSharing: t("Stop sharing"),
  /** A share's step line under its card, and how it ended. */
  steps: { send: t("Send"), check: tc("step", "Check"), live: t("Live") },
  stepsLabel: t("Sharing"),
  checking: t("Checking"),
  onPlay: t("On Play"),
  missed: {
    [ShareMiss.Refused]: t("Couldn't share"),
    [ShareMiss.Checking]: t("Checking"),
    [ShareMiss.NotShareable]: t("Only Genex assets share"),
    [ShareMiss.KindNotShareable]: t("Music can't be shared"),
    [ShareMiss.TooMany]: t("Too many at once"),
    [ShareMiss.Failed]: t("Couldn't share"),
  } satisfies Record<ShareMiss, string>,
  tryAgain: t("Try again"),
  sendReport: t("Send a report"),
  sendReportLabel: t("Send this refusal and the app's logs to the Genex team"),
  reportSent: t("Report sent"),
  /** What Send a report posts: the asset, its game and genex.games' own words. A report to the Genex team: kept in English. */
  reportText: (name: string, project: string, detail: string) =>
    `genex.games refused to share "${name}" (${project}).${detail ? `\n\n${detail}` : ""}`,
  /** The share window. */
  shareOne: (name: string) => t("Share {name}", { name }),
  shareMany: (count: number) => t("Share {count} assets", { count }),
  shareButton: (count: number) => (count === 1 ? t("Share") : t("Share {count} assets", { count })),
  nameLabel: t("Name"),
  nameOf: (name: string) => t("Name for {name}", { name }),
  everyoneOne: t("Everyone on Genex can find and use it."),
  everyoneMany: t("Everyone on Genex can find and use them."),
  cancel: t("Cancel"),
  /** Select several. */
  selected: (count: number) => t("{count} selected", { count }),
  select: (name: string) => t("Select {name}", { name }),
  deselect: (name: string) => t("Deselect {name}", { name }),
  clear: t("Clear"),
  clearSelection: t("Clear the selection"),
  /** Search on the canvas. */
  search: t("Search assets"),
  searchLabel: t("Search this game, your library and the community"),
  clearSearch: t("Clear the search"),
  thisGame: t("This game"),
  myLibrary: t("My library"),
  community: t("Community"),
  noMatches: t("no matches"),
  add: t("Add"),
  addLabel: (title: string) => t("Add {title} to this game", { title }),
  added: (game: string) => t("Added to {game}", { game }),
} as const;

/** The Builds graph's assets tile and card: jobs still open when the run ended. */
export const ASSET_JOB_WORDS = {
  notFinished: (count: number) => t("{count} not finished", { count }),
  notFinishedGroup: t("Not finished"),
} as const;

/** What an asset card says while its asset is being made (`asset-making.ts`). */
export const MAKING_WORDS = {
  /** What a job makes (`MakingKind`), and an asset of a kind the plugin did not say. */
  kind: {
    [MakingKind.Character]: t("Character"),
    [MakingKind.Creature]: t("Creature"),
    [MakingKind.Model]: t("3D model"),
    [MakingKind.RiggedModel]: t("Rigged model"),
    [MakingKind.Animation]: t("Animation"),
    [MakingKind.Image]: t("Image"),
    [MakingKind.Texture]: t("Texture"),
    [MakingKind.Video]: t("Video"),
    [MakingKind.SoundEffect]: t("Sound effect"),
    [MakingKind.Music]: t("Music"),
    [MakingKind.Voice]: t("Voice"),
    asset: t("Asset"),
  } satisfies Record<MakingKind | "asset", string>,
  queued: t("Queued"),
  failed: t("Didn’t finish"),
  stopped: t("Stopped"),
  unsure: t("Not confirmed"),
  notFetched: t("Not downloaded"),
  notInGame: t("Not in your game"),
  /** A clock that ran past the hours it spells out. */
  overHours: (hours: number) => t("{hours}+ h", { hours }),
  approve: t("Approve"),
  approving: t("Approving…"),
  /** The Approve button's full name: which candidate, or the remesh. */
  approveLabel: (candidate: number | null) =>
    candidate === null ? t("Approve the remesh") : t("Approve candidate {index}", { index: candidate }),
  /** A candidate's tab, and its picture. */
  candidate: (n: number) => t("Candidate {index}", { index: n }),
  candidates: t("Candidates"),
  /** A job the account had too few Genex credits for: nothing was made or charged. */
  needsCredits: t("Not enough credits"),
  /** Its action: genex.games' plans in the browser. */
  getCredits: t("Get credits"),
  getCreditsLabel: t("Get Genex credits on genex.games"),
  /** Once the balance pays for it: the chat's agent is asked to make it now. */
  makeIt: t("Make it"),
  /** What Make it sends in the game's chat, as if typed: "Make the 3D model with Genex now: Dragon boss". */
  makeAgain: (kind: string, prompt: string | null) =>
    prompt
      ? t("Make the {kind} with Genex now: {prompt}", { kind, prompt })
      : t("Make the {kind} with Genex now.", { kind }),
  /** The chat's cards of the assets a piece of work is still making. */
  inChat: t("Assets being made"),
  spoken: {
    making: (kind: string, tool: string) => t("{kind} being made with {tool}", { kind, tool }),
    queued: (kind: string, tool: string) => t("{kind} queued for {tool}", { kind, tool }),
    review: (kind: string, tool: string) => t("{kind} from {tool} waits for your choice", { kind, tool }),
    ended: (kind: string, tool: string, title: string) => t("{kind} from {tool}: {title}", { kind, tool, title }),
    withPrompt: (said: string, prompt: string) => `${said}. ${prompt}`,
  },
} as const;

/** "1 animation", "3 animations". */
export function animationCountWords(count: number): string {
  return t("{count, plural, one {# animation} other {# animations}}", { count });
}

/** A model's animation files, named for the model: "Knight animations". */
export function modelAnimationsWords(model: string): string {
  return t("{model} animations", { model });
}

// ── files the chat names ──────────────────────────────────────────────────────────────────

/** A file link's words: what a click does, by how it opens (`shared/chat-files.ts`), and why it failed. */
export interface ChatFileWords {
  open: Readonly<Record<ChatFileOpen, string>>;
  /** Under the path of a file only the run's build has. */
  build: string;
  /** No app claimed the file, so the file manager shows it. */
  noApp: (label: string) => string;
}

const MAC_FILE_WORDS: ChatFileWords = {
  open: {
    [ChatFileOpen.Beside]: t("Opens beside the chat"),
    [ChatFileOpen.App]: t("Opens in its default app"),
    [ChatFileOpen.Folder]: t("Opens in Finder"),
    [ChatFileOpen.Finder]: t("Shows in Finder"),
  },
  build: t("In the build · not in your game folder yet"),
  noApp: (label) => t("No app on this Mac opens {file}, so it’s shown in Finder.", { file: label }),
};

/** The same words where the file manager is File Explorer, or has no one name (Linux). */
const CHAT_FILE_WORDS: Readonly<Record<string, ChatFileWords>> = {
  [StudioPlatform.Mac]: MAC_FILE_WORDS,
  [StudioPlatform.Windows]: {
    ...MAC_FILE_WORDS,
    open: {
      ...MAC_FILE_WORDS.open,
      [ChatFileOpen.Folder]: t("Opens in Explorer"),
      [ChatFileOpen.Finder]: t("Shows in Explorer"),
    },
    noApp: (label) => t("No app on this computer opens {file}, so it’s shown in Explorer.", { file: label }),
  },
  [StudioPlatform.Linux]: {
    ...MAC_FILE_WORDS,
    open: {
      ...MAC_FILE_WORDS.open,
      [ChatFileOpen.Folder]: t("Opens the folder"),
      [ChatFileOpen.Finder]: t("Shows in its folder"),
    },
    noApp: (label) => t("No app on this computer opens {file}, so its folder is shown.", { file: label }),
  },
};

/** A file link's words on `platform` (`renderer/platform.ts`); macOS's until main has said. */
export function chatFileWords(platform: string): ChatFileWords {
  return CHAT_FILE_WORDS[platform] ?? MAC_FILE_WORDS;
}

// ── the sandbox setup screen ──────────────────────────────────────────────────────────────

/** "Set up the protected workspace": what the window says when the process sandbox cannot start. */
export const SANDBOX_SETUP_WORDS = {
  title: t("Set up the protected workspace"),
  intro: t("Studio’s agents only run inside a protected workspace that keeps them away from your files and accounts."),
  /** Why it cannot start, by `SandboxProblemCode`. */
  why: {
    "missing-tools": t("This computer is missing the programs it needs:"),
    "unsupported-platform": t(
      "This system can’t run the protected workspace. Studio needs macOS, Windows, or Linux (not WSL 1).",
    ),
    "not-provisioned": t("Windows needs a one-time setup of the protected workspace, approved by an administrator."),
    "git-missing": t(
      "Agents run their commands in Git Bash, which comes with Git for Windows. Install it from git-scm.com, then retry.",
    ),
    "isolation-blocked": t("This system is blocking the isolation the protected workspace uses to keep agents apart."),
  } satisfies Record<SandboxProblemCode, string>,
  installThenRetry: t("Install them in a terminal, then retry:"),
  /** Isolation blocked by AppArmor: the profile only applies to a Studio started after it. */
  allowThenReopen: t("Allow it for Studio in a terminal, then quit and reopen Studio:"),
  /** Who the allow command is for. */
  allowFor: t("Ubuntu 24.04 and later (AppArmor)"),
  /** Who each install command is for, by `PackageManager`. */
  system: { apt: "Ubuntu, Debian", dnf: "Fedora" } satisfies Record<PackageManager, string>,
  copy: t("Copy"),
  copied: t("Copied"),
  copyCommand: (system: string) => t("Copy the {system} command", { system }),
  retry: t("Retry"),
  retrying: t("Checking…"),
  /** Windows' first start, which sets the workspace up by itself behind one approval prompt. */
  windows: {
    settingUp: {
      title: t("Setting up Genex"),
      line: t(
        "Windows will ask you to allow this once. If it asks for a password, an administrator of this PC can enter theirs. Agents work in their own protected space, away from your files.",
      ),
      step: t("Waiting for your OK"),
    },
    needsOk: {
      title: t("Genex needs your OK to set up"),
      line: t(
        "Agents only run in a protected space that Windows has to allow once. If you aren’t an administrator of this PC, ask one to enter their password when Windows asks, then press Set up.",
      ),
      setUp: t("Set up"),
    },
    failed: {
      title: t("Setup didn’t finish"),
      line: t("Windows wouldn’t start Genex’s protected space."),
      tryAgain: t("Try again"),
      report: t("Send a report"),
      sending: t("Sending…"),
      /** The bare ✓'s label, once the report went. */
      sent: t("Report sent"),
      reportFailed: t("The report didn’t send. Try again in a moment."),
    },
    /** An earlier Genex set the protected space up for an older sandbox: one approval updates it. */
    reinstall: {
      title: t("Genex’s protected space needs an update"),
      line: t("Windows will ask you to allow it once."),
      update: t("Update"),
      updating: t("Waiting for your OK"),
    },
    /** Windows' Secondary Logon service is disabled: agents start through it. */
    logonService: {
      line: t("Secondary Logon is turned off on this PC. Set up turns it back on, since agents start through it."),
      fix: t("Turn on Secondary Logon in Windows Services (Startup type: Manual), then try again."),
    },
  },
  /** A Windows window opened before the core: what the start is doing, by `StartStep`. */
  starting: {
    title: t("Starting Genex"),
    line: t("Getting your games and the protected workspace ready."),
    step: {
      agents: t("Preparing your agents"),
      games: t("Reading your games"),
      workspace: t("Starting the protected workspace"),
      studio: t("Opening the studio"),
    } satisfies Record<StartStep, string>,
  },
  /** Genex moving its files to the folder chosen in Settings → Storage, then starting again. */
  moving: {
    title: t("Moving your Genex files"),
    line: (to: string) => t("To {folder}. Genex reopens when it’s done.", { folder: to }),
    counting: t("Counting files"),
    progress: (done: number, total: number) =>
      t("{done} of {total}", { done: sizeWords(done), total: sizeWords(total) }),
  },
  /** A move that stopped with some files already in the new folder: Try again carries it on. */
  moveStopped: {
    title: t("Genex couldn’t finish moving its files"),
    line: (to: string) => t("Some are already in {folder}. Try again to finish moving them.", { folder: to }),
    tryAgain: t("Try again"),
    quit: t("Quit"),
  },
  /** The folder Genex keeps its files in is not there (its drive is unplugged). */
  dataMissing: {
    title: t("Genex can’t find its files"),
    line: (dir: string) => t("They’re in {folder}. Connect that drive, then try again.", { folder: dir }),
    tryAgain: t("Try again"),
    checking: t("Checking…"),
    quit: t("Quit"),
  },
  /** The studio's harness would not start: its error, Try again, a report and Quit. */
  startFailed: {
    title: t("Genex couldn’t start"),
    line: t("The part of Genex that runs your agents didn’t start."),
    tryAgain: t("Try again"),
    quit: t("Quit"),
  },
  stillFailing: t("Studio still couldn’t start:"),
  details: t("Details"),
  /** A new version downloaded before the studio opened; the button is the sidebar's (`UPDATE_WORDS`). */
  update: {
    ready: (version: string | null) =>
      version
        ? t("Genex {version} is ready and may fix this.", { version })
        : t("A new version of Genex is ready and may fix this."),
  },
} as const;

// ── the Plugins tab ───────────────────────────────────────────────────────────────────────

/** The Plugins tab's lists, its Add menu and the Install from GitHub window. */
export const PLUGINS_WORDS = {
  intro: t("Tools and connections for all your games."),
  back: t("Back to workspace"),
  add: {
    github: t("Install from GitHub…"),
    server: t("Add MCP server…"),
    create: t("Create a plugin"),
    local: t("Load local plugin…"),
  },
  /** A plugin's row in the composer's Add menu: its name opens its page, Settings shows under the pointer. */
  menuRow: {
    settings: t("Settings"),
    settingsLabel: (name: string) => t("{name} settings", { name }),
    /** The name's own label: it opens the same page as Settings. */
    openLabel: (name: string) => t("Open {name} settings", { name }),
  },
  /** The catalog's plugins Genex makes, that you don't have. */
  ours: {
    title: t("Plugins"),
  },
  /** The catalog's plugins anyone else made, reviewed before they are listed. */
  community: {
    title: t("Community plugins"),
    by: t("by"),
    /** The publisher's GitHub name, a link to their profile. */
    profile: (login: string) => t("Open {login} on GitHub", { login }),
  },
  /** A catalog plugin's page before it is installed: how to start, what it can do, where it comes from. */
  listing: {
    install: t("Install"),
    installLabel: (name: string) => t("Install {name}", { name }),
    open: (name: string) => t("Open {name}", { name }),
    steps: t("How to start"),
    installStep: t("Install it. Genex shows what it can reach and asks you first."),
    connectStep: (name: string) => t("Open {name}'s page and connect your account or key.", { name }),
    readyStep: t("It turns on when installed: agents in all your games can use it from your next message."),
    installedStep: t("Installed."),
    connectAccount: t("Connect its account with the button above."),
    /** A tile's and a page's mark while the plugin waits on its person. */
    needsSetup: t("Needs setup"),
    developer: t("Developer"),
    source: t("Source"),
    guide: t("Guide"),
    category: t("Category"),
  },
  /** Community plugins while the catalog has none you don't have yet. */
  marketplace: {
    title: t("Community plugins"),
    soon: t("Coming soon"),
    text: t("Anyone can make one. The first ones are on the way."),
  },
  /** The MCP servers section before anyone has added one. */
  servers: {
    emptyTitle: t("Connect any MCP server"),
    emptyText: t("A command on this computer, or a URL with browser sign-in. Agents in every game can use its tools."),
  },
  own: {
    title: t("Make a community plugin"),
    text: t("Anyone can: one folder with a manifest, tools and panels, the same way Local Blender and Genex are made."),
    guide: t("Read the guide"),
  },
  /** A plugin row's account, by what it needs next. */
  account: {
    connect: t("Connect"),
    /** Genex's row: its account is the app's, signed in as everywhere else. */
    signIn: t("Sign in"),
    signInLabel: t("Sign in to Genex in your browser"),
    connectHint: t("Uses your saved sign-in, or opens your browser"),
    reconnect: t("Reconnect"),
    finishing: t("Finish in your browser"),
    cancel: t("Cancel"),
    credits: (count: string) => t("{count} credits", { count }),
    unlimited: t("Unlimited credits"),
  },
  /** A plugin's page: its skills in one line, its connections, and what it is and can do. */
  page: {
    skillsLine: (name: string) => t("Instructions agents read when they use {name}.", { name }),
    showAll: t("Show all"),
    showFewer: t("Show fewer"),
    connections: t("Connections"),
    /** A connection with tools the person always allowed, and the button that takes it back. */
    alwaysAllowed: (tools: string) => t("Runs without asking: {tools}.", { tools }),
    askEveryTime: t("Ask every time"),
    ready: t("Ready"),
    off: t("Off"),
    connecting: t("Connecting…"),
    failed: t("Couldn’t start"),
    needsAccount: t("Connect the account first"),
    set: (label: string) => t("Set {setting}", { setting: `${label.charAt(0).toLocaleLowerCase()}${label.slice(1)}` }),
    save: t("Save"),
    information: t("Information"),
    developer: t("Developer"),
    version: t("Version"),
    bundled: (version: string) => t("{version} · bundled with Studio", { version }),
    from: (version: string, source: string) => `${version} · ${source}`,
    can: t("Can"),
    nothing: t("Nothing beyond its own tools"),
    /** The folders outside your games its programs write to, each with why. */
    folders: t("Folders"),
    folder: (path: string, why: string) => `${path} — ${why}`,
    scan: t("Code scan"),
    trusted: t("This plugin runs trusted code on your computer."),
    /** A plugin loaded from a folder, in place of `trusted`. */
    localAccess: t(
      "Loaded from a folder on this Mac. It runs with your access: its code isn't sandboxed. Each of its tools asks you before an agent runs it; its own steps at Genex's moments don't ask.",
    ),
  },
  /** What a plugin may do, in words, by `PluginCapability`; joined in this order on its page. */
  can: {
    credentials: (publisher: string) => t("use your {publisher} account", { publisher }),
    "native-runtime": (runtimes: string) => t("run {runtimes}", { runtimes }),
    observe: t("see the running game"),
    network: t("reach the internet"),
    "external-auth": t("open sign-in in your browser"),
    jobs: t("run background jobs"),
    "project.read": t("read files in your games"),
    "project.write": t("write files in your games"),
    readWrite: t("read and write files in your games"),
    settings: t("keep its own settings"),
    export: t("export games"),
  },
  /** Local Blender's setup card and what it does. */
  blender: {
    card: "Blender",
    ready: (version: string) => t("Blender {version} is ready", { version }),
    checkAgain: t("Check again"),
    missingTitle: t("Blender isn’t installed"),
    missingText: (version: string, size: string) =>
      t("Download Blender {version} (about {size}) for Studio. A Blender you installed yourself stays as it is.", {
        version,
        size,
      }),
    missingOwnText: t(
      "Genex has no download of Blender for this computer. Install Blender 4.2 or newer, then check again.",
    ),
    oldTitle: (version: string) => t("Blender {version} is too old", { version }),
    oldText: (version: string, size: string) =>
      t("Download Blender {version} (about {size}) for Studio. The Blender you have stays as it is.", {
        version,
        size,
      }),
    failedTitle: t("Blender couldn’t start"),
    download: t("Download Blender"),
    choose: t("Choose Blender…"),
    chooseTitle: t("Choose blender.exe"),
    downloading: (version: string) => t("Downloading Blender {version}", { version }),
    installing: (version: string) => t("Installing Blender {version}", { version }),
    progress: (done: string, total: string) => t("{done} of {total}", { done, total }),
    cancel: t("Cancel"),
    checking: t("Checking Blender…"),
    doesTitle: t("What it does"),
    doesIntro: t("Agents use it when a game needs a model and you haven’t asked for Genex."),
    model: { title: t("Model from a script"), text: t("A GLB for the game plus reference renders to check it.") },
    change: {
      title: t("Change a model"),
      text: t("Reshape or clean up a GLB already in your game. The original stays."),
    },
  },
  github: {
    title: t("Install from GitHub"),
    intro: t("Paste the link to a plugin’s GitHub page. Studio finds the plugin and its latest release."),
    field: t("GitHub link"),
    placeholder: "github.com/owner/plugin",
    continue: t("Continue"),
    looking: t("Looking…"),
    cancel: t("Cancel"),
    install: t("Install…"),
    installing: t("Installing…"),
    by: (owner: string) => t("by {owner}", { owner }),
    version: t("Version"),
    change: t("Change"),
    changeLabel: t("Choose another version"),
    versionsLoading: t("Loading versions…"),
    versionsFailed: t("Couldn’t load other versions."),
    latestRelease: (date: string) => (date ? t("latest release, {date}", { date }) : t("latest release")),
    newestOn: (branch: string) => t("Newest code on {branch}", { branch }),
    commit: (short: string) => t("Commit {commit}", { commit: short }),
    next: t("Next, Studio checks the code and shows what the plugin can do. Nothing is installed until you agree."),
    noRelease: t(
      "This plugin has no releases, so Studio takes the newest code. It stays as installed until you update it.",
    ),
    choose: (count: number) => t("This repository has {count} plugins. Choose one.", { count }),
    guide: t("How to make a plugin"),
    /** Why a link found no plugin, and what to try, by `GithubLookupProblem`. */
    problem: {
      "not-a-link": [t("That isn’t a link to a GitHub repository."), t("Paste a link like github.com/owner/plugin.")],
      "not-found": [t("Couldn’t find that on GitHub."), t("Check the link. Private repositories can’t be installed.")],
      "no-plugin": [
        t("There’s no plugin here: this repository has no plugin.json."),
        t("If the plugin is in a folder, open that folder on GitHub and paste its link."),
      ],
      "invalid-plugin": [t("This plugin’s plugin.json can’t be used."), ""],
      "rate-limited": [t("GitHub is limiting requests from this network."), t("Try again in a few minutes.")],
    } satisfies Record<GithubLookupProblem, readonly [string, string]>,
  },
} as const;

// ── Plan mode in the composer ─────────────────────────────────────────────────────────────

/** Add's Plan mode: its row and the bulb that shows it, in Codex's words. */
export const PLAN_MODE_WORDS = {
  label: t("Plan mode"),
  turnOn: t("Turn plan mode on"),
  turnOff: t("Turn plan mode off"),
  duringBuild: t("Not while a build owns the chat"),
} as const;

// ── the Skills tab ────────────────────────────────────────────────────────────────────────

/** The Skills tab's section titles, the lines under them, and what a plugin's switch applies to. */
export const SKILLS_WORDS = {
  studioTitle: t("Studio skills"),
  studioIntro: t("Used by local chat, the run planner and the director."),
  gameTitle: t("This game"),
  gameIntro: t("In this game’s folder. Workers load them from there."),
  gameEmpty: t("This game has no skills of its own."),
  providerTitle: (label: string) => t("{provider} · Global skills", { provider: label }),
  /** Whether a provider's global skills reach Studio's builders, by `ProviderBuilderUse`. */
  builders: {
    "not-loaded": t("Installed on this Mac. Studio’s workers don’t load them."),
    "studio-profile": t("From Studio’s own Codex profile, which workers use."),
    "borrowed-login": t("From your own Codex setup. Workers use your Codex login, so they load these too."),
    "no-login": t("Codex isn’t signed in, so no worker loads these yet."),
  } satisfies Record<ProviderBuilderUse, string>,
  pluginsTitle: t("Plugin skills"),
  onDemand: t("Read by agents on demand"),
  /** What the last update or reload did to a plugin's skills, by name. */
  changed: { added: t("Added"), changed: t("Changed"), removed: t("Removed") },
  lastChange: t("Last update"),
  loadingFile: t("Reading the skill…"),
  /** The hint beside a plugin's switch in the Add menu: turning it off turns it off everywhere. */
  allGames: t("All games"),
} as const;

// ── commands a reply offers ───────────────────────────────────────────────────────────────

/** A command block's icon actions and how its run is going, by `CommandState`. */
export const COMMAND_WORDS = {
  run: t("Run in terminal"),
  runAgain: t("Run again"),
  stop: t("Stop"),
  copy: t("Copy command"),
  copied: t("Copied"),
  openTerminal: t("Open in terminal"),
  showAll: t("Show all output"),
  showLess: t("Show less output"),
  state: {
    running: t("Running…"),
    stopping: t("Stopping…"),
    done: t("Done"),
    failed: t("Failed"),
    stopped: t("Stopped"),
    broken: t("Couldn’t run"),
  } satisfies Record<CommandState, string>,
  exitCode: (code: number) => t("exit {code}", { code }),
} as const;

/**
 * What the chat tells the agent, as the user, when a command they ran from its reply ends: the
 * command, how it ended, and the last lines it printed. Plain text, because it is a user message.
 * Written for the agent, so it stays in English as the model prompts do.
 */
export function commandResultWords(command: string, session: { exitCode?: number; output?: string[] }): string {
  const code = session.exitCode ?? 1;
  const ended = code === 0 ? `It finished (exit code 0).` : `It failed (exit code ${code}).`;
  const output = session.output ?? [];
  const tail = output.length ? `The last lines it printed:\n${output.join("\n")}` : "It printed nothing.";
  return `I ran this in the terminal:\n${command}\n\n${ended} ${tail}`;
}

/** What the chat tells the agent, unseen, when the person turned on the plugin it suggested. A prompt: English. */
export const pluginTurnedOnWords = (name: string): string =>
  `I turned on the ${name} plugin from your card. Go on with what I asked.`;

// ── Genex plugin ───────────────────────────────────────────────────────────────────────────

/** The Genex promo after the welcome, the Genex plugin page and its generations. */
export const GENEX_WORDS = {
  promo: {
    label: t("Genex plugin"),
    eyebrow: t("Featured Genex plugin"),
    title: t("Generate game assets in chat"),
    models: { title: t("3D models and characters"), text: t("Rigged, animated and ready for your game.") },
    media: { title: t("Sound, music and art"), text: t("Effects, soundtracks, voices and textures.") },
    publish: { title: t("Publish with a playable link"), text: t("Anyone can play it in their browser.") },
    learnMore: t("Learn more"),
    learnMoreLabel: t("Learn more about the Genex plugin"),
    linkCopied: t("Link copied"),
    connect: t("Connect Genex plugin"),
    waiting: t("Finish in your browser"),
    cancel: t("Cancel"),
    failed: t("Sign-in didn’t finish."),
    retry: t("Try again"),
    connectedTitle: t("Genex is connected"),
    connectedText: t("Ask for a model, a sound or a texture in any game chat."),
    done: t("Done"),
    dismiss: t("Close"),
  },
  account: {
    /** The Connect band, for assistive tech: the account, or the plugin while it is off. */
    label: t("Genex account"),
    offLabel: t("Connect Genex"),
    /** The Connect band's offer, with the plugin off or its account not yet connected. */
    offerTitle: t("The best game dev tools, in one click"),
    offerText: t("Extend your agent with up-to-date tools for 3D, textures, sound and video. Always optional."),
    retryTitle: t("Reconnect your Genex account"),
    retryText: t("Your saved sign-in couldn’t be opened on this Mac. Sign in again in your browser."),
    /** Connect turns the plugin on and signs in to Genex: the saved sign-in, or the browser. */
    connect: t("Connect"),
    retry: t("Reconnect"),
    signingInTitle: t("Finish signing in in your browser"),
    /** The code beside it in the Publish dialog. */
    browserShows: t("Your browser should show"),
    reopen: t("Open sign-in again"),
    /** Connect, busy: before the browser opens, then while it is open. */
    connecting: t("Connecting…"),
    waitingBrowser: t("Waiting for browser…"),
    cancel: t("Cancel"),
    termsTitle: t("Accept the updated Genex terms"),
    termsText: t("Review them in your browser to keep generating."),
    terms: t("Review terms"),
    loading: t("Loading your Genex account…"),
    checking: t("Checking your Genex account…"),
    attentionTitle: t("Couldn’t check your Genex account"),
    tryAgain: t("Try again"),
    connected: t("Connected"),
    disconnect: t("Disconnect"),
    unlimited: t("Unlimited"),
    outOfCredits: t("Games still build with procedural assets and Local Blender."),
    paused: (kinds: string) => t("Paused on Genex right now: {kinds}.", { kinds }),
  },
  /** Genex as the Plugins page shows it: the router, its line, and the tools it routes. */
  router: {
    name: t("Genex plugin"),
    description: t("Game dev tools router"),
    /** Genex's row line, on and off: what the switch takes away (the agent's tools) and what it never does. */
    rowOn: {
      lead: t("Tools for your agent: 3D, textures, animation, music, multiplayer."),
      tail: t("Uses your Genex account."),
    },
    rowOff: { lead: t("Off. Your agent can't use Genex tools."), tail: t("Your profile, friends and Publish stay.") },
    /** The line under the plugin page's title while an account is connected. */
    connectedAs: (name: string) => t("Game dev tools router · connected as {name}", { name }),
    toolsTitle: t("Tools it routes"),
    toolsIntro: t(
      "Ask in any game chat. Genex picks the tool, runs it on your balance and saves the file in your game. No accounts or keys of your own.",
    ),
    /** Each routed tool's name and what it does, by `GenexTool`. */
    tools: {
      tripo: { name: "Tripo", short: "Tripo", line: t("3D · rig · animate") },
      meshy: { name: "Meshy", short: "Meshy", line: t("3D · characters") },
      uthana: { name: "Uthana", short: "Uthana", line: t("Rigging · animation") },
      "gpt-image": { name: "GPT Image 2.5", short: "GPT Image", line: t("Images · sprites") },
      "nano-banana": { name: "Nano Banana 2", short: "Nano Banana", line: t("Textures") },
      minimax: { name: "MiniMax H3 Max Turbo", short: "MiniMax", line: t("Video") },
      blender: { name: "Blender", short: "Blender", line: t("Scenes · blockouts") },
      elevenlabs: { name: "ElevenLabs", short: "ElevenLabs", line: t("SFX · music · voice") },
      publishing: { name: "Genex", short: "Genex", line: t("Publishing") },
    },
  },
  /** The Genex plugin page's tabs. */
  tabs: { label: t("Genex plugin"), tools: t("Tools"), credits: t("Credits") },
  /** The Credits tab: the balance, what credits pay for (live prices), that building is free, and recent spends. */
  creditsTab: {
    label: t("Genex plugin, Credits"),
    unit: (count: number) => t("{count, plural, one {credit} other {credits}}", { count }),
    unlimited: t("Unlimited credits"),
    /** The balance genex.games couldn't give: a dash, and why. */
    noBalance: "—",
    balanceUnread: t("balance couldn’t be read"),
    /** What an invite earns, beside Invite a friend. */
    bonus: (credits: number) => `+${credits}`,
    plan: (allowance: string, when: string) => t("Pro · {allowance} more on {when}", { allowance, when }),
    inviteFriend: t("Invite a friend"),
    getCredits: t("Get credits"),
    payFor: t("What credits pay for"),
    /** Beside the tools' marks, over the prices. */
    toolsLine: t(
      "The best game dev tools, always up to date. No MCPs or API keys to install: they’re connected in one click.",
    ),
    /** A kind's lowest price, the number bold. */
    from: (price: string) => t("from <b>{price}</b>", { price }),
    pricesUnavailable: t("Prices couldn’t be read from genex.games right now."),
    recent: t("Recent spending"),
    recentLine: t("Your latest generations and refunds"),
    /** What a credit is worth, beside Recent spending's line; it wraps as one piece. */
    perCredit: t("1 credit ≈ 1¢"),
    noRecent: t("Nothing spent yet"),
    refunded: (count: number) => `+${count}`,
    refundedNote: t("refunded"),
    failedKind: (kind: string) => t("{kind}, failed", { kind }),
    spent: (count: number) => `−${Math.abs(count)}`,
    loading: t("Reading your credits…"),
    failed: t("Couldn’t read your credits."),
    signedOut: t("Sign in to Genex to see your credits."),
    /** Each kind of generation and the tool Genex routes it to. */
    kinds: {
      [CreditKind.Model]: { name: t("3D model"), tool: "Tripo" },
      [CreditKind.Character]: { name: t("Rigged character"), tool: "Meshy" },
      [CreditKind.CharacterPreview]: { name: t("Character preview"), tool: "Meshy" },
      [CreditKind.CharacterFinalize]: { name: t("Finished character"), tool: "Meshy" },
      [CreditKind.ModelAnimation]: { name: t("Animation clip"), tool: "Tripo · Uthana" },
      [CreditKind.Image]: { name: t("Image or sprite"), tool: "GPT Image" },
      [CreditKind.Texture]: { name: t("Texture set"), tool: "Nano Banana" },
      [CreditKind.Video]: { name: t("Video, 5 s"), tool: "MiniMax" },
      [CreditKind.Music]: { name: t("Music track"), tool: "ElevenLabs" },
      [CreditKind.Sound]: { name: t("Sound effect"), tool: "ElevenLabs" },
      [CreditKind.Voice]: { name: t("Voice line"), tool: "ElevenLabs" },
      [CreditKind.ModelRig]: { name: t("Rig a model"), tool: "Tripo" },
      [CreditKind.CoverRegenerate]: { name: t("New cover"), tool: "Genex" },
    } satisfies Record<CreditKind, { name: string; tool: string }>,
    otherKind: t("Generation"),
  },
  /**
   * The stage strip's Multiplayer, left of Publish: one press asks the game's chat to make it
   * multiplayer with Genex; without the plugin it opens the setup dialog, in Publish's words.
   */
  multiplayer: {
    button: t("Make multiplayer"),
    buttonLabel: t("Make this game multiplayer"),
    hint: t("Make this game multiplayer with Genex"),
    /** What the press sends to the game's chat. */
    prompt: t("Make this game multiplayer using Genex"),
    title: t("Make it multiplayer"),
    intro: t("Friends join your game from anywhere. Genex runs the rooms, the voices and the sign-in."),
    rooms: t("Online rooms"),
    voice: t("Voice chat"),
    economy: t("In-game economy"),
    /** Setup's line while the plugin is off or not installed, its name a press that opens its page; the button says what is missing. */
    turnOnLine: t("Your agent builds multiplayer with the <plugin>Genex plugin</plugin>. Turn it on to continue."),
    installLine: t("Your agent builds multiplayer with the <plugin>Genex plugin</plugin>. Install it to continue."),
  },
  /** The Publish dialog on the game's stage, drawn by Studio. */
  publish: {
    title: t("Publish your game"),
    /** The line under Publish. */
    intro: t("Anyone with the link can play it."),
    /** The stage strip's own Publish, when Genex adds none: the words of Genex's button. */
    button: t("Publish"),
    buttonLabel: t("Publish game"),
    /** The name on the banner: what the game is listed under, and what players see. */
    name: t("Name players will see"),
    rename: t("Rename the game"),
    /** The banner's chip: where the game is. */
    chipNone: t("Not published"),
    /** `when` is `relativeTime`'s, which says a moment ago as its own `t("now")`. */
    chipLive: (when: string) => (when === t("now") ? t("Live · just now") : t("Live · {when} ago", { when })),
    chipLiveUndated: t("Live"),
    chipFailed: t("Didn't publish"),
    publish: t("Publish"),
    /** The main press before the game is public: what Publish does, in a word more. */
    publishToWeb: t("Publish to the web"),
    publishing: t("Publishing…"),
    updatePublic: t("Publish update"),
    tryAgain: t("Try again"),
    publishAgain: t("Publish again"),
    openGame: t("Open"),
    openGameLabel: t("Open the game on Genex"),
    copyLink: t("Copy"),
    copyLinkLabel: t("Copy the game's link"),
    copied: t("Copied"),
    /** The public link's label in the dialog, beside the globe. */
    publicLink: t("Public:"),
    /** The public link's own press, its pencil: the field it opens, its Save and the line under it. */
    changeLink: t("Change the link"),
    newLink: t("New link"),
    saveLink: t("Save"),
    linkSaved: t("Link saved"),
    oldLinkWorks: t("The old link will still open the game"),
    changesLeft: (count: number) => t("{count, plural, one {# change left} other {# changes left}}", { count }),
    /** The tested draft, while players do not have it yet: its label, its Copy, and the line under it. */
    testLink: t("Test link:"),
    copyTestLinkLabel: t("Copy the test link"),
    testBefore: t("Friends can play it before you publish."),
    testChanges: t("Try your changes before you update."),
    /** Added for a multiplayer game: a second identity is all testing alone needs. */
    testSecondPlayer: t("Open it in a private window to join as another player."),
    /** Under the busy button: closing the dialog does not stop it. */
    keepsGoing: t("You can close this. It keeps going."),
    /** Under the busy button, once the test runs longer than usual. */
    slow: t("Taking longer than usual."),
    /** The banner's name, the one moment an attempt the dialog watched goes live: `<name>` is the name's own press. */
    isLive: t("<name>{title}</name> <live>is live!</live>"),
    replay: t("Play the celebration again"),
    /** The banner's cover controls: ask for another, say what it should show, flip through the recent ones. */
    anotherCover: t("Another cover"),
    anotherCoverLabel: t("Make another cover"),
    coverWantLabel: t("What the new cover should show"),
    coverWantPlaceholder: t("What should it show? Or leave it empty"),
    coverMake: t("Ask agent"),
    coverKeep: t("Keep this cover"),
    coverPrevious: t("Previous cover"),
    coverNext: t("Next cover"),
    coverOf: (at: number, of: number) => t("Cover {index} of {count}", { index: at, count: of }),
    /** While Studio takes a cover, or the agent makes one: the banner's busy pill. */
    coverTaking: t("Taking a cover"),
    coverMaking: t("Making a cover"),
    coverMakingClip: t("Making a clip"),
    /** Beside the pill: roughly how long is left, from how long this game's last one took. */
    coverLeft: (minutes: number) => t("~{minutes} min", { minutes }),
    /** Under the presses while the agent makes it: who is making it, and where it shows. */
    coverMakingSoon: t("The agent is making it in the chat. It shows here when it’s ready."),
    /** Under the presses when the game has no picture to go out with. */
    withoutCover: t("No cover yet, so it goes out without a picture."),
    /** What Another cover sends in the game's chat, with what the person typed. */
    coverAnotherPrompt: (want: string) =>
      want
        ? t("Make another Genex cover for this game: {want}", { want })
        : t("Make another Genex cover for this game: a different moment."),
    /** The banner's switch between the cover and its clip, and the clip's own Another. */
    coverShow: t("Show"),
    coverPicture: t("Picture"),
    coverClip: t("Clip"),
    anotherClip: t("Another clip"),
    anotherClipLabel: t("Make another clip"),
    coverAnotherClipPrompt: (want: string) =>
      want
        ? t("Make another Genex clip for this game: {want}", { want })
        : t("Make another Genex clip for this game: a different moment."),
    /** The chat's card for the cover a builder kept: its caption, its picture's name, and Publish, which opens this dialog. */
    coverCard: t("Genex cover"),
    coverCardAlt: t("This game's Genex cover"),
    coverCardPublishLabel: t("Publish this game"),
    coverCardAnother: t("Another"),
    /** The card's mark that the cover comes with a clip, and its length. */
    coverCardClip: (ms: number) => `0:${String(Math.round(ms / 1000)).padStart(2, "0")}`,
    /** A failed attempt's one line under the banner. */
    failedText: t("Nothing changed. Try again in a moment."),
    failedKept: t("The last version is still live."),
    sendReport: t("Send report"),
    sendReportLabel: t("Send this problem and the app's logs to the Genex team"),
    reportSent: t("Report sent"),
    reportFailed: t("Couldn't send. Try again"),
    /** What Send report posts: the game and the raw reason. A report to the Genex team: kept in English. */
    reportText: (title: string, project: string, details: string) =>
      `Publishing "${title}" (${project}) didn't work.\n\n${details}`,
    reviewTerms: t("Review Genex terms"),
    termsNote: t("Review the updated Genex terms in your browser before publishing."),
    /** With no account: why to sign in, under the account card. */
    signInText: t("Your games go on your Genex profile. Sign in to publish."),
    pluginPage: t("Open the Genex plugin page"),
    turnOn: t("Turn on Genex plugin"),
    turningOn: t("Turning on…"),
    install: t("Install Genex plugin"),
    installing: t("Installing…"),
    stillWorking: t("Still working — Studio hasn’t answered yet."),
    progress: t("Publish progress"),
    /** The busy button once the test runs longer than usual, or the outcome is not known yet. */
    stillTesting: t("Still testing"),
    /** What the running step is doing, by `GenexPublishPhase`: the busy button's words. */
    phase: {
      checking: t("Preparing"),
      exporting: t("Preparing"),
      "creating-project": t("Preparing"),
      uploading: t("Uploading"),
      promoting: t("Going live"),
      listing: t("Going live"),
      done: t("Finished"),
      "verifying-deployment": t("Testing"),
      ready: t("Ready to play"),
      failed: t("Didn't publish"),
      unresolved: t("Still testing"),
    } satisfies Record<GenexPublishPhase, string>,
    /** The steps under the progress bar, by `GenexPublishStep`. */
    step: {
      prepare: t("Prepare"),
      upload: t("Upload"),
      test: t("Test"),
      live: t("Go live"),
    },
  },
  /** The usage panel's Genex block: the balance every game shares, and this game's spend under it. */
  usage: {
    title: t("Genex credits"),
    thisGame: t("Used in this game"),
    unlimited: t("Unlimited"),
  },
  /** The open game's generations that wait for the person's review. */
  review: {
    title: t("Waiting for your review"),
    button: (candidate: number | null) =>
      candidate === null ? t("Review remesh") : t("Review candidate {index}", { index: candidate }),
    /** A candidate's picture above its Review button. */
    picture: (candidate: number) => t("Candidate {index}", { index: candidate }),
  },
  /** A generation's state, by `JobState`. */
  state: {
    working: t("Generating"),
    review: t("Waiting for you"),
    ready: t("Ready"),
    "in-game": t("In your game"),
    failed: t("Failed"),
    stopped: t("Stopped"),
    unsure: t("Not confirmed"),
  } satisfies Record<JobState, string>,
  credits: (count: number) => t("{count, plural, one {# credit} other {# credits}}", { count }),
  refunded: t("Refunded"),
} as const;

/** Settings → Licenses: the shipped license texts (`panels/LicensesDialog.tsx`). */
export const LICENSE_WORDS = {
  link: t("MIT License"),
  title: t("Licenses"),
  intro: t(
    "Genex is open source under the MIT License. It also includes software from other projects, each under its own license.",
  ),
  loading: t("Loading…"),
  missing: t("This build of Genex doesn’t include its license files."),
} as const;

/**
 * Usage analytics: the one-time question (`panels/AnalyticsConsent.tsx`) and its switch in Settings →
 * Privacy. Both say the same things, and PRIVACY.md says them too. The replay line shows only to an
 * install that records one (`analytics/consent.ts`).
 */
export const ANALYTICS_WORDS = {
  question: t("Help improve Genex?"),
  lead: t("Show us where Genex gets in your way."),
  events: t("Screens, clicks and errors"),
  eventsWhat: t("Where you go, what fails and how long it takes"),
  replay: t("A replay of your first week"),
  replayWhat: t("How you move through the app, with your work blanked out"),
  never: t("Never your work or name"),
  neverWhat: t("Prompts, code, files, game names and accounts are left out"),
  later: t("Change it anytime in Settings."),
  keep: t("Don't share"),
  share: tc("usage data", "Share"),
  switchLabel: t("Share usage data"),
  switchWhat: t("Screens, clicks, errors and wait times. Sent to PostHog in the EU under a random id."),
  switchWhatReplay: (until: number) =>
    t(
      "Screens, clicks, errors and wait times, and until {date} a replay of how you move through the app with your work blanked out. Sent to PostHog in the EU under a random id.",
      { date: new Date(until).toLocaleDateString(intlLocale(), { month: "long", day: "numeric" }) },
    ),
} as const;

/** Settings → Privacy: Share build metrics (`panels/PrivacySection.tsx`). PRIVACY.md says the same things. */
export const PRIVACY_WORDS = {
  tab: t("Privacy"),
  loading: t("Loading…"),
  share: t("Share build metrics"),
  shareWhat: t(
    "After each finished build, send anonymous numbers: times, token counts, the model and whether it worked. Never your prompts, code, files or game names.",
  ),
  paused: t("Sharing is paused on the Genex side. Nothing is sent until it resumes."),
  notSent: t("This is a developer or test launch of Genex: nothing is sent from it."),
  queued: (count: number) => t("{count, plural, one {# row} other {# rows}} waiting to be sent.", { count }),
  removed: t("This build of Genex has build metrics sharing removed."),
  preview: t("See what would be sent"),
  hidePreview: t("Hide what would be sent"),
  previewWhat: t("The exact row a finished build becomes, anonymous id included."),
  previewEmpty: t("Nothing yet. Finish a build and its row appears here."),
  delete: t("Delete what I shared"),
  deleteWhat: t("Removes every row sent from this computer. Later rows use a new anonymous id."),
  deleteAsk: t("Delete every row shared from this computer?"),
  deleteConfirm: t("Delete"),
  deleteCancel: t("Cancel"),
  deleting: t("Deleting…"),
  deleted: (count: number) => t("Deleted {count, plural, one {# row} other {# rows}}.", { count }),
  deletePaused: t("Genex couldn’t take the deletion right now. Nothing was deleted; try again later."),
  deleteFailed: t("Couldn’t reach Genex. Nothing was deleted; try again later."),
  deletePartial: (count: number) =>
    t(
      "Deleted {count, plural, one {# row} other {# rows}}, but Genex couldn’t finish. Try again later to remove the rest.",
      { count },
    ),
  deleteNotSent: t("Nothing was ever sent from this launch."),
  /** The quiet line of links under the rows; each opens in the browser. */
  links: {
    policy: t("Privacy Policy"),
    terms: t("Terms of Service"),
  },
} as const;

/** What a finished Delete what I shared says; a stop after earlier ids' rows were removed says how many. */
export function privacyDeleteWords(result: RunSharingDeleteResult): string {
  const stopped =
    result.outcome === RunSharingDeleteOutcome.Failed || result.outcome === RunSharingDeleteOutcome.Paused;
  if (stopped && result.deleted > 0) return PRIVACY_WORDS.deletePartial(result.deleted);
  const words: Record<RunSharingDeleteOutcome, string> = {
    [RunSharingDeleteOutcome.Deleted]: PRIVACY_WORDS.deleted(result.deleted),
    [RunSharingDeleteOutcome.Paused]: PRIVACY_WORDS.deletePaused,
    [RunSharingDeleteOutcome.Failed]: PRIVACY_WORDS.deleteFailed,
    [RunSharingDeleteOutcome.NotSent]: PRIVACY_WORDS.deleteNotSent,
  };
  return words[result.outcome];
}

/** A comment's age in words, its unit spelled out: "3 minutes ago", "1 year ago". */
function commentAgo(minutes: number): string {
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{count, plural, one {# minute ago} other {# minutes ago}}", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("{count, plural, one {# hour ago} other {# hours ago}}", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("{count, plural, one {# day ago} other {# days ago}}", { count: days });
  if (days < 365) return t("{count, plural, one {# month ago} other {# months ago}}", { count: Math.floor(days / 30) });
  return t("{count, plural, one {# year ago} other {# years ago}}", { count: Math.floor(days / 365) });
}

/** What a Play feed holds, as its messages name it (`PLAY_WORDS.search`…): a shelf, or one kind of asset. */
export type FeedThings = PlayShelf | LibraryKind;

/** Play: the genex.games catalog inside the app, its sidebar and its Genex card. */
export const PLAY_WORDS = {
  /** The Genex account at the sidebar's foot, profiles and the Friends page. */
  people: {
    friends: t("Friends"),
    friendsLabel: (waiting: number) => (waiting > 0 ? t("Friends, {count} waiting", { count: waiting }) : t("Friends")),
    hideFriends: t("Hide friends"),
    showFriends: t("Show friends"),
    plateLabel: (name: string) => t("{name}, Genex account", { name }),
    pro: "Pro",
    proTag: "PRO",
    menuLabel: t("Genex account"),
    profile: t("Profile"),
    /** The menu's row for the account's credits, which pay for Genex tools only. */
    credits: t("Genex credits"),
    creditsUnlimited: t("Unlimited"),
    /** Under the credits row once none are left: genex.games' plans in the browser. */
    getCredits: t("Get credits"),
    getCreditsLabel: t("Get Genex credits on genex.games"),
    coins: t("Nex"),
    /** The coin beside the plate's name in Play, which opens the Nex sheet: "1,240 Nex, about Nex". */
    coinsLabel: (amount: string) => t("{amount} Nex, about Nex", { amount }),
    accountSettings: t("Account settings"),
    signOut: t("Sign out"),
    /** The plate while signed out, signing in, offline, and once genex.games ended the sign-in. */
    signIn: t("Sign in to Genex"),
    signInLabel: t("Sign in to Genex in your browser"),
    finishInBrowser: t("Finish in browser"),
    finishInBrowserLabel: t("Finish signing in to Genex in your browser"),
    cancelSignIn: t("Cancel signing in"),
    signInAgain: t("Sign in again"),
    signInAgainLabel: (name: string | null) =>
      name ? t("{name}: sign in to Genex again", { name }) : t("Sign in to Genex again"),
    signInFailed: t("Couldn’t start signing in. Check your connection and try again."),
    cancelFailed: t("Couldn’t stop signing in. Try again in a moment."),
    offlineFriends: t("Offline: friends’ games and credits update when you’re back online"),
    /** Sign out's question, asked in Studio before the app and the Genex plugin sign out together. */
    signOutTitle: t("Sign out of Genex?"),
    signOutText: t(
      "Your profile, friends and Publish wait until you sign in again, and the Genex plugin’s tools stop.",
    ),
    signOutFailed: t("Couldn’t sign out. Try again in a moment."),
    back: t("Back"),
    joined: (when: string) => t("Joined {when}", { when }),
    /** What a friend card says when they are not playing: how many games they made. */
    games: (count: number) => t("{count, plural, =0 {No games yet} one {# game} other {# games}}", { count }),
    /** A profile's chips: the number bold, then its noun. */
    chipGames: (count: number) => t("{count, plural, one {game} other {games}}", { count }),
    chipPlayers: (count: number) => t("{count, plural, one {player} other {players}}", { count }),
    chipPlays: (count: number) => t("{count, plural, one {play} other {plays}}", { count }),
    since: (when: string) => t("since {when}", { when }),
    editProfile: t("Edit profile"),
    myGames: t("My games"),
    gamesBy: (name: string) => t("Games by {name}", { name }),
    noGames: t("No published games yet."),
    noGamesOwn: t("Games you publish show up here."),
    profileFailed: t("Couldn’t load this profile."),
    friendsOf: (name: string) => t("{name}’s friends", { name }),
    previous: t("Previous"),
    next: t("Next"),
    /** A row of friends' arrows: a profile's, named by whose friends they are. */
    friendsArrows: (name: string | null) =>
      name
        ? {
            previous: t("Previous {name}’s friends", { name }),
            next: t("Next {name}’s friends", { name }),
          }
        : { previous: t("Previous friends"), next: t("Next friends") },
    openProfile: (name: string) => t("Open {name}’s profile", { name }),
    playingLabel: (name: string, game: string) => t("{name}, playing {game}", { name, game }),
    /** A person's tile read aloud: their name, then its line. */
    tileLabel: (name: string, line: string) => `${name}, ${line}`,
    nameLabel: t("Name"),
    nameHint: t("Same name everywhere on Genex."),
    nameRule: t("2 to 20 characters."),
    save: t("Save"),
    saving: t("Saving…"),
    cancel: t("Cancel"),
    pictureFailed: t("Couldn’t use that picture. Try a PNG or JPEG."),
    renameFailed: t("Couldn’t change your name."),
    add: t("Add friend"),
    sent: t("Request sent"),
    cancelRequest: (name: string) => t("Cancel your request to {name}", { name }),
    accept: t("Accept"),
    acceptRequest: t("Accept request"),
    decline: (name: string) => t("Decline {name}", { name }),
    isFriend: t("Friends"),
    remove: t("Remove friend"),
    more: (name: string) => t("More for {name}", { name }),
    actionFailed: t("Genex didn’t take that. Try again in a moment."),
    findLabel: t("Find people by name"),
    find: t("Find people by name"),
    searching: t("Searching…"),
    nobody: (query: string) => t("Nobody named “{query}”.", { query }),
    searchUnavailable: t("Finding people by name isn’t on Genex yet. Send your link instead."),
    searchFailed: t("Couldn’t search. Check your connection and try again."),
    found: t("People"),
    requests: t("Requests"),
    wantsToBeFriends: t("Wants to be friends"),
    playingNow: t("Playing now"),
    allFriends: t("Friends"),
    sentRequests: t("Sent"),
    join: t("Join"),
    joinLabel: (name: string, game: string) => t("Join {name} in {game}", { name, game }),
    invite: t("Invite a friend"),
    inviteFriends: t("Invite friends"),
    /** What an invite does, and what it earns while genex.games says (never a number typed here). */
    inviteText: (bonus: number | null) =>
      bonus === null
        ? t("They get the Genex download page with a card from you.")
        : t(
            "They get the Genex download page with a card from you. You get {count} credits when they make their first game.",
            { count: bonus },
          ),
    inviteBonus: (credits: number) => `+${credits}`,
    inviteBonusLabel: (credits: number) =>
      t("{count} credits for you when a friend starts creating", { count: credits }),
    inviteLinkLabel: t("Your invite link"),
    copy: t("Copy"),
    copied: t("Copied"),
    /** Post on X and the Mac's share menu, under an invite link or a profile link. */
    postOnX: t("Post on X"),
    shareMenu: t("Share…"),
    shareMenuLabel: t("Share the link with Messages, Mail, AirDrop and more"),
    /** What a post on X says with the link. */
    inviteXText: t("Join me on Genex"),
    profileXText: t("My games on Genex"),
    /** Share, beside the pencil on the account's own profile. */
    shareProfile: t("Share profile"),
    shareProfileTitle: t("Share your profile"),
    shareProfileLink: t("Your profile link"),
    /** The link preview's picture, read aloud. */
    sharePreviewLabel: t("How your profile link looks when shared"),
    showPlaying: t("Show friends what I’m playing"),
    showPlayingOff: t("Off: friends see your name only."),
    empty: t("No friends yet — send your link and play together."),
    or: t("or"),
    friendsFailed: t("Couldn’t load your friends."),
    signedOut: t("Sign in to Genex to see your friends."),
    /** Under Friends while offline, where Playing now was. */
    playingOffline: t("Who’s playing shows again when you’re back online."),
  },
  /** The account's own numbers: the profile's strip and the stats page. Only the account sees them. */
  stats: {
    lastDays: (days: number) => t("Last {days} days", { days }),
    sectionLabel: t("My stats"),
    plays: (count: number) => t("{count, plural, one {play} other {plays}}", { count }),
    players: (count: number) => t("{count, plural, one {player} other {players}}", { count }),
    playingNow: t("playing now"),
    more: t("More"),
    startFirst: t("Your stats start with your first game"),
    createGame: t("Create a game"),
    copyLink: (title: string) => t("Copy the {title} link", { title }),
    linkCopied: t("Link copied"),
    newChange: t("New"),
    noChange: "—",
    up: (percent: number) => `+${percent}%`,
    down: (percent: number) => `−${Math.abs(percent)}%`,
    upLabel: (percent: number) => t("up {percent}%", { percent }),
    downLabel: (percent: number) => t("down {percent}%", { percent: Math.abs(percent) }),
    newLabel: t("new: nothing before to compare"),
    title: t("Stats"),
    onlyYou: t("only you see these"),
    periodLabel: t("Period"),
    period: (days: number) => t("{days} days", { days }),
    playsTile: t("Plays"),
    playersTile: t("Players"),
    playingNowTile: t("Playing now"),
    gamesTile: t("Games"),
    vsPrevious: (days: number) => t("vs previous {days} days", { days }),
    liveIn: (game: string, others: number) =>
      others > 0 ? t("in {game} and {count} more", { game, count: others }) : t("in {game}", { game }),
    nobodyNow: t("nobody right now"),
    chartTitle: t("Plays per day"),
    chartLabel: (days: number) => t("Plays per day over the last {days} days", { days }),
    tooltip: (count: string) => t("{count} plays", { count }),
    tableLabel: t("My games"),
    gameColumn: t("Game"),
    playsColumn: t("Plays"),
    playersColumn: t("Players"),
    dayByDayColumn: t("Day by day"),
    changeColumn: tc("column", "Change"),
    /** The strip's label while genex.games has no daily stats: the plays in total. */
    inTotal: t("In total"),
    unavailable: t("Daily stats arrive with the next genex.games update. Until then, your games’ plays in total."),
    failed: t("Couldn’t load your stats."),
    signedOut: t("Sign in to Genex to see your game stats."),
    backToProfile: t("Profile"),
  },
  /** Play's Top creators row, at the top of Games. */
  creators: {
    title: t("Top creators"),
    /** Beside the title: the rolling 30 days the ranking covers. */
    period: t("this month"),
    arrows: { previous: t("Previous top creators"), next: t("Next top creators") },
    line: (games: number, hours: string) =>
      t("{games, plural, one {# game} other {# games}} · {hours} h", { games, hours }),
  },
  modes: { label: t("Mode"), play: tc("section", "Play"), create: tc("section", "Create") },
  recent: t("Recent"),
  page: tc("section", "Play"),
  shelvesLabel: t("Shelves"),
  shelves: {
    [PlayShelf.Games]: t("Games"),
    [PlayShelf.Tools]: t("Tools"),
    [PlayShelf.Assets]: t("Assets"),
  } satisfies Record<PlayShelf, string>,
  categoriesLabel: t("Categories"),
  categories: {
    [PlayCategory.Featured]: t("Featured"),
    [PlayCategory.Arcade]: t("Arcade"),
    [PlayCategory.Shooter]: t("Shooter"),
    [PlayCategory.Racing]: t("Racing"),
    [PlayCategory.Sports]: t("Sports"),
    [PlayCategory.Survival]: t("Survival"),
    [PlayCategory.Exploration]: t("Exploration"),
    [PlayCategory.Multiplayer]: t("Multiplayer"),
    [PlayCategory.Fighting]: t("Fighting"),
    [PlayCategory.Tools]: t("All"),
    [PlayCategory.Physics]: t("Physics"),
    [PlayCategory.Terrain]: t("Terrain"),
    [PlayCategory.Lighting]: t("Lighting"),
    [PlayCategory.Vfx]: t("VFX"),
    [PlayCategory.Assets]: t("All"),
  } satisfies Record<PlayCategory, string>,
  search: (things: FeedThings) =>
    t(
      "{things, select, games {Search games} tools {Search tools} assets {Search assets} 3d {Search 3D assets} image {Search images} sound {Search sounds} video {Search videos} other {Search}}",
      { things },
    ),
  searchLabel: t("Search Play"),
  play: (title: string) => t("Play {title}", { title }),
  by: (author: string) => t("By {author}", { author }),
  plays: (count: string) => t("{count} plays", { count }),
  online: (count: number) => t("{count} playing now", { count }),
  /** The top row's one control over the cover clips: its name, and its tooltip while paused. */
  clips: { pause: t("Pause previews"), play: t("Play previews") },
  remix: t("Remix"),
  remixing: t("Remixing…"),
  remixLabel: (title: string) => t("Remix {title}", { title }),
  remixFailed: t("Couldn’t make a copy of that game."),
  /** Why Remix made nothing, when Genex's answer named a reason. */
  remixRefused: {
    [PlayRemixRefusal.NoProject]: t("Its creator hasn’t shared this game’s project yet, so it can’t be remixed."),
  } satisfies Record<PlayRemixRefusal, string>,
  /** Create while a remix is made (`RemixLayer`): the step bar's names, the line under the loader. */
  making: {
    steps: {
      [RemixStep.Copy]: t("Files"),
      [RemixStep.Models]: t("Models"),
      [RemixStep.Packages]: t("Packages"),
      [RemixStep.Build]: t("Build"),
    } satisfies Record<RemixStep, string>,
    line: {
      [RemixStep.Copy]: t("Copying files"),
      [RemixStep.Models]: t("Downloading models"),
      [RemixStep.Packages]: t("Installing packages"),
      [RemixStep.Build]: t("Building the game"),
    } satisfies Record<RemixStep, string>,
    measured: (line: string, bytes: string) => `${line} · ${bytes}`,
    megabytes: (done: number) => t("{done} MB", { done }),
    megabytesOf: (done: number, total: number) => t("{done} of {total} MB", { done, total }),
    progress: t("Remix progress"),
    row: t("Making your remix"),
    chat: (title: string) => t("Remixing {title}", { title }),
    /** A remix finished while the person was elsewhere: its game is in the sidebar. */
    ready: (title: string) => t("{title} is ready", { title }),
  },
  loading: (things: FeedThings) =>
    t(
      "{things, select, games {Loading games…} tools {Loading tools…} assets {Loading assets…} 3d {Loading 3D assets…} image {Loading images…} sound {Loading sounds…} video {Loading videos…} other {Loading…}}",
      { things },
    ),
  loadingMore: t("Loading more…"),
  failed: (things: FeedThings) =>
    t(
      "{things, select, games {Couldn’t load games. Check your connection and try again.} tools {Couldn’t load tools. Check your connection and try again.} assets {Couldn’t load assets. Check your connection and try again.} 3d {Couldn’t load 3D assets. Check your connection and try again.} image {Couldn’t load images. Check your connection and try again.} sound {Couldn’t load sounds. Check your connection and try again.} video {Couldn’t load videos. Check your connection and try again.} other {Couldn’t load this. Check your connection and try again.}}",
      { things },
    ),
  retry: t("Try again"),
  empty: (things: FeedThings) =>
    t(
      "{things, select, games {No games here yet.} tools {No tools here yet.} assets {No assets here yet.} 3d {No 3D assets here yet.} image {No images here yet.} sound {No sounds here yet.} video {No videos here yet.} other {Nothing here yet.}}",
      { things },
    ),
  noMatches: (query: string, things: FeedThings) =>
    t(
      "{things, select, games {No games match “{query}”.} tools {No tools match “{query}”.} assets {No assets match “{query}”.} 3d {No 3D assets match “{query}”.} image {No images match “{query}”.} sound {No sounds match “{query}”.} video {No videos match “{query}”.} other {Nothing matches “{query}”.}}",
      { things, query },
    ),
  moreFailed: (things: FeedThings) =>
    t(
      "{things, select, games {Couldn’t load more games.} tools {Couldn’t load more tools.} assets {Couldn’t load more assets.} 3d {Couldn’t load more 3D assets.} image {Couldn’t load more images.} sound {Couldn’t load more sounds.} video {Couldn’t load more videos.} other {Couldn’t load more.}}",
      { things },
    ),
  /** No network: what the dashboard, its search and the viewer say, each coming back by itself. */
  offline: {
    chip: t("Offline"),
    title: t("You’re offline"),
    shelf: (shelf: PlayShelf) =>
      t(
        "{shelf, select, games {Games load as soon as you’re back online.} tools {Tools load as soon as you’re back online.} assets {Assets load as soon as you’re back online.} other {This loads as soon as you’re back online.}}",
        { shelf },
      ),
    friends: t("Friends load as soon as you’re back online."),
    search: t("Search works again as soon as you’re back online."),
    profile: t("This profile loads as soon as you’re back online."),
    more: (things: FeedThings) =>
      t(
        "{things, select, games {More games load when you’re back online.} tools {More tools load when you’re back online.} assets {More assets load when you’re back online.} 3d {More 3D assets load when you’re back online.} image {More images load when you’re back online.} sound {More sounds load when you’re back online.} video {More videos load when you’re back online.} other {More loads when you’re back online.}}",
        { things },
      ),
    game: (title: string) => t("{title} opens as soon as you’re back online.", { title }),
  },
  viewer: {
    loading: (title: string) => t("Loading {title}…", { title }),
    failedTitle: (title: string) => t("Couldn’t load {title}", { title }),
    failedText: t("Check your connection, then try again."),
    retry: t("Try again"),
    back: t("Back to Play"),
    /** The game's Store, opened in its place from the bar: back to the game hidden under it. */
    backToGame: t("Back to game"),
  },
  /** The viewer's header across the window's top. */
  bar: {
    label: (title: string) => t("{title}: game controls", { title }),
    back: t("Back to Play"),
    like: t("Like"),
    likes: (count: string) => t("Like, {count} likes", { count }),
    share: t("Share"),
    invite: t("Invite a friend"),
    remix: t("Remix"),
    /** The door to the game's Store, for a game that sells items (the web's game bar has the same). */
    store: t("Store"),
    fullScreen: t("Full screen"),
    exit: t("Exit"),
    playing: (count: number) => t("{count} playing", { count }),
    plays: (count: string) => t("{count} plays", { count }),
    notes: {
      [PlayNote.Copied]: t("Link copied"),
      [PlayNote.InviteCopied]: t("Invite link copied"),
      [PlayNote.SignIn]: t("Sign in to Genex to like games"),
      [PlayNote.LikeFailed]: t("Couldn’t save your like"),
      [PlayNote.MicBlocked]: t("Allow the mic in Settings"),
      [PlayNote.MicMissing]: t("No microphone"),
      [PlayNote.MicFailed]: t("Mic didn’t start"),
    } satisfies Record<PlayNote, string>,
    micOn: t("Mute microphone"),
    micOff: t("Turn on microphone"),
    /** Worn by the mic while the game is in voice chat and nobody hears the person yet. */
    micWaiting: t("Turn on mic"),
    micDevices: t("Choose microphone"),
    guest: t("Save your progress with a Genex account"),
    install: t("Sign in"),
    dismissGuest: t("Close"),
    /** The Comments button's name while it shows no count (the icon alone). */
    comments: t("Comments"),
    commentsCount: (count: string) => t("Comments, {count}", { count }),
  },
  /** The viewer's Comments, over the dimmed game. */
  comments: {
    title: (count: number): string => t("{count, plural, =0 {Comments} one {# Comment} other {# Comments}}", { count }),
    close: t("Close"),
    none: (title: string) => t("No comments on {title} yet", { title }),
    failed: t("Couldn’t load the comments"),
    retry: t("Try again"),
    signIn: (title: string) => t("Sign in to comment on {title}", { title }),
    signInAction: t("Sign in"),
    field: t("Add a comment"),
    post: t("Post"),
    postFailed: t("Couldn’t post your comment"),
    delete: t("Delete"),
    deleteLabel: t("Delete your comment"),
    deleteFailed: t("Couldn’t delete your comment"),
    /** How long ago a comment was written, its units spelled out. */
    ago: (minutes: number): string => commentAgo(minutes),
  },
  /** A game's coin purchase, over the dimmed game. Amounts arrive written (`1,240 coin`). */
  purchase: {
    close: t("Close"),
    price: t("Price"),
    balance: t("Your balance"),
    /** Read between the balance and what it comes to, in place of the arrow. */
    afterPaying: t("after paying"),
    coin: (amount: string) => t("{amount} Nex", { amount }),
    quantity: (count: string) => `× ${count}`,
    cancel: t("Cancel"),
    pay: (amount: string) => t("Pay {amount}", { amount }),
    /** Pay with no price read: never pressable. */
    payBare: t("Pay"),
    paying: t("Paying…"),
    paid: t("Paid"),
    receipt: (game: string) => t("{game} has your receipt.", { game }),
    back: t("Back to game"),
    moreNeeded: (amount: string) => t("{amount} more needed", { amount }),
    getCoin: t("Get Nex"),
    getCoinNote: t("Opens genex.games. Pay comes back once the Nex lands."),
    /** genex.games already ended the purchase for want of coin: it cannot come back here. */
    overNote: t("Try again in the game once the Nex lands."),
    review: t("Review"),
    coinArrived: t("Your Nex arrived. Review the purchase, then pay."),
    signedOutTitle: t("Sign in to buy things in games"),
    signedOutBody: t("Nex lives in your Genex account. Sign in once, then pay here."),
    signIn: t("Sign in to Genex"),
    signInNote: t("Opens your browser. You’ll come back here to pay."),
    signedInTitle: t("You’re signed in"),
    signedInBody: t("Review the purchase, then pay."),
    pendingTitle: t("Still checking the payment"),
    pendingBody: (game: string) =>
      t("Genex hasn’t confirmed it yet. {game} finishes the purchase once it does. You won’t be charged twice.", {
        game,
      }),
    /** How a purchase that ended unpaid (or refunded) reads: only a refusal may say it was refused. */
    failed: {
      [PurchaseProblem.Expired]: {
        title: t("This purchase timed out"),
        body: t("Try again in the game. No Nex was reserved or charged."),
      },
      [PurchaseProblem.Canceled]: {
        title: t("This purchase was canceled"),
        body: t("Try again in the game. No Nex was charged."),
      },
      [PurchaseProblem.Refused]: {
        title: t("This purchase didn’t go through"),
        body: t("Try again in the game. No Nex was charged."),
      },
      /** Paid, then given back: the coin was charged, so never "No coin was charged". */
      [PurchaseProblem.Refunded]: {
        title: t("This purchase was refunded"),
        body: t("Try again in the game. The Nex went back to your balance."),
      },
    } satisfies Record<PurchaseProblem, { title: string; body: string }>,
  },
  promo: {
    label: t("Genex account"),
    eyebrow: t("Genex account"),
    title: t("Put your game on Play"),
    publish: t("Publish in one click"),
    multiplayer: t("Make it multiplayer"),
    tools: t("Every game dev tool"),
    learn: t("Learn"),
    learnLabel: t("Learn about Genex"),
    linkCopied: t("Link copied"),
    signIn: t("Sign in"),
    signInLabel: t("Sign in to Genex in your browser"),
    dismiss: t("Close"),
  },
} as const;

/**
 * A game's Store section, its items' purchase sheet and the profile's item shelf (`play/GameStore.tsx`,
 * `play/ItemSheet.tsx`, `play/ItemShelf.tsx`; marketplace screens 01–06). Money is coin here, and only
 * here (P24); the words match genex.games' own store.
 */
export const PLAY_STORE_WORDS = {
  title: t("Store"),
  storeTab: t("Store"),
  myItemsTab: t("My items"),
  /** The Store / My items toggle, read aloud. */
  tabsLabel: t("Store and my items"),
  free: t("Free"),
  owned: t("Owned"),
  worksHere: t("Works here"),
  notHere: t("Not in this game"),
  left: (count: number) => t("{count, number} left", { count }),
  /** A shared item's badge: "4 games". */
  games: (count: number) => t("{count, plural, one {# game} other {# games}}", { count }),
  /** No design screen: My items while signed out, and with nothing owned yet (the website's words). */
  signInForItems: t("Sign in to see the items you own."),
  noItems: t("Items you own show up here."),
  itemsFailed: t("Your items couldn’t load."),
  // The purchase sheet (screens 03–05).
  dragToTurn: t("Drag to turn"),
  worksIn: (count: number) => t("{count, plural, one {Works in # game} other {Works in # games}}", { count }),
  price: t("Price"),
  balanceAfter: (now: string, after: string) => t("Balance {now} → {after}", { now, after }),
  balance: (amount: string) => t("Balance {amount}", { amount }),
  short: (have: string, more: string) => t("You have {have} · {more} more needed", { have, more }),
  /** Under a short balance, when part of the coin is earned coin still on hold (web and desktop say the same). */
  held: (coins: string, date: string) => t("{coins} of your Nex is on hold until {date}.", { coins, date }),
  pay: (amount: string) => t("Pay {amount}", { amount }),
  get: t("Get"),
  yours: t("It's yours. Find it under Store › My items in every game it works in."),
  done: t("Done"),
  close: t("Close"),
  more: t("More"),
  /** genex.games already ended the purchase for want of coin: it is started again from the card. */
  overNote: t("Try again once the Nex lands."),
  pendingBody: t("Genex hasn’t confirmed it yet. It shows under My items once it does. You won’t be charged twice."),
  /** How a purchase from the page that ended unpaid (or refunded) reads; its titles are the in-game sheet's. */
  failedBody: {
    [PurchaseProblem.Expired]: t("No Nex was reserved or charged."),
    [PurchaseProblem.Canceled]: t("No Nex was charged."),
    [PurchaseProblem.Refused]: t("No Nex was charged."),
    [PurchaseProblem.Refunded]: t("The Nex went back to your balance."),
  } satisfies Record<PurchaseProblem, string>,
  /** The item is no longer sold on this page. */
  goneTitle: t("This item isn’t sold here anymore"),
  goneBody: t("It may be back later. No Nex was charged."),
  // The item report (P22), from the sheet's ⋯ menu.
  reportItem: t("Report item…"),
  reportTitle: t("Report item"),
  reasons: {
    /** A copy of someone else's work, not the verb. */
    [ItemReportReason.Copy]: tc("item report", "Copy"),
    [ItemReportReason.Broken]: t("Doesn't work"),
    [ItemReportReason.Inappropriate]: t("Inappropriate"),
    [ItemReportReason.Scam]: t("Scam"),
  } satisfies Record<ItemReportReason, string>,
  reasonsLabel: t("Why are you reporting it?"),
  reportMessage: t("Anything else we should know? (optional)"),
  sendReport: t("Send report"),
  reportSent: t("Report sent"),
  reportFailed: t("The report didn’t send. Try again in a moment."),
  reportLimited: t("Too many reports for now. Try again later."),
  back: t("Back"),
  // The profile's item shelf (screen 06).
  shelfLabel: t("Items"),
  itemTag: t("Item"),
  getIn: (game: string) => t("Get in {game}", { game }),
} as const;

/**
 * Create › Items (`panels/items/`; marketplace screens 07–08) and the chat's Listing draft card
 * (`chat/ListingDraftCard.tsx`; screen 09). Money is coin here (P24); every number is genex.games'
 * own. Lines marked "no design copy" have no screen of their own.
 */
/** The Nex sheet (`play/NexSheet.tsx`): what Nex is, and how it is got, spent and earned. */
export const NEX_WORDS = {
  title: t("Nex"),
  lead: t("Nex is the money of games on Genex. Players buy it, then spend it on items inside any game."),
  yours: t("Your Nex"),
  get: t("Get"),
  getBody: t("Buy Nex in packs. One balance works in every game."),
  spend: t("Spend"),
  spendBody: t("Buy items in a game’s store: characters, skins, upgrades. What you buy stays yours."),
  earn: t("Earn"),
  earnBody: t("Players pay Nex for your items. After a short hold, you spend it like any Nex."),
  credits: t("Credits are separate: they pay for making games. Nex pays for what games sell."),
  getNex: t("Get Nex"),
} as const;

export const ITEMS_WORDS = {
  title: t("Items"),
  tabsLabel: t("Browse and selling"),
  browse: t("Browse"),
  selling: t("Selling"),
  // Browse (screen 07).
  /** The design's intro, for an API that does not name the selling game's share. */
  intro: t("Items other creators made. Free to add to your game, and you get 15% of every sale in it."),
  /** The intro with the selling game's share as genex.games configures it ("15%"). */
  introShare: (share: string) =>
    t("Items other creators made. Free to add to your game, and you get {share} of every sale in it.", { share }),
  search: t("Search items"),
  inGames: (count: number) => t("{count, plural, one {in # game} other {in # games}}", { count }),
  by: (name: string) => t("By {name}", { name }),
  playersPay: t("Players pay"),
  youGet: t("You get per sale"),
  /** "You get per sale" with the selling game's share genex.games configures ("15%"). */
  youGetShare: (share: string) => t("You get per sale ({share})", { share }),
  /** The selling game's share of one sale, as genex.games computed it: "+1,200". */
  gain: (amount: string) => t("+{amount}", { amount }),
  /** The label over the game picker: which of the account's games the item is for. */
  forGame: t("For"),
  chooseGame: t("Choose a game"),
  addToGame: t("Add to game"),
  agentPutsIt: t("Your agent puts it in the game."),
  /** An item already in the chosen game (Q5: players see it once the game publishes a build). */
  addedToGame: t("Added to your game"),
  seenAfterPublish: t("Players see it after your next publish."),
  /** An item added and sold there: a build that has it went live. */
  onSaleInGame: t("On sale in your game"),
  buyableNow: t("Players can buy it there now."),
  removeFromGame: t("Remove from game"),
  removeTitle: (item: string, game: string) => t("Remove {item} from {game}?", { item, game }),
  removeBody: t("It leaves the game’s Store. Players who own it keep it."),
  remove: t("Remove"),
  /** No design copy: none of the account's games on this computer is on Genex yet. */
  noGame: t("Publish a game to Genex first, then add items to it."),
  /** No design copy: a search that found nothing, and Browse with nothing shared yet. */
  noMatch: t("No items match."),
  noneShared: t("No one has shared an item yet."),
  more: t("Show more"),
  // Selling (screen 08).
  readyToUse: t("Ready to use"),
  onHold: (days: number) => t("{days, plural, one {On hold for # day} other {On hold for # days}}", { days }),
  /** The strip's own way to the Nex sheet; its figures open it too. */
  whatIsNex: t("What is Nex?"),
  item: t("Item"),
  price: t("Price"),
  sold: t("Sold"),
  earned: t("Earned"),
  gameLine: (game: string, games: string) => t("{game} · {games}", { game, games }),
  /** Selling's draft row: one press puts it on sale (P12). */
  draftPutOnSale: t("Draft, put on sale"),
  underReview: t("Report under review"),
  offSale: t("Off sale"),
  status: t("Status"),
  actionsColumn: t("Actions"),
  actions: (name: string) => t("Actions for {name}", { name }),
  putOnSale: t("Put on sale"),
  takeOffSale: t("Take off sale"),
  shared: t("Other games can use it"),
  askAgent: t("Ask the agent to change it"),
  /** No design copy: Selling with nothing made yet. */
  noItems: t("Items you make show up here. Ask your game’s agent for one."),
  // The Listing draft card (screen 09): in the chat its composer below takes a change; on Shop, a pencil.
  askBelow: t("Ask for changes below"),
  askForChanges: t("Ask for changes"),
  /** No design copy: the card once its item is on sale. */
  onSale: t("On sale"),
  listingLabel: (name: string) => t("Listing draft: {name}", { name }),
  /** A draft, here or on Genex: Studio puts it on sale when the game is published. */
  draftStatus: t("Draft · goes on sale when you publish"),
  /** The same in a word, on a Shop tile's picture. */
  draft: t("Draft"),
  /** Above the Shop tab's tiles. */
  draftsNote: t("Drafts go on sale when you publish."),
  /** No design copy: after the publish, a draft changed since its approval stays a draft. */
  stayedDraft: t("It changed since you approved it, so it stayed a draft."),
  /** No design copy: Genex got a version of the item this card never showed (an edit outside Studio). */
  unseenVersion: t("This item changed after this card. See it in Items › Selling before you put it on sale."),
  /** No design copy: the agent removed the local draft. */
  localRemoved: t("Removed from this game"),
  /** No design copy: main could not run the change on the draft. */
  localFailed: t("Genex couldn’t change this draft. Try again."),
  // Every read.
  failed: t("Items couldn’t load."),
  /** No design copy: the app's Genex account is signed out, or genex.games' store is off. */
  signedOut: t("Sign in to Genex to see items."),
  storeOff: t("The item store is off right now."),
  tryAgain: t("Try again"),
} as const;

/** Why genex.games refused a press on an item, in the person's words; any other reads as `unknown`. */
export const ITEM_REFUSAL_WORDS: Partial<Record<StoreRefusal, string>> & { unknown: string } = {
  // Put on sale reads the picture from Genex's own storage (D62): the fix is always an upload.
  [StoreRefusal.PictureMissing]: t("It needs a picture first. Ask the agent to upload the picture."),
  [StoreRefusal.PictureInvalid]: t("Genex couldn’t use its picture. Ask the agent to upload the picture."),
  [StoreRefusal.ModelInvalid]: t("Genex couldn’t use its 3D model. Ask the agent to fix it."),
  [StoreRefusal.PackageInvalid]: t("Genex couldn’t use its files. Ask the agent to fix them."),
  [StoreRefusal.PackageTooLarge]: t("Its files are too large. Ask the agent to make them smaller."),
  [StoreRefusal.PriceOffGrid]: t("That price isn’t one the store takes. Ask the agent to pick another."),
  [StoreRefusal.NameRefused]: t("Genex can’t sell it under that name. Ask the agent for another."),
  [StoreRefusal.DescriptionRefused]: t("Genex can’t sell it with that description. Ask the agent to change it."),
  [StoreRefusal.NotDurable]: t("Only an item players keep can be used in other games."),
  [StoreRefusal.TakenDown]: t("Genex took this item off sale."),
  [StoreRefusal.TooManySkus]: t("This game sells as many items as it can."),
  [StoreRefusal.PublishRateLimited]: t("You’ve put a lot on sale today. Try again tomorrow."),
  [StoreRefusal.Unauthorized]: t("Sign in to Genex first."),
  [StoreRefusal.ProjectNotFound]: t("Only the item’s maker can change it."),
  [StoreRefusal.NotShareable]: t("Its maker doesn’t let other games use it anymore."),
  [StoreRefusal.ItemOffSale]: t("It isn’t on sale anymore."),
  [StoreRefusal.HomeGame]: t("It’s already this game’s own item."),
  [StoreRefusal.NotFound]: t("The item store is off right now."),
  unknown: t("Genex couldn’t do that. Try again in a moment."),
};

/** The words for a refusal. */
export const itemRefusalWords = (code: StoreRefusal): string => ITEM_REFUSAL_WORDS[code] ?? ITEM_REFUSAL_WORDS.unknown;

/** A Play card's ⋯ menu and its dialogs: genex.games' card menu, in the app (`play/card-menu/`). */
export const PLAY_CARD_MENU_WORDS = {
  trigger: t("Game options"),
  adminLabel: t("Admin"),
  item: {
    [PlayCardAction.CopyLink]: t("Copy link"),
    [PlayCardAction.Remixing]: t("Turn off remixing"),
    [PlayCardAction.Rename]: t("Rename"),
    [PlayCardAction.Link]: t("Change link"),
    [PlayCardAction.Cover]: t("Change cover"),
    [PlayCardAction.Mobile]: t("Mobile support"),
    [PlayCardAction.Tags]: t("Edit tags"),
    [PlayCardAction.Unpublish]: t("Unpublish"),
    [PlayCardAction.Delete]: t("Delete game"),
  } satisfies Record<PlayCardAction, string>,
  allowRemixing: t("Allow remixing"),
  mobileState: {
    [PlayMobileSupport.DesktopOnly]: t("Desktop only"),
    [PlayMobileSupport.Supported]: t("Works on phones"),
  } satisfies Record<PlayMobileSupport, string>,
  mobileAutoFlagged: t("Auto · desktop only"),
  linkCopied: t("Link copied"),
  copyFailed: t("Couldn’t copy the link."),
  cancel: t("Cancel"),
  save: t("Save"),
  saving: t("Saving…"),
  tryAgain: t("Try again"),
  mobile: {
    title: (title: string) => t("Mobile support for {title}", { title }),
    sub: t("What phone players get. Your choice wins over the automatic check."),
    label: t("Mobile support"),
    auto: tc("mobile support", "Auto"),
    autoHint: t("Genex decides from crash reports"),
    hint: {
      [PlayMobileSupport.DesktopOnly]: t("Phone players see a Desktop tag first"),
      [PlayMobileSupport.Supported]: t("Never marked desktop only"),
    } satisfies Record<PlayMobileSupport, string>,
    autoFlagged: t("Auto would choose Desktop only: crash reports flagged it."),
    autoClear: t("Auto would let phones play: no crash reports flagged it."),
    done: t("Mobile support saved"),
    failed: t("Couldn’t save mobile support."),
  },
  tags: {
    title: (title: string) => t("Tags for {title}", { title }),
    shelfLabel: t("Shelf"),
    tagsLabel: t("Tags"),
    shelf: {
      [PlayShelf.Games]: t("Games"),
      [PlayShelf.Tools]: t("Tools"),
      [PlayShelf.Assets]: t("Assets"),
    } satisfies Record<PlayShelf, string>,
    noTags: t("This shelf has no tags."),
    shows: (shelf: string, tags: readonly string[]) =>
      tags.length > 0
        ? t("Shows on Play under {shelf} · {tags}.", { shelf, tags: tags.join(", ") })
        : t("Shows on Play under {shelf}.", { shelf }),
    limit: (max: number) => t("Up to {max} tags.", { max }),
    save: t("Save tags"),
    done: t("Tags saved"),
    failed: t("Couldn’t save the tags."),
  },
  unpublish: {
    title: (title: string) => t("Unpublish {title}?", { title }),
    body: t(
      "It leaves Play and genex.games and goes back to drafts. The direct link still works, and plays and likes stay if it’s published again.",
    ),
    confirm: t("Unpublish"),
    working: t("Unpublishing…"),
    done: (title: string) => t("{title} is unpublished", { title }),
    failed: t("Couldn’t unpublish the game."),
  },
  remove: {
    title: (title: string) => t("Delete {title}?", { title }),
    body: t("Removes the game, its page and its source for good. This can’t be undone."),
    confirm: t("Delete game"),
    working: t("Deleting…"),
    done: (title: string) => t("{title} is deleted", { title }),
    failed: t("Couldn’t delete the game."),
  },
  rename: {
    title: (title: string) => t("Rename {title}", { title }),
    sub: t("The name players see on Play and genex.games."),
    label: t("Name"),
    noName: t("Give the game a name with a letter or a number in it."),
    done: (title: string) => t("Renamed to {title}", { title }),
    failed: t("Couldn’t rename the game."),
  },
  link: {
    title: (title: string) => t("Change the link of {title}", { title }),
    sub: t("The old link will still open the game, for players who already have it too."),
    label: t("New link"),
    empty: t("Give the link a letter or a number."),
    done: (address: string) => t("The game is at {address} now", { address }),
    failed: t("Couldn’t change the link."),
    kept: {
      [PlayChangeOutcome.LinkTaken]: t("Another game already has this link. Try another one."),
      [PlayChangeOutcome.LinkLimit]: t("This game has used all its link changes."),
      [PlayChangeOutcome.LinkReserved]: t("Genex keeps this link for itself. Try another one."),
      [PlayChangeOutcome.LinkBusy]: t("Genex is still publishing this game. Change the link once it's done."),
    },
  },
  players: {
    label: t("Players"),
    failed: t("Couldn’t change Players."),
  },
  remixing: {
    on: (title: string) => t("Anyone can remix {title} now", { title }),
    off: (title: string) => t("Only you can remix {title} now", { title }),
    ownRepo: t("Its source is your own repository: run genex make-remixable in the game’s folder to allow remixing."),
    failed: t("Couldn’t change remixing."),
  },
  cover: {
    title: (title: string) => t("Cover for {title}", { title }),
    sub: t("Pick a picture. It’s cropped to 16:9, like every cover."),
    choose: t("Choose a picture"),
    another: t("Choose another"),
    current: t("Current cover"),
    picked: t("New cover"),
    save: t("Use this cover"),
    done: t("Cover changed"),
    unreadable: t("That file isn’t a picture the app can read."),
    tooLarge: t("Pick a picture under 40 MB."),
    refusal: {
      [PlayCoverRefusal.Outranked]: t("Genex kept the current cover: it outranks an uploaded one."),
      [PlayCoverRefusal.TooDark]: t("That picture is too dark for a cover. Try a brighter one."),
      [PlayCoverRefusal.Flat]: t("That picture is nearly one colour. Try one with more in it."),
      [PlayCoverRefusal.Invalid]: t("Genex couldn’t read that picture. Try another."),
    } satisfies Record<PlayCoverRefusal, string>,
    failed: t("Couldn’t change the cover."),
  },
} as const;

/** Play's words that name the computer a game installs on and plays on. */
export interface NativeHereWords {
  installedHere: string;
  readyHere: (size: string) => string;
  /** The page's title for a game with a build for this kind of computer, but none it can play. */
  notForHere: string;
  noSpace: (free: string) => string;
  unsupported: string;
  notOffered: string;
  notInstalled: string;
  startFailed: string;
  removeFrom: string;
  removed: (title: string) => string;
  /** A game from Play, installed while the person was elsewhere. */
  readyToPlay: string;
}

const MAC_HERE: NativeHereWords = {
  installedHere: t("On this Mac"),
  readyHere: (size) => t("On this Mac · {size}", { size }),
  notForHere: t("Not for this Mac"),
  noSpace: (free) => t("Couldn’t install: free {size} on this Mac and try again.", { size: free }),
  unsupported: t("Couldn’t install: this game doesn’t run on this Mac."),
  notOffered: t("There’s no version of this game for this Mac."),
  notInstalled: t("It isn’t on this Mac any more. Install it again."),
  startFailed: t("It couldn’t start on this Mac."),
  removeFrom: t("Remove from this Mac"),
  removed: (title) => t("{title} is removed from this Mac. Its saves stay.", { title }),
  readyToPlay: t("Ready to play on this Mac."),
};

const COMPUTER_HERE: NativeHereWords = {
  installedHere: t("On this computer"),
  readyHere: (size) => t("On this computer · {size}", { size }),
  notForHere: t("Not for this computer"),
  noSpace: (free) => t("Couldn’t install: free {size} on this computer and try again.", { size: free }),
  unsupported: t("Couldn’t install: this game doesn’t run on this computer."),
  notOffered: t("There’s no version of this game for this computer."),
  notInstalled: t("It isn’t on this computer any more. Install it again."),
  startFailed: t("It couldn’t start on this computer."),
  removeFrom: t("Remove from this computer"),
  removed: (title) => t("{title} is removed from this computer. Its saves stay.", { title }),
  readyToPlay: t("Ready to play on this computer."),
};

/** The spellings of the Mac a platform may come in (`process.platform`'s, the builds'), or none yet. */
const MAC_SPELLINGS: ReadonlySet<string> = new Set(["", StudioPlatform.Mac, NativePlatform.Mac]);

/**
 * Play's words naming the computer on `platform`, in `process.platform`'s spelling
 * (`renderer/platform.ts`) or the builds' (an install's): "this Mac", the Mac's until main has
 * said, and "this computer" anywhere else.
 */
export function nativeHereWords(platform: string): NativeHereWords {
  return MAC_SPELLINGS.has(platform) ? MAC_HERE : COMPUTER_HERE;
}

/** Why an install failed, one sentence each: no space says how much to free, and some name this computer. */
const INSTALL_FAILED: Readonly<Record<InstallFailure, (free: string, here: NativeHereWords) => string>> = {
  [InstallFailure.NoSpace]: (free: string, here: NativeHereWords) => here.noSpace(free),
  [InstallFailure.Checksum]: () => t("Couldn’t install: the download was damaged. Try again."),
  [InstallFailure.Network]: () => t("Couldn’t install: the download stopped. Check your connection and try again."),
  [InstallFailure.Stalled]: () => t("Couldn’t install: the download stopped. Check your connection and try again."),
  [InstallFailure.UnsafeArchive]: () => t("Couldn’t install: this game’s files aren’t safe to open."),
  [InstallFailure.Unsigned]: () => t("Couldn’t install: this game isn’t signed."),
  [InstallFailure.TooLarge]: () => t("Couldn’t install: this game is larger than it says."),
  [InstallFailure.UnsupportedOs]: (_free: string, here: NativeHereWords) => here.unsupported,
  [InstallFailure.NeedsRosetta]: () => t("Couldn’t install: this game needs Rosetta to run on this Mac."),
  [InstallFailure.EntryMissing]: () => t("Couldn’t install: the download doesn’t hold the game."),
  [InstallFailure.NotOffered]: (_free: string, here: NativeHereWords) => here.notOffered,
  [InstallFailure.Failed]: () => t("Couldn’t install. Try again."),
};

/** Why a game didn't start, one sentence each: some name this computer. */
const LAUNCH_FAILED: Readonly<Record<LaunchFailure, (here: NativeHereWords) => string>> = {
  [LaunchFailure.NotInstalled]: (here: NativeHereWords) => here.notInstalled,
  [LaunchFailure.StartFailed]: (here: NativeHereWords) => here.startFailed,
  [LaunchFailure.QuitEarly]: () => t("It closed before it opened. Try again."),
};

/** A native game: its card's badge, its own page and its card menu's local items (`play/GamePage.tsx`). */
export const NATIVE_WORDS = {
  platform: {
    [NativePlatform.Mac]: "Mac",
    [NativePlatform.Windows]: "Windows",
    [NativePlatform.Linux]: "Linux",
  } satisfies Record<NativePlatform, string>,
  /** The systems a game was built for, read aloud and on its tile: "Mac and Windows". */
  platforms: (names: readonly string[]) => formatList(names),
  /** What is left of a download: "2 min left", "under a minute left". */
  left: (etaMs: number | null) => {
    if (etaMs === null) return "";
    const minutes = Math.ceil(etaMs / MINUTE_MS);
    return minutes <= 1 ? t("under a minute left") : t("{minutes} min left", { minutes });
  },
  downloading: (percent: number, left: string) => (left ? `${percent}% · ${left}` : `${percent}%`),
  update: (size: string) => t("Update · {size}", { size }),
  /** A profile's card for a game this computer has no build of. */
  onlyOn: (platform: string) => t("Only on {platform}", { platform }),
  // The game page.
  /** "4 plays · 1 like · Updated 33 minutes ago": each count as `formatCount` wrote it, its plural by the number. */
  stats: (plays: { n: number; shown: string }, likes: { n: number; shown: string }, updated: string | null) =>
    [
      t("{n, plural, one {{count} play} other {{count} plays}}", { n: plays.n, count: plays.shown }),
      t("{n, plural, one {{count} like} other {{count} likes}}", { n: likes.n, count: likes.shown }),
      updated ? t("Updated {when}", { when: updated }) : null,
    ]
      .filter(Boolean)
      .join(" · "),
  shots: t("Shots"),
  about: tc("game page", "About"),
  install: t("Install"),
  installLabel: (title: string, size: string) => t("Install {title}, {size}", { title, size }),
  installing: (percent: number) => t("Installing… {percent}%", { percent }),
  installingLabel: (title: string) => t("Installing {title}", { title }),
  waiting: t("Waiting for another install…"),
  checking: t("Checking…"),
  cancel: t("Cancel"),
  play: t("Play"),
  playLabel: (title: string) => t("Play {title}", { title }),
  showGame: t("Show game"),
  quit: t("Quit"),
  opening: t("Opening in its own window…"),
  playingFor: (minutes: number) => t("Playing in its own window · {minutes} min", { minutes }),
  updateAndPlay: t("Update and play"),
  playVersion: (version: string) => t("Play version {version} instead", { version }),
  onlyOnTitle: (platform: string) => t("Only on {platform}", { platform }),
  noVersionFor: (platform: string) => t("There’s no {platform} version of this game yet.", { platform }),
  needsMacOs: (version: string) => t("It needs macOS {version} or later.", { version }),
  cantPlayOn: (platform: string) => t("Can’t play on {platform}", { platform }),
  onlyRunsOn: (platforms: string) => t("Genex can only run it on {platforms}.", { platforms }),
  runsNoGamesOn: (platform: string) => t("Genex can’t run downloaded games on {platform}.", { platform }),
  needsAppleSilicon: t("It needs a Mac with Apple silicon."),
  needsRosetta: t("It needs Rosetta to run on this Mac."),
  otherProcessor: t("It’s made for a different processor."),
  tryAgain: t("Try again"),
  /** Why an install failed, one sentence each; no space says how much to free, on this computer (`here`). */
  installFailed: INSTALL_FAILED,
  launchFailed: LAUNCH_FAILED,
  singlePlayer: t("Single player"),
  multiplayer: t("Multiplayer"),
  /** Engine ids as people say them; another id is shown as it is spelled. */
  engine: { unity: "Unity", godot: "Godot", unreal: "Unreal" } as Readonly<Record<string, string>>,
  /** The game page's facts, each a small label over its value. */
  facts: { runsOn: t("Runs on"), size: t("Size"), players: t("Players"), madeWith: t("Made with") },
  appleSiliconOnly: t("Apple silicon only"),
  failedToLoad: t("Couldn’t load this game."),
  // The card menu's local items.
  removeFailed: t("Couldn’t remove the game. Quit it first if it’s running."),
  /** The viewer bar's pill for a web game's native app: "Mac app", "Mac app 38%", "Play Mac app". */
  app: (platform: string) => t("{platform} app", { platform }),
  appInstalling: (platform: string, percent: number) => t("{platform} app {percent}%", { platform, percent }),
  playApp: (platform: string) => t("Play {platform} app", { platform }),
  installAppLabel: (platform: string, size: string) => t("Install the {platform} app, {size}", { platform, size }),
} as const;

/** The systems' names as one phrase: "Mac and Windows". */
const platformsPhrase = (platforms: readonly NativePlatform[]): string =>
  NATIVE_WORDS.platforms(platforms.map((platform) => NATIVE_WORDS.platform[platform]));

/**
 * What a game's page says in place of Install when nothing installs on this computer (`here`): a
 * title and why, from `whyNotHere`. `platforms` are the systems the game was built for.
 */
export function notHereWords(
  notHere: NotHere,
  platforms: readonly NativePlatform[],
  here: NativePlatform,
): { title: string; line: string } {
  const words = NATIVE_WORDS;
  const notForHere = nativeHereWords(here).notForHere;
  switch (notHere.why) {
    case WhyNotHere.System:
      return {
        title: words.cantPlayOn(words.platform[here]),
        line:
          notHere.elsewhere.length > 0
            ? words.onlyRunsOn(platformsPhrase(notHere.elsewhere))
            : words.runsNoGamesOn(words.platform[here]),
      };
    case WhyNotHere.NoBuild:
      return { title: words.onlyOnTitle(platformsPhrase(platforms)), line: words.noVersionFor(words.platform[here]) };
    case WhyNotHere.OldSystem:
      return { title: notForHere, line: words.needsMacOs(notHere.minOs) };
    case WhyNotHere.AppleSilicon:
      return { title: notForHere, line: words.needsAppleSilicon };
    case WhyNotHere.Rosetta:
      return { title: notForHere, line: words.needsRosetta };
    default:
      return { title: notForHere, line: words.otherProcessor };
  }
}

/** Who took a check, for the sources that played the build. */
export const PLAYED_SOURCE_WORDS: Record<InteractionSource, string> = {
  [InteractionSource.IndependentPlaytester]: t("Independent playtester"),
  [InteractionSource.HandsOnJudge]: t("Judge who played it"),
  [InteractionSource.RouteReplay]: t("Replayed route"),
};

/** What an interaction result rests on: the studio's own check of the game's state, or the player's word. */
export const OBJECTIVE_WORDS: Record<InteractionObjective, string> = {
  [InteractionObjective.StudioVerified]: t("verified by the studio"),
  [InteractionObjective.ModelSaid]: t("the player's word"),
};

/** A chat's judge line (`JudgeLine.tsx`): what leads the question inside it. */
export const CHAT_JUDGE_WORDS = {
  asked: t("Asked:"),
  /** The line when nothing was played (no window free, a goal state it could not take): the reason is inside. */
  notPlayed: t("The judge didn't play"),
  /** Which of the engine's judges played, by the name its plugin gives it. */
  playedAs: (judge: string) => t("Played as the {judge} judge", { judge }),
} as const;

/** The checks under a build's Technical details: each check's state, its group, and a replayed route's words. */
export const CHECK_WORDS = {
  status: {
    passed: t("Passed"),
    failed: t("Failed"),
    unknown: t("Not measured"),
    incomplete: t("Incomplete"),
  } satisfies Record<RunEvidence["status"], string>,
  thisBuild: t("This build"),
  earlierBuilds: t("Earlier builds"),
  reviewer: t("Reviewer"),
  recorded: t("Recorded check"),
  routeTitle: t("Replayed the judge's route"),
  routeHeld: t("The judge's moves were replayed on this build, and the goal held."),
  showAll: t("Show all"),
  showLess: t("Show less"),
} as const;

/**
 * A game linked to an engine whose save points need its project inside the game folder, named by
 * the engine's label: Rewind's note when the project lives elsewhere.
 */
export const ENGINE_GAME_WORDS = {
  /** Rewind's line when the project lives outside the game folder, so its checkpoints never hold it. */
  rewindNote: (engine: string, project: string) =>
    t("Rewind doesn’t undo changes made in {engine}: {project} is outside the game folder.", { engine, project }),
} as const;

/** A game linked to an Unreal project: the Live tab's card and Rewind's note. */
/** Play for a game being made that plays as its own app (an Unreal game): what it says and sends. */
export const GAME_PLAY_WORDS = {
  /** What the person's Play sends the chat when there is no app to play yet: the agent packages and starts it. */
  runTheGame: t("Run the game"),
  packaging: t("The agent is packaging the game. It starts it once the package is ready."),
  unsupported: t("Genex can’t play this game’s app on this computer."),
  noChat: t("Open the game’s chat to have the agent package it."),
} as const;

export const UNREAL_WORDS = {
  /** The Live tab's line under the project's name, in place of the web page. */
  stageStatus: t("Plays in the Unreal editor."),
  open: t("Open in Unreal"),
  opening: t("Opening…"),
  /** The Live card for each step of the game's own project (`stage-status`). */
  stage: {
    getUnreal: t("Unreal Engine 5.8 isn’t on this computer yet."),
    getUnrealButton: t("Get Unreal Engine"),
    /** The card's Play: the game's own app, or the agent asked to run the game (`game-play.ts`). */
    play: t("Play"),
    /** The project isn't open in Unreal: nothing to do, the agent opens it when it builds. */
    notOpen: t("Not open in Unreal"),
    openProjectWhenFree: (project: string) => t("Open {project} once Unreal is free.", { project }),
    /** Unreal has a project open that it can't name. */
    anotherOpen: t("Unreal has another project open."),
    starting: t("Opening in Unreal…"),
    startingHint: t("The first start can take several minutes."),
    ready: t("Ready in Unreal"),
    otherOpen: (other: string) => t("Unreal has {project} open.", { project: other }),
    switchTo: (project: string) => t("Switch to {project}", { project }),
    notAnswering: (project: string) => t("{project} isn’t answering in Unreal.", { project }),
    portBlocked: (project: string) => t("Unreal couldn’t use the port Genex gave {project}.", { project }),
    crashed: (project: string) =>
      t("Unreal crashed. Close its crash report window, then open {project} again.", { project }),
    restart: t("Restart Unreal"),
    quitFirst: (project: string) =>
      t("{project} is open in Unreal. Quit Unreal to set it up; Unreal asks you to save first.", { project }),
    quit: t("Quit Unreal"),
    severalEditors: t("Two Unreal editors are open. Quit the one you want from its own window."),
    /** While a Loop is using Unreal, nothing here quits it: which Loop, and what to do once it ends. */
    busyRun: (game: string) => t("A Loop in {game} is using Unreal.", { game }),
    busyHere: t("This game’s Loop is using Unreal."),
    setUpAfter: (project: string) => t("Set up {project} after it ends.", { project }),
    openAfter: (project: string) => t("Open {project} after it ends.", { project }),
    leaveOpen: t("Genex leaves it open until the Loop ends."),
    choose: (project: string) => t("{project} isn’t where it was. Choose it again in the Unreal panel.", { project }),
    /** A folder holding an Unreal project Genex has no link to yet. */
    chooseFirst: t("Choose this game’s Unreal project in the Unreal panel."),
    panel: t("Open the Unreal panel"),
  },
  /** The plugin page's name and line for the Unreal plugin's editor connection. */
  connection: { title: t("Editor"), text: t("Your open Unreal Editor, where agents build Unreal games.") },
  /** The latest play shot's alt text. */
  playShot: (project: string) => t("{game} in play", { game: project }),
  /** Rewind's line when the project lives outside the game folder, so its checkpoints never hold it. */
  rewindNote: (project: string) => ENGINE_GAME_WORDS.rewindNote(GAME_ENGINE_WORDS.unreal, project),
} as const;

/** The Unity plugin's words in Studio's own UI. */
export const UNITY_WORDS = {
  /** The plugin page's name and line for the Unity plugin's editor connection. */
  connection: { title: t("Editor"), text: t("Your open Unity editor, where agents build Unity games.") },
} as const;

/** The Roblox Studio plugin's words in Studio's own UI. */
export const ROBLOX_WORDS = {
  /** The plugin page's name and line for the Roblox Studio plugin's connection to Studio. */
  connection: { title: "Roblox Studio", text: t("Your open Roblox Studio, where agents build Roblox games.") },
} as const;

// ── Genex account settings and avatars ─────────────────────────────────────────────────────

/** Settings → Genex account: the avatar (generated or a photo) and the name, used everywhere on Genex. */
export const ACCOUNT_WORDS = {
  tab: t("Genex account"),
  avatar: t("Avatar"),
  avatarLabel: t("Avatar"),
  generated: t("Generated"),
  photo: t("Photo"),
  uploadPhoto: t("Upload a photo"),
  replacePhoto: t("Upload another photo"),
  uploading: t("Uploading…"),
  everywhere: t("Changes show in the app and on genex.games right away."),
  styleFailed: t("Couldn’t change your avatar."),
  regenerate: t("Regenerate"),
  regenerateFailed: t("Couldn’t regenerate your avatar."),
  name: t("Name"),
  credits: t("Credits"),
  creditsCount: (count: string) => t("{count} credits", { count }),
  creditsUnlimited: t("Unlimited credits"),
  buyCredits: t("Get credits"),
  buyCreditsLabel: t("Get Genex credits on genex.games"),
  /** Under the balance: what credits pay for, the plugin's name a link to its page. */
  creditsNote: t("For <plugin>Genex plugin</plugin> tools: 3D, animation, textures, music. Optional."),
  creditsPluginLabel: t("Open the Genex plugin page"),
  signOut: t("Sign out"),
  /** Signed out: the one title, the line and the button, nothing under it. */
  signInTitle: t("Sign in to Genex"),
  signInText: t("Make a profile, publish your games, play with friends."),
  signIn: t("Sign in in browser"),
  signInLabel: t("Sign in to Genex in your browser"),
  /** While the sign-in waits in the browser. */
  waiting: t("Waiting for browser…"),
  browserShows: t("Your browser should show"),
  cancel: t("Cancel"),
  offline: t("Changes wait until you’re back online."),
  /** A Pro's nameplate: the moving art behind their name in the sidebar. */
  nameplate: t("Nameplate"),
  newPlate: t("New one"),
  nameplateNote: t("Lights up behind your name in the sidebar when you hover it."),
} as const;

/**
 * The nickname field, in the welcome and in Settings → Genex account: the words genex.games uses
 * for the same field, so both read alike. A reserved handle reads as Taken, the account's own as Free.
 */
export const NICKNAME_WORDS = {
  label: t("Your nickname and profile link"),
  states: {
    [HandleState.Free]: tc("nickname", "Free"),
    [HandleState.Taken]: t("Taken"),
    [HandleState.TooShort]: t("Too short"),
    [HandleState.TooLong]: t("Too long"),
    [HandleState.LatinOnly]: t("Latin only"),
    [HandleState.DashEdge]: t("No dash at the ends"),
  } satisfies Record<Exclude<HandleState, typeof HandleState.Yours | typeof HandleState.Reserved>, string>,
  profileLink: t("Your profile link."),
  try: t("Try"),
  tryLabel: (handle: string) => t("Use {handle}", { handle }),
  length: t("{min} to {max} characters.", { min: HANDLE_LENGTH.min, max: HANDLE_LENGTH.max }),
  letters: t("Letters a–z, digits and dashes."),
  checkFailed: t("Couldn’t check this nickname. Check your connection."),
  tooManyChanges: t("You’ve changed your nickname too often lately. Try again later."),
  saveFailed: t("Couldn’t save your nickname. Try again in a moment."),
  /** Settings → Genex account's row. */
  row: t("Nickname"),
  none: t("None yet"),
  edit: t("Edit"),
  editLabel: t("Edit your nickname"),
} as const;

/** The avatar every Genex account gets, as people meet it: its parts' names and the first-sign-in dialog. */
export const AVATAR_WORDS = {
  welcomeTitle: t("Meet your Genex avatar"),
  welcomeText: t("Nobody else has this one."),
  mixLabel: t("Your mix"),
  continue: t("Continue"),
  welcomeNote: t("You can change it in Settings"),
  /** Under Continue when the welcome asks for the nickname too. */
  welcomeNoteBoth: t("You can change both in Settings"),
  /** After a refused Regenerate in the welcome, beside the reason. */
  tryAgain: t("Try again"),
  bodies: {
    [AvatarBody.Vapor]: t("Vaporwave sun"),
    [AvatarBody.Crt]: t("CRT dither"),
    [AvatarBody.Matrix]: t("Matrix rain"),
    [AvatarBody.Holo]: t("Hologram"),
    [AvatarBody.Circuit]: t("Circuit"),
    [AvatarBody.Toon]: t("Anime cel"),
    [AvatarBody.Glitch]: t("Glitch"),
    [AvatarBody.Chrome]: t("Y2K chrome"),
    [AvatarBody.Halftone]: t("Manga halftone"),
    [AvatarBody.Foil]: t("Holo foil"),
    [AvatarBody.Neon]: t("Neon rings"),
    [AvatarBody.Galaxy]: t("Galaxy"),
  } satisfies Record<AvatarBody, string>,
  eyes: {
    [AvatarEyes.Blocks]: t("Blocks"),
    [AvatarEyes.Blades]: t("Blades"),
    [AvatarEyes.Shards]: t("PS1 shards"),
    [AvatarEyes.Grille]: t("Grille"),
    [AvatarEyes.Optic]: t("Optic"),
    [AvatarEyes.Mono]: t("Mono eye"),
    [AvatarEyes.Demon]: t("Demon"),
  } satisfies Record<AvatarEyes, string>,
  states: {
    [BlockState.Steady]: t("steady"),
    [BlockState.Wide]: t("wide"),
    [BlockState.Cold]: t("cold"),
    [BlockState.Slit]: t("slit"),
    [BlockState.Menace]: t("menace"),
    [BlockState.Fury]: t("fury"),
    [BlockState.Tired]: t("tired"),
    [BlockState.Squint]: t("squint"),
    [BlockState.Scan]: t("scan"),
  } satisfies Record<BlockState, string>,
  gear: {
    [AvatarGear.None]: null,
    [AvatarGear.Horns]: t("Horns"),
    [AvatarGear.Blades]: t("Blades"),
    [AvatarGear.Spikes]: t("Spikes"),
    [AvatarGear.Mast]: t("Mast"),
    [AvatarGear.Jack]: t("Jack"),
    [AvatarGear.Headset]: t("Headset"),
    [AvatarGear.Sigil]: t("Sigil"),
    [AvatarGear.Scar]: t("Scar"),
  } satisfies Record<AvatarGear, string | null>,
} as const;

/** Play's Assets shelf as square tiles (`play/PlayAssets.tsx`). */
export const PLAY_ASSET_WORDS = {
  kindsLabel: t("Kinds of asset"),
  kinds: {
    [KindChoice.All]: t("All"),
    [KindChoice.Model]: t("3D"),
    [KindChoice.Image]: t("Images"),
    [KindChoice.Sound]: t("Sounds"),
    [KindChoice.Video]: t("Videos"),
  } satisfies Record<KindChoice, string>,
  scopesLabel: t("Whose assets"),
  scopes: { [AssetScope.Everyone]: t("Everyone"), [AssetScope.Mine]: t("Mine") } satisfies Record<AssetScope, string>,
  open: (title: string) => t("Open {title}", { title }),
  play: (title: string) => t("Play {title}", { title }),
  pause: (title: string) => t("Pause {title}", { title }),
  playFailed: t("Couldn’t play this sound."),
  use: t("Use"),
  addLabel: (title: string) => t("Use {title} in one of your games", { title }),
  adding: t("Adding…"),
  addTo: t("Add to"),
  added: (game: string) => t("Added to {game}", { game }),
  addFailed: (game: string) => t("Couldn’t add it to {game}. Try again in a moment.", { game }),
  signedOut: t("Sign in to Genex to see your assets"),
  signIn: t("Sign in"),
  mineEmpty: t("Assets you make with Genex show up here."),
} as const;

/** Publish's one line that shares the game's assets on Play when it goes live (`PublishShare.tsx`). */
export const PUBLISH_SHARE_WORDS = {
  offer: (count: number) => t("Share its {count, plural, one {# asset} other {# assets}} on Play", { count }),
  switchLabel: (count: number) =>
    t("Share its {count, plural, one {# asset} other {# assets}} on Play when it goes live", { count }),
  sharing: (count: number) => t("Sharing {count, plural, one {# asset} other {# assets}} on Play…", { count }),
  shared: (count: number) => t("{count, plural, one {# asset} other {# assets}} on Play", { count }),
  checking: (count: number) => t("{count, plural, one {# asset} other {# assets}} on Play once checked", { count }),
  missed: (count: number) => t("{count} couldn’t be shared", { count }),
  tryAgain: t("Try again"),
  tryAgainLabel: t("Share the assets that couldn’t be shared again"),
  notShared: (count: number) => t("{count, plural, one {# asset} other {# assets}} not on Play yet", { count }),
  shareNow: t("Share now"),
  shareNowLabel: (count: number) =>
    t("Share its {count, plural, one {# asset} other {# assets}} on Play now", { count }),
} as const;

/** The @ picker in the prompt bar (`ui/MentionPanel.tsx`). */
export const MENTION_WORDS = {
  listLabel: t("Tag a game, tool or asset"),
  game: t("Game"),
  tool: t("Tool"),
  asset: t("Asset"),
  yours: t("Yours"),
  inMessage: t("Already in your message"),
  yourGames: t("Your games"),
  assets: t("Assets"),
  tools: t("Tools"),
  genexGames: t("Games on Genex"),
  plugins: t("Plugins"),
  plugin: t("Plugin"),
  on: t("On"),
  imagesHint: t("Reference or mood board"),
  reading: t("Loading Genex games and assets…"),
  noMatches: t("No matches"),
  atCap: t("That's as many as one message can carry. Remove one to tag something else."),
  resultsLabel: t("Tagged in this message"),
  ready: t("Ready"),
  added: t("Added"),
  read: t("Your game · the agent can read it"),
  pluginRead: t("Plugin · the agent will use it"),
  copied: t("Downloaded for the agent to read"),
  addedTo: (path: string) => t("Added to the game as {path}", { path }),
  missed: {
    [MentionMiss.NotDownloaded]: t("Couldn't download it. Check your connection."),
    [MentionMiss.NotTakeable]: t("Its author no longer shares it."),
    [MentionMiss.Gone]: t("It's no longer there."),
    [MentionMiss.NotWebGame]: t("Assets are for web games."),
  } satisfies Record<MentionMiss, string>,
  tryAgain: t("Try again"),
  removeTag: t("Remove tag"),
  trying: t("Trying…"),
  search: t("Search games, assets and tools"),
  yourAssets: t("Your assets"),
  clear: t("Clear"),
  clearLabel: t("Clear the search"),
  whatLabel: t("What to show"),
  all: t("All"),
  games: t("Games"),
  whoseLabel: t("Whose"),
  everyone: t("Everyone"),
  mine: t("Mine"),
  /** An asset card's chip when genex.games says what kind of asset it is. */
  assetKind: {
    [LibraryKind.Model]: t("3D"),
    [LibraryKind.Image]: t("Image"),
    [LibraryKind.Sound]: t("Sound"),
    [LibraryKind.Video]: t("Video"),
  } satisfies Record<LibraryKind, string>,
  saved: t("Saved"),
  shared: t("Shared"),
} as const;

/** Studio's Publish for a Roblox game: its card hands the publish to the game's agent and follows it to Roblox. */
export const ROBLOX_PUBLISH_WORDS = {
  title: t("Publish to Roblox"),
  intro: t("Your game's agent publishes it in Roblox Studio while you keep working."),
  name: t("Name on Roblox"),
  publishFirst: t("Publish to Roblox"),
  publishUpdate: t("Publish an update"),
  updateLine: t("Everyone who plays gets this version."),
  handing: t("Handing it to the agent…"),
  chatAsks: t("If the chat or macOS asks for permission, allow it: publishing goes on by itself."),
  progress: t("Publishing to Roblox"),
  stepAgent: t("To the agent"),
  stepStudio: t("In Roblox Studio"),
  stepRoblox: t("On Roblox"),
  publishing: t("Publishing…"),
  publishingLine: t("The agent is publishing in Roblox Studio. Closing this doesn't stop it."),
  publishedFirst: t("Your game is on Roblox"),
  publishedUpdate: t("The update is on Roblox"),
  open: t("Open on Roblox"),
  onlyYou: t("Only you can open it for now. Roblox keeps a new game private until you finish these in Creator Hub:"),
  nextQuestions: t("Answer Roblox's questions about what's in the game, so it gets an age rating."),
  nextPublic: t("Make the game public, so anyone can play it."),
  nextIcon: t("Add an icon and a thumbnail, or Roblox shows a grey square."),
  openHub: t("Open Creator Hub"),
  stoppedLine: t("The agent stopped before Studio published. The chat says why."),
  tryAgain: t("Try again"),
  noPlace: t("This game has no Roblox place yet. Set up Roblox Studio first."),
  setUp: t("Set up Roblox Studio"),
  byHand: t("Genex can't click in Roblox Studio on this computer. Publish it yourself in Studio:"),
  done: t("Done"),
  readFailed: t("Couldn't read where this game stands on Roblox."),
} as const;
