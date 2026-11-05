# Tool permissions in game chats

A game chat's own Claude session follows Claude Code's permission modes and asks the person with
Allow / Deny cards in the chat, as Claude Code asks in a terminal; so does a build's lead, in the
chat's mode. Workers of the chat's lead follow the chat's mode too, their
questions waiting in the chat under the worker's name, and never reach a sign-in, Genex's own data
or another game in any mode ([Workers](#workers)). A chat on another engine follows the modes that
engine can honour ([Other engines](#other-engines)). Everything else the studio delegates (a
reviewer, a second opinion, an older run's builders) stays unattended and sandboxed. The [architecture](agent/architecture.md#processes-and-trust-boundaries)
points here; the [feature map](agent/feature-map.md) lists the selectors and the
[Models and context](product/models-context.md#permissions) page the visible behaviour.

## Who asks

[`src/shared/permissions.ts`](../src/shared/permissions.ts) is the contract: the five modes
(`auto` for a chat that never chose, `default` shown as Manual, `acceptEdits`, `plan`,
`bypassPermissions`), the modes each engine honours (`permissionModesFor`, `engineMode`), the
`tool_permission` event, the answers and the grants "always" keeps. An engine that asks about every
call, reads beyond its folders included, sets `permissionPrompts` (Claude Code).

The host alone decides, from what it recorded itself, never from anything the harness says
([`src/main/core/delegation.ts`](../src/main/core/delegation.ts) `#personSession`, then
[`src/main/core/chat-permissions.ts`](../src/main/core/chat-permissions.ts) `forSession`). A
delegation asks only when all of these hold:

- the brief has no narrower job: not read-only, no
  director, optimization candidate, own `cwd`, run
  self-capture, own `timeoutMs` or improvement class, and it is the chat's own session
  (`isChatsOwnSession`), not a lead's turn;
- it works in its game's own folder and answers a chat turn (`chatTurn`) whose message id the
  person sent on this thread: `ConversationService` notes each composer send
  (`notePersonMessage`) before it dispatches, and the note ends when the queue records the message
  handled or removed, when a Stop ends it (`stopPersonMessages`: the message being answered and
  those its turn took in, never one still queued, which the queue answers next), or when the app
  quits (a message replayed after a restart runs unattended);
- the thread is this game's open chat: metadata `kind: game`, `project` the brief's, not archived.

While a Loop run is going, the person's messages go to the build's lead (live chat). It asks from its
own seat (`DelegationService#leadSession`, then `ChatPermissionService.forLead`), handed `leadAsks`,
never `permissions`, when:

- the engine asks about every call (`permissionPrompts`), and the seat is the host's finding: this
  game's lead of a run (`#seatOf`) that
  was started in this chat (`#runOfChat`), answering the chat (`chatTurn` is its run id). A
  Loop's lead works in place, a web game's too (`director.inPlace`: it writes in the game folder itself, honoured only when its root
  is the game folder by name and real path, it is not `readOnly`, its chat is this game's and open,
  and its run is this game's, started in the chat its delegation and grant name, `#inPlaceRoot`); it asks in the chat's mode
  either way, and a seat the host cannot place runs unattended; a run that finished or paused seats
  no lead in place (`#runRunning`). On an engine that does not ask about every call, a lead in place
  is handed `permissions` in the chat's mode as that engine honours it instead
  (`ChatPermissionService.forPlacedLead`): Plan starts it elsewhere or read-only, its questions go
  to the chat, and it keeps the fence that engine's chat session keeps (the other games denied);
- the thread is this game's open chat.

A lead is the chat's main agent, so only the chat's mode and the rules the person
saved limit it, as the chat's own session: the host adds no restriction of its own. Its session
runs in its chat's Auto, Accept edits or Bypass, so Claude Code decides as for the chat's own
session, or in Manual (`default`) for Manual and Plan (`leadModeFor`; `LeadAsks.mode` when it
starts). The picker switches it while it runs, as it switches the chat's own session: `#live` holds
every running session of a chat (its own, a lead, a worker that asks), and a pick
switches each; so does a mode an answer on the chat's own card sets (a plan approved, "always" with
a mode), which the asking session takes itself. An "always" moves the chat only from Manual: a chat
the person moved to Auto or Bypass while the card waited keeps that mode, and the answer keeps its
other grants (`#keptGrants`). A switch to Bypass answers every card still waiting that was asked
while the chat was in another mode (`ToolPermissions.allowInBypass`, `by: mode`, "Allowed in
Bypass"); a plan still waits for the person. Bypass asks nothing: what Claude Code still asks in
Bypass itself (its own safety checks) is allowed by the host at once, with no card (`#ask`). A lead switches one switch after another (`#switchLead`), each to
`leadModeFor` the chat's mode when it runs, so a later pick wins; a pick made while a lead starts is
applied once its control arrives. Each question is routed by the host (`#leadAsk`) for the chat's
mode at that moment, whether or not the person is talking to it: Bypass allows one running in
another mode, or one its screen asked first (by `toolUseId`), Plan denies (a build is approved work), Auto, Manual and Accept edits
card that waits for the person, as the chat's own session's does; an archived chat's is denied at
once. Every call but a read (Read, Glob, Grep, LS, NotebookRead), the
session's own bookkeeping (ToolSearch, TodoWrite) and the studio's `mcp__studio__*` tools passes
the host's screen first (`#screenLeadCall`, a PreToolUse hook, which Claude Code runs before its
deny, ask and allow rules and in every mode): while the session runs in Auto, Accept edits or
Bypass and the chat is in another mode (a switch that failed, or one still on its way; Accept
edits in an Auto chat excepted), it asks first ("The chat switched from Auto to …"), so the chat's
mode answers, not the session's, a saved allow rule or the game's own `.claude/settings.json`. A
lead's failed switch is never the picker's error; Auto refused records its model as without Auto,
and tells the picker. A message
handed to a lead never makes the chat's own session ask. A worker the host found (its `worker`
grant) runs in the chat's mode ([Workers](#workers)); a reviewer, a second opinion and a director
with its own hands (in its worktree) stay unattended. A plan
approved in the studio's plan review is dispatched without a composer id, so its build runs
unattended. A harness that shapes a brief or writes queue records can make the chat's own session
ask only about a message the person sent that is still unanswered, and a lead ask only for a run
started in this chat; it never chooses the session's mode or answers a card. A lead reads only
the folders the host derived and those the chat recorded (`chatReads`), never a folder the brief
names: one it reads is one Accept edits writes without asking.

## The harness cannot forge it

- The harness makes no threads (there is no `thread.create`), so none of its own can read as a person's chat.
- `events.append` and `turn.append` refuse `tool_permission` and `plugin_consent` rows
  (`refuseHostQuestions`); the host appends both.
- A session a person answers reads beyond its game only the folders the thread records
  (`metadata.extraReads`, set from the person's own messages) and the host's frame folders. A
  rewind may narrow those folders, never widen them (`readsAfterRewind`).
- The mode, the answers and the saved rules are reached only over `studio:permissions.*`, which
  is main-frame guarded like `studio:plugins.*`; the RPC table has none of it. A harness
  `ui.notify` named `tool.permission` or `permissions.changed` only makes the renderer read again.

## The session

With permissions, [`src/substrate/engines/claude-permissions.ts`](../src/substrate/engines/claude-permissions.ts)
launches Claude Code in the chat's mode with `allowDangerouslySkipPermissions` (the picker can
reach Bypass mid-turn) and `canUseTool`, no `sandbox` key, no blanket `Bash`, `AskUserQuestion`
and `EnterPlanMode` disallowed (ExitPlanMode brings a plan back for approval), no sibling-folder
deny list, and the saved allow rules plus the folders granted in the chat. A read-only brief stays
read-only. `askPerson` translates Claude Code's suggestions (`permissionGrants`: allow rules scoped
chat or game by destination, a mode, a folder; never a whole `Bash`, `Edit`, `Write` or `Read`)
and points the kept updates at `session`, so the CLI never writes `.claude/settings.local.json`
into the game. A plan approved into Auto leaves Plan for Manual and then asks for Auto through
the CLI's own gate. The mode the session reports (init and status messages) says whether Auto is
available for its model; `liveControl` hands the picker `setPermissionMode` until the session's
input closes (a pick made while the session starts is applied once that control arrives:
`ChatPermissionService#onControl`), and a refusal comes back as `ModeSwitchFailure.AutoUnavailable`, the only case the
host shows beside the picker.

Every session runs on Claude Code's own system prompt (`claudeCodeSystemPrompt`: the `claude_code`
preset, which the Agent SDK otherwise replaces with an empty one), with Genex's text appended once
(`DelegateRequest.system`: the harness's context, `chatContext` for the chat's own session and its
lead, then its plugins, their guidance and connectors), never repeated in each message
([delegation](../src/main/core/delegation.ts) `#brief`); Codex gets the same text as an app server
thread's developer instructions, and a new `codex exec` session as its first notice. Claude Code 2.1.314 records a session's system prompt as it starts and
sends that record on every resume until a compaction, and `codex exec resume` keeps the developer
instructions a session started with, so a resumed session reads the text it started with: the
harness's context holds only what no turn changes, and of a plugin turned on or off since, only the
tool list follows. Which shell a Windows turn has is its tool list's to say.

No session gets Claude Code's own sub-agents (`Agent`, `Task`), in any mode or seat: Genex runs the
workers, under the person's ceiling and the chat's mode (`disallowedToolsFor`).

A session's own background shells end a minute after its turn goes idle
(`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`); something that must keep running (a long build, a server,
a headless run) is a job (see Jobs below).

A lead with `leadAsks` (`leadAskingOptions`) starts in its chat's Auto, Accept edits
or Bypass (what Claude Code asks in any mode, such as a dangerous `rm`, is carded as for the chat's
own session, and allowed at once in Bypass), or in Manual (`default`), where every edit and command reaches `canUseTool` and the
host. It is launched with `allowDangerouslySkipPermissions`, as the chat's own session, so the
picker can switch it to Bypass mid-turn; `liveControl` hands the host its `setPermissionMode` as
for the chat's own session, and nothing else moves its mode. No `sandbox` key, no blanket `Bash`,
and its read-only brief keeps what the chat's own session keeps: edit, shell and web (still no
messaging, Claude Code's own sub-agents, `AskUserQuestion` or `EnterPlanMode`). Its one PreToolUse hook, with no
matcher, carries every call but the unscreened ones to `LeadAsks.screen` (`leadScreenHook`); a
screen that fails refuses. `askLead` refuses AskUserQuestion, EnterPlanMode and ExitPlanMode
without asking the host and drops mode grants. Its settings carry the saved allow rules, the chat's
granted folders and the person's fence (`protectWrites` included), with no sibling-folder deny
list, as the chat's own session. The lead's prompt still leaves the game's changes to its builders
while the build runs.

A session the person answers on an engine that asks about every call (the chat's own, a lead) reaches
the person's whole computer, limited only by the chat's mode, and reads no note saying so: Claude
Code knows its own environment and mode, and its context (`loop/chat-session.ts` `chatContext`)
names the game's folder, never that the session may not read other folders.

A building worker (any worker brief that writes) keeps no `toolAllow`: the host drops it
(`workerBrief`), so a worker has every enabled plugin's tools, its jobs, `app_look` and the
connectors its lead has, whatever worker type it was started with; a type is the kind of work (its
brief's know-how and default isolation), never a fence. A reader keeps its type's list, and a
reviewer its empty one. A session so narrowed by its delegation's `toolAllow` is offered only the plugin tools and connectors whose names start
with one of the entries, and the guidance, skills and skill reader of only the plugins those
belong to (`substrate/plugins/tool-allow.ts`, `PluginRegistry.snapshot`). A call to any other host
tool is refused as unknown before any consent, record or backend; an allowlist that is not a list
of names offers nothing, and an empty entry allows nothing. Its `attribution` (`runId`,
`agentId`) makes it a builder of its own part: its plugin calls, deliveries and activity are
recorded under the run with the agent id as `facetId`, so its asset cards land on its node and
its words never stream as the chat's reply.

A lead also has the chat's own session's plugins, connectors and cover, whether or not it asks
(`hostToolsEligible`): its director grant's root marks its seat in the game folder
(`#inPlaceRoot`), and the host's own finding of that seat (`seat.leads`) decides, never the brief; a
read-only session that leads nothing gets none. No lead is read-only. On an engine that does not ask
about each call it runs in the chat's mode (`#placedLeadSession`): Bypass unboxed, Plan read-only.
Its plugin calls act on the game folder it sits in (`DelegationSession.leads` as the binding's
directory), its system text is its chat's own, and its run's own consent covers its engine
connector's calls (`liveRun`, `#runConsents`). A grant the host refuses to seat is dropped whole
(`honouredDirector`): the session runs unattended, with no director or run tools. On a game Genex
sees, a lead has the window its chat's turns have (its capture grant); a connector that shares the project root
works on the game folder, as for every session (`resolveProject`). They are auto-allowed studio tools, as for
the chat's own session: a plugin tool that declares `confirmation` waits on its consent card
(`plugin_consent`, nine minutes; one nobody answers settles as "Nobody answered", and the agent
reads that the person may be away, that it is not a no, and to carry on and ask again later; for
any session's later ask it never counts as a decline; a yes to a call whose plugin runs steps
around it or that needs a lock leaves the call only what is left of its one deadline, and one
answered too late to run in time does not run, [plugins](plugins.md)), asked
each time rather than declined by an earlier answer in its run (`priorConsentDecline`), and a connector waits on its card unless its exact tool is saved as
always allowed, its plugin's manifest says the tool only reads (`mcpServers[].reads`,
`McpRegistry.toolOnlyReads`; the Unreal editor's `list_toolsets` and `describe_toolset`), the chat
is in Bypass (any connector) or in Auto (a plugin's connector, which works on this Mac; the
person's own may reach services beyond it), as `PluginToolService#unaskedIn` reads the chat's mode
(`chatMode`). A card those modes would not have asked is answered when the person switches the chat
to one (`PluginConsent.approveForMode`, `by: mode`). A connector's card ("Let the agent use
<name>?", the tool and its arguments under Details) offers Allow once, Always allow ("Don't
ask again for this action in <name>") and Don't allow; Always allow saves that exact tool (`McpRegistry.alwaysAllow`): the person's own connector
in connectors.json, where its card's checkbox shows it, and a plugin's in `always-allowed.json`
beside it, listed on the plugin's page under Connections with **Ask every time** to take it back.
A plugin tool's own `confirmation` card never offers it, and no chat mode answers it, Bypass
included: it asks every call. The Roblox Studio plugin puts Roblox's AI tools, uploads and Creator
Store inserts behind such cards (`generate-mesh`, `upload-image`, `insert-asset` and the rest),
because they run on the person's Roblox account, and its connection never offers Studio's own
copies of them, whose cards Auto and Bypass would skip ([plugins](plugins.md)). A local plugin's agent tool asks each call
too ("<Plugin> was loaded from a folder on this Mac and runs with your access"), and its card offers
Always allow for that tool alone, kept until the plugin's code changes or it is turned off and listed
on its page with **Ask every time**; Bypass and a run's own consent never answer it. A tool of a
local plugin's own MCP server asks every call with those words and offers no Always allow. While the chat is in Plan, no plugin or connector action runs for anyone in it (the
chat's session, its lead, a run's workers; a run's plugin call answers to the chat the run was
started in), saved grants included; reading a plugin's skill still does, and so do the harness's own reads (the
editor's state, log and results, its polls and waits). Its writing steps wait: a chat checkpoint's save, and the Unreal
Loop runner's saves, shots, play checks, editor end and reopen, module and helper steps (`checkpoint: true`;
`PluginToolService`, `ChatPermissionService.planning`), so the runner's save points and autosaves
save nothing and take no snapshot while the chat plans. The lead is not the chat's turn: another
turn ending leaves its consent cards and connector calls going (`outlivesTurn` in `PluginConsent`
and `activeConnectorCalls`). Its own session's end ends its connector calls, but not its plugin cards:
a Loop's lead ends its turn to wait for its workers, so its card for a paid Genex command waits
for the person; the answer, the timeout or a Stop end it. A director's turn writes no Connecting activity, so the build card reads as
planning between parts.

## Workers

A lead runs its workers with a `worker` grant on `engine.delegate` (`HarnessDelegateParams.worker`:
`id`, `title`, the `runId` or chat `turn` it belongs to, and `research`). The host honours it only on
its own finding ([`delegation.ts`](../src/main/core/delegation.ts) `#workerSeat`), on an engine that
keeps a session (`#seatsWorkers`: a delegated agent, or a local model's session Genex runs), never for
a candidate:

- a run worker: its run is running by the host's records (`activityItems`) and was started in
  exactly one chat, this game's open chat, naming no other game (`#runChat`); the delegation names
  that chat or a thread that is no game chat (the run's own); and it works in the game folder or a
  copy of this game's repository inside that run's own folder under scratch;
- a turn worker: the delegation's thread is this game's open chat, whose own session is in flight
  answering exactly that `turn`; it works in the game folder or a copy of the game under scratch.

The chat's own session starts turn workers through the worker tools, which the host hands it only
while it answers a turn on a harness that serves them (`HarnessDelegateParams.workers`,
[`worker-tools.ts`](../src/main/core/worker-tools.ts)). In Plan the host answers a writer's start
(`copy`, `lock`, or no isolation said) itself and forwards nothing: no snapshot, copy or delegation
is made until the plan is approved, while a reader starts and reads in Plan.

A run's lead starts run workers: the director's builders (its conflict worker included) and
readers, and the open Loop's lead its run pool's workers (of the plugins' worker types too), each
delegated with `worker {id, title, runId}` (`loop/director/workers.ts`, `loop/facet/phases/build.ts`,
`loop/workers/run-pool.ts`), so they follow the mode of the chat the run
was started in. A classic Autopilot's builders carry none.

A grant the host cannot confirm runs unattended exactly as before, so forging its absence only
boxes a session. An honoured worker is depth one (`workerBrief`): its `director`, `runControls`,
`interviewTools`, `chatTurn` and `workers` are dropped, it is never the chat's own session (no
bookmark, no person's card, no checkpoint), and Claude Code's own sub-agents are off. A chat runs at
most the Settings ceiling (`buildersMax`) of workers at once, readers and writers alike: past it the delegation is refused with
`too_many_workers` (`DelegationRefusal.TooManyWorkers`, the seed's `WorkerRefusal`) before any lock
is taken. A worker in the game folder runs under its own lock (`workerLockKey`, `<cwd>#worker:<id>`),
beside the chat's own session; `engine.abort` and `engine.interrupt` with `{ cwd, worker }` reach
that worker alone (`delegationAt`), and a worker in its own copy, or one the host did not seat, by
its folder and the id its grant named (`askedWorker`). A worker the host does not seat (a direct
engine's) takes a key of its own only on the host's finding: no director grant, a run started in the
chat it names and going, whose lead in place the host seated (`#unseatedRunWorker`), for its whole
life; otherwise it takes the folder's key. Beside it only that run's lead takes the folder's key, and
it starts beside no other session holding it (`loopWorkerBusy`). A brief naming a worker is a worker's whether or not it is
seated (`workerBrief`). `engine.abort` with `{ cwd, lead }` reaches only the session seated there as
that run's lead in place (`ActiveDelegation.leadsInPlace`), never another chat's turn in the
folder; that turn, refused meanwhile, is told the Loop holds the folder (`loopLeadBusy`). Making a build live waits while anyone,
an in-place worker included, works in the game folder (`delegationsIn`). A building worker is
handed the connector its game's kind brings (an engine's live editor) as its lead is, and a seated
run worker's call to its game's engine connector stands on its run's consent (`#runConsentFor`); a
worker in a copy is told the editor works on the game folder, not on its copy. A run's own call (its
lead's or a worker's) asks with a card that outlives the chat's other turns (`outlivesTurn`).

Its seat (`WorkerSeat`, `#workerReach`) carries:

- the chat's mode, as its engine honours it (`engineMode`), and Plan whenever the chat plans; the
  picker switches its running session as it switches a lead's (`#onLeadControl`, through
  `liveControl`), and while the chat is in a mode it could not be switched to, its screen asks first
  (`#screenLeadCall`). Its box stays the one its start's mode gave it (a worker started in Plan
  stays read-only);
- its write roots: its working folder, the folders the person granted the chat
  (`ChatPermissionService.chatDirs`) and the enabled plugins' `folders`
  (`PluginRegistry.workerFolders`), and the folder of the Godot project the game is linked to when it
  lies outside the game (`DelegationService.#linkedFolders`: Godot's agents change scenes and scripts
  as files; the chat's own session and leads read, and as their mode allows write, the same folder),
  by their real paths; a folder that does not exist yet is left
  out, and so is one that is, holds or sits in a never-touch root (`writableRoots`);
- the never-touch list ([`never-touch-list.ts`](../src/main/core/never-touch-list.ts)): the sign-ins
  (each coding CLI's whole home, the stores every agent's box denies (`baseDenyRead`: `~/.ssh`,
  `~/.aws`, `~/.config/gh`, `~/.netrc`, `~/Library/Keychains`, `~/Library/HTTPStorages`,
  `~/Library/Roblox`), `~/.genex`, Genex's secrets and
  engine homes), Genex's own data (this profile's data folder and the other profiles the app names
  at start, `StudioCoreOptions.neverTouch`: the normal profile's and a developer build's
  `.studio-dev/profiles`), and every other game's folder (the normal profile's `~/AI Games` too when
  this launch keeps its games elsewhere, `neverTouchGames`); its own folder, its run's capture folders,
  its game's folder and the folders of its own run its harness hands it to read (spike and base
  worktrees) stay open inside those, and a Claude Code worker also keeps what its own Claude home
  hands its session (`sessionHomeOpen`: its working folder's projects, and for reading only the
  plans, shell snapshots, environment and todos every session of that home sources);
- what it reads beyond its folder: the host's own folders, its run's own folders and those the chat
  recorded, with no sibling-folder deny list (the never-touch list replaces it);
- `research`: it may use the web as a reader (on Codex, its `web_search` is live for a research
  worker or a writer and off otherwise).

| Chat mode | A Claude Code worker |
| --- | --- |
| Bypass | `bypassPermissions` with no box, as Claude Code's own Bypass: its commands reach the network and the GPU, and the never-touch hook still screens each call |
| Auto | `auto`, in a box that writes only its roots and runs its sandboxed commands unasked |
| Accept edits | `acceptEdits`, in that box, asking about each command |
| Manual | `default`, in that box, asking about each edit and command |
| Plan | read-only: no edits, no shell, the web only when it researches |

In every mode, Bypass included, a PreToolUse hook screens each call first, reads included
(`neverTouchHook`): a file tool by its paths (a search also by the folder it walks; Grep's regex is
no path), a command by the paths its words name (`~`, `~user`, `$HOME`, `$PWD` and `$USER` expanded,
`$'…'` and `$"…"` read as the shell quotes them, a glob or another variable by its fixed folder, a
relative path against the folder a `cd` moved to and, once one moved (a bare `cd` or `cd --` goes
home), every argument as a path from there, `sh -c`, `eval`, `$(…)` and backticks followed;
on Windows drive, share and Git Bash paths; a lone `/` given to `tr` or as a search's pattern is
text) and any `security` call, each path also as its links lead. A word reaches what it names and
all below it, so `rm -rf ~/.codex`, `cd ..` from a game and `ls ~` are refused alike; a call it
cannot read (`${HOME:-…}`, `$OLDPWD`) is refused, and a call that writes is refused in a folder open
only for reading. In every mode but Bypass, the box denies the same roots at the OS boundary,
and Claude Code's own folder (`.claude`) in its folder and each write root, for every command that
stays in it; the text screen is the second net, for what a program builds
as it runs. The sandbox takes no network wildcard, so a boxed worker's command that reaches the
network is asked about as its mode asks. A Bypass worker has no box: the person chose Bypass for
their chat, so its workers run as Claude Code's and Codex's own Bypass do, and only the hook holds
a Claude Code worker. A Codex worker cannot ask the person: in a Bypass chat it runs with Codex's
bypass flag (`runsAsPerson`), and in every other mode it is boxed, its writable roots its write
roots, with no network; in Auto a command it asks to run beyond its box goes to the Auto check,
and one the check cannot decide does not run. Only a delegated engine
(Claude Code, Codex) carries a seat: a local model's work stays unattended, and its chat session is
offered no worker tools.

Plan holds writers on the host (`heldInPlan`): a copy or in-place writer's start and
`worker_mark used` wait for the plan's approval, from the chat's own session and from a run's lead,
so no snapshot, copy or merge is made; a reader starts, and a lead's `finish` closes in place. A start that names a worker type stands as
that type declares, whatever isolation it asks for (a type the host does not know writes). A run's lead is judged by the chats the
host's own records say the run was started in, and the grant's chat if it names one of this game's:
any of them planning holds it, and a run whose chat the host cannot find holds it with that reason.
A run's own workers (the director's builders, the run pool's) that wait on the
person are read from the chat's log too (`loop/workers/questions.ts`): their lead's status says so
and its `worker_wait` wakes. A pool's worker refused for room under the Settings ceiling ends with
the host's words, and its lead may wait (`worker_wait`) and start it again.

Its questions go to the chat ([`chat-permissions.ts`](../src/main/core/chat-permissions.ts)
`forWorker`, `#workerAsk`): a chat closed since denies at once, Bypass allows one running in another
mode, Plan denies, and anything else is a `tool_permission` card naming the worker
(`ToolPermissionEvent.worker`; the card reads "Scene builder wants to …"). A run worker's card waits
as a lead's does (`#workerCard`): it outlives the chat's turns and waits for the person; a turn
worker's waits until its turn ends. Only the asking call waits: the lead and the other workers go on, and no run halts or drops
work over a pending card (`goal_update blocker=approval_required` leaves the run going). The person's answer, a switch to Bypass, a Stop or the worker's end settle it too. "Always" keeps grants as for the chat's own session (never a
mode), so the next worker and the chat's own session stand on them. No agent's message answers a
card: the harness cannot write `tool_permission` rows (`refuseHostRecords`), and a steered message
saying "approved" is a message, not an answer.

A run worker's plugin calls are recorded under its run with its id as the part (`workerAttribution`),
and its plugin and connector calls answer to the Plan mode and Bypass of the chat the run was
started in (`ConnectorCallOptions.runId`), not to the thread it reports on.

## Jobs

A job is a long command the app runs in the background for an agent and owns
([`src/main/core/job-tools.ts`](../src/main/core/job-tools.ts), the registry in
[`src/substrate/jobs.ts`](../src/substrate/jobs.ts)): `job_start {title, command, cwd?, hours?}`,
`job_status {id?}`, `job_tail {id, lines?, contains?}`, `job_stop {id}`. The chat's own session, a
run's lead and a worker the host seated that writes get them, on an engine that carries a seat
(`jobToolsFor`): every engine that keeps a session, a local model's (Bonsai, OpenRouter, a local
server) included; a reader worker, a builder no host seated, a judge and Ollama's
tool loop get none. A plugin tool of the same name is refused.

A start reads the chat's mode at the moment of the call (`ChatPermissionService.modeOf`, `jobGate`),
never the mode the session began in:

| Chat's mode | A job's start |
| --- | --- |
| Plan | Not started: the answer says jobs wait until the plan is approved, before anything is checked or asked |
| Accept edits, Manual | A card in the chat, then the box of its write roots; a declined card starts nothing |
| Auto | Started unasked in the box of its write roots: the box is the check |
| Bypass | Started unasked in the Bypass worker's box: the home folder and its write roots writable |

Before that, its `cwd` must be a folder inside the session's own (relative, no `..` out, no link out,
existing), and its command passes the never-touch screen the worker hook runs (`neverTouchScreen`):
a hit, or a command the screen cannot read, is refused with nothing started, in every mode, Bypass
included, whoever starts it. The keychain tool is stopped here, since a file deny cannot reach it.

The box (`jobPolicy`, through `ProcessSandbox.spawnLongLived`) writes its starter's write roots:
a worker's seat's, or for the chat's own session and a lead the folder its jobs run in, the chat's
granted folders and the plugins' folders, filtered by the never-touch list (`writableRoots`). It
denies the never-touch list (reads fenced around the open folders, writes around the open ones),
Claude Code's own folder in each write root, and, outside Bypass, the game's folder when no write
root holds it (a copy's job never writes the game). The base sandbox's protected paths stay denied.
No job reaches the outbound network (`allowedDomains: []`; the sandbox's domain list is shared by
every sandboxed process); it may serve on localhost.

A worker's job runs in its own folder; a lead's where its plugin calls act (`session.leads ??
workCwd`: a web lead's in the build it leads, never the game folder it sits in; a lead in place's
(the open Loop's) in the game folder); the chat's own session's in the game folder. A session sees and stops only its
chat's jobs; a worker only its own of its run or turn.

The card (`askForJob`, `tool: "Job"`) follows the asker's terms: the chat's own session's ends with
its turn, a lead's waits for the person and outlives the turn, a worker's names the worker
and waits as its other questions do (a run worker's as a lead's). Its
question is plain words ("Scene builder wants to run Unreal build in the background"); the command
sits only in the row's `input` (`{title, command, folder}`), folded under Details. No "always".

A job ends by itself, by `job_stop`, at the time limit its starter set (`hours`, one minute at
least; a job with none has no deadline), when
its run settles (the harness's own `run.settled`: its lead's and its workers' jobs), when the chat
turn that started its worker returns, and when Genex quits. A harness crash or restart ends none. When Genex itself died, its next start marks
each job still recorded as running interrupted and ends its process group (Windows: its tree,
through `taskkill`) when that process's start time still matches the one recorded, so a reused id
is never hit.
The chat's own session's jobs outlive its turns, and its next turn is told which ended
(`jobNotice`); a run's lead hears its run's ends through `jobs.list`, the harness's one read of the
registry ([harness runtime](harness-runtime.md)). Each start and end is a host record in its chat
(`job_started`, `job_ended`, which the harness cannot write), and the harness can neither start nor
stop a job.

The chat shows each job as one line ("In the background: Unreal build · 4 min") whose **Stop** is the
person's (`studio:jobs.stop`, fixture-safe, Studio's main frame only; `stoppedBy: person`):
`jobNotice`, `job_status` and the lead's line say the person stopped it, and the notice and the
lead's line add not to start it again unless asked. A running job's start is a current-state fact of its chat, so the line and Stop stay whatever page
is loaded; what a rewind keeps of them is in [the conversation lifecycle](conversation-lifecycle.md#sending-and-rewinding).

## The person comes first

A plugin's lock ([plugins](plugins.md#locks-the-person-comes-first)) orders work that was already
allowed and grants nothing: a call still asks for its card, Plan still holds it, and its mode is the
chat's. A tool or connector that needs a lock waits for whoever holds it, and while the lock's
probe says the person is using what it guards (playing in the editor), the agents' and Genex's
calls there wait too; the chat's working line (or its running build's) says "Waiting for you to finish in <label>" (only
once the probe saw the person). An agent's call waits up to 4 minutes, within the engine bridge's
10-minute deadline, then answers like a declined consent. The person's own action
(their Rewind) never waits for the person. A worker writing in place holds the game's locks for its
whole life, and the harness's death (or restart) ends its session and releases them. A lock covers a call, not a job the
call leaves running (an Unreal reopen or play check), so such a job's editor is not kept from
others while it runs. Unreal's lock sees the person's play only: a play the agent started through
the editor connector, or Genex's own check, is not theirs. Residuals: the person's edits outside a
play session are not detected, so the agents' work there does not wait for them; a play the person
starts before the lock's probe saw the agent's own play end counts as the agent's; and a play the
agent starts another way (a script) counts as the person's, so its own editor calls wait for it.

## Looking at apps

`app_look {app?, window?, save?}` ([`src/main/core/app-look-tool.ts`](../src/main/core/app-look-tool.ts),
the port in [`src/substrate/app-look.ts`](../src/substrate/app-look.ts)) lets an agent see an app
window: without arguments it lists the windows on screen (app, title, id); with an app name or
bundle id, or a window id or words of its title, it answers that window's screenshot (JPEG, longest
edge 1568 px) and its accessibility tree (roles, titles, values; at most 300 elements, 10 levels and
12,000 characters). It only looks: it sends no input, so it runs in every mode, Plan included, with
no card. The chat's own session, a lead, every worker the host seated and a Loop's reviewer get it,
a reader too (its one host tool); a builder no host seated and a local model's
session do not. A plugin tool of the same name is refused. `save` keeps the screenshot as a
`.jpg` in the session's own folder (the one its jobs run in), for proof: only a relative path with no
`..`, its folders made without following a link and outside the never-touch list, and only for a
session that may write (the chat's own session, a lead, a writing worker) while its chat is not in
Plan; a reader and a reviewer keep nothing. The answer says where it went or why not, and always
carries the picture.

The app runs it host-side, never inside an agent's box: Core Graphics' window list and the tree
(through System Events) by `osascript` JavaScript for Automation scripts that are constants, the
window's pid, title and place passed only as arguments; the picture by `screencapture -l`, shrunk by
`sips` in a fresh folder of Genex's scratch, read and removed. It never looks at a password
manager's window (Keychain Access, Passwords, 1Password, Bitwarden, LastPass, Dashlane), at an app
computer control never drives (System Settings, the system's password prompts and the rest of
`NEVER_DRIVEN_BUNDLES`) or at Genex's own windows (`lookRefused`), and leaves them out of the list.

macOS asks the person for Screen Recording and Accessibility. Genex asks once, at the first look that
finds either missing (`<engine homes>/app-look-access.json` remembers it asked); the first tree read
also brings macOS's own Automation prompt for System Events. While access is missing the agent is
told what the person must turn on and not to retry, and the chat gets one `app_look_access` line per
app session (a host record the harness cannot write), with **Open Privacy settings**
(`studio:app-look.open-settings`, native), which opens only that System Settings pane. Fixture
profiles look at a stub window; other systems answer that it works on macOS only for now.

## Do it for me

`game.engine.assist` ([computer use](computer-use.md#the-persons-computer)) lets an engine plugin
hand a setup click to its game's chat. The person starts one: a plugin action they pressed, or a
tool call whose own `confirmation` card they approved with their own click (the registry marks that
call `confirmed`; a yes given by a mode or a local plugin's own access card never counts). A plugin
that came with Genex may also start one from its own tools for the setup it knows, its task its own
code's words; a Genex moment's or an observer's step never starts one, and any other plugin's agent
reaches it only through a card that asks in every mode. The task is posted verbatim as "<plugin> asks: <task>". A plugin that came with
Genex asks nothing more; any other shows the task on its card first, every time. With computer
control off, the studio's own card (`studio-computer-setting`, "Computer control") asks to turn it
on, in words that say it is for every chat, with Turn on and Not now; an earlier no in the chat
never answers a new press. The chat's session then asks its own session and app cards as any
other desktop session does.

## A Loop's reviewer

The reviewer of a Loop's finish check (`finish.review`, which runs it as `engine.delegate` with
`reviewer {runId, reads}`; [harness runtime](harness-runtime.md#harness-runtime-guide)) is seated by
the host, never by what the harness asks, and only the host records its verdict: only a read-only session, of a run the host's records say is this game's, reading the
game's folder or the run's own copy of it (a worktree of the game's own repository in the run's
folder under scratch, by real path). Anything else (another game's run, a run no chat of this game
started, no `readOnly`, another folder, a link that leads elsewhere, another repository) is refused
before an engine starts. It runs read-only in every chat mode, unattended (it never asks), from a
fresh empty home for each call (`reviewers/<run hash>/<engine>/<call>` in the profile, a folder no
box writes, made by real path, a link on the way refused and never followed; the lead holds its own folder), loads no project
settings even for a trusted game, and keeps no other grant: no director, worker or capture
grant, no run controls, no chat turn, no folder of its own, no plugin tools, connectors or jobs. Its
reads are the lead's folder and the run's captures folder (refused when that is a link). On Claude
Code and local sessions those are its only read roots beside its home, and the unattended fence
denies the other games and the rest of Genex's data (the other runs' folders and captures, the jobs,
the exports). A Codex, OpenCode or Grok Build reviewer's box reads the whole disk,
so it is only told those, and Genex's secrets and engine homes, are off limits, and its brief names
the folder it reads, not its home. Its
seat (`ProjectToolSeat.Reviewer`) is offered `app_look` alone, whose access line goes to the run's
chat; its brief names `app_look` only on an engine that carries a seat.

## Other engines

Every engine's chat has the pill. `permissionModesFor` lists what each one's chat session honours;
the composer greys the rest with the reason (`unavailableModeReason`), and the session runs in
`engineMode`: the chat's own mode where its engine honours it, else Auto, its own contract. The
thread keeps the mode the person picked, so a chat moved back to Claude Code finds it again.

| Engine | Modes | How |
| --- | --- | --- |
| Claude Code | all five | asks mid-turn ([The session](#the-session)) |
| Bonsai, OpenRouter, Opper, Local server | Auto, Manual, Accept edits, Plan | the studio runs its tools and asks before each change; Auto has each command checked by the session's own model |
| Codex | Auto, Plan, Bypass | Auto runs on Codex's app server, asking before what its sandbox would not run, each ask checked by the session's own model; Plan and Bypass keep `codex exec`, which cannot ask |
| OpenCode | Auto, Plan | `opencode run` cannot ask mid-turn and always runs in the studio's sandbox |
| Grok Build | Auto, Plan, Bypass | `grok -p` cannot ask mid-turn: Auto runs it in the studio's sandbox, Bypass as the person outside it, as Codex's; Plan reads from a folder of its own |
| Cursor | Auto, Plan | `cursor-agent --print` cannot ask mid-turn and always runs in the studio's sandbox |
| Ollama, a new engine | Auto | its harness tool loop keeps its sandbox |

The chat's own session on any engine is handed `permissions` (`#personSession`, no
`permissionPrompts` needed); only an engine with `permissionPrompts` gets the person's reach (no
sibling-folder deny list) and a lead's `leadAsks`. Another engine's chat session, and a Loop's lead in place on it, keeps the unattended
fence and the same denied paths (only named in its brief in Codex's and Grok Build's Bypass, which
have no sandbox).

Bonsai ([`local-session-permissions.ts`](../src/substrate/engines/local-session-permissions.ts)
`permitCall`) asks before `edit_file` and `write_file` in Manual and before `run_command` in Manual
and Accept edits, as Claude's `Edit`, `Write` and `Bash` cards; a deny never runs the call and the
model reads why. Plan offers only `read_file`, `list_files` and the studio's own tools and refuses
any change unasked; a local model's `start_web_game` sends its chat with `game.start`, which writes
nothing while that chat is in Plan (a harness that names no chat is not checked, as with a kept older
`tools/game-tools.ts`). Its commands always run in the studio's sandbox, so it has no Bypass. The picker
switches a running session (`onControl`): the next call is decided in the new mode, and the model
reads of it at its next round. In Auto, which has no classifier of its own, each `run_command` is
first checked by the same engine and model in a call of its own with a clean context and no tools
([`auto-approver.ts`](../src/substrate/engines/auto-approver.ts)): allowed, it runs; refused, the
model reads why (`AUTO_REFUSED`); an answer it cannot read, a failed call or a timeout asks the
person, never allows by itself. Edits stay unasked in the sandbox. A worker of the chat's lead on a
local session runs in its seat's mode, asking through its seat (`seatAsks`), writing its write roots
and never reaching its never-touch list, as on Claude Code and Codex.

Codex runs Auto in its `workspace-write` sandbox (the game folder, a worker's write roots, no
network) on its app server (`codex app-server`, CLI 0.159 or later) with `on-request` approvals,
first and resumed turns alike (`thread/resume`): what the sandbox would not run (a command it asks
to run outside, a write beyond its folders) is asked about first, and settled as a local session's
command is ([`codex.ts`](../src/substrate/engines/codex.ts) `#autoApprover`, `settleInAuto`): the
same engine and model in a clean `codex exec --ephemeral` call judge the action alone, never
Codex's reason for it; allowed, it runs outside the sandbox; refused, it is declined and the reason
is steered into the turn (`turn/steer`); unsure asks the person (or, for a worker with no way to
ask, it does not run). Everything inside the sandbox runs unasked. An older CLI, or an app server
that will not open the thread, keeps `codex exec`, which never asks. Bypass runs with
`--dangerously-bypass-approvals-and-sandbox`, and Plan from a folder of its own (`startsElsewhere`,
as a read-only session) where only the studio's bridge is writable, told it plans
(`planModeNote`). A pick applies to its next turn. On Windows every launch also turns on Codex's own
restricted-token sandbox (`windows.sandbox="unelevated"`, `windowsSandboxArgs`): Genex runs Codex
without the person's config, and without that sandbox Codex refuses every command it does not know
to be safe under `approval_policy=never` ("blocked by policy"). Every Codex launch runs with Codex's own
sub-agents (`multi_agent`, `multi_agent_v2`) and its screen and browser hands (`computer_use`,
`in_app_browser`, `browser_use`, `browser_use_external`) disabled, those its `codex features list`
knows (`CODEX_SUBAGENT_FEATURES`, `CODEX_SCREEN_FEATURES`): the studio's `computer` tool is the
only hands an agent has ([computer use](computer-use.md)).

A plan on an engine that ends its turn with it (`plansByTurn`: Bonsai, Codex) is approved by the
host ([`plan-approval.ts`](../src/main/core/plan-approval.ts) `withPlanApproval`): a Plan reply
with words, a session id and no studio tool call becomes the `ExitPlanMode` card. Approved, the same
session resumes in the chosen mode, which the permission service keeps on the chat, told Genex's one
line that the person approved it (`planApprovedNote`, `from: genex`); sent back with words, it
resumes still in Plan with the person's words as they wrote them (`from: person`); a bare deny, a
withdrawn card or a Stop ends the turn with the plan. The card offers only modes the engine honours
(`planContinuations`).

On every engine that honours Plan, Claude Code included, a build the chat's own session recorded to
start (`BuildLaunch`: a Loop launch or `resume_run`) while the chat is still in Plan at
the turn's end (`ChatPermissionService.planning`, so a plan approved mid-turn lets it go) waits
behind the same card, which shows the reply and what the build would build. Approved, it starts as
recorded; sent back with words, it is dropped and the session plans again; any other ending, a
question beside it or a failed turn drops it. The harness starts a recorded build once the reply
ends, so the host is what holds it. While the chat is in Plan the `resume_run` run control answers
that it did not run (`conversation.ts` `#applyRunControl`).

## Auto's classifier

Every session that asks (the chat's own, a lead), in any mode since the picker can
move it to Auto mid-turn, carries the studio's `autoMode` settings
([`src/substrate/engines/claude-auto-mode.ts`](../src/substrate/engines/claude-auto-mode.ts)
`autoModeRules`), which Auto's classifier (and Plan, run with Auto's semantics) reads on top of
Claude Code's own: `environment` and `allow` start with `"$defaults"`, and `soft_deny` and
`hard_deny` are not set, so the CLI's blocks, and a CLI update's new ones, stand unchanged. The CLI
reads `autoMode` only from user, flag and managed settings (never a game's `.claude` files) and
sends it to the server-side classifier too. The environment says the session runs on the person's
own Mac with the person in the chat; for the chat's own session, that the game folder's files git
does not ignore are checkpointed before each message (`main/chat-checkpoints.ts`: not `.env*`,
nested repos or files over 50 MB) and Rewind restores them while HEAD stays put; for a lead, that the build's workers change the game in worktrees of their own and its own edits
there are not checkpointed. Public registries and asset
sites are download sources, not trusted destinations. The carve-outs narrow the built-in blocks
that ordinary game work trips, each naming what stays blocked: changes and deletions of
checkpointed files, build output and caches in the game folder (chat's own session only; not other
ignored files, `.git`, nested repos or large files), well-known packages, scaffolders and headless
browsers, dev servers and directory servers on 127.0.0.1 (LAN only when the person asks) and
stopping the agent's own or its dev port's listener, looking for an asset the person described in
their folders (no sweeps of whole home folders), the game's own agent notes, and local production
builds. The rules stay under `AUTO_MODE_BUDGET` (3,000 characters): they travel in the same
command-line argument as every other setting. When the classifier cannot answer (an API
overload), Claude Code denies the call ("Classifier unavailable") and the model may retry.

## Rules at their real paths

Claude Code reads a rule's `/path` relative to the settings that carry it; only `//path` is the
filesystem root. `absoluteRule` writes every rule that way, in every session, as the CLI converts
a path itself: forward slashes, and on Windows the drive as the first folder (`C:\Users\me` is
`//c/Users/me`, a share `\\server\share` is `///server/share`, which the CLI's parser reads from
`/`); glob and rule characters stay literal, except in a name the matcher cannot spell (a `?`, a
trailing `*` or whitespace), which is left out of the fence and named in the session's log. `protectedTargets` fences the protected folders whole,
except the session's own Claude home, whatever the login (the studio's `CLAUDE_CONFIG_DIR`, the
one the environment names, or the person's `~/.claude`): siblings on the way are fenced whole,
`.credentials.json` is unreadable and the settings files (`settings.json`, `settings.local.json`,
`.claude.json`) are never edited. That is all a person's session fences there: other projects'
transcripts and `history.jsonl` are reached as Claude Code reaches them in a terminal (a read
outside the working folders asks in Manual and Accept edits, Auto's classifier decides, Bypass
allows), which is parity, not a gap.

An unattended session, which nobody answers, reaches in that home only what the CLI hands it
(`homeFence`): `plans/`, `shell-snapshots/`, `session-env/`, `todos/` and, in `projects/`, this
working folder's own project (named as the CLI names it: `claudeProjectDirName`, both spellings,
a cut name with any hash; one not made yet stays reachable). Every other top-level entry has a
rule. Other projects share a few globs instead of a rule each: the SDK passes all settings as one
command-line argument, and one rule per folder once came to 13,692 characters (Windows allows 8,191
through a `.cmd` shim). The CLI (2.1.281) matches with node-ignore, case-blind, where `[!x]` means
`!` or `x`, so the globs branch off the own name `O`: for each place `i` where an existing folder
first leaves it, `projects/<O's first i characters>[<name characters but O[i]>]*`; past it,
`projects/O?*`; and a folder that stops short of it, by name. The rules never pass
`HOME_FENCE_BUDGET` (4,000 characters, broadest first); the session's log names what stayed
readable.

Unattended sessions get `Read()` rules for that fence and for the workspace deny list, which now
leaves the delegation's own game readable (a worktree's `node_modules` link and git point there)
and scans a folder's neighbours only under the games root or scratch. A person's session also gets
`Edit()` rules for every studio file in userData (`#hostFiles` walks it; the games, the chat's
folder, secrets and engine homes excepted) and the permission store. A build's lead builds with
its own hands in its game folder (its seat's checked real path, `LeadSessionAsk.leads`); its run's
worktrees, other runs and `runs/` stay fenced.

## Questions and answers

`#ask` appends a pending `tool_permission` row (input digest bounded, plan ≤32k characters),
emits `tool.permission` and waits on `ToolPermissions`
([`src/main/tool-permissions.ts`](../src/main/tool-permissions.ts)): the plugin consent ledger
without a timeout, for every card (a lead's and a worker's included; an older chat's rows settled
`by: timeout` still read "Withdrawn: nobody answered"). The person's answer, Stop (`stopThread`, `engine.abort`, harness death, app
stop), the session's abort or the end of the turn settles it; a lead's card is not
the chat's turn (`outlivesTurn`), so another turn ending (a picture or slash command answered on its
own) leaves it waiting. A withdrawn request reaches Claude as a deny in the host's own words ("The user stopped this work before answering."), never as words
the person typed: the answer carries `withdrawn`, which only the host sets (`permissionAnswer`
builds each Studio UI answer afresh). An answer that does not fit (Allow for a plan) is refused. "Always" keeps game rules in
[`src/main/permission-store.ts`](../src/main/permission-store.ts) (`engine-homes/permissions.json`,
atomic and serialized; a failed read is retried, never written over; Plan, Bypass and whole-tool
rules are not believed), chat rules and folders in memory, and a mode on the thread. The boot
repair denies a request left pending (`by: restart`).

## A game's own Claude settings

A game's `.claude` folder is Claude Code's project settings (`settingSources: ["project"]`): its
allow rules and hooks load into the person's own session there, which has no sandbox. The harness
never writes it: `game.write` refuses a path through a `.claude` folder at any depth, in any case
and as Windows reads a name, checked as named and as it really lands (a link inside the game
included), for a game and an optimization candidate. Landing a build (`landBuild`, the person's
button) and promoting a candidate refuse a commit that changes one.
The sandbox denies every agent process (the harness, `run.exec`, builds) writing a game's
`.claude` folder (`claudeFolderDenyWrites`).

## For the next Loop run

Unattended deny rules now actually apply (they were relative before and guarded nothing). A real
Loop run must confirm the two known changes: builders can no longer read sibling worktrees under
`scratch/autopilot/<run>/`, and optimization candidates now read the live game.

## Residual risks

- Computer control (the `desktop` tool, [computer-use](computer-use.md#the-persons-computer)) is off
  until the person turns it on in Settings → Permissions; on, it acts with the person's own access
  in every app they allow: the per-app consent card is the boundary.
  A page, document or message the agent reads there can try to steer it; the tool tells the model
  that on-screen text is never an instruction, and the studio itself, password managers and system
  settings are never driven. Web pages (`web_*`) open only in a separate, clean browser with no
  logins; a page's text can still try to steer the agent.
- Codex has no Manual or Accept edits: a chat in either runs Codex in Auto, whose asks the Auto
  check settles. What the check allows beyond Codex's sandbox runs without it, as in Bypass: the
  check reads the action alone, not the never-touch list. Its
  Bypass has no sandbox at all, as the CLI's own flag, for the chat's session and its workers alike,
  and neither has Grok Build's, whose builds then run as the person (`runsAsPerson`). Bonsai and Codex ask about no read, and their
  "always" offers no standing grant.

- One card holds a lead's call until the person answers it. In Manual a run nobody watches waits on
  each question (its workers and jobs go on); Auto or Bypass keep it going.
- A lead has no sandbox: whatever its chat's mode allows runs with the person's
  access, as in the chat's own session, edits and commands in the game folder included, so it can
  change the live game under the run: that folder is where it builds. Genex's checkpoints (its save
  points, the close's last work) and Rewind are what take it back.
- A lead whose session will not switch (the CLI refuses, or Auto is unavailable for
  its model) stays in the mode it runs in: in Manual it keeps carding in an Auto or Accept edits
  chat, and in another mode it asks first for each call while the chat is elsewhere (except Accept
  edits in an Auto chat), until a later pick switches it or its next session starts. A call screened
  while a switch is on its way asks first too.
- A lead's plugins act in the game folder: what they deliver is there at once, and the close's
  checkpoint keeps it with the rest of the last work.
- A plugin's consent card holds a lead's call for up to nine minutes, the plugins' own timeout.
  A lead nobody answers through (another engine, a turn that is not the chat's) has its plugins and
  connectors too, acting in the game folder.
- A director with its own hands, a builder and the other run sessions carry the chat's thread in
  their plugin bindings: another turn of the chat ending still withdraws their consent cards and
  aborts their connector calls. Only a lead's outlive the chat's turns.
- A lead's seat rests on run records the harness writes: an edited harness can start a lead for a
  run started in this chat, acting in the chat's mode with nobody there.

- The never-touch hook reads a command's words, relative paths from the folder the session's shell
  stands in (the hook's `cwd`, which Claude Code moves with each `cd`). A here-document a program
  takes as text (`TEXT_READERS`: `cat`, `python3`, `node`, Blender and the like), on the command
  line the session runs itself with nothing on it that runs input as commands or a file by its path
  (`./x.sh`), names paths only as paths alone, so code and prose in it (`a / b`, `~40 deg`) reach no
  folder; one a shell, `xargs`, a loop, any other reader or a substitution (`eval "$(cat <<…)"`)
  takes is screened as commands, and a `<<` in a comment or an arithmetic or parameter expansion is
  no here-document. A path built while it runs from a variable other
  than `$HOME`, or a `cd` into a folder that only names itself at run time, escapes it. A command a
  worker runs outside its box (approved by Auto's classifier, or by the person in Accept edits and
  Manual) is held by the hook alone, as every command in Bypass is. The box names the roots holding
  a worker's own folders by walking them when the session starts, so an entry made later is held by
  the hook alone until the next session.
- Codex's box never stops reads, so the never-touch list holds a Codex worker's writes only (its
  brief names the roots it never reads).
- A Bypass job writes the whole home folder outside the never-touch list, as a Bypass worker does.
  Jobs have no outbound network in any mode: a download stays with the session's own shell or the
  "Install packages" button. A job's command is screened by its words, as a worker's; its box holds
  what the screen cannot see.
- A Loop led in place snapshots the folder before its first turn.
- A worker's seat rests on run and queue records the harness writes: an edited harness can make an
  unattended job ask in the chat for a run started there, in the chat's mode, never beyond it.
- A harness `game.start` that names no chat is not held in Plan: an edited harness, or a kept older
  `tools/game-tools.ts`, can write the web starter while the chat plans (the boot reports the kept
  copy).
- A turn worker's card waits until its turn ends: a chat turn nobody watches in Manual waits on it.
- A person's session has no sandbox: its shell runs with the person's access. Manual asks before
  each command, Auto leaves it to Claude Code's classifier, Bypass runs it. The fence binds Claude
  Code's file tools, not commands.
- Inside an unattended session's Claude home, `plans/`, `todos/`, `shell-snapshots/` and
  `session-env/` are shared by every session of that home, so one session can read another's plan
  or todo list; an entry made after a session starts is fenced from the next one (a new project
  folder from the same one only when it branches where an existing folder already does).
- The sandbox inherits the home fence's `Read()` rules as `denyRead`. On macOS they become profile
  regexes (case-sensitive; the globs use the session's own spelling). On Linux and Windows the
  sandbox code expands globs by walking the folder; neither has been checked in a live session.
- A project folder that differs from the session's own only in case (possible on Linux) cannot be
  fenced by the case-blind matcher without fencing the session's own, and stays readable.
- The harness's sandbox names each game's `.claude` folder at launch or adoption. On macOS a
  case-blind glob covers a folder not made yet and any new game under the games folder; a `[` in
  the game's path is escaped, and a `*`, `?` or ASCII control character matches any one-byte
  character, so the deny can also cover a neighbour's `.claude`. On Windows and Linux only folders
  that exist are named (srt-win would create a missing one), and Linux's sandbox drops a path
  holding `[`, `]`, `*` or `?`, so there the host's own refusals stand alone for a folder made
  later or so named. A game adopted, or created anywhere but directly in the games folder, while
  the harness runs is denied to the harness process itself from its next start.
- The `.claude` deny matches paths, so an agent that can write a game's parent can move the game
  away, write its `.claude` and move it back. sandbox-runtime locks only the folder above the
  deny's first glob character against moves: a plain game kept elsewhere is locked itself, a game
  in the games folder only through that folder, and one whose path holds a glob character only
  above that character.
- The Windows rule form (a drive, a network share) follows the CLI's own conversion and parser and
  is covered by a unit test, not yet by a live Windows session.
