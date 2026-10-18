/**
 * Answer-trust rules that exist because of a specific wrong answer. The system
 * prompt and the library tool descriptions must say the same thing (see the
 * header of libraryCapabilities.ts), so each rule is checked in both places.
 *
 * 2026-10-18, homeowners/solar question:
 *  - the assistant quoted a document's import summary as the policy's own words
 *    and cited it as "p.summary";
 *  - having called lease compliance "probably fine, not formally verified", it
 *    closed with "the requirement is being met" once a premium receipt arrived —
 *    evidence that proved payment, not coverage.
 */

import { CHATBOT_SYSTEM_PROMPT } from '../../services/chatbotPrompt';
import { LIBRARY_CAPABILITIES } from '../../services/capabilities/libraryCapabilities';

const description = (name: string): string =>
  LIBRARY_CAPABILITIES.find(c => c.name === name)?.definition.description ?? '';

describe('assistant answer rules', () => {
  it('never presents a document summary as the document’s words, in the prompt and both library tools', () => {
    expect(CHATBOT_SYSTEM_PROMPT).toMatch(/summary is the library's own description[^.]*\. Never quote it, attribute it to the document, or cite it as a page/);
    expect(description('list_documents')).toMatch(/summary is the library's description, not the document's text: never quote or cite it/);
    expect(description('read_document')).toMatch(/summary is the library's own description[^]*Never quote it, attribute it to the document, or cite it as a page/);
  });

  it('keeps a conclusion at its stated confidence until evidence addresses that exact point', () => {
    expect(CHATBOT_SYSTEM_PROMPT).toMatch(/New evidence settles only the point it addresses/);
    expect(CHATBOT_SYSTEM_PROMPT).toMatch(/never round it up to "confirmed" or "all clear"/);
  });
});
