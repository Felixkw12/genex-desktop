/**
 * The app and the harness each keep a copy of the contracts they share, because the app must not
 * load the agent's editable seed (scripts/check-boundaries.ts) and the seed cannot import from
 * the app. These tests hold the copies together: the same run readings and build names, the same queue
 * states and readings of the same logs, the same role tables and presets, the same skill
 * edits and the same vocabularies. A change to one copy that the other lacks fails here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endsSessions as seedEndsSessions } from "../../src/harness-seed/loop/compaction-log.ts";
import * as seedDelegatedTurn from "../../src/harness-seed/loop/delegated-turn.ts";
import * as seedFolderFacts from "../../src/harness-seed/loop/folder-facts.ts";
import * as seedEngineGame from "../../src/harness-seed/loop/engine-game.ts";
import * as seedGameEngine from "../../src/harness-seed/loop/game-engine.ts";
import {
  OPEN_LEAD_PART as seedOpenLeadPart,
  SAVE_POINT_VERDICT_SOURCE as seedSavePointSource,
} from "../../src/harness-seed/loop/director/open/graph.ts";
import * as seedInbox from "../../src/harness-seed/loop/run-inbox.ts";
import * as seedQueue from "../../src/harness-seed/loop/message-queue.ts";
import * as seedRoles from "../../src/harness-seed/loop/model-roles.ts";
import * as seedEffort from "../../src/harness-seed/loop/effort-cap.ts";
import * as seedOutage from "../../src/harness-seed/loop/outage.ts";
import { TurnFailureCode as seedTurnFailureCode } from "../../src/harness-seed/loop/turn-record.ts";
import * as seedSandboxRefusal from "../../src/harness-seed/loop/workers/sandbox-refusal.ts";
import * as seedOutcomes from "../../src/harness-seed/loop/outcomes.ts";
import {
  PreviewConsoleSource as seedPreviewConsoleSource,
  PreviewGone as seedPreviewGone,
} from "../../src/harness-seed/loop/preview-gone.ts";
import * as seedJudgeProvenance from "../../src/harness-seed/loop/judge-provenance.ts";
import * as seedRunDispatch from "../../src/harness-seed/loop/run-dispatch.ts";
import * as seedRunEvents from "../../src/harness-seed/loop/run-events.ts";
import {
  MessageFrom as seedMessageFrom,
  SteerDelivery as seedSteerDelivery,
} from "../../src/harness-seed/loop/steer-delivery.ts";
import * as seedTime from "../../src/harness-seed/loop/time.ts";
import { DelegationRefusal as seedDelegationRefusal } from "../../src/harness-seed/loop/director/lead-session.ts";
import * as seedWorkers from "../../src/harness-seed/loop/workers/contract.ts";
import * as seedJobs from "../../src/harness-seed/loop/jobs/contract.ts";
import { RESUME_RUN as seedResumeRun } from "../../src/harness-seed/loop/after-loop-run.ts";
import { startAutopilot as seedStartAutopilot } from "../../src/harness-seed/loop/start-autopilot.ts";
import * as seedVerdict from "../../src/harness-seed/loop/verdict.ts";
import { endsChatSessions } from "../../src/shared/chat-rewind.ts";
import * as chatRun from "../../src/shared/chat-run.ts";
import { throughClaudeFolder as seedThroughClaudeFolder } from "../../src/harness-seed/loop/workers/claude-folder.ts";
import { throughClaudeFolder } from "../../src/substrate/paths.ts";
import {
  CUSTOM_EVENT_TYPES,
  CompletionRole,
  CustomEvent,
  LEAD_PART,
  LoopRefusal,
  RunStartRefusal,
  StopCode,
  customPayload,
} from "../../src/shared/custom-events.ts";
import * as duration from "../../src/shared/duration.ts";
import { TargetRuntime } from "../../src/shared/computer-target.ts";
import { ENGINE_ID, engineOf, GameEngine, isEngineGame } from "../../src/shared/game-engine.ts";
import {
  CoreFact,
  type FactRef,
  FactSource,
  FolderHolds,
  factsOfEngine,
  kindPending,
  kindUnknown,
  LoopProfile,
  ProjectStarter,
  pluginFactSource,
  servedAsWebGame,
  servedFacts,
} from "../../src/shared/project-facts.ts";
import { ProjectTool } from "../../src/shared/project-tools.ts";
import { MAX_WORKERS_AT_ONCE } from "../../src/shared/workers.ts";
import * as jobs from "../../src/shared/jobs.ts";
import {
  DelegationRefusal,
  EngineFailureKind,
  MessageFrom,
  StopReason,
  TurnFailureCode,
} from "../../src/shared/engine-requests.ts";
import * as queue from "../../src/shared/message-queue.ts";
import * as roles from "../../src/shared/model-roles.ts";
import { ReasoningEffort } from "../../src/shared/model-preferences.ts";
import { PreviewConsoleSource, PreviewGone } from "../../src/shared/preview-contract.ts";
import { EngineId } from "../../src/shared/providers.ts";
import { ExecutionStatus, JournalPhase, VerdictPass, VerdictRule } from "../../src/shared/run-state.ts";
import { EventKind, type EventEnvelope, MessageUsageSource } from "../../src/shared/event-log.ts";
import * as seedEngineSeat from "../../src/harness-seed/loop/engine-seat.ts";
import { EngineKind, EngineStatusCode } from "../../src/shared/engine-descriptor.ts";
import { savedByLead } from "../../src/renderer/words.ts";

let clock = 0;
const at = () => new Date(Date.UTC(2026, 8, 24, 0, 0, clock++)).toISOString();
const row = (id: number, data: EventEnvelope["data"]): EventEnvelope => ({
  id: String(id).padStart(4, "0"),
  thread_id: "chat",
  session_id: null,
  turn_id: null,
  created_at: at(),
  data,
});
const user = (id: number, content: string) => row(id, { type: "messages", messages: [{ role: "user", content }] });
const said = (id: number, content: string) => row(id, { type: "messages", messages: [{ role: "assistant", content }] });
const custom = (id: number, event_type: string, payload: Record<string, unknown> = {}) =>
  row(id, { type: "custom", event_type, payload });

/** Logs that walk every queue record and every run lifecycle record the two readers know. */
const LOGS: Record<string, EventEnvelope[]> = {
  empty: [],
  "a queued, edited, answered message": [
    user(1, "add a boss"),
    custom(2, "coordinator_message_queued", { messageId: "a", action: { type: "user_message", text: "add a boss" } }),
    custom(3, "coordinator_message_updated", { messageId: "a", text: "add two bosses" }),
    custom(4, "coordinator_message_processing", { messageId: "a" }),
    said(5, "On it."),
    custom(6, "coordinator_message_handled", { messageId: "a" }),
  ],
  "a paused queue with a removed and a waiting message": [
    user(1, "first"),
    custom(2, "coordinator_message_queued", { messageId: "a", action: { text: "first" } }),
    custom(3, "coordinator_queue_paused"),
    user(4, "second"),
    custom(5, "coordinator_message_queued", { messageId: "b", eventId: "0004", action: { text: "second" } }),
    custom(6, "coordinator_message_removed", { messageId: "a" }),
    user(7, "third"),
    custom(8, "coordinator_message_queued", { messageId: "c", action: { text: "third" } }),
  ],
  "an answer cut off twice by restarts": [
    user(1, "make it red"),
    custom(2, "coordinator_message_queued", { messageId: "red", action: { text: "make it red" } }),
    custom(3, "coordinator_message_processing", { messageId: "red" }),
    custom(4, "coordinator_message_requeued", { messageId: "red", attempts: 1 }),
    custom(5, "coordinator_message_processing", { messageId: "red", attempt: 2 }),
    custom(6, "coordinator_queue_resumed"),
  ],
  "a message steered into a running turn and read there, and one it did not read": [
    user(1, "build a pond"),
    custom(2, "coordinator_message_queued", { messageId: "a", action: { text: "build a pond" } }),
    custom(3, "coordinator_message_processing", { messageId: "a" }),
    user(4, "and ducks"),
    custom(5, "coordinator_message_queued", { messageId: "b", action: { text: "and ducks" } }),
    custom(6, "coordinator_message_steering", { messageId: "b", into: "a" }),
    custom(7, "coordinator_message_delivered", { messageId: "b", into: "a", how: "native" }),
    user(8, "make it run"),
    custom(9, "coordinator_message_queued", { messageId: "c", action: { text: "make it run" } }),
    custom(10, "coordinator_message_steering", { messageId: "c", into: "a" }),
    custom(11, "coordinator_message_requeued", { messageId: "c" }),
    user(12, "and rain"),
    custom(13, "coordinator_message_queued", { messageId: "d", action: { text: "and rain" } }),
    custom(14, "coordinator_message_steering", { messageId: "d" }),
  ],
  "a run started, paused, resumed and finished, then a second run": [
    custom(1, "run_registered", { runId: "r1", project: "space", goal: "a shooter" }),
    custom(2, "run_started", { runId: "r1", engine: "codex" }),
    custom(3, "facet_iteration", { runId: "r1", facetId: "enemies", winner: "challenger" }),
    custom(4, "autopilot_paused", { runId: "r1" }),
    custom(5, "autopilot_resumed", { runId: "r1" }),
    custom(6, "run_steering", { runId: "r1", text: "more stars" }),
    custom(7, "run_finished", { runId: "r1", paused: true, integrationHead: "abc1234" }),
    custom(8, "run_started", { runId: "r2", project: "space", goal: "add a boss" }),
    custom(9, "director_worker", { runId: "r2", workerId: "w1", state: "running" }),
  ],
  "a close with no run before it": [custom(1, "run_finished", { runId: "lost" }), custom(2, "autopilot_paused", {})],
  "a lead woken between its workers' news": [
    custom(1, "run_started", { runId: "r1", project: "space", goal: "add stars" }),
    custom(2, "director_worker", { runId: "r1", workerId: "w1", state: "running" }),
    custom(3, "director_continued", { runId: "r1", minutesLeft: 40, reasons: ["worker_round"] }),
    custom(4, "director_progress", { runId: "r1", text: "the sky is in" }),
    custom(5, "director_continued", { runId: "r1", minutesLeft: 20, reasons: ["heartbeat"] }),
  ],
  "a lead that took the chat's words and heard them": [
    custom(1, "run_started", { runId: "r1", project: "space", goal: "add stars" }),
    custom(2, "director_worker", { runId: "r1", workerId: "w1", state: "running" }),
    custom(3, "run_steering", { runId: "r1", text: "more stars", sourceMessageId: "red", how: "lead" }),
    custom(4, "run_steering_delivered", { runId: "r1", messageId: "3", facetId: "build", stage: "next brief" }),
    custom(5, "run_steering_delivered", { runId: "r1", sourceMessageId: "red", how: "lead" }),
  ],
};

describe("the chat's run (shared/chat-run.ts ↔ loop/run-inbox.ts)", () => {
  it("the chat's own session after a run keeps the host's own tools: live run controls, and the resume it records", () => {
    for (const tool of chatRun.runControlTools) assert.equal(chatRun.isHostRunTool(tool.name), true);
    assert.deepEqual(
      chatRun.runControlTools.map((tool) => tool.name),
      Object.values(chatRun.RunControl),
    );
    // The resume is the host's to answer too, never a live control: its reply ends first.
    assert.equal(chatRun.isHostRunTool(seedResumeRun), true);
    assert.equal(chatRun.isRunControl(seedResumeRun), false);
    assert.equal(chatRun.isHostRunTool("delete_game"), false);
  });

  it("names the builds a chat's own session records to start as the seed's tools do, which Plan holds", () => {
    assert.deepEqual(Object.values(chatRun.BuildLaunch), [seedStartAutopilot.name, seedResumeRun]);
    assert.equal(chatRun.isBuildLaunch("ask_user"), false, "a question is no launch");
  });

  for (const [name, events] of Object.entries(LOGS)) {
    it(`reads the run and the conversation of the same log the same way: ${name}`, () => {
      assert.deepEqual(chatRun.latestRun(events), seedInbox.latestRun(events as never));
      for (const runId of ["r1", "r2", "lost", "none"]) {
        assert.deepEqual(chatRun.latestRun(events, runId), seedInbox.latestRun(events as never, runId), runId);
      }
      assert.deepEqual(chatRun.conversationThrough(events), seedInbox.conversationThrough(events as never));
      for (const messageId of ["a", "b", "c", "red"])
        assert.deepEqual(
          chatRun.conversationThrough(events, messageId),
          seedInbox.conversationThrough(events as never, messageId),
          messageId,
        );
    });
  }
});

describe("a compaction's end of the chat's sessions (shared/chat-rewind.ts ↔ loop/compaction-log.ts)", () => {
  const records: Array<[name: string, data: Record<string, unknown>, ends: boolean]> = [
    ["a handover", { type: "custom", event_type: "compacted", payload: { summary: "s", sessionId: "a" } }, true],
    ["a log summary", { type: "custom", event_type: "compacted", payload: { summary: "s", upTo: "1" } }, true],
    [
      "the provider's own",
      { type: "custom", event_type: "compacted", payload: { native: true, sessionId: "a" } },
      false,
    ],
    ["another record", { type: "custom", event_type: "contractor_session", payload: { sessionId: "a" } }, false],
    ["a message", { type: "messages", messages: [] }, false],
  ];
  for (const [name, data, ends] of records) {
    it(`reads whether it ends them the same way: ${name}`, () => {
      assert.equal(endsChatSessions(data as never), ends);
      assert.equal(seedEndsSessions(data), ends);
    });
  }
});

describe("the run inbox's wrap-up (shared/chat-run.ts ↔ loop/run-inbox.ts)", () => {
  it("names the wrap-up the same way, in its persisted spelling", () => {
    assert.deepEqual(chatRun.RunControlAction, { Finish: "finish" });
    assert.deepEqual(seedInbox.RunControlAction, chatRun.RunControlAction);
  });

  const finish = (id: number, runId = "r") => custom(id, "run_control", { runId, action: "finish" });
  const registered = (id: number, fields: Record<string, unknown> = {}) =>
    custom(id, "run_registered", { runId: "r", ...fields });
  const rows: Array<{ label: string; events: EventEnvelope[]; expected: boolean }> = [
    { label: "a finish, then the run resumed", events: [finish(1), registered(2, { resumed: true })], expected: false },
    { label: "the run resumed, then a finish", events: [registered(1, { resumed: true }), finish(2)], expected: true },
    { label: "an old log with no registration, then a finish", events: [finish(1)], expected: true },
    { label: "a finish for another run", events: [registered(1), finish(2, "other")], expected: false },
  ];
  for (const { label, events, expected } of rows) {
    it(`reads whether this session was asked to wrap up the same way: ${label}`, () => {
      assert.equal(seedInbox.finishRequested(events as never, "r"), expected, "harness");
      assert.equal(chatRun.finishRequested(events, "r"), expected, "app");
    });
  }
});

describe("the follow-up queue (shared/message-queue.ts ↔ loop/message-queue.ts)", () => {
  it("knows every state the harness's queue writes", () => {
    const seen = new Set<string>();
    for (const events of Object.values(LOGS))
      for (const message of seedQueue.messageQueueState(events as never).messages.values()) seen.add(message.state);
    assert.deepEqual([...seen].sort(), [...queue.QUEUE_STATES].sort());
    assert.equal(queue.MESSAGE_ATTEMPTS, seedQueue.MESSAGE_ATTEMPTS);
    assert.deepEqual(queue.SteerDelivery, seedSteerDelivery, "how a steered message was read, as both write it");
    assert.deepEqual(MessageFrom, seedMessageFrom, "who wrote a message into a session, as both write it");
  });

  for (const [name, events] of Object.entries(LOGS)) {
    it(`reads the same queue and the same restart notice: ${name}`, () => {
      const ours = queue.messageQueueState(events);
      const theirs = seedQueue.messageQueueState(events as never);
      assert.equal(ours.paused, theirs.paused);
      assert.deepEqual([...ours.messages.entries()], [...theirs.messages.entries()]);
      assert.equal(queue.interruptedReplyNotice(events), seedQueue.interruptedReplyNotice(events as never));
    });
  }

  it("names the records the harness's queue writes", async () => {
    const events: EventEnvelope[] = [];
    const host = {
      call: async (method: string, p: { batch: EventEnvelope["data"][] }) => {
        if (method === "events.append") for (const data of p.batch) events.push(row(events.length + 1, data));
      },
      notify: () => {},
    };
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const harness = new seedQueue.MessageQueue(
      host as never,
      async () => {},
      () => gate,
    );
    await harness.enqueue({ threadId: "chat", text: "hi", messageId: "m" });
    await harness.enqueue({ threadId: "chat", text: "later", messageId: "n" });
    await harness.change("chat", "m", "edit", "hello");
    await harness.change("chat", "n", "remove");
    await harness.pause("chat");
    await harness.resume("chat");
    open();
    for (
      let n = 0;
      n < 1000 && !events.some((e) => e.data.type === "custom" && e.data.event_type === queue.QUEUE_EVENTS.handled);
      n++
    )
      await new Promise((r) => setImmediate(r));
    harness.stop();
    const written = new Set(events.flatMap((e) => (e.data.type === "custom" ? [e.data.event_type] : [])));
    const known = new Set<string>(Object.values(queue.QUEUE_EVENTS));
    for (const type of written) assert.ok(known.has(type), `${type} is a queue record the app does not name`);
    assert.equal(written.size, 7, "queued, updated, removed, paused, resumed, processing and handled were all written");
  });
});

describe("model roles (shared/model-roles.ts ↔ loop/model-roles.ts)", () => {
  it("has the same tables", () => {
    for (const key of ["FABLE", "OPUS", "SOL", "TERRA"] as const) assert.equal(roles[key], seedRoles[key], key);
    assert.deepEqual(roles.ROLES, seedRoles.ROLES);
    assert.deepEqual(roles.CLAUDE_CODE_MODELS, seedRoles.CLAUDE_CODE_MODELS);
    assert.deepEqual(roles.CODEX_MODELS, seedRoles.CODEX_MODELS);
    assert.deepEqual(roles.ENGINE_MODELS, seedRoles.ENGINE_MODELS);
    assert.deepEqual(roles.DELEGATED_ENGINES, seedRoles.DELEGATED_ENGINES);
    assert.deepEqual(roles.ENGINE_LABELS, seedRoles.ENGINE_LABELS);
  });

  const engines = ["claude-code", "codex", "bonsai", "ollama", "opencode", "openrouter", "opper", undefined];
  const models = [undefined, "default", roles.FABLE, roles.OPUS, "sonnet", roles.SOL, "gpt-5.9-new", "qwen3:8b"];

  it("resolves every preset and names every model the same way", () => {
    for (const engine of engines) {
      assert.equal(roles.isDelegated(engine), seedRoles.isDelegated(engine), String(engine));
      assert.equal(roles.hasSessionRoles(engine), seedRoles.hasSessionRoles(engine), String(engine));
      assert.equal(roles.takesRoles(engine), seedRoles.takesRoles(engine), String(engine));
      for (const key of ["planner", "builder", "judge"] as const)
        for (const other of engines)
          assert.equal(
            roles.crossesTo(engine, key, other),
            seedRoles.crossesTo(engine, key, other),
            `${engine} ${key} → ${other}`,
          );
      assert.equal(roles.engineLabel(engine), seedRoles.engineLabel(engine), String(engine));
      assert.deepEqual(roles.modelsFor(engine), seedRoles.modelsFor(engine), String(engine));
      for (const model of models) {
        const label = `${engine} ${model}`;
        if (engine) assert.deepEqual(roles.resolveRoles(engine, model), seedRoles.resolveRoles(engine, model), label);
        assert.equal(roles.roleName(engine, model), seedRoles.roleName(engine as never, model), label);
        if (engine) assert.equal(roles.describeRoles(engine, model), seedRoles.describeRoles(engine, model), label);
      }
    }
  });

  it("cleans the composer's explicit roles the same way", () => {
    const records: unknown[] = [
      null,
      "opus",
      [],
      {},
      { planner: "default" },
      { planner: roles.FABLE, builder: " opus ", judge: "" },
      { builder: roles.SOL, engines: { builder: "codex" } },
      { engines: { judge: "codex", planner: "codex" } },
      { judge: roles.OPUS, engines: { judge: "claude-code", builder: "ollama" } },
      { judge: "vl", engines: { judge: "ollama" } },
      { builder: roles.OPUS, judge: "vl", engines: { builder: "claude-code", judge: "ollama" } },
      { builder: "coder", engines: { builder: "ollama", judge: "bonsai" } },
      { planner: "sonnet", efforts: { planner: "high", builder: 3, judge: "low" } },
      { planner: "sonnet", efforts: { builder: 3 } },
      { builder: 7, judge: null, unknown: "x" },
    ];
    for (const engine of engines.filter((e): e is string => Boolean(e))) {
      for (const record of records) {
        const label = `${engine} ${JSON.stringify(record)}`;
        assert.deepEqual(roles.normalizeRoles(engine, record), seedRoles.normalizeRoles(engine, record), label);
        assert.equal(
          roles.describeRoles(engine, "opus", record),
          seedRoles.describeRoles(engine, "opus", record as object | null),
          label,
        );
      }
    }
  });
});

describe("effort per role (shared/model-roles.ts ↔ loop/effort-cap.ts)", () => {
  it("caps a worker's and a reviewer's effort at high, keeps the lead's as set, and agrees on every level", () => {
    assert.deepEqual(seedEffort.EFFORT_ORDER, Object.values(ReasoningEffort), "the same levels, least to most");
    assert.equal(seedEffort.WORKER_EFFORT_CEILING, roles.WORKER_EFFORT_CEILING);
    const levels = [...Object.values(ReasoningEffort), "turbo", undefined];
    for (const role of ["planner", "builder", "judge"] as const)
      for (const effort of levels)
        assert.equal(
          roles.roleEffortCap(role, effort),
          seedEffort.effortCap(effort, role === "planner"),
          `${role} at ${String(effort)}`,
        );
    assert.deepEqual(
      ["max", "ultra", "xhigh", "high", "medium", "low"].map((effort) => roles.roleEffortCap("builder", effort)),
      ["high", "high", "high", "high", "medium", "low"],
    );
    assert.equal(roles.roleEffortCap("judge", "max"), "high");
    assert.equal(roles.roleEffortCap("planner", "max"), "max", "the lead thinks as hard as the user set");
    assert.equal(roles.roleEffortCap("builder", "turbo"), "turbo", "a level no engine names is left alone");
  });
});

describe("vocabularies (src/shared ↔ the seed's copies)", () => {
  it("names every record the harness writes as the app names it (RunEvent ⊆ CustomEvent)", () => {
    const known = new Set<string>(CUSTOM_EVENT_TYPES);
    const app: Readonly<Record<string, string>> = CustomEvent;
    for (const [member, name] of Object.entries(seedRunEvents.RunEvent)) {
      assert.ok(known.has(name), `${name} is a record the app does not name`);
      assert.equal(app[member], name, `RunEvent.${member} is CustomEvent.${member}`);
    }
  });

  it("names an event's kind of data as the log does", () => {
    assert.deepEqual(seedRunEvents.EventKind, EventKind);
  });

  it("marks a reply's usage source as the log does", () => {
    assert.deepEqual(seedDelegatedTurn.MessageUsageSource, MessageUsageSource);
  });

  it("has the same run execution statuses", () => {
    assert.deepEqual(seedRunEvents.ExecutionStatus, ExecutionStatus);
  });

  it("names why a run's start was refused as the app reads it", () => {
    assert.deepEqual(seedRunDispatch.RunStartRefusal, RunStartRefusal);
  });

  it("names why a Loop did not run at all as the app reads it", () => {
    assert.deepEqual(seedRunDispatch.LoopRefusal, LoopRefusal);
  });

  it("names the same game engines as the app's engine record", () => {
    assert.deepEqual(seedGameEngine.GameEngine, GameEngine);
    // The runtimes a game's studio.json may name, as the seed spells them (folder-facts.ts).
    assert.deepEqual(seedFolderFacts.GameRuntime, { Browser: TargetRuntime.Browser, Bridge: TargetRuntime.Bridge });
    assert.equal(seedGameEngine.engineOfGame(undefined), GameEngine.Web);
    const linked = { engine: { kind: GameEngine.Unreal, project: "/p/A.uproject", linkedAt: "" } } as const;
    assert.equal(seedGameEngine.engineOfGame(linked), GameEngine.Unreal);
    // Any engine an installed plugin declares is the game's engine, by its id, as the app's `engineOf`.
    const toy = { kind: "toy-engine", project: "/p/A.toyproj", linkedAt: "" };
    assert.equal(seedGameEngine.engineOfGame({ engine: toy }), engineOf(toy));
    assert.equal(seedGameEngine.engineOfGame({ engine: toy }), "toy-engine");
    assert.equal(seedGameEngine.ENGINE_ID.source, ENGINE_ID.source);
    const misspelt = { kind: "Toy Engine", project: "/p/A.toyproj", linkedAt: "" };
    assert.equal(seedGameEngine.engineOfGame({ engine: misspelt }), GameEngine.Web, "a kind no engine id spells");
  });

  it("tells an engine game from a web game as the app does", () => {
    for (const kind of [GameEngine.Web, GameEngine.Unreal, "toy-engine", undefined, null, "", "Toy Engine", 3])
      assert.equal(seedEngineGame.isEngineGame(kind), isEngineGame(kind), String(kind));
  });

  it("names a run journal's phases as the harness writes them", () => {
    assert.deepEqual(seedRunEvents.JournalPhase, JournalPhase);
  });

  it("has the same engine ids", () => {
    assert.deepEqual(seedRoles.EngineId, EngineId);
  });

  it("reads an engine the host reports signed in the way the host says it", () => {
    assert.equal(seedSandboxRefusal.ENGINE_READY, EngineStatusCode.Ready);
  });

  it("has the same engine failure kinds", () => {
    assert.deepEqual(seedOutage.EngineFailure, EngineFailureKind);
  });

  it("names why a chat turn failed the same way", () => {
    assert.deepEqual(seedTurnFailureCode, TurnFailureCode);
  });

  it("reads a delegated build's stop reasons the same way", () => {
    assert.deepEqual(seedOutage.StopReason, StopReason);
  });

  it("reads why a game window's renderer went away as the host reports it", () => {
    assert.deepEqual(seedPreviewGone, PreviewGone);
  });

  it("tells the studio's own console lines from the page's the way the host writes them", () => {
    assert.deepEqual(seedPreviewConsoleSource, PreviewConsoleSource);
  });

  it("reads why the host refused a delegation the same way", () => {
    // The director's copy names the lock; the worker pool's copy names the ceiling.
    assert.deepEqual(
      { ...seedDelegationRefusal, TooManyWorkers: seedWorkers.WorkerRefusal.TooManyWorkers },
      DelegationRefusal,
    );
  });

  it("runs at most as many workers at once as Settings offers", () => {
    // Settings' ceiling is the app's copy; the pool stops at the seed's.
    assert.equal(seedWorkers.MAX_WORKERS_AT_ONCE, MAX_WORKERS_AT_ONCE);
  });

  it("finds Claude Code's own folder in a path as the host does, however it is spelled", () => {
    const paths = [
      ".claude/settings.json",
      ".CLAUDE/hooks/pre.sh",
      "src/.claude/agents/a.md",
      ".claude. /x",
      ".claude::$DATA",
      "a\\.Claude\\b",
      ".claude",
      "claude/settings.json",
      ".claudex/a",
      "src/main.ts",
      "",
    ];
    for (const rel of paths) assert.equal(seedThroughClaudeFolder(rel), throughClaudeFolder(rel), rel);
  });

  it("names the engine kind the host seats in place as the app does", () => {
    assert.equal(seedEngineSeat.SEATED_ENGINE_KIND, EngineKind.Delegated);
  });

  it("reads a verdict record's pass and rule as the harness writes them", () => {
    assert.deepEqual(seedVerdict.VerdictPass, VerdictPass);
    assert.deepEqual(seedVerdict.VerdictRule, VerdictRule);
  });

  it("writes a lead's save point with the verdict source the renderer reads as saved by the lead, under the lead's part", () => {
    assert.equal(seedSavePointSource, seedVerdict.VerdictSource.Lead);
    assert.equal(savedByLead(seedSavePointSource), true);
    assert.equal(seedOpenLeadPart, LEAD_PART);
  });

  it("names why a loop stopped the same way, and reads a run's close by its code", () => {
    assert.deepEqual(seedOutcomes.StopCode, StopCode);
    const close = seedOutcomes.stopWith({ runId: "r1" }, seedOutcomes.StopCode.NoImprovement, "lost to its base");
    const read = customPayload(
      { type: "custom", event_type: CustomEvent.RunFinished, payload: close },
      CustomEvent.RunFinished,
    );
    assert.equal(read?.stopCode, StopCode.NoImprovement);
  });

  it("names who asked for a direct model call the same way", () => {
    assert.deepEqual(seedJudgeProvenance.CompletionRole, CompletionRole);
  });

  it("logs a chat's delegation under the tool name the app reads", () => {
    assert.equal(seedDelegatedTurn.DELEGATE_TOOL, chatRun.DELEGATE_TOOL);
  });

  it("has the same time units", () => {
    assert.deepEqual(
      { second: seedTime.SECOND_MS, minute: seedTime.MINUTE_MS, hour: seedTime.HOUR_MS },
      { second: duration.SECOND_MS, minute: duration.MINUTE_MS, hour: duration.HOUR_MS },
    );
  });
});

describe("project facts (shared/project-facts.ts ↔ loop/folder-facts.ts)", () => {
  it("reads a fact an enabled plugin's detect found by the source the app writes", () => {
    const source = pluginFactSource("toys");
    assert.ok(source.startsWith(seedFolderFacts.PLUGIN_FACT_SOURCE_PREFIX));
    for (const other of Object.values(FactSource))
      assert.ok(!other.startsWith(seedFolderFacts.PLUGIN_FACT_SOURCE_PREFIX), other);
  });

  it("the seed's fact ids and served facts are the app's", () => {
    assert.deepEqual(seedFolderFacts.CoreFact, CoreFact);
    const at = (id: string, path: string) => ({ id, path, source: FactSource.Core });
    const linked = { kind: GameEngine.Unreal, project: "/p/A.uproject", linkedAt: "" } as const;
    const toyLinked = { kind: "toy-engine", project: "/p/A.toyproj", linkedAt: "" };
    assert.deepEqual(seedFolderFacts.FolderHolds, FolderHolds);
    // Each descriptor beside the facts the app lists for the same folder, and whether both serve it
    // as a web game: only one with no kind yet or one holding a web game at its root is.
    const table: Array<[string, seedFolderFacts.FactsOfDescriptor & object, FactRef[], boolean]> = [
      ["a game with no kind yet", { facts: [] }, [], true],
      ["an empty folder", { facts: [], holds: FolderHolds.Nothing }, [], true],
      ["a folder of notes", { facts: [], holds: FolderHolds.Notes }, [], true],
      ["a folder of its own files of a kind no rule knows", { facts: [], holds: FolderHolds.OwnFiles }, [], false],
      ["a folder that can't be read", { facts: [], holds: FolderHolds.Unreadable }, [], false],
      ["a web game", { facts: [at(CoreFact.WebGame, ".")] }, [at(CoreFact.WebGame, ".")], true],
      [
        "an Unreal project with a site",
        { facts: [at(CoreFact.WebGame, "site"), at(CoreFact.UnrealProject, ".")] },
        [at(CoreFact.WebGame, "site"), at(CoreFact.UnrealProject, ".")],
        false,
      ],
      ["an older descriptor", {}, [at(CoreFact.WebGame, ".")], true],
      ["an older linked one", { engine: linked }, [at(CoreFact.UnrealProject, ".")], false],
      ["an older one linked to another engine", { engine: toyLinked }, [at("toy-project", ".")], false],
      ["an older folder with no web page (a Godot one, say)", { web: false }, [at(CoreFact.GodotProject, ".")], false],
    ];
    for (const [name, descriptor, facts, web] of table) {
      const kind = { facts, holds: descriptor.holds ?? undefined };
      assert.equal(servedAsWebGame(kind), web, `${name}: the app serves it as web`);
      assert.equal(seedFolderFacts.servedAsWeb(descriptor), web, `${name}: the seed serves it as web`);
      assert.equal(seedFolderFacts.kindPending(descriptor), kindPending(kind), `${name}: kind pending`);
      if ("facts" in descriptor)
        assert.equal(seedFolderFacts.kindUnknown(descriptor), kindUnknown(kind), `${name}: kind unknown`);
      // A descriptor that carries its facts is served by the same facts (an older one by its older fields).
      if ("facts" in descriptor)
        assert.deepEqual(
          seedFolderFacts.servedFactsOf(descriptor),
          servedFacts(kind).map(({ id, path }) => ({ id, path })),
          `${name}: served facts`,
        );
    }
    assert.deepEqual(seedFolderFacts.FACT_ROOT, ".", "the root as a fact's path spells it");
    for (const engine of Object.values(GameEngine))
      assert.deepEqual(
        seedFolderFacts.factsOfEngine(engine),
        factsOfEngine(engine).map(({ id, path }) => ({ id, path })),
        `${engine}: the facts an engine stands for`,
      );
  });

  // Flipped (one Loop): it also held the seed's profile choice (`loopProfileOf`, `WEB_LOOP_FACTS`) to
  // the app's; every Loop works in place now, and only the persisted vocabulary is shared. Flipped:
  // the seed's vocabulary equalled the app's; it keeps only the value it writes, which the app names
  // alike (the app alone keeps `web`, an earlier Genex's, for history).
  it("names a Loop's profile as the app does", () => {
    assert.deepEqual(seedFolderFacts.LoopProfile, { Open: LoopProfile.Open });
  });
  it("the seed's starters and project tool names are the app's", () => {
    assert.deepEqual(seedFolderFacts.ProjectStarter, ProjectStarter);
    assert.deepEqual(seedFolderFacts.ProjectTool, ProjectTool);
  });
});

describe("where a run keeps its tracks (shared/game-history.ts ↔ loop/repo.ts)", () => {
  it("names every ref of a run under the root the app clears finished runs' tracks from", async () => {
    const { RUN_REFS } = await import("../../src/shared/game-history.ts");
    const repo = await import("../../src/harness-seed/loop/repo.ts");
    for (const ref of [
      repo.runRef("run_1", "integration"),
      repo.runRef("run_1", "worker", 2),
      repo.attemptRef("run_1", "f", 1),
    ])
      assert.ok(ref.startsWith(`${RUN_REFS}run_1/`), ref);
  });
});

describe("long processes the agents start (shared/jobs.ts ↔ loop/jobs/contract.ts)", () => {
  it("names the job states and tools as the app does", () => {
    assert.deepEqual(seedJobs.JobState, jobs.JobState);
    assert.deepEqual(seedJobs.JobStopper, jobs.JobStopper);
    assert.deepEqual(seedJobs.JobRole, jobs.JobRole);
    assert.deepEqual(seedJobs.JobTool, jobs.JobTool);
    assert.equal(seedJobs.APP_LOOK_TOOL_NAME, jobs.APP_LOOK_TOOL_NAME);
  });
});

describe("Genex's moments (shared/plugin-hooks.ts ↔ loop/hooks.ts)", () => {
  it("names the hook events, the blocking ones, checkpoint skips, Genex's holds and the label cap as the app does", async () => {
    const seed = await import("../../src/harness-seed/loop/hooks.ts");
    const app = await import("../../src/shared/plugin-hooks.ts");
    assert.deepEqual(seed.HookEvent, app.HookEvent);
    assert.deepEqual([...seed.SEED_FIRED_HOOK_EVENTS].sort(), [...app.SEED_FIRED_HOOK_EVENTS].sort());
    assert.deepEqual([...seed.BLOCKING_HOOK_EVENTS].sort(), [...app.BLOCKING_HOOK_EVENTS].sort());
    assert.deepEqual(seed.CheckpointSkip, app.CheckpointSkip);
    assert.equal(seed.HOOK_BLOCKED, app.HOOK_BLOCKED);
    assert.deepEqual(seed.HookHold, app.HookHold);
    assert.equal(seed.HOOK_LABEL_CHARS, app.HOOK_LABEL_CHARS);
  });

  it("tells an older host by the name the host refuses an unknown method with", async () => {
    const seed = await import("../../src/harness-seed/loop/hooks.ts");
    const { HostRefusal } = await import("../../src/shared/harness-api.ts");
    assert.equal(seed.UNKNOWN_METHOD, HostRefusal.UnknownMethod);
    assert.equal(seed.olderHost({ name: HostRefusal.UnknownMethod }), true);
    assert.equal(seed.olderHost({ name: HostRefusal.InvalidParams }), false);
  });
});

describe("a game's observers and a lead's claim (shared/observers.ts ↔ loop/finish-contract.ts)", () => {
  it("names the finish check's steps, its reason caps, the capture sources, the events and the lead call's deadline as the app does", async () => {
    const seed = await import("../../src/harness-seed/loop/finish-contract.ts");
    const app = await import("../../src/shared/observers.ts");
    const check = await import("../../src/shared/finish-check.ts");
    const { BRIDGE_TOOL_DEADLINE_MS } = await import("../../src/substrate/engines/studio-bridge.ts");
    assert.deepEqual({ ...seed.FinishCheckStep }, { ...check.FinishCheckStep });
    assert.equal(seed.MAX_FINISH_REASONS, check.MAX_FINISH_REASONS);
    assert.equal(seed.FINISH_REASON_CHARS, check.FINISH_REASON_CHARS);
    assert.deepEqual({ ...seed.StopWhy }, { ...check.StopWhy });
    assert.equal(seed.FINISH_CHECK_EVENT, CustomEvent.FinishCheck);
    assert.deepEqual({ ...seed.ObserverSource }, { ...app.ObserverSource });
    assert.equal(seed.PREVIEW_OBSERVER, app.PREVIEW_OBSERVER);
    assert.equal(seed.PROOF_OBSERVER, app.PROOF_OBSERVER);
    assert.equal(seed.OBSERVER_CAPTURE_EVENT, CustomEvent.ObserverCapture);
    // Everything a lead's finish does happens inside its one call, which the bridge cuts at this deadline.
    assert.equal(seed.LEAD_CALL_MS, BRIDGE_TOOL_DEADLINE_MS);
  });
});
