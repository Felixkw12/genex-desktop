/**
 * The `window.studio` object the preload exposes, built over the part of `ipcRenderer` it uses so a
 * test can drive it with a recorder. Every call goes through {@link invoke} or {@link subscribe},
 * whose channel, payload and result types come from `shared/ipc-channels.ts`.
 */
import { CodedError, errorCode } from "../shared/errors.ts";
import { createRunSummaryFeeds, type GraphCursor } from "../shared/run-summary-feed.ts";
import type { StudioApi } from "../shared/studio-api.ts";
import type {
  IpcResult,
  StudioInvokeChannel,
  StudioInvokePayload,
  StudioInvokeResult,
  StudioPushChannel,
  StudioPushPayload,
} from "../shared/ipc-channels.ts";

/** The part of Electron's `ipcRenderer` the bridge uses; `ipcRenderer` itself satisfies it. */
export interface BridgeIpc {
  invoke(channel: StudioInvokeChannel, payload: unknown): Promise<unknown>;
  on<C extends StudioPushChannel>(
    channel: C,
    listener: (event: unknown, payload: StudioPushPayload<C>) => void,
  ): unknown;
  off<C extends StudioPushChannel>(
    channel: C,
    listener: (event: unknown, payload: StudioPushPayload<C>) => void,
  ): unknown;
}

/** The part of Electron's `webUtils` the bridge uses: where a dropped or pasted file is on disk. */
export interface BridgeFiles {
  getPathForFile(file: File): string;
}

/** A bridge built without `webUtils` (a test of its IPC) knows no file's place. */
const NO_FILES: BridgeFiles = { getPathForFile: () => "" };

/** Calls the preload answers itself, asking main nothing. */
export const PRELOAD_LOCAL_CALLS = ["pathOfFile", "systemLanguages"] as const;

/** A channel whose payload is `undefined` is called with no payload argument. */
type PayloadArgs<C extends StudioInvokeChannel> =
  StudioInvokePayload<C> extends undefined ? [] : [payload: StudioInvokePayload<C>];

/** A bridge built with no languages (a test of its IPC) has System follow Chromium's list. */
export function createStudioBridge(
  ipc: BridgeIpc,
  files: BridgeFiles = NO_FILES,
  languages: readonly string[] = [],
): StudioApi {
  async function invoke<C extends StudioInvokeChannel>(
    channel: C,
    ...args: PayloadArgs<C>
  ): Promise<StudioInvokeResult<C>> {
    // Main answers every invoke with `IpcResult` (`main/ipc-handle.ts`), typed by the same map.
    const result = (await ipc.invoke(channel, args[0])) as IpcResult<StudioInvokeResult<C>>;
    if (!result.ok) throw failure(result, channel);
    return result.value;
  }
  function subscribe<C extends StudioPushChannel>(
    channel: C,
    listener: (payload: StudioPushPayload<C>) => void,
  ): () => void {
    const handler = (_event: unknown, payload: StudioPushPayload<C>) => listener(payload);
    ipc.on(channel, handler);
    return () => ipc.off(channel, handler);
  }
  const bridge: BridgeCalls = { ipc, invoke, subscribe };
  return {
    performanceMark: (mark) => invoke("studio:performance.mark", mark),
    // A file that is only data has no place: Electron throws for some, "" for others.
    pathOfFile: (file) => {
      try {
        return files.getPathForFile(file);
      } catch {
        return "";
      }
    },
    systemLanguages: () => [...languages],
    ...threadCalls(bridge),
    ...gameCalls(bridge),
    ...runCalls(bridge),
    ...studioCalls(bridge),
    ...playCalls(bridge),
    ...storeCalls(bridge),
    ...pluginCalls(bridge),
    ...accountCalls(bridge),
    ...terminalCalls(bridge),
    ...previewCalls(bridge),
  };
}

/**
 * A failed invoke as the renderer catches it: its words, its code when it is one of the app's, and
 * the channel it failed on (`failedChannel`).
 */
function failure(result: Extract<IpcResult, { ok: false }>, channel: StudioInvokeChannel): Error {
  const code = errorCode(result);
  const error = code ? new CodedError(code, result.error) : new Error(result.error);
  return Object.assign(error, { channel });
}

/** What every group of calls is built from: the raw IPC, and the typed invoke and subscribe over it. */
interface BridgeCalls {
  ipc: BridgeIpc;
  invoke<C extends StudioInvokeChannel>(channel: C, ...args: PayloadArgs<C>): Promise<StudioInvokeResult<C>>;
  subscribe<C extends StudioPushChannel>(channel: C, listener: (payload: StudioPushPayload<C>) => void): () => void;
}

/** Chats: sending, the event feed, threads and the files a chat names. */
function threadCalls(bridge: BridgeCalls) {
  const { invoke, subscribe } = bridge;
  return {
    bootstrap: () => invoke("studio:bootstrap"),
    send: (text, options) => invoke("studio:send", { text, ...options }),
    mentionRetry: (threadId, messageId, tag, action) =>
      invoke("studio:mentions.retry", { threadId, messageId, tag, action }),
    answerPlan: (threadId, id, approved) => invoke("studio:plan.answer", { threadId, id, approved }),
    cancelTurn: (threadId) => invoke("studio:cancel", { threadId }),
    changeQueuedMessage: (threadId, messageId, operation, text) =>
      invoke("studio:queue.message", { threadId, messageId, operation, text }),
    rewindPreview: (threadId, eventId, messageId) =>
      invoke("studio:chat.rewind.preview", { threadId, eventId, messageId }),
    rewindChat: (threadId, eventId, messageId, files) =>
      invoke("studio:chat.rewind", { threadId, eventId, messageId, files }),
    undoRewind: (threadId, rewindId) => invoke("studio:chat.rewind.undo", { threadId, rewindId }),
    events: (after) => invoke("studio:events", { after }),
    threadEvents: (threadId) => invoke("studio:thread.events", { threadId }),
    chatPage: (threadId, before) => invoke("studio:chat.page", { threadId, before }),
    threads: () => invoke("studio:threads"),
    newGameThread: (project) => invoke("studio:thread.new", project ? { project } : {}),
    threadForGame: (project) => invoke("studio:thread.forGame", { project }),
    renameThread: (threadId, title) => invoke("studio:thread.rename", { threadId, title }),
    compactThread: (threadId, options) => invoke("studio:compact", { threadId, ...options }),
    messageImages: (threadId, messageId) => invoke("studio:message-images", { threadId, messageId }),
    readGameFile: (threadId, path) => invoke("studio:game-file.read", { threadId, path }),
    revealGameFile: (threadId, path) => invoke("studio:game-file.reveal", { threadId, path }),
    resolveChatFiles: (threadId, refs) => invoke("studio:chat-files.resolve", { threadId, refs }),
    openChatFile: (threadId, ref) => invoke("studio:chat-file.open", { threadId, ref }),
    onEvent: (listener) => subscribe("studio:event", listener),
  } satisfies Partial<StudioApi>;
}

/** The library: games, their folders, assets and history. */
function gameCalls(bridge: BridgeCalls) {
  const { invoke } = bridge;
  return {
    archiveGame: (project) => invoke("studio:game.archive", { project }),
    playGameBuild: (project) => invoke("studio:game.play-build", { project }),
    storageSpace: (project) => invoke("studio:storage", project === undefined ? {} : { project }),
    freeStorage: (project) => invoke("studio:storage.free", project === undefined ? {} : { project }),
    dataFolder: () => invoke("studio:data-folder"),
    chooseDataFolder: () => invoke("studio:data-folder.choose"),
    moveDataFolder: () => invoke("studio:data-folder.move"),
    undoEngineLink: (request) => invoke("studio:game.engine.undo", request),
    stopJob: (project, jobId) => invoke("studio:jobs.stop", { project, jobId }),
    openPrivacySettings: (pane) => invoke("studio:app-look.open-settings", { pane }),
    createGame: (title, options) =>
      invoke("studio:game.create", { title, ...(options?.parent === undefined ? {} : { parent: options.parent }) }),
    nameGame: (request) => invoke("studio:game.name", request),
    makeBackdrop: (request) => invoke("studio:backdrop.make", request),
    pickGameLocation: () => invoke("studio:game.location.pick"),
    chooseGamesRoot: () => invoke("studio:games-root.choose"),
    updateGame: (project, patch) => invoke("studio:game.update", { project, patch }),
    removeGame: (project) => invoke("studio:game.remove", { project }),
    games: () => invoke("studio:games"),
    snapshots: () => invoke("studio:snapshots"),
    selfChanges: () => invoke("studio:selfchanges"),
    studioActivity: () => invoke("studio:activity"),
    exportGame: (project) => invoke("studio:export", { project }),
    revealProject: (project, file) => invoke("studio:reveal-project", { project, ...(file ? { file } : {}) }),
    pickProject: () => invoke("studio:project.pick"),
    inspectFolder: (dir) => invoke("studio:project.inspect", { dir }),
    adoptFolder: (dir, options) => invoke("studio:project.adopt", { dir, ...(options ?? {}) }),
    openProject: (name) => invoke("studio:project.open", { name }),
    rollback: (snapshotId) => invoke("studio:rollback", { snapshotId }),
    undoChange: (snapshotId) => invoke("studio:selfchange.undo", { snapshotId }),
    previewProjectAsset: (p) => invoke("studio:game.asset.preview", p),
    presentProjectAssets: (p) => invoke("studio:game.asset.present", p),
    projectModelRigs: (p) => invoke("studio:game.asset.rigs", p),
    projectAssets: (project) => invoke("studio:game.assets", { project }),
    assetLibrary: (query) => invoke("studio:assets.library", query),
    assetLibraryStates: (project) => invoke("studio:assets.states", { project }),
    assetSave: (project, files, saved) => invoke("studio:assets.save", { project, files, saved }),
    assetShare: (project, items) => invoke("studio:assets.share", { project, items }),
    assetUnshare: (project, file) => invoke("studio:assets.unshare", { project, file }),
    assetAdd: (project, source) => invoke("studio:assets.add", { project, source }),
    assetLibraryFile: (url) => invoke("studio:assets.file", { url }),
    readProjectAsset: (p) => invoke("studio:game.asset.still", p),
    installPackages: (project, options) =>
      invoke("studio:packages.install", { project, scripts: options?.scripts === true }),
  } satisfies Partial<StudioApi>;
}

/** A summary request: the run, and the graph events the caller already holds, when it holds any. */
function summaryPayload(project: string, runId: string, graphFrom?: GraphCursor | null) {
  return { project, runId, ...(graphFrom ? { graphFrom } : {}) };
}

/** Builds: starting and stopping a run, and what the Builds tab reads about one. */
function runCalls(bridge: BridgeCalls) {
  const { invoke, subscribe } = bridge;
  // Every view of one run (Build, Builds graph, morning card, review) shares one live summary,
  // which fetches only the graph events it does not hold yet.
  const summaries = createRunSummaryFeeds({
    runSummary: (project, runId, graphFrom) => invoke("studio:run.summary", summaryPayload(project, runId, graphFrom)),
    onEvent: (listener) => subscribe("studio:event", listener),
  });
  return {
    runSummary: (project, runId, graphFrom) => invoke("studio:run.summary", summaryPayload(project, runId, graphFrom)),
    onRunSummary: (project, runId, listener) => summaries.subscribe(project, runId, listener),
    runReview: (project, runId) => invoke("studio:run.review", { project, runId }),
    readRunStill: (file, maxPx) => invoke("studio:run.still", { file, ...(maxPx === undefined ? {} : { maxPx }) }),
    runFeedback: (p) => invoke("studio:run.feedback", p),
    playSnapshot: (snapshotId, project) => invoke("studio:review.play", { snapshotId, project }),
    showBuild: (project, commit) => invoke("studio:build.show", { project, commit }),
    landBuild: (project, commit) => invoke("studio:build.land", { project, commit }),
    buildProblem: (project) => invoke("studio:build.problem", { project }),
    stopRun: (runId) => invoke("studio:run.stop", { runId }),
    finishRun: (runId, threadId) => invoke("studio:run.finish", { runId, threadId }),
    resumeAutopilot: (runId) => invoke("studio:autopilot.resume", { runId }),
  } satisfies Partial<StudioApi>;
}

/** Play: genex.games' catalog, the viewer and its bar, comments and people. */
function playCalls(bridge: BridgeCalls) {
  const { invoke } = bridge;
  return {
    playFeed: (request) => invoke("studio:play.feed", request),
    playShelves: () => invoke("studio:play.shelves"),
    playSearch: (query, shelf) => invoke("studio:play.search", { query, shelf }),
    playCatalog: () => invoke("studio:play.catalog"),
    playRemix: (slug) => invoke("studio:play.remix", { slug }),
    playRemixReady: (slugs) => invoke("studio:play.remix-ready", { slugs }),
    playOnline: (slugs) => invoke("studio:play.online", { slugs }),
    playOpen: (slug, title) => invoke("studio:play.open", { slug, title }),
    playGame: (slug) => invoke("studio:play.game", { slug }),
    playInstall: (slug) => invoke("studio:play.install", { slug }),
    playInstallCancel: (slug) => invoke("studio:play.install-cancel", { slug }),
    playInstalls: () => invoke("studio:play.installs"),
    playUninstall: (slug) => invoke("studio:play.uninstall", { slug }),
    playLaunch: (slug) => invoke("studio:play.launch", { slug }),
    playSession: (slug, action) => invoke("studio:play.session", { slug, action }),
    playSessions: () => invoke("studio:play.sessions"),
    playRevealInstall: (slug) => invoke("studio:play.reveal-install", { slug }),
    playLike: (slug, liked) => invoke("studio:play.like", { slug, liked }),
    playClose: () => invoke("studio:play.close"),
    playTakeGameLink: () => invoke("studio:play.take-game-link"),
    playControl: (control, at) => invoke("studio:play.control", { control, at }),
    playBar: (hold) => invoke("studio:play.bar", hold),
    playComments: (cursor) => invoke("studio:play.comments", { cursor }),
    playComment: (body) => invoke("studio:play.comment", { body }),
    playUncomment: (commentId) => invoke("studio:play.uncomment", { commentId }),
    playPurchase: (sheet, answer) => invoke("studio:play.purchase", { sheet, answer }),
    playMe: () => invoke("studio:play.me"),
    playRename: (name) => invoke("studio:play.rename", { name }),
    playAvatar: (webp) => invoke("studio:play.avatar", { webp }),
    playProfile: (userId) => invoke("studio:play.profile", { userId }),
    playFriends: () => invoke("studio:play.friends"),
    playFriend: (request) => invoke("studio:play.friend", request),
    playPeople: (query) => invoke("studio:play.people", { query }),
    playVisibility: (visibility) => invoke("studio:play.visibility", { visibility }),
    playAvatarStyle: (style) => invoke("studio:play.avatarStyle", { style }),
    playAvatarVariant: (variant) => invoke("studio:play.avatarVariant", { variant }),
    playStats: (days) => invoke("studio:play.stats", { days }),
    playCreators: () => invoke("studio:play.creators"),
    playCredits: () => invoke("studio:play.credits"),
    playHandleCheck: (handle) => invoke("studio:play.handle-check", { handle }),
    playSetHandle: (handle) => invoke("studio:play.handle", { handle }),
    playShare: (url, at) => invoke("studio:play.share", { url, at }),
    playManage: (gameId, change) => invoke("studio:play.manage", { gameId, change }),
    playCover: (gameId, image, contentType) => invoke("studio:play.cover", { gameId, image, contentType }),
  } satisfies Partial<StudioApi>;
}

/** The store: a game's Store and My items, the purchase sheet, the shelf, complaints and Create › Items. */
function storeCalls(bridge: BridgeCalls) {
  const { invoke, subscribe } = bridge;
  return {
    storeItems: (slug) => invoke("studio:store.items", { slug }),
    storeMyItems: (slug) => invoke("studio:store.my-items", { slug }),
    storeItemGames: (itemId) => invoke("studio:store.item-games", { itemId }),
    storeBuy: (itemId, slug) => invoke("studio:store.buy", { itemId, slug }),
    storeAnswer: (sheet, answer) => invoke("studio:store.answer", { sheet, answer }),
    onStoreSheet: (listener) => subscribe("studio:store.sheet", listener),
    storeClaim: (itemId, slug) => invoke("studio:store.claim", { itemId, slug }),
    storeShelf: (userId) => invoke("studio:store.shelf", { userId }),
    storeCoins: () => invoke("studio:store.coins"),
    storeGetCoin: () => invoke("studio:store.get-coin"),
    storeReport: (itemId, reason, message) => invoke("studio:store.report", { itemId, reason, message }),
    itemsBrowse: (query, cursor, tags = []) => invoke("studio:items.browse", { query, cursor, tags }),
    itemsBrowseDetail: (itemId) => invoke("studio:items.detail", { itemId }),
    itemsAddToGame: (itemId, projectId) => invoke("studio:items.add", { itemId, projectId }),
    itemsRemoveFromGame: (itemId, projectId) => invoke("studio:items.remove", { itemId, projectId }),
    itemsSelling: () => invoke("studio:items.selling"),
    itemPutOnSale: (itemId) => invoke("studio:items.put-on-sale", { itemId }),
    itemTakeOffSale: (itemId) => invoke("studio:items.take-off-sale", { itemId }),
    itemSetShared: (itemId, shared) => invoke("studio:items.shared", { itemId, shared }),
    itemsLocal: (project) => invoke("studio:items.local", { project }),
    itemsLocalApprove: (project, localId, contentHash) =>
      invoke("studio:items.local-approve", { project, localId, contentHash }),
    itemsLocalWithdraw: (project, localId) => invoke("studio:items.local-withdraw", { project, localId }),
    itemsLocalShare: (project, localId, contentHash, shared) =>
      invoke("studio:items.local-share", { project, localId, contentHash, shared }),
    itemsLocalSettle: (project, force) => invoke("studio:items.local-settle", { project, force }),
  } satisfies Partial<StudioApi>;
}

/** Settings, models, skills, learning and notifications. */
function studioCalls(bridge: BridgeCalls) {
  const { invoke } = bridge;
  return {
    bootState: () => invoke("studio:boot"),
    retrySandboxSetup: () => invoke("studio:boot.retry"),
    setUpSandbox: () => invoke("studio:boot.setup"),
    reportSandboxSetup: (error) => invoke("studio:boot.report", { error }),
    quitFromBoot: () => invoke("studio:boot.quit"),
    setWindowControls: (controls) => invoke("studio:window.controls", controls),
    readyUpdate: () => invoke("studio:update"),
    restartToUpdate: () => invoke("studio:update.restart"),
    checkForUpdates: () => invoke("studio:update.check"),
    appAbout: () => invoke("studio:update.about"),
    openUpdateDownload: () => invoke("studio:update.download"),
    engines: () => invoke("studio:engines"),
    providerUsage: () => invoke("studio:provider-usage"),
    hardware: () => invoke("studio:hardware"),
    settings: () => invoke("studio:settings"),
    setSettings: (patch) => invoke("studio:settings.set", patch),
    diagnostics: () => invoke("studio:diagnostics"),
    sendFeedback: (draft) => invoke("studio:feedback.send", draft),
    licenses: () => invoke("studio:licenses"),
    runSharingStatus: () => invoke("studio:run-sharing.status"),
    setRunSharing: (on) => invoke("studio:run-sharing.set", { on }),
    runSharingPreview: () => invoke("studio:run-sharing.preview"),
    deleteSharedRuns: () => invoke("studio:run-sharing.delete"),
    studioSkills: () => invoke("studio:skills.list"),
    providerSkills: () => invoke("studio:skills.providers"),
    projectSkills: (project) => invoke("studio:skills.project", { project }),
    pluginSkillText: (id, name, file) => invoke("studio:plugins.skill", { id, name, file }),
    contextSettings: (engine, model, threadId) => invoke("studio:context.get", { engine, model, threadId }),
    setContextPolicy: (engine, model, policy, threadId) =>
      invoke("studio:context.set", { engine, model, policy, threadId }),
    cancelModelDownload: () => invoke("studio:cancel-model-download", {}),
    modelInstallStatus: () => invoke("studio:model-install.status"),
    refreshModels: (provider) => invoke("studio:models.refresh", { provider }),
    cliUpdate: (provider) => invoke("studio:cli.update", { provider }),
    cliInstall: (provider) => invoke("studio:cli-install.start", { provider }),
    cliInstallStatus: () => invoke("studio:cli-install.status"),
    pullModel: (model) => invoke("studio:pull-model", { model }),
    lookupModel: (model) => invoke("studio:models.lookup", { model }),
    removeModel: (model) => invoke("studio:models.remove", { model }),
    raiseModelContext: (model) => invoke("studio:models.raise-context", { model }),
    openUrl: (url) => invoke("studio:open-url", { url }),
    genexAccount: () => invoke("studio:genex-account.read"),
    genexSignIn: () => invoke("studio:genex-account.sign-in"),
    genexCancelSignIn: () => invoke("studio:genex-account.cancel"),
    genexBuild: (idea) => invoke("studio:genex-account.build", idea ? { idea } : {}),
    genexSignOut: () => invoke("studio:genex-account.sign-out"),
    notify: (note) => invoke("studio:notify", note),
    setBadge: (count) => invoke("studio:badge", { count }),
  } satisfies Partial<StudioApi>;
}

/** Plugins and MCP connectors. */
function pluginCalls(bridge: BridgeCalls) {
  const { invoke } = bridge;
  return {
    pluginsList: () => invoke("studio:plugins.list"),
    pluginsCatalog: () => invoke("studio:plugins.catalog"),
    pluginEnable: (id, enabled) => invoke("studio:plugins.enable", { id, enabled }),
    pluginRemove: (id) => invoke("studio:plugins.remove", { id }),
    pluginInstall: (id) => invoke("studio:plugins.install", { id }),
    pluginPanel: (id, panel) => invoke("studio:plugins.panel", { id, panel }),
    pluginSettings: (id) => invoke("studio:plugins.settings", { id }),
    pluginSetSetting: (id, key, value) => invoke("studio:plugins.setting", { id, key, value }),
    pluginReview: (id, name, args, project) => invoke("studio:plugins.review", { id, name, args, project }),
    pluginAction: (id, name, args, project, ticket) =>
      invoke("studio:plugins.action", { id, name, args, project, ticket }),
    pluginChooseFile: (id, request) => invoke("studio:plugins.choose-file", { id, request }),
    genexPublishReview: (project) => invoke("studio:plugins.genex-publish-review", { project }),
    genexPublishPlatforms: (project) => invoke("studio:plugins.genex-publish-platforms", { project }),
    genexPublish: (project, review, title, remix, replaceNativePage) =>
      invoke("studio:plugins.genex-publish", { project, review, title, remix, replaceNativePage }),
    genexPublishApps: (project, title, remix) => invoke("studio:plugins.genex-publish-apps", { project, title, remix }),
    genexCloudBuild: (project, platform) => invoke("studio:plugins.genex-cloud-build", { project, platform }),
    pluginsIndex: (refresh) => invoke("studio:plugins.index", { refresh }),
    pluginInstallGithub: (spec) => invoke("studio:plugins.install-github", { spec }),
    pluginLookupGithub: (link, version) => invoke("studio:plugins.lookup-github", { link, version }),
    pluginGithubVersions: (repo) => invoke("studio:plugins.github-versions", { repo }),
    pluginUpdate: (id) => invoke("studio:plugins.update", { id }),
    pluginWatch: (id, enabled) => invoke("studio:plugins.watch", { id, enabled }),
    pluginForgetAllowed: (id) => invoke("studio:plugins.forget-allowed", { id }),
    pluginConsent: (consentId, approved, always, input) =>
      invoke("studio:plugins.consent", {
        consentId,
        approved,
        ...(always ? { always } : {}),
        ...(input !== undefined ? { input } : {}),
      }),
    permissions: () => invoke("studio:permissions.get"),
    setPermissionMode: (threadId, mode) => invoke("studio:permissions.mode", { threadId, mode }),
    answerPermission: (requestId, answer) => invoke("studio:permissions.answer", { requestId, answer }),
    forgetPermission: (project, rule) => invoke("studio:permissions.forget", { project, rule }),
    mcpList: (project) => invoke("studio:mcp.list", project),
    connections: (threadId, project) => invoke("studio:connections", { threadId, project }),
    mcpSave: (connector, secrets) => invoke("studio:mcp.save", { connector, secrets }),
    mcpRemove: (id) => invoke("studio:mcp.remove", { id }),
    mcpTest: (id) => invoke("studio:mcp.test", { id }),
    mcpConnect: (id, project) => invoke("studio:mcp.connect", { id, project }),
    mcpCancelAuthorization: (id) => invoke("studio:mcp.cancel-authorization", { id }),
    mcpDisconnectAccount: (id) => invoke("studio:mcp.disconnect-account", { id }),
    mcpTools: (id) => invoke("studio:mcp.tools", { id }),
    mcpForgetAlwaysAllowed: (id) => invoke("studio:mcp.forget-always", { id }),
  } satisfies Partial<StudioApi>;
}

/** Subscriptions: engine checks and the Claude and Codex sign-ins. */
function accountCalls(bridge: BridgeCalls) {
  const { invoke, subscribe } = bridge;
  return {
    recheckEngines: (engine) => invoke("studio:engines.recheck", engine ? { engine } : {}),
    // One grammar for both subscriptions: which login, sign me in, forget the studio's account.
    subscriptionSignIn: (opts) => invoke("studio:subscription.signin", opts ?? {}),
    subscriptionForgetStudioLogin: (engine, account) =>
      invoke("studio:subscription.forget-studio-login", {
        ...(engine ? { engine } : {}),
        ...(account ? { account } : {}),
      }),
    subscriptionAccounts: (engine) => invoke("studio:subscription.accounts", { engine }),
    subscriptionUseAccount: (engine, account) => invoke("studio:subscription.use-account", { engine, account }),
    claudeLoginState: () => invoke("studio:claude-login.state"),
    claudeLoginCode: (code) => invoke("studio:claude-login.code", { code }),
    claudeLoginOpenBrowser: () => invoke("studio:claude-login.browser"),
    claudeLoginCancel: () => invoke("studio:claude-login.cancel"),
    openCodeSignIn: () => invoke("studio:opencode.signin"),
    grokSignIn: () => invoke("studio:grok.signin"),
    cursorSignIn: () => invoke("studio:cursor.signin"),
    cursorSignOut: () => invoke("studio:cursor.signout"),
    openRouterKeySave: (key) => invoke("studio:openrouter.key.save", { key }),
    openRouterKeyClear: () => invoke("studio:openrouter.key.clear"),
    typeSafeKeyStatus: () => invoke("studio:typesafe.key.status"),
    typeSafeKeySave: (key) => invoke("studio:typesafe.key.save", { key }),
    typeSafeKeyClear: () => invoke("studio:typesafe.key.clear"),
    openRouterSignIn: () => invoke("studio:openrouter.signin"),
    openRouterSignInReopen: () => invoke("studio:openrouter.signin.reopen"),
    openRouterSignInCancel: () => invoke("studio:openrouter.signin.cancel"),
    opperKeySave: (key) => invoke("studio:opper.key.save", { key }),
    opperKeyClear: () => invoke("studio:opper.key.clear"),
    localServerConnect: (url, key) => invoke("studio:local-server.connect", key ? { url, key } : { url }),
    localServerForget: () => invoke("studio:local-server.forget"),
    localServerFind: () => invoke("studio:local-server.find"),
    onClaudeLogin: (listener) => subscribe("studio:claude-login", listener),
    codexLoginState: () => invoke("studio:codex-login.state"),
    codexLoginCancel: () => invoke("studio:codex-login.cancel"),
    codexLoginDismiss: () => invoke("studio:codex-login.dismiss"),
    codexLoginOpenBrowser: () => invoke("studio:codex-login.browser"),
    codexLoginRetry: (method) => invoke("studio:codex-login.retry", { method }),
    onCodexLogin: (listener) => subscribe("studio:codex-login", listener),
  } satisfies Partial<StudioApi>;
}

/** The embedded terminal. */
function terminalCalls(bridge: BridgeCalls) {
  const { invoke, subscribe } = bridge;
  return {
    terminalList: () => invoke("studio:terminal.list"),
    terminalAccessibility: () => invoke("studio:terminal.accessibility"),
    terminalOpen: (project) => invoke("studio:terminal.open", { project }),
    terminalRun: (project, command) => invoke("studio:terminal.run", { project, command }),
    terminalAttach: (id) => invoke("studio:terminal.attach", { id }),
    terminalInput: (id, data) => invoke("studio:terminal.input", { id, data }),
    terminalResize: (id, cols, rows) => invoke("studio:terminal.resize", { id, cols, rows }),
    terminalAcknowledge: (id, count) => invoke("studio:terminal.ack", { id, count }),
    terminalStop: (id) => invoke("studio:terminal.stop", { id }),
    terminalRemove: (id) => invoke("studio:terminal.remove", { id }),
    terminalOpenLink: (id) => invoke("studio:terminal.open-link", { id }),
    onTerminal: (listener) => subscribe("studio:terminal", listener),
  } satisfies Partial<StudioApi>;
}

/** The game view. */
function previewCalls(bridge: BridgeCalls) {
  const { invoke } = bridge;
  return {
    loadPreview: (project) => invoke("studio:preview.load", { project }),
    loadWebBuild: (project) => invoke("studio:preview.web-build", { project }),
    buildPreview: (request) => invoke("studio:build.preview", request),
    agentScreens: () => invoke("studio:preview.screens"),
    previewBounds: (bounds) => invoke("studio:preview.bounds", bounds),
    previewSound: (request) => invoke("studio:preview.sound", request),
    reloadPreview: (options) => invoke("studio:preview.reload", { retry: options?.retry === true }),
    stopPreview: () => invoke("studio:preview.stop"),
    playPreview: () => invoke("studio:preview.play"),
    previewFullScreen: () => invoke("studio:preview.fullscreen"),
    liveBehind: (project) => invoke("studio:live.behind", { project }),
    previewState: () => invoke("studio:preview.state"),
    previewLive: () => invoke("studio:preview.live"),
    previewCoverStill: () => invoke("studio:preview.cover-still"),
  } satisfies Partial<StudioApi>;
}
