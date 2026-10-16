import type {
  ClassificationBucket,
  ClassificationOutcomeInput,
  ClassifyTransactionsResponse,
} from '../../../../shared/types';
import type { BucketApplySelection } from './BucketReviewStep';

/**
 * Every row of a bucket gets an outcome: what was applied, or null for a row
 * the user skipped. The server derives accepted vs changed from the stored
 * suggestion (AI-CATEGORIZATION-BRD REQ-131).
 */
export function bucketOutcomes(
  bucket: ClassificationBucket,
  applied: BucketApplySelection[],
): ClassificationOutcomeInput[] {
  const byTxn = new Map(applied.map(s => [s.transactionId, s]));
  return bucket.transactions.map(t => {
    const s = byTxn.get(t.id);
    return s
      ? { transactionId: t.id, categoryId: s.categoryId, ...(s.note ? { note: s.note } : {}) }
      : { transactionId: t.id, categoryId: null };
  });
}

/** Rows the user applied to a category other than the AI's suggestion. */
export function countChanged(bucket: ClassificationBucket, applied: BucketApplySelection[]): number {
  const suggested = new Map(bucket.transactions.map(t => [t.id, t.suggestedCategoryId]));
  return applied.filter(s => s.categoryId !== suggested.get(s.transactionId)).length;
}

export const LOW_CONFIDENCE_REASON = 'The AI wasn’t confident enough to suggest a category.';

/**
 * Why each Unsure row is there, counted (REQ-104). A failed row carries its
 * failure reason; a low-confidence row has a suggestion the AI didn't stand
 * behind.
 */
export function unsureReasons(result: ClassifyTransactionsResponse): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of result.unsureBucket.transactions) {
    const reason = t.failureReason ?? LOW_CONFIDENCE_REASON;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}

export function mergeCounts(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, (out.get(k) ?? 0) + v);
  return out;
}
