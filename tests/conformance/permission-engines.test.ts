/**
 * Every engine's chat has the permissions pill, each with the modes its session honours: what the
 * composer offers, what an engine runs a chat in, and what a plan card may continue in
 * (shared/permissions.ts, renderer/chat/use-permission-mode.ts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planModesFor } from "../../src/renderer/chat/use-permission-mode.ts";
import {
  engineMode,
  PERMISSION_MODES,
  type PermissionMode,
  permissionModesFor,
  planContinuations,
  plansByTurn,
  unavailableModeReason,
} from "../../src/shared/permissions.ts";

const ALL: readonly PermissionMode[] = ["auto", "default", "acceptEdits", "plan", "bypassPermissions"];

describe("the modes each engine honours", () => {
  it("lists every engine's modes in the composer's order, Auto always among them", () => {
    assert.deepEqual(PERMISSION_MODES, ALL);
    const table = Object.fromEntries(
      ["claude-code", "codex", "bonsai", "ollama", "openrouter", "opencode", "grok", "a-new-engine"].map((engine) => [
        engine,
        permissionModesFor(engine),
      ]),
    );
    assert.deepEqual(table, {
      "claude-code": ALL,
      codex: ["auto", "plan", "bypassPermissions"],
      bonsai: ["auto", "default", "acceptEdits", "plan"],
      ollama: ["auto"],
      // OpenRouter's tools run in the studio's own session loop, which asks, as Bonsai's do.
      openrouter: ["auto", "default", "acceptEdits", "plan"],
      // `opencode run` cannot stop mid-turn to ask, and always runs in the studio's sandbox.
      opencode: ["auto", "plan"],
      // `grok -p` cannot ask either; in the person's Bypass it runs outside the studio's sandbox, as Codex does.
      grok: ["auto", "plan", "bypassPermissions"],
      "a-new-engine": ["auto"],
    });
    // Opper's tools run in the same loop as OpenRouter's.
    assert.deepEqual(permissionModesFor("opper"), ["auto", "default", "acceptEdits", "plan"]);
    // An inherited property name is no engine of its own.
    assert.deepEqual(permissionModesFor("constructor"), ["auto"]);
  });

  it("runs a chat in its own mode where the engine honours it, and in Auto where not", () => {
    const runs = (engine: string) => ALL.map((mode) => engineMode(engine, mode));
    assert.deepEqual(runs("claude-code"), ALL);
    assert.deepEqual(runs("codex"), ["auto", "auto", "auto", "plan", "bypassPermissions"]);
    assert.deepEqual(runs("bonsai"), ["auto", "default", "acceptEdits", "plan", "auto"]);
    assert.deepEqual(runs("ollama"), ["auto", "auto", "auto", "auto", "auto"]);
    assert.deepEqual(runs("openrouter"), ["auto", "default", "acceptEdits", "plan", "auto"]);
    assert.deepEqual(runs("opper"), ["auto", "default", "acceptEdits", "plan", "auto"]);
    assert.deepEqual(runs("opencode"), ["auto", "auto", "auto", "plan", "auto"]);
    assert.deepEqual(runs("grok"), ["auto", "auto", "auto", "plan", "bypassPermissions"]);
  });

  it("says why a mode is not offered: a session that cannot ask, or commands that are always sandboxed", () => {
    const reasons = (engine: string) => ALL.map((mode) => unavailableModeReason(engine, mode));
    assert.deepEqual(reasons("claude-code"), [null, null, null, null, null]);
    assert.deepEqual(reasons("codex"), [null, "cannot_ask", "cannot_ask", null, null]);
    assert.deepEqual(reasons("bonsai"), [null, null, null, null, "always_sandboxed"]);
    assert.deepEqual(reasons("ollama"), [null, "cannot_ask", "cannot_ask", "cannot_ask", "cannot_ask"]);
    assert.deepEqual(reasons("openrouter"), [null, null, null, null, "always_sandboxed"]);
    assert.deepEqual(reasons("opper"), [null, null, null, null, "always_sandboxed"]);
    assert.deepEqual(reasons("opencode"), [null, "cannot_ask", "cannot_ask", null, "cannot_ask"]);
    assert.deepEqual(reasons("grok"), [null, "cannot_ask", "cannot_ask", null, null]);
  });

  it("asks for a plan's approval mid-turn on Claude Code, after the turn where an engine plans by ending it", () => {
    assert.deepEqual(
      ["claude-code", "codex", "bonsai", "ollama"].map((engine) => plansByTurn(engine)),
      [false, true, true, false],
    );
  });

  it("offers a plan to continue only in modes the engine honours, and no Auto a Claude model cannot use", () => {
    assert.deepEqual(planContinuations("claude-code"), ["auto", "acceptEdits", "default"]);
    assert.deepEqual(planContinuations("codex"), ["auto"]);
    assert.deepEqual(planContinuations("bonsai"), ["auto", "acceptEdits", "default"]);
    assert.deepEqual(planModesFor("claude-code", true), ["acceptEdits", "default"]);
    assert.deepEqual(planModesFor("codex", false), ["auto"]);
  });
});
