/**
 * The contract vocabularies in `src/shared` and the small predicates beside them: each name table
 * lists exactly the names its registry or union knows, a record built through `customEventData`
 * reads back through the shared readers, and the predicates answer as the call sites they replace.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOM_EVENT_TYPES, CustomEvent, customPayload, customEventData } from "../../src/shared/custom-events.ts";
import {
  canBuildWith,
  type EngineDescriptor,
  EngineKind,
  EngineStatusCode,
  isDelegatedEngine,
  isEngineReady,
  needsSignIn,
} from "../../src/shared/engine-descriptor.ts";
import { EngineFailureKind, isContextFailure } from "../../src/shared/engine-requests.ts";
import { errorMessage, isUserCancelled, UserCancelledError } from "../../src/shared/errors.ts";
import { EngineId, PROVIDERS } from "../../src/shared/providers.ts";
import { isExecutionEvent, RUN_PAUSE_EVENTS, RUN_RESUME_EVENTS, RUN_START_EVENTS } from "../../src/shared/run-state.ts";
import { isUiEventType, UI_EVENT_TYPES, UiEvent } from "../../src/shared/ui-events.ts";

type Engine = Pick<EngineDescriptor, "status" | "kind" | "models">;
const model = (supportsTools: boolean): EngineDescriptor["models"][number] => ({
  id: "m",
  label: "M",
  contextWindow: 8192,
  supportsTools,
  supportsVision: false,
});
const engine = (code: EngineStatusCode, kind: EngineKind, tools: boolean[] = []): Engine => ({
  status: { code, detail: "" },
  kind,
  models: tools.map(model),
});

describe("custom event names", () => {
  it("are listed once each, and CUSTOM_EVENT_TYPES is the same list", () => {
    const names = Object.values(CustomEvent);
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual(CUSTOM_EVENT_TYPES, names);
  });

  it("build a record the shared readers read back", () => {
    const data = customEventData(CustomEvent.RunFinished, { runId: "r1", paused: true });
    assert.deepEqual(data, { type: "custom", event_type: "run_finished", payload: { runId: "r1", paused: true } });
    assert.deepEqual(customPayload(data, CustomEvent.RunFinished), { runId: "r1", paused: true });
    assert.equal(customPayload(data, CustomEvent.RunStarted), null);
  });

  it("group a run's lifecycle records", () => {
    assert.deepEqual([...RUN_START_EVENTS], ["run_registered", "run_started"]);
    assert.deepEqual([...RUN_PAUSE_EVENTS], ["autopilot_paused", "run_paused"]);
    assert.deepEqual([...RUN_RESUME_EVENTS], ["autopilot_resumed", "run_resumed"]);
    for (const event_type of [...RUN_START_EVENTS, ...RUN_PAUSE_EVENTS, ...RUN_RESUME_EVENTS, "run_finished"])
      assert.equal(isExecutionEvent({ event_type }), true, event_type);
    assert.equal(isExecutionEvent({ event_type: "facet_iteration" }), false);
  });
});

describe("UI event names", () => {
  it("are the map's names", () => {
    assert.deepEqual(UI_EVENT_TYPES, Object.values(UiEvent));
    for (const name of UI_EVENT_TYPES) assert.equal(isUiEventType(name), true, name);
    assert.equal(isUiEventType("PreviewFrame"), false, "a member name is not an event name");
    assert.equal(isUiEventType("toString"), false);
  });
});

describe("engines", () => {
  it("have one id table the provider list comes from", () => {
    assert.deepEqual(
      PROVIDERS.map((provider) => provider.id),
      // Flipped (OpenCode, OpenRouter, a local server, Grok Build): the metered providers follow the
      // local ones, and a server the person runs comes last. Flipped (Cursor): a metered one, after Grok Build.
      // Flipped (Genex): Claude Code on Genex credits, metered, after Cursor.
      // Flipped (Opper): a metered API whose key is pasted in Settings, after OpenRouter.
      [
        EngineId.ClaudeCode,
        EngineId.Codex,
        EngineId.Bonsai,
        EngineId.Ollama,
        EngineId.OpenCode,
        EngineId.Grok,
        EngineId.Cursor,
        EngineId.Genex,
        EngineId.OpenRouter,
        EngineId.Opper,
        EngineId.LocalServer,
      ],
    );
  });

  it("say whether they are ready, wait for a sign-in, delegate, or can build", () => {
    const ready = engine(EngineStatusCode.Ready, EngineKind.Direct, [false, true]);
    assert.equal(isEngineReady(ready), true);
    assert.equal(needsSignIn(ready), false);
    assert.equal(isDelegatedEngine(ready), false);
    assert.equal(canBuildWith(ready), true, "a ready local engine with a tool model");
    assert.equal(canBuildWith(engine(EngineStatusCode.Ready, EngineKind.Direct, [false])), false, "no tool model");
    assert.equal(canBuildWith(engine(EngineStatusCode.Ready, EngineKind.Delegated)), true, "a delegated CLI");
    const signedOut = engine(EngineStatusCode.NeedsLogin, EngineKind.Delegated);
    assert.equal(needsSignIn(signedOut), true);
    assert.equal(isDelegatedEngine(signedOut), true);
    assert.equal(canBuildWith(signedOut), false, "nothing builds before the sign-in");
  });

  it("name a full context as one failure", () => {
    const full = Object.values(EngineFailureKind).filter(isContextFailure);
    assert.deepEqual(full, ["context_threshold", "context_overflow"]);
  });
});

describe("a user's cancel", () => {
  it("is told apart from a failure, including one whose words merely end like a cancel", () => {
    const cancelled = new UserCancelledError();
    assert.equal(errorMessage(cancelled), "Cancelled by user");
    assert.equal(String(cancelled), "Error: Cancelled by user", "the text the IPC edge always carried");
    assert.equal(isUserCancelled(cancelled), true);
    assert.equal(isUserCancelled(new Error("Cancelled by user")), true);
    // An install step that failed for its own reason, quoting a cancel, is still a failure to show.
    assert.equal(isUserCancelled(new Error("Restoring the plugin failed: Cancelled by user")), false);
    assert.equal(
      isUserCancelled(new Error("Error invoking remote method 'studio:plugins:install': Error: Cancelled by user")),
      false,
    );
    assert.equal(isUserCancelled(new Error("Download cancelled by user request")), false);
    assert.equal(isUserCancelled(null), false);
  });
});
