/**
 * Secret storage.
 *
 * Encrypted at rest through Electron's `safeStorage` (Keychain-backed on macOS), stored under
 * `userData/secrets/`, which is on the sandbox's **deny-read** list — so no agent-originated
 * process, including the harness itself, can read these files even after the agent has rewritten
 * all of its own tools.
 *
 * There is deliberately little to keep here. Subscriptions never produce a token we hold: Claude
 * Code and Codex manage their own credentials in their own config homes, as OpenCode does. The API
 * keys the studio keeps are OpenRouter's, Opper's and a local server's, pasted in Settings
 * (`provider-keys.ts`), beside the MCP connectors' secrets.
 */
import path from "node:path";
import { readFile, rm, writeFile } from "node:fs/promises";
import { t } from "../shared/i18n.ts";
import { SecretStorageIssue } from "../shared/secret-storage.ts";
import { ensureDir, pathExists } from "./fsx.ts";

/** A stored secret's file suffix. */
const SECRET_FILE_SUFFIX = ".bin";
/** What bytes that are not UTF-8 text decode to (U+FFFD). */
const UNDECODABLE = "�";

/**
 * The Linux safeStorage backend that is not encryption: with no keyring or wallet, Electron
 * encrypts under a fixed key compiled into Chromium, so anyone who can read the file can read the
 * secret.
 */
const LINUX_PLAINTEXT_BACKEND = "basic_text";

const MESSAGE = {
  InvalidKey: (key: string) => `invalid secret key: ${key}`,
  PlaintextRefused: "refusing to store a secret without OS encryption — pass allowPlaintext to accept the risk",
} as const;

/** What a refusal says in the log and over IPC, by why the store is locked; functions, as main sets its language after this loads. */
const LOCKED_MESSAGE = {
  [SecretStorageIssue.OsCredentialsDisabled]: () => t("OS credential access is disabled for this process."),
  [SecretStorageIssue.EncryptionUnavailable]: () => t("OS encryption is unavailable; secret storage remains locked."),
  [SecretStorageIssue.NoKeyring]: () =>
    t("No unlocked system keyring is available. Start GNOME Keyring or KWallet and unlock it, then restart Genex."),
} as const satisfies Record<SecretStorageIssue, () => string>;

/** The secret store is locked, and `issue` says why; nothing was written. */
export class SecretStorageUnavailableError extends Error {
  readonly issue: SecretStorageIssue;

  constructor(issue: SecretStorageIssue) {
    super(LOCKED_MESSAGE[issue]());
    this.issue = issue;
  }
}

export function assertOsCredentialsAllowed(): void {
  if (process.env.STUDIO_DISABLE_OS_CREDENTIALS === "1") {
    throw new SecretStorageUnavailableError(SecretStorageIssue.OsCredentialsDisabled);
  }
}

export interface CryptoBackend {
  readonly name: string;
  isAvailable(): boolean;
  /** Why this backend cannot keep a secret right now, or null when it can. Absent: `isAvailable` decides. */
  unavailable?(): SecretStorageIssue | null;
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}

/** The part of Electron's `safeStorage` the store uses; `getSelectedStorageBackend` exists on Linux. */
export interface SafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

/** A backend over `safeStorage`, locked when the OS has no real key store to encrypt with. */
export function safeStorageBackend(safeStorage: SafeStorage): CryptoBackend {
  const unavailable = (): SecretStorageIssue | null => {
    assertOsCredentialsAllowed();
    // `getSelectedStorageBackend` exists only on Linux, and names the backend chosen, not one that started.
    const onLinux = safeStorage.getSelectedStorageBackend !== undefined;
    if (safeStorage.getSelectedStorageBackend?.() === LINUX_PLAINTEXT_BACKEND) return SecretStorageIssue.NoKeyring;
    if (safeStorage.isEncryptionAvailable()) return null;
    return onLinux ? SecretStorageIssue.NoKeyring : SecretStorageIssue.EncryptionUnavailable;
  };
  return {
    name: "electron-safeStorage",
    isAvailable: () => unavailable() === null,
    unavailable,
    encrypt: (plaintext) => {
      assertOsCredentialsAllowed();
      return safeStorage.encryptString(plaintext);
    },
    decrypt: (ciphertext) => {
      assertOsCredentialsAllowed();
      return safeStorage.decryptString(ciphertext);
    },
  };
}

/** Electron's OS-backed encryption (Keychain, DPAPI, a Linux keyring). Only available after `app.whenReady()`. */
export async function electronBackend(): Promise<CryptoBackend> {
  assertOsCredentialsAllowed();
  const { safeStorage } = await import("electron");
  return safeStorageBackend(safeStorage);
}

/**
 * Fallback used when OS encryption is unavailable (a headless test run, a Linux box with no
 * keyring). It is **not** encryption and says so: the store refuses to write unless the caller
 * has explicitly accepted plaintext, because a secret silently stored in the clear is worse than
 * a secret that failed to store.
 */
export function plaintextBackend(): CryptoBackend {
  return {
    name: "plaintext (NOT ENCRYPTED)",
    isAvailable: () => true,
    encrypt: (plaintext) => Buffer.from(plaintext, "utf8"),
    decrypt: (ciphertext) => ciphertext.toString("utf8"),
  };
}

/** Why `backend` cannot keep a secret, or null when it can; a backend that throws cannot. */
function lockedBy(backend: CryptoBackend | null): SecretStorageIssue | null {
  if (!backend) return SecretStorageIssue.EncryptionUnavailable;
  try {
    if (backend.unavailable) return backend.unavailable();
    return backend.isAvailable() ? null : SecretStorageIssue.EncryptionUnavailable;
  } catch (error) {
    if (error instanceof SecretStorageUnavailableError) return error.issue;
    return SecretStorageIssue.EncryptionUnavailable;
  }
}

/**
 * `ciphertext` decrypted, or null when this key cannot decrypt it. A wrong AES-CBC key usually
 * fails the padding check, but now and then passes it and yields bytes that are not UTF-8 text:
 * the replacement character marks those, and no stored secret is typed with one.
 */
function readable(backend: CryptoBackend, ciphertext: Buffer): string | null {
  try {
    const value = backend.decrypt(ciphertext);
    return value.includes(UNDECODABLE) ? null : value;
  } catch (error) {
    if (error instanceof SecretStorageUnavailableError) throw error;
    return null;
  }
}

export interface SecretStoreOptions {
  dir: string;
  backend: CryptoBackend;
  /** Required to use a backend that does not actually encrypt. */
  allowPlaintext?: boolean;
}

export class SecretStore {
  readonly dir: string;
  readonly backend: CryptoBackend;
  readonly #allowPlaintext: boolean;

  constructor(options: SecretStoreOptions) {
    this.dir = options.dir;
    this.backend = options.backend;
    this.#allowPlaintext = options.allowPlaintext ?? false;
  }

  /**
   * The store over the OS's encryption (or `options.backend`, in tests). Throws
   * {@link SecretStorageUnavailableError} when it is locked; only missing encryption may fall back
   * to plaintext, and only when the caller asks. A Linux box with no keyring never does: its
   * "encryption" is a public key, which is plaintext that looks safe.
   */
  static async open(
    dir: string,
    options: { allowPlaintext?: boolean; backend?: CryptoBackend } = {},
  ): Promise<SecretStore> {
    assertOsCredentialsAllowed();
    await ensureDir(dir);
    const backend = options.backend ?? (await electronBackend().catch(() => null));
    const issue = lockedBy(backend);
    if (backend && issue === null) return new SecretStore({ dir, backend, allowPlaintext: options.allowPlaintext });
    const plaintextAccepted = issue === SecretStorageIssue.EncryptionUnavailable && options.allowPlaintext === true;
    if (!plaintextAccepted) throw new SecretStorageUnavailableError(issue ?? SecretStorageIssue.EncryptionUnavailable);
    return new SecretStore({ dir, backend: plaintextBackend(), allowPlaintext: true });
  }

  get encrypted(): boolean {
    return this.backend.name !== plaintextBackend().name;
  }

  #file(key: string): string {
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(key)) throw new Error(MESSAGE.InvalidKey(key));
    return path.join(this.dir, `${key}${SECRET_FILE_SUFFIX}`);
  }

  async set(key: string, value: string): Promise<void> {
    const issue = this.backend.unavailable?.() ?? null;
    if (issue) throw new SecretStorageUnavailableError(issue);
    if (!this.encrypted && !this.#allowPlaintext) {
      throw new Error(MESSAGE.PlaintextRefused);
    }
    await ensureDir(this.dir);
    await writeFile(this.#file(key), this.backend.encrypt(value));
  }

  /**
   * The stored value, or null when there is none or it can no longer be read. Throws
   * {@link SecretStorageUnavailableError} when the store is locked right now: that value may still
   * be there. A value encrypted under another key is not (after the rename to Genex, safeStorage
   * holds a new "Genex Safe Storage" key), so it reads as missing and the user reconnects.
   */
  async get(key: string): Promise<string | null> {
    const file = this.#file(key);
    if (!(await pathExists(file))) return null;
    const issue = this.backend.unavailable?.() ?? null;
    if (issue) throw new SecretStorageUnavailableError(issue);
    return readable(this.backend, await readFile(file));
  }

  async delete(key: string): Promise<void> {
    await rm(this.#file(key), { force: true });
  }

  /** Key names only — values are never enumerated. */
  async list(): Promise<string[]> {
    await ensureDir(this.dir);
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(this.dir).catch(() => [] as string[]);
    return entries
      .filter((name) => name.endsWith(SECRET_FILE_SUFFIX))
      .map((name) => name.slice(0, -SECRET_FILE_SUFFIX.length))
      .sort();
  }
}
