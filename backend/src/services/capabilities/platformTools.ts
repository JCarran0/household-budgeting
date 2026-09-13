/**
 * Platform tool definitions.
 *
 * These are not capabilities. propose_action is intercepted and never executed
 * (SEC-A001); record_learning writes to a maintainer-facing collection and
 * touches no family data. Both are kept apart from READ_CAPABILITIES so that
 * "what data can the model read?" has a single, complete answer.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CAPABILITY_KEYS } from '../agentLearningsStore';

export const RECORD_LEARNING_TOOL: Anthropic.Tool = {
    name: 'record_learning',
    description:
      'Record that you were unable to do something the user asked for because you lack the capability — no tool exists for it, or the tools you have cannot reach the data. ' +
      'Use this ONLY for missing capabilities. Do NOT use it to report that you made a mistake, gave a wrong answer, or misused a tool you do have — you cannot reliably diagnose your own errors, and a human reviews those separately from the conversation record. ' +
      'Do not record a gap for something you CAN do but chose not to. ' +
      'Call this at most once per conversation, and only when the gap actually blocked you. The user sees a short notice that you noted it; you will not get a response back and nothing changes for them right now.',
    input_schema: {
      type: 'object' as const,
      properties: {
        capabilityKey: {
          type: 'string',
          enum: [...CAPABILITY_KEYS],
          description: 'Which area of the app you could not reach. Use "other" only if nothing else fits.',
        },
        title: {
          type: 'string',
          description: 'One short line naming the missing capability, e.g. "Cannot read the family task list". Phrase it the same way each time so repeats are recognized as the same gap.',
        },
        detail: {
          type: 'string',
          description: 'What the user asked for, what you tried, and what specifically you would have needed. Do not include the raw contents of any attachment.',
        },
      },
      required: ['capabilityKey', 'title', 'detail'],
    },
  };

export const PROPOSE_ACTION_TOOL: Anthropic.Tool = {
    // SECURITY (SEC-A003): actionId is a strict enum. Any other value causes the
    // tool call to fail at the Claude SDK schema level before the backend ever
    // runs registry validation. Backend still re-checks as defense in depth.
    name: 'propose_action',
    description:
      'Propose an action for the user to confirm. You NEVER execute actions — the user must click Confirm. Use this when the user clearly intends to create/modify something (e.g., a task), when an uploaded attachment maps to an enabled action, or when the user is reporting a bug / requesting a feature (submit_github_issue). ONE proposal per turn. If a proposal is already pending and the user asks to change it, call this tool again with adjusted params; the prior proposal will be superseded.',
    input_schema: {
      type: 'object' as const,
      properties: {
        actionId: {
          type: 'string',
          enum: ['create_task', 'submit_github_issue'],
          description: 'The action to propose. Must be from the allowlist.',
        },
        params: {
          type: 'object' as const,
          description:
            'Fields for the target action. For create_task: { title (required), description?, dueDate? (YYYY-MM-DD), assigneeId?, scope? (family|personal), tags?, subTasks? }. For submit_github_issue: { title (required), body (required, markdown), labels (required, array containing "bug" or "enhancement") }. Server validates and rejects invalid values.',
        },
        displaySummary: {
          type: 'string',
          description:
            'Short human-readable summary shown on the action card (max 200 chars). Example: "Create task: PTA donation — due May 1".',
        },
        displayFields: {
          type: 'array',
          description: 'Fields to render in the card preview (max 20 items).',
          items: {
            type: 'object' as const,
            properties: {
              key:      { type: 'string', description: 'Param field name' },
              label:    { type: 'string', description: 'Human-readable label (e.g. "Due date")' },
              value:    { type: 'string', description: 'Formatted display value' },
              editable: { type: 'boolean', description: 'Whether Edit mode shows this field' },
              type: {
                type: 'string',
                enum: ['text', 'textarea', 'date', 'select', 'tags'],
                description: 'Input type for Edit mode',
              },
            },
            required: ['key', 'label', 'value', 'editable', 'type'],
          },
        },
        reasoning: {
          type: 'string',
          description:
            'Brief plain-language justification for why this action fits (max 500 chars). Shown under a collapsed "Why?" on the card.',
        },
      },
      required: ['actionId', 'params', 'displaySummary', 'displayFields', 'reasoning'],
    },
  };
