# Connections, chat context and local setup

This document owns the current connection/context behavior. Provider execution contracts live
in [engines](agent/architecture.md); plugin authoring lives in [the SDK guide](PLUGIN_GUIDE.md).
Implementation evidence and outstanding acceptance gates live in the task handoff, not here.

## Connect from the existing conversation

The connection list separates plugin backend health from account state. A ready backend can
still have a locked or disconnected account. Reading that state uses the current memory lease;
it does not open credential storage. Unlocking an account does not approve tool-specific
permissions or charges.

The game composer Add menu exposes installed plugins and configured MCP connectors. Manage opens
Plugins; a plugin's name, its hover Settings and Setup open that plugin's page with its registered
settings panel. Connecting a source does not
create a new conversation. The next provider request resolves the enabled, project-scoped tool
registry. An active native session receives a refreshed tool contract at its next supported
response/session boundary; Studio retains the conversation and its provider resume identity.
Setup opens the plugin detail page with its registered settings panel already expanded.
The Plugins workspace preserves the mounted conversation and game stage; Back to workspace
or a sidebar game returns without a reload. Skills has these sections, in order
(`[data-skills-section]`):

- **This game** (`game`, with a game open): the game folder's own `.claude/skills` and
  `.claude/commands` (Claude Code builders) and `.agents/skills` (Codex builders), read over
  `studio:skills.project` with every root confined to the game by realpath and oversized files
  skipped with a warning. Builders load these from the folder themselves; Studio never writes them.
- **Studio skills** (`studio`): the active Studio-owned `skills/*.md` inventory, used by local
  chat, the run planner and the director.
- **Provider global skills** (`provider`): Codex’s native `skills/list` for the selected CLI
  profile and a read-only Claude inventory of personal skills, legacy commands, managed skills
  and installed plugin packages. Codex disabled entries remain labelled. A note under each
  provider says whether builders load its catalog, chosen by the typed `builders` field
  (`ProviderBuilderUse`): never for Claude (Studio’s sessions are project-only); for Codex, yes
  from Studio’s own profile, yes from your borrowed Codex login (so your `~/.codex` skills reach
  builders too), or not while Codex is signed out.
- **Plugin skills** (`plugins`): installed manifest contributions with their enabled state. A
  file skill shows its summary and “Read by agents on demand”, and opening it reads the file over
  `studio:plugins.skill`; a plugin’s page shows what its last update added, changed or removed.

A plugin’s switch, here and in the composer’s Add menu (hint “All games”), turns it on or off for
every game. A session's plugins are its tool list on each launch and its system text as it started:
a resumed Claude Code or Codex session keeps the plugin guidance it started with, and no notice
says one was turned on or off since it last ran. Discovery does not execute skills, import hooks/MCP servers or prove use in a
conversation. Refresh skills rechecks the inventory; errors are distinct from an empty list.
Studio archives remain excluded; Claude shared-skill links are confined to known skill roots.

Connection/account setup is available through the game composer's Add menu and Plugins. The chat has no separate
connection disclosure or enabled-source count. Revision comparison stays in the host snapshot
instead of adding configuration numbers to the composer.
Activity includes delegated workspace sessions and direct completions,
even when there is no outer chat-turn lease. It is scoped to the initiating conversation.
Enabled, connected, authenticated and service-ready are separate facts.
Worker session activity carries role/run/task identity and cannot replace the orchestrator's
phase. Reply text streams are thread/delegation-scoped and reconciled to durable messages;
tool completion alone does not imply that a build or its independent checks passed.
Plugin rows put account state beneath the description and one aligned recovery/settings button beside the toggle. Recovery unlocks saved authorization or begins browser sign-in; status polling never unlocks credentials. A recovery the locked secret store refuses says why (for example, no unlocked system keyring is available). Optional connections remain opt-in.
An idle plugin backend is lazy, not failed. MCP readiness and tool counts belong to the selected
project's transport; another project's successful connection is not evidence of readiness here.
A plugin's missing account or required setting is a global setup requirement, so it remains
visible even before that project's transport has been opened.

Disable/remove blocks further dispatch immediately, even while the current session holds an
older tool list. Genex is the exception for what is the person's: turned off, its account,
sign-in and Publish actions keep running, and it can't be removed ([Play](play.md)). Stop aborts local connector/plugin waiting associated with that conversation.
An accepted remote request may continue; local cancellation does not prove remote cancellation
or a refund. Changes to unrelated sources do not wait behind another project's session.

## Coding-provider login and catalog

Local CLI sign-in status, catalog availability and successful execution are distinct evidence.
Codex's app-selected credential policy is passed in the final `exec`/`exec resume` option scope:
Codex 0.155.1 discards root `-c` values when the nested command supplies its own overrides.
This keeps app login's credential store in force for builders, resumed sessions and critics,
without inheriting unrelated user configuration or copying credentials.

Catalog refresh uses the selected CLI and login home, with a ten-second deadline and coalesced
requests. Claude reads SDK initialization metadata; Codex uses paginated app-server `model/list`.
Neither sends a prompt or starts a turn. Only unsupported Codex discovery falls back to the CLI
cache. Snapshots refresh at startup, sign-in changes, focus after sixty seconds, and on request.
A refresh forced by a sign-in or a request reads again even while an earlier read runs, and only
the newer answer lands: the earlier read may predate the sign-in (OpenCode's sign-in terminal
finishing seconds after focus started a read). Late answers from a previous identity are
discarded. Failed refreshes retain same-identity rows as
stale; absent catalogs expose provider default. Authentication and discovery failures stay separate,
except in first launch: discovery starts the CLI, so a signed-in subscription whose list never
loaded is not shown connected there but offers a check again, which retries discovery too.

Aliases retain their request IDs and show reported canonical targets. Explicit model IDs and saved
cross-provider roles are never silently replaced. New unset roles and effort defer to CLI defaults
under Genex's launch policy. Settings can update the selected CLI; provider operations and updates
are mutually exclusive. The app never silently installs a different executable or auto-updates.
A sign-in event names its own provider; its adjacent harness reply replaces duplicate narration.

### Several accounts per subscription

Claude Code and Codex each run on one account at a time: the Terminal login (the CLI's own home),
Studio's first login (`engine-homes/<engine>`) or an added one (`engine-homes/accounts/<engine>/account-N`),
listed by `SubscriptionAccounts` (`substrate/engines/subscription-accounts.ts`), which keeps the
choice and the emails in `accounts.json` beside the added homes. A chosen account runs whether or
not it is signed in, never another one silently; with no choice the old order holds (environment,
Studio's own, Terminal). A finished sign-in remembers its account and chooses it
(`settleSignIn`); `studio:subscription.signin` takes `account` (an id, or `new` for a fresh home),
and Codex never signs in to `~/.codex`. `studio:subscription.accounts` lists them for the renderer
only, asking each CLI for its email once a run (`claude auth status --json`, Codex `account/read`);
emails never reach `engine.describe` or plan usage. `studio:subscription.use-account` switches from
the next message on (Codex refuses while work is in flight); a resumed session another account made
starts fresh. Settings shows the accounts as tabs under the provider with + to add one, and the
usage panel names a plan's account when there are several; a switch to a signed-out account starts
its web sign-in. Signing out deletes only that Studio-owned home and runs the next signed-in account.

## Install a coding CLI

Install (Update for a CLI too old) in Settings → Model Providers and the chat's sign-in card, and
Set up in first launch, installs Claude Code or Codex with its vendor's own installer, in the background:
`install.sh` on macOS and Linux, `install.ps1` on Windows, from `claude.ai` and
`chatgpt.com/codex`. Settings installs OpenCode the same way from `opencode.ai/install` (macOS and
Linux only) into `~/.opencode/bin`, and updates it with `opencode upgrade`. OpenCode publishes no
Windows script (it installs there with Chocolatey, Scoop or npm), so on Windows its row and its
first-launch screen offer its install guide and Check again instead of Install
(`installsInApp` in [cli-install.ts](../src/shared/cli-install.ts)), and an install asked for anyway
fails as `unsupported`, never as a download; Grok Build from `x.ai/cli/install.sh` (`install.ps1` on Windows) into
`~/.grok/bin`, updated with `grok update`; and Cursor from `cursor.com/install` (`?win32=true` on
Windows) into `~/.local/bin` (`%LOCALAPPDATA%\cursor-agent` on Windows), updated with
`cursor-agent update`. Cursor's installer also links `~/.local/bin/agent`, a name Grok Build's
installer uses too, so discovery looks only for `cursor-agent`. Main fetches the script over HTTPS
itself, with a program's user agent (cursor.com answers a browser's with its web page), runs it as the person with the
contractor environment (no keys, none of the other vendor's variables; Codex with
`CODEX_NON_INTERACTIVE=1` so it asks nothing), keeps only its last output for `studio.log` and
stops it after ten minutes. Both installers use folders discovery already searches (`~/.local/bin`;
Codex's `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` on Windows). The engine then rechecks, and an
installer that exits cleanly without a working CLI counts as failed. There is one job per CLI: a
second press joins it and every button follows it (`cli.install`). The page names only which CLI;
`studio:cli-install.start` is native, so fixture profiles refuse it. Like the person's own terminal,
the installer runs outside `ProcessSandbox` ([cli-installer.ts](../src/substrate/cli-installer.ts)).
A failure says why; Settings then adds the vendor's install guide.

## OpenRouter and OpenCode

Both are metered (`billing: "metered"` in `shared/providers.ts`): every token is paid to someone,
so `EngineRegistry` never offers one as a fallback or a first ready engine, and the sign-in gate's
local finish and the reference judge never pick one. Only the person's explicit pick runs on them.

**OpenRouter** ([openrouter.ts](../src/substrate/engines/openrouter.ts)) is a direct engine on the
same pi-ai path as Ollama ([pi-completions.ts](../src/substrate/engines/pi-completions.ts)), and a
game chat or build runs as a Genex session (`LocalSessions`, under OpenRouter's own id), as Bonsai's
does. Settings and first launch send a pasted key over `studio:openrouter.key.save` (native); main
checks it with `GET /key`, keeps it only when accepted (`openrouter-api-key` in the SecretStore
under `userData/secrets/providers`, which no agent process may read) and answers with the engine
status, never the key. First launch's Connect OpenRouter (`studio:openrouter.signin`, native) is
OpenRouter's OAuth with PKCE ([openrouter-login.ts](../src/main/openrouter-login.ts)): the browser
opens `openrouter.ai/auth` with an S256 challenge and a random `state`, comes back to a one-time
callback on `localhost` (127.0.0.1 and ::1, a free port), and main redeems the code once with its
verifier at `/auth/keys`; the key goes to the same `saveKey`, and the call answers only how it ended.
A callback without this sign-in's state is refused; ten minutes without one ends it. While OpenCode's
free models are all a person can build with, first launch lists them to pick one, OpenCode's
default first (`opencode::default` names no model, so it follows OpenCode's own choice), and the
pick seeds the first game's chat (`rememberWelcomeModel`). A locked store saves nothing and says so. The public `/models` list is read without
the key; only tool-calling models are listed, with their context, reply cap, vision, reasoning
efforts and price. OpenRouter picks no default model. Context is estimated from characters before
each request (compaction runs early rather than late); 401/403 is a sign-in failure, 402 a usage
limit, 429 a rate limit. Errors are redacted before they are logged.

**OpenCode** ([opencode.ts](../src/substrate/engines/opencode.ts)) is a delegated engine that runs
`opencode run --format json` with the brief on stdin, resumed by `--session`. Two command lines are
spoken, picked by the version `opencode --version` prints (`openCodeRelease` in
[opencode-cli.ts](../src/substrate/engines/opencode-cli.ts)), never guessed: 1.18 (`--pure`,
`--variant`, the `permission` map, `opencode models --verbose`) and 2.x from 2.0.20 (Homebrew ships
2.x while OpenCode's own installer still ships 1.18). A 2.x newer than the tested 2.0.26 runs and
its status says so; an older 2.x, 3.x or an unreadable version is refused, and discovery then tries
the next OpenCode on the search path (a manual choice never yields). On 2.x every session passes
`--standalone --agent build`: OpenCode's shared background server runs outside the sandbox with the
settings of whoever started it, so each session runs a private one inside `ProcessSandbox`. 2.x
reads its folder from `PWD`, gets `OPENCODE_DISABLE_PROJECT_CONFIG=1` (a game's own OpenCode config,
plugins and agents never load, as `--pure` kept them out on 1.18) and an empty `OPENCODE_TEST_HOME`
(2.x stops when the sandbox refuses it the home folder's `.claude`), and takes the effort as
`--model provider/model#variant`. Every session, either dialect, is given the person's own
`XDG_DATA_HOME`, `XDG_STATE_HOME` and `XDG_CACHE_HOME`: on Windows it runs as the sandbox's own
user, whose home holds no sign-in, so only the free models would run. Its model list is `GET /api/model` from a private `opencode serve`
started on the host for the listing alone, read until two reads agree (its first answer can come
before its catalog loads); the sign-in runs `opencode auth login --standalone`.

OpenCode keeps its own sign-ins (`opencode auth login`, which Sign in runs in a terminal inside its
Settings row, never the dock, so Settings stays open; when it prints an https page, main keeps the
address and the row offers Open sign-in page, `studio:terminal.open-link`) and the studio never
reads them: it is Ready once it lists a model. OpenCode lists its own free models to anyone, so
while those are all it lists the account is `none` and the Settings row reads Free models only with
Sign in first; the picker then lists the first three, marked Free (`free` on the model, `offersLineup`),
and picks one by itself only when no other model can run (`autoChoice`). OpenCode's own docs say a
free model's prompts may be used to improve it. Once a provider is signed in, its models start the
list and the free ones wait in Settings; a paid provider not yet set up shows no rows at all. It has
no sandbox of its own, so each session runs in `ProcessSandbox`: the workspace (a scratch folder
when read-only) plus OpenCode's state and cache are writable, its own data folder is exempt from the
credential denies for that sandbox only (`SandboxOptions.ownHome`; on Windows, where a deny is an
ACE for the whole sandbox group, no sandbox denies it, `keepWindowsDenies`, and the studio's own
sandbox grants OpenCode's data, state and cache folders at its start, `openCodeSessionFolders`,
since srt-win regrants only while no sandboxed command runs), and only the picked model's
provider hosts (the address OpenCode lists, plus a built-in provider's known API and browser
sign-in hosts, OpenCode Zen's `opencode.ai` among them, which a session started before the list was
read still gets) and OpenCode's catalogs (`models.dev`, `models.opencode.ai`) are
reachable, plus, on 2.x, loopback (`127.0.0.1`, `localhost`): its run command talks to a server it
starts for itself, and on Windows the sandbox sends loopback through its proxy, which answers a host
it was not given with a bare 403. `OPENCODE_CONFIG_CONTENT` sets every permission to allow or deny, never ask, denies web
fetch, skills and other folders to a build, and lets a read-only session run only the studio bridge
(`node .studio/bridge/tool.mjs`), which carries the studio's tools as it does for Codex. On 2.x,
which allows any tool it has no rule for, the rules open with a deny of everything and are repeated
on the `build` agent so the person's own agent rules cannot widen them.
A session with live tools (the `computer`) also gets them as a local MCP server, `studio`
([studio-mcp-shim.ts](../src/substrate/engines/studio-mcp-shim.ts)): OpenCode starts
`node .studio/bridge/mcp.mjs` as its own child inside the same sandbox, the shim relays each call
over the same bridge, and a picture comes back as MCP image content the model sees inline. Both
dialects allow `studio_*` (1.18's `run` rejects any tool it would ask about; 2.x's rules deny
everything first); 2.x declares it under `mcp.servers` with Code Mode off. The bridge command stays
the fallback, and `mcpTools: false` turns the server off. Compact now is refused on
both: OpenCode compacts its own sessions. A provider's HTTP status in an `error` event (1.18's
`data.statusCode`, 2.x's `status`) decides the failure kind, as for OpenRouter; a 400 or 404 for a
picked model ends the build saying which model the provider refused and to pick another; a 403 for
a picked model whose provider has no host Genex knows says the sandbox kept OpenCode from it, not to
sign in again; and a failure on one of OpenCode's free models says so, keeping its kind. OpenCode
lists every OpenAI model even on a ChatGPT sign-in, where OpenAI refuses some, so while Codex is
signed in the picker starts OpenCode's GPT models with the ones Codex lists (`runnableModels` in
`renderer/model-lineup.ts`). Recorded streams and listings: `tests/fixtures/transcripts/opencode-*`
(OpenCode 1.18 and 2.0.20).

## Opper

**Opper** ([opper.ts](../src/substrate/engines/opper.ts)) is a European AI gateway: one API key for
hundreds of models. It is built as OpenRouter is: a direct, metered engine on the pi-ai path whose
game chats and builds run as Genex sessions (`LocalSessions`, under Opper's own id), so the app never
picks it on its own. It ships as Beta (`beta` in `shared/providers.ts`) until a live test proves it.
Settings sends a pasted key over `studio:opper.key.save` (native); main checks it with `GET /v3/me`,
which spends nothing, keeps it only when accepted (`opper-api-key` in the same SecretStore as
OpenRouter's) and answers with the engine status, never the key. There is no browser sign-in and no
first-launch screen: the key is pasted in Settings → Model Providers. Completions go to the
OpenAI-compatible `https://api.opper.ai/v3/compat` with the system prompt in the system role and
`reasoning_effort` as the dial. Opper lists models only to a key, so with no key the catalog is
empty; with one, `GET /v3/compat/models?view=simplified` lists each model once (a bare pool name
such as `claude-sonnet-4-6` when several providers serve it), and only language models that call
tools and answer in text are kept, with their context, reply cap, vision, reasoning efforts and
price. Routing graphs (`dynamic/<name>`) are left out: they price nothing ahead. Like OpenRouter's,
the picker shows the catalog's first three, Opper picks no default model, context is estimated from
characters before each request, the HTTP status decides the failure kind, and errors are redacted
before they are logged. Tests: `tests/conformance/engine-opper.test.ts` against a local fake
(`tests/helpers/fake-opper.ts`).

## Grok Build

**Grok Build** ([grok.ts](../src/substrate/engines/grok.ts)) is xAI's coding CLI (`grok`) as a
delegated engine, metered like OpenCode (`billing: "metered"`): it runs on whatever its own sign-in
is, so only the person's pick runs it. Grok keeps its sign-in in its home (`$GROK_HOME`, default
`~/.grok`); Sign in runs `grok login` in a terminal inside its Settings row (Open sign-in page,
as for OpenCode), which signs in to the person's Grok account in the browser, and Genex reads it
only to copy it for a Windows session (below). First launch offers it in its "or use" row, with the same Install and Sign in on its own screen
(`CliScreen.tsx`); signed in, it counts as something to build with. An xAI key the person's shell exports never reaches the CLI (`childEnv` vendor `grok`), so a
session never turns into a per-token bill behind their back; a key put in Grok's own config still
runs, and a result is then billed `api` (`_x.ai/auth/info` says `xai.api_key`), else `subscription`.

Whether it is signed in and which models it offers, the CLI says itself
([grok-cli.ts](../src/substrate/engines/grok-cli.ts), `probeGrok`): `grok agent stdio` speaks the
Agent Client Protocol, and its `_x.ai/auth/info` (`methodId`: `cached_token` for `grok login`, null
when signed out) and `_x.ai/models/list` (names, context windows, effort levels, the current model)
answer after `initialize`, with no session and no model call. A turn is headless
([grok-events.ts](../src/substrate/engines/grok-events.ts)): `grok --prompt-file … --output-format
streaming-json`, the prompt a file of ACP content blocks (Grok reads no piped stdin, and on Windows
the sandbox passes none), resumed by `--resume` (by id, from any folder). Grok drops a picture block
(its ACP says `image: false`), so each picture is a file beside the prompt that the words name, and
Grok's own `read_file` shows it to the model (`grok-prompts.ts`).
Each turn gets `--sandbox off` (the studio's holds it), `--no-wait-for-background`, Grok's own ask
tools, plan mode, goal, schedulers and workflows removed, and `GROK_HOME` named outright; the person's
Claude and Cursor MCP servers, hooks and skills, Grok's memory and its updater are off by variable,
and `RUST_LOG=error` makes its error log name a failed call's HTTP status (`grokStderrStatus`),
which a 429 after Grok's own retries leaves out of the `error` event. A build and a read-only
session approve every call (`--always-approve`): a call Grok's headless ask mode refuses ends the
whole turn, so a read-only session's sandbox, which writes only its scratch folder, keeps the game
as it is, and its file-editing tools are gone. A one-shot answer keeps Grok's ask mode and approves
nothing. Studio tools reach it through the file bridge, as Codex's.
Each tool call is mirrored as it starts and its result as it ends, so a steer cuts the turn between
calls; a reply streams to the chat and becomes one row per response; each response's whole prompt
is the context reading. Compact now runs Grok's own `/compact` on the resumed session
(`auto_compact_completed`). Its sandbox writes the workspace (a scratch folder when read-only) and
Grok's home (`ownHome`; on Windows the studio's sandbox grants it at start, as OpenCode's folders),
denies writing a game's own `.grok`, and reaches only xAI's hosts (`api.x.ai`,
`cli-chat-proxy.grok.com`, `auth.x.ai`, `accounts.x.ai`, `grok.com`). A chat the person set to
Bypass runs its builds outside that sandbox, as the person, as Codex's Bypass does
(`runsAsPerson`, `grokOutside`): in their environment less every credential and other vendors'
variables, with the studio's toolchain PATH, on Grok's own sign-in, which it renews itself. A
read-only session of that chat, and Compact now (which the harness asks for as unattended work),
keep the sandbox, which can resume the session the person's Grok kept. On Windows the sandbox runs
Grok as its own user, and Grok gives `auth.json` to the Windows user who signed in alone, on every
read and write (#531): each run reads a copy in its own folder instead (`GROK_AUTH_PATH`,
`copySessionSignIn`), every account's entry without its refresh token, removed after the run (and,
after a crash, before the next one). A run never renews the sign-in: xAI takes each refresh token
once, and a renewal kept in the copy would leave the person's own file holding a spent one. So when
an account's token has less than two hours (or half its life) left, the person's own Grok renews it
on the host first (`renewGrokSignIn`: `grok agent stdio`, with Grok's early-renewal lead
`GROK_AUTH_EARLY_INVALIDATION_SECS` reaching just past that expiry, short of a new token's life),
and the run copies the renewed file. A run waits 20 s at most; Grok gets two minutes and is never
stopped between xAI's answer and its write, which would leave a spent token. A sign-in a renewal
left unchanged waits five minutes before another try. Status codes decide failures
(401/403 sign-in, 429 rate limit, 400/404 the picked model refused); a failure with none is a
sign-in failure only when the probe then finds Grok signed out. xAI refuses a CLI older than 1.0.13
with 426: discovery calls it outdated, and so does a 426 mid-session until the CLI changes, and the
row shows Update needed with its installer. An X Premium+ account signs in (`cached_token`).
Recorded streams and probes: `tests/fixtures/transcripts/grok-live-*` (Grok Build 1.0.70 on a real
account), `grok-standin-*` (xAI's error answers from a scripted stand-in);
`STUDIO_GROK_CLI_TESTS=1` runs the real CLI in the real sandbox (`grok-cli-live.test.ts`).
On Windows the real CLI runs in the real sandbox on the Windows runner with a made-up sign-in
(`windows.yml` dispatched with `grok`), including a renewal through a provider-command sign-in.
Unproven: a real plan's usage limit (Genex does not read plan limits yet), a real Grok account on
Windows, a renewal of xAI's own sign-in (its OIDC refresher; the provider-command one is proven),
and a Windows run that outlives what its copy has left.

Residual risk, as for OpenCode: Grok Build must read its own `auth.json` and its shell shares its
sandbox, so a Grok session can read Grok's sign-in; every other sandbox denies `~/.grok`. On
Windows a run holds only access tokens, never a refresh token, but one Windows user runs every
sandboxed command, so any of them can read the copy while the run lasts, or after a crash until the
engine's next run clears it.

## Cursor

**Cursor** ([cursor.ts](../src/substrate/engines/cursor.ts)) is a delegated engine that runs Cursor's
agent CLI, `cursor-agent --print --output-format stream-json --stream-partial-output`, one process
per turn, the brief on stdin, resumed by `--resume <session id>`
([cursor-cli.ts](../src/substrate/engines/cursor-cli.ts)). It runs on the person's Cursor account:
Cursor's own models draw on the plan's weekly pool, and Claude, GPT and Gemini in Cursor, or use past
the pool, are paid from the account's prepaid credit. So it is `billing: "metered"`: the app never
picks it by itself. It ships as Beta until a live test proves it (`beta` in the provider table: a
Beta tag beside its name in Settings and its group in the picker). Settings shows it in the CLI rows ([CliSignInRow](../src/renderer/panels/CliSignInRow.tsx)), as
OpenCode and Grok Build: Install, Sign in (`cursor-agent login` in a terminal inside the row, which
opens the browser and prints the page for Open sign-in page; `studio:cursor.signin`, native), and
once connected Check connection, Sign in again, Sign out (`cursor-agent logout`,
`studio:cursor.signout`, native) and Update. First launch's "or use" row offers it with its Beta
tag, as Grok Build: Install and Sign in on its own screen. The engine is Ready once `cursor-agent status --format json` says `isAuthenticated` and
`cursor-agent models` lists a model; the picker shows the CLI's default (`auto`) and the first three
it lists, the rest under Older models.

Cursor keeps its sign-in itself and Genex never reads it. On a Mac the CLI keeps it in the Keychain
unless told otherwise, and no sandboxed command can reach the Keychain, so every call Genex makes sets
`AGENT_CLI_CREDENTIAL_STORE=file`: the sign-in lives in `~/.cursor/auth.json` (on Windows
`%APPDATA%\Cursor\auth.json`, on Linux `$XDG_CONFIG_HOME/cursor`), and a Terminal sign-in kept in
the Keychain is not Genex's. Cursor's homes (`cursorHomes` in
[credential-homes.ts](../src/substrate/credential-homes.ts)) join the credential homes every other
sandbox denies, and are `ownHome` in Cursor's own sandbox only.

Cursor's sandbox cannot start inside Genex's, so each turn runs in `ProcessSandbox` with
`--sandbox disabled`, `--trust` and `--force`: the box is the boundary, as for OpenCode. Its network
is Cursor's hosts (`*.cursor.sh`, `*.cursorapi.com`, `cursor.com`); Cursor's agent connection reads
the sandbox's proxy itself and `NODE_USE_ENV_PROXY=1` covers Node's own requests. It writes the
workspace (a read-only session, Plan or a reviewer runs from a scratch folder), Cursor's own folders and a Node compile cache, never a game's
`.cursor` (its rules, hooks and MCP servers). Two options `--help` does not list are passed, checked
on 2026.10.22: `--disable-auto-update` (its updater rewrites `~/.local/bin/agent`) and
`--single-turn` (a turn ends with its reply instead of waiting on a dev server left in the
background, which kept `--print` from exiting). A judge's answer runs in `--mode ask` from an empty
folder. Studio tools reach it through the file bridge, as for Codex; pictures are files it is told to
open.

A failed turn writes no event: the CLI says why on stderr and exits non-zero. Its Connect code
decides the kind (`[resource_exhausted]` a usage limit, `[unauthenticated]` a sign-in failure,
`[unavailable]`, `[internal]`, `[deadline_exceeded]` unavailable); a CLI that stops before its
session starts is a sign-in failure only when `status` then says no account is signed in; anything
else ends the build with the CLI's words, its session kept. A turn that prints nothing for 10 minutes
(30 while a tool call is open) is stopped, and one still running 5 seconds after its result is
stopped and kept; either way its process group goes with it. Compact now is refused: Cursor compacts
its own sessions. Tests: `engine-cursor.test.ts` on `tests/fixtures/transcripts/cursor-*`.

## Build with Genex credits

**Genex** (`genex` in the provider table, `billing: "metered"`, `runsClaudeCode`) lets someone with
no Claude or ChatGPT plan build on their Genex credits. It is `ClaudeCodeEngine` with a `gateway`:
the same Claude Code runs, in the studio's home, without any of the computer's own Claude variables,
and every call goes through the app's relay ([genex-relay.ts](../src/substrate/engines/genex-relay.ts))
to genex.games, which runs it and bills the person's credits. The relay listens on 127.0.0.1 and
gives each session a lease, a key that works for that session only (`ANTHROPIC_BASE_URL` and the key
are the session's whole account); it takes the key off, puts the person's Genex token on, names the
model and the chat (`x-genex-model`, `x-genex-chat`) and passes only the two Messages routes
(`GenexBuildRoute`). The token never enters an agent's environment, and nothing a session holds can
spend once it ends. genex.games owns the price, the plan and the models; the app shows the three it
ships with (`GENEX_MODELS`, Sonnet first) until genex.games lists its own, and helpers run on Sonnet.

The lane ([genex.ts](../src/substrate/engines/genex.ts)) reads `GET /api/desktop/llm/status` (reused
for 5 seconds, joined while in flight) and maps its access word to the engine's status: ready, or a
sign-in, Pro or a credit pack, a verified email, more credits, or paused. A 404 means genex.games does
not offer building with credits on that stand: the engine reads `not_offered` and the app hides Genex
everywhere (picker, first launch, Settings, the usage panel). A call genex.games refuses moves the
status at once, so the chat follows the refusal rather than the next read.

What a Genex model still needs is the chat's blue notice
([genex-build.ts](../src/renderer/genex-build.ts), [GenexNotice](../src/renderer/ui/GenexNotice.tsx)):
Genex's G, one line, one step, and the person's own plans as quiet links (Connect Claude Code,
Connect Codex) that move the chat onto them. Signed out, without Pro or credits, or with an
unverified email, **Continue in browser** opens genex.games's build page through
`studio:genex-account.build` (native): it signs the person in with the app's device code, offers Pro
or a credit pack, and shows the waiting idea back; the app asks Genex again every 3 seconds for 15
minutes, and a game's first message held above the notice sends itself once Genex is ready. Out of
credits, the step is **Get credits**, beside **Continue on Claude plan** (or ChatGPT) when that plan is
connected. Claude Code missing or too old is **Set up**, which installs it in the app.

First launch offers **Use Genex** beside the two plans where genex.games offers it; it asks for
nothing then and becomes Genex ready (setting up Claude Code first when it is missing). Settings →
Model Providers shows Genex's row after the plans ([GenexBuildRow](../src/renderer/panels/GenexBuildRow.tsx)):
the notice's line and step while something is missing; once ready, Connected, an Account menu
(Check connection, Get credits) and its models. A Genex Pro member's monthly credits show in the
usage panel ([Plan limits](#plan-limits)). Tests: `genex-relay.test.ts`, `genex-engine.test.ts`,
`genex-notice.test.ts`, `genex-settings-row.test.ts`, `onboarding.test.ts`.

## Your own model server

**Local server** ([local-server.ts](../src/substrate/engines/local-server.ts)) connects a model
server the person runs: TabbyAPI (ExLlamaV3 on an NVIDIA card), LM Studio, llama.cpp, vLLM, KoboldCpp
or an Ollama elsewhere on the network, through its OpenAI-compatible API. Like OpenRouter it is a
direct engine on the pi-ai path whose game chats and builds run as Genex sessions (`LocalSessions`
under its own id), so Loop's workers and reviewers can use it; unlike OpenRouter it is
`billing: "local"`, so it may be picked by itself and may take over a throttled run.

Its row is the last in Settings → Model Providers (`LocalServerRow.tsx`); Local Models and the
welcome's local screen link to it. Until a server is saved the row lists the servers answering on
this computer's usual ports (`find`: 5000, 1234, 9931, 8080, 8000, 5001, 1337) and takes an address
with an optional API key. `studio:local-server.connect`, `.forget` and `.find` are native. The
address ([address.ts](../src/substrate/local-server/address.ts)) may be typed without a scheme or
`/v1`, or pasted as an endpoint; `0.0.0.0` reads as this computer. It is refused, reaching nothing,
unless it is `http(s)`, carries no user, password, query or fragment, and every address it names
(a host name is resolved) is loopback, private, link-local or the shared range tailnets use: a
hosted API that bills per token belongs to OpenRouter or OpenCode. The address is saved only when
the server lists models with the key given (or the one already kept), in the engine home's
`server.json`; the key goes to `local-server-api-key` beside OpenRouter's and travels as both
`Authorization: Bearer` and `x-api-key` (TabbyAPI requires one by default). Only a JSON 401/403
asks for a key: macOS's AirPlay receiver answers a bare 403 on port 5000. The Ollama the app
already reaches as its own provider is refused.

Discovery ([discovery.ts](../src/substrate/local-server/discovery.ts)) names the software by its
model list's `owned_by`, llama-server's `Server` header, then each server's own signature (TabbyAPI's
`/.well-known/serviceinfo`, KoboldCpp's `/api/extra/version`, `/lmstudio-greeting`, Ollama's root),
and reads each model's runtime context and vision from what that server reports: `meta.n_ctx`,
`max_model_len`, a single-model server's `/props`, LM Studio's `/api/v1/models` (or `v0`), Ollama's
`/api/show` and `/api/ps`. llama.cpp's `chat_template_caps.supports_tools: false` lists a model that
cannot build; LM Studio's embedding models are left out. A model whose context nobody reports is
planned for 32K, compacted at that budget and never refused before the server is asked. Requests use
the plain OpenAI shape every server reads (system role, `max_tokens`, no `store`, no strict tool
schemas, no reasoning dial). Thinking a server leaves inline (`<think>…</think>`) is held out of the
streamed answer and kept as reasoning. Statuses: no server (`not_installed`, row Not connected),
nothing answering (`not_running`), a key wanted (`needs_login`), no models (`not_installed`), ready.
A llama.cpp `exceed_context_size_error` is a context overflow; a cut whose server then answers
nothing is `unavailable`, so another engine may take over. Tests: `engine-local-server.test.ts`
against `helpers/fake-local-server.ts`, which speaks each server's dialect.

Residual risk: the CLI must read its sign-ins and its shell tool shares its sandbox, so an OpenCode
session can read OpenCode's own `auth.json` (and a Cursor session Cursor's), and its commands can reach the provider host the session
calls. OpenCode's permission rules keep its own tools inside the workspace, but that is not an OS
boundary. Every other sandbox still denies the folder. Every sandbox allows localhost, where
OpenCode 2.x's background server listens outside any sandbox; its password
(`~/.config/opencode/service.json`) is in every sandbox's deny-read list (`baseDenyRead`), but a
server the person runs without a password stays reachable.

## TypeSafe (fast decisions for pilots)

Optional, and not a model engine: TypeSafe's Jev answers typed questions in a fraction of a second,
and an engine play's pilot (see [computer use](computer-use.md)) may ask it which of its moves to make.
Settings → Model Providers ends with its row ([FastDecisionsRow.tsx](../src/renderer/panels/FastDecisionsRow.tsx)).
A pasted key goes over `studio:typesafe.key.save` (native); main
([fast-decisions.ts](../src/main/core/fast-decisions.ts)) checks it with TypeSafe's `GET /v1/models`,
keeps it only when taken (`typesafe-api-key` in the SecretStore under `userData/secrets/providers`) and
answers its state, never the key; `studio:typesafe.key.status` (fixture-safe) reads whether one is
saved. A play's decider ([typesafe.ts](../src/substrate/typesafe.ts)) sends each ask as one
`POST /v1/systemone` on the pinned `jev-1.14.0` (`FAST_DECISION_MODEL`): a `choice` named `genex_move` over
the moves beside the pilot's own questions, dropped after 1.5 s. Without a key nothing reaches
TypeSafe and pilots choose by their own order.

## MCP setup

Add server opens one window: a paste box, then On this Mac or From a URL, a name, the command
or URL, secret rows (environment variables or headers) and More options (only in this game, see
this game's folder, start-in folder). Pasting JSON, Codex TOML, a URL, a command line or a
`claude`/`codex mcp add` line fills the form (`shared/mcp-import.ts` `parseMcpInput`); inline
values become secrets and unsupported fields are reported. The command is one line split like a
shell without expansion (`shared/command-line.ts`) and saved as an argument array, quoted back
when edited. The id comes from the name (`github`, `github-2`) and never changes after saving.
A URL saves as streamable HTTP and falls back to SSE when the server refuses it; an existing SSE
server stays SSE. Switching between On this Mac and From a URL drops the secret rows, so an
environment variable is never sent as a header (or the other way). A URL server signs in through
the browser when it asks, unless it has a header (every header is a key); a switch that cannot be
saved is that Connect's failure. Studio resolves its launch environment through the user's
login-shell PATH. A changed launch command requires renewed user trust.
Connect completes setup in one Studio flow. A connected row shows its tool count;
Connect is offered for recovery, not as an extra required step after a successful connection.
Each agent session asks every in-scope connector for its tools as it starts
(`McpRegistry.toolsReport`); one that fails, or lists none (an editor's connection whose editor isn't
there yet), is logged with why and named in the session's brief as missing this turn, so the agent
doesn't search for the tools its plugin's guidance names.

Folder roots are opt-in. A server receives only the host-bound project's root when the user
enabled sharing. Roots describe relevant files; they are not an OS filesystem sandbox. Agent
inputs cannot choose another project's path, credentials, launch commands or permissions.

HTTP/SSE connections can use browser OAuth. Connect owns explicit credential unlock and the
loopback authorization callback. Tokens/client metadata remain in host-protected storage and a
host-memory session lease. Polling and tool discovery never open a browser or independently
unlock saved credentials. After a restart, a connector with saved environment or header
secrets is not started at all until the user presses Connect: its card reads "Saved credentials
are locked. Press Connect…", and its tools, test and tool list are refused rather than run
without the secret. Disconnect/lock revokes new calls; errors redact credentials even
when a late response came from a transport created before revocation. Custom OAuth-server
interoperability still needs real service acceptance; protocol regression coverage alone is
not proof that every provider's sign-in flow works.

## Genex and Blender

Genex Connect advances one account flow without an extra Studio confirmation: existing browser authorization
when required, and host-owned completion polling. Closing its panel does not discard the flow.
An already unlocked account is leased in memory to Genex's backend and declared MCP transports;
restarting a child does not independently reread Keychain. A successful connection/unlock records host-owned remember intent. On app restart, enabled installed plugins with that intent (and Genex, on or off) restore the saved encrypted credential once. Explicit re-enable or reinstall also restores that saved authorization once, without browser sign-in. A refused OS unlock remains failed until another explicit action; duplicate enable requests and status polling never retry. Explicit disconnect clears remember intent before credential deletion. Older installations establish intent on their next successful Connect/Unlock.
Studio never resets Keychain. Legitimate OS consent remains possible. On Linux, non-KDE sessions
use the Secret Service backend and KDE keeps KWallet; without OS-backed encryption the
connection remains locked and credentials are never stored through Electron's `basic_text` fallback.

Coding uses the selected subscription/local provider. Signing in enables Genex asset generation,
charged to the connected Genex account; there is no separate Studio spending setup.
Genex's ledger/admission/recovery remains authoritative. Its optional hosted Blender connector
requires a configured remote URL and account; it does not replace the independent Local Blender
plugin. That local plugin uses the public API 3 managed-runtime/job services and needs no account.

Bundled plugin changes carry a new package version, and bundled plugins update with Studio at
launch ([plugins](plugins.md#removal-and-reinstall-by-recorded-origin)).

## Model setup and activity

Settings below Harness opens Model Providers, Local Models and Harness. Add more models in the game model
list opens Model Providers, preserving the conversation and restoring composer focus on
dismissal. Model Providers contains one row per Claude Code/Codex connection with its CLI version and state;
Local Models contains downloadable models and their durable installation status. First-launch
setup links open these same sections. Codex and Claude Code remain independently installed and
updated. A new Studio build does not install or update those coding executables.

Each chat consumes its own activity projection: connecting tools, thinking,
running a tool, waiting, loading/queuing local inference, compacting, stopping, completed or
interrupted. Ordinary provider end-of-sequence `stop` is not user cancellation. Turn counts reset
at the start of the current turn. Qualified tool names alone cannot distinguish MCP from plugins;
the host's attributed tool record supplies the source.
Codex bridge instructions use JSON for numeric/boolean plugin arguments as well as nested MCP
schemas. String-only tools retain simple flags; validation never silently coerces a string into
an agent's numeric or boolean request.

Codex dynamic tools are an opt-in alternative to the bridge
(`CodexEngineOptions.codexDynamicTools`, off until a live spike confirms CLI 0.159's experimental
`dynamicTools`). With it on, a new session with live tools on CLI 0.159.0 or later runs its turn
on `codex app-server` (`substrate/engines/codex-turns.ts`): `initialize` opts into
`experimentalApi`, `thread/start` declares every tool the bridge would carry as a function with
its schema, and each `item/tool/call` goes to the bridge's handler, its pictures sent inline as
data URLs (`codex-dynamic-tools.ts`: answers capped at 12 MiB; malformed calls, undeclared tools,
another thread's calls and arguments over 1 MiB are refused in words). Notifications are
rewritten as `codex exec --json` events, so the log and chat read the same, and the brief is told
its bridge commands are function tools. The sandbox and approvals are the exec turn's, as `-c`
config and typed `thread/start`/`turn/start` params; `-c mcp_servers={}` stands in for the
missing `--ignore-user-config`. A handshake refusal falls back to exec and the bridge for that
turn and the engine's lifetime; resumed sessions, older CLIs and the default keep exec. The
session's `system/init` event records `tool_delivery` (`dynamic_tools` or `file_bridge`).

Genex's context for a Codex session (`DelegateRequest.system`) is an app server thread's developer
instructions (`developerInstructions` on `thread/start` and `thread/resume`). `codex exec` could take
it only in argv, which a context with its plugins' guidance overflows on Windows, so a new exec
session reads it on stdin as its first notice, under Genex's mark, and a resumed one, which keeps
its first instructions anyway, has it in its history. The message's parts follow in order
(`#delegateTexts`): Genex's notices under its
mark (`genex-mark-prompts.ts`), the prompt as its sender wrote it, then Codex's own per-turn notes
(the bridge's tools, plan or read-only, the off-limits paths), each its own text item on the app
server and apart by blank lines on exec's stdin.

A read-only follow-up that leaves the game's content unchanged does not reload the preview or
warn about an untouched empty scaffold. The bounded content stamp includes Git-ignored runtime
assets/build output as well as tracked files. Tool bookkeeping is excluded. An unknown stamp or
a changed file retains the normal preview/health checks. This does not alter run judging.

## Context ownership and controls

The game composer's Context panel shows the selected provider/model's working capacity, separately from the
last measured session's usage. Worker/judge measurements do not overwrite the orchestrator's
meter. Missing telemetry stays unknown; it does not become zero. A model switch does not borrow
the previous provider's percentage. Keep going retains the recorded session model/effort and its
chat-specific policy; an explicit model or default selection takes precedence. Requested and reported actual model identity remain separate:
a reading records the pick it was taken for, the default pick included, beside the model the
provider reports running.

Studio's app-wide conversation has no tool, role or context menu. It uses the resolved single
model's completion API, recorded user/assistant messages, current images and a host snapshot of
recent activity/settings/proposals. The conversation is windowed automatically for each request;
the full history remains saved. It does not resume a game chat's native session or expose project tools.
The session checkpoint controls below describe game conversations and delegated build sessions.

Auto-compaction policy is host-owned, by model or by chat-and-model; the composer states only that
context compacts automatically and no longer edits the threshold. A threshold applies only to the
local engines Studio compacts itself (Bonsai, Ollama): Claude Code and Codex compact at their own
point, chats and workers alike, and a custom threshold for them is refused
(`substrate/context-settings.ts`). Saved policies still apply, and Compact now works for every
engine ([below](#compact-now)). A chat can inherit its model policy again. Agents cannot change
these controls.
The last checkpoint/native-compaction timestamp survives later usage events from the same
provider, model, role and session. A different or unidentified session cannot borrow that time.
Resetting policy also refreshes the displayed threshold to its effective inherited value.

- **Codex:** compacts at its own point (about 90% of its window); Studio sends no
  `model_auto_compact_token_limit`. It reads the exact session's metadata, retaining compaction
  boundaries separately from later token counts.
- **Claude Code:** supported SDK telemetry and compact-boundary events report session usage.
  Old in-flight measurements cannot restore usage from before a compaction. A Studio chat-log
  summary is not a native Claude-session compaction.
- **Bonsai:** the managed runtime applies its actual chat template and tokenizer, including
  tools/system instructions, then reserves output and image headroom. Studio checkpoints at
  complete tool-round boundaries before exceeding the selected policy. Completed operations
  are not replayed to recover from overflow. An irreducible task that cannot fit fails honestly.
- **Completion-only Ollama:** the local harness performs its own context checkpoint. Explicit
  policy does not run alongside a second silent history-window truncation. Before the model is
  asked, the tool loop checks that the instructions and tools fit 70% of the window
  (`promptThatFits`, `loop/tool-loop.ts`). It checks only a window the engine measured: a model
  Ollama has not loaded reports none (`contextEstimated` on the engine's model), so the turn goes
  to Ollama, which answers with its real context. A measured window too small for the instructions
  and tools alone (Ollama's 4,096-token default) fails at once with a `context_too_small`
  failure. It compacts nothing, and its message names a context length that fits and where Ollama
  sets it. Under it the chat offers Raise context to 16K (`chat/RaiseContextLine.tsx`): Ollama
  copies the model with `num_ctx` 16384 (`/api/create`, weights shared, `shared/ollama-context.ts`)
  and the chat switches to the copy, whose Modelfile context counts as measured before it loads.

### Compact now

Compact now is the context panel's Compact button (on the reading's line), or `/compact` typed as the whole message: "/" opens the
composer's command list (`ui/ComposerCommandMenu.tsx`), which runs it instead of sending the text,
and lists it as waiting while a turn or a build runs (`loop/session-compact.ts`).

On Claude Code, Codex and Grok Build (`EngineDescriptor.compactsNatively`) the chat's latest
session compacts itself with the provider's own compaction and goes on under the same id. Grok
Build is sent its own `/compact` headless on the resumed session (`grok -p /compact --resume`), and
keeps its summary sealed inside the session, as Codex does. Claude Code is sent its
`/compact` on the resumed session, as the Agent SDK documents; its `PostCompact` hook hands over
the summary, without the model's scratch analysis. `codex exec` has no compaction command, so
Codex compacts the thread on its app server (`codex app-server`, `thread/compact/start`,
`substrate/engines/codex-app-server.ts`) and the next `exec resume` continues it; the app server
has no `--ignore-user-config`, so where Studio borrows the person's sign-in it reads their Codex
config while it runs, and no model turn or tool runs. The `compacted` event is marked `native`:
it ends no session (`shared/chat-rewind.ts` `endsChatSessions`), so the next turn resumes it.
Claude's summary rides on the event; Codex keeps its own sealed inside the session, so its event
has none and a prompt built from the log keeps every message (`loop/prompt.ts`).

Where the provider's own compaction did not run (Claude Code refuses a session with too little to
compact), or on Bonsai, the chat's latest session, resumed read-only for one short turn, writes a
handover that becomes the chat's `compacted` event; it covers the first exchange and all but the
last four asks, which stay verbatim. Ollama, a chat with no session, or a session that wrote none
falls back to the log summary (`loop/compact.ts`); a chat too short for that keeps its session. A
handover or a summary ends the chat's sessions as a rewind does: the host forgets every session
recorded before it in what the harness reads (`harnessView`) and clears the thread's
`contractor`, so the next turn opens a fresh session briefed with the handover and the recent
conversation. The event names the session it ended, which a turn never resumes
(`loop/compaction-log.ts`). A message sent while Compact now runs waits in the chat's queue until
it is over, then starts the next turn. After a paused build the run's controls are granted per
turn and keep working, and a Resume seats a fresh lead told the handover before the chat's latest
messages (`freshChat`). While it runs the live status reads **Compacting the conversation**;
afterwards the chat keeps its own row, **Compacted N messages**, in the work rows' type, which
opens to the summary in one framed box when there is one.

### Switching the chat's model

The person may switch a game chat's model at any message, and the chat stays one conversation
(`loop/chat-continuity.ts`). A session goes on only while it is the chat's latest (`goesOn`): a
model switched back to after another one answered starts a fresh session, since its own missed
those turns, and Compact now works on that latest session only. A session the engine cannot
resume — it throws, or answers that it has no such conversation (another account's, one never
saved) — is replaced by a fresh one in the same turn (`loop/chat-steer.ts`), so the chat never
stays stuck on it. The person's words always go alone, as they wrote them; a fresh session
mid-conversation is also told the chat so far as one Genex notice (`historyNotice`): the latest
written summary (`compactedSummary`, which reads past a Codex compaction's sealed one), then the
last messages verbatim (`loop/brief-window.ts`: 20 messages, at most 18,000 characters). No extra
model call summarises the chat first. The new model gets the conversation, not the previous
model's own context (files it read, commands it ran): it reads the game's folder as it needs. A
switch of model or effort mid-turn is the next leg's option alone; another engine starts a new
session told the chat so far.

A Bonsai response stopped by its output limit cannot dispatch partial tool arguments. The session
retains usage and existing work, asks for a smaller edit at most twice, then reports a recoverable
output-limit failure. It never retries an already executed tool as part of this repair.

Local checkpoints keep original requirements, an incremental summary, completed call identities
and recent complete tool rounds. Full source history remains in the session's archive. Switching
incompatible local model variants makes a successor session with lineage rather than reusing
an incompatible saved session. Interrupted tool results remain unknown until inspected.

### Native context telemetry

The Claude SDK context-summary control reports measured usage and model capacity during a
session. Collection is throttled and asks only for context and the model list: the CLI answers
control requests one at a time, and its plan-usage control can scan recent transcripts for
seconds, so a running session never asks for plan usage, and a judge, which has no meter, does
not ask for context. Failed controls remain unknown;
model/session matching prevents another request’s usage replacing the selected session.
A Claude reading is recorded with source `provider` (Claude Code's own meter), so the composer
shows it without "About"; the delegation mirror keeps the source a reading names and records
`estimated` only for one that names none. A Codex session-file reading carries `percent` when the
CLI reports `model_context_window`, and every native compaction since the build began is announced
and counted once, including two between polls. Engine `Usage` reports what the provider reported
and leaves the rest absent, never 0: `output_tokens` includes reasoning (`reasoning_tokens` is its
thinking share), `cache_write_tokens`, Claude's per-model `by_model`, `duration_api_ms`, `ttft_ms`
and `compactions` ([evals](evals.md#what-the-app-records-for-evals)).
Every provider compacts automatically at its own point (Auto), chats and workers alike: the
composer offers no compaction point and Studio sends none (no `autoCompactWindow`, even from a
preference an earlier build saved, and no `model_auto_compact_token_limit`), and Compact now is
the manual control on every engine ([above](#compact-now)). Codex compaction boundaries and later
token counts are retained separately.
See `claude-telemetry.test.ts` and `context-policy.test.ts` for the regression boundaries.

### Plan limits

Main keeps every subscription's limits as one live state (`main/core/provider-usage.ts`) and pushes
each change as `provider.usage`; the renderer's `state/provider-usage.ts` is the one copy the
composer reads. `studio:provider-usage` answers with the state as it stands and starts a read; each
subscription is read on its own and pushes its own answer, so a slow Claude read never holds Codex
back. A report's `state` is `checking`, `ready`, `not_shared` (the provider answered with no
limits), `failed` (the read threw or ran out of time) or `signed_out` (a shown subscription whose
login lapsed), and its `usage` always belongs to `account`, the account in use: a refresh of the
same account keeps the last numbers while it reads, a switch never shows the last account's. An
`engines.changed` (sign-in, switch, recheck) reads again the subscriptions already shown. Reports
never carry emails or credentials. Neither read
starts a turn. Claude opens an SDK session whose prompt never yields, in the judges' empty
directory with no settings or MCP servers, calls the account-usage control and closes it;
`normalizeClaudeUsage` keeps the 5-hour, weekly and per-model (`model_scoped`, e.g. Fable)
windows. Codex starts `codex app-server` with the login's `CODEX_HOME` and profile arguments,
sends `initialize` and one `account/rateLimits/read`, then closes stdin; `normalizeCodexUsage`
names windows by length and scopes non-default buckets. Claude sessions at work never read plan
usage (see Native context telemetry). `readUsage()` answers null when the plan shares no limits and
throws when they could not be read; each engine reuses a reading under a minute old and shares an
in-flight read; a Recheck clears it. The composer asks when its ring panel opens or the ring is
hovered, and every minute while open; until the first answer it draws each plan this setup uses
at full size with shimmering bars, and a plan being read with no numbers yet does the same. A
failed read shows one orange line with Try again, a signed-out plan Sign in again. The panel leaves the
`model_scoped` windows out (`shownLimits`; `SHOW_MODEL_LIMITS` in `usage-words.ts` brings them back). Its
last row opens Settings → Model Providers. Genex is read after the plans: a Pro member's monthly
credits, one window under the plan's name from `GET /api/plans/me` (its allowance and renewal) and
the balance from `GET /api/credits/me`; without Pro there is no month to show and the panel leaves
Genex out (`shownPlans`), as it does a signed-out Genex, whose sign-in is the chat notice's. A reset
more than a week off is said by its date. Fixture engines report fixed limits.
`promptbar-redesign.test.ts` covers both normalizers; account access is proven only against a
real login.

## Bonsai installation lifecycle

Installation has a durable host-owned job: preflight, download, verification, extraction,
installed, starting, ready, cancelled, failed or interrupted. Opening setup hydrates this job;
closing the panel does not cancel it. Preflight considers remaining bytes, extraction and disk
reserve. Pinned hashes are verified before use; a dropped or stalled transfer reconnects from the
saved bytes, and only a lasting outage fails, with retained resume data ([downloads](local-models.md)).
Ready requires actual native startup/health, not just a successful file download; the checked
server is then stopped until a request needs it ([process lifecycle](local-models.md)). Native startup
is single-flight, cancellation-aware, and does not load duplicate copies for parallel requests.

The configured working capacity remains 102,400 tokens on Macs with at least 32 GiB RAM and
16,384 on smaller supported Macs. The model's advertised maximum is a separate number. No new
run duration or paid fallback defaults are introduced by these controls.

## Verification boundaries

Use automated checks for malicious paths, races and error cases, and actual UI/provider checks
for connection, model use and rendered results. Record source/build/profile/provider identities.
The focused implementation has separate acceptance records for real Genex connection, same-chat
Sol MCP/plugin calls, native Codex compaction, and local Blender generation plus independent
export. Those checks do not establish all OAuth providers, all local models or final packaging.

### OAuth browser handoff status

While browser consent is pending, the connector reports connecting and the account reports
authorizing. The initial HTTP authorization challenge is not shown as a persistent failure.
Connection actions use the live host status, so successful browser completion replaces the
pending state without leaving an old Unauthorized message or requiring a new chat. Explicit
Test results remain separate diagnostics.

### Genex: sign in, then generate

The bundled Genex plugin is enabled by default and contributes a **Genex** button beside
Live/Assets. Sign in once; connected accounts can generate assets in the current game and
subsequent games without a separate paid-tools switch, spending confirmation or project allowance.
The sign-in flow states that generated assets use Genex credits. Required service terms still
belong to Genex's authorization flow. Disable/remove the plugin or disconnect to stop access.
Legacy paid-tools settings and saved local allowance files are not deleted, but no longer gate
Studio's asset tools. The existing API credit balance, quotes and service admission remain
binding; Studio does not buy credits or enable automatic top-ups. A generation's wait for unaccepted
terms comes out of its CLI's own time, so the CLI stops (and its answer is recorded) inside the
host's 190 s ceiling for the call; with under 30 s left after the wait nothing is submitted.

Studio sets the pinned CLI's documented `GENEX_ASSET_BUDGET_CAP=0` in its host-owned launch
environment. This disables only the extra CLI project allowance. Source inspection and pinned-CLI
fixtures retain quote validation, admission locking, reservations, generation ledger, server
credit refusal and ambiguous-request recovery. Agents cannot change launch policy, credentials,
account settings or approval flags. Character selection/remesh and publishing approvals remain.

Chat setup opens the declared toolbar panel directly, with a settings-page fallback for plugins
without one. The toolbar only shows **Connect** when no credential is unlocked; it does not show
an Enable button or claim every lane is usable. The panel fills its dialog height, shows account,
credits, relevant errors and jobs, and keeps disconnect under Account options. It polls every
five seconds while authorizing/working and every sixty seconds while idle or errored. Successful
identity checks are cached for two minutes per credential; credits refresh every status call and
401 still marks the connection unavailable. Disconnect clears the cached identity.

### Fresh-install planning and account updates

Genex 1.3.2 removes redundant Connect/Unlock dialogs. Account actions remain UI-only;
concurrent Connect requests share one operation. Panel notifications refresh account status
without reopening the chat. A saved credential is distinct from a validated remote account.
`GenexStatus.unlimited` preserves the server entitlement; numeric balances do not override it.

Review-plan completions receive current public plugin declarations and guidance, account states,
project-scoped cached MCP tool names and Studio-template dependency facts. They remain tool-free
and record `planning_capabilities_applied` separately from execution tool delivery. Planning never
starts an idle MCP connection or grants authority from an older approved plan.

### Bundled main Genex MCP

Genex 1.4.0 includes `genex-creator`, using the plugin’s existing credential lease. It becomes
available on the next builder response after Connect/unlock, including in an existing chat, and
is withdrawn on disable/disconnect/removal. No Blender endpoint is required. Its four read-only
creator tools complement `genex__asset` and `genex__publish`; those host tools continue to own
generation, local delivery, accurate credits and publishing consent. The standard plugin Update
flow installs this added server with launch-change review and preserves the saved account.

### Genex skills, CLI and packages

Genex 1.5.0 reaches existing installations through the standard Update flow, which installs a
bundled plugin's newer version without a trust dialog. Builder briefs index Genex's guide and its
platform cards (multiplayer, player identity, LLM in games, monetization, publishing, cover, updates);
agents read a card with `genex__skill` before that work, and the host serves it from the plugin,
never from or into the game folder.

With an unlocked account, agents also reach Studio's pinned Genex CLI: `genex__cli` for free
commands (doctor, budget, LLM models, job status and cancel, shop list, a store item's draft) and, after a consent card,
`genex__cli-paid` for commands that spend or change what the game sells. Studio runs every command
in a throwaway folder of its own, never the game, with only the Genex API reachable (and Genex's
object storage while a store item's picture, model or package moves); setup,
sign-in, publishing and generation commands are refused and point to the matching Genex tool.
`genex__package` adds `@genex-ai/multiplayer` or `@genex-ai/embed-sdk` at Studio's pin to a
build game after consent, opening the npm registry for that one install. A Studio-template game
gets player identity by mapping Studio's copy in its import map instead, and Studio then calls
`initEmbed()` for it; multiplayer cannot be added there yet. Studio connects every web game it
publishes that brings no SDK of its own, so genex.games can sign its players in. Multiplayer is tested only on the published draft: build,
add the package, publish a draft with `genex__publish`, then play the draft link. Studio's
preview stays single-player. Fixture profiles refuse the CLI and package tools.

### The game's Genex cover

The game's Genex cover is the 16:9 picture genex.games shows on its gallery card, its page and
every shared link, unrelated to Studio's own sidebar cover; a clip of play can run over it on the
cards. Once a run lands its build in a game while Genex is on, Studio asks the chat's agent for
it as a step of its own, in a hidden message sent with the person's engine and model but not their
Loop (`core/cover-step.ts`). The ask names only the goal: make the game's Genex cover, change nothing
else, say so in one line. How is the plugin's own, in `genex__cover`'s description and its `cover`
skill: the agent makes a picture of the real game by any means, saves it in the game folder and
hands its path to `genex__cover {"image": …, "clip"?: …}` (a PNG or JPEG of at least 1280×720 within
8 MB; a WebM or MP4 of at least 5.3 s, since Genex keeps five seconds after trimming up to 300 ms). The plugin
reads each by its bytes, through no link out of the folder, measures the picture's light as Genex's
gate does, copies both into its own storage and answers what it kept, the last send and the cover
Genex holds with who chose it; a refused file keeps nothing. A publish, and a draft until the game is
first public, sends the kept picture once the upload is recorded, through the pinned CLI's `genex
cover --json` in Studio's publish copy, with the kept clip behind it, and takes no picture of its
own; `genex__cover-set` sends the picture alone now after a consent card. Bytes Genex already
answered for, and a cover the owner picked on genex.games, are never uploaded again; the owner's pick
is recorded (`kept_owner`) whenever Genex reports it; a refused, rate-limited, failed or silent send
leaves the publish done with a warning in `genex__publish-status`. Until the agent hands a picture,
Studio keeps a plain frame of the game as it loads (`cover-auto`, once the turns on the open game
settle and as the Publish dialog opens), never over the agent's picture, the person's pick or the
owner's cover. The dialog's banner flips between the last four pictures (`cover-pick` pins one) and
its Another cover sends a request to the game's chat ([plugins](plugins.md#first-party-privileges)).
How to compose a cover is optional advice in the `genex-recommendations` plugin, which works under
the hood of Genex: on while Genex is, and listed nowhere.

## Credentials

Account-connected checks need authorization; a request for real manual testing or “no mocks”
already authorizes launching an owned live profile. Preserve that authorization across turns.
It does not authorize credential inspection, reset, migration or unrelated paid operations. Disposable fixture Electron runs use the
shared `fixtureElectronArgs`/`fixtureElectronEnv`: macOS mock cookie encryption, disabled Studio
OS credentials, cleared API-token variables, and disabled live-provider opt-ins. Main configures
empty CLI discovery for these sessions. This permits fixture UI/runtime checks without substituting
for account-holder-authorized live checks. Never apply mock encryption to a normal account profile. Temporary HOME/userData does not isolate
macOS Keychain. `run-clean-provider-profiles.mjs` now refuses by default; its live-account opt-in
must only be set after explicit permission, not inferred from a request to continue work.
`session-credentials.test.ts` uses synthetic storage and a loopback device API to cover lazy unlock,
concurrent reads, cancelled unlock, disconnect races, failed saves and no automatic polling retry.
These are Node-only tests. Smoke/self-test and fixture development sessions now configure coding
CLI discovery with an empty PATH and no standard installation directories. Their provider controls
cannot probe the user's CLI versions/help automatically. The synthetic external-CLI matrix still
runs and asserts missing/one/both installations, status and structured execution. Real discovery
remains available for the separately authorized `STUDIO_ALLOW_LIVE_CREDENTIAL_CHECKS=1` gate.
This does not isolate Electron's own network-service credential storage. `STUDIO_DISABLE_OS_CREDENTIALS=1` blocks the Studio SecretStore backend;
it is not a guarantee about native provider processes or Chromium internals. No keychain reset,
repair, deletion or account migration is part of verification. The explicit unlock UI still requires its own interaction assertion; startup/build UI success alone does not prove it.

## External coding CLI acceptance (supersedes bundled-provider acceptance)

Package inspection checks both ASAR and unpacked resources for Codex/Claude native packages.
The packaged smoke matrix uses isolated discovery roots for neither/one/both providers and scripted
status/structured execution. Live subscription execution is separate: explicitly select GPT-5.6-Sol,
never Astra. A fixture or successful version probe is not live Claude SDK compatibility evidence.
The version-guarded `scripts/patch-sandbox-runtime.mjs` fixes SRT 0.0.81 at install/build time.
Absolute-path lookup checks filesystem executability without a one-second `which` subprocess.
SRT 0.0.81 runs Windows `initialize()` (its one `acl grant --persistent` and the egress check)
off the event loop itself; the patch moves the session release (`acl revoke`, `acl restore`) there
too, which `spawnSync` ran on Electron's main thread and froze the window ("Not Responding");
`sandbox-windows-start.test.ts` fails on Windows CI when the start holds the event loop.
The grant and the egress check report their times (`setStudioStepLog`); with the session's own
steps and the core's boot marks they land in `studio.log`, so a slow start names its slow step. The core's Windows
sandbox starts in the background (`startInBackground`): `create` refuses only what Set up fixes,
the window opens on the games, and every launch waits for the rest or retries a failed start.
The patch changes neither sandbox policy nor command execution. Re-review on dependency changes.

External provider clean-profile acceptance: after rebuilding the package, run
`STUDIO_ACCEPT_CODEX=/absolute/external/codex STUDIO_ACCEPT_CLAUDE=/absolute/external/claude node tests/e2e/run-clean-provider-profiles.mjs`.
This uses fresh HOME/app profiles with no providers, only Codex, then both, linking actual
external installations without installing or authenticating them. The system keychain is shared;
this is not a separate macOS account or a fresh dependency install.

Pinned-runtime basis for fixture isolation: Electron 43.4.1 creates a macOS
`KeychainKeyProvider` in [browser_process_impl.cc](https://github.com/electron/electron/blob/v43.4.1/shell/browser/browser_process_impl.cc).
Its pinned Chromium 150.0.7871.224
[keychain_key_provider.mm](https://chromium.googlesource.com/chromium/src/+/refs/tags/150.0.7871.224/components/os_crypt/async/browser/keychain_key_provider.mm)
selects `FakeKeychainV2` when `--use-mock-keychain` is present. This is the cookie-encryption
path; Studio's own SecretStore is separately disabled, and fixture coding discovery excludes real CLIs.
The independently maintained live clean-profile runner remains opt-in and does not claim isolation.

## MCP connector acceptance

Run `tests/conformance/mcp-client.test.ts`, `mcp-plumbing.test.ts`, `tool-schema.test.ts`,
`mcp-import.test.ts`, `engine-delegated.test.ts`, `engine-codex.test.ts`, `dev-policy.test.ts` and
`words.test.ts`. **Every one of them talks to the fixture stdio server in `tests/fixtures/mcp/` and
nothing else** — no real MCP server, no hosted endpoint, no live account, no network. `echo-server.mjs`
is a real `@modelcontextprotocol/sdk` server (an `echo` tool with array, integer and enum arguments,
`picture` returning an image part, `fail` returning `isError`, a cancellable `sleep`, the awkward
`weird.name/x`, and the `--hang`, `--env`, `--fd3` and `--long` flags); `plugin-server.mjs` stands in
for a server a plugin ships. Both report a secret they received as a SHA-256 fingerprint
(`env_digest`, `fd3_digest`, `fd3Digest`), since a server that repeats a secret gets it redacted.
Anything that reaches a real endpoint in verification is a defect, not a flake.

`mcp-client.test.ts` covers the connection and the registry: connect, paginated `listTools`,
`callTool`, image parts mapped into `LiveToolResult.images`, `isError` raised as a failure, an
`AbortSignal` cancelling promptly, `--hang` timing out into health `failed`, namespaced
`<id>__<tool>` names with the raw name still used on the wire, `exposedToolName` sanitisation and
`_2` de-duplication, allow/deny policy filtering both `toolsFor` and `tool`, a lease deferring a save
until release, the 0o600 file, secrets never appearing in `connectors.json` yet reaching the child's
environment, a stdio connector with no or a mismatched `trustedLaunch` never launching, scope
hiding a connector from another project, one shared connection unless the launch is per project,
the injectable idle close, suffix de-duplication within the 48-character limit, result and error
redaction, erasing a dropped secret, and `resolveExecutable`. `mcp-oauth.test.ts` covers RFC 7009
revocation on disconnect and remove. `tool-schema.test.ts` pins `zodShapeFromJsonSchema`,
`flatParameters` and `exposedToolName`; `mcp-import.test.ts` pins the pure snippet parser (Claude
JSON, the Codex TOML subset, `bearer_token_env_var` as a warning, `${VAR}` placeholders kept as names
that need a value, malformed input warning rather than throwing, and no node imports —
`verify:architecture` enforces the last one).

`mcp-plumbing.test.ts` is the end-to-end proof on the rig: a saved fixture connector's tools arrive
in the `claude-code` and `codex` delegations with their `inputSchema` intact and route back through
`onLiveTool`; a read-only and a candidate session get none, the chat's session gets them (and a
build's lead, whose `readOnly` only marks its seat: `lead-sessions-host.test.ts`); the local harness's
`createToolRegistry()` carries the full schema and executes through `mcp.invoke`; a disabled
connector's tool is rejected; a `connector_tool` event lands in the thread log; and `core.api()`
exposes no connector mutation method. `engine-delegated.test.ts` keeps its pinned literals and adds
the nested-schema case (`allowedTools` includes `mcp__studio__srv__echo`, `Object.keys(mcpServers)`
is still `['studio']`, `strictMcpConfig` stays true); `engine-codex.test.ts` covers `tools.json`
carrying `inputSchema`, the shim's `--json @<file>` run and the unchanged critic argv;
`dev-policy.test.ts` asserts `studio:mcp.trust` is blocked in fixture profiles.

`genex-creator-mcp.test.ts` exercises the actual main Genex bridge against an injected HTTP peer:
shared bearer transport, tool filtering, direct-call rejection, redirect refusal and credential
redaction. Headless rigs substitute `genex-creator.mjs` and never contact Genex.
`mcp-plumbing.test.ts` covers same-chat unlock, all three builder providers, disable/re-enable
and disconnect of the bundled main connector. Live acceptance separately lists remote tools and
calls read-only discovery; it does not authorize paid generation.

Plugin-declared servers are covered where the manifest is: `plugins.test.ts` pins the `mcpServers`
grammar (API 2 and 3, at most four, ids without `_`, `host-cli` reserved for the bundled Genex
plugin, a `node` server's script contained in the package, `storage` / `storage:project` working
directories, env sources that must name a declared setting or the `credentials` capability, and a
changed `mcpServers` section treated as a permission expansion), and the registry cases prove
publication on enable, withdrawal on disable, update, remove and cancel, and the credential reaching
the child only after `unlock`.

`@modelcontextprotocol/sdk` is an exact dependency and stays in `scripts/build.mjs`'s esbuild
`external` list, so its subpath imports resolve from `node_modules` as the agent SDK's do; a
change to either makes `build-package` stale. After `npm run package`, run
`node tests/e2e/run-build-smoke.mjs --packaged` and confirm the packaged app really resolves those
subpath imports from the asar — a connector that only fails in the bundle is the failure mode this
gate exists for — and that the MCP section check passes there too. That check lives in the
`--studio-build-smoke` block: with the Plugins page open, `[data-testid="mcp-connectors"]` must be
present and read `MCP servers` plus either `No MCP servers configured` or a `from genex` row,
because the bundled Genex plugin declares a server and so a fixture profile is not necessarily
empty. Inspect the section and its expanded details visually as well: the semantic
assertions do not prove the health badge, the secret fields or the tool list are readable.

**Live connector gates need the owner's explicit permission** (the credential-access
restriction at the top of this file applies unchanged): a real Claude Code, Codex and Ollama delegation against a saved
connector, and anything involving a real Genex Blender endpoint — `genex blender serve` locally or
the hosted lane — which costs credits. None of them is ever inferred from "continue".

## Focused MCP, connection, context and native-plugin acceptance

Current behavior: [connections and context](connections-and-context.md). On Node 24 run
`context-management`, `codex-session`, `mcp-client`, `mcp-oauth`, `mcp-import`, `mcp-plumbing`,
`plugin-native`, `blender`, `bonsai`, `workspace-content`, `genex-plumbing` and neighboring engine
conformance tests as applicable. Broad changes across these contracts warrant `npm run verify`;
a bounded correction follows the scope table. Source assertions and simulated providers do not
substitute for the following separately authorized live steps when those behaviors need live acceptance.

Use an owned live profile and record its exact source/build/runtime identities. In an existing
chat connect Genex through its trusted review/browser flow with paid tools disabled; observe
host completion without reopening the chat. Connect a read-only public MCP, call it through
Sol, and inspect the attributed host event. Disable an in-flight source and verify new dispatch
is refused without claiming the accepted remote operation was undone. Test project scoping
with roots off and confirm another project's idle transport is not shown as connected.

Exercise Compact now on Claude Code and Codex through the UI and correlate the precise provider
session metadata/boundary with its meter; the next turn must resume the same session. Restore
temporary local thresholds. Download/verify Bonsai through
Model setup, close/reopen progress, then select it in the same chat. Make a real game edit, use
the input in the actual preview, Stop/resume, and put its context under a controlled threshold.
Record model inference separately from UI scaffolding and mark unsupported/live-unavailable
telemetry honestly. Reuse pinned download bytes when appropriate, labelling that as verification
and startup rather than a fresh network download. Never select Astra.

Include a large last tool result after earlier rounds: checkpoint recovery must eventually
summarize that whole round, retain its source archive and avoid repeating the tool. Inspect
connection status during a delegated response even without an outer turn lease; another chat
must remain idle. Backend health and account unlock are separate, and a status read must not
open protected credential storage.

With Genex disabled, use Local Blender through the public SDK to produce a file, have the coding
agent integrate that exact file, inspect it in Studio, export, and load it independently. Inspect
the package for API 3 plugin/SDK resources and absence of coding CLI executables. Repeat relevant
packaged UI actions using the existing asset; no new paid asset is necessary. A passed developer
build is not packaged acceptance. Preserve the normal profile and harness edits.

Smoke windows allow dimensions larger than the active macOS display so the requested 900px
viewport is actually exercised; normal windows keep their platform behavior. The exact viewport
assertions remain required. Milestone waits race the run's terminal result so a
pre-worker failure (including `spawn git EAGAIN`) fails with its recorded reason instead of
hanging indefinitely. A later isolated pass does not erase the original infrastructure failure.

OAuth connection acceptance must inspect both the pending browser state and the connected
state. The MCP client regression drives the real SDK against fixture discovery/registration
responses and checks that the initial HTTP challenge is not a persistent failure. This does
not replace a real account test: record same-chat authenticated tool use separately, with no
tokens, consent codes or account balances in public evidence.

### Context popover and native Live regression

Build smoke checks the Context panel beside a live game, preserves native bounds for
non-overlapping context/model panels, moves the real mounted panel over/off Live to verify
occlusion/restoration without closing, and exercises Escape. Developer readiness captures the
game with the chat model picker open. Actual packaged UI must show the game and context panel
together; a passing hide-and-restore assertion alone does not prove that interaction is usable.

### Reliability acceptance

`asset-reliability.test.ts` checks retained originals above 4 MiB, renamed provenance,
structured/legacy arguments, real Git checkpoint isolation and stale deployment rejection.
`genex-plugin-cli.test.ts` exercises the pinned CLI through a synthetic hosted API, including
exact uploaded marker verification; it is not live Genex acceptance. Existing Blender/native
security and Stop assertions remain required. `game-export.test.ts` covers local module and
runtime decoder retention. Verify real original/derivative models and audio in Chromium and
an external export, then one authorized unlisted hosted draft and a changed-marker update.
Record unexecuted gates explicitly. Never regenerate an existing asset to make a test pass.

Implementation evidence: real Blender 4.5.4 imported a retained 5.9 MB generated model through
the public native transform recipe, exported a derivative and two renders, preserving the
original SHA-256. This proves staged import/export, not in-game use or hosted readiness. Retain the actual observation in local evidence and summarize its limits in the PR.

Reliability acceptance also guards the person's candidate window while agents hold the whole
preview pool, a second Play refused without Live navigation when that window and the pool are
both taken, and candidate load failure without Live navigation (`preview-candidate.test.ts`),
renamed native derivative provenance, and
macOS canonical workspace aliases at the asset-checkpoint boundary. Build smoke currently
covers the default expanded history and compact header/details layout. Real retained-asset
acceptance reports live under `.studio-dev/evidence/<task>/`, with selected evidence shared in the PR.

### Asset preview acceptance

Run `npm test -- tests/conformance/asset-preview.test.ts tests/conformance/game-assets.test.ts` for format routing and contained reads. Real Electron Build smoke can additionally consume an explicitly prepared local directory with `node tests/e2e/run-build-smoke.mjs --studio-assets-smoke-dir=/absolute/test-directory` (also `--packaged`). This copies files into the isolated smoke project; it never modifies the originals or generates paid assets. The optional matrix exercises animated GLB/glTF/FBX, OBJ/STL/PLY, HDR/EXR/KTX2 (including Basis), Draco, optional retained GLB/MP3, WAV/video/GIF/text and corrupt-file errors. The checked-in `tests/fixtures/asset-previews` directory is a reusable input; the optional retained files are not included. Inspect captured pixels and animation/media time; opening a dialog alone is insufficient. Close/reopen must stop media and release the viewer.
