/**
 * Proposal Row Construction
 *
 * Turns model-authored `propose_action` input into the server-authored rows a
 * plan card renders (AI-CAPABILITY-PLATFORM-BRD §5).
 *
 * SECURITY (SEC-P010): rows are built here, not accepted here. The model
 * supplies an actionId, params, a summary and display fields; everything that
 * carries authority — the action's human label, the row ids, the current-value
 * comparison — is resolved from the registry. A row this module cannot fully
 * render is rejected outright rather than truncated, because a truncated row is
 * a row the user approved without seeing.
 *
 * SECURITY (SEC-A004): every row's params go through that action's Zod schema
 * before the card is issued, and again at confirm time (REQ-P024). Validation
 * here is what makes the card honest; validation there is what makes it safe.
 */

import type { ActionProposalInput, ChatActionId, DisplayField, ProposalRow } from '../../shared/types';
import { getChatAction, type ChatActionHandlerContext } from './registry';

/**
 * Opaque identifiers. The raw value is a UUID no human can check, so the model's
 * resolved name ("Buy milk") is the only readable rendering and is kept.
 *
 * This is the ONE place a display value is still model-authored, and it is a
 * deliberate, bounded residual: an id cannot carry a payload, and SEC-P011's
 * server-authored `currentValues` is what shows the user which record is
 * actually about to change. Every other param is rendered from the parsed
 * params below.
 */
const IDENTIFIER_KEY = /(^|[a-z])Id$/;

/** Above this, a value is treated as long-form text rather than a one-liner. */
const TEXTAREA_THRESHOLD = 120;

function isScalar(v: unknown): boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/**
 * SEC-P010, the part the coverage check was missing.
 *
 * Requiring a display field per param proves a field EXISTS. It says nothing
 * about what is in it, and the model authored both halves — so a card could
 * show `Details: "Describes 9 transactions…"` while `params.body` carried 1,742
 * characters of markdown bound for a public GitHub repo. That is exactly the
 * "plausible title, unseen payload" shape the coverage check was written to
 * stop, and it shipped anyway because presence and fidelity are different
 * properties.
 *
 * So the server renders the value from the parsed params and the model keeps
 * only the LABEL. Returning null means "the server has no faithful rendering of
 * this and the model's text stands" — true for identifiers and for absent
 * values, and for nothing else.
 */
function renderParamValue(key: string, value: unknown): string | null {
  if (IDENTIFIER_KEY.test(key)) return null;
  // Absent carries no payload: there is nothing here for a user to review.
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') return value.length > 0 ? value : '(empty)';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every(isScalar)) {
    return value.length > 0 ? value.join(', ') : '(none)';
  }
  // Nested structures — subTasks, say. JSON is ugly on a card and honest on a
  // card, and between those two, a write the user has actually seen wins.
  return JSON.stringify(value);
}

/**
 * Hard ceiling on rows in one card. Well above the SEC-P012 legibility
 * threshold of 25 (which changes the *rendering*, not the limit) and far below
 * anything that would make a single Confirm click unreviewable in principle.
 */
export const MAX_PROPOSAL_ROWS = 100;

export type BuildRowsResult =
  | { ok: true; rows: ProposalRow[] }
  | { ok: false; error: string };

/**
 * SEC-P010: a field the card cannot render is a field the user cannot review.
 *
 * An empty `value` is rejected along with a missing one: an empty string is a
 * string, so it passes a naive type check and then renders as nothing — the
 * exact "field present, content invisible" shape this guard exists to stop.
 */
function isRenderableField(field: unknown): field is DisplayField {
  if (typeof field !== 'object' || field === null) return false;
  const f = field as Record<string, unknown>;
  return (
    typeof f.key === 'string' && f.key.length > 0 &&
    typeof f.label === 'string' && f.label.length > 0 &&
    typeof f.value === 'string' && f.value.trim().length > 0
  );
}

/**
 * SEC-P010, the part that actually matters: every value that will be WRITTEN
 * must appear on the card.
 *
 * Shape-checking the display fields is not enough on its own. The dangerous
 * proposal is not a malformed row — it is a well-formed row that shows the user
 * a plausible title while `params` carries a 64 KB body they never see. That is
 * a one-click exfiltration primitive for any action with an outbound effect
 * (submit_github_issue posts to a public-ish repo), and injected content in an
 * uploaded receipt is enough to author it.
 *
 * So the rule is coverage, not presence: each key in the SERVER-PARSED params
 * must have a display field. Parsed, not raw — Zod has already dropped unknown
 * keys, so this describes exactly what the handler will receive.
 */
function findUndisplayedParams(
  params: Record<string, unknown>,
  fields: DisplayField[],
): string[] {
  const shown = new Set(fields.map(f => f.key));
  return Object.keys(params).filter(
    key => params[key] !== undefined && !shown.has(key),
  );
}

/**
 * The mirror of the coverage rule: a field that names no param.
 *
 * Coverage stops a param from being hidden. This stops the opposite trick —
 * a field the user reads as part of the write ("Repository: JCarran0/…") that
 * corresponds to nothing and is therefore unconstrained model prose sitting in
 * the middle of an approval surface. After this, a card is strictly a view of
 * the params plus the server's own current-value comparison.
 */
function findFieldsWithoutParams(
  params: Record<string, unknown>,
  fields: DisplayField[],
): string[] {
  return fields.filter(f => !(f.key in params)).map(f => f.key);
}

interface RawRow {
  actionId: ChatActionId;
  params: Record<string, unknown>;
  displaySummary: string;
  displayFields: DisplayField[];
}

/** The top-level fields are always row 0; additionalActions extend the plan. */
function flatten(input: ActionProposalInput): RawRow[] {
  const extra = Array.isArray(input.additionalActions) ? input.additionalActions : [];
  return [
    {
      actionId: input.actionId,
      params: input.params,
      displaySummary: input.displaySummary,
      displayFields: input.displayFields,
    },
    ...extra,
  ];
}

export async function buildProposalRows(
  input: ActionProposalInput,
  ctx: ChatActionHandlerContext,
): Promise<BuildRowsResult> {
  const raw = flatten(input);

  if (raw.length > MAX_PROPOSAL_ROWS) {
    return {
      ok: false,
      error:
        `A proposal may contain at most ${MAX_PROPOSAL_ROWS} rows (got ${raw.length}). ` +
        `Split this into smaller batches and propose them one at a time.`,
    };
  }

  const rows: ProposalRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const where = raw.length === 1 ? '' : ` (row ${i + 1})`;

    const def = getChatAction(r.actionId);
    if (!def) {
      return { ok: false, error: `Unknown actionId${where}: "${String(r.actionId)}".` };
    }

    const parsed = def.paramsSchema.safeParse(r.params);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Invalid params for ${r.actionId}${where}: ${parsed.error.message}. Retry with corrected values.`,
      };
    }

    const summary = typeof r.displaySummary === 'string' ? r.displaySummary.trim() : '';
    if (!summary) {
      return {
        ok: false,
        error: `displaySummary${where} must be a non-empty string describing what this row writes.`,
      };
    }

    // Not `Array.isArray(...) ? ... : []` — a non-array displayFields must be an
    // error, not silently coerced into "this row has nothing to show".
    if (!Array.isArray(r.displayFields)) {
      return { ok: false, error: `displayFields${where} must be an array.` };
    }
    const fields: DisplayField[] = r.displayFields;
    if (!fields.every(isRenderableField)) {
      return {
        ok: false,
        error:
          `Every displayField${where} must be { key, label, value } with non-empty string ` +
          `values. Resolve IDs to human-readable names before proposing.`,
      };
    }

    // A duplicated key renders as one row in React (same key) — a field the user
    // was meant to review would silently disappear.
    const keys = fields.map(f => f.key);
    const duplicate = keys.find((k, idx) => keys.indexOf(k) !== idx);
    if (duplicate) {
      return { ok: false, error: `Duplicate displayField key${where}: "${duplicate}".` };
    }

    const parsedParams = parsed.data as Record<string, unknown>;
    const undisplayed = findUndisplayedParams(parsedParams, fields);
    if (undisplayed.length > 0) {
      return {
        ok: false,
        error:
          `These ${r.actionId} params${where} would be written but are not shown on the card: ` +
          `${undisplayed.join(', ')}. Every value you propose to write must have a displayField, ` +
          `so the user approves what they can actually see.`,
      };
    }

    const orphaned = findFieldsWithoutParams(parsedParams, fields);
    if (orphaned.length > 0) {
      return {
        ok: false,
        error:
          `These displayField keys${where} are not params of ${r.actionId}: ${orphaned.join(', ')}. ` +
          `A card shows what will be written and nothing else — drop them.`,
      };
    }

    // The values are now the server's, not the model's (SEC-P010).
    const displayed = fields.map(f => {
      const rendered = renderParamValue(f.key, parsedParams[f.key]);
      if (rendered === null) return f;
      return {
        ...f,
        value: rendered,
        // A 1,700-character body in a single-line text input is unreviewable
        // and uneditable. The server knows how long the value is, so it, not
        // the model, decides how the field is rendered.
        type: rendered.length > TEXTAREA_THRESHOLD ? ('textarea' as const) : f.type,
      };
    });

    // SEC-P011. Only the action itself can say what it is about to overwrite,
    // and only the server can be trusted to say it — there is deliberately no
    // tool-schema field through which the model could supply this.
    let currentValues: DisplayField[] | undefined;
    if (def.describeCurrent) {
      try {
        const current = await def.describeCurrent(parsed.data, ctx);
        if (current && current.length > 0) currentValues = current;
      } catch {
        // A failed lookup must not take down the proposal. The row still shows
        // what it will write; it just cannot show what it replaces. Swallowed
        // deliberately rather than surfaced as a tool error, because the model
        // cannot do anything useful with "the read failed".
        currentValues = undefined;
      }
    }

    rows.push({
      rowId: `row-${i}`,
      actionId: r.actionId,
      label: def.label, // Registry-owned, never model-authored (SEC-P010)
      params: parsedParams,
      displaySummary: summary,
      displayFields: displayed,
      ...(currentValues ? { currentValues } : {}),
    });
  }

  return { ok: true, rows };
}
