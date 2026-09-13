/**
 * record_learning tool-surface invariants
 *
 * Two decisions in AI-AGENT-LEARNINGS-BRD are enforced by the SHAPE of the tool
 * surface rather than by prompt instruction, because a prompt is a request and a
 * schema is a constraint. Both are easy to erode with a well-meaning edit, so
 * they are asserted here.
 *
 *   D-L01 / REQ-L003 — the agent cannot file a quality incident. It is a reliable
 *   reporter of its own missing tools and an unreliable reporter of its own
 *   mistakes; a self-diagnosis of confabulation is just more confabulation. The
 *   tool exposes no `kind` field at all, so 'capability_gap' is the only thing
 *   it can ever produce.
 *
 *   SEC-L006 — the agent can write learnings and can never read them. A learning
 *   shaped by injected content that could later re-enter context would be prompt
 *   injection with durable storage.
 */

import { CHATBOT_TOOLS } from '../../services/chatbotPrompt';
import { CAPABILITY_KEYS, AgentLearningsStore } from '../../services/agentLearningsStore';

const recordLearning = CHATBOT_TOOLS.find(t => t.name === 'record_learning');

describe('record_learning tool surface', () => {
  it('is registered', () => {
    expect(recordLearning).toBeDefined();
  });

  describe('cannot express a quality incident (D-L01, REQ-L003)', () => {
    it('exposes no kind, status, or source field the model could set', () => {
      const props = Object.keys(recordLearning?.input_schema.properties ?? {});

      expect(props.sort()).toEqual(['capabilityKey', 'detail', 'title']);
      expect(props).not.toContain('kind');
      expect(props).not.toContain('status');
      expect(props).not.toContain('source');
    });

    it('the store method the tool calls is capability-gap specific', () => {
      // A generic `record(kind, ...)` would reopen the door the schema closes.
      const methods = Object.getOwnPropertyNames(AgentLearningsStore.prototype);

      expect(methods).toContain('recordCapabilityGap');
      expect(methods).not.toContain('record');
      expect(methods).not.toContain('recordQualityIncident');
    });
  });

  describe('capabilityKey is a closed enum (REQ-L004)', () => {
    it('constrains the model to the server-side list', () => {
      const schema = recordLearning?.input_schema.properties as
        | Record<string, { enum?: string[] }>
        | undefined;

      expect(schema?.capabilityKey.enum).toEqual([...CAPABILITY_KEYS]);
    });

    it('requires all three fields', () => {
      expect(recordLearning?.input_schema.required?.sort()).toEqual(['capabilityKey', 'detail', 'title']);
    });
  });

  describe('write-only from the agent (SEC-L006)', () => {
    it('exposes no tool that reads learnings back', () => {
      const names = CHATBOT_TOOLS.map(t => t.name);

      expect(names.filter(n => /learning/i.test(n))).toEqual(['record_learning']);
      expect(names.some(n => /(get|list|query|read)_learning/i.test(n))).toBe(false);
    });

    it('the tool description tells the model not to expect a result it can use', () => {
      expect(recordLearning?.description).toMatch(/will not get a response back/i);
    });
  });
});
