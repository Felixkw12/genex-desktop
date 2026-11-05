# Managed local models

Studio offers Bonsai 2 27B on Apple Silicon Macs with at least 16 GiB RAM. PQ2_0 is the
Best fit on those Macs up to 96 GB and the first ready choice in chat; PTQ1_0 is the smaller
alternative. Existing explicit model selections remain selected.

`substrate/models-catalog.json` holds one entry per model: name, size, tools, vision and a
one-line `about` of at most 60 characters. Measurement evidence lives in `notes`, which is never
displayed. Each RAM tier ranks model ids; `recommendModels` shows the ranked models that fit, and
the first is Best fit. From 128 GB, Best fit is Qwen 3.5 122B (vision and tools); 192 GB adds
Qwen 3.8 Flash Next. Every other model the architecture can run is under More models, smallest
first, with "Needs a N GB Mac" when it does not fit. One build per model is shown: MLX on Apple
Silicon, the portable GGUF elsewhere. The fit rule is weights + KV cache (0.5–3 GB) + 1.5 GB
within 72% of unified memory on Apple Silicon (⅔ elsewhere). Recommendations are estimates; the
large-Mac models have not been measured in Studio yet.

An installed model's row offers Delete (a trash button, then Cancel or Delete on the row). A Bonsai
delete removes the receipt first, stops a server loaded with that model, then deletes its weights
and its finished download record; the shared projector, notices and runtime go too once no other
Bonsai model keeps a receipt, weights or partial download. It is refused, removing nothing, while
a download runs or a request holds the server. An Ollama delete only reaches Ollama for a name its
`/api/tags` lists, and a cached default naming the deleted model is chosen again.

Add from Ollama takes an exact model name (`name`, `name:tag`, `namespace/name:tag`). ollama.com
has no search API, so main reads that tag's manifest from `registry.ollama.ai` (strict name validation,
8-second timeout), sums its layers and applies the same fit rule before offering
Download through the normal Ollama pull. Fixture profiles refuse the lookup. Installed Ollama models
outside the catalog are listed as added from Ollama.

Every Ollama download goes through the person's own Ollama at its host; Studio neither installs
nor starts one. A pull that finds nothing answering there fails as `Unavailable` with that host
named, not as the fetch's bare error, and its row then offers Install Ollama beside Download: the
platform's page on ollama.com. The person installs and starts Ollama, then downloads again.
Ollama keeps its models in its own folder; Local Models says to move them in Ollama → Settings →
Model location.

Settings → Local Models downloads Bonsai weights and the Q8 vision projector directly from pinned
Prism ML Hugging Face revisions, plus the pinned Prism llama.cpp macOS arm64 release.
Stock Ollama cannot run these Bonsai 2 packs. Ollama remains independently available.
`substrate/bonsai/manifest.ts` owns exact bytes, SHA-256 digests and source URLs.
A new upstream release is a deliberate manifest update, never a floating download of latest.

Downloads retain partial files for resume, check available space and verify the full SHA-256
before publishing. A dropped, refused or silent (60 s) connection reconnects from the saved bytes
after 2, 5, 15, 30 and 60 seconds; a try that saves bytes restarts that series, so only a
two-minute outage fails the install, saying the downloaded parts are kept. A receipt is written only after the runtime, language model and projector
are present; Ready additionally requires a successful native health check. A durable installation job reports preflight, download, verification, extraction, startup,
ready, error and cancellation; Cancel aborts the current operation. Closing/reopening setup
hydrates the current job. A failed, cancelled or interrupted download shows on its own row in
Local Models with the share saved, its reason and Resume, which continues from retained bytes. Installation
status refreshes on completion and when Local Models opens; older overlapping status replies cannot replace a newer refresh. Progress updates do
not trigger full provider discovery. Existing complete files are verified on reuse. No installer or
Python environment is required. Native runtime libraries remain beside llama-server outside
asar in the app's engine home. The upstream runtime archive includes its license; pinned model LICENSE and NOTICE files are stored alongside the weights.

The process is host-owned, loopback-only and starts on demand. Installation launches it once for
the health check and stops it before reporting Ready; the first request starts it again. A request
holds it from taking the inference queue until it finishes. Five minutes after the last request
lets go (`IDLE_STOP_MS` in `substrate/bonsai/runtime.ts`) it stops, freeing the weights, projector
and KV cache (about 10 GB on a 16 GB Mac); it never stops while a request holds the queue. The next
request reloads it through the same start and prefills its prompt again. A launch waits for a
stopping server to exit, so two copies never hold memory at once. Each app engine uses a random
in-memory API key; the native web UI is disabled. The key never enters the renderer or model tools. Model switching stops the old
process. App shutdown cancels requests and stops the process; a crash is reported as an engine
failure and a later request can restart it. Working context is 102,400 tokens on Macs with at least 32 GiB RAM, and 16,384 tokens
on smaller Macs, with one server slot and bounded batches. Both packs advertise a
262,144-token maximum in their model metadata; the app configures a smaller working
capacity to leave memory for the desktop, vision and game previews. Context includes
instructions, tool schemas, history, images and the reserved reply, not just user text.
The large-context inference ceiling is 25 minutes to permit cold prompt loading on older
Apple Silicon; explicit request deadlines and the enclosing session cancellation still win.
The server prompt-cache RAM budget is disabled to avoid a second unbounded memory pool.
Reasoning defaults low (512 tokens); medium/high/max use 2048/8192/unbounded thinking budgets,
within each request's output and deadline limits. The pinned server reads
[`reasoning_budget_tokens`](https://github.com/PrismML-Eng/llama.cpp/blob/9a9394a/tools/server/server-common.cpp#L1354) in the request body (not `reasoning_budget`); the process default is
unrestricted so the max setting is not silently capped. Completed thinking is accounted in
usage but is not replayed into session history.

## Sessions, workers and roles

Engine `kind` still distinguishes local inference from subscription transport. The descriptor's
`supportsSessions` says whether the engine can run a persisted workspace session. Old fixture
and historical descriptors fall back to delegated kind. Bonsai implements both `complete`
and `delegate`; it is not a subscription and does not use either vendor CLI.
Studio's app-wide assistant uses `complete` without tools; game chats and builds keep their
existing session paths.

The same director, worker, integration, preview and judging code runs for Bonsai sessions.
Model roles accept Bonsai, Claude Code, Codex, OpenCode, OpenRouter, Opper and a local server (a model
server the person runs, [connections](connections-and-context.md#your-own-model-server)) as
orchestrator/worker/judge providers; engine/model pairs remain together. OpenRouter and Opper run these same local sessions under their
own engine ids (`LocalSessions` `engine` option), with each model's catalog context. A single-model pick fills all roles; explicit crosses win.
Existing saved subscription roles keep their version and choices. Session-capable local
models get the Models role flyouts and model-specific effort sliders.

Ollama holds no sessions (`roles: "completion"` in `shared/providers.ts`), yet a game chat on an
Ollama model with tools gets the same three roles (`splitsRoles`): each job takes its own
installed model and the run uses the classic local loop. One rule, `crossesTo` in both copies of
`model-roles.ts`, decides which jobs leave the main agent's engine. An Ollama main agent may hand
its workers and reviewers to a session provider; a session main agent may hand its reviewers to
Ollama, never its workers, because the director hires every worker as a session. Reviewers look
at screenshots, so an Ollama model without vision is listed but disabled in their menu, and a pick
that cannot see leaves reviewing to the first installed model that can (or to itself when none
can). A
build turn on a model that cannot see receives a note instead of the turn's pictures
(`unseen-pictures-prompts.ts`). A send carries its roles as they are: a role whose model is
missing never blocks the chat's message. The chat's own workers take the Workers pick, and a
Loop's workers and reviewers take both.

`engines/local-session.ts` owns local session history under the engine home, separately for
workers, directors and chats; its tools and path confinement live in
`local-session-tools.ts` and the words it gives the model in `local-session-prompts.ts`. A resume validates workspace and model identity.
The system prompt holds only what stays the same across a session's requests; each request's turn
and time budget rides its own message (`localBudgetNote`), so a resumed session keeps the runtime's
cached prefix instead of re-reading its whole history. The harness's own tool loop reads its system
prompt's identity, rules, skills, memory, notes and file list once per turn (`readStanding`), and a
tool's description travels once, with its schema. The identity names no engine; it says the
model runs inside Genex, which folder the game is and what it holds (`appIdentity`,
`loop/project-prompts.ts`); a game with no kind yet adds that `start_web_game` comes first (or
the kind tool of an engine plugin on offer, from `plugins.tools`' `kinds`, or `plugins_find` for an
engine), and a folder of its own files of a kind no rule knows that it is
looked through first. A web game's (`holdsWebGame`: `web-game` at its root, a game with no
kind yet not included) adds `prompts/identity-web.md` (three.js, the preview window), and its rules
add `prompts/operating-rules-web.md` (the preview's controls, `window.__studio`) to
`prompts/operating-rules.md`, which every turn reads.
Interrupted tool calls receive an explicit unknown-result marker and are never replayed
blindly. History is checkpointed atomically between tool actions. Before inference the pinned
runtime applies its own chat template (including system instructions and tool schemas) and
counts tokens; output and image reserves are included. Image expansion remains approximate,
so native context-overflow errors also trigger bounded compaction/retry. Completed tools are
not executed again. Compaction first retains two recent complete rounds, then one; if the
latest tool result still cannot fit, that whole round is summarized too. Its full result stays
in the checkpoint archive, and the latest image observation stays available. Repeating an
unchanged oversized round is not a recovery strategy. Original user requirements and follow-up instructions survive compaction
and resume. If the fixed task and tools still cannot fit, the session reports context overflow
instead of discarding requirements. Old tool results and rounds shrink first; the latest tool
observation and user reference images remain available. This is separate from the visible
chat's own event-log compaction.

Each local completion leases a FIFO inference slot. The lease ends before executing host
tools: a director waiting for a worker or asking a judge cannot deadlock that worker/judge.
An aborted queued request leaves immediately. Separate sessions keep their worktrees and
histories even though generation is serialized. The existing preview capacity rule still
limits the number of active workers/windows.

Local text reads report their selected line range and total lines, including an explicit end-of-file
response for out-of-range offsets. Sessions receive their turn/time budget up front.
Local file tools resolve real paths, respect host read grants and deny lists, restrict writes
to the session workspace. Shell commands use
ProcessSandbox, with workspace and Git metadata write roots, credential deny lists, no
outbound domains, time/output ceilings and cancellation. Read-only
sessions have no file-write or shell tool. A session that goes tool rounds without changing a
file is nudged to go on, or to reply with what it found or needs (`progressCheckNote`). The host remains authoritative for
which computer, capture, Blender, plugin, connector and director tools a role receives.

Tool images are carried as actual image parts after every result in their tool round. A new
observation replaces older tool screenshots to keep the working context bounded; original user
reference images remain available through checkpoints. Capture can also
return granted image paths readable through the image-aware read_file tool. Structured MCP
schemas retain nested objects, arrays and enums. Assets still come from the configured asset
service or Blender; Bonsai orchestrates them, it does not replace the generators. Existing
consent, credential and paid-asset settings still apply. Downloaded files alone do not prove
an asset was integrated or used in the game.

## Verification

`bonsai.test.ts` covers streaming tools/images/usage, queue cancellation, bounded text and safe image reads,
read-only sessions/resume, cross-provider role pairs and verified resumable downloads that
reconnect after a lost connection.
`bonsai-director.test.ts` runs a scripted local director and real local worker sessions through
the core/harness, worktrees, integration and finish. Scripted responses prove plumbing, not
model quality. The focused Settings UI runner covers routing, section switching, download error recovery and
hydration after closing/reopening, using synthetic jobs. The build UI smoke covers both packing rows, failed-download recovery,
installed state, local worker selection under Codex and subscription roles under Bonsai.

`bonsai.test.ts` and `engine-ollama.test.ts` also cover Delete: what goes, what another model
keeps, and refusals that remove nothing.

`model-catalog.test.ts` covers ranking, Best fit per tier, one build per architecture and
"Needs a N GB Mac"; `ollama-registry.test.ts` covers name validation, manifest URLs and size sums
without network.

`mcp-plumbing.test.ts` and `genex-plumbing.test.ts` include the direct Bonsai session provider
in their host schema, asset inspection, event and consent matrices, using fixtures only.

Run `npm run verify`, plus real local completion, image, tool and game-building checks for
both pinned packs. Record actual runtime/model/build/profile identities and any failures in
the task handoff. Subscription-account and paid-asset acceptance remain subject to the
credential restriction in agent/verification.md. Fixture checks cannot certify those services.

The explicit real-model runner is `node tests/e2e/run-bonsai-live.mjs <validation-root>
 bonsai-2:27b-pq2_0` (one shell line; repeat with `bonsai-2:27b-ptq1_0`). The root must
contain a verified managed `runtime/` installation. It launches a fresh fixture profile, builds
a game with the real model, drives Space input, captures pixels and asks the model to inspect
them, then verifies recovery from an intentionally terminated owned native child. Add `--packaged` after the model id to use the Forge app bundle. Reports include
the executable, packaged state, main-bundle digest and temporary profile identity. This opt-in check can take 20 minutes.

## Local builder progress and diagnosis

For a new Bonsai project with no planned facets yet, the base brief names a visible first scene,
the existing entry file and the public installStudio API. It does not ask the builder to study
the instrumentation implementation. Existing imported projects retain their own architecture
and contract-wiring path. Detailed quality work can follow the first captured, working scene.

Writable local sessions offer an exact, unique-block `edit_file` tool for small corrections,
with the same path checks as full-file writes. Ambiguous matches fail
without changing the file.

Unchanged duplicate file-section reads return guidance to use the existing information. Six
and ten inspection-only tool rounds without an observed workspace change produce a progress
intervention; sixteen stop with no_progress. File size/mtime changes from local tools, shell
commands or host tools reset this counter. Orchestration and observation host calls are not
classified as file-inspection loops. This is a bounded guard, not proof of useful edits.

The run outcome displays the final provider failure above the earlier stage evidence. An empty
or failed base still has no accepted preview; a saved worker capture is not an accepted build.

## Context policy and checkpoint integration

The shared context policy controls the model/chat threshold; the local provider owns token
measurement and enforces its actual runtime capacity. See [connections and context](connections-and-context.md) for the user controls and provider differences.
The integration seams are `BonsaiRuntime.contextWindow`, the native preflight in
`BonsaiEngine.complete` (`#preflight`), and the inference retry loop in `LocalSessions`
(`#completeWithCompaction`).

- Distinguish model maximum (262,144), configured working capacity (RAM tier), and remaining
  prompt budget. Provider model descriptors and request budgeting must use the same capacity.
- Measure the final native chat template with system instructions and tool schemas included.
  Reserve output, image embeddings and headroom before sending. Character estimates alone
  caused the historical 16,440-versus-16,384 failure. Image expansion is currently an estimate
  of 2,048 tokens per image; retain native overflow handling until exact multimodal counting exists.
- Preserve original requirements and follow-ups across persisted/resumed sessions. Keep user
  reference images and the latest relevant observation; do not silently discard fixed instructions
  to make a request fit. Report an explicit error if the irreducible request is too large.
- Compact at complete tool-round boundaries. Preserve call/result pairing and a record of
  completed actions. Retry rejected inference only: file writes, asset jobs and host tool calls
  may already have side effects and must never be replayed as part of context recovery.
- Keep each session's history separate. Release the inference queue lease before host tool
  execution so a director waiting on a worker cannot deadlock the worker's inference.
- Size cold-prefill timeouts for the configured context while preserving cancellation and the
  enclosing build deadline. More capacity is not a reason to keep duplicate reads or obsolete images.

Regression coverage lives in `tests/conformance/bonsai.test.ts`: template/schema budgeting,
overflow without side-effect replay, valid tool/image history, resume and inspection loops.
`bonsai-director.test.ts` covers scripted director/worker orchestration. Live long-context
acceptance must additionally record prompt tokens, native configured context, actual answer,
elapsed time and memory on the target hardware; startup alone is insufficient evidence.

For explicit 100K capacity acceptance, run `node tests/e2e/run-bonsai-context.mjs
<validation-root-with-runtime>` on one line. It uses the installed PQ2_0 runtime, a
near-99K prompt with a retrieval marker, bounded inference and resident-memory sampling.
It writes `context-100k-report.json` in the supplied root and stops only its owned runtime.
This synthetic retrieval test validates capacity, not arbitrary long-context task quality.

### Checkpoint output and file scope

The checkpoint response budget includes local reasoning tokens. Studio asks for a concise
checkpoint with separate room for reasoning and the summary, rejects output-limited results,
and retains the last complete checkpoint on failure. Successful checkpoint inference contributes
to the reported session token usage. Full history and completed tool identities remain saved.
The local system guidance explicitly puts user file-edit restrictions above workspace notes;
model narration is still not authoritative evidence of which files changed.
