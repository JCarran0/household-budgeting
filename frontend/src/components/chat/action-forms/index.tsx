/**
 * Action form registry — maps each ChatActionId to its edit-form component.
 *
 * Adding a new action requires exactly one change here (plus creating the
 * form component). ActionCard.tsx looks up forms via this registry and never
 * hard-codes actionId checks, satisfying the "three-touch extensibility"
 * criterion from the BRD success criteria.
 */
import type { FC } from 'react';
import type { ChatActionId } from '../../../../../shared/types';
import { TaskActionCardEditForm } from './TaskActionCardEditForm';

export interface ActionFormProps {
  /** Pre-filled values from the LLM proposal */
  initialValues: Record<string, unknown>;
  /** Receives the submitted values typed as Record<string, unknown> to satisfy
   *  the registry contract. Individual form components cast internally. */
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
  loading: boolean;
}

// Adapter wraps each typed form component so its onSubmit receives typed
// values but still satisfies the registry's generic ActionFormProps contract.
// This is the "three-touch extensibility" pattern: to add a new action, create
// a form component + add one entry here.
const FORM_REGISTRY: Record<ChatActionId, FC<ActionFormProps>> = {
  create_task: ((props: ActionFormProps) => (
    <TaskActionCardEditForm
      initialValues={props.initialValues}
      onSubmit={(v) => props.onSubmit(v as unknown as Record<string, unknown>)}
      onCancel={props.onCancel}
      loading={props.loading}
    />
  )) as FC<ActionFormProps>,
};

/**
 * Returns the edit-form component for the given actionId, or null if no
 * form is registered (should not happen for valid V1 actionIds).
 */
export function getActionForm(actionId: ChatActionId): FC<ActionFormProps> | null {
  return FORM_REGISTRY[actionId] ?? null;
}
