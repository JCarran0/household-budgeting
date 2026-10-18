/**
 * Household Ledger reminder job — HOUSEHOLD-LEDGER-BRD REQ-H030 – H032, SEC-H004 (plan L7)
 *
 * Runs in-process, hourly. Each run asks the shared date engine which warnings
 * are due for each member of each household with a ledger, sends them, and
 * records what was sent. No model is anywhere in this path (REQ-H030).
 *
 * - Idempotent: a warning key is recorded per person once sent and never sent
 *   again, so running hourly (or after every restart) is safe.
 * - Catches up: pendingWarnings returns the latest unsent warning for a live
 *   occurrence even if its date has passed; earlier missed ones are recorded as
 *   superseded rather than sent in a burst.
 * - Quiet hours: nothing is sent before QUIET_UNTIL_HOUR Eastern. A warning that
 *   comes due overnight goes out on the first run after that.
 * - Payloads carry subject, kind and date only (SEC-H004): never the fact's
 *   title, amount or quotes, which can hold figures, and which travel through
 *   third-party push services.
 * - Single process: the sent log is read-modify-written under a lock in this
 *   process. Running two backend instances would need a shared lock first
 *   (BRD open question "Scheduler").
 */

import { Mutex } from 'async-mutex';
import type { DataService } from './dataService';
import type { LedgerStore } from './ledgerStore';
import type { PushNotificationService } from './pushNotificationService';
import type { FamilyMember, Family, NotificationPayload } from '../shared/types';
import { EASTERN_TIME_ZONE, etDateString } from '../shared/utils/easternTime';
import { addOffset, daysBetween, pendingWarnings, type PendingWarning } from '../shared/utils/ledgerDates';
import {
  LEDGER_FORMAT_VERSION,
  ledgerSentFileSchema,
  ledgerSentKey,
  type LedgerSentFile,
} from '../validators/ledgerValidators';
import { childLogger } from '../utils/logger';

const log = childLogger('ledgerReminderJob');

export const QUIET_UNTIL_HOUR = 9;
const RUN_EVERY_MS = 60 * 60 * 1000;
/** Sent keys for occurrences this far in the past are pruned; they can never fire again. */
const PRUNE_AFTER_DAYS = 90;

const FACTS_PREFIX = 'ledger_';
const NOT_FACTS = /^ledger_(prefs|sent)_/;

export interface ReminderFamilies {
  getFamily(familyId: string): Promise<Family | null>;
  getFamilyMembers(familyId: string): Promise<FamilyMember[]>;
}

function etHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(now));
}

function friendlyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** SEC-H004: subject, kind and date. Nothing from the fact's title, amount or quotes. */
export function reminderPayload(w: PendingWarning, today: string): NotificationPayload {
  const due = w.occurrence.dueDate;
  const left = daysBetween(today, due);
  const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
  const kind = w.fact.schedule.kind;
  let body: string;
  if (w.warning.milestone === 'opens') body = `A window opens today and closes ${friendlyDate(due)}.`;
  else if (kind === 'window') body = `A window closes ${when} (${friendlyDate(due)}).`;
  else if (kind === 'expiration') body = `Something expires ${when} (${friendlyDate(due)}).`;
  else body = `Something is due ${when} (${friendlyDate(due)}).`;
  return {
    type: 'ledger_reminder',
    title: `Heads-up: ${w.fact.subject}`,
    body,
    url: `/household?factId=${encodeURIComponent(w.fact.id)}`,
    tag: w.key,
  };
}

function occurrenceDateOf(key: string): string | null {
  const m = /@(\d{4}-\d{2}-\d{2})#/.exec(key);
  return m ? m[1] : null;
}

export class LedgerReminderJob {
  private readonly lock = new Mutex();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly store: LedgerStore,
    private readonly families: ReminderFamilies,
    private readonly push: Pick<PushNotificationService, 'sendNotification'>,
  ) {}

  start(): void {
    if (this.timer) return;
    const tick = (): void => {
      this.runOnce().catch(err => log.error({ err }, 'ledger reminder run failed'));
    };
    tick();
    this.timer = setInterval(tick, RUN_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass over every household. Returns how many notifications were sent. */
  async runOnce(now: Date = new Date()): Promise<number> {
    if (etHour(now) < QUIET_UNTIL_HOUR) return 0;
    return this.lock.runExclusive(async () => {
      const today = etDateString(now);
      const keys = await this.dataService.listKeys(FACTS_PREFIX);
      const familyIds = keys.filter(k => !NOT_FACTS.test(k)).map(k => k.slice(FACTS_PREFIX.length));
      let sent = 0;
      for (const familyId of familyIds) {
        try {
          sent += await this.runFamily(familyId, today);
        } catch (err) {
          // One household's bad file must not stop the others' reminders.
          log.error({ err, familyId }, 'ledger reminders failed for family');
        }
      }
      if (sent > 0) log.info({ sent, today }, 'ledger reminders sent');
      return sent;
    });
  }

  private async runFamily(familyId: string, today: string): Promise<number> {
    const family = await this.families.getFamily(familyId);
    if (!family || family.workspaceType === 'business') return 0; // D-H07
    const [{ facts }, prefsFile, sentFile, members] = await Promise.all([
      this.store.read(familyId),
      this.store.readPrefs(familyId),
      this.readSent(familyId),
      this.families.getFamilyMembers(familyId),
    ]);

    let count = 0;
    const cutoff = addOffset(today, { days: -PRUNE_AFTER_DAYS });
    const users: LedgerSentFile['users'] = {};
    for (const member of members) {
      const already = new Set(sentFile.users[member.userId] ?? []);
      for (const w of pendingWarnings(facts, today, already, prefsFile.users[member.userId])) {
        await this.push.sendNotification(member.userId, reminderPayload(w, today));
        already.add(w.key);
        w.supersededKeys.forEach(k => already.add(k));
        count++;
      }
      users[member.userId] = [...already].filter(k => (occurrenceDateOf(k) ?? today) >= cutoff);
    }
    await this.dataService.saveData(ledgerSentKey(familyId), ledgerSentFileSchema.parse({ formatVersion: LEDGER_FORMAT_VERSION, users }));
    return count;
  }

  private async readSent(familyId: string): Promise<LedgerSentFile> {
    const raw = await this.dataService.getData<unknown>(ledgerSentKey(familyId));
    if (raw === null) return { formatVersion: LEDGER_FORMAT_VERSION, users: {} };
    const parsed = ledgerSentFileSchema.safeParse(raw);
    if (!parsed.success) {
      // Refuse rather than start over: an empty log would re-send every warning.
      throw new Error(`${ledgerSentKey(familyId)} failed validation`);
    }
    return parsed.data;
  }
}
