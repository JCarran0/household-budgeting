#!/usr/bin/env tsx
/**
 * Read the AI trace ledger for one family.
 *
 * WHY THIS EXISTS
 * Traces are written to `ai_traces_{familyId}` and nothing reads them. When a
 * chat action failed with "already confirmed or superseded" on 2026-09-14, the
 * only way to find out why was to `aws s3 cp` a 110 KB JSON blob and pick
 * through it by hand. The answer took two minutes once the records were in
 * front of us and twenty to get them there.
 *
 * It is a script and not a route on purpose. This is maintainer-facing
 * diagnostics for a two-person household: an API would need its own
 * authorization story, and the trace store deliberately has no read path the
 * chatbot could ever reach (SEC-P040 — an agent-readable trace store is durable
 * storage for prompt injection).
 *
 * Read-only. Goes through the configured StorageAdapter, so it works against
 * local filesystem (dev) and S3 (prod) exactly like the app:
 *
 *   npx tsx backend/scripts/inspect-traces.ts --list
 *   npx tsx backend/scripts/inspect-traces.ts --family <id> --since 2h
 *   npx tsx backend/scripts/inspect-traces.ts --family <id> --prod --since 3h
 *   npx tsx backend/scripts/inspect-traces.ts --family <id> --prod --trace trace_abc…
 *
 * The proposal timeline prints alongside the traces because the two together
 * are what answer "what did the agent do?" — a nonce burned by a trace that
 * isn't there is the signature of a turn that outlived its request.
 */

import * as path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(__dirname, '..', '.env') });

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

if (has('prod')) {
  const bucket = process.env.PRODUCTION_S3_BUCKET_NAME;
  if (!bucket) {
    console.error('--prod requires PRODUCTION_S3_BUCKET_NAME in env (see backend/.env)');
    process.exit(1);
  }
  process.env.STORAGE_TYPE = 's3';
  process.env.S3_BUCKET_NAME = bucket;
  process.env.S3_PREFIX = process.env.PRODUCTION_S3_PREFIX || 'data/';
  console.log(`[PROD] bucket=${bucket} prefix=${process.env.S3_PREFIX} region=${process.env.AWS_REGION}\n`);
}

import { UnifiedDataService } from '../src/services/dataService';
import type { AgentTrace } from '../src/services/agentTraceStore';
import type { StoredProposal } from '../src/services/chatActions/proposalStore';

const TRACE_PREFIX = 'ai_traces_';
const PROPOSAL_PREFIX = 'ai_proposals_';

/** `--since 90m` / `--since 3h` / `--since 2d`, or an ISO timestamp. */
function parseSince(raw: string | undefined): number {
  if (!raw) return 0;
  const rel = /^(\d+)([mhd])$/.exec(raw);
  if (rel) {
    const n = Number(rel[1]);
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2] as 'm' | 'h' | 'd'];
    return Date.now() - n * unit;
  }
  const abs = Date.parse(raw);
  if (Number.isNaN(abs)) {
    console.error(`Could not read --since "${raw}". Use 90m, 3h, 2d, or an ISO timestamp.`);
    process.exit(1);
  }
  return abs;
}

function short(id: string, chars = 8): string {
  return id.replace(/^trace_/, '').slice(0, chars);
}

function clock(iso: string | number): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
}

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

async function listFamilies(data: UnifiedDataService): Promise<void> {
  const keys = await data.listKeys(TRACE_PREFIX);
  if (keys.length === 0) {
    console.log('No trace files found. (Wrong storage target? Try --prod.)');
    return;
  }
  console.log('Families with traces:\n');
  for (const key of keys) {
    const familyId = key.replace(TRACE_PREFIX, '').replace(/\.json$/, '');
    const traces = (await data.getData<AgentTrace[]>(`${TRACE_PREFIX}${familyId}`)) ?? [];
    const newest = traces[traces.length - 1];
    console.log(
      `  ${familyId}  ${String(traces.length).padStart(4)} traces` +
        (newest ? `  newest ${clock(newest.createdAt)}` : ''),
    );
  }
}

/** The full ledger for one trace — what the model actually saw (REQ-P061). */
function printOneTrace(trace: AgentTrace): void {
  console.log(`\ntrace   ${trace.traceId}`);
  console.log(`when    ${clock(trace.createdAt)}  (${trace.latencyMs} ms)`);
  console.log(`who     user ${trace.userId}  conversation ${trace.conversationId}`);
  console.log(`what    ${trace.model} / ${trace.workloadClass} → ${trace.outcome}` +
    `${trace.proposalIssued ? ` (proposed ${trace.proposalActionId ?? '?'})` : ''}`);
  console.log(`tokens  in ${trace.totalInputTokens} / out ${trace.totalOutputTokens}` +
    `  stop=${trace.finalStopReason ?? 'none'}  iterations=${trace.iterationCount}`);
  if (trace.attachment) {
    console.log(`file    ${trace.attachment.mimeType} ${trace.attachment.bytes} bytes`);
  }
  if (trace.errorMessage) console.log(`error   ${trace.errorMessage}`);

  if (trace.iterations.length > 0) {
    console.log('\niterations');
    for (const it of trace.iterations) {
      console.log(
        `  #${it.iteration}  stop=${pad(it.stopReason ?? 'none', 10)}` +
          `in=${String(it.inputTokens).padStart(6)}  out=${String(it.outputTokens).padStart(5)}` +
          `  cache r/w ${it.cacheReadTokens}/${it.cacheCreationTokens}`,
      );
    }
  }

  console.log('\ntool calls');
  if (trace.toolCalls.length === 0) console.log('  (none)');
  for (const call of trace.toolCalls) {
    console.log(`\n  [${call.sequence}] ${call.toolName}  ${call.latencyMs} ms` +
      `${call.errored ? '  ERRORED' : ''}`);
    console.log(`      input  ${JSON.stringify(call.input)}`);
    console.log(
      call.resultTruncated
        ? `      result [dropped — ${call.resultBytes} bytes, over the trace cap]`
        : `      result ${JSON.stringify(call.result)}`,
    );
  }
  console.log('');
}

async function main(): Promise<void> {
  const data = new UnifiedDataService();

  if (has('list')) {
    await listFamilies(data);
    return;
  }

  const familyId = flag('family');
  if (!familyId) {
    console.error(
      'Usage: inspect-traces.ts --family <id> [--prod] [--since 2h] [--conversation <id>] [--trace <id>]\n' +
        '       inspect-traces.ts --list [--prod]',
    );
    process.exit(1);
  }

  const traces = (await data.getData<AgentTrace[]>(`${TRACE_PREFIX}${familyId}`)) ?? [];
  if (traces.length === 0) {
    console.log(`No traces for family ${familyId}. (Wrong storage target? Try --prod.)`);
    return;
  }

  const wanted = flag('trace');
  if (wanted) {
    const match = traces.find(t => t.traceId === wanted || short(t.traceId) === short(wanted));
    if (!match) {
      console.error(`No trace matching "${wanted}" in ${traces.length} records.`);
      process.exit(1);
    }
    printOneTrace(match);
    return;
  }

  const since = parseSince(flag('since'));
  const conversation = flag('conversation');
  const selected = traces.filter(t => {
    if (Date.parse(t.createdAt) < since) return false;
    if (conversation && !t.conversationId.startsWith(conversation)) return false;
    return true;
  });

  console.log(`${selected.length} of ${traces.length} traces — family ${familyId}\n`);
  console.log(
    `${pad('WHEN (UTC)', 20)}${pad('TRACE', 10)}${pad('CONV', 10)}${pad('MODEL', 18)}` +
      `${pad('LAT', 8)}${pad('OUTCOME', 17)}${pad('STOP', 11)}TOOLS`,
  );
  for (const t of selected) {
    console.log(
      pad(clock(t.createdAt), 20) +
        pad(short(t.traceId), 10) +
        pad(short(t.conversationId), 10) +
        pad(t.model, 18) +
        pad(`${t.latencyMs}ms`, 8) +
        pad(t.outcome + (t.proposalIssued ? ' ✎' : ''), 17) +
        pad(t.finalStopReason ?? '-', 11) +
        (t.toolCalls.map(c => c.toolName).join(' ') || '-') +
        (t.errorMessage ? `  ← ${t.errorMessage}` : ''),
    );
  }

  // The other half of the story. A proposal with no trace beside it is a turn
  // that outlived the request that started it.
  const proposals = (await data.getData<StoredProposal[]>(`${PROPOSAL_PREFIX}${familyId}`)) ?? [];
  const live = proposals.filter(p => {
    if (p.createdAt < since) return false;
    if (conversation && !p.conversationId.startsWith(conversation)) return false;
    return true;
  });

  console.log(`\n${live.length} proposals in the same window (the store keeps 15 minutes)\n`);
  if (live.length > 0) {
    console.log(
      `${pad('WHEN (UTC)', 20)}${pad('NONCE', 10)}${pad('CONV', 10)}${pad('TRACE', 10)}` +
        `${pad('USED', 6)}${pad('ACTIONS', 26)}RESULT`,
    );
    for (const p of live) {
      console.log(
        pad(clock(p.createdAt), 20) +
          pad(short(p.proposal.proposalId), 10) +
          pad(short(p.conversationId), 10) +
          pad(short(p.traceId), 10) +
          pad(p.used ? 'yes' : 'no', 6) +
          pad(Array.from(new Set(p.proposal.rows.map(r => r.actionId))).join('+'), 26) +
          (p.result ? `${p.result.success ? 'ok' : p.result.error}` : '-'),
      );
    }
  }

  console.log('\nFull ledger for one turn:  --trace <id from the TRACE column>');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
