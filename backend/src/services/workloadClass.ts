/**
 * Workload classes (AI-CAPABILITY-PLATFORM-BRD REQ-P050).
 *
 * The $20/month cap was sized for a human typing into a chat overlay, where
 * spend is bounded by attention. Unattended work inverts that: spend becomes a
 * function of data volume and a cron schedule, so a single categorization sweep
 * can cost more than a week of conversation.
 *
 * Splitting the budget by workload is what stops a runaway background job from
 * silently spending the month's allowance at 4am and leaving the chatbot dead
 * when someone sits down to ask a question.
 */
export type WorkloadClass =
  /** A person is waiting: chat turns, attachment analysis. */
  | 'interactive'
  /** Nobody is waiting: scheduled digests, unattended automations, sweeps. */
  | 'background';

export const WORKLOAD_CLASSES: readonly WorkloadClass[] = ['interactive', 'background'] as const;

export function isWorkloadClass(value: unknown): value is WorkloadClass {
  return value === 'interactive' || value === 'background';
}
