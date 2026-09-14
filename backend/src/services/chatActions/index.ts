/**
 * Chat Actions — Registry Bootstrap
 *
 * Importing this module registers all V1 chat actions as a side effect.
 * Must be imported at service startup so the registry is populated before
 * any chat request arrives.
 *
 * Registration log at boot lists every registered actionId.
 */

import './createTaskAction'; // registers via side-effect
import './updateTaskAction'; // registers via side-effect
import './completeTaskAction'; // registers via side-effect
import './transactionMetadataActions'; // registers via side-effect
import './tripStopActions'; // registers via side-effect
import './projectLineItemAction'; // registers via side-effect
import './submitGithubIssueAction'; // registers via side-effect

export * from './registry';
export * from './tiers';
export * from './executionGrant';
export * from './proposalStore';
export * from './proposalRows';
export * from './auditLog';

import { listChatActionIds } from './registry';
import { childLogger } from '../../utils/logger';

const log = childLogger('chatActions');

// Deployment-time sanity check — proves the registry is populated
log.info({ registered: listChatActionIds() }, 'chat actions registered');
