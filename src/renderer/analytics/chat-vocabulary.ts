/**
 * The chat area's own words for what happened (plan §1.5): where a message went, who sent it, why
 * Send went nowhere, which card waited and what closed it. Each is an `as const` vocabulary sent as
 * an analytics property (`events/chat.ts`); the app's shared vocabularies are used as they are.
 */

/** Where a composer sits: a game's chat, Studio's chat, home, or another surface. */
export const ComposerRoom = {
  Game: "game",
  Studio: "studio",
  Home: "home",
  Other: "other",
} as const;
export type ComposerRoom = (typeof ComposerRoom)[keyof typeof ComposerRoom];

/** Where a message went: the chat, plan review, a legacy held plan's inbox, or a note to the build. */
export const SendRoute = {
  Chat: "chat",
  PlanReview: "plan_review",
  HeldPlan: "held_plan",
  NoteToBuild: "note_to_build",
} as const;
export type SendRoute = (typeof SendRoute)[keyof typeof SendRoute];

/** Who sent a message: the person at the composer, or one of the app's own buttons and reports. */
export const SendSource = {
  Composer: "composer",
  QuestionCard: "question_card",
  PlanRetry: "plan_retry",
  FirstMessage: "first_message",
  KeepBuilding: "keep_building",
  ContinueLocal: "continue_local",
  CommandResult: "command_result",
  SetupCard: "setup_card",
  TagRetry: "tag_retry",
  PluginTurnedOn: "plugin_turned_on",
  /** Genex telling the agent why the Loop it started didn't start (never sent from the renderer). */
  LoopHeld: "loop_held",
  /** Genex asking the agent for the game's cover once a build landed (never sent from the renderer). */
  CoverStep: "cover_step",
  /** Genex telling the agent a background job it started ended (never sent from the renderer). */
  JobEnded: "job_ended",
  /** Play on a game with no app to play yet: "Run the game" sent for the person. */
  RunTheGame: "run_the_game",
  /** Words another surface left for this chat and asked it to send. */
  Handoff: "handoff",
} as const;
export type SendSource = (typeof SendSource)[keyof typeof SendSource];

/** Why Send went nowhere. */
export const SendBlock = {
  NoModel: "no_model",
  SignInNeeded: "sign_in_needed",
  ModelUnavailable: "model_unavailable",
} as const;
export type SendBlock = (typeof SendBlock)[keyof typeof SendBlock];

/** Where a message that did not go stopped: its send was rejected. */
export const SendFailStage = { Rejected: "rejected" } as const;
export type SendFailStage = (typeof SendFailStage)[keyof typeof SendFailStage];

/** How long a provider said to wait before trying again. */
export const RetryAfterBucket = {
  Minute: "<1m",
  Hour: "1-60m",
  Day: "1-24h",
  Longer: "24h+",
} as const;
export type RetryAfterBucket = (typeof RetryAfterBucket)[keyof typeof RetryAfterBucket];

/** An engine as analytics names it: one of the app's engine ids, else other; none when there is none. */
export const EngineRefOther = { Other: "other", None: "none" } as const;
/** A model as analytics names it: a catalog id of a subscription, OpenRouter or Opper, else one of these. */
export const ModelRefOther = { Custom: "custom", Default: "default", None: "none" } as const;

/** An effort as analytics names it when it is not one of the app's levels: the model's own default. */
export const EffortRefOther = { Default: "default" } as const;

/** How full the context was before a compaction. */
export const ContextBucket = {
  Low: "<50",
  High: "50-84",
  Full: "85+",
} as const;
export type ContextBucket = (typeof ContextBucket)[keyof typeof ContextBucket];

/**
 * How a chat turn ended, as `turn_ended.metadata.outcome` records it: the seed's `TurnStop`
 * (`harness-seed/loop/turn-record.ts`), which the app has no copy of. Anything else reads `other`.
 */
export const TurnOutcome = {
  Done: "done",
  Cancelled: "cancelled",
  Aborted: "aborted",
  NeedsSignin: "needs_signin",
  EngineLimited: "engine_limited",
  MaxRounds: "max_rounds",
  Deadline: "deadline",
  LaunchRun: "launch_run",
  Restart: "restart",
  None: "none",
  Other: "other",
} as const;
export type TurnOutcome = (typeof TurnOutcome)[keyof typeof TurnOutcome];

/** A turn's status as `turn_ended` records it. */
export const TurnStatus = { Ok: "ok", Error: "error", Cancelled: "cancelled" } as const;
export type TurnStatus = (typeof TurnStatus)[keyof typeof TurnStatus];

/** A card that waits on the person above the composer. */
export const WaitingCardKind = {
  None: "none",
  Permission: "permission",
  Plan: "plan",
  Question: "question",
  Consent: "consent",
} as const;
export type WaitingCardKind = (typeof WaitingCardKind)[keyof typeof WaitingCardKind];

/** What closed a card the person never answered (`ToolPermissionBy`, `PluginConsentBy`, a newer question). */
export const CardSettledBy = {
  Stop: "stop",
  Turn: "turn",
  Restart: "restart",
  Timeout: "timeout",
  Mode: "mode",
  Chat: "chat",
  ComposerMessage: "composer_message",
  NewQuestion: "new_question",
  Other: "other",
} as const;
export type CardSettledBy = (typeof CardSettledBy)[keyof typeof CardSettledBy];

/** Where the person went from a chat with a card still waiting. */
export const LeftTo = { OtherChat: "other_chat", Home: "home" } as const;
export type LeftTo = (typeof LeftTo)[keyof typeof LeftTo];

/** How Stop was asked. */
export const StopVia = { Button: "button", Escape: "escape", SendNow: "send_now" } as const;
export type StopVia = (typeof StopVia)[keyof typeof StopVia];

/** Why a Stop press did nothing. */
export const StopIgnored = {
  None: "none",
  /** This chat's last Stop was acted on less than `STOP_RETRY_MS` ago. */
  RepeatWithin5s: "repeat_within_5s",
  /** The press landed in the pad right after Send. */
  SendPad: "send_pad",
} as const;
export type StopIgnored = (typeof StopIgnored)[keyof typeof StopIgnored];

/** What ended the work a Stop asked to stop. */
export const StopEndedBy = {
  TurnEnded: "turn_ended",
  RunFinished: "run_finished",
  AutopilotPaused: "autopilot_paused",
} as const;
export type StopEndedBy = (typeof StopEndedBy)[keyof typeof StopEndedBy];

/** How an agent's question was answered. */
export const QuestionVia = { Choice: "choice", OwnWords: "own_words" } as const;
export type QuestionVia = (typeof QuestionVia)[keyof typeof QuestionVia];

/** A card put aside, or brought back. */
export const QuestionDeferral = { PutAside: "put_aside", Reopened: "reopened" } as const;
export type QuestionDeferral = (typeof QuestionDeferral)[keyof typeof QuestionDeferral];

/** Where plan mode was turned on or off. */
export const PlanModeVia = { AddMenu: "add_menu", BulbOff: "bulb_off" } as const;
export type PlanModeVia = (typeof PlanModeVia)[keyof typeof PlanModeVia];

/** What the person did on the plan card. */
export const PlanAction = {
  Approve: "approve",
  MakeChanges: "make_changes",
  Cancel: "cancel",
  TryAgain: "try_again",
  ChooseModel: "choose_model",
  ModelProviders: "model_providers",
  Dismiss: "dismiss",
} as const;
export type PlanAction = (typeof PlanAction)[keyof typeof PlanAction];

/** Where a permission mode was chosen. */
export const ModeVia = { Composer: "composer" } as const;
export type ModeVia = (typeof ModeVia)[keyof typeof ModeVia];

/** What the rewind dialog found for the game files (`RewindFiles.state`), or that it was refused. */
export const RewindFilesState = {
  Restore: "restore",
  Unchanged: "unchanged",
  Unavailable: "unavailable",
  None: "none",
  Refused: "refused",
} as const;
export type RewindFilesState = (typeof RewindFilesState)[keyof typeof RewindFilesState];

/** The rewind dialog's answer. */
export const RewindAction = { Confirm: "confirm", Cancel: "cancel" } as const;
export type RewindAction = (typeof RewindAction)[keyof typeof RewindAction];

/** Where the model menu was opened from. */
export const ModelMenuFrom = { Composer: "composer", PlanRecovery: "plan_recovery" } as const;
export type ModelMenuFrom = (typeof ModelMenuFrom)[keyof typeof ModelMenuFrom];

/** Which composer model setting changed. */
export const ModelSetting = { Roles: "roles", Effort: "effort" } as const;
export type ModelSetting = (typeof ModelSetting)[keyof typeof ModelSetting];

/** Why a chat's saved model was silently swapped for another. */
export const ModelReplaced = { ProviderGone: "provider_gone", ModelDropped: "model_dropped" } as const;
export type ModelReplaced = (typeof ModelReplaced)[keyof typeof ModelReplaced];

/**
 * A press on the composer's sign-in card that only the gate sees. Sign in and Check connection are
 * counted by the card itself (`provider_action_clicked`, surface chat_card).
 */
export const SignInAction = {
  ContinueLocal: "continue_local",
} as const;
export type SignInAction = (typeof SignInAction)[keyof typeof SignInAction];

/** Where a lost sign-in showed: the turn that needed it. */
export const SignInFrom = { Turn: "turn" } as const;
export type SignInFrom = (typeof SignInFrom)[keyof typeof SignInFrom];

/** How a compaction started (`compacted.trigger`). */
export const CompactTrigger = { Auto: "auto", Manual: "manual", Other: "other" } as const;
export type CompactTrigger = (typeof CompactTrigger)[keyof typeof CompactTrigger];
