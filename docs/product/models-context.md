# Models and context

## Selecting a model

The model button opens Main agent, Workers and Reviewers by provider; Add more models opens
setup. Blocked plans keep the request, offering settings or retry.

Claude Code and Codex discover models without generating. The list names each family's newest
model of the newest generation; older ones switch on in Settings; one in use stays listed.
An unset pick runs the CLI's named default, else a default row. Aliases follow the CLI;
versions stay pinned.

Settings shows CLI versions; Account rechecks or updates them; failed refreshes offer Try again.
Tabs switch [accounts](../connections-and-context.md#several-accounts-per-subscription).
Unavailable picks block sends; without models, Connect AI model replaces the pill. A
listing proves no access.

Each chat keeps its model and effort; fresh games inherit the last picks. One effort, on the
main agent's levels, serves every role (Workers and Reviewers at most high).
The Workers pick runs the chat's workers too; Reviewers
run only in a Loop. Both survive a main-agent change; dropped models fall back. Each Ollama job takes its own model; Reviewers must see images and
check a Loop's finish.

Local Models (Bonsai/Ollama) downloads and deletes. Metered
[OpenRouter, OpenCode](../connections-and-context.md#openrouter-and-opencode), [Opper](../connections-and-context.md#opper),
[Grok Build](../connections-and-context.md#grok-build), [Cursor](../connections-and-context.md#cursor) and
[Genex](../connections-and-context.md#build-with-genex-credits) are never auto-chosen unless Free and alone; OpenRouter, OpenCode and Cursor show three. Local server connects LM
Studio, llama.cpp or TabbyAPI ([details](../connections-and-context.md#your-own-model-server)).

## What the model knows

The context ring shows reported orchestrator usage and capacity; unknown stays unknown. Its panel
offers Compact now (or `/compact`; Claude Code, Codex and Grok use
[their own](../connections-and-context.md#compact-now), others hand over); every provider, workers
included, compacts automatically. Then plan limits
([details](../connections-and-context.md#plan-limits)).

Ollama's context is a loaded model's report, else an estimate that refuses nothing; refusals
offer a 16K copy. Tools and images need reported capability; unsupported requests fail
before inference.

Game files, instructions, reference images and enabled tools contribute through channels
([tool setup](assets-plugins.md)). Credentials stay in protected storage, never in messages
or logs.

## Permissions

Every chat's permissions pill picks **Auto** (Recommended; stops dangerous actions),
**Manual**, **Accept edits**, **Plan** or **Bypass permissions** (confirmed; Rewind
restores only the game); modes an engine cannot honour are greyed
([by engine](../tool-permissions.md#other-engines)). Chats keep their mode; new ones inherit the
last Auto, Manual or Accept edits. Chats and leads work anywhere on your Mac with your access,
workers with the lead's tools in your mode but never in sign-ins, Genex's data or other games; a
question waits for your answer ([details](../tool-permissions.md)).

Read denials cover sensitive system/account locations; Codex's are advisory, not whole-disk
isolation.

## Where to work

[ModelsSection](../../src/renderer/panels/ModelsSection.tsx),
[PromptBar](../../src/renderer/ui/PromptBar.tsx), [Local models](../local-models.md),
[continuation](../conversation-lifecycle.md),
[composer design](../agent/design.md#prompt-composer),
[judge evaluation](../judge-evaluation.md).
