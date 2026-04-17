/**
 * Chat Action Audit Logging
 *
 * Structured JSON logs for all action confirmations and rejections.
 * Consumed by existing log aggregation (CloudWatch in production).
 *
 * SECURITY (SEC-A017): Every success is logged with userId, familyId,
 *   actionId, proposalId, confirmedParams, source, and the resulting resource.
 * SECURITY (SEC-A018): Every rejection is logged with enough detail for
 *   abuse investigation.
 * SECURITY (SEC-A016): Attachment content is NEVER logged here. Only
 *   metadata (mime, size, page count) is emitted — see chatbot route.
 */

import type { ActionResource } from '../../shared/types';

interface AuditSuccessEntry {
  userId: string;
  familyId: string;
  actionId: string;
  proposalId: string;
  confirmedParams: unknown;
  resource: Pick<ActionResource, 'type' | 'id'>;
}

interface AuditRejectionEntry {
  userId: string;
  actionId: string;
  proposalId: string;
  errorCode: string;
  validationError?: string;
}

/** Log a successful action execution. SEC-A017. */
export function logAuditSuccess(entry: AuditSuccessEntry): void {
  console.log(
    JSON.stringify({
      event: 'chat_action_confirmed',
      timestamp: new Date().toISOString(),
      source: 'chatbot_action_card', // SEC-A017
      ...entry,
    }),
  );
}

/** Log a rejected confirmation (invalid nonce, schema failure, etc.). SEC-A018. */
export function logAuditRejection(entry: AuditRejectionEntry): void {
  console.warn(
    JSON.stringify({
      event: 'chat_action_rejected',
      timestamp: new Date().toISOString(),
      source: 'chatbot_action_card',
      ...entry,
    }),
  );
}
