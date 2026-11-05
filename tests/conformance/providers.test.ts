/**
 * One provider table (`src/shared/providers.ts`) names every model provider the app knows: its
 * label, its sign-in copy, how it signs in, whether it is a subscription and what kind of roles
 * it runs. Main, the renderer and the engine descriptors read that one table; the harness seed
 * keeps its own role tables, held to it here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as seedRoles from "../../src/harness-seed/loop/model-roles.ts";
import { SUBSCRIPTION_ENGINES as mainSubscriptions } from "../../src/main/core/subscription-engines.ts";
import {
  SUBSCRIPTION_ENGINES as rendererSubscriptions,
  SUBSCRIPTION_LABELS,
  signInPolling,
  signInVendor,
} from "../../src/renderer/subscription-auth.ts";
import type { ClaudeLoginState } from "../../src/shared/claude-login.ts";
import * as roles from "../../src/shared/model-roles.ts";
import {
  PROVIDERS,
  SUBSCRIPTION_ENGINES,
  isLocalEngine,
  isBeta,
  isMetered,
  loginKind,
  providerInfo,
  runsClaudeCode,
  type RoleSupport,
} from "../../src/shared/providers.ts";
import { EngineRegistry } from "../../src/substrate/engines/registry.ts";
import type { Engine } from "../../src/substrate/engines/types.ts";

const engine = (id: string, kind: Engine["kind"] = "delegated"): Engine => ({
  id,
  label: `${id} engine`,
  kind,
  status: async () => ({ code: "ready", detail: "" }),
  models: async () => [],
});

describe("provider table", () => {
  it("is the one list of subscriptions main and the renderer offer, in preference order", () => {
    assert.deepEqual([...SUBSCRIPTION_ENGINES], ["claude-code", "codex"]);
    assert.equal(mainSubscriptions, SUBSCRIPTION_ENGINES);
    assert.equal(rendererSubscriptions, SUBSCRIPTION_ENGINES);
    assert.deepEqual(
      SUBSCRIPTION_ENGINES.filter((id) => providerInfo(id)?.subscription !== true),
      [],
    );
  });

  it("gives every subscription its sign-in words", () => {
    for (const id of SUBSCRIPTION_ENGINES) {
      const copy = providerInfo(id)?.signIn;
      assert.ok(copy, id);
      assert.deepEqual(SUBSCRIPTION_LABELS[id], { card: copy.card, account: copy.account, install: copy.install });
    }
    for (const provider of PROVIDERS) assert.equal(provider.signIn !== null, provider.subscription, provider.id);
  });

  it("gives the sign-in card the table's words, and a neutral card to an engine it does not list", () => {
    assert.deepEqual(signInVendor("codex"), {
      name: "Codex",
      url: "https://developers.openai.com/codex/cli",
      get: "Install Codex",
      useLine: "Use your ChatGPT subscription to build games.",
      signInLine: "Connect your ChatGPT subscription to build games. Codex handles sign-in in your browser.",
    });
    assert.equal(signInVendor("claude-code").name, "Claude Code");
    const unknown = signInVendor("gemini-cli");
    assert.equal(unknown.name, "gemini-cli");
    assert.equal(unknown.url, "", "no install page is guessed");
    assert.doesNotMatch(JSON.stringify(unknown), /Claude|ChatGPT/, "another vendor's branding is never borrowed");
  });

  it("says how each provider signs in, and nothing for an engine it does not know", () => {
    assert.equal(loginKind("claude-code"), "terminal");
    assert.equal(loginKind("codex"), "console");
    assert.equal(loginKind("ollama"), "none");
    assert.equal(loginKind("opencode"), "cli", "OpenCode runs its own sign-in in the terminal");
    assert.equal(loginKind("grok"), "cli", "Grok Build runs its own `grok login` in the terminal");
    assert.equal(loginKind("openrouter"), "none", "OpenRouter's key is pasted in Settings");
    assert.equal(loginKind("opper"), "none", "Opper's key is pasted in Settings");
    assert.equal(loginKind("local-server"), "none", "a local server's address and key are typed in Settings");
    assert.equal(loginKind("gemini-cli"), "none");
    assert.equal(providerInfo("gemini-cli"), undefined);
    assert.equal(providerInfo("constructor"), undefined);
  });

  it("names the engines whose sessions are Claude Code's: Claude Code and Genex", () => {
    assert.deepEqual(
      PROVIDERS.filter((provider) => runsClaudeCode(provider.id)).map((provider) => provider.id),
      ["claude-code", "genex"],
    );
    assert.equal(runsClaudeCode(null), false);
  });

  it("says who pays for each provider, and never calls an unknown engine local or metered", () => {
    const table = Object.fromEntries(PROVIDERS.map((provider) => [provider.id, provider.billing]));
    assert.deepEqual(table, {
      "claude-code": "subscription",
      codex: "subscription",
      bonsai: "local",
      ollama: "local",
      opencode: "metered",
      // Grok Build runs on whatever its own sign-in is (a Grok plan, or an xAI key in its config), so,
      // like OpenCode, it is never picked on the person's behalf.
      grok: "metered",
      openrouter: "metered",
      // Flipped (Opper): an API billed per token, like OpenRouter.
      opper: "metered",
      // Flipped (a local server): a server the person runs is local, never metered.
      "local-server": "local",
      // Flipped (Cursor): third-party models in Cursor, and Cursor's own past the plan's pool, are paid
      // from the account's credit, so the app never picks it by itself.
      cursor: "metered",
      // Genex bills the person's Genex credits per call: only their own pick runs on it.
      genex: "metered",
    });
    for (const id of ["openrouter", "opper", "opencode", "grok", "cursor", "genex"])
      assert.equal(isMetered(id), true, id);
    for (const id of ["bonsai", "ollama", "local-server"]) assert.equal(isLocalEngine(id), true, id);
    for (const id of ["claude-code", "codex", "gemini-cli", "constructor", null, undefined]) {
      assert.equal(isMetered(id), false, String(id));
      assert.equal(isLocalEngine(id), false, String(id));
    }
    for (const provider of PROVIDERS)
      assert.equal(provider.billing === "subscription", provider.subscription, provider.id);
  });

  it("names the providers that ship in beta: Cursor and Opper, until a live test proves them", () => {
    assert.deepEqual(
      PROVIDERS.filter((provider) => isBeta(provider.id)).map((provider) => provider.id),
      // Flipped (Opper): shipped before a live test, so it says Beta too.
      ["cursor", "opper"],
    );
    for (const id of ["gemini-cli", "constructor", null, undefined]) assert.equal(isBeta(id), false, String(id));
  });

  it("is served on each engine descriptor; an unlisted engine carries none", async () => {
    const registry = new EngineRegistry();
    registry.register(engine("codex"));
    registry.register(engine("gemini-cli"));
    const [codex, other] = await registry.describe();
    assert.deepEqual(codex?.provider, providerInfo("codex"));
    assert.equal(other?.provider, null);
  });

  it("agrees with the app's and the seed's role tables", () => {
    for (const provider of PROVIDERS) {
      for (const [name, table] of [
        ["app", roles],
        ["seed", seedRoles],
      ] as const) {
        const where = `${name} ${provider.id}`;
        assert.equal(table.isDelegated(provider.id), provider.roles === "presets", where);
        assert.equal(
          table.hasSessionRoles(provider.id),
          provider.roles === "presets" || provider.roles === "sessions",
          where,
        );
        assert.equal(table.takesRoles(provider.id), takesRolesBy(provider.roles), where);
        if (provider.roles === "presets") assert.equal(table.engineLabel(provider.id), provider.label, where);
      }
    }
    const presets = PROVIDERS.filter((provider) => provider.roles === "presets").map((provider) => provider.id);
    assert.deepEqual([...roles.DELEGATED_ENGINES], presets);
    assert.deepEqual([...seedRoles.DELEGATED_ENGINES], presets);
  });
});

/** Does a provider row's role support take roles? No row runs one model today; one that did would not. */
function takesRolesBy(support: RoleSupport): boolean {
  return support !== "single";
}

describe("sign-in polling", () => {
  const login = (phase: ClaudeLoginState["phase"]): ClaudeLoginState => ({ revision: 1, phase, hasBrowserUrl: false });

  it("polls a terminal sign-in only while it is under way, so a failed one stops rechecking", () => {
    const rows: Array<[string, Parameters<typeof signInPolling>[0], ReturnType<typeof signInPolling>]> = [
      [
        "not signing in",
        { consoleLogin: false, waiting: false, needsLogin: true, login: login("idle") },
        { probeOnFocus: true, poll: false },
      ],
      [
        "browser open",
        { consoleLogin: false, waiting: true, needsLogin: true, login: login("browser") },
        { probeOnFocus: true, poll: true },
      ],
      [
        "in the terminal",
        { consoleLogin: false, waiting: true, needsLogin: true, login: login("terminal") },
        { probeOnFocus: true, poll: true },
      ],
      [
        "state not read yet",
        { consoleLogin: false, waiting: true, needsLogin: true, login: null },
        { probeOnFocus: true, poll: true },
      ],
      [
        "failed",
        { consoleLogin: false, waiting: true, needsLogin: true, login: login("failed") },
        { probeOnFocus: true, poll: false },
      ],
      [
        "cancelled",
        { consoleLogin: false, waiting: true, needsLogin: true, login: login("cancelled") },
        { probeOnFocus: true, poll: false },
      ],
      [
        "connected, CLI disagrees",
        { consoleLogin: false, waiting: true, needsLogin: true, login: login("connected") },
        { probeOnFocus: true, poll: false },
      ],
      [
        "signed in",
        { consoleLogin: false, waiting: false, needsLogin: false, login: login("idle") },
        { probeOnFocus: false, poll: false },
      ],
      [
        "console sign-in reports itself",
        { consoleLogin: true, waiting: true, needsLogin: true, login: null },
        { probeOnFocus: false, poll: false },
      ],
    ];
    for (const [name, input, expected] of rows) assert.deepEqual(signInPolling(input), expected, name);
  });
});
