/**
 * Credential redaction for free text (SEC-L004, SEC-P041)
 *
 * agentTraceStore's `redactSensitive` matches on KEY NAMES — `{ accessToken:
 * '...' }` becomes `{ accessToken: '[redacted]' }`. That is the right shape for
 * a tool result, and the wrong shape for a learning: a learning's `title` and
 * `detail` are free text with no keys at all, so the key-matching pass runs over
 * them and changes nothing.
 *
 * So this matches on VALUE SHAPE instead. The patterns are deliberately tight.
 * A redactor that fires on anything long and opaque would gut the diagnostic
 * value of a detail field, and a maintainer who learns that redaction is noise
 * stops reading it.
 *
 * WHAT THIS CANNOT DO, and is not pretending to:
 * SEC-L004 also forbids attachment bytes and extracted attachment text. Neither
 * has a shape. That half rests on the `record_learning` tool description and on
 * the human review step, exactly as the financial-content half does — see
 * TD-029, which says so explicitly rather than implying the filter is complete.
 */

const REDACTED = '[redacted]';

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Plaid tokens. The prefix is the giveaway and it is unambiguous.
  { name: 'plaid', re: /\b(?:access|public|link)-(?:sandbox|development|production)-[0-9a-zA-Z-]{8,}/g },
  // Anthropic API keys.
  { name: 'anthropic', re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  // JWTs — three base64url segments. Session tokens look exactly like this.
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  /**
   * ENCRYPTION_KEY is 32 bytes of hex, i.e. exactly 64 hex characters.
   *
   * A sha256 digest has the same shape, and this app computes those for undo
   * fingerprints. Redacting one costs a diagnostic detail; failing to redact the
   * encryption key costs every Plaid token in the system. The trade is not
   * close.
   */
  { name: 'hex32', re: /\b[0-9a-f]{64}\b/gi },
  // Inline "password: hunter2" / "api_key=abc123" in prose.
  {
    name: 'inline',
    re: /\b(password|passphrase|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer)\b(\s*[:=]\s*|\s+is\s+)\S+/gi,
  },
];

/**
 * Replace credential-shaped substrings with `[redacted]`.
 *
 * Returns the input unchanged when nothing matches, so the common case costs
 * only the scan.
 */
export function redactSecretsInText(text: string): string {
  let out = text;
  for (const { name, re } of PATTERNS) {
    // The inline pattern keeps its label so the reader can tell WHAT was
    // removed — "[redacted]" alone reads as a glitch rather than as a control
    // that fired.
    out =
      name === 'inline'
        ? out.replace(re, (_m, label: string) => `${label}: ${REDACTED}`)
        : out.replace(re, REDACTED);
  }
  return out;
}
