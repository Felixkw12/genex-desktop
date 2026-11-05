import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { StudioCore } from "../../src/main/studio-core.ts";
import { makeResources } from "../helpers/resources.ts";
import { coreLite } from "../helpers/core-lite.ts";
import { tmpDir } from "../helpers/tmp.ts";
import { assertOwnedProject } from "../../src/main/project-policy.ts";
import { fixtureEngines } from "../../src/main/dev/fixtures.ts";
import { OllamaEngine } from "../../src/substrate/engines/ollama.ts";
import { CodexEngine } from "../../src/substrate/engines/codex.ts";
import { ClaudeCodeEngine } from "../../src/substrate/engines/claude-code.ts";
import { GrokEngine } from "../../src/substrate/engines/grok.ts";
import { OpenCodeEngine } from "../../src/substrate/engines/opencode.ts";
import { OpenRouterEngine } from "../../src/substrate/engines/openrouter.ts";
import { OpperEngine } from "../../src/substrate/engines/opper.ts";
import { LocalServerEngine } from "../../src/substrate/engines/local-server.ts";
import { CursorEngine } from "../../src/substrate/engines/cursor.ts";
import { EngineStatusCode } from "../../src/shared/engine-descriptor.ts";
import { EngineId } from "../../src/shared/providers.ts";
test("pre-init injection avoids every real engine status/models/auth probe and keeps sandbox enabled", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dev-policy-"));
  for (const proto of [
    OllamaEngine.prototype,
    CodexEngine.prototype,
    ClaudeCodeEngine.prototype,
    OpenCodeEngine.prototype,
    GrokEngine.prototype,
    OpenRouterEngine.prototype,
    OpperEngine.prototype,
    LocalServerEngine.prototype,
    CursorEngine.prototype,
  ])
    for (const key of ["status", "models", "probeAuth"])
      if (typeof (proto as any)[key] === "function")
        t.mock.method(proto as any, key, () => {
          throw new Error(`real ${key} must not run`);
        });
  const core = new StudioCore({
    paths: { userData: root, resources: await makeResources() },
    engines: fixtureEngines(),
  });
  await core.init();
  // The harness stops before its folder goes: Windows refuses to remove a running process's
  // working folder (EBUSY), and keeps it busy for a moment after the exit, hence the retries.
  t.after(async () => {
    await core.stop();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  await core.start();
  assert.equal(core.host.state, "ready");
  // Flipped (OpenCode, OpenRouter, a local server, Grok Build, Cursor, Genex, Opper): ten scripted engines, none real.
  assert.equal((await core.engines.describe()).length, 10);
  assert.equal(core.sandbox.enabled, true);
});
test("a fixture's Cursor is not installed unless the usage file makes it ready", async (t) => {
  const cursorOf = () => fixtureEngines().find((engine) => engine.id === EngineId.Cursor);
  assert.equal((await cursorOf()?.status())?.code, EngineStatusCode.NotInstalled, "pickers stay as they were");
  const file = path.join(await tmpDir("fixture-usage-"), "usage.json");
  await fs.writeFile(file, JSON.stringify({ [EngineId.Cursor]: "ready" }));
  const before = process.env.STUDIO_FIXTURE_USAGE_FILE;
  process.env.STUDIO_FIXTURE_USAGE_FILE = file;
  t.after(() => {
    if (before === undefined) delete process.env.STUDIO_FIXTURE_USAGE_FILE;
    else process.env.STUDIO_FIXTURE_USAGE_FILE = before;
  });
  assert.equal((await cursorOf()?.status())?.code, EngineStatusCode.Ready);
});
test("owned project policy rejects external adoption and symlink escapes before writes", async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "dev-project-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const games = path.join(root, "games"),
    inside = path.join(games, "inside"),
    outside = path.join(root, "external");
  await fs.mkdir(inside, { recursive: true });
  await fs.mkdir(outside);
  await assertOwnedProject(games, inside);
  await assert.rejects(assertOwnedProject(games, outside), /outside/);
  await fs.symlink(outside, path.join(games, "alias"));
  await assert.rejects(assertOwnedProject(games, path.join(games, "alias")), /outside|alias/);
  const core = new StudioCore({
    paths: { userData: path.join(root, "core"), resources: await makeResources() },
    gamesRoot: games,
    engines: [],
    executionPolicy: { allowedProjectRoot: games },
  });
  await assert.rejects(core.adoptProject(outside), /outside/);
  assert.deepEqual(await fs.readdir(outside), []);
});

/** Run `body` with the system temp folder pointed at `dir`; os.tmpdir() reads these at each call. */
async function withTempFolder<T>(dir: string, body: () => Promise<T>): Promise<T> {
  const names = ["TMPDIR", "TMP", "TEMP"];
  const saved = names.map((name) => [name, process.env[name]] as const);
  for (const name of names) process.env[name] = dir;
  try {
    return await body();
  } finally {
    for (const [name, value] of saved)
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
}

test("a core-lite in a temp folder reached through a link owns its games by their real path", async () => {
  // macOS spells os.tmpdir() as /var/folders/…, a link to /private/var/folders/…. The containment
  // check refuses a games root reached through a link, so the fixture must hand the core a real one.
  const root = await fs.realpath(await tmpDir("dev-linked-tmp-"));
  const real = path.join(root, "real");
  const linked = path.join(root, "linked");
  await fs.mkdir(real);
  await fs.symlink(real, linked, "junction");
  const linkedGames = path.join(linked, "games");
  await fs.mkdir(path.join(linkedGames, "game"), { recursive: true });
  await assert.rejects(assertOwnedProject(linkedGames, path.join(linkedGames, "game")), /outside/);

  const resources = await makeResources();
  const lite = await withTempFolder(linked, () => coreLite({ resources }));
  try {
    await lite.core.games.scaffold("linked");
    const binding = await lite.core.pluginBinding("linked");
    assert.equal(binding?.directory, path.join(lite.gamesRoot, "linked"));
    assert.equal(lite.gamesRoot, await fs.realpath(lite.gamesRoot));
  } finally {
    await lite.close();
  }
});
test("indexed external project is rejected before sandbox/snapshot write registration", async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "dev-index-")));
  // The refused init can leave the harness workspace's git still writing objects for a moment;
  // retry like tests/helpers/tmp.ts does rather than fail the run with ENOTEMPTY.
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  const userData = path.join(root, "core"),
    games = path.join(root, "games"),
    external = path.join(root, "outside");
  await fs.mkdir(userData);
  await fs.mkdir(games);
  await fs.mkdir(external);
  await fs.writeFile(path.join(external, "index.html"), "external project");
  await fs.writeFile(
    path.join(userData, "projects.json"),
    JSON.stringify({ version: 1, aliases: { outside: external }, recents: [] }),
  );
  const core = new StudioCore({
    paths: { userData, resources: await makeResources() },
    gamesRoot: games,
    engines: [],
    executionPolicy: { allowedProjectRoot: games },
  });
  await assert.rejects(core.init(), /outside the owned/);
  assert.equal(core.sandbox, undefined);
  assert.equal(await fs.readFile(path.join(external, "index.html"), "utf8"), "external project");
});
test("fixture native guard covers all account, external, picker, export and download routes", async () => {
  const { assertNativeActionAllowed, FIXTURE_BLOCKED_CHANNELS } = await import("../../src/main/dev/native-policy.ts");
  for (const channel of FIXTURE_BLOCKED_CHANNELS) {
    assert.throws(() => assertNativeActionAllowed(true, channel), /unsupported-in-fixture/);
    assert.doesNotThrow(() => assertNativeActionAllowed(false, channel));
  }
  assert.doesNotThrow(() => assertNativeActionAllowed(true, "studio:bootstrap"));
  // The list is the only gate (every handler is wrapped), so the channels that reach outside the
  // profile are named here too: a download is a download in a fixture profile as well.
  for (const channel of [
    "studio:packages.install",
    "studio:project.pick",
    "studio:games-root.choose",
    "studio:open-url",
    "studio:export",
    // Installing a plugin from a pinned commit downloads code and shows a trust dialog; updating does both again.
    "studio:plugins.install-github",
    // Looking a pasted link up reaches GitHub.
    "studio:plugins.lookup-github",
    "studio:plugins.github-versions",
    "studio:plugins.update",
    // Trusting a connector starts a program on this Mac with the environment variables it names;
    // the dialog that approves it is native, so a fixture profile never reaches it.
    "studio:mcp.trust",
  ])
    assert.ok(FIXTURE_BLOCKED_CHANNELS.has(channel), channel);
  // Reading the index and watching a local folder open no dialog and, offline, no socket either.
  for (const channel of [
    "studio:plugins.index",
    "studio:plugins.watch",
    // Forgetting a local plugin's Always allow writes its install record and opens nothing.
    "studio:plugins.forget-allowed",
    // Listing, editing and removing connectors stay open: they write a file inside the profile and
    // open no dialog. Only the trust step is native.
    "studio:mcp.list",
    "studio:mcp.save",
    "studio:mcp.remove",
    "studio:mcp.test",
    "studio:mcp.tools",
  ])
    assert.ok(!FIXTURE_BLOCKED_CHANNELS.has(channel), channel);
  // Bringing back the newer version after a Rewind rewrites only the chat's game folder from its own
  // checkpoints, as the Rewind does.
  const { classifyChannel, ChannelClass } = await import("../../src/main/dev/native-policy.ts");
  assert.equal(classifyChannel("studio:chat.rewind.undo"), ChannelClass.FixtureSafe);
  assert.doesNotThrow(() => assertNativeActionAllowed(true, "studio:chat.rewind.undo"));
  // …and adoption is not one of them: it opens no network and writes only inside the profile's
  // own games root, which is the one way a dev profile can hold a game that is not the fixture.
  assert.doesNotThrow(() => assertNativeActionAllowed(true, "studio:project.adopt"));
});
