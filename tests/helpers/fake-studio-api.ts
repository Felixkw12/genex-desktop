/**
 * A typed fake of the renderer's `window.studio` ({@link StudioApi}): every named call exists,
 * records its arguments in order, and answers a harmless default until a test overrides it. The
 * listener calls (`onEvent`, `onTerminal`, …) return a real unsubscribe and have `emit*`
 * counterparts, so a component under test hears pushes exactly as it would from the preload.
 */
import type { StudioApi } from "../../src/shared/studio-api.ts";
import { ShaderFailure } from "../../src/shared/backdrop-shader.ts";
import { CliInstallPhase } from "../../src/shared/cli-install.ts";
import { GenexAccountStatus } from "../../src/shared/genex-account.ts";

export type StudioMethod = keyof StudioApi;
export interface StudioCall<M extends StudioMethod = StudioMethod> {
  method: M;
  args: Parameters<StudioApi[M]>;
}

// The runtime list of calls. The type below fails to compile when `StudioApi` gains a call that
// is not listed here, so the fake cannot silently lag the preload.
const METHODS = [
  "contextSettings",
  "setContextPolicy",
  "studioSkills",
  "providerSkills",
  "projectSkills",
  "pluginSkillText",
  "pluginsList",
  "pluginsCatalog",
  "pluginEnable",
  "pluginRemove",
  "pluginInstall",
  "pluginPanel",
  "pluginSettings",
  "pluginSetSetting",
  "pluginReview",
  "pluginAction",
  "pluginChooseFile",
  "genexPublishReview",
  "genexPublishPlatforms",
  "genexPublish",
  "genexPublishApps",
  "genexCloudBuild",
  "pluginsIndex",
  "pluginInstallGithub",
  "pluginLookupGithub",
  "pluginGithubVersions",
  "pluginUpdate",
  "pluginWatch",
  "pluginForgetAllowed",
  "pluginConsent",
  "permissions",
  "setPermissionMode",
  "answerPermission",
  "forgetPermission",
  "mcpList",
  "connections",
  "mcpSave",
  "mcpRemove",
  "mcpTest",
  "mcpConnect",
  "mcpCancelAuthorization",
  "mcpDisconnectAccount",
  "mcpTools",
  "mcpForgetAlwaysAllowed",
  "bootState",
  "retrySandboxSetup",
  "setUpSandbox",
  "reportSandboxSetup",
  "quitFromBoot",
  "setWindowControls",
  "readyUpdate",
  "restartToUpdate",
  "checkForUpdates",
  "openUpdateDownload",
  "appAbout",
  "bootstrap",
  "performanceMark",
  "send",
  "mentionRetry",
  "answerPlan",
  "cancelTurn",
  "changeQueuedMessage",
  "events",
  "threadEvents",
  "chatPage",
  "threads",
  "newGameThread",
  "threadForGame",
  "renameThread",
  "compactThread",
  "archiveGame",
  "playGameBuild",
  "storageSpace",
  "freeStorage",
  "dataFolder",
  "chooseDataFolder",
  "moveDataFolder",
  "undoEngineLink",
  "stopJob",
  "openPrivacySettings",
  "engines",
  "providerUsage",
  "hardware",
  "games",
  "createGame",
  "nameGame",
  "makeBackdrop",
  "pickGameLocation",
  "updateGame",
  "removeGame",
  "snapshots",
  "selfChanges",
  "studioActivity",
  "runSummary",
  "onRunSummary",
  "runReview",
  "settings",
  "setSettings",
  "diagnostics",
  "sendFeedback",
  "licenses",
  "recheckEngines",
  "subscriptionSignIn",
  "claudeLoginState",
  "claudeLoginCode",
  "claudeLoginOpenBrowser",
  "claudeLoginCancel",
  "openCodeSignIn",
  "grokSignIn",
  "cursorSignIn",
  "cursorSignOut",
  "openRouterKeySave",
  "openRouterKeyClear",
  "typeSafeKeyStatus",
  "typeSafeKeySave",
  "typeSafeKeyClear",
  "openRouterSignIn",
  "openRouterSignInReopen",
  "openRouterSignInCancel",
  "opperKeySave",
  "opperKeyClear",
  "localServerConnect",
  "localServerForget",
  "localServerFind",
  "terminalList",
  "terminalAccessibility",
  "terminalOpen",
  "terminalRun",
  "terminalAttach",
  "terminalInput",
  "terminalResize",
  "terminalAcknowledge",
  "terminalStop",
  "terminalRemove",
  "terminalOpenLink",
  "onTerminal",
  "onClaudeLogin",
  "codexLoginState",
  "codexLoginCancel",
  "codexLoginDismiss",
  "codexLoginOpenBrowser",
  "codexLoginRetry",
  "onCodexLogin",
  "subscriptionForgetStudioLogin",
  "subscriptionAccounts",
  "subscriptionUseAccount",
  "openUrl",
  "playFeed",
  "playShelves",
  "playSearch",
  "playCatalog",
  "playRemix",
  "playRemixReady",
  "playOnline",
  "playOpen",
  "playGame",
  "playInstall",
  "playInstallCancel",
  "playInstalls",
  "playUninstall",
  "playLaunch",
  "playSession",
  "playSessions",
  "playRevealInstall",
  "playLike",
  "playClose",
  "playTakeGameLink",
  "playControl",
  "playBar",
  "playComments",
  "playComment",
  "playUncomment",
  "playPurchase",
  "playMe",
  "playRename",
  "playAvatar",
  "playProfile",
  "playFriends",
  "playFriend",
  "playPeople",
  "playVisibility",
  "playAvatarStyle",
  "playAvatarVariant",
  "playStats",
  "playCreators",
  "playCredits",
  "playHandleCheck",
  "playSetHandle",
  "playShare",
  "playManage",
  "playCover",
  "storeItems",
  "storeMyItems",
  "storeItemGames",
  "storeBuy",
  "storeAnswer",
  "onStoreSheet",
  "storeClaim",
  "storeShelf",
  "storeCoins",
  "storeGetCoin",
  "storeReport",
  "itemsBrowse",
  "itemsBrowseDetail",
  "itemsAddToGame",
  "itemsRemoveFromGame",
  "itemsSelling",
  "itemPutOnSale",
  "itemTakeOffSale",
  "itemSetShared",
  "itemsLocal",
  "itemsLocalApprove",
  "itemsLocalWithdraw",
  "itemsLocalShare",
  "itemsLocalSettle",
  "genexAccount",
  "genexSignIn",
  "genexCancelSignIn",
  "genexSignOut",
  "genexBuild",
  "notify",
  "setBadge",
  "rollback",
  "undoChange",
  "loadPreview",
  "loadWebBuild",
  "buildPreview",
  "agentScreens",
  "readRunStill",
  "previewProjectAsset",
  "presentProjectAssets",
  "projectModelRigs",
  "projectAssets",
  "assetLibrary",
  "assetLibraryStates",
  "assetSave",
  "assetShare",
  "assetUnshare",
  "assetAdd",
  "assetLibraryFile",
  "readProjectAsset",
  "runFeedback",
  "playSnapshot",
  "showBuild",
  "landBuild",
  "previewBounds",
  "previewSound",
  "reloadPreview",
  "stopPreview",
  "playPreview",
  "previewFullScreen",
  "liveBehind",
  "previewState",
  "previewLive",
  "previewCoverStill",
  "buildProblem",
  "installPackages",
  "stopRun",
  "finishRun",
  "resumeAutopilot",
  "exportGame",
  "modelInstallStatus",
  "cliInstall",
  "cliUpdate",
  "refreshModels",
  "cliInstallStatus",
  "pullModel",
  "lookupModel",
  "cancelModelDownload",
  "removeModel",
  "raiseModelContext",
  "revealProject",
  "readGameFile",
  "revealGameFile",
  "resolveChatFiles",
  "openChatFile",
  "messageImages",
  "pathOfFile",
  "systemLanguages",
  "rewindPreview",
  "rewindChat",
  "undoRewind",
  "chooseGamesRoot",
  "pickProject",
  "inspectFolder",
  "adoptFolder",
  "openProject",
  "runSharingStatus",
  "setRunSharing",
  "runSharingPreview",
  "deleteSharedRuns",
  "onEvent",
] as const satisfies readonly StudioMethod[];
type Unlisted = Exclude<StudioMethod, (typeof METHODS)[number]>;
const everyCallListed: [Unlisted] extends [never] ? true : { unlisted: Unlisted } = true;
void everyCallListed;
export const STUDIO_METHODS: readonly StudioMethod[] = METHODS;

type StudioEvent = Parameters<Parameters<StudioApi["onEvent"]>[0]>[0];
type TerminalEvent = Parameters<Parameters<StudioApi["onTerminal"]>[0]>[0];
type ClaudeLogin = Parameters<Parameters<StudioApi["onClaudeLogin"]>[0]>[0];
type CodexLogin = Parameters<Parameters<StudioApi["onCodexLogin"]>[0]>[0];
type RunSummary = Parameters<Parameters<StudioApi["onRunSummary"]>[2]>[0];
type StoreSheetPush = Parameters<Parameters<StudioApi["onStoreSheet"]>[0]>[0];

export interface FakeStudioApi {
  /** The object to hand to the code under test (or install as `window.studio`). */
  api: StudioApi;
  /** Every call in order, overridden or not. */
  calls: StudioCall[];
  callsOf<M extends StudioMethod>(method: M): Array<Parameters<StudioApi[M]>>;
  /** Replace one call's behaviour; calls are still recorded. */
  stub<M extends StudioMethod>(method: M, impl: StudioApi[M]): void;
  emit(event: StudioEvent): void;
  emitTerminal(event: TerminalEvent): void;
  emitClaudeLogin(state: ClaudeLogin): void;
  emitCodexLogin(state: CodexLogin): void;
  emitRunSummary(project: string, runId: string, summary: RunSummary): void;
  /** Push the store's purchase sheet (or null once it closes), as main does in the studio window. */
  emitStoreSheet(sheet: StoreSheetPush): void;
  /** Subscribed listeners per `on*` call — 0 after a component unmounts proves it unsubscribed. */
  listeners(
    method: "onEvent" | "onTerminal" | "onClaudeLogin" | "onCodexLogin" | "onRunSummary" | "onStoreSheet",
  ): number;
}

export interface FakeStudioOptions {
  /** Unstubbed calls reject instead of answering a default, to find every call a flow makes. */
  strict?: boolean;
}

/** The store's reads a game's page and a profile make on mount: a store that sells nothing, a bare shelf. */
function storeDefaults(): Partial<Record<StudioMethod, () => unknown>> {
  return {
    storeItems: () => ({ items: [], myItemsCount: null }),
    storeMyItems: () => [],
    storeItemGames: () => ({ total: 0, games: [] }),
    storeShelf: () => [],
    // The account's coin for the plate in Play: none, as with coin off.
    storeCoins: () => null,
    // Create › Items with nothing in it: no item to show, nothing made yet.
    itemsBrowse: () => ({ items: [], nextCursor: null }),
    itemsBrowseDetail: () => ({ refused: "sku_not_found" }),
    itemsSelling: () => ({ earnedReady: 0, earnedHeld: 0, nextReleaseAt: null, holdDays: 0, items: [] }),
    // A game with no local drafts in Studio's app data.
    itemsLocal: () => ({ project: "", approvals: {}, drafts: {}, removed: [], outcomes: {} }),
    itemsLocalSettle: () => ({ project: "", approvals: {}, drafts: {}, removed: [], outcomes: {} }),
  };
}

/** Defaults for the calls a screen makes on mount; everything else resolves `undefined`. */
function defaults(): Partial<Record<StudioMethod, () => unknown>> {
  const empty = () => [];
  const ready = () => ({ platform: "darwin", phase: "ready", sandbox: null });
  return {
    bootState: ready,
    retrySandboxSetup: ready,
    setUpSandbox: () => ({ outcome: "installed", state: ready() }),
    readyUpdate: () => null,
    typeSafeKeyStatus: () => ({ state: "missing" }),
    appAbout: () => ({ version: "0.1.0", platform: "darwin", arch: "arm64" }),
    bootstrap: () => ({
      threadId: "thread-main",
      layout: {},
      gamesRootLabel: "~/AI Games",
      harness: { state: "ready", version: null, capabilities: [] },
      threads: [],
      events: [],
      eventsCursor: null,
      games: [],
      engines: [],
      activeDelegations: {},
    }),
    settings: () => ({ learning: false, selfImproving: false }),
    diagnostics: () => "",
    licenses: () => ({ license: null, bundled: null, notices: null }),
    selfChanges: () => ({ changes: [], staged: [] }),
    // StudioApi.events() answers an EventFeed: the events plus the cursor to read after them.
    events: () => ({ events: [], cursor: null }),
    threadEvents: empty,
    threads: empty,
    games: empty,
    snapshots: empty,
    engines: empty,
    studioActivity: empty,
    studioSkills: empty,
    providerSkills: empty,
    projectSkills: () => ({ project: "", skills: [], warnings: [] }),
    pluginSkillText: () => "",
    pluginsList: empty,
    pluginsCatalog: empty,
    pluginsIndex: () => ({ url: "", studioVersion: "0.1.0", fetchedAt: null, stale: true, entries: [], updates: [] }),
    mcpList: empty,
    mcpTools: empty,
    terminalList: empty,
    agentScreens: empty,
    presentProjectAssets: empty,
    projectModelRigs: empty,
    providerUsage: empty,
    messageImages: empty,
    buildProblem: () => null,
    modelInstallStatus: () => null,
    cliInstall: () => ({
      provider: "claude-code",
      phase: CliInstallPhase.Installing,
      startedAt: new Date(0).toISOString(),
    }),
    cliInstallStatus: empty,
    cliUpdate: () => ({ provider: "codex", phase: "installed", startedAt: "" }),
    refreshModels: () => true,
    previewState: () => null,
    pickProject: () => null,
    pickGameLocation: () => null,
    pluginChooseFile: () => null,
    nameGame: () => ({ title: "Untitled game" }),
    playFeed: () => ({ games: [], nextCursor: null }),
    playComments: () => ({ items: [], nextCursor: null }),
    playShelves: () => ({
      counts: { games: null, tools: null, assets: null },
      categories: ["featured", "tools", "assets"],
    }),
    playOnline: () => ({}),
    playInstalls: () => ({ installed: [], progress: [], host: null }),
    playSessions: () => [],
    playSearch: () => [],
    playCatalog: () => [],
    playMe: () => null,
    genexAccount: () => ({ status: GenexAccountStatus.SignedOut }),
    genexSignIn: () => ({ status: GenexAccountStatus.SigningIn }),
    genexCancelSignIn: () => ({ status: GenexAccountStatus.SignedOut }),
    genexSignOut: () => ({ status: GenexAccountStatus.SignedOut }),
    genexBuild: () => ({ status: GenexAccountStatus.SigningIn }),
    playPeople: () => ({ people: [], unavailable: false }),
    playStats: () => null,
    playCreators: () => null,
    ...storeDefaults(),
    makeBackdrop: () => ({ ok: false, failure: ShaderFailure.NoModel }),
  };
}

export function fakeStudioApi(overrides: Partial<StudioApi> = {}, options: FakeStudioOptions = {}): FakeStudioApi {
  const calls: StudioCall[] = [];
  const impls = new Map<StudioMethod, (...args: never[]) => unknown>(
    Object.entries(overrides) as Array<[StudioMethod, (...args: never[]) => unknown]>,
  );
  const fallback = defaults();
  const sets = {
    onEvent: new Set<(event: StudioEvent) => void>(),
    onTerminal: new Set<(event: TerminalEvent) => void>(),
    onClaudeLogin: new Set<(state: ClaudeLogin) => void>(),
    onCodexLogin: new Set<(state: CodexLogin) => void>(),
    onRunSummary: new Set<{ project: string; runId: string; listener: (summary: RunSummary) => void }>(),
    onStoreSheet: new Set<(sheet: StoreSheetPush) => void>(),
  };
  const subscribe = <T>(set: Set<T>, entry: T) => {
    set.add(entry);
    return () => void set.delete(entry);
  };
  const listening: Partial<Record<StudioMethod, (...args: never[]) => unknown>> = {
    onEvent: ((listener: (event: StudioEvent) => void) => subscribe(sets.onEvent, listener)) as never,
    onTerminal: ((listener: (event: TerminalEvent) => void) => subscribe(sets.onTerminal, listener)) as never,
    onClaudeLogin: ((listener: (state: ClaudeLogin) => void) => subscribe(sets.onClaudeLogin, listener)) as never,
    onCodexLogin: ((listener: (state: CodexLogin) => void) => subscribe(sets.onCodexLogin, listener)) as never,
    onRunSummary: ((project: string, runId: string, listener: (summary: RunSummary) => void) =>
      subscribe(sets.onRunSummary, { project, runId, listener })) as never,
    onStoreSheet: ((listener: (sheet: StoreSheetPush) => void) => subscribe(sets.onStoreSheet, listener)) as never,
    // Answered by the preload, not main: synchronous, and no file of a test has a place on disk.
    pathOfFile: (() => "") as never,
    systemLanguages: () => [],
  };
  const api = {} as Record<StudioMethod, (...args: unknown[]) => unknown>;
  for (const method of METHODS) {
    api[method] = (...args: unknown[]) => {
      calls.push({ method, args } as StudioCall);
      const impl = impls.get(method) ?? listening[method];
      if (impl) return (impl as (...a: unknown[]) => unknown)(...args);
      if (options.strict) return Promise.reject(new Error(`fake StudioApi: ${method} is not stubbed`));
      return Promise.resolve(fallback[method]?.());
    };
  }
  return {
    api: api as unknown as StudioApi,
    calls,
    callsOf: <M extends StudioMethod>(method: M) =>
      calls.filter((call) => call.method === method).map((call) => call.args as Parameters<StudioApi[M]>),
    stub: (method, impl) => void impls.set(method, impl as (...args: never[]) => unknown),
    emit: (event) => {
      for (const listener of [...sets.onEvent]) listener(event);
    },
    emitTerminal: (event) => {
      for (const listener of [...sets.onTerminal]) listener(event);
    },
    emitClaudeLogin: (state) => {
      for (const listener of [...sets.onClaudeLogin]) listener(state);
    },
    emitCodexLogin: (state) => {
      for (const listener of [...sets.onCodexLogin]) listener(state);
    },
    emitRunSummary: (project, runId, summary) => {
      for (const entry of [...sets.onRunSummary])
        if (entry.project === project && entry.runId === runId) entry.listener(summary);
    },
    emitStoreSheet: (sheet) => {
      for (const listener of [...sets.onStoreSheet]) listener(sheet);
    },
    listeners: (method) => sets[method].size,
  };
}

/** Install a fake as `window.studio` for code that reads the global; returns the restore. */
export function installFakeStudio(fake: FakeStudioApi): () => void {
  const scope = globalThis as { window?: { studio?: StudioApi } };
  const hadWindow = "window" in scope;
  const previous = scope.window?.studio;
  scope.window ??= {} as { studio?: StudioApi };
  scope.window.studio = fake.api;
  return () => {
    if (!hadWindow) delete scope.window;
    else if (previous === undefined) delete scope.window?.studio;
    else scope.window!.studio = previous;
  };
}
