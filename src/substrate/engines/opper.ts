/**
 * Opper: a European AI gateway, one API key for hundreds of hosted models, billed per token.
 *
 * A direct engine built the way OpenRouter's is (`openrouter.ts`), on the same pi-ai path as Ollama
 * (`pi-completions.ts`): the studio's own turn loop drives the model and runs the tools itself, and a
 * game chat or a build runs as a Genex session (`LocalSessions`), as Bonsai's do. The key is pasted in
 * Settings and kept in the OS secret store (`provider-keys.ts`); it is read here, in main, when a
 * request is sent, and never leaves this process. Opper lists its models only to a key, so with no key
 * the catalog is empty. Because every token costs money, the app never picks this engine on its own
 * (`isMetered`): only the person's explicit choice runs on it.
 */
import path from "node:path";
import {
  type CompleteRequest,
  type CompleteResponse,
  type DelegateRequest,
  type DelegateResult,
  type Engine,
  EngineError,
  type EngineModel,
  type EngineStatus,
  ModelContextSource,
  classifyHttpFailure,
} from "./types.ts";
import {
  drainPiStream,
  fromPiAssistant,
  isCutConnection,
  longHaulFetch,
  needsVision,
  type PiAssistant,
  piContext,
  type PiStreamFn,
  streamHttpStatus,
} from "./pi-completions.ts";
import { CATALOG_DEADLINE_MS, CatalogError, ModelCatalog } from "./model-catalog.ts";
import { LocalSessions } from "./local-session.ts";
import { CompletionStop, DEFAULT_COMPACTION_PERCENT, STOPPED_BY_USER } from "./common.ts";
import type { ApiKeyStore } from "../provider-keys.ts";
import { SecretStorageUnavailableError } from "../secrets.ts";
import { cleanApiKey } from "../provider-keys.ts";
import { HOUR_MS, SECOND_MS } from "../../shared/duration.ts";
import { ContextSource } from "../../shared/context.ts";
import { EngineKind, EngineStatusCode } from "../../shared/engine-descriptor.ts";
import { EngineFailureKind } from "../../shared/engine-requests.ts";
import { ModelCatalogProblemCode, ModelCatalogSource } from "../../shared/model-catalog.ts";
import { ReasoningEffort } from "../../shared/model-preferences.ts";
import { EngineId } from "../../shared/providers.ts";
import { errorMessage } from "../../shared/errors.ts";
import { redactSecrets } from "../../shared/redact.ts";
import { t } from "../../shared/i18n.ts";

/** Opper's API. Its OpenAI-compatible endpoints are under `/compat`; `/me` describes the calling key. */
export const OPPER_API = "https://api.opper.ai/v3";
/** Where a person makes a key (API Keys in Opper's platform). */
export const OPPER_KEYS_URL = "https://platform.opper.ai";

/** How long a checked key stays checked before `status()` asks Opper again. */
const STATUS_FRESH_MS = 60 * SECOND_MS;
/** How long one status or key check waits for Opper. */
const KEY_CHECK_TIMEOUT_MS = 10 * SECOND_MS;
/** The largest model catalog read. */
const MAX_CATALOG_BYTES = 16 * 1024 * 1024;
/** Ceiling on one completion: long enough for a whole build turn, finite so a dead connection errors. */
export const OPPER_COMPLETION_TIMEOUT_MS = HOUR_MS;
/** A reply may use a quarter of the context, up to this many tokens, unless the model says less. */
const MAX_REPLY_TOKENS = 32_768;
/** A model whose context the catalog does not give is assumed to have this much. */
const DEFAULT_CONTEXT_TOKENS = 32_768;
/** Characters per token when no tokenizer is at hand: low, so the estimate errs towards compacting early. */
const CHARS_PER_TOKEN = 3;
/** Tokens set aside for each picture, which the provider counts in its own way. */
const IMAGE_RESERVE_TOKENS = 1_600;
/** Tokens set aside for the provider's chat template around the messages and tools. */
const TEMPLATE_SLACK_TOKENS = 512;
/** The reasoning efforts a thinking model may be offered, of those its catalog row accepts. */
const OPPER_EFFORTS = [ReasoningEffort.Low, ReasoningEffort.Medium, ReasoningEffort.High] as const;
/** Tokens per million, the unit the catalog's per-token prices are turned into. */
const PER_MILLION = 1_000_000;
/**
 * The catalog view that lists each model once: its pool's bare name (`claude-sonnet-4-6`) when
 * several providers serve it, else its one catalog row. Every id stays callable whatever the view.
 */
const CATALOG_QUERY = "?view=simplified";

/** The fields of Opper's model list this engine reads, in their wire spelling. */
const Catalog = {
  /** `opper.kind` of a routing graph the person deployed: it picks a model per request, so it has no price. */
  DynamicRoute: "dynamic_route",
  /** `opper.type` of a language model; the list also carries embedding models. */
  Llm: "llm",
  /** `opper.capabilities` of a model that calls tools. */
  Tools: "tools",
  /** `opper.capabilities` of a model that sees images. */
  Vision: "vision",
  /** The one output a build reads back. */
  Text: "text",
} as const;

/**
 * What this engine says: statuses, remedies, price notes and model-list problems for Settings in the
 * person's language (functions, since main sets its language after it starts), and the errors a
 * session's run reads in English, since the harness and the model read them too.
 */
const MESSAGE = {
  NoKey: () => t("No Opper API key is saved."),
  KeyRemedy: () => t("Add your Opper API key in Settings › Model Providers."),
  NoKeyError: "No Opper API key is saved. Add your Opper API key in Settings › Model Providers.",
  KeyRefused: () => t("Opper did not accept the saved API key."),
  ReplaceRemedy: () => t("Replace the key in Settings › Model Providers."),
  Ready: () => t("Opper API key saved"),
  Unreachable: (detail: string) => t("Opper could not be reached ({detail}).", { detail }),
  Locked: (detail: string) => t("The OS secret store is locked, so the Opper key cannot be read. {detail}", { detail }),
  LockedError: (detail: string) => `The OS secret store is locked, so the Opper key cannot be read. ${detail}`,
  BadShape: () => t("That does not look like an Opper API key. Paste the whole key, with no spaces."),
  Free: () => t("Free"),
  Price: (input: string, output: string) => t("{input} in / {output} out per M tokens", { input, output }),
  NoModel: "Pick an Opper model for this chat.",
  UnknownModel: (model: string) => `Opper does not offer ${model} with tool calling. Pick another model.`,
  NoTools: "this model cannot call tools",
  NoVision: "this model cannot see images",
  Cut: "the connection to Opper was cut mid-reply — the partial turn was lost; send the message again",
  Overflow: (required: number, window: number) =>
    `The request needs about ${required} tokens including the reply; this model's context is ${window}.`,
  Threshold: (required: number, threshold: number, percent: number) =>
    `The request needs about ${required} tokens including the reply; the compaction threshold is ${threshold} (${percent}%).`,
  MalformedCatalog: () => t("Opper's model list could not be read."),
  CatalogTooLarge: () => t("Opper's model list was larger than expected."),
  CatalogFailed: (status: number) => t("Opper's model list failed (HTTP {status}).", { status }),
} as const;

/** One model as Opper's OpenAI-compatible list (`GET /compat/models`) gives it: the fields this engine reads. */
interface CatalogEntry {
  id?: unknown;
  context_length?: unknown;
  architecture?: { output_modalities?: unknown };
  pricing?: { prompt?: unknown; completion?: unknown };
  opper?: {
    kind?: unknown;
    type?: unknown;
    display_name?: unknown;
    capabilities?: unknown;
    max_output_tokens?: unknown;
    reasoning?: { supported?: unknown };
  };
}

/** A per-token price as the catalog quotes it (a decimal string), in dollars per million tokens. */
function perMillion(value: unknown): number | null {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number * PER_MILLION : null;
}

/** The price line a picker row shows: "$3.00 / $15.00 per M tokens", or "Free". */
function priceNote(input: number, output: number): string {
  if (input === 0 && output === 0) return MESSAGE.Free();
  return MESSAGE.Price(`$${input.toFixed(2)}`, `$${output.toFixed(2)}`);
}

/** A model row's prices in dollars per million tokens, kept beside the row pi-ai prices replies from. */
const PRICES = new WeakMap<EngineModel, { input: number; output: number }>();

const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** The model's name as Opper shows it, or its id when the list gives none. */
function modelLabel(entry: CatalogEntry, id: string): string {
  const name = typeof entry.opper?.display_name === "string" ? entry.opper.display_name.trim() : "";
  return name || id;
}

/** Does the model answer with text alone? A listing that names no output is taken as text. */
function answersInText(entry: CatalogEntry): boolean {
  const output = strings(entry.architecture?.output_modalities);
  return output.length === 0 || output.every((modality) => modality === Catalog.Text);
}

/** Is the entry a language model, or one the list does not type? Embedding models are listed too. */
function isLanguageModel(entry: CatalogEntry): boolean {
  const type = entry.opper?.type;
  return type === undefined || type === Catalog.Llm;
}

/**
 * Can the studio's own loop run on this entry? A language model that calls tools and answers in
 * text. A routing graph is left out: it picks its model per request, so no price is known ahead.
 */
function runsTheLoop(entry: CatalogEntry): boolean {
  if (entry.opper?.kind === Catalog.DynamicRoute || !isLanguageModel(entry)) return false;
  return strings(entry.opper?.capabilities).includes(Catalog.Tools) && answersInText(entry);
}

/** The efforts this model accepts, of the ones the studio offers; none for a model with no dial. */
function offeredEfforts(entry: CatalogEntry): string[] {
  const supported = strings(entry.opper?.reasoning?.supported);
  return OPPER_EFFORTS.filter((effort) => supported.includes(effort));
}

/** The row's prices, or null when the list quotes none (a key's own provider account, say). */
function pricesOf(entry: CatalogEntry): { input: number; output: number } | null {
  const input = perMillion(entry.pricing?.prompt);
  const output = perMillion(entry.pricing?.completion);
  return input === null || output === null ? null : { input, output };
}

/**
 * One catalog entry as a model row, or null for one the studio's loop cannot run: a model that
 * cannot call tools, that answers with images or audio, an embedding model, or a routing graph.
 */
export function opperModel(entry: CatalogEntry): EngineModel | null {
  if (typeof entry.id !== "string" || !entry.id || !runsTheLoop(entry)) return null;
  const contextWindow = positive(entry.context_length) ?? DEFAULT_CONTEXT_TOKENS;
  const replyCap = Math.min(MAX_REPLY_TOKENS, Math.floor(contextWindow / 4));
  const maxTokens = Math.min(positive(entry.opper?.max_output_tokens) ?? replyCap, replyCap);
  const efforts = offeredEfforts(entry);
  const defaultEffort = efforts.includes(ReasoningEffort.Low) ? ReasoningEffort.Low : efforts[0];
  const prices = pricesOf(entry);
  const row: EngineModel = {
    id: entry.id,
    label: modelLabel(entry, entry.id),
    contextWindow,
    contextSource: positive(entry.context_length) ? ModelContextSource.Catalog : ModelContextSource.Unknown,
    maxTokens,
    supportsTools: true,
    supportsVision: strings(entry.opper?.capabilities).includes(Catalog.Vision),
    supportsThinking: efforts.length > 0,
    ...(defaultEffort ? { efforts, defaultEffort } : {}),
    ...(prices ? { note: priceNote(prices.input, prices.output) } : {}),
  };
  PRICES.set(row, prices ?? { input: 0, output: 0 });
  return row;
}

/** The models of a catalog response the studio's loop can run, in the order Opper lists them. */
export function opperModels(body: unknown): EngineModel[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new CatalogError(ModelCatalogProblemCode.Malformed, MESSAGE.MalformedCatalog());
  const rows: EngineModel[] = [];
  for (const entry of data) {
    const row = entry && typeof entry === "object" ? opperModel(entry as CatalogEntry) : null;
    if (row) rows.push(row);
  }
  return rows;
}

/** A response body read whole, refused past `max` bytes so a misbehaving server cannot fill memory. */
async function readCapped(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declared > max) throw new CatalogError(ModelCatalogProblemCode.Malformed, MESSAGE.CatalogTooLarge());
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new CatalogError(ModelCatalogProblemCode.Malformed, MESSAGE.CatalogTooLarge());
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The wider scale clamped into low/medium/high, as OpenRouter's dial is. */
function clampedEffort(effort: string): (typeof OPPER_EFFORTS)[number] {
  const atMostLow =
    effort === ReasoningEffort.None || effort === ReasoningEffort.Minimal || effort === ReasoningEffort.Low;
  if (atMostLow) return ReasoningEffort.Low;
  if (effort === ReasoningEffort.Medium) return ReasoningEffort.Medium;
  return ReasoningEffort.High;
}

/** The effort sent for a model: the clamped one when the model accepts it, else the model's default. */
function opperEffort(effort: string, row: EngineModel): string | undefined {
  const clamped = clampedEffort(effort);
  return row.efforts?.includes(clamped) ? clamped : row.defaultEffort;
}

/** About how many tokens a request holds, from its characters; pictures and the reply are reserved apart. */
function estimatedPromptTokens(request: CompleteRequest): number {
  const text = JSON.stringify([
    request.systemPrompt ?? "",
    request.messages.map(({ images: _images, ...message }) => message),
    request.tools ?? [],
  ]);
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** The key as pasted, trimmed, or null when it cannot be a key; the rule is every pasted key's (`provider-keys.ts`). */
export { cleanApiKey };

export interface OpperEngineOptions {
  /** The engine's home: its sessions live under it. */
  root: string;
  scratchRoot?: string;
  protectedPaths?: string[];
  toolPath?: () => Promise<string>;
  /** Where the API key is kept. */
  keys: ApiKeyStore;
  /** The API's base URL (`…/v3`); tests point it at a local server. */
  baseUrl?: string;
  onModelsChanged?: () => void;
  now?: () => number;
  /** Injected in tests so the timeout path is reachable without waiting an hour. */
  timeoutMs?: number;
}

/** The outcome of checking a key with Opper. */
type KeyCheck = { ok: true } | { ok: false; status: EngineStatus };

export class OpperEngine implements Engine {
  readonly id = EngineId.Opper;
  readonly label = "Opper";
  readonly kind = EngineKind.Direct;
  readonly supportsSessions = true;
  /** Its sessions run Genex's own loop (`LocalSessions`), which reads the person's messages between rounds. */
  readonly steersMidTurn = true;
  readonly sessions: LocalSessions;
  readonly baseUrl: string;
  /** The OpenAI-compatible endpoints: completions and the model list. */
  readonly compatUrl: string;
  readonly #keys: ApiKeyStore;
  readonly #catalog: ModelCatalog;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  #status: { at: number; value: EngineStatus } | null = null;
  #models: unknown = null;

  constructor(options: OpperEngineOptions) {
    this.baseUrl = (options.baseUrl ?? OPPER_API).replace(/\/+$/, "");
    this.compatUrl = `${this.baseUrl}/compat`;
    this.#keys = options.keys;
    this.#now = options.now ?? Date.now;
    this.#timeoutMs = options.timeoutMs ?? OPPER_COMPLETION_TIMEOUT_MS;
    this.#catalog = new ModelCatalog(options.onModelsChanged, this.#now);
    this.sessions = new LocalSessions({
      engine: EngineId.Opper,
      root: path.join(options.root, "sessions"),
      scratchRoot: options.scratchRoot,
      protectedPaths: options.protectedPaths ?? [options.root],
      complete: (r) => this.complete(r),
      contextWindow: (model) => this.#row(model)?.contextWindow ?? DEFAULT_CONTEXT_TOKENS,
      toolPath: options.toolPath,
    });
  }

  async status(): Promise<EngineStatus> {
    const cached = this.#status;
    if (cached && this.#now() - cached.at < STATUS_FRESH_MS) return cached.value;
    const value = await this.#readStatus();
    this.#status = { at: this.#now(), value };
    return value;
  }

  async #readStatus(): Promise<EngineStatus> {
    let key: string | null;
    try {
      key = await this.#keys.read();
    } catch (err) {
      if (err instanceof SecretStorageUnavailableError)
        return { code: EngineStatusCode.Error, detail: MESSAGE.Locked(err.message) };
      throw err;
    }
    if (!key) return { code: EngineStatusCode.NeedsLogin, detail: MESSAGE.NoKey(), remedy: MESSAGE.KeyRemedy() };
    const check = await this.#checkKey(key);
    return check.ok ? { code: EngineStatusCode.Ready, detail: MESSAGE.Ready() } : check.status;
  }

  /** Ask Opper whether a key is good (`GET /me`, which spends nothing): refused, unreachable, or fine. */
  async #checkKey(key: string): Promise<KeyCheck> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/me`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
      });
    } catch (err) {
      return { ok: false, status: { code: EngineStatusCode.Error, detail: MESSAGE.Unreachable(errorMessage(err)) } };
    }
    await response.body?.cancel().catch(() => {});
    if (response.ok) return { ok: true };
    const refused = response.status === 401 || response.status === 403;
    if (refused)
      return {
        ok: false,
        status: { code: EngineStatusCode.NeedsLogin, detail: MESSAGE.KeyRefused(), remedy: MESSAGE.ReplaceRemedy() },
      };
    return {
      ok: false,
      status: { code: EngineStatusCode.Error, detail: MESSAGE.Unreachable(`HTTP ${response.status}`) },
    };
  }

  /**
   * Check a pasted key with Opper and keep it only when Opper takes it. The answer is the engine's
   * status, never the key; a key Opper refuses or a store that is locked saves nothing. The model
   * list is read again with the new key, since what a key may call is set in its organization.
   */
  async saveKey(value: unknown): Promise<EngineStatus> {
    const key = cleanApiKey(value);
    if (!key) return { code: EngineStatusCode.NeedsLogin, detail: MESSAGE.BadShape(), remedy: MESSAGE.KeyRemedy() };
    const check = await this.#checkKey(key);
    if (!check.ok) return check.status;
    await this.#keys.write(key);
    this.#forgetStatus();
    this.#catalog.invalidate();
    void this.refreshModels(true).catch(() => {});
    return this.status();
  }

  /** Forget the saved key; the engine then needs a new one before it runs again. */
  async clearKey(): Promise<EngineStatus> {
    await this.#keys.clear();
    this.#forgetStatus();
    this.#catalog.invalidate();
    return this.status();
  }

  #forgetStatus(): void {
    this.#status = null;
  }

  catalogSnapshot = () => this.#catalog.snapshot();

  async models(): Promise<EngineModel[]> {
    void this.refreshModels().catch(() => {});
    return this.#catalog.models();
  }

  /**
   * Opper's model list, read with the saved key; reading it spends nothing. A forced read
   * (Settings' recheck) also asks about the key again.
   */
  async refreshModels(force = false): Promise<void> {
    if (force) this.#forgetStatus();
    await this.#catalog.refresh(this.compatUrl, () => this.#readCatalog(), force);
  }

  /** The models the saved key may call; none without a key, since Opper lists them only to one. */
  async #readCatalog(): Promise<{ models: EngineModel[]; source: typeof ModelCatalogSource.Provider }> {
    const key = await this.#keys.read().catch(() => null);
    if (!key) return { models: [], source: ModelCatalogSource.Provider };
    const response = await fetch(`${this.compatUrl}/models${CATALOG_QUERY}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(CATALOG_DEADLINE_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new CatalogError(ModelCatalogProblemCode.Provider, MESSAGE.CatalogFailed(response.status));
    }
    let body: unknown;
    try {
      body = JSON.parse(await readCapped(response, MAX_CATALOG_BYTES));
    } catch (err) {
      if (err instanceof CatalogError) throw err;
      throw new CatalogError(ModelCatalogProblemCode.Malformed, MESSAGE.MalformedCatalog());
    }
    return { models: opperModels(body), source: ModelCatalogSource.Provider };
  }

  /** No model is Opper's own default: every one costs something, so the person picks it. */
  async defaultModel(): Promise<string | null> {
    return null;
  }

  #row(model: string): EngineModel | undefined {
    return this.#catalog.models().find((row) => row.id === model);
  }

  /** The catalog row for `model`, reading the catalog once if it has not been read yet. */
  async #knownRow(model: string): Promise<EngineModel> {
    if (!this.#row(model)) await this.refreshModels(true).catch(() => {});
    const row = this.#row(model);
    if (!row) throw new EngineError(EngineFailureKind.Unavailable, this.id, MESSAGE.UnknownModel(model));
    return row;
  }

  async #key(): Promise<string> {
    let key: string | null;
    try {
      key = await this.#keys.read();
    } catch (err) {
      throw new EngineError(EngineFailureKind.Auth, this.id, MESSAGE.LockedError(errorMessage(err)));
    }
    if (!key) throw new EngineError(EngineFailureKind.Auth, this.id, MESSAGE.NoKeyError);
    return key;
  }

  async delegate(request: DelegateRequest): Promise<DelegateResult> {
    const model = request.model;
    if (!model) throw new EngineError(EngineFailureKind.Unavailable, this.id, MESSAGE.NoModel);
    await this.#key();
    await this.#knownRow(model);
    return this.sessions.run(request, model);
  }

  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const modelId = request.model;
    if (!modelId) throw new EngineError(EngineFailureKind.Unavailable, this.id, MESSAGE.NoModel);
    const key = await this.#key();
    const row = await this.#knownRow(modelId);
    if (request.tools?.length && !row.supportsTools)
      throw new EngineError(EngineFailureKind.Unavailable, this.id, MESSAGE.NoTools);
    if (needsVision(request) && !row.supportsVision)
      throw new EngineError(EngineFailureKind.Unavailable, this.id, MESSAGE.NoVision);
    const maxTokens = Math.min(request.maxTokens ?? row.maxTokens, row.maxTokens);
    this.#preflight(request, row, maxTokens);
    const { models, model } = await this.#provider(row, key);
    const effort = row.supportsThinking && request.effort ? opperEffort(request.effort, row) : undefined;
    try {
      const stream = (models as { stream: PiStreamFn }).stream(model, piContext(request, this.id), {
        fetch: longHaulFetch(request.signal),
        timeoutMs: Math.min(request.timeoutMs ?? this.#timeoutMs, this.#timeoutMs),
        maxTokens,
        ...(request.signal ? { signal: request.signal } : {}),
        ...(effort ? { reasoningEffort: effort } : {}),
      });
      await drainPiStream(stream, request, this.id);
      const assistant = (await stream.result()) as PiAssistant;
      if (assistant.stopReason === CompletionStop.Aborted)
        throw new EngineError(EngineFailureKind.Aborted, this.id, STOPPED_BY_USER);
      if (assistant.stopReason === CompletionStop.Error)
        throw this.#streamFailure(assistant.errorMessage ?? "model stream failed");
      const { message, usage } = fromPiAssistant(assistant, this.id);
      return {
        message,
        usage,
        stopReason: assistant.stopReason ?? CompletionStop.Stop,
        model: modelId,
        engine: this.id,
      };
    } catch (err) {
      throw this.#failure(err, request);
    }
  }

  /**
   * Refuse a request that cannot fit before it is sent and paid for. There is no tokenizer for
   * hundreds of models, so the count is an estimate from characters that errs towards compacting
   * early; the provider's own limit still stands behind it.
   */
  #preflight(request: CompleteRequest, row: EngineModel, maxTokens: number): void {
    const images = request.messages.reduce((n, m) => n + (m.images?.length ?? 0), 0);
    const promptTokens = estimatedPromptTokens(request);
    const required = promptTokens + images * IMAGE_RESERVE_TOKENS + maxTokens + TEMPLATE_SLACK_TOKENS;
    const window = row.contextWindow;
    const percent =
      request.contextPolicy?.mode === "custom"
        ? Number(request.contextPolicy.thresholdPercent)
        : DEFAULT_COMPACTION_PERCENT;
    const threshold = Math.floor((window * percent) / 100);
    request.onContext?.({
      engine: this.id,
      model: row.id,
      requestedModel: row.id,
      promptTokens,
      contextWindow: window,
      reservedOutputTokens: maxTokens,
      imageReserveTokens: images * IMAGE_RESERVE_TOKENS,
      source: ContextSource.Estimated,
      thresholdTokens: request.contextPolicy ? threshold : undefined,
      phase: "preflight",
    });
    if (required > window)
      throw new EngineError(EngineFailureKind.ContextOverflow, this.id, MESSAGE.Overflow(required, window));
    if (request.contextPolicy && required > threshold)
      throw new EngineError(
        EngineFailureKind.ContextThreshold,
        this.id,
        MESSAGE.Threshold(required, threshold, percent),
      );
  }

  /** pi-ai's provider for one request, holding the key only for as long as the request needs it. */
  async #provider(row: EngineModel, key: string): Promise<{ models: unknown; model: unknown }> {
    const { createModels, createProvider } = await import("@earendil-works/pi-ai");
    const { openAICompletionsApi } = await import("@earendil-works/pi-ai/api/openai-completions.lazy");
    if (!this.#models) this.#models = createModels();
    const model = this.#piModel(row);
    (this.#models as { setProvider: (p: unknown) => void }).setProvider(
      createProvider({
        id: this.id,
        name: this.label,
        baseUrl: this.compatUrl,
        auth: {
          apiKey: { name: "Opper API key", resolve: async () => ({ auth: { apiKey: key }, source: "Settings" }) },
        } as never,
        models: [model] as never,
        api: openAICompletionsApi(),
      }) as never,
    );
    return { models: this.#models, model };
  }

  /**
   * pi-ai's description of one catalog model: OpenAI's Chat Completions shape with the system
   * prompt in the system role and no `store` field, which Opper's compatible endpoint does not take;
   * `reasoning_effort` is its reasoning dial.
   */
  #piModel(row: EngineModel): Record<string, unknown> {
    const { input, output } = PRICES.get(row) ?? { input: 0, output: 0 };
    return {
      id: row.id,
      name: row.label,
      api: "openai-completions",
      provider: this.id,
      baseUrl: this.compatUrl,
      reasoning: row.supportsThinking,
      supportsTools: row.supportsTools,
      input: row.supportsVision ? ["text", "image"] : ["text"],
      cost: { input, output, cacheRead: 0, cacheWrite: 0 },
      contextWindow: row.contextWindow,
      maxTokens: row.maxTokens,
      compat: { supportsStore: false, supportsDeveloperRole: false },
    };
  }

  /**
   * A failure that arrived through the stream: an HTTP status it names, a cut connection, or as
   * said. Whatever the provider said is redacted first: no key ever rides an error into a log.
   */
  #streamFailure(said: string): EngineError {
    const message = redactSecrets(said);
    const status = streamHttpStatus(message);
    if (status !== null) return classifyHttpFailure(this.id, status, message);
    if (isCutConnection(message)) return new EngineError(EngineFailureKind.Unavailable, this.id, MESSAGE.Cut);
    return new EngineError(EngineFailureKind.Other, this.id, message);
  }

  /** What a failed completion throws, as an engine error the run policy can act on. */
  #failure(err: unknown, request: CompleteRequest): EngineError {
    if (err instanceof EngineError) return err;
    // An abort wins over whatever error it caused — a stop must never read as a failure.
    if (request.signal?.aborted) return new EngineError(EngineFailureKind.Aborted, this.id, STOPPED_BY_USER);
    const error = err as Error & { status?: number };
    if (error.status) return classifyHttpFailure(this.id, error.status, redactSecrets(error.message));
    return this.#streamFailure(error.message);
  }
}
