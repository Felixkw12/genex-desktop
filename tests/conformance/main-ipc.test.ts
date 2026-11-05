/**
 * Main-process behaviour that used to be pinned by reading `main/index.ts` as text: the keep-awake
 * hold through a run's settlement, the run stop and start handlers, and the subscription sign-in
 * wiring. The registrars in `src/main/ipc/` take their dependencies explicitly, so each is driven
 * here through the real typed `handle()` with recorders in place of Electron and the core.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";
import { createIpcHandle, type IpcResult, type IpcSender } from "../../src/main/ipc-handle.ts";
import { KEEP_AWAKE_FALLBACK_MS, KeepAwake, type FallbackTimers } from "../../src/main/keep-awake.ts";
import { registerRunsIpc, type RunsIpcDeps } from "../../src/main/ipc/runs.ts";
import { registerLoginIpc, type LoginIpcDeps } from "../../src/main/ipc/login.ts";
import { badgeText, registerNotificationsIpc } from "../../src/main/ipc/notifications.ts";
import { registerModelsIpc, type ModelsIpcDeps } from "../../src/main/ipc/models.ts";
import { createProviderUsage } from "../../src/main/core/provider-usage.ts";
import { type ProviderUsageReport, UsageState } from "../../src/shared/provider-usage.ts";
import { registerUpdateIpc } from "../../src/main/ipc/update.ts";
import { registerStorageIpc } from "../../src/main/ipc/storage.ts";
import { registerJobsIpc } from "../../src/main/ipc/jobs.ts";
import { type PlayIpcDeps, registerPlayIpc } from "../../src/main/ipc/play.ts";
import { NativeArch, type NativeHost, NativePlatform } from "../../src/shared/play-native.ts";
import { gameLinks } from "../../src/main/play/game-links.ts";
import { createLoginControllers, settleSignIn, type SubscriptionEngine } from "../../src/main/login-controllers.ts";
import { AccountId, SubscriptionAccounts } from "../../src/substrate/engines/subscription-accounts.ts";
import { EngineStatusCode } from "../../src/shared/engine-descriptor.ts";
import { mkdtempSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ClaudeLoginState } from "../../src/shared/claude-login.ts";
import { FastDecisions } from "../../src/main/core/fast-decisions.ts";
import { memoryKeyStore } from "../../src/substrate/provider-keys.ts";
import type { CodexLoginState } from "../../src/shared/codex-login.ts";
import { OpenRouterSignInProblem } from "../../src/shared/openrouter-login.ts";
import { ModelPullProblem } from "../../src/shared/model-install.ts";
import { EngineFailureKind } from "../../src/shared/engine-requests.ts";
import { EngineError } from "../../src/substrate/engines/types.ts";
import type { UiEvent } from "../../src/shared/ui-events.ts";
import { RestartAnswer, UpdateAction, UpdateCheckStatus } from "../../src/shared/app-update.ts";
import type { EventEnvelope } from "../../src/shared/event-log.ts";
import { recommendModels, type HardwareInfo } from "../../src/substrate/hardware.ts";

type Listener = (event: IpcSender, payload: unknown) => Promise<IpcResult>;
const studio = { sender: "studio", senderFrame: "main-frame" };

function registrar() {
  const listeners = new Map<string, Listener>();
  const handle = createIpcHandle(
    {
      handle: (channel, listener) => {
        listeners.set(channel, listener);
      },
    },
    { fixture: false, isStudioUi: () => true },
  );
  const invoke = (channel: string, payload?: unknown) => {
    const listener = listeners.get(channel);
    assert.ok(listener, `${channel} is not registered`);
    return listener(studio, payload);
  };
  return { handle, invoke };
}

/** A power-save blocker and a fallback timer that only fire when told to. */
function blockerAndTimers() {
  const log: string[] = [];
  let next = 1;
  const pending = new Map<object, () => void>();
  const blocker = {
    start: (type: string) => {
      const id = next++;
      log.push(`start ${type} ${id}`);
      return id;
    },
    stop: (id: number) => {
      log.push(`stop ${id}`);
    },
  };
  const timers: FallbackTimers & { fire(): void; armed(): number; delays: number[]; unrefs: number } = {
    delays: [],
    unrefs: 0,
    setTimeout(callback, ms) {
      timers.delays.push(ms);
      const handle = {
        unref: () => {
          timers.unrefs++;
        },
      };
      pending.set(handle, callback);
      return handle;
    },
    clearTimeout(handle) {
      pending.delete(handle);
    },
    fire() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
    armed: () => pending.size,
  };
  return { blocker, timers, log };
}

describe("the Mac stays awake until the run actually settles", () => {
  it("a run holds the blocker once, and run.settled or run.failed is what releases it", () => {
    const { blocker, timers, log } = blockerAndTimers();
    const keep = new KeepAwake(blocker, timers);
    keep.observe({ type: "run.keepawake", payload: { runId: "r1" } });
    keep.hold();
    keep.observe({ type: "run.keepawake", payload: { runId: "r1" } });
    assert.equal(keep.held, true);
    keep.observe({ type: "run.finished", payload: { runId: "r1" } });
    assert.equal(keep.held, true, "a finished run still has its post-run pass to settle");
    keep.observe({ type: "run.settled", payload: { runId: "r1" } });
    assert.equal(keep.held, false);
    keep.hold();
    keep.observe({ type: "run.failed", payload: { runId: "r2", error: "boom" } });
    assert.equal(keep.held, false);
    assert.deepEqual(log, ["start prevent-app-suspension 1", "stop 1", "start prevent-app-suspension 2", "stop 2"]);
  });

  it("a harness that never reports back cannot leak the blocker: the stop fallback releases it after five minutes", () => {
    const { blocker, timers, log } = blockerAndTimers();
    const keep = new KeepAwake(blocker, timers);
    keep.armFallback();
    assert.equal(timers.armed(), 0, "nothing held, nothing to arm");
    keep.hold();
    keep.armFallback();
    keep.armFallback();
    assert.equal(timers.armed(), 1, "armed once");
    assert.deepEqual(timers.delays, [KEEP_AWAKE_FALLBACK_MS]);
    assert.equal(KEEP_AWAKE_FALLBACK_MS, 5 * 60_000);
    assert.equal(timers.unrefs, 1, "the fallback must not hold the app open");
    timers.fire();
    assert.equal(keep.held, false);
    assert.deepEqual(log, ["start prevent-app-suspension 1", "stop 1"]);
  });

  it("a fresh run is not stopped by the last one's fallback, and a release disarms it", () => {
    const { blocker, timers } = blockerAndTimers();
    const keep = new KeepAwake(blocker, timers);
    keep.hold();
    keep.armFallback();
    keep.observe({ type: "run.keepawake", payload: { runId: "next" } });
    assert.equal(timers.armed(), 0);
    keep.armFallback();
    keep.release();
    assert.equal(timers.armed(), 0);
    timers.fire();
    assert.equal(keep.held, false);
  });
});

function runsFixture(
  dispatch: (action: unknown, timeoutMs?: number) => Promise<unknown>,
  history: EventEnvelope[] = [],
) {
  const calls: string[] = [];
  const { blocker, timers } = blockerAndTimers();
  const keepAwake = new KeepAwake(blocker, timers);
  const core = {
    host: {
      dispatch: async (action: unknown, timeoutMs?: number) => {
        calls.push(`dispatch ${JSON.stringify(action)} ${timeoutMs}`);
        return dispatch(action, timeoutMs);
      },
    },
    // The core's own stop keeps the user's word for host auto-resume, then dispatches.
    stopRun: async (runId: string, timeoutMs?: number) => {
      calls.push(`stopRun ${runId} ${timeoutMs}`);
      await dispatch({ type: "run_stop", runId }, timeoutMs);
    },
    mainThread: "studio",
    layout: { runs: "/nowhere/runs" },
    runPreviewIdentity: () => null,
  } as unknown as RunsIpcDeps["core"];
  const { handle, invoke } = registrar();
  registerRunsIpc(handle, {
    core,
    keepAwake,
    runSummaryReader: { forProject: async () => history },
  });
  return { invoke, keepAwake, timers, calls };
}

describe("the run controls", () => {
  it("a stop request goes through the core and does not release the blocker: it arms the fallback, with the dispatch bounded to 30 s", async () => {
    const { invoke, keepAwake, timers, calls } = runsFixture(async () => true);
    keepAwake.hold();
    assert.deepEqual(await invoke("studio:run.stop", { runId: "run_1" }), { ok: true, value: true });
    assert.equal(keepAwake.held, true, "the close pass runs after the request");
    assert.equal(timers.armed(), 1);
    assert.deepEqual(calls, ["stopRun run_1 30000"], "the stop goes through the core, which keeps the user's word");
  });

  it("the fallback is armed however the dispatch ends — a wedged harness is exactly the case it exists for", async () => {
    const { invoke, keepAwake, timers } = runsFixture(async () => {
      throw new Error("harness gone");
    });
    keepAwake.hold();
    assert.deepEqual(await invoke("studio:run.stop", { runId: "run_1" }), { ok: false, error: "harness gone" });
    assert.equal(timers.armed(), 1);
  });

  it("a live summary sends only the graph events after the ones the renderer holds", async () => {
    const graph = ["e1", "e2", "e3"].map((id) => ({
      id,
      thread_id: "t",
      turn_id: null,
      session_id: null,
      created_at: id,
      data: { type: "custom", event_type: "director_worker", payload: { runId: "run_1", project: "pong" } },
    })) as EventEnvelope[];
    const { invoke } = runsFixture(async () => true, graph);
    const read = async (graphFrom?: unknown) => {
      const reply = await invoke("studio:run.summary", { project: "pong", runId: "run_1", graphFrom });
      assert.ok(reply.ok);
      const summary = reply.value as { graphEvents?: EventEnvelope[]; graphEventsFrom?: number };
      return [summary.graphEventsFrom, (summary.graphEvents ?? []).map((event) => event.id)];
    };
    assert.deepEqual(await read(), [0, ["e1", "e2", "e3"]]);
    // The held last event comes again, with the compaction tail it has now.
    assert.deepEqual(await read({ count: 2, lastId: "e2" }), [1, ["e2", "e3"]]);
    assert.deepEqual(await read({ count: 3, lastId: "e3" }), [2, ["e3"]]);
    // A cursor that no longer matches, or one the renderer made up, gets everything again.
    for (const cursor of [{ count: 2, lastId: "e9" }, { count: 9, lastId: "e3" }, { count: "2", lastId: "e2" }, "e2"])
      assert.deepEqual(await read(cursor), [0, ["e1", "e2", "e3"]], JSON.stringify(cursor));
  });
});

const claudeIdle: ClaudeLoginState = { revision: 0, phase: "idle", hasBrowserUrl: false };
const codexIdle: CodexLoginState = {
  revision: 0,
  visible: false,
  phase: "idle",
  method: "browser",
  lines: [],
  hasBrowserUrl: false,
};

function loginFixture(
  logins: Record<string, Awaited<ReturnType<SubscriptionEngine["resolveLogin"]>>>,
  busy = false,
  accountsFor: { signedIn?: string[]; emails?: Record<string, string>; noCursor?: boolean } = {},
) {
  const started: string[] = [];
  const accountsRoot = mkdtempSync(path.join(os.tmpdir(), "studio-ipc-accounts-"));
  const signedIn = new Set(accountsFor.signedIn ?? []);
  const engines = new Map<string, SubscriptionEngine>(
    ["claude-code", "codex"].map((id) => [
      id,
      {
        engineHome: `/homes/${id}`,
        systemHome: `/system/${id}`,
        accounts: new SubscriptionAccounts({
          systemHome: `/system/${id}`,
          studioHome: `/homes/${id}`,
          root: path.join(accountsRoot, id),
          signedIn: async (home) => signedIn.has(home),
        }),
        resolveLogin: async () => logins[id] ?? { source: "none", home: null },
        recheckLogin: async () => {
          started.push(`recheck ${id}`);
        },
        runOnAccount: async (account) => {
          started.push(`use ${id} ${account}`);
          return { code: EngineStatusCode.Ready, detail: "" };
        },
        accountEmail: async (home) => {
          started.push(`email ${id} ${home}`);
          return accountsFor.emails?.[home] ?? null;
        },
      },
    ]),
  );
  const deps: LoginIpcDeps = {
    openCodeLogin: {
      start: async () => {
        started.push("opencode");
        return { started: true };
      },
    },
    grokLogin: {
      start: async () => {
        started.push("grok");
        return { started: true };
      },
    },
    cursorLogin: {
      start: async () => {
        started.push("cursor");
        return { started: true };
      },
    },
    cursor: () =>
      accountsFor.noCursor
        ? null
        : {
            signOut: async () => {
              started.push("cursor sign-out");
            },
            status: async () => ({ code: EngineStatusCode.NeedsLogin, detail: "Not signed in to Cursor." }),
          },
    claudeLogin: {
      start: async (home: string | null) => {
        started.push(`claude ${home}`);
        return { started: true };
      },
      snapshot: () => claudeIdle,
      submitCode: async () => claudeIdle,
      openBrowser: async () => {},
      cancel: async () => {},
    },
    codexLogin: {
      start: async (home: string, method?: string) => {
        started.push(`codex ${home} ${method ?? "browser"}`);
        return { ...codexIdle, phase: "waiting" };
      },
      snapshot: () => codexIdle,
      cancel: async () => {
        started.push("codex cancel");
      },
      dismiss: async () => {},
      openBrowser: async () => {},
    },
    subscription: (id) => engines.get(id) ?? null,
    busy: () => busy,
    pushUiEvent: () => {},
  };
  const { handle, invoke } = registrar();
  registerLoginIpc(handle, deps);
  return { invoke, started, engines, accountsRoot, signedIn };
}

describe("a subscription's accounts", () => {
  it("signs one more account in to a fresh home of its own, never over another's", async () => {
    for (const engine of ["claude-code", "codex"]) {
      const { invoke, started, accountsRoot } = loginFixture({});
      await invoke("studio:subscription.signin", { engine, account: "new" });
      const home = path.join(accountsRoot, engine, "account-2");
      assert.equal(started.at(-1), engine === "codex" ? `codex ${home} browser` : `claude ${home}`);
      assert.ok(existsSync(home));
    }
  });

  it("signs Claude in to the Terminal login where the CLI keeps it, and never prepares Codex's own home", async () => {
    const claude = loginFixture({});
    await claude.invoke("studio:subscription.signin", { engine: "claude-code", account: AccountId.Terminal });
    assert.deepEqual(claude.started, ["claude null"]);
    const codex = loginFixture({ codex: { source: "system", home: "/system/codex" } });
    await codex.invoke("studio:subscription.signin", { engine: "codex", account: AccountId.Terminal });
    assert.deepEqual(codex.started, ["codex /homes/codex browser"], "Studio never writes into ~/.codex");
  });

  it("signs in again to the account in use when it is one Studio added, and only then", async () => {
    const logins: Parameters<typeof loginFixture>[0] = {};
    const { invoke, started, accountsRoot } = loginFixture(logins);
    const added = path.join(accountsRoot, "codex", "account-3");
    logins.codex = { source: "isolated", home: added };
    logins["claude-code"] = { source: "isolated", home: "/elsewhere" };
    await invoke("studio:subscription.signin", { engine: "codex" });
    await invoke("studio:subscription.signin", { engine: "claude-code" });
    logins.codex = { source: "isolated", home: "/elsewhere" };
    await invoke("studio:subscription.signin", { engine: "codex" });
    assert.deepEqual(started, [`codex ${added} browser`, "claude /elsewhere", "codex /homes/codex browser"]);
  });

  it("refuses a sign-in to an id that is no account's, and writes nothing", async () => {
    for (const account of ["../x", "/etc", "account-1", "ACCOUNT-2"]) {
      const { invoke, started, accountsRoot } = loginFixture({});
      const answer = await invoke("studio:subscription.signin", { engine: "claude-code", account });
      assert.equal(answer.ok, false, account);
      assert.deepEqual(started, []);
      assert.equal(existsSync(path.join(accountsRoot, "claude-code")), false);
    }
  });

  it("switches accounts through the engine, Codex never while work is in flight", async () => {
    const { invoke, started } = loginFixture({});
    assert.deepEqual(await invoke("studio:subscription.use-account", { engine: "claude-code", account: "studio" }), {
      ok: true,
      value: { code: EngineStatusCode.Ready, detail: "" },
    });
    assert.deepEqual(started, ["use claude-code studio"]);
    const busy = loginFixture({}, true);
    const refused = await busy.invoke("studio:subscription.use-account", { engine: "codex", account: "studio" });
    assert.equal(refused.ok, false);
    assert.deepEqual(busy.started, []);
  });

  it("lists the accounts with each email asked for once and kept", async () => {
    const { invoke, started } = loginFixture({}, false, {
      signedIn: ["/system/claude-code", "/homes/claude-code"],
      emails: { "/homes/claude-code": "me@example.com" },
    });
    const first = await invoke("studio:subscription.accounts", { engine: "claude-code" });
    assert.deepEqual(first, {
      ok: true,
      value: [
        { id: "terminal", email: null, terminal: true, signedIn: true, active: false },
        { id: "studio", email: "me@example.com", terminal: false, signedIn: true, active: true },
      ],
    });
    await invoke("studio:subscription.accounts", { engine: "claude-code" });
    assert.deepEqual(started, ["email claude-code /system/claude-code", "email claude-code /homes/claude-code"]);
  });

  it("never signs the Terminal login out, nor an id that is no account's", async () => {
    for (const account of [AccountId.Terminal, "../../x"]) {
      const { invoke, started } = loginFixture({});
      const answer = await invoke("studio:subscription.forget-studio-login", { engine: "claude-code", account });
      assert.equal(answer.ok, false, account);
      assert.deepEqual(started, []);
    }
  });

  it("forgetting the account in use runs the next signed-in one", async () => {
    const { invoke, engines, signedIn, accountsRoot } = loginFixture({}, false, {
      signedIn: ["/system/claude-code"],
    });
    const accounts = engines.get("claude-code")?.accounts;
    assert.ok(accounts);
    const added = await accounts.newAccount();
    signedIn.add(added.home);
    await accounts.remember(added.id, { email: "work@example.com" });
    await accounts.choose(added.id);
    await invoke("studio:subscription.forget-studio-login", { engine: "claude-code", account: added.id });
    assert.equal(await accounts.chosen(), AccountId.Terminal);
    assert.equal(existsSync(path.join(accountsRoot, "claude-code", added.id)), false);
  });

  it("never shows a forgotten account's email on the next account given its id", async () => {
    const emails: Record<string, string> = {};
    const { invoke, engines, signedIn } = loginFixture({}, false, { signedIn: ["/system/claude-code"], emails });
    const engine = engines.get("claude-code");
    assert.ok(engine);
    const first = await engine.accounts.newAccount();
    signedIn.add(first.home);
    await settleSignIn(engine, first.home);
    // Its CLI names the email only later, when the list asks.
    emails[first.home] = "old@example.com";
    const listed = async () => {
      const answer = await invoke("studio:subscription.accounts", { engine: "claude-code" });
      assert.ok(answer.ok);
      return (answer.value as { id: string; email: string | null }[]).find((entry) => entry.id === first.id)?.email;
    };
    assert.equal(await listed(), "old@example.com");
    await invoke("studio:subscription.forget-studio-login", { engine: "claude-code", account: first.id });
    const next = await engine.accounts.newAccount();
    assert.equal(next.id, first.id, "a forgotten account's id is given again");
    signedIn.add(next.home);
    delete emails[next.home];
    await settleSignIn(engine, next.home);
    assert.equal(await listed(), null, "the new person's CLI reports no email, so none shows");
  });

  it("a finished sign-in remembers its account with its email and runs on it", async () => {
    const { engines, signedIn, started } = loginFixture({}, false, { signedIn: ["/system/codex"] });
    const engine = engines.get("codex");
    assert.ok(engine);
    const added = await engine.accounts.newAccount();
    signedIn.add(added.home);
    await settleSignIn(engine, added.home, "work@example.com");
    assert.equal(await engine.accounts.chosen(), added.id);
    const listed = (await engine.accounts.list()).find((entry) => entry.id === added.id);
    assert.equal(listed?.email, "work@example.com");
    assert.deepEqual(started, ["recheck codex"]);
  });
});

describe("both sign-in paths go through the controllers", () => {
  it("Claude signs in to the studio's own home, the env home, or the Mac-wide login, as the engine resolves it", async () => {
    for (const [login, expected] of [
      [{ source: "isolated", home: "/homes/claude-code" }, "claude /homes/claude-code"],
      [{ source: "env", home: "/custom" }, "claude /custom"],
      [{ source: "system", home: null }, "claude null"],
    ] as const) {
      const { invoke, started } = loginFixture({ "claude-code": login });
      assert.deepEqual(await invoke("studio:subscription.signin", {}), { ok: true, value: { started: true } });
      assert.deepEqual(started, [expected]);
    }
    const { invoke, started } = loginFixture({ "claude-code": { source: "system", home: null } });
    await invoke("studio:subscription.signin", { engine: "claude-code", separate: true });
    assert.deepEqual(
      started,
      ["claude /homes/claude-code"],
      "a separate account always signs in to the studio's own home",
    );
  });

  it("Codex signs in through its controller, and never while a run or a turn is in flight", async () => {
    const { invoke, started } = loginFixture({});
    assert.deepEqual(await invoke("studio:subscription.signin", { engine: "codex" }), {
      ok: true,
      value: { started: true, error: undefined },
    });
    await invoke("studio:codex-login.retry", { method: "device" });
    assert.deepEqual(started, ["codex /homes/codex browser", "codex cancel", "codex /homes/codex device"]);
    const refused = loginFixture({}, true);
    assert.deepEqual(await refused.invoke("studio:subscription.signin", { engine: "codex" }), {
      ok: false,
      error: "Finish or stop the active work before changing the ChatGPT connection.",
    });
    assert.deepEqual(refused.started, []);
  });

  it("OpenCode signs in through its own CLI in the terminal, whatever else is running", async () => {
    const { invoke, started } = loginFixture({}, true);
    assert.deepEqual(await invoke("studio:opencode.signin"), { ok: true, value: { started: true } });
    assert.deepEqual(started, ["opencode"]);
  });

  it("Cursor signs in through its own CLI in its row's terminal, whatever else is running, and signs out through its engine", async () => {
    const { invoke, started } = loginFixture({}, true);
    assert.deepEqual(await invoke("studio:cursor.signin"), { ok: true, value: { started: true } });
    assert.deepEqual(await invoke("studio:cursor.signout"), {
      ok: true,
      value: { code: EngineStatusCode.NeedsLogin, detail: "Not signed in to Cursor." },
    });
    assert.deepEqual(started, ["cursor", "cursor sign-out"]);
    const none = loginFixture({}, false, { noCursor: true });
    assert.equal((await none.invoke("studio:cursor.signout")).ok, false, "no Cursor engine, nothing to sign out");
  });

  it("the Cursor sign-in runs `cursor-agent login` keeping its sign-in in its file, and rechecks when it ends", async () => {
    const opened: Array<{ file: string; args: string[]; kind: string; env: NodeJS.ProcessEnv }> = [];
    let exit: ((code: number) => void) | undefined;
    let signedIn = 0;
    const { cursorLogin } = createLoginControllers({
      terminals: {
        open: (launch) => {
          opened.push(launch);
          exit = launch.onExit;
          return { id: "t1", title: launch.title, kind: launch.kind, phase: "running" };
        },
        stop: async () => {},
      },
      openExternal: async () => {},
      subscription: () => null,
      pushUiEvent: () => {},
      showCodexState: () => {},
      showClaudeState: () => {},
      onCursorSignedIn: async () => {
        signedIn++;
      },
      requireCli: async (provider) => ({
        path: `/bin/${provider}`,
        env: { PATH: "/bin", OPENCODE_CONFIG: "/oc.json", CURSOR_API_KEY: "key_not_for_genex" },
        status: {
          provider,
          state: "ready",
          selection: "automatic",
          path: `/bin/${provider}`,
          detail: "",
          guidanceUrl: "",
        },
      }),
    });
    assert.deepEqual(await cursorLogin.start(), { started: true });
    assert.equal(opened[0]?.file, "/bin/cursor");
    assert.deepEqual(opened[0]?.args, ["login"]);
    assert.equal(opened[0]?.kind, "cursor-login");
    assert.equal(opened[0]?.env.AGENT_CLI_CREDENTIAL_STORE, "file", "the sign-in every sandboxed session can read");
    assert.equal(opened[0]?.env.OPENCODE_CONFIG, undefined, "no other vendor's variables reach the sign-in");
    assert.equal(opened[0]?.env.CURSOR_API_KEY, undefined, "nor a key: the person signs in with their account");
    exit?.(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(signedIn, 1);
  });

  it("the OpenCode sign-in runs `opencode auth login` in the terminal, and rechecks its models when it ends", async () => {
    const opened: Array<{ file: string; args: string[]; kind: string; env: NodeJS.ProcessEnv }> = [];
    let exit: ((code: number) => void) | undefined;
    let signedIn = 0;
    const { openCodeLogin } = createLoginControllers({
      terminals: {
        open: (launch) => {
          opened.push(launch);
          exit = launch.onExit;
          return { id: "t1", title: launch.title, kind: launch.kind, phase: "running" };
        },
        stop: async () => {},
      },
      openExternal: async () => {},
      subscription: () => null,
      pushUiEvent: () => {},
      showCodexState: () => {},
      showClaudeState: () => {},
      onOpenCodeSignedIn: async () => {
        signedIn++;
      },
      requireCli: async (provider) => ({
        path: `/bin/${provider}`,
        env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-not-for-opencode", OPENCODE_CONFIG: "/oc.json" },
        status: {
          provider,
          state: "ready",
          selection: "automatic",
          path: `/bin/${provider}`,
          detail: "",
          guidanceUrl: "",
        },
      }),
    });
    assert.deepEqual(await openCodeLogin.start(), { started: true });
    assert.equal(opened[0]?.file, "/bin/opencode");
    assert.deepEqual(opened[0]?.args, ["auth", "login"]);
    assert.equal(opened[0]?.kind, "opencode-login");
    assert.equal(opened[0]?.env.ANTHROPIC_API_KEY, undefined, "no other vendor's key reaches the sign-in");
    assert.equal(opened[0]?.env.OPENCODE_CONFIG, "/oc.json");
    assert.equal(
      opened[0]?.env.OPENCODE_DISABLE_MODELS_FETCH,
      "1",
      "the provider list never waits on a catalog download that can stall",
    );
    exit?.(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(signedIn, 1);

    const missing = createLoginControllers({
      terminals: {
        open: () => {
          throw new Error("no terminal without a CLI");
        },
        stop: async () => {},
      },
      openExternal: async () => {},
      subscription: () => null,
      pushUiEvent: () => {},
      showCodexState: () => {},
      showClaudeState: () => {},
      requireCli: async () => {
        throw new Error("opencode is not installed");
      },
    });
    assert.deepEqual(await missing.openCodeLogin.start(), { started: false, missingCli: true });
  });

  it("Grok Build signs in through its own CLI in the terminal, whatever else is running", async () => {
    const { invoke, started } = loginFixture({}, true);
    assert.deepEqual(await invoke("studio:grok.signin"), { ok: true, value: { started: true } });
    assert.deepEqual(started, ["grok"]);
  });

  it("the Grok Build sign-in runs `grok login` in the terminal, on its own home, and rechecks it when it ends", async () => {
    const opened: Array<{ file: string; args: string[]; kind: string; env: NodeJS.ProcessEnv }> = [];
    let exit: ((code: number) => void) | undefined;
    let signedIn = 0;
    const { grokLogin } = createLoginControllers({
      terminals: {
        open: (launch) => {
          opened.push(launch);
          exit = launch.onExit;
          return { id: "t3", title: launch.title, kind: launch.kind, phase: "running" };
        },
        stop: async () => {},
      },
      openExternal: async () => {},
      subscription: () => null,
      pushUiEvent: () => {},
      showCodexState: () => {},
      showClaudeState: () => {},
      onGrokSignedIn: async () => {
        signedIn++;
      },
      requireCli: async (provider) => ({
        path: `/bin/${provider}`,
        env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-not-for-grok", XAI_API_KEY: "xai-not-for-grok" },
        status: {
          provider,
          state: "ready",
          selection: "automatic",
          path: `/bin/${provider}`,
          detail: "",
          guidanceUrl: "",
        },
      }),
    });
    assert.deepEqual(await grokLogin.start(), { started: true });
    assert.equal(opened[0]?.file, "/bin/grok");
    assert.deepEqual(opened[0]?.args, ["login"]);
    assert.equal(opened[0]?.kind, "grok-login");
    assert.equal(opened[0]?.env.ANTHROPIC_API_KEY, undefined, "no other vendor's key reaches the sign-in");
    assert.equal(opened[0]?.env.XAI_API_KEY, undefined, "an xAI key never stands in for the Grok sign-in");
    assert.ok(opened[0]?.env.GROK_HOME, "the home its sessions read the sign-in from");
    exit?.(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(signedIn, 1);
  });

  it("on OpenCode 2.x the sign-in runs on a server of its own, never the shared background one", async () => {
    const v2: Array<{ args: string[] }> = [];
    const { openCodeLogin: v2Login } = createLoginControllers({
      terminals: {
        open: (launch) => {
          v2.push(launch);
          return { id: "t2", title: launch.title, kind: launch.kind, phase: "running" };
        },
        stop: async () => {},
      },
      openExternal: async () => {},
      subscription: () => null,
      pushUiEvent: () => {},
      showCodexState: () => {},
      showClaudeState: () => {},
      requireCli: async (provider) => ({
        path: `/bin/${provider}`,
        env: { PATH: "/bin" },
        status: {
          provider,
          state: "ready",
          selection: "automatic",
          path: `/bin/${provider}`,
          version: "opencode v2.0.20",
          detail: "",
          guidanceUrl: "",
        },
      }),
    });
    await v2Login.start();
    assert.deepEqual(
      v2[0]?.args,
      ["auth", "login", "--standalone"],
      "2.x signs in on a server of its own, never by starting the shared background one",
    );
  });

  it("an unknown engine is refused", async () => {
    const { invoke } = loginFixture({});
    assert.deepEqual(await invoke("studio:subscription.signin", { engine: "nope" }), {
      ok: false,
      error: "unknown subscription engine: nope",
    });
  });

  it("each controller resolves the executable the SDK spawns for its own provider", async () => {
    const asked: string[] = [];
    const { claudeLogin, codexLogin } = createLoginControllers({
      terminals: {
        open: () => {
          throw new Error("no terminal in this test");
        },
        stop: async () => {},
      },
      openExternal: async () => {},
      subscription: () => null,
      pushUiEvent: () => {},
      showCodexState: () => {},
      showClaudeState: () => {},
      requireCli: async (provider) => {
        asked.push(provider);
        throw new Error(`${provider} is not installed`);
      },
      findBinary: async () => {
        throw new Error("the installation is resolved first");
      },
    });
    assert.deepEqual(await claudeLogin.start(null), { started: false, error: "claude-code is not installed" });
    await codexLogin.start("/homes/codex");
    assert.deepEqual(asked, ["claude-code", "codex"]);
  });
});

describe("local model hardware in isolated acceptance", () => {
  it("uses the supplied machine and its catalog without detecting the host", async () => {
    const hardware: HardwareInfo = {
      cpu: "Fixture Apple Silicon",
      ramBytes: 32 * 1024 ** 3,
      ramGb: 32,
      usableModelGb: 23,
      platform: "darwin",
      arch: "arm64",
      appleSilicon: true,
    };
    const report = { hardware, recommendation: await recommendModels(hardware) };
    let reads = 0;
    const core = { engines: {} } as ModelsIpcDeps["core"];
    const { handle, invoke } = registrar();
    registerModelsIpc(handle, {
      core,
      subscription: () => null,
      pushUiEvent: () => {},
      openRouterLogin: noSignIn,
      readHardware: async () => {
        reads++;
        return report;
      },
      usage: noUsage,
    });
    assert.deepEqual(await invoke("studio:hardware"), { ok: true, value: report });
    assert.equal(reads, 1);
    for (const model of ["bonsai-2:27b-pq2_0", "bonsai-2:27b-ptq1_0"])
      assert.ok(report.recommendation.picks.some((pick) => pick.model === model && pick.fits));
  });
});

describe("the composer's plan limits", () => {
  it("answer with the limits as they stand at once, and push each subscription's fresh read", async () => {
    const usage = {
      measuredAt: "2026-09-24T00:00:00.000Z",
      windows: [{ id: "five_hour", label: "5-hour limit", percent: 12 }],
    };
    const pushed: ProviderUsageReport[][] = [];
    let answer: (value: typeof usage) => void = () => {};
    const service = createProviderUsage({
      engines: ["claude-code"],
      source: () => ({
        status: async () => ({ code: "ready" }),
        account: async () => "terminal",
        readUsage: () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      }),
      push: (reports) => pushed.push(reports),
    });
    const core = { engines: { has: () => false, get: () => null } } as unknown as ModelsIpcDeps["core"];
    const { handle, invoke } = registrar();
    registerModelsIpc(handle, {
      core,
      subscription: () => null,
      pushUiEvent: () => {},
      openRouterLogin: noSignIn,
      usage: service,
    });
    assert.deepEqual(await invoke("studio:provider-usage"), { ok: true, value: [] }, "the panel never waits on a read");
    while (!pushed.some((reports) => reports[0]?.state === UsageState.Checking)) await tick();
    answer(usage);
    while (!pushed.some((reports) => reports[0]?.state === UsageState.Ready)) await tick();
    assert.deepEqual(await invoke("studio:provider-usage"), {
      ok: true,
      value: [{ engine: "claude-code", state: UsageState.Ready, account: "terminal", usage }],
    });
  });
});

describe("notifications reach the person outside the window", () => {
  function notificationsRig(supported = true) {
    const { handle, invoke } = registrar();
    const created: Array<{
      options: { title: string; subtitle?: string; body: string };
      listeners: Map<string, () => void>;
      shown: number;
    }> = [];
    const log: string[] = [];
    const events: UiEvent[] = [];
    let minimized = true;
    const window = {
      isDestroyed: () => false,
      isMinimized: () => minimized,
      restore: () => {
        log.push("restore");
        minimized = false;
      },
      show: () => log.push("show"),
      focus: () => log.push("focus"),
    };
    registerNotificationsIpc(handle, {
      notifications: {
        isSupported: () => supported,
        create: (options) => {
          const note = { options, listeners: new Map<string, () => void>(), shown: 0 };
          created.push(note);
          return {
            on: (event, listener) => note.listeners.set(event, listener),
            show: () => {
              note.shown++;
            },
          };
        },
      },
      window: () => window,
      setDockBadge: (text) => log.push(`badge ${JSON.stringify(text)}`),
      pushUiEvent: (event) => events.push(event),
    });
    return { invoke, created, log, events };
  }

  it("a note is shown clipped, and its click brings the window forward and opens the row it names", async () => {
    const { invoke, created, log, events } = notificationsRig();
    assert.deepEqual(
      await invoke("studio:notify", {
        id: "run:1",
        title: "t".repeat(200),
        subtitle: "Lunar garden",
        body: "b".repeat(400),
      }),
      { ok: true, value: true },
    );
    assert.equal(created.length, 1);
    assert.equal(created[0]!.shown, 1);
    assert.deepEqual(
      [created[0]!.options.title.length, created[0]!.options.subtitle, created[0]!.options.body.length],
      [120, "Lunar garden", 240],
    );
    created[0]!.listeners.get("click")!();
    assert.deepEqual(log, ["restore", "show", "focus"]);
    assert.deepEqual(events, [{ type: "notification.open", payload: { id: "run:1" } }]);
  });

  it("a note without an id opens nothing, and an unsupported system shows none", async () => {
    const quiet = notificationsRig();
    await invoke(quiet, { title: "Done", body: "The build finished." });
    quiet.created[0]!.listeners.get("click")!();
    assert.deepEqual(quiet.events, []);
    const unsupported = notificationsRig(false);
    assert.deepEqual(await unsupported.invoke("studio:notify", { title: "Done", body: "x" }), {
      ok: true,
      value: false,
    });
    assert.equal(unsupported.created.length, 0);
    function invoke(rig: ReturnType<typeof notificationsRig>, payload: unknown) {
      return rig.invoke("studio:notify", payload);
    }
  });

  it("the Dock badge shows whole counts up to 99 and clears for none or nonsense", async () => {
    const { invoke, log } = notificationsRig();
    for (const count of [3, 250, 0, -4, 2.7, "x"]) await invoke("studio:badge", { count });
    assert.deepEqual(log, ['badge "3"', 'badge "99"', 'badge ""', 'badge ""', 'badge "2"', 'badge ""']);
    assert.equal(badgeText(Number.NaN), "");
  });
});

it("model refresh validates provider identities before invoking discovery", async () => {
  const { EngineRegistry } = await import("../../src/substrate/engines/registry.ts");
  let calls = 0;
  const engines = new EngineRegistry();
  engines.register({
    id: "codex",
    label: "Codex",
    kind: "delegated",
    models: async () => [],
    status: async () => ({ code: "ready", detail: "" }),
    refreshModels: async (force) => {
      assert.equal(force, true);
      calls++;
    },
  });
  // Only the registrar's engine registry is needed; no profile or credentials are opened.
  const core = { engines, fastDecisions: noFastDecisions };
  const { handle, invoke } = registrar();
  registerModelsIpc(handle, {
    core,
    subscription: () => null,
    pushUiEvent: () => {},
    openRouterLogin: noSignIn,
    usage: noUsage,
  });
  for (const provider of [undefined, null, 7, {}, "../codex", "ollama", ""]) {
    assert.equal((await invoke("studio:models.refresh", { provider })).ok, false);
    assert.equal(calls, 0);
  }
  assert.deepEqual(await invoke("studio:models.refresh", { provider: "codex" }), { ok: true, value: true });
  assert.equal(calls, 1);
});

it("storage is measured and freed for one game named as one, or for every game", async () => {
  const calls: string[] = [];
  const space = { bytes: { copies: 3, pictures: 2, history: 1 } };
  const freed = { freedBytes: 6, skipped: [] };
  const core = {
    storageSpace: async (project?: string) => {
      calls.push(`space ${project ?? "every game"}`);
      return space;
    },
    freeStorage: async (project?: string) => {
      calls.push(`free ${project ?? "every game"}`);
      return freed;
    },
  };
  const { handle, invoke } = registrar();
  registerStorageIpc(handle, { core });
  for (const payload of [{ project: 1 }, { project: null }, { project: "../x" }, { project: "" }, { project: "A b" }])
    for (const channel of ["studio:storage", "studio:storage.free"])
      assert.equal((await invoke(channel, payload)).ok, false, `${channel} ${JSON.stringify(payload)}`);
  assert.deepEqual(calls, [], "nothing was asked of the core");
  assert.deepEqual(await invoke("studio:storage", { project: "pond" }), { ok: true, value: space });
  assert.deepEqual(await invoke("studio:storage.free", { project: "pond" }), { ok: true, value: freed });
  assert.deepEqual(await invoke("studio:storage", {}), { ok: true, value: space });
  assert.deepEqual(await invoke("studio:storage.free", undefined), { ok: true, value: freed });
  assert.deepEqual(calls, ["space pond", "free pond", "space every game", "free every game"]);
});

/** The jobs registrar over a core that records each Stop and an `openExternal` that records each URL. */
function jobsRig() {
  const stops: string[] = [];
  const opened: string[] = [];
  const core = {
    stopJob: async (project: string, jobId: string) => {
      stops.push(`${project} ${jobId}`);
      return null;
    },
  };
  const { handle, invoke } = registrar();
  registerJobsIpc(handle, {
    core,
    openExternal: async (url: string) => {
      opened.push(url);
    },
  });
  return { stops, opened, invoke };
}

it("opening Privacy settings opens only the two panes it knows", async () => {
  const { opened, invoke } = jobsRig();
  for (const payload of [undefined, null, {}, { pane: "x" }, { pane: "" }, { pane: "screen?evil" }, { pane: {} }])
    assert.equal((await invoke("studio:app-look.open-settings", payload)).ok, false, JSON.stringify(payload));
  assert.deepEqual(opened, [], "nothing was opened");
  assert.deepEqual(await invoke("studio:app-look.open-settings", { pane: "screen" }), { ok: true, value: true });
  assert.deepEqual(await invoke("studio:app-look.open-settings", { pane: "accessibility" }), { ok: true, value: true });
  assert.deepEqual(opened, [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  ]);
});

it("a job's Stop reaches the core only with a game and a job named as text", async () => {
  const { stops, invoke } = jobsRig();
  for (const payload of [undefined, null, {}, { project: "pond" }, { jobId: "j" }, { project: 1, jobId: "j" }])
    assert.equal((await invoke("studio:jobs.stop", payload)).ok, false, JSON.stringify(payload));
  assert.deepEqual(stops, [], "nothing was asked of the core");
  assert.deepEqual(await invoke("studio:jobs.stop", { project: "pond", jobId: "j" }), { ok: true, value: null });
  assert.deepEqual(stops, ["pond j"]);
});

it("model refresh and recheck reach OpenCode and OpenRouter, which have no subscription sign-in", async () => {
  const { EngineRegistry } = await import("../../src/substrate/engines/registry.ts");
  const refreshed: string[] = [];
  const engines = new EngineRegistry();
  for (const id of ["opencode", "openrouter"])
    engines.register({
      id,
      label: id,
      kind: id === "opencode" ? "delegated" : "direct",
      models: async () => [],
      status: async () => ({ code: "ready", detail: "" }),
      refreshModels: async (force) => {
        refreshed.push(`${id} ${force}`);
      },
    });
  const events: UiEvent[] = [];
  const { handle, invoke } = registrar();
  registerModelsIpc(handle, {
    core: { engines, fastDecisions: noFastDecisions },
    subscription: () => null,
    usage: noUsage,
    pushUiEvent: (event) => events.push(event),
    openRouterLogin: noSignIn,
  });
  assert.deepEqual(await invoke("studio:models.refresh", { provider: "opencode" }), { ok: true, value: true });
  assert.deepEqual(await invoke("studio:engines.recheck", { engine: "openrouter" }), { ok: true, value: true });
  assert.deepEqual(refreshed, ["opencode true", "openrouter true"]);
  assert.deepEqual(events, [{ type: "engines.changed", payload: {} }]);
});

/** A browser sign-in that is never started: the registrars under test do not reach it. */
/** No subscription's limits: the tests that use it never ask for them. */
/** No TypeSafe key: the fast decision model is optional, and these tests never reach TypeSafe. */
const noFastDecisions = new FastDecisions(memoryKeyStore());
const noUsage: ModelsIpcDeps["usage"] = { snapshot: () => [], refresh: async () => {} };

const noSignIn: ModelsIpcDeps["openRouterLogin"] = {
  start: async () => {
    throw new Error("no browser sign-in in this test");
  },
  reopen: async () => false,
  cancel: () => false,
};

/** The status code an engine-status answer carries. */
const statusCode = (value: unknown): unknown => (value as { code?: unknown } | null)?.code;

it("the OpenRouter key is saved and forgotten through the engine, and only its status comes back", async () => {
  const { EngineRegistry } = await import("../../src/substrate/engines/registry.ts");
  const { OpenRouterEngine } = await import("../../src/substrate/engines/openrouter.ts");
  const { memoryKeyStore } = await import("../../src/substrate/provider-keys.ts");
  const { tmpDir } = await import("../helpers/tmp.ts");
  const { startFakeOpenRouter, GOOD_KEY } = await import("../helpers/fake-openrouter.ts");
  const server = await startFakeOpenRouter();
  try {
    const keys = memoryKeyStore(null);
    const engines = new EngineRegistry();
    engines.register(new OpenRouterEngine({ root: await tmpDir("ipc-openrouter-"), keys, baseUrl: server.baseUrl }));
    const events: UiEvent[] = [];
    const { handle, invoke } = registrar();
    registerModelsIpc(handle, {
      core: { engines, fastDecisions: noFastDecisions },
      subscription: () => null,
      usage: noUsage,
      pushUiEvent: (event) => events.push(event),
      openRouterLogin: noSignIn,
    });
    // Hostile payloads: nothing is kept, and no answer ever carries a key.
    for (const payload of [
      undefined,
      null,
      {},
      { key: 7 },
      { key: "" },
      { key: `${GOOD_KEY}\nX: 1` },
      { key: "x".repeat(5000) },
    ]) {
      const answer = await invoke("studio:openrouter.key.save", payload);
      assert.equal(answer.ok && statusCode(answer.value), "needs_login", JSON.stringify(payload)?.slice(0, 40));
      assert.equal(await keys.read(), null);
    }
    const saved = await invoke("studio:openrouter.key.save", { key: GOOD_KEY });
    assert.equal(saved.ok && statusCode(saved.value), "ready");
    assert.doesNotMatch(JSON.stringify(saved), /0123456789abcdef/);
    assert.equal(await keys.read(), GOOD_KEY);
    const cleared = await invoke("studio:openrouter.key.clear");
    assert.equal(cleared.ok && statusCode(cleared.value), "needs_login");
    assert.equal(await keys.read(), null);
    assert.ok(events.every((event) => event.type === "engines.changed"));
    assert.equal(events.length, 9);
  } finally {
    await server.close();
  }
});

it("the Opper key is saved and forgotten through the engine, and only its status comes back", async () => {
  const { EngineRegistry } = await import("../../src/substrate/engines/registry.ts");
  const { OpperEngine } = await import("../../src/substrate/engines/opper.ts");
  const { memoryKeyStore } = await import("../../src/substrate/provider-keys.ts");
  const { tmpDir } = await import("../helpers/tmp.ts");
  const { startFakeOpper, GOOD_KEY } = await import("../helpers/fake-opper.ts");
  const server = await startFakeOpper();
  try {
    const keys = memoryKeyStore(null);
    const engines = new EngineRegistry();
    engines.register(new OpperEngine({ root: await tmpDir("ipc-opper-"), keys, baseUrl: server.baseUrl }));
    const events: UiEvent[] = [];
    const { handle, invoke } = registrar();
    registerModelsIpc(handle, {
      core: { engines, fastDecisions: noFastDecisions },
      subscription: () => null,
      usage: noUsage,
      pushUiEvent: (event) => events.push(event),
      openRouterLogin: noSignIn,
    });
    // Hostile payloads: nothing is kept, and no answer ever carries a key.
    for (const payload of [
      undefined,
      null,
      {},
      { key: 7 },
      { key: "" },
      { key: `${GOOD_KEY}\nX: 1` },
      { key: "x".repeat(5000) },
    ]) {
      const answer = await invoke("studio:opper.key.save", payload);
      assert.equal(answer.ok && statusCode(answer.value), "needs_login", JSON.stringify(payload)?.slice(0, 40));
      assert.equal(await keys.read(), null);
    }
    const saved = await invoke("studio:opper.key.save", { key: GOOD_KEY });
    assert.equal(saved.ok && statusCode(saved.value), "ready");
    assert.doesNotMatch(JSON.stringify(saved), /0123456789abcdef/);
    assert.equal(await keys.read(), GOOD_KEY);
    const cleared = await invoke("studio:opper.key.clear");
    assert.equal(cleared.ok && statusCode(cleared.value), "needs_login");
    assert.equal(await keys.read(), null);
    assert.ok(events.every((event) => event.type === "engines.changed"));
    assert.deepEqual(events.at(-1), { type: "engines.changed", payload: { engine: "opper" } }, "the change is Opper's");
    assert.equal(events.length, 9);
  } finally {
    await server.close();
  }
});

it("the browser sign-in hands its key to the engine, and only how it ended comes back", async () => {
  const { EngineRegistry } = await import("../../src/substrate/engines/registry.ts");
  const { OpenRouterEngine } = await import("../../src/substrate/engines/openrouter.ts");
  const { memoryKeyStore } = await import("../../src/substrate/provider-keys.ts");
  const { tmpDir } = await import("../helpers/tmp.ts");
  const { startFakeOpenRouter, GOOD_KEY } = await import("../helpers/fake-openrouter.ts");
  const server = await startFakeOpenRouter();
  try {
    const keys = memoryKeyStore(null);
    const engines = new EngineRegistry();
    engines.register(new OpenRouterEngine({ root: await tmpDir("ipc-openrouter-"), keys, baseUrl: server.baseUrl }));
    const events: UiEvent[] = [];
    const calls: string[] = [];
    // The browser sign-in itself is `openrouter-login.test.ts`; here it returns with this key at once.
    const returning = (key: string): ModelsIpcDeps["openRouterLogin"] => ({
      start: async (saveKey) => {
        calls.push("start");
        const status = await saveKey(key);
        return status.code === "ready"
          ? { outcome: "connected" }
          : { outcome: "failed", error: status.detail, problem: OpenRouterSignInProblem.KeyRefused };
      },
      reopen: async () => {
        calls.push("reopen");
        return true;
      },
      cancel: () => {
        calls.push("cancel");
        return true;
      },
    });
    const { handle, invoke } = registrar();
    let login = returning("sk-or-v1-refused-refused-refused");
    registerModelsIpc(handle, {
      core: { engines, fastDecisions: noFastDecisions },
      subscription: () => null,
      usage: noUsage,
      pushUiEvent: (event) => events.push(event),
      openRouterLogin: {
        start: (saveKey) => login.start(saveKey),
        reopen: () => login.reopen(),
        cancel: () => login.cancel(),
      },
    });
    const refused = await invoke("studio:openrouter.signin");
    assert.equal(refused.ok && (refused.value as { outcome?: string }).outcome, "failed");
    assert.equal(await keys.read(), null, "a key OpenRouter refuses is not kept");
    login = returning(GOOD_KEY);
    const connected = await invoke("studio:openrouter.signin");
    assert.deepEqual(connected, { ok: true, value: { outcome: "connected" } });
    assert.equal(await keys.read(), GOOD_KEY);
    assert.deepEqual(await invoke("studio:openrouter.signin.reopen"), { ok: true, value: true });
    assert.deepEqual(await invoke("studio:openrouter.signin.cancel"), { ok: true, value: true });
    assert.deepEqual(calls, ["start", "start", "reopen", "cancel"]);
    assert.deepEqual(
      events.map((event) => event.type),
      ["engines.changed", "engines.changed"],
      "each sign-in that ends says the engines changed",
    );
  } finally {
    await server.close();
  }
});

it("an Ollama download that fails rejects with why, as a code, never with the server's words", async () => {
  let failure: unknown = null;
  const ollama = {
    client: {
      // biome-ignore lint/correctness/useYield: the pull fails before its first step
      pull: async function* () {
        throw failure;
      },
    },
  };
  const core = {
    engines: { has: (id: string) => id === "ollama", get: () => ollama },
  } as unknown as ModelsIpcDeps["core"];
  const { handle, invoke } = registrar();
  registerModelsIpc(handle, {
    core,
    subscription: () => null,
    usage: noUsage,
    pushUiEvent: () => undefined,
    openRouterLogin: noSignIn,
  });
  const failures: ReadonlyArray<[unknown, ModelPullProblem]> = [
    [
      new EngineError(EngineFailureKind.Unavailable, "ollama", "Ollama isn't running at http://10.0.0.7:11434"),
      ModelPullProblem.Unavailable,
    ],
    [
      new EngineError(EngineFailureKind.Other, "ollama", "pull model manifest: file does not exist"),
      ModelPullProblem.Refused,
    ],
    [Object.assign(new TypeError("terminated"), { code: "ECONNRESET" }), ModelPullProblem.Interrupted],
  ];
  for (const [thrown, problem] of failures) {
    failure = thrown;
    const result = await invoke("studio:pull-model", { model: "gemma4:12b" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.code, problem, String(thrown));
  }
});

it("deleting a model asks the local engine that owns it and announces the change", async () => {
  const removed: string[] = [];
  const events: UiEvent[] = [];
  const engines: Record<string, { removeModel?(id: string): Promise<void> }> = {
    bonsai: { removeModel: async (id) => void removed.push(`bonsai ${id}`) },
    ollama: { removeModel: async (id) => void removed.push(`ollama ${id}`) },
  };
  const core = {
    engines: { has: (id: string) => id in engines, get: (id: string) => engines[id] },
  } as unknown as ModelsIpcDeps["core"];
  const { handle, invoke } = registrar();
  registerModelsIpc(handle, {
    core,
    subscription: () => null,
    usage: noUsage,
    pushUiEvent: (event) => events.push(event),
    openRouterLogin: noSignIn,
  });
  assert.deepEqual(await invoke("studio:models.remove", { model: "bonsai-2:27b-ptq1_0" }), { ok: true, value: true });
  assert.deepEqual(await invoke("studio:models.remove", { model: "gemma4:12b" }), { ok: true, value: true });
  assert.deepEqual(removed, ["bonsai bonsai-2:27b-ptq1_0", "ollama gemma4:12b"]);
  assert.deepEqual(events, [
    { type: "engines.changed", payload: { engine: "bonsai" } },
    { type: "engines.changed", payload: { engine: "ollama" } },
  ]);
  for (const payload of [undefined, null, {}, { model: 7 }, { model: "" }, { model: ["gemma4:12b"] }]) {
    assert.equal((await invoke("studio:models.remove", payload)).ok, false, JSON.stringify(payload));
  }
  delete engines.ollama;
  engines.bonsai = {};
  for (const model of ["gemma4:12b", "bonsai-2:27b-ptq1_0"]) {
    assert.equal((await invoke("studio:models.remove", { model })).ok, false, `${model} has no engine to delete it`);
  }
  assert.equal(removed.length, 2, "a refused delete asks no engine");
  assert.equal(events.length, 2, "and announces nothing");
});

it("raising a model's context asks Ollama for the copy, announces it and answers its id", async () => {
  const asked: string[] = [];
  const events: UiEvent[] = [];
  const engines: Record<string, { raiseContext?(id: string): Promise<string> }> = {
    ollama: { raiseContext: async (id) => (asked.push(id), `${id}-16k`) },
  };
  const core = {
    engines: { has: (id: string) => id in engines, get: (id: string) => engines[id] },
  } as unknown as ModelsIpcDeps["core"];
  const { handle, invoke } = registrar();
  registerModelsIpc(handle, {
    core,
    subscription: () => null,
    usage: noUsage,
    pushUiEvent: (event) => events.push(event),
    openRouterLogin: noSignIn,
  });
  assert.deepEqual(await invoke("studio:models.raise-context", { model: "qwen3:8b" }), {
    ok: true,
    value: "qwen3:8b-16k",
  });
  assert.deepEqual(events, [{ type: "engines.changed", payload: { engine: "ollama" } }]);
  for (const payload of [undefined, null, {}, { model: 7 }, { model: "" }, { model: ["qwen3:8b"] }]) {
    assert.equal((await invoke("studio:models.raise-context", payload)).ok, false, JSON.stringify(payload));
  }
  delete engines.ollama;
  assert.equal((await invoke("studio:models.raise-context", { model: "qwen3:8b" })).ok, false, "no Ollama, no copy");
  assert.deepEqual(asked, ["qwen3:8b"], "a refused call asks no engine");
  assert.equal(events.length, 1, "and announces nothing");
});

describe("the in-window update prompt", () => {
  /** The update channels over a recorded announcer, in a live or a fixture profile. */
  function updateRig(fixture: boolean) {
    const listeners = new Map<string, Listener>();
    const handle = createIpcHandle(
      { handle: (channel, listener) => listeners.set(channel, listener) },
      {
        fixture,
        isStudioUi: () => true,
      },
    );
    const restarts: string[] = [];
    registerUpdateIpc(handle, {
      updates: {
        ready: () => ({ version: "0.2.0", action: UpdateAction.Restart }),
        restart: async () => {
          restarts.push("restart");
          return RestartAnswer.Relaunching;
        },
        download: () => {
          restarts.push("download");
          return true;
        },
      },
      check: async () => ({ status: UpdateCheckStatus.Off, current: "0.1.0", update: null }),
      about: () => ({ version: "0.1.0", platform: "darwin", arch: "arm64" }),
    });
    const invoke = (channel: string) => listeners.get(channel)!(studio, undefined);
    return { invoke, restarts };
  }

  it("answers what is running for Settings → About, in a fixture profile too", async () => {
    for (const fixture of [false, true])
      assert.deepEqual(await updateRig(fixture).invoke("studio:update.about"), {
        ok: true,
        value: { version: "0.1.0", platform: "darwin", arch: "arm64" },
      });
  });

  it("answers the downloaded update, and restarts into it on the person's word", async () => {
    const { invoke, restarts } = updateRig(false);
    assert.deepEqual(await invoke("studio:update"), {
      ok: true,
      value: { version: "0.2.0", action: UpdateAction.Restart },
    });
    assert.deepEqual(await invoke("studio:update.restart"), { ok: true, value: RestartAnswer.Relaunching });
    assert.deepEqual(restarts, ["restart"]);
  });

  it("a fixture profile reads the update but never quits the app to install one", async () => {
    const { invoke, restarts } = updateRig(true);
    assert.deepEqual(await invoke("studio:update"), {
      ok: true,
      value: { version: "0.2.0", action: UpdateAction.Restart },
    });
    const refused = await invoke("studio:update.restart");
    assert.equal(refused.ok, false);
    assert.deepEqual(restarts, []);
  });

  it("checks for updates in any profile, but only a live one opens the download page", async () => {
    const off = { status: UpdateCheckStatus.Off, current: "0.1.0", update: null };
    const live = updateRig(false);
    assert.deepEqual(await live.invoke("studio:update.check"), { ok: true, value: off });
    assert.deepEqual(await live.invoke("studio:update.download"), { ok: true, value: true });
    assert.deepEqual(live.restarts, ["download"]);
    const fixture = updateRig(true);
    assert.deepEqual(await fixture.invoke("studio:update.check"), { ok: true, value: off });
    assert.equal((await fixture.invoke("studio:update.download")).ok, false);
    assert.deepEqual(fixture.restarts, []);
  });
});

describe("Play's share menu", () => {
  /** Play's channels with only Share… and game links live: every menu it pops is kept. */
  function shareRig(web: string, links = gameLinks(), here: NativeHost | null = null) {
    const { handle, invoke } = registrar();
    const shared: Array<[string, unknown]> = [];
    const unused = {} as unknown;
    registerPlayIpc(handle, {
      gallery: unused as PlayIpcDeps["gallery"],
      gameLinks: links,
      remix: async () => "",
      remixReady: async () => ({}),
      viewer: () => null,
      installs: () => null,
      here: () => here,
      sessions: () => null,
      reveal: () => {},
      people: unused as PlayIpcDeps["people"],
      creators: unused as PlayIpcDeps["creators"],
      credits: unused as PlayIpcDeps["credits"],
      manage: unused as PlayIpcDeps["manage"],
      web,
      share: (url, at) => shared.push([url, at]),
    });
    return { invoke, shared };
  }

  it("hands the page the game a genex:// link asked for, once", async () => {
    const links = gameLinks();
    const { invoke } = shareRig("https://genex.games", links);
    assert.deepEqual(await invoke("studio:play.take-game-link"), { ok: true, value: null });
    links.arrive("genex://game/iron-tide");
    assert.deepEqual(await invoke("studio:play.take-game-link"), { ok: true, value: "iron-tide" });
    assert.deepEqual(await invoke("studio:play.take-game-link"), { ok: true, value: null });
  });

  it("names this computer even where Genex installs no native game, so a page can say why", async () => {
    const windows: NativeHost = { platform: NativePlatform.Windows, arch: NativeArch.X64, osVersion: "10.0.26100" };
    const { invoke } = shareRig("https://genex.games", gameLinks(), windows);
    assert.deepEqual(await invoke("studio:play.installs"), {
      ok: true,
      value: { installed: [], progress: [], host: windows },
    });
  });

  it("pops for a page of the website Play links to, by the button that asked", async () => {
    const { invoke, shared } = shareRig("https://genex.games");
    const answer = await invoke("studio:play.share", {
      url: "https://genex.games/@rabneba/invite",
      at: { x: 10, y: 20 },
    });
    assert.equal(answer.ok, true);
    assert.deepEqual(shared, [["https://genex.games/@rabneba/invite", { x: 10, y: 20 }]]);
  });

  it("never pops for anything else", async () => {
    const { invoke, shared } = shareRig("http://localhost:5173");
    for (const url of [
      "https://genex.games/@rabneba",
      "http://localhost:5174/@rabneba",
      "http://user@localhost:5173/@rabneba",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "",
      7,
    ]) {
      const answer = await invoke("studio:play.share", { url });
      assert.equal(answer.ok, false, String(url));
    }
    assert.deepEqual(shared, []);
    await invoke("studio:play.share", { url: "http://localhost:5173/@rab", at: { x: -1, y: "top" } });
    assert.deepEqual(shared, [["http://localhost:5173/@rab", undefined]], "a point off the window is no point");
  });
});
