import type { AnalyticsConfig } from "./analytics.ts";
import type {
  PlayControl,
  PlayFeedPage,
  PlayFeedRequest,
  PlayGame,
  PlayGameDetail,
  PlayPoint,
  PlayRemixAnswer,
  PlayShelf,
  PlayShelves,
} from "./play.ts";
import type { PlayChangeResult, PlayCoverResult, PlayCoverType, PlayGameChange } from "./play-manage.ts";
import type { NativeInstalls, NativeSession, SessionAction } from "./play-native.ts";
import type { PublishPlatform } from "./publish-platforms.ts";
import type { GenexCatalogItem } from "./mention-corpus.ts";
import type { LanguageChoice } from "./locale.ts";
import type { MentionRef, MentionRetry } from "./prompt-mention.ts";
import type {
  AvatarStyle,
  FriendActionRequest,
  FriendStatus,
  PlayCreator,
  PlayFriendsPage,
  PlayMe,
  PlayPeopleResult,
  PlayProfile,
  PresenceVisibility,
} from "./play-people.ts";
import type { GenexAccountView } from "./genex-account.ts";
import type { PlayBarHold } from "./play-bar.ts";
import type { PurchaseAnswer } from "./play-purchase.ts";
import type { PlayComment, PlayCommentsPage } from "./play-comments.ts";
import type {
  BrowseDetail,
  BrowsePage,
  CreatorItem,
  ItemAdded,
  ItemAllowance,
  ItemGames,
  ItemReportReason,
  MyItem,
  Selling,
  ShelfItem,
  StoreBuyResult,
  StoreClaimed,
  StoreRefused,
  StoreSheet,
  StoreTab,
} from "./store-items.ts";
import type { LocalItemsView, LocalShareResult } from "./item-draft.ts";
import type { PlayCredits } from "./play-credits.ts";
import type {
  AddOutcome,
  AddSource,
  GameLibraryStates,
  LibraryFileAnswer,
  LibraryPage,
  LibraryQuery,
  ShareItem,
  ShareOutcome,
} from "./asset-library.ts";
import type { HandleCheck, HandleSave } from "./handle.ts";
import type { PlayStats, StatsPeriod } from "./play-stats.ts";
import type { PerformanceMark } from "./performance.ts";
import type { ComposerSendOptions } from "./composer.ts";
import type {
  ExportReview,
  GithubLookup,
  GithubVersion,
  PluginInfo,
  PluginCatalogEntry,
  PluginIndexView,
  PluginPanelDocument,
} from "./plugins.ts";
import type { PluginFileRequest } from "./plugin-file-request.ts";
import type { McpConnectorView, McpTestResult, McpToolSummary } from "./mcp.ts";
import type { McpConnectorDraft } from "./mcp-import.ts";
import type { ConversationRecord, EventEnvelope, SnapshotRecord } from "./event-log.ts";
import type { EngineDescriptor } from "./engine-descriptor.ts";
import type { BackdropShaderRequest, BackdropShaderResult } from "./backdrop-shader.ts";
import type { FolderInspection, GameLocation, GameName, GameNameRequest, GameProject } from "./game-project.ts";
import type { BuildProblem, InstallResult } from "./build-problem.ts";
import type { LoopRunReview } from "./run-review.ts";
import type { CodexLoginState } from "./codex-login.ts";
import type { ClaudeLoginState } from "./claude-login.ts";
import type { ProjectAsset, ProjectAssetRead, ProjectAssets } from "./game-assets.ts";
import type { ModelRig } from "./model-rig.ts";
import type { UiEvent } from "./ui-events.ts";
import type { GameFile } from "./game-file.ts";
import type { ChatFileLink, ChatFileOpenOutside, ChatFileRef } from "./chat-files.ts";
import type { ReferenceFrame } from "./protocol.ts";
import type { ProviderUsageReport } from "./provider-usage.ts";
import type { BootState, SandboxSetupResult } from "./boot.ts";
import type { AppAbout, ReadyUpdate, RestartAnswer, UpdateCheckResult } from "./app-update.ts";
import type { LaunchFacts } from "./app-session.ts";
import type { PermissionMode, PermissionSettingsView, ToolPermissionAnswer } from "./permissions.ts";
import type { LiveBehindEvent, WebBuildLoad } from "./live-behind.ts";
import type { FieldRow, RunSharingDeleteResult, RunSharingStatus } from "./run-sharing.ts";

export type { ProjectAsset, ProjectAssets };

export interface Bootstrap {
  threadId: string;
  layout: Record<string, string>;
  /** `~/AI Games` as a human reads it — the renderer never sees absolute paths. */
  gamesRootLabel: string;
  /** capabilities: what the loaded harness claimed in its ready handshake — [] until ready. */
  harness: { state: string; version: string | null; capabilities: string[] };
  threads: ConversationRecord[];
  events: EventEnvelope[];
  /** Where `events()` continues from: every thread's head when `events` was read. */
  eventsCursor?: string | null;
  games: GameProject[];
  engines: EngineDescriptor[];
  /** Current host state, independent of the bounded notification tail. */
  threadStatus?: Record<string, { status: string; since: number }>;
  /**
   * Builders working right now, by game: how many. A reload reads which games are building from
   * here, since the `delegation.*` events that announced them were before it.
   */
  activeDelegations: Record<string, number>;
  /** This session may welcome a first launch: not in smoke, self-test or fixture sessions, except the first-launch fixture. */
  welcome?: boolean;
  /** An unpackaged developer run: the renderer may offer its developer tools (the colour tweaker). */
  developer?: boolean;
  /** The website Play links to: genex.games', unless a development profile points Play elsewhere. */
  playWebOrigin?: string;
  /** Usage analytics this session may offer; null in builds without a key and in launches that never send. */
  analytics?: AnalyticsConfig | null;
  /**
   * How this launch started and how the session before it ended, for usage analytics: only in a
   * launch that keeps them, and only in its first bootstrap (a reload or Retry gets none).
   */
  launch?: LaunchFacts | null;
}

/** The window-control overlay's background and glyph colours, as `#rrggbb`. */
export interface WindowControlColors {
  color: string;
  symbolColor: string;
}

/** The window controls as the renderer paints them: the theme's colours, and whether Home's background lies under them. */
export interface WindowControls extends WindowControlColors {
  seeThrough: boolean;
}

/** One read of the all-threads log: the events, and the cursor the next read starts after. */
export interface EventFeed {
  events: EventEnvelope[];
  cursor: string | null;
}

export interface SelfChange {
  from: string;
  to: string;
  reason: string;
  /** The file the change wrote, as the exact edit names it. */
  file: string;
  at: string;
  healthy: boolean;
  diff: string;
}

/** One catalog model judged against this Mac (Settings → Local Models). */
export interface LocalModelChoice {
  model: string;
  name: string;
  variant?: string;
  engine?: string;
  sizeGb: number;
  tools: boolean;
  vision: boolean;
  about: string;
  fits: boolean;
  needGb: number;
  needsRamGb: number | null;
  reason: string;
}

/** This Mac's hardware and the local models it can run (`StudioApi.hardware`, harness `engine.hardware`). */
export interface HardwareReport {
  hardware: { cpu: string; ramGb: number; usableModelGb: number };
  recommendation: {
    tier: { label: string; expectation: string };
    defaultModel: string | null;
    /** The tier's ranked models that fit; the first is Best fit. */
    picks: LocalModelChoice[];
    /** Every other model this Mac can run, smallest first, fitting or not. */
    more: LocalModelChoice[];
  };
}

export interface StudioApi {
  /** Record a content-free journey sample only in opted-in diagnostics launches. */
  performanceMark(mark: PerformanceMark): Promise<boolean>;
  contextSettings(engine: string, model: string, threadId?: string): Promise<import("./context.ts").ContextSettings>;
  setContextPolicy(
    engine: string,
    model: string,
    policy: import("./context.ts").ContextPolicy | null,
    threadId?: string,
  ): Promise<import("./context.ts").ContextSettings>;
  studioSkills(): Promise<Array<{ name: string; text: string; description: string }>>;
  providerSkills(): Promise<import("./provider-skills.ts").ProviderSkillInventory[]>;
  /** The skills and commands one game's folder gives its builders. */
  projectSkills(project: string): Promise<import("./provider-skills.ts").ProjectSkillInventory>;
  /** A plugin skill's whole text: an inline skill's, or a file skill's file or one of its references. */
  pluginSkillText(id: string, name: string, file?: string): Promise<string>;
  pluginsList(): Promise<PluginInfo[]>;
  pluginsCatalog(): Promise<PluginCatalogEntry[]>;
  pluginEnable(id: string, enabled: boolean): Promise<void>;
  pluginRemove(id: string): Promise<void>;
  pluginInstall(id?: string): Promise<void>;
  pluginPanel(id: string, panel: string): Promise<PluginPanelDocument>;
  pluginSettings(id: string): Promise<Record<string, unknown>>;
  pluginSetSetting(id: string, key: string, value: unknown): Promise<void>;
  pluginReview(
    id: string,
    name: string,
    args: unknown,
    project?: string,
  ): Promise<{ images?: Array<{ label: string; dataUrl: string }>; message?: string; ticket?: string }>;
  pluginAction(id: string, name: string, args: unknown, project?: string, ticket?: string): Promise<unknown>;
  /** A plugin panel's Choose file: Studio's native file picker; the chosen file's real path, or null when cancelled. */
  pluginChooseFile(id: string, request: PluginFileRequest): Promise<string | null>;
  /** The files Publish would put online for a game, for Studio's Publish dialog to show. Uploads nothing. */
  genexPublishReview(project: string): Promise<ExportReview>;
  /** The web, Mac, Windows and Linux rows of Studio's Publish dialog for a game, from what its folder holds. */
  genexPublishPlatforms(project: string): Promise<PublishPlatform[]>;
  /**
   * Publish the game to the Genex gallery from Studio's Publish dialog: its Publish press approved
   * the files in `review`; `title` is the name players see; `remix` is its Allow remixing, whether the
   * game's project goes with it so others can remix it.
   */
  genexPublish(
    project: string,
    review: ExportReview,
    title?: string,
    remix?: boolean,
    /** The dialog said the web build replaces a page that shows only the game's apps. */
    replaceNativePage?: boolean,
  ): Promise<void>;
  /**
   * Publish a game that has only apps (no web build) from Studio's Publish dialog: its ready Mac and
   * Windows apps go to Genex and the game is listed under `title`. The press, under the rows it names,
   * is the consent; `remix` is its Allow remixing, whether the game's project goes once they are live.
   */
  genexPublishApps(project: string, title?: string, remix?: boolean): Promise<void>;
  /** Ask Genex to build the game's `platform` app on its own computers (an Unreal game's Windows app on a Mac). */
  genexCloudBuild(project: string, platform: string): Promise<void>;
  pluginsIndex(refresh?: boolean): Promise<PluginIndexView>;
  pluginInstallGithub(spec: string): Promise<void>;
  /** What a pasted GitHub link leads to, pinned to one exact commit; nothing is installed. */
  pluginLookupGithub(link: string, version?: GithubVersion): Promise<GithubLookup>;
  /** A GitHub repository's recent releases and default branch, to install another version from. */
  pluginGithubVersions(repo: string): Promise<GithubVersion[]>;
  pluginUpdate(id: string): Promise<void>;
  pluginWatch(id: string, enabled: boolean): Promise<void>;
  /** The person's Ask every time: a local plugin's tools they always allowed ask again before they run. */
  pluginForgetAllowed(id: string): Promise<void>;
  /** The user's answer to a `plugin_consent` card; `resolved` is false once the question is no longer waiting. */
  /**
   * The person's answer to a consent card; `always` (a connector's card) also allows that tool from
   * now on, and `input` is their edit of the card's field, when it has one.
   */
  pluginConsent(consentId: string, approved: boolean, always?: boolean, input?: string): Promise<{ resolved: boolean }>;

  /**
   * Claude Code permissions for game chats. Studio UI only (main-frame guarded); the harness has
   * no equivalent, so no agent can change its own mode or answer its own request.
   */
  permissions(): Promise<PermissionSettingsView>;
  /** The chat's mode (and the mode new chats start in); `threadId` null sets only the latter. */
  setPermissionMode(threadId: string | null, mode: PermissionMode): Promise<PermissionSettingsView>;
  /** The user's answer to a `tool_permission` card; `resolved` is false once it is no longer waiting. */
  answerPermission(requestId: string, answer: ToolPermissionAnswer): Promise<{ resolved: boolean }>;
  /** Stop allowing a saved "always allow" rule for a game. */
  forgetPermission(project: string, rule: string): Promise<PermissionSettingsView>;

  /**
   * MCP connectors. Values never cross this boundary in either direction: a connector carries
   * env and header NAMES, and `mcpSave` takes the values it is given straight to the OS secret
   * store. `mcpList` reports which names have a value stored, never the value.
   */
  mcpList(project?: string | null): Promise<McpConnectorView[]>;
  connections(threadId?: string, project?: string | null): Promise<import("./connections.ts").ConnectionSnapshot>;
  /** `secrets` keys are `env.<NAME>` / `header.<NAME>`; an empty string clears one. */
  mcpSave(
    connector: McpConnectorDraft & { createdAt?: string },
    secrets?: Record<string, string>,
  ): Promise<McpConnectorView>;
  mcpRemove(id: string): Promise<void>;
  /** Connect once, list the tools, disconnect — without touching the live connection. */
  mcpTest(id: string): Promise<McpTestResult>;
  mcpConnect(id: string, project?: string): Promise<McpTestResult>;
  mcpCancelAuthorization(id: string): Promise<void>;
  mcpDisconnectAccount(id: string): Promise<void>;
  mcpTools(id: string): Promise<McpToolSummary[]>;
  /** A plugin's connector asks again before every call: its "Always allow" answers are forgotten. */
  mcpForgetAlwaysAllowed(id: string): Promise<void>;

  /** The platform and where startup stands (`shared/boot.ts`); the renderer asks before anything else. */
  bootState(): Promise<BootState>;
  /** Re-run core startup from the sandbox setup screen; answers the state after the attempt. */
  retrySandboxSetup(): Promise<BootState>;
  /**
   * Windows: install the protected workspace (one administrator prompt), then re-run startup;
   * answers whether it was installed or the prompt was dismissed, and the state after.
   */
  setUpSandbox(): Promise<SandboxSetupResult>;
  /** Send the team a report of a Set up that failed with `error`, with this build's recent log; throws when it was not taken. */
  reportSandboxSetup(error: string): Promise<void>;
  /** Quit the app from the screen of a studio that would not start. */
  quitFromBoot(): Promise<void>;
  /**
   * Paint the Windows and Linux window controls (`titleBarOverlay`) in the theme's colours, with no box
   * of their own on Windows while `seeThrough`; macOS ignores it.
   */
  setWindowControls(controls: WindowControls): Promise<void>;
  /** The new version of the app downloaded in the background, or null; `onEvent` announces later ones. */
  readyUpdate(): Promise<ReadyUpdate | null>;
  /**
   * Quit and relaunch into the downloaded version. Asks first while a run is active; says why it
   * did not relaunch: nothing to install, a Relaunch already asking, or the person kept the run going.
   */
  restartToUpdate(): Promise<RestartAnswer>;
  /** Check for a newer version now (Settings → About, the app menu); a found one also announces itself. */
  checkForUpdates(): Promise<UpdateCheckResult>;
  /** Open the waiting downloadable release's page in the browser; false when none waits. */
  openUpdateDownload(): Promise<boolean>;
  /** What is running (Settings → About): version, platform and architecture. */
  appAbout(): Promise<AppAbout>;
  bootstrap(): Promise<Bootstrap>;
  send(text: string, options?: ComposerSendOptions): Promise<boolean>;
  /** A sent message's failed @ tag, fetched again or taken off; its result card shows the outcome. */
  mentionRetry(threadId: string, messageId: string, tag: MentionRef, action: MentionRetry): Promise<void>;
  answerPlan(threadId: string, id: string, approved: boolean): Promise<boolean>;
  cancelTurn(threadId: string): Promise<boolean>;
  changeQueuedMessage(
    threadId: string,
    messageId: string,
    operation: "hold" | "edit" | "remove",
    text?: string,
  ): Promise<void>;
  /** What rewinding the chat to a message (its bubble's event and queue ids) would do to the game files. */
  rewindPreview(
    threadId: string,
    eventId: string,
    messageId: string,
  ): Promise<import("./chat-rewind.ts").RewindPreview>;
  /** Rewind the chat to just before that message; `files` also puts the game files back. */
  rewindChat(
    threadId: string,
    eventId: string,
    messageId: string,
    files: boolean,
  ): Promise<import("./chat-rewind.ts").RewindResult>;
  /**
   * Bring back the game files (and, through the restore steps, the engine's state) as they were
   * just before the chat's newest rewind; the conversation stays rewound. Refused once a message
   * was sent after it, or once it came back.
   */
  undoRewind(threadId: string, rewindId: string): Promise<import("./chat-rewind.ts").UndoRewindResult>;
  /** Every thread's events after `after`; ask again with the returned `cursor`, not an event id. */
  events(after?: string): Promise<EventFeed>;
  threadEvents(threadId: string): Promise<EventEnvelope[]>;
  chatPage(threadId: string, before?: string): Promise<import("./chat-history.ts").ChatPage>;
  threads(): Promise<ConversationRecord[]>;
  newGameThread(project?: string): Promise<ConversationRecord>;
  threadForGame(project: string): Promise<ConversationRecord>;
  renameThread(threadId: string, title: string): Promise<ConversationRecord>;
  compactThread(threadId: string, options?: { engine?: string; model?: string }): Promise<boolean>;
  archiveGame(project: string): Promise<boolean>;
  /**
   * Play for a game being made: its folder's newest app for this computer, started in the game
   * sandbox or brought forward, or why not (none, older than the last change, being packaged).
   */
  playGameBuild(project: string): Promise<import("./play-native.ts").LocalPlayAnswer>;
  /** What freeing space deletes now, in one game or (none named) in all of them. */
  storageSpace(project?: string): Promise<import("./storage-space.ts").StorageSpace>;
  /** Free space in one game (refused while it works) or (none named) in every game not working. */
  freeStorage(project?: string): Promise<import("./storage-space.ts").StorageFreed>;
  /** Settings → Storage (Windows): the folder Genex keeps its files in, and the last move that did not happen. */
  dataFolder(): Promise<import("./data-folder.ts").DataFolderState>;
  /**
   * Settings → Storage: asks for a folder to keep Genex's files in and checks it; null when
   * cancelled. Nothing is written until {@link moveDataFolder}.
   */
  chooseDataFolder(): Promise<import("./data-folder.ts").DataFolderChoice | null>;
  /** Move Genex's files to the folder chosen last: Genex restarts and moves them; a refusal says why. */
  moveDataFolder(): Promise<import("./data-folder.ts").DataFolderChoice>;
  /** Takes back a game's engine link from its chat line; refused once the link has changed since. */
  undoEngineLink(request: import("./game-engine.ts").EngineLinkUndo): Promise<boolean>;
  /** The person's Stop on a job's chat line: the job's record, or null for a job the game never had. */
  stopJob(project: string, jobId: string): Promise<import("./jobs.ts").JobRecord | null>;
  /** Opens macOS System Settings at the Privacy & Security pane that grants what app_look needs. */
  openPrivacySettings(pane: import("./jobs.ts").AppLookAccessKind): Promise<boolean>;
  engines(): Promise<EngineDescriptor[]>;
  /** Plan limits of each signed-in subscription; reading them never starts a turn. */
  providerUsage(): Promise<ProviderUsageReport[]>;
  hardware(): Promise<HardwareReport>;
  games(): Promise<GameProject[]>;
  /** A new game in a fresh folder of its own: in the games folder, or inside `parent` when the user chose one. */
  /** `provisional`: the title waits for the game's first idea (`GameName.provisional`). */
  createGame(title: string, options?: { parent?: string; provisional?: boolean }): Promise<GameProject>;
  /** A name for a game started from its first request, by the model picked for it; never fails for want of a model. */
  nameGame(request: GameNameRequest): Promise<GameName>;
  /** A live background for home from a description, by the model picked on home (`core/backdrop-generation.ts`). */
  makeBackdrop(request: BackdropShaderRequest): Promise<BackdropShaderResult>;
  /**
   * Create game's location: the native folder dialog, answered with the folder checked as
   * creating there will be. Resolves to null when cancelled; a refused folder rejects with why.
   */
  pickGameLocation(): Promise<GameLocation | null>;
  /** Settings → Games: asks for a folder for new games; resolves to its label, or null when cancelled. */
  chooseGamesRoot(): Promise<string | null>;
  updateGame(project: string, patch: import("./game-library.ts").GameUpdate): Promise<GameProject>;
  removeGame(project: string): Promise<void>;
  snapshots(): Promise<SnapshotRecord[]>;
  selfChanges(): Promise<{ changes: SelfChange[] }>;
  studioActivity(): Promise<import("./studio-activity.ts").StudioActivityItem[]>;
  /** With `graphFrom`, `graphEvents` holds only the events after it; `graphEventsFrom` says where they start. */
  runSummary(
    project: string,
    runId: string,
    graphFrom?: import("./run-summary-feed.ts").GraphCursor | null,
  ): Promise<import("./run-summary.ts").RunSummary>;
  onRunSummary(
    project: string,
    runId: string,
    listener: (summary: import("./run-summary.ts").RunSummary) => void,
  ): () => void;
  runReview(project: string, runId?: string): Promise<LoopRunReview>;
  settings(): Promise<StudioSettingsView>;
  setSettings(patch: {
    learning?: boolean;
    buildersMax?: number;
    agentsMax?: number;
    blender?: boolean;
    autoResume?: boolean;
    computerControl?: boolean;
    language?: LanguageChoice;
  }): Promise<StudioSettingsView>;
  /** Settings → Copy diagnostics: versions, provider status and the recent log, already redacted. */
  diagnostics(): Promise<string>;
  /** Send feedback (the sidebar's bug button): posts the report to genex.games; throws when it was not taken. */
  sendFeedback(draft: import("./feedback.ts").FeedbackDraft): Promise<void>;
  /** Settings → Licenses: Genex's MIT license and the third-party notices this build ships. */
  licenses(): Promise<import("./licenses.ts").LicenseTexts>;
  /** Settings → Privacy: whether Share build metrics is on, paused or offered at all. */
  runSharingStatus(): Promise<RunSharingStatus>;
  /** Turn Share build metrics on (for the current consent version) or off; off forgets unsent rows. */
  setRunSharing(on: boolean): Promise<RunSharingStatus>;
  /** See what would be sent: the real next row, or null before any build finished. */
  runSharingPreview(): Promise<FieldRow | null>;
  /** Delete what I shared: every row of this install's ids, proven by their secrets. */
  deleteSharedRuns(): Promise<RunSharingDeleteResult>;
  /** The modeller (AG-930): detection status; the one-click download; cancel. */

  recheckEngines(engine?: string): Promise<boolean>;
  refreshModels(provider: string): Promise<boolean>;
  cliUpdate(provider: string): Promise<import("./cli-install.ts").CliInstallJob>;
  subscriptionSignIn(opts?: {
    engine?: string;
    separate?: boolean;
    /** The account to sign in to (`SubscriptionAccountView.id`), or `NEW_ACCOUNT` for one more. */
    account?: string;
  }): Promise<{ started: boolean; missingCli?: boolean; error?: string }>;
  /** A subscription's accounts: the Terminal login, Studio's own and any added ones. */
  subscriptionAccounts(engine: string): Promise<import("./subscription-accounts.ts").SubscriptionAccountView[]>;
  /** Run a subscription on one of its accounts from the next message on; answers its status. */
  subscriptionUseAccount(engine: string, account: string): Promise<import("./engine-descriptor.ts").EngineStatus>;
  /** The Claude sign-in as the card shows it: which phase, and the code box when one is wanted. */
  claudeLoginState(): Promise<ClaudeLoginState>;
  claudeLoginCode(code: string): Promise<ClaudeLoginState>;
  claudeLoginOpenBrowser(): Promise<unknown>;
  claudeLoginCancel(): Promise<unknown>;
  /** OpenCode's own sign-in (`opencode auth login`), in the terminal dock. */
  openCodeSignIn(): Promise<{ started: boolean; missingCli?: boolean }>;
  /** Grok Build's own sign-in (`grok login`, a Grok account in the browser), in its Settings row. */
  grokSignIn(): Promise<{ started: boolean; missingCli?: boolean }>;
  /** Cursor's own sign-in (`cursor-agent login`), in a terminal in its Settings row. */
  cursorSignIn(): Promise<{ started: boolean; missingCli?: boolean }>;
  /** Sign Cursor's CLI out of the account Genex runs on; answers Cursor's status. */
  cursorSignOut(): Promise<import("./engine-descriptor.ts").EngineStatus>;
  /**
   * Check a pasted OpenRouter API key with OpenRouter and keep it in the OS secret store when it is
   * accepted. The answer is OpenRouter's status; the key never comes back.
   */
  openRouterKeySave(key: string): Promise<import("./engine-descriptor.ts").EngineStatus>;
  /** Forget the saved OpenRouter key. */
  openRouterKeyClear(): Promise<import("./engine-descriptor.ts").EngineStatus>;
  /** Whether a TypeSafe key is saved for pilots' fast decisions (optional: pilots choose by their own order without one). */
  typeSafeKeyStatus(): Promise<import("./fast-decisions.ts").FastDecisionKeyStatus>;
  /** Check a pasted TypeSafe key with TypeSafe and keep it in the OS secret store when it is taken; the key never comes back. */
  typeSafeKeySave(key: string): Promise<import("./fast-decisions.ts").FastDecisionKeyStatus>;
  /** Forget the saved TypeSafe key. */
  typeSafeKeyClear(): Promise<import("./fast-decisions.ts").FastDecisionKeyStatus>;
  /**
   * Connect OpenRouter in the browser: OpenRouter's page opens, and the call settles once the
   * person approved Genex there (the key is then checked and saved, never sent back), cancelled,
   * or it failed. A new call replaces one still waiting.
   */
  openRouterSignIn(): Promise<import("./openrouter-login.ts").OpenRouterSignInResult>;
  /** Open the waiting sign-in's page again; false when none is waiting. */
  openRouterSignInReopen(): Promise<boolean>;
  /** Stop the waiting sign-in; false when none is waiting. */
  openRouterSignInCancel(): Promise<boolean>;
  /**
   * Check a pasted Opper API key with Opper and keep it in the OS secret store when it is accepted.
   * The answer is Opper's status; the key never comes back.
   */
  opperKeySave(key: string): Promise<import("./engine-descriptor.ts").EngineStatus>;
  /** Forget the saved Opper key. */
  opperKeyClear(): Promise<import("./engine-descriptor.ts").EngineStatus>;
  /**
   * Connect a model server the person runs (`shared/local-server.ts`): check the address is on this
   * computer or the local network, ask the server for its models with the key when one is given,
   * and save both only when it answers. The key never comes back.
   */
  localServerConnect(url: string, key?: string): Promise<import("./local-server.ts").LocalServerConnectResult>;
  /** Forget the saved local server's address and key. */
  localServerForget(): Promise<import("./engine-descriptor.ts").EngineStatus>;
  /** The model servers answering on this computer's usual ports, for Settings to offer. */
  localServerFind(): Promise<import("./local-server.ts").FoundLocalServer[]>;
  terminalList(): Promise<import("./terminal.ts").TerminalSession[]>;
  terminalAccessibility(): Promise<boolean>;
  terminalOpen(project: string): Promise<import("./terminal.ts").TerminalSession>;
  /** Run one command a chat reply offered, in the game's folder, as its own terminal session. */
  terminalRun(project: string, command: string): Promise<import("./terminal.ts").TerminalSession>;
  terminalAttach(id: string): Promise<void>;
  terminalInput(id: string, data: string): Promise<void>;
  terminalResize(id: string, cols: number, rows: number): Promise<void>;
  terminalAcknowledge(id: string, count: number): Promise<void>;
  terminalStop(id: string): Promise<void>;
  terminalRemove(id: string): Promise<void>;
  /** Open, in the browser, the sign-in page this terminal session printed (none: nothing opens). */
  terminalOpenLink(id: string): Promise<void>;
  onTerminal(listener: (event: import("./terminal.ts").TerminalEvent) => void): () => void;
  onClaudeLogin(listener: (state: ClaudeLoginState) => void): () => void;
  codexLoginState(): Promise<CodexLoginState>;
  codexLoginCancel(): Promise<CodexLoginState>;
  codexLoginDismiss(): Promise<unknown>;
  codexLoginOpenBrowser(): Promise<unknown>;
  codexLoginRetry(method: "browser" | "device"): Promise<CodexLoginState>;
  onCodexLogin(listener: (state: CodexLoginState) => void): () => void;
  /** Sign Studio out of one of its own accounts (Studio's first when `account` is unset). */
  subscriptionForgetStudioLogin(engine?: string, account?: string): Promise<boolean>;
  openUrl(url: string): Promise<boolean>;
  /** Play: one page of a tab of genex.games' catalog. */
  playFeed(request: PlayFeedRequest): Promise<PlayFeedPage>;
  /** Play: each shelf's count and the tabs with something in them, shelf by shelf. */
  playShelves(): Promise<PlayShelves>;
  /** Play: what on one shelf of the catalog answers a search, best first. */
  playSearch(query: string, shelf: PlayShelf): Promise<PlayGame[]>;
  /** The whole catalog for the composer's @ picker: every shelf, who made each, whether it may be taken. */
  playCatalog(): Promise<GenexCatalogItem[]>;
  /**
   * Play: copy a game's public source into a new game of the person's own; answers its library name,
   * or why nothing was made (a source with no game in it).
   */
  playRemix(slug: string): Promise<PlayRemixAnswer>;
  /** Play: whether each named game's source holds a game, so its card offers Remix. */
  playRemixReady(slugs: string[]): Promise<Record<string, boolean>>;
  /** Play: players in each named game now; a game nobody counts is left out. */
  playOnline(slugs: string[]): Promise<Record<string, number>>;
  /** Play: open a game full screen in the viewer, its bar showing `title`; how it goes arrives as `UiEvent.PlayViewer`. */
  playOpen(slug: string, title: string): Promise<void>;
  /** Play: a game's own page (a native game's, which has no web build to open): its card and what the page adds. */
  playGame(slug: string): Promise<PlayGameDetail>;
  /** Play: install a game's build for this computer; how it goes arrives as `UiEvent.PlayInstalls`. */
  playInstall(slug: string): Promise<void>;
  /** Play: stop a game's install, waiting or under way, or forget how a failed one ended. */
  playInstallCancel(slug: string): Promise<void>;
  /** Play: every game installed on this computer and every install under way or failed. */
  playInstalls(): Promise<NativeInstalls>;
  /** Play: remove a game from this computer; its saves stay. */
  playUninstall(slug: string): Promise<void>;
  /** Play: play an installed game in its own window (a running one comes forward); how it goes arrives as `UiEvent.PlaySessions`. */
  playLaunch(slug: string): Promise<void>;
  /** Play: bring a running game forward, quit it, or forget how it failed to start. */
  playSession(slug: string, action: SessionAction): Promise<void>;
  /** Play: the games being played in their own windows, and the ones that failed to start. */
  playSessions(): Promise<NativeSession[]>;
  /** Play: show an installed game's app in Finder. */
  playRevealInstall(slug: string): Promise<void>;
  /** Play: like or unlike a game from its own page, as the Genex account; answers its likes after. */
  playLike(slug: string, liked: boolean): Promise<{ liked: boolean; likes: number }>;
  /** Play: close the viewer. */
  playClose(): Promise<void>;
  /** Play: the game a `genex://game/<slug>` link asked to open, once; null when none waits. */
  playTakeGameLink(): Promise<string | null>;
  /** Play: one of the viewer header's controls (Like, Share, Exit…); main answers with `UiEvent.PlayViewer`. */
  playControl(control: PlayControl, at?: PlayPoint): Promise<void>;
  /** Play: whether the viewer bar's Comments is open (main lays its layer over the whole window). */
  playBar(hold: PlayBarHold): Promise<void>;
  /** Play: a page of the viewed game's comments, newest first: the first, or the one after `cursor`. */
  playComments(cursor: string | null): Promise<PlayCommentsPage>;
  /** Play: post a comment on the viewed game as the Genex account; the comment as saved. */
  playComment(body: string): Promise<PlayComment>;
  /** Play: delete one of the account's comments on the viewed game. */
  playUncomment(commentId: string): Promise<void>;
  /**
   * Play: the bar's answer to the purchase sheet numbered `sheet` (Pay, Cancel…). Main acts only on
   * the sheet on screen and the purchase it holds; Play's bar layer alone may send it.
   */
  playPurchase(sheet: number, answer: PurchaseAnswer): Promise<void>;
  /** Play: the Genex account the app is signed in as, or null while it is signed out. */
  playMe(): Promise<PlayMe | null>;
  /** Play: rename the account (2–20 characters); the account as it is after. */
  playRename(name: string): Promise<PlayMe | null>;
  /** Play: make a square WebP picture (at most 512 KB) the account's avatar; the account as it is after. */
  playAvatar(webp: Uint8Array): Promise<PlayMe | null>;
  /** Play: anyone's public profile and games, with the viewer's relationship to them. */
  playProfile(userId: string): Promise<PlayProfile>;
  /** Play: the Friends page, read at once: friends, requests both ways, visibility, invite link. */
  playFriends(): Promise<PlayFriendsPage>;
  /** Play: add, accept, withdraw or remove a friend; the relationship after it. */
  playFriend(request: FriendActionRequest): Promise<FriendStatus>;
  /** Play: people whose name matches, to add them. */
  playPeople(query: string): Promise<PlayPeopleResult>;
  /** Play: whether friends see the game the account is in. */
  playVisibility(visibility: PresenceVisibility): Promise<PresenceVisibility>;
  /** Play: show the generated avatar or the uploaded photo, in the app and on genex.games; the account after. */
  playAvatarStyle(style: AvatarStyle): Promise<PlayMe | null>;
  /** Play: show another generated avatar, in the app and on genex.games; the account after. */
  playAvatarVariant(variant: number): Promise<PlayMe | null>;
  /** Play: the account's own stats for a period; null while genex.games has none to give. */
  playStats(days: StatsPeriod): Promise<PlayStats | null>;
  /** Play: the Top creators row; null while genex.games does not rank creators. */
  playCreators(): Promise<PlayCreator[] | null>;
  /** The Genex plugin's Credits tab: balance, plan, invite bonus, live prices and recent spends. */
  playCredits(): Promise<PlayCredits>;
  /** Play: what a typed nickname is: a shape problem or the account's own at once, else genex.games' answer. */
  playHandleCheck(handle: string): Promise<HandleCheck>;
  /** Play: make a nickname the account's (its own one again confirms it); a refusal says why. */
  playSetHandle(handle: string): Promise<HandleSave>;
  /** Play: the Mac's share menu for a page of Play's website (an invite or a profile link), by `at`. */
  playShare(url: string, at?: PlayPoint): Promise<void>;
  /**
   * Play: change a published game from its card menu (mobile flag, tags, remixing, Unpublish,
   * Delete); genex.games checks who may. Fails when it refused or could not be reached.
   */
  playManage(gameId: string, change: PlayGameChange): Promise<PlayChangeResult>;
  /** Play: make a picture (already cropped to 16:9) a published game's cover on genex.games. */
  playCover(gameId: string, image: Uint8Array, contentType: PlayCoverType): Promise<PlayCoverResult>;
  /** Store: a game's Store tab (its items on sale, then the shared ones it added); empty when it sells nothing or the store is off. */
  storeItems(slug: string): Promise<StoreTab>;
  /** Store: My items on a game's page, each marked Works here or Not in this game; signed out, `unauthorized`. */
  storeMyItems(slug: string): Promise<MyItem[] | StoreRefused>;
  /** Store: "Works in N games", with the first games' covers. */
  storeItemGames(itemId: string): Promise<ItemGames>;
  /**
   * Store: buy an item on a game's page. Main starts the purchase and shows Play's sheet for it
   * (`onStoreSheet`); answers when the sheet closes, or with genex.games' refusal before any sheet.
   */
  storeBuy(itemId: string, slug: string): Promise<StoreBuyResult>;
  /** Store: the studio window's answer to the purchase sheet numbered `sheet`; main acts only on the one on screen. */
  storeAnswer(sheet: number, answer: PurchaseAnswer): Promise<void>;
  /** Store: the purchase sheet main draws in the studio window, or null once it closes. */
  onStoreSheet(listener: (sheet: StoreSheet | null) => void): () => void;
  /** Store: claim a Free item on a game's page; a second claim replays the first. */
  storeClaim(itemId: string, slug: string): Promise<StoreClaimed | StoreRefused>;
  /** Store: a profile's shelf, at most five items; none for a person genex.games does not know. */
  storeShelf(userId: string): Promise<ShelfItem[]>;
  /** The coin the Genex account may spend, for the account plate in Play; null signed out or with coin off. */
  storeCoins(): Promise<number | null>;
  /** Get Nex: genex.games' coin page in the browser. */
  storeGetCoin(): Promise<void>;
  /** Store: report an item (Copy, Doesn't work, Inappropriate, Scam), as the account when there is one. */
  storeReport(itemId: string, reason: ItemReportReason, message: string | null): Promise<true | StoreRefused>;
  /** Create › Items › Browse: other creators' shared items, a page at a time. */
  itemsBrowse(query: string, cursor: string | null, tags?: string[]): Promise<BrowsePage | StoreRefused>;
  /** Create › Items › Browse: one item's detail panel. */
  itemsBrowseDetail(itemId: string): Promise<BrowseDetail | StoreRefused>;
  /** Create › Items: Add to \<game>, a game of the account's named by its Genex project id. */
  itemsAddToGame(itemId: string, projectId: string): Promise<ItemAdded | StoreRefused>;
  /** Create › Items: take a shared item out of one of the account's games. */
  itemsRemoveFromGame(itemId: string, projectId: string): Promise<ItemAllowance | StoreRefused>;
  /** Create › Items › Selling: the ready / on-hold strip and the account's items. */
  itemsSelling(): Promise<Selling | StoreRefused>;
  /** Create › Items: Put on sale, from the listing draft card or Selling. Only Studio's own button publishes (D40). */
  itemPutOnSale(itemId: string): Promise<CreatorItem | StoreRefused>;
  /** Create › Items › Selling: Take off sale; owners keep it. */
  itemTakeOffSale(itemId: string): Promise<CreatorItem | StoreRefused>;
  /** Create › Items: "Other games can use it", on or off. */
  itemSetShared(itemId: string, shared: boolean): Promise<CreatorItem | StoreRefused>;
  /** A game's local item drafts as Studio holds them: approvals, drafts and what became of each after its publish. */
  itemsLocal(project: string): Promise<LocalItemsView>;
  /** "Sell when published" on a local draft as its card shows it (`contentHash`); kept in Studio's app data. */
  itemsLocalApprove(project: string, localId: string, contentHash: string): Promise<LocalItemsView>;
  /** Undo "Sell when published" on a local draft. */
  itemsLocalWithdraw(project: string, localId: string): Promise<LocalItemsView>;
  /** "Other games can use it" on a local draft, whose card shows `contentHash`: main runs the CLI's `shop set`. */
  itemsLocalShare(project: string, localId: string, contentHash: string, shared: boolean): Promise<LocalShareResult>;
  /**
   * Settle a game's local drafts once it is on Genex: upload them, then put on sale only what the
   * person approved unchanged. Paced in main; `force` right after a publish finished.
   */
  itemsLocalSettle(project: string, force: boolean): Promise<LocalItemsView>;
  /** The app's Genex account: signed out, signing in, signed in, or a sign-in genex.games ended. Never asks the network. */
  genexAccount(): Promise<GenexAccountView>;
  /** Sign in to Genex in the browser (again, after a sign-in ended); the account as it is after. */
  genexSignIn(): Promise<GenexAccountView>;
  /** Stop a sign-in waiting in the browser; the account as it is after. */
  genexCancelSignIn(): Promise<GenexAccountView>;
  /** Sign out of Genex once the person confirms in Studio's question; the account as it is after. */
  genexSignOut(): Promise<GenexAccountView>;
  /**
   * Building with Genex: its page on genex.games in the browser, signing in there first while the
   * app is not, then Pro or a credit pack; `idea` is the waiting message it shows back.
   */
  genexBuild(idea?: string): Promise<GenexAccountView>;
  /** A macOS notification; clicking it focuses Studio and sends `notification.open` with the id. */
  notify(note: { id?: string; title: string; subtitle?: string; body: string }): Promise<boolean>;
  /** The Dock badge: how much work waits on the person. Zero clears it. */
  setBadge(count: number): Promise<boolean>;
  rollback(snapshotId: string): Promise<boolean>;
  /** Take back one learned change, leaving every later change and the game lessons in place. */
  undoChange(snapshotId: string): Promise<{ file: string }>;
  loadPreview(project: string): Promise<string>;
  /**
   * Live loads the game's finished web build in a folder (a Godot or Unity export in web/) when it
   * runs the game's folder without it, as when the game was opened before its export existed; never
   * a build the person chose to view or a stopped game. A build still being written is `Unfinished`.
   */
  loadWebBuild(project: string): Promise<WebBuildLoad>;
  buildPreview(
    request: import("./build-preview.ts").BuildPreviewRequest,
  ): Promise<import("./build-preview.ts").BuildPreviewFrame | null>;
  /** Every window a worker is driving right now, with its last frame. */
  agentScreens(): Promise<import("./agent-screen.ts").AgentScreenFrame[]>;
  readRunStill(file: string, maxPx?: number): Promise<{ mimeType: string; data: string } | null>;
  /** Everything under the game's `assets/` and `public/assets/`, with where each file came from. */
  previewProjectAsset(p: {
    project: string;
    file: string;
    maxBytes?: number;
  }): Promise<{ mimeType: string; data: Uint8Array<ArrayBuffer> }>;
  /** Which delivered files the game folder holds now; a build's files arrive when it lands. */
  presentProjectAssets(p: { project: string; files: string[] }): Promise<string[]>;
  /** What these GLB and glTF files hold, read from their headers: meshes, clips and bones; other files are skipped. */
  projectModelRigs(p: { project: string; files: string[] }): Promise<ModelRig[]>;
  projectAssets(project: string): Promise<ProjectAssets>;
  /** The Genex account's asset library on genex.games, newest first; throws signed out. */
  assetLibrary(query: LibraryQuery): Promise<LibraryPage>;
  /** Where each of a game's files stands with the library: saved, shared, can be shared. */
  assetLibraryStates(project: string): Promise<GameLibraryStates>;
  /** Save game files to the library (sending those Genex did not make), or take Saved off; the states after. */
  assetSave(project: string, files: string[], saved: boolean): Promise<GameLibraryStates>;
  /** Share game files to Play, each under its name; how each went. */
  assetShare(project: string, items: ShareItem[]): Promise<ShareOutcome[]>;
  /** Stop sharing a game file on Play; the states after. */
  assetUnshare(project: string, file: string): Promise<GameLibraryStates>;
  /** Bring a library generation or a shared asset into a game; where it landed. */
  assetAdd(project: string, source: AddSource): Promise<AddOutcome>;
  /**
   * A library file's bytes for a tile's picture: only an https file on genex.games' asset hosts,
   * within a cap; otherwise why there are none (too large, refused, or unavailable for now).
   */
  assetLibraryFile(url: string): Promise<LibraryFileAnswer>;
  /**
   * One image from inside the game, contained and byte-sniffed. `maxPx` asks for a thumbnail;
   * `scope: "genex-inspection"` reads the one saved frame of the named job instead, and
   * `scope: "genex-cover"` the game's kept Genex cover shot (no file: the host knows where it is).
   */
  readProjectAsset(p: ProjectAssetRead): Promise<{ mimeType: string; data: string } | null>;
  runFeedback(p: {
    threadId: string;
    runId?: string;
    facetId?: string;
    camera?: string;
    iteration?: number;
    text: string;
    /** What the note is about, as the chat names it ("Tall mountain · try 5"). */
    label?: string;
  }): Promise<{ ok: true }>;
  playSnapshot(snapshotId: string, project: string): Promise<{ dir: string; snapshotId: string }>;
  /** A run's build (its integration head, any commit) in the user's window, from a worktree; the game folder is untouched. */
  showBuild(project: string, commit: string): Promise<{ dir: string; commit: string }>;
  /** Merge a build into the live game folder and show it. */
  landBuild(project: string, commit: string): Promise<{ commit: string; how: "merged" | "already" }>;
  /**
   * Where the native game view sits (zero while anything covers it), and the window size it was
   * measured in (main carries it through resizes).
   */
  previewBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    viewport?: { width: number; height: number };
  }): Promise<boolean>;
  /** The Live game's sound switch; main decides when Live is actually heard. */
  previewSound(request: import("./game-sound.ts").GameSoundRequest): Promise<boolean>;
  /** Reload the stage. `retry` is the build-failure strip's "Try again": build it again from scratch. */
  reloadPreview(options?: { retry?: boolean }): Promise<boolean>;
  /** Stop: take the Live game off its view, so it runs no scripts, frames or sound until Play. */
  stopPreview(): Promise<boolean>;
  /** Play a stopped Live game again: the same page, from the top. */
  playPreview(): Promise<boolean>;
  /** Full screen: the window goes full screen with the Live game over all of it; holding Esc, or its exit button, ends it. */
  previewFullScreen(): Promise<boolean>;
  /** What waits for this game's Live Reload and the build Live shows, as `live.behind` says it: read on mount. */
  liveBehind(project: string): Promise<LiveBehindEvent>;
  previewState(): Promise<unknown>;
  /** The Live game as it looks now (a JPEG data URL), taken before a dialog covers it; null when there is none. */
  previewCoverStill(): Promise<string | null>;
  /** Whose page Live holds, whether it is still navigating, and whether its requests have settled. */
  previewLive(): Promise<{
    project: string | null;
    navigating: boolean;
    /** The person stopped the game (`stopPreview`): Live holds no page until Play. */
    stopped: boolean;
    loadError: string | null;
    /** What kind of failure `loadError` is (Chromium's, or the game's own build); null while there is none. */
    loadFailure: import("./preview-contract.ts").LiveLoadFailure | null;
    crashed: boolean;
    /** Why the page's renderer went away while `crashed`; null while it runs. */
    gone: import("./preview-contract.ts").PreviewGone | null;
    /** The page's loop stopped answering and has not answered since. */
    unresponsive: boolean;
    page: { complete: boolean; resources: number; state: Record<string, unknown> | null } | null;
  }>;
  /** Why the stage cannot show this game's own build; null when the last build was fine. */
  buildProblem(project: string): Promise<BuildProblem | null>;
  /**
   * Install this game's packages — the one action that reaches the network, on the user's press.
   * `scripts`: the person trusts a remix's setup scripts, which then run (and from then on).
   */
  installPackages(project: string, options?: { scripts?: boolean }): Promise<InstallResult>;
  stopRun(runId: string): Promise<boolean>;
  /** Wrap up: the builders finish what they are on, then the run integrates, checks and shows. */
  finishRun(runId: string, threadId: string): Promise<boolean>;
  resumeAutopilot(runId: string): Promise<boolean>;
  exportGame(project: string): Promise<{ dir: string; files: number; included: string[]; excluded: string[] }>;
  modelInstallStatus(): Promise<import("./model-install.ts").ModelInstallJob | null>;
  /** Install Claude Code or Codex with its vendor's own installer, or join the install already running. */
  cliInstall(provider: string): Promise<import("./cli-install.ts").CliInstallJob>;
  /** The latest in-app install of each CLI, running or finished. */
  cliInstallStatus(): Promise<import("./cli-install.ts").CliInstallJob[]>;
  pullModel(model: string): Promise<boolean>;
  /** Add from Ollama: an exact tag's download size and fit on this Mac, from the public registry. */
  lookupModel(
    model: string,
  ): Promise<
    | { ok: true; id: string; sizeGb: number; fits: boolean; needGb: number; needsRamGb: number | null }
    | { ok: false; reason: "invalid" | "not_found" | "unavailable"; id?: string; error?: string }
  >;
  cancelModelDownload(): Promise<boolean>;
  /** Delete a downloaded local model (Bonsai or Ollama) from this Mac. */
  removeModel(model: string): Promise<boolean>;
  /** "Raise context to 16K": a copy of an Ollama model that runs with a 16K context; its model id. */
  raiseModelContext(model: string): Promise<string>;
  revealProject(project: string, file?: string): Promise<boolean>;
  /** A file the chat names, from that chat's game folder or its run's unlanded build. */
  readGameFile(threadId: string, path: string): Promise<GameFile>;
  revealGameFile(threadId: string, path: string): Promise<boolean>;
  /** Which names the chat wrote are files on this computer, and how each opens (null: not a file). */
  resolveChatFiles(threadId: string, refs: ChatFileRef[]): Promise<Array<ChatFileLink | null>>;
  /** Opens a file the chat named in its app, or shows it; `problem` when no app opened it. */
  openChatFile(threadId: string, ref: ChatFileRef): Promise<{ open: ChatFileOpenOutside; problem?: string }>;
  /** The images sent with a chat message. */
  messageImages(threadId: string, messageId: string): Promise<ReferenceFrame[]>;
  /**
   * Where a file the person dropped or pasted is on this computer, so a message can link it; ""
   * for one that is only data (a pasted screenshot). Answered by the preload, never by main.
   */
  pathOfFile(file: File): string;
  /**
   * The computer's languages in order, as main reads them, so the window's System is the menus'.
   * Answered by the preload from the page's arguments (`shared/locale.ts`), never by main.
   */
  systemLanguages(): readonly string[];
  /**
   * The native folder dialog. It answers *which folder* only — nothing is written by picking, and
   * the answer goes straight back to `inspectFolder`/`adoptFolder`; the renderer shows the folder
   * as `pathLabel`, never as the path it holds here.
   */
  pickProject(): Promise<string | null>;
  /** What a folder holds — games in it and one level down, how each runs, what would stop a run. Writes nothing. */
  inspectFolder(dir: string): Promise<FolderInspection>;
  /**
   * Open a folder as a game: the Open Game sheet's button, and the first thing that writes.
   * `versionNested` is the consent the row carried — the studio may make the game inside this
   * folder part of its history when a build goes live.
   */
  adoptFolder(
    dir: string,
    options?: {
      subdir?: string;
      template?: boolean;
      versionNested?: boolean;
      title?: string;
      trustProjectSettings?: boolean;
    },
  ): Promise<GameProject>;
  openProject(name: string): Promise<GameProject>;
  /** The transient UI events main pushes (`shared/ui-events.ts`); narrow on `type` to read the payload. */
  onEvent(listener: (event: UiEvent) => void): () => void;
}

export interface StudioSettingsView {
  /** Self-improvement: off, Studio changes nothing about itself. */
  learning: boolean;
  /** Maximum builders a run may use at once; the lead decides how many it starts. */
  buildersMax?: number;
  agentsMax?: number;
  /** may builders model in Blender (AG-930); on by default */
  blender?: boolean;
  /** Resume builds automatically after an engine limit resets or the loop restarts; on by default. */
  autoResume?: boolean;
  /** Let agents control your computer (Settings → Permissions, macOS and Windows); off by default. */
  computerControl?: boolean;
  /** The app's language for main's menus, dialogs and notifications; System by default. */
  language?: LanguageChoice;
}

declare global {
  interface Window {
    studio: StudioApi;
  }
}

export type {
  BuildProblem,
  ConversationRecord,
  EventEnvelope,
  EngineDescriptor,
  InstallResult,
  SnapshotRecord,
  FolderInspection,
  GameLocation,
  GameProject,
};
