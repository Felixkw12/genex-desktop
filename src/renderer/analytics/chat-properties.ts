/**
 * What the chat's own presses send (plan §1.5): pure builders a hook calls with what it has in
 * hand, so the call site stays one `track` line. Words, names, paths and ids go in and never come
 * out: a text becomes a length bucket, a model a catalog id or `custom`, an engine one of the app's
 * own ids.
 */
import {
  RewindBlock,
  type RewindFiles,
  type RewindPreview,
  RewindRefusal,
  type RewindResult,
  UndoRewindRefusal,
} from "../../shared/chat-rewind.ts";
import type { EngineKind } from "../../shared/engine-descriptor.ts";
import { errorCodeIn } from "../../shared/errors.ts";
import { type EventEnvelope, EventKind } from "../../shared/event-log.ts";
import { ReasoningEffort } from "../../shared/model-preferences.ts";
import { HookRefusal } from "../../shared/plugin-hooks.ts";
import {
  PermissionDecision,
  type PermissionMode,
  type SteadyPermissionMode,
  type ToolPermissionAnswer,
} from "../../shared/permissions.ts";
import { EngineId } from "../../shared/providers.ts";
import type { SendPlacement } from "../chat/pending-sends.ts";
import { parseModelKey } from "../model-key.ts";
import {
  type AwaitingReply,
  type ChatMemory,
  cardWait,
  failedRecently,
  noteBlocked,
  noteQuestionAnswered,
  openCards,
  planKey,
  questionKey,
  rememberSend,
  stoppedRecently,
  takeRewound,
} from "./chat-memory.ts";
import {
  ComposerRoom,
  EngineRefOther,
  ModelRefOther,
  type PlanAction,
  type QuestionVia,
  RewindAction,
  RewindFilesState,
  SendRoute,
  WaitingCardKind,
  type SendBlock,
  type SendSource,
  type StopIgnored,
  type StopVia,
} from "./chat-vocabulary.ts";
import type { ChatEventProperties, ChatEvent, MessageSentProperties } from "./events/chat.ts";
import { charsBucket, countBucket, elapsedMs } from "./properties.ts";

type Props<E extends ChatEvent> = ChatEventProperties[E];

const ENGINE_IDS: ReadonlySet<string> = new Set(Object.values(EngineId));
/** Engines whose models come from a fixed catalog, never a name the person typed. */
const CATALOG_ENGINES: ReadonlySet<string> = new Set([
  EngineId.ClaudeCode,
  EngineId.Codex,
  EngineId.OpenRouter,
  EngineId.Opper,
]);
/** A catalog model id's shape (`claude-opus-4-1`, `gpt-5-codex`, `vendor/model:free`). */
const CATALOG_MODEL_ID = /^[a-z0-9][a-z0-9._:/-]{0,95}$/i;
const EFFORTS: ReadonlySet<string> = new Set(Object.values(ReasoningEffort));
/** The default model's id in a model key. */
const DEFAULT_MODEL = "default";

/** An engine as analytics names it: one of the app's engine ids, else `other`; `none` without one. */
export function engineRef(id: string | null | undefined): string {
  if (!id) return EngineRefOther.None;
  return ENGINE_IDS.has(id) ? id : EngineRefOther.Other;
}

/** A model key as analytics names it: a subscription's, OpenRouter's or Opper's catalog id, else `custom`. */
export function modelRef(key: string | null | undefined): string {
  if (!key) return ModelRefOther.None;
  const { engine, model } = parseModelKey(key);
  if (!model || model === DEFAULT_MODEL) return ModelRefOther.Default;
  return CATALOG_ENGINES.has(engine) && CATALOG_MODEL_ID.test(model) ? model : ModelRefOther.Custom;
}

/** Whether a model is named by the person or their own server (Ollama, a local server): its name is masked in replays. */
export function namesOwnModel(key: string | null | undefined): boolean {
  const { engine } = parseModelKey(key);
  return engine === EngineId.Ollama || engine === EngineId.LocalServer || engineRef(engine) === EngineRefOther.Other;
}

const isEffort = (value: unknown): value is ReasoningEffort => typeof value === "string" && EFFORTS.has(value);

/** Engines that run on this computer. */
const LOCAL_ENGINES: ReadonlySet<string> = new Set([EngineId.Ollama, EngineId.Bonsai, EngineId.LocalServer]);

/** `model_picked`: the engine and catalog model chosen, the one before it, and whether a failure came just before. */
export function modelPickedProperties(
  memory: ChatMemory,
  pick: { key: string; previousKey: string | null; free: boolean; engineKind?: EngineKind | undefined },
  now: number,
): Props<typeof ChatEvent.ModelPicked> {
  const engine = engineRef(parseModelKey(pick.key).engine);
  const previous = engineRef(parseModelKey(pick.previousKey).engine);
  return {
    engine,
    ...(pick.engineKind ? { engine_kind: pick.engineKind } : {}),
    model: modelRef(pick.key),
    previous_engine: previous,
    changed_engine: engine !== previous,
    free: pick.free,
    local: LOCAL_ENGINES.has(engine),
    after_failure: failedRecently(memory, now),
  };
}

/** An effort level from the app's own scale, else nothing. */
export function effortRef(value: string | null | undefined): ReasoningEffort | undefined {
  return isEffort(value) ? value : undefined;
}

/** The last user message's words in a log record, if it carries one. */
function userWords(event: EventEnvelope): string | null {
  if (event.data.type !== EventKind.Messages) return null;
  return event.data.messages.findLast((message) => message.role === "user")?.content ?? null;
}

const normalized = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase();

/** What the chat's own log says about a new message: how many came before, a repeat, and the pause since the last answer. */
export function chatHistoryFacts(
  events: readonly EventEnvelope[],
  text: string,
  now: number,
): { userMessages: number; repeatsPrevious: boolean; thinkTimeMs?: number } {
  const said = events.map(userWords).filter((words): words is string => words !== null);
  const previous = said.at(-1);
  const words = normalized(text);
  const lastEnd = events.findLast((event) => event.data.type === EventKind.TurnEnded);
  const endedAt = lastEnd ? Date.parse(lastEnd.created_at) : Number.NaN;
  return {
    userMessages: said.length,
    repeatsPrevious: words !== "" && previous !== undefined && normalized(previous) === words,
    ...(Number.isFinite(endedAt) ? { thinkTimeMs: elapsedMs(endedAt, now) } : {}),
  };
}

/** What a hook knows about a message it routed. */
export interface SendFacts {
  thread: string;
  /** The composer's client id for the bubble, when the chat shows one. */
  clientId?: string | undefined;
  room: ComposerRoom;
  route: SendRoute;
  placement?: SendPlacement | undefined;
  source: SendSource;
  permissionMode?: PermissionMode | undefined;
  /** The model key it went with. */
  key: string | null;
  engineKind?: EngineKind | undefined;
  effort?: string | undefined;
  planReview: boolean;
  pictures: number;
  files: number;
  mentions: number;
  text: string;
  /** The chat's log (rewound rows left out). */
  events: readonly EventEnvelope[];
  chatWorking: boolean;
}

/** `message_sent`'s properties, from the facts and what the chat did just before (a Stop, a rewind). */
export function messageSentProperties(
  facts: SendFacts,
  before: { afterRewind: boolean; afterStop: boolean },
  now: number,
): MessageSentProperties {
  const history = chatHistoryFacts(facts.events, facts.text, now);
  const effort = effortRef(facts.effort);
  return {
    room: facts.room,
    route: facts.route,
    ...(facts.placement ? { placement: facts.placement } : {}),
    source: facts.source,
    ...(facts.permissionMode ? { permission_mode: facts.permissionMode } : {}),
    engine: engineRef(parseModelKey(facts.key).engine),
    ...(facts.engineKind ? { engine_kind: facts.engineKind } : {}),
    model: modelRef(facts.key),
    ...(effort ? { effort } : {}),
    plan_review: facts.planReview,
    pictures: facts.pictures,
    files: facts.files,
    mentions: facts.mentions,
    chars_bucket: charsBucket(facts.text.trim().length),
    user_message_index: history.userMessages + 1,
    is_first_in_game: facts.room === ComposerRoom.Game && history.userMessages === 0,
    chat_working: facts.chatWorking,
    after_rewind: before.afterRewind,
    after_stop: before.afterStop,
    repeats_previous: history.repeatsPrevious,
    ...(history.thinkTimeMs === undefined ? {} : { think_time_ms: history.thinkTimeMs }),
  };
}

/** Routes that start a turn the person then waits on. */
const AWAITS_REPLY: ReadonlySet<SendRoute> = new Set([SendRoute.Chat, SendRoute.PlanReview]);

/**
 * A message is going: its `message_sent` properties, with the rewind and Stop before it read from
 * memory, and the send kept there so its queue wait and first token pair with it.
 */
export function noteMessageSent(memory: ChatMemory, facts: SendFacts, now: number): MessageSentProperties {
  const properties = messageSentProperties(
    facts,
    { afterRewind: takeRewound(memory, facts.thread), afterStop: stoppedRecently(memory, facts.thread, now) },
    now,
  );
  if (!AWAITS_REPLY.has(facts.route)) return properties;
  const stale = memory.streams.get(facts.thread);
  const reply: AwaitingReply & { thread: string } = {
    thread: facts.thread,
    at: now,
    engine: properties.engine,
    ...(facts.engineKind ? { engineKind: facts.engineKind } : {}),
    firstInGame: properties.is_first_in_game,
    ...(stale ? { staleStream: stale } : {}),
  };
  rememberSend(memory, { clientId: facts.clientId, reply, ...(facts.placement ? { placement: facts.placement } : {}) });
  return properties;
}

/** A send that failed after all: nothing waits for its reply. */
export function forgetSend(memory: ChatMemory, thread: string, clientId: string | undefined): void {
  if (clientId) memory.sends.delete(clientId);
  memory.replies.delete(thread);
}

/** `message_send_blocked`: why Send went nowhere, counted against the presses before it. */
export function sendBlockedProperties(
  memory: ChatMemory,
  blocked: { reason: SendBlock; room: ComposerRoom; key: string | null },
): Props<typeof ChatEvent.MessageSendBlocked> {
  return {
    reason: blocked.reason,
    room: blocked.room,
    engine: engineRef(parseModelKey(blocked.key).engine),
    attempts_in_row: noteBlocked(memory),
  };
}

/** The first card waiting in a chat, or none. */
export function waitingCard(memory: ChatMemory, thread: string | null | undefined): WaitingCardKind {
  if (!thread) return WaitingCardKind.None;
  return openCards(memory, thread)[0]?.kind ?? WaitingCardKind.None;
}

/** `chat_stop_requested`: how Stop was asked and what was going on in the chat. */
export function stopRequestedProperties(
  memory: ChatMemory,
  stop: { thread: string | null | undefined; via: StopVia; ignored: StopIgnored; buildRunning: boolean },
  now: number,
): Props<typeof ChatEvent.ChatStopRequested> {
  const turn = stop.thread ? memory.turns.get(stop.thread) : undefined;
  return {
    via: stop.via,
    ...(turn ? { turn_age_ms: elapsedMs(turn.at, now) } : {}),
    streaming: Boolean(stop.thread && memory.streams.has(stop.thread)),
    waiting_card: waitingCard(memory, stop.thread),
    build_running: stop.buildRunning,
    ignored: stop.ignored,
  };
}

/** The mode a plan approval continues in, when the answer is one. */
function planMode(answer: ToolPermissionAnswer): SteadyPermissionMode | undefined {
  return answer.decision === PermissionDecision.ApprovePlan ? answer.mode : undefined;
}

/** `permission_answered`: the decision, never the words for Claude that may come with a Deny. */
export function permissionAnsweredProperties(
  answer: ToolPermissionAnswer,
  settled: { resolved: boolean; waitMs: number | undefined },
): Props<typeof ChatEvent.PermissionAnswered> {
  const mode = planMode(answer);
  const withMessage = answer.decision === PermissionDecision.Deny && Boolean(answer.message?.trim());
  return {
    decision: answer.decision,
    with_message: withMessage,
    ...(mode ? { plan_mode: mode } : {}),
    ...(settled.waitMs === undefined ? {} : { wait_ms: settled.waitMs }),
    resolved: settled.resolved,
  };
}

/**
 * `chat_question_answered`: by which choice (the first is the recommended one) or in their own
 * words, never what. The question's close is then an answer, not a card left unanswered.
 */
export function questionAnsweredProperties(
  memory: ChatMemory,
  answer: { thread: string; via: QuestionVia; index?: number },
  now: number,
): Props<typeof ChatEvent.ChatQuestionAnswered> {
  const waitMs = cardWait(memory, questionKey(answer.thread), now);
  noteQuestionAnswered(memory, answer.thread);
  const index = answer.index;
  return {
    via: answer.via,
    ...(index === undefined ? {} : { choice_index: index, picked_recommended: index === 0 }),
    ...(waitMs === undefined ? {} : { wait_ms: waitMs }),
  };
}

/** `plan_answered`: what the person did on the plan card, and how long the plan had waited for them. */
export function planAnsweredProperties(
  memory: ChatMemory,
  answer: { review: string; action: PlanAction; refused?: boolean },
  now: number,
): Props<typeof ChatEvent.PlanAnswered> {
  const waitMs = cardWait(memory, planKey(answer.review), now);
  return {
    action: answer.action,
    ...(waitMs === undefined ? {} : { wait_ms: waitMs }),
    ...(answer.refused === undefined ? {} : { refused: answer.refused }),
  };
}

/** The code a rewind or its preview was refused with: the plan's refusal, the core's own, or a plugin step's block. */
export type RewindCode = RewindRefusal | RewindBlock | HookRefusal;
/** The code bringing the newer version back was refused with. */
export type UndoRewindCode = UndoRewindRefusal | RewindBlock | HookRefusal;

/** The code a refused rewind or preview crossed with, or null: never its words. */
export const rewindCode = (error: unknown): RewindCode | null =>
  errorCodeIn(RewindRefusal, error) ?? errorCodeIn(RewindBlock, error) ?? errorCodeIn(HookRefusal, error);

/** The code a refused Bring back newer version crossed with, or null. */
export const undoRewindCode = (error: unknown): UndoRewindCode | null =>
  errorCodeIn(UndoRewindRefusal, error) ?? errorCodeIn(RewindBlock, error) ?? errorCodeIn(HookRefusal, error);

/** What the rewind dialog found for the game files, without their names; a refused preview says its code. */
export function rewindPreviewProperties(
  preview: RewindPreview | null,
  refusal: unknown = null,
): Props<typeof ChatEvent.RewindPreviewed> {
  if (!preview) return { files_state: RewindFilesState.Refused, stops_build: false, code: rewindCode(refusal) };
  return { ...rewindFilesFacts(preview.files), stops_build: preview.stopsBuild };
}

function rewindFilesFacts(files: RewindFiles): Omit<Props<typeof ChatEvent.RewindPreviewed>, "stops_build"> {
  if (files.state === RewindFilesState.Restore)
    return {
      files_state: RewindFilesState.Restore,
      files_bucket: countBucket(files.files),
      outside_changes: files.outside.length,
    };
  if (files.state === RewindFilesState.Unavailable)
    return { files_state: RewindFilesState.Unavailable, files_stay_reason: files.reason };
  return {
    files_state: files.state === RewindFilesState.Unchanged ? RewindFilesState.Unchanged : RewindFilesState.None,
  };
}

/** `rewind_decided` on Rewind: whether the files were asked back, against the switch's own start. */
export function rewindConfirmedProperties(
  files: RewindFiles | null,
  choice: { restore: boolean; restoresByDefault: boolean; failed: boolean },
  failure: unknown = null,
): Props<typeof ChatEvent.RewindDecided> {
  const offered = files?.state === RewindFilesState.Restore;
  return {
    action: RewindAction.Confirm,
    restore_files: offered && choice.restore,
    default_overridden: offered && choice.restore !== choice.restoresByDefault,
    failed: choice.failed,
    ...(choice.failed ? { code: rewindCode(failure) } : {}),
  };
}

/** `rewind_undone` when the newer version came back. */
export const REWIND_UNDONE: Props<typeof ChatEvent.RewindUndone> = { ok: true };

/** `rewind_undone` when it was refused: the refusal's code, never its words. */
export const rewindUndoFailedProperties = (failure: unknown): Props<typeof ChatEvent.RewindUndone> => ({
  ok: false,
  code: undoRewindCode(failure),
});

/** `rewind_decided` on Cancel. */
export const REWIND_CANCELLED: Props<typeof ChatEvent.RewindDecided> = {
  action: RewindAction.Cancel,
  restore_files: false,
  default_overridden: false,
  failed: false,
};

/** `rewind_completed`: how much came back, never what. */
export function rewindCompletedProperties(result: RewindResult): Props<typeof ChatEvent.RewindCompleted> {
  return {
    ...(result.files === null ? {} : { files_restored_bucket: countBucket(result.files) }),
    held_followups: result.held.length,
    undo_offered: Boolean(result.undo),
  };
}

/** How many user messages a rewind to this record takes out of the chat (the target's own included). */
export function messagesBack(events: readonly EventEnvelope[], eventId: string): number {
  const from = events.findIndex((event) => event.id === eventId);
  if (from < 0) return 0;
  return events.slice(from).filter((event) => userWords(event) !== null).length;
}
