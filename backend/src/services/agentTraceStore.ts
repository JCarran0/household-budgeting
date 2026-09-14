/**
 * AgentTraceStore — Structured Trace Capture for AI Requests
 *
 * Implements AI-CAPABILITY-PLATFORM-BRD §10.1 (REQ-P060 – REQ-P063).
 *
 * WHY THIS EXISTS
 * The Subaru incident (BRD §15.1) took an hour to diagnose because the evidence
 * was gone: the only way to answer "what did the model actually see when it said
 * $500?" was to reverse-engineer tool return shapes by hand. A trace makes that
 * question a lookup. The diagnostic value is almost entirely in the tool-call
 * ledger — the raw results handed to the model — not in the prose it produced.
 *
 * SECURITY BOUNDARY
 * - SEC-P040: traces are written to a dedicated per-family store, NOT to the
 *   application log stream. CloudWatch has broad access and long retention;
 *   these records contain family financial data and must have neither.
 * - SEC-P041: sensitive keys are redacted on the way in, and attachments are
 *   recorded as metadata only — never bytes, never extracted text. This
 *   preserves SEC-A014 and SEC-A016, which a naive trace would violate.
 * - SEC-P042: every record is family-scoped by storage key.
 *
 * This class receives the writable DataService because it must persist, but it
 * is a narrow appender over one key namespace (`ai_traces_{familyId}`) rather
 * than a general write capability handed to the chatbot. Same reasoning as
 * ChatbotCostTracker. The SEC-018 boundary protecting user financial data in
 * ChatbotDataService is untouched.
 */

import { Mutex } from 'async-mutex';
import { randomUUID } from 'crypto';
import type { DataService } from './dataService';
import type { WorkloadClass } from './workloadClass';
import { childLogger } from '../utils/logger';
import { redactSecretsInText } from '../utils/redaction';

const log = childLogger('agentTraceStore');

// REQ-P050: traces and spend are attributed on the same axis, so the type has
// one home and both import it.
export type { WorkloadClass } from './workloadClass';

export interface TraceToolCall {
  sequence: number;
  toolName: string;
  /** Arguments as the model supplied them, redacted. */
  input: unknown;
  /**
   * The result verbatim as it was returned to the model (REQ-P061), redacted.
   * Null when `resultTruncated` is true and the payload exceeded the cap.
   */
  result: unknown;
  resultTruncated: boolean;
  resultBytes: number;
  latencyMs: number;
  errored: boolean;
}

export interface TraceIteration {
  iteration: number;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface AgentTrace {
  traceId: string;
  familyId: string;
  userId: string;
  conversationId: string;
  workloadClass: WorkloadClass;
  model: string;
  createdAt: string;
  latencyMs: number;
  iterationCount: number;
  finalStopReason: string | null;
  iterations: TraceIteration[];
  toolCalls: TraceToolCall[];
  totalInputTokens: number;
  totalOutputTokens: number;
  outcome: 'message' | 'action_proposal' | 'error';
  proposalIssued: boolean;
  proposalActionId: string | null;
  /** Metadata only — never bytes or extracted text (SEC-P041). */
  attachment: { mimeType: string; bytes: number } | null;
  errorMessage: string | null;
  /**
   * Set when a learning references this trace. Pinned traces survive retention
   * pruning (REQ-P063) so evidence does not expire out from under an open item.
   */
  pinned: boolean;
}

/** REQ-P063 */
const RETENTION_DAYS = 30;
/** Belt-and-braces bound so one chatty month cannot grow the file without limit. */
const MAX_TRACES_PER_FAMILY = 1000;
/**
 * Per-result cap. REQ-P061 wants results verbatim, and truncation genuinely does
 * cost diagnostic value — but an uncapped ledger would persist every transaction
 * the model ever read. Oversized results are dropped and explicitly marked rather
 * than silently shortened, so a reader always knows the difference between "this
 * is what the model saw" and "this is a fragment of it".
 */
const MAX_RESULT_BYTES = 64_000;

const SENSITIVE_KEY = /(access[_-]?token|refresh[_-]?token|secret|password|passphrase|api[_-]?key|authorization|encryption[_-]?key|credential|cookie|bearer)/i;
const REDACTED = '[redacted]';
const MAX_REDACT_DEPTH = 12;

/**
 * Deep-redact values whose key names suggest a credential (SEC-P041).
 *
 * Defensive rather than exhaustive: the chatbot's read-only tools should never
 * return a token in the first place (SEC-002), so anything caught here is
 * already an upstream bug. Redacting is cheap; persisting a token is not.
 */
export function redactSensitive(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_REDACT_DEPTH) return '[max depth]';
  // Key-name matching misses a credential that arrives as the VALUE under an
  // innocent key — `{ note: 'use access-production-abc123' }` was being stored
  // verbatim. The text pass catches it by shape (TD-029).
  if (typeof value === 'string') return redactSecretsInText(value);
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map(v => redactSensitive(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactSensitive(v, depth + 1, seen);
  }
  return out;
}

/** Build a ledger entry, applying redaction and the size cap. */
export function buildToolCallEntry(args: {
  sequence: number;
  toolName: string;
  input: unknown;
  result: unknown;
  latencyMs: number;
  errored?: boolean;
}): TraceToolCall {
  const redactedResult = redactSensitive(args.result);
  const serialized = safeStringify(redactedResult);
  const tooLarge = serialized.length > MAX_RESULT_BYTES;

  return {
    sequence: args.sequence,
    toolName: args.toolName,
    input: redactSensitive(args.input),
    result: tooLarge ? null : redactedResult,
    resultTruncated: tooLarge,
    resultBytes: serialized.length,
    latencyMs: args.latencyMs,
    errored: args.errored ?? false,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

export function newTraceId(): string {
  return `trace_${randomUUID()}`;
}

export class AgentTraceStore {
  private mutex = new Mutex();

  constructor(private readonly dataService: DataService) {}

  private key(familyId: string): string {
    return `ai_traces_${familyId}`;
  }

  /**
   * Append a trace, pruning expired records in the same pass.
   *
   * Never throws. A trace is diagnostic exhaust — losing one is a nuisance,
   * failing a user's request because the exhaust could not be written is not
   * an acceptable trade.
   */
  async record(trace: AgentTrace): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const existing = (await this.dataService.getData<AgentTrace[]>(this.key(trace.familyId))) ?? [];
      const kept = this.applyRetention([...existing, trace]);
      await this.dataService.saveData(this.key(trace.familyId), kept);
    } catch (error) {
      log.error({ err: error, traceId: trace.traceId, familyId: trace.familyId }, 'failed to record agent trace');
    } finally {
      release();
    }
  }

  async get(familyId: string, traceId: string): Promise<AgentTrace | null> {
    const all = (await this.dataService.getData<AgentTrace[]>(this.key(familyId))) ?? [];
    return all.find(t => t.traceId === traceId) ?? null;
  }

  /** Most recent first. */
  async list(familyId: string, limit = 50): Promise<AgentTrace[]> {
    const all = (await this.dataService.getData<AgentTrace[]>(this.key(familyId))) ?? [];
    return [...all]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Exempt a trace from retention pruning (REQ-P063). Called when a learning
   * references it, so evidence outlives the 30-day window while the item is open.
   */
  async pin(familyId: string, traceId: string): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      const all = (await this.dataService.getData<AgentTrace[]>(this.key(familyId))) ?? [];
      const target = all.find(t => t.traceId === traceId);
      if (!target) return false;
      target.pinned = true;
      await this.dataService.saveData(this.key(familyId), all);
      return true;
    } finally {
      release();
    }
  }

  /**
   * Drop traces past the retention window, then cap the total.
   *
   * Pinned traces are exempt from the age cut. They are NOT exempt from the
   * hard count cap — an unbounded pinned set would defeat the bound entirely —
   * but they are evicted last.
   */
  private applyRetention(traces: AgentTrace[], now = Date.now()): AgentTrace[] {
    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const withinWindow = traces.filter(t => {
      if (t.pinned) return true;
      const created = Date.parse(t.createdAt);
      return Number.isNaN(created) ? true : created >= cutoff;
    });

    if (withinWindow.length <= MAX_TRACES_PER_FAMILY) return withinWindow;

    // Over the cap: evict oldest unpinned first, and only then oldest pinned.
    const byAge = [...withinWindow].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const excess = withinWindow.length - MAX_TRACES_PER_FAMILY;
    const doomed = new Set<string>();

    for (const t of byAge) {
      if (doomed.size >= excess) break;
      if (!t.pinned) doomed.add(t.traceId);
    }
    for (const t of byAge) {
      if (doomed.size >= excess) break;
      doomed.add(t.traceId);
    }

    return withinWindow.filter(t => !doomed.has(t.traceId));
  }
}
