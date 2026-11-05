/**
 * The API keys a person pastes into Settings (OpenRouter's, Opper's, their own model server's and TypeSafe's), one
 * secret each in the OS secret store under `userData/secrets/providers/` — a folder no agent process may read
 * (`StudioCore#protectedPaths`). The key is read in main when a request is sent and never crosses
 * to the renderer, the harness, a model tool or a log.
 */
import { SecretStore } from "./secrets.ts";

/** The secret OpenRouter's key is kept under. Stored on disk: never rename it. */
export const OPENROUTER_KEY_SECRET = "openrouter-api-key";
/** The secret Opper's key is kept under. Stored on disk: never rename it. */
export const OPPER_KEY_SECRET = "opper-api-key";
/** The secret a local server's API key is kept under. Stored on disk: never rename it. */
export const LOCAL_SERVER_KEY_SECRET = "local-server-api-key";
/** The secret TypeSafe's key (the fast decision model a play's pilot may ask) is kept under. Stored on disk: never rename it. */
export const TYPESAFE_KEY_SECRET = "typesafe-api-key";

/** The shortest and longest a pasted key may be, and the characters it may hold (no space, no newline). */
const KEY_SHAPE = /^[\x21-\x7e]{16,512}$/;

/** The key as pasted, trimmed, or null when it cannot be a key (a space, a newline, too short or long). */
export function cleanApiKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return KEY_SHAPE.test(key) ? key : null;
}

/** One provider's key: read it, replace it, or forget it. A locked store throws `SecretStorageUnavailableError`. */
export interface ApiKeyStore {
  read(): Promise<string | null>;
  write(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The key named `name` in the secret store at `dir`. The store is opened on each use, so a keyring
 * that unlocks after launch is used as soon as it does, and a locked one refuses rather than
 * falling back to plaintext.
 */
export function secretKeyStore(dir: string, name: string): ApiKeyStore {
  const open = () => SecretStore.open(dir);
  return {
    read: async () => (await open()).get(name),
    write: async (key) => (await open()).set(name, key),
    clear: async () => (await open()).delete(name),
  };
}

/** A key held in memory: for tests and fixture profiles, which never touch the OS secret store. */
export function memoryKeyStore(initial: string | null = null): ApiKeyStore {
  let value = initial;
  return {
    read: async () => value,
    write: async (key) => {
      value = key;
    },
    clear: async () => {
      value = null;
    },
  };
}
