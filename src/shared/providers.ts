/**
 * The model providers the app knows, in one table: the name a person says, the sign-in words and
 * install link for a subscription, how its sign-in runs, and what kind of roles it takes.
 * `EngineRegistry.describe` serves the row on each `EngineDescriptor` (`provider`), main and the
 * renderer take `SUBSCRIPTION_ENGINES` from here, and the harness seed's role tables are held to
 * it by `tests/conformance/providers.test.ts`. Adding a provider starts here
 * (docs/agent/recipes.md, "Provider or engine").
 */
import { t } from "./i18n.ts";

/**
 * How a provider signs in: Claude through a piped or embedded terminal plus status polling, Codex
 * through its native login reported from the in-app console, OpenCode through its own `auth login`
 * in the embedded terminal (which keeps every provider it signs in to), Grok Build and Cursor through
 * their own sign-in command there (the person's account, in the browser), `none` for an engine with
 * no sign-in of its own (a local model, a local server, or OpenRouter, whose key is pasted in Settings).
 */
export type LoginKind = "terminal" | "console" | "cli" | "none";

/**
 * Who pays for a provider's work: nobody (`local`), a plan the person already has
 * (`subscription`, throttled server-side, never billed per call), or per token (`metered`). A
 * choice the app makes on its own — a fallback, a first ready engine — never lands on a metered
 * provider: only the person's explicit pick spends their credits.
 */
export type Billing = "local" | "subscription" | "metered";

/**
 * Which roles a provider can run: `presets` has the model rows and single-pick presets of
 * `shared/model-roles.ts`, `sessions` can cross roles without presets, `completion` gives each
 * job its own model without sessions (its reviewers may join a session run, its main agent may
 * hand its jobs to one), and `single` runs one model.
 */
export type RoleSupport = "presets" | "sessions" | "completion" | "single";

/** What the sign-in card and the Models room say for a subscription. */
export interface SignInCopy {
  readonly card: string;
  readonly account: string;
  readonly install: string;
  /** The vendor's own install page for the CLI. */
  readonly installUrl: string;
  readonly get: string;
  /** The flat sign-in card's line: the thing the user already pays for, put to work. */
  readonly useLine: string;
  /** The sign-in card's line while the subscription is not signed in: why, and who handles the password. */
  readonly signInLine: string;
}

export interface ProviderInfo {
  /** The engine id (`Engine.id`). */
  readonly id: string;
  /** The provider's name as a person says it. */
  readonly label: string;
  readonly subscription: boolean;
  readonly login: LoginKind;
  readonly roles: RoleSupport;
  readonly billing: Billing;
  /** Subscriptions only. */
  readonly signIn: SignInCopy | null;
  /** Shipped before a live test proved it: Settings and the picker say Beta. */
  readonly beta?: true;
}

/** The id of every engine the app knows (`Engine.id`). Persisted in settings and logs: never rename a value. */
export const EngineId = {
  ClaudeCode: "claude-code",
  Codex: "codex",
  Bonsai: "bonsai",
  Ollama: "ollama",
  OpenCode: "opencode",
  OpenRouter: "openrouter",
  Opper: "opper",
  LocalServer: "local-server",
  Grok: "grok",
  Cursor: "cursor",
  Genex: "genex",
} as const;
export type EngineId = (typeof EngineId)[keyof typeof EngineId];

/**
 * Every provider, subscriptions first in preference order. Words a person reads are getters, so
 * each read is in the current language (main loads this table before it sets its language).
 */
export const PROVIDERS = [
  {
    id: EngineId.ClaudeCode,
    label: "Claude Code",
    subscription: true,
    login: "terminal",
    roles: "presets",
    billing: "subscription",
    signIn: {
      get card() {
        return t("Use your Claude subscription");
      },
      get account() {
        return t("Claude account");
      },
      get install() {
        return t("Claude Code isn't installed on this Mac.");
      },
      installUrl: "https://code.claude.com",
      get get() {
        return t("Install Claude Code");
      },
      get useLine() {
        return t("Use your Claude subscription to build games.");
      },
      get signInLine() {
        return t(
          "Your Claude subscription expired or isn't signed in. The studio never sees your password — Claude Code handles that part.",
        );
      },
    },
  },
  {
    id: EngineId.Codex,
    label: "Codex",
    subscription: true,
    login: "console",
    roles: "presets",
    billing: "subscription",
    signIn: {
      get card() {
        return t("Use your ChatGPT subscription");
      },
      get account() {
        return t("ChatGPT account");
      },
      get install() {
        return t("Codex isn't installed on this Mac.");
      },
      installUrl: "https://developers.openai.com/codex/cli",
      get get() {
        return t("Install Codex");
      },
      get useLine() {
        return t("Use your ChatGPT subscription to build games.");
      },
      get signInLine() {
        return t("Connect your ChatGPT subscription to build games. Codex handles sign-in in your browser.");
      },
    },
  },
  {
    id: EngineId.Bonsai,
    label: "Bonsai",
    subscription: false,
    login: "none",
    roles: "sessions",
    billing: "local",
    signIn: null,
  },
  {
    id: EngineId.Ollama,
    label: "Ollama",
    subscription: false,
    login: "none",
    roles: "completion",
    billing: "local",
    signIn: null,
  },
  {
    id: EngineId.OpenCode,
    label: "OpenCode",
    subscription: false,
    login: "cli",
    roles: "sessions",
    billing: "metered",
    signIn: null,
  },
  {
    id: EngineId.Grok,
    label: "Grok Build",
    subscription: false,
    login: "cli",
    roles: "sessions",
    billing: "metered",
    signIn: null,
  },
  {
    id: EngineId.Cursor,
    label: "Cursor",
    subscription: false,
    login: "cli",
    roles: "sessions",
    // Cursor's own models draw on the plan's weekly pool, but Claude, GPT and Gemini in Cursor, and
    // anything past the pool, are paid from the account's credit: only the person's pick runs it.
    billing: "metered",
    signIn: null,
    beta: true,
  },
  {
    // Claude Code on Genex credits: the app's own relay hands its calls to genex.games, which
    // runs them on the three models it offers (`shared/genex-build.ts`). Nothing to install or
    // sign in to beyond the person's Genex account.
    id: EngineId.Genex,
    label: "Genex",
    subscription: false,
    login: "none",
    roles: "sessions",
    billing: "metered",
    signIn: null,
  },
  {
    id: EngineId.OpenRouter,
    label: "OpenRouter",
    subscription: false,
    login: "none",
    roles: "sessions",
    billing: "metered",
    signIn: null,
  },
  {
    // Opper: built as OpenRouter is, a key pasted in Settings. Beta until a live test proves it.
    id: EngineId.Opper,
    label: "Opper",
    subscription: false,
    login: "none",
    roles: "sessions",
    billing: "metered",
    signIn: null,
    beta: true,
  },
  {
    id: EngineId.LocalServer,
    get label() {
      return t("Local server");
    },
    subscription: false,
    login: "none",
    roles: "sessions",
    billing: "local",
    signIn: null,
  },
] as const satisfies readonly ProviderInfo[];

type Provider = (typeof PROVIDERS)[number];
export type ProviderId = Provider["id"];
type Subscription = Extract<Provider, { subscription: true }>;
export type SubscriptionId = Subscription["id"];

const isSubscription = (provider: Provider): provider is Subscription => provider.subscription;

/** The subscription engines, in preference order — "your subscription, through their harness". */
export const SUBSCRIPTION_ENGINES: readonly SubscriptionId[] = PROVIDERS.filter(isSubscription).map(
  (provider) => provider.id,
);

/** The table row for an engine id, or undefined for an engine the table does not list. */
export function providerInfo(id: string | null | undefined): ProviderInfo | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

/** How this engine signs in; `none` for a local engine or one the table does not list. */
export function loginKind(id: string | null | undefined): LoginKind {
  return providerInfo(id)?.login ?? "none";
}

/**
 * True for an engine whose sessions are Claude Code's: Claude Code itself, and Genex, which runs it
 * on Genex credits. Their tools, permission modes and Auto are Claude Code's.
 */
export function runsClaudeCode(id: string | null | undefined): boolean {
  return id === EngineId.ClaudeCode || id === EngineId.Genex;
}

/** True for a provider billed per token: the app never picks one on the person's behalf. */
export function isMetered(id: string | null | undefined): boolean {
  return providerInfo(id)?.billing === "metered";
}

/** True for a provider that ships in beta: Settings and the model picker say so. */
export function isBeta(id: string | null | undefined): boolean {
  return providerInfo(id)?.beta === true;
}

/** True for a model this Mac runs itself: free, and never rate limited by anyone else. */
export function isLocalEngine(id: string | null | undefined): boolean {
  return providerInfo(id)?.billing === "local";
}
