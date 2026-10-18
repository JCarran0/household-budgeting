/**
 * LedgerStore — Household Ledger persistence (HOUSEHOLD-LEDGER-BRD §3, plan L1)
 *
 * One JSON blob of facts per family (`ledger_{familyId}`) and one of per-person
 * reminder preferences (`ledger_prefs_{familyId}`).
 *
 * - Every read is validated. A file that fails the schema throws rather than
 *   reading as empty: an empty ledger looks like "nothing is due", which is the
 *   one wrong answer this feature exists to prevent.
 * - Every write is a read-modify-write under a per-family mutex, and the result
 *   is validated before it is saved, so a write that would break a link or a
 *   date rule never lands.
 * - Free text is redacted by value shape before it is stored (REQ-H015). Quotes
 *   are not: they must match the stored library body, which is already redacted.
 * - Business-workspace refusal lives at the route (refuseBusinessWorkspace), as
 *   for every other AI-reachable surface; this store only scopes by familyId.
 */

import { Mutex } from 'async-mutex';
import type { LedgerFact, LedgerFile, LedgerPrefsFile, LedgerUserPrefs } from '../shared/types';
import type { DataService } from './dataService';
import { redactDocumentText } from '../utils/documentRedaction';
import {
  LEDGER_FORMAT_VERSION,
  ledgerFileSchema,
  ledgerKey,
  ledgerPrefsFileSchema,
  ledgerPrefsKey,
} from '../validators/ledgerValidators';

const FAMILY_ID_SHAPE = /^[A-Za-z0-9-]{1,64}$/;

export class LedgerCorruptError extends Error {
  constructor(key: string, detail: string) {
    super(`ledger file ${key} failed validation: ${detail}`);
    this.name = 'LedgerCorruptError';
  }
}

function assertFamilyId(familyId: string): void {
  if (typeof familyId !== 'string' || !FAMILY_ID_SHAPE.test(familyId)) {
    throw new Error('invalid familyId');
  }
}

function redact(text: string): string {
  return redactDocumentText(text).text;
}

/** Redact every free-text field a person or model typed. */
export function redactFactText(fact: LedgerFact): LedgerFact {
  return {
    ...fact,
    subject: redact(fact.subject),
    title: redact(fact.title),
    ...(fact.detail !== undefined ? { detail: redact(fact.detail) } : {}),
    ...(fact.amount !== undefined ? { amount: redact(fact.amount) } : {}),
  };
}

const EMPTY_PREFS: LedgerUserPrefs = { snoozes: [], mutedSubjects: [] };

export class LedgerStore {
  private readonly mutexes = new Map<string, Mutex>();

  constructor(private readonly dataService: DataService) {}

  private async locked<R>(key: string, fn: () => Promise<R>): Promise<R> {
    let mutex = this.mutexes.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(key, mutex);
    }
    return mutex.runExclusive(fn);
  }

  async read(familyId: string): Promise<LedgerFile> {
    assertFamilyId(familyId);
    const key = ledgerKey(familyId);
    const raw = await this.dataService.getData<unknown>(key);
    if (raw === null) return { formatVersion: LEDGER_FORMAT_VERSION, facts: [] };
    const parsed = ledgerFileSchema.safeParse(raw);
    if (!parsed.success) throw new LedgerCorruptError(key, parsed.error.issues[0]?.message ?? 'invalid');
    return parsed.data;
  }

  /**
   * Replace the fact list atomically. `mutate` receives the current facts and
   * returns the new list; the result is redacted and validated as a whole.
   * Throws (and writes nothing) when the result is invalid.
   */
  async update(familyId: string, mutate: (facts: LedgerFact[]) => LedgerFact[]): Promise<LedgerFile> {
    assertFamilyId(familyId);
    return this.locked(ledgerKey(familyId), async () => {
      const current = await this.read(familyId);
      const next = { formatVersion: LEDGER_FORMAT_VERSION, facts: mutate(current.facts).map(redactFactText) };
      const parsed = ledgerFileSchema.parse(next);
      await this.dataService.saveData(ledgerKey(familyId), parsed);
      return parsed;
    });
  }

  async addFact(familyId: string, fact: LedgerFact): Promise<LedgerFact> {
    const file = await this.update(familyId, facts => {
      if (facts.some(f => f.id === fact.id)) throw new Error(`fact ${fact.id} already exists`);
      return [...facts, fact];
    });
    return file.facts.find(f => f.id === fact.id)!;
  }

  async readPrefs(familyId: string): Promise<LedgerPrefsFile> {
    assertFamilyId(familyId);
    const key = ledgerPrefsKey(familyId);
    const raw = await this.dataService.getData<unknown>(key);
    if (raw === null) return { formatVersion: LEDGER_FORMAT_VERSION, users: {} };
    const parsed = ledgerPrefsFileSchema.safeParse(raw);
    if (!parsed.success) throw new LedgerCorruptError(key, parsed.error.issues[0]?.message ?? 'invalid');
    return parsed.data;
  }

  async userPrefs(familyId: string, userId: string): Promise<LedgerUserPrefs> {
    return (await this.readPrefs(familyId)).users[userId] ?? EMPTY_PREFS;
  }

  /** Update one person's prefs; never touches anyone else's (REQ-H040). */
  async updateUserPrefs(
    familyId: string,
    userId: string,
    mutate: (prefs: LedgerUserPrefs) => LedgerUserPrefs,
  ): Promise<LedgerUserPrefs> {
    assertFamilyId(familyId);
    return this.locked(ledgerPrefsKey(familyId), async () => {
      const current = await this.readPrefs(familyId);
      const mine = mutate(current.users[userId] ?? EMPTY_PREFS);
      const next = ledgerPrefsFileSchema.parse({ ...current, users: { ...current.users, [userId]: mine } });
      await this.dataService.saveData(ledgerPrefsKey(familyId), next);
      return next.users[userId];
    });
  }
}
