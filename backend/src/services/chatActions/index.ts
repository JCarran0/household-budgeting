/**
 * Chat Actions — Registry Bootstrap
 *
 * Importing this module registers all V1 chat actions as a side effect.
 * Must be imported at service startup so the registry is populated before
 * any chat request arrives.
 *
 * Registration log at boot: "[chatActions] Registered: create_task"
 */

import './createTaskAction'; // registers via side-effect
import './submitGithubIssueAction'; // registers via side-effect

export * from './registry';
export * from './proposalStore';
export * from './auditLog';

import { listChatActionIds } from './registry';

// Deployment-time sanity check — proves the registry is populated
console.log('[chatActions] Registered:', listChatActionIds().join(', '));
