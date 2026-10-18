# Family Library — Business Requirements Document

**Author:** Jared Carrano
**Date:** 2026-10-17
**Version:** 1.0 (discovery)
**Plan:** [FAMILY-LIBRARY-PLAN.yaml](FAMILY-LIBRARY-PLAN.yaml)

> This document states what the system must do and why. How it is built, what
> has shipped, and in what order lives in the plan.

---

## 1. Overview

### 1.1 Vision

Family Tracker covers money (budgets, Plaid), time (tasks), and plans (trips, projects). The missing pillar is **what the family owns and what it has signed**: cars, the house, the solar system, major appliances, and the leases, warranties, policies, and service plans attached to them.

The facts that matter about those things — the early-termination fee, the powertrain warranty mileage, the deductible, the buyout window — are buried in documents that already live in Google Drive. They are hard to find at exactly the moments they are needed: on hold with an insurer, standing over a broken dishwasher, at a dealer's service desk.

### 1.2 Problem Statement

The core job is **find the facts fast**: ask an arbitrary natural-language question of the family's documents and get a trustworthy, cited answer. (D-F01)

Today the chatbot can answer questions about a single PDF attached to a message (≤10 MB / 20 pages), but only if the user already knows which document holds the answer and goes and fetches it. There is no standing corpus.

### 1.3 Solution Summary

A **library**: extracted, redacted text of selected family documents, stored under the app's data prefix, readable by the assistant through read-only tools, with every answer cited back to the Drive original.

Phase 1 deliberately has **no Google integration in the app**. Documents are extracted by the maintainer in a Claude Code session (which already has Drive access), staged locally, reviewed, and pushed by a gated command. The originals stay in Drive; the app stores text only. (D-F02)

### 1.4 Users

| Actor | Role |
|-------|------|
| Both household users | Ask questions of the library through the assistant. Follow citations back to Drive. |
| Maintainer (Jared) | Selects documents, runs ingest, reviews redaction counts, pushes to production, maintains the golden question set. |
| The assistant | Lists and reads library documents (T0). Never writes to the library. |

---

## 2. Roadmap

| Phase | Scope | Exit signal |
|-------|-------|-------------|
| **1. Library** | `/import-document` → redacted text in storage; assistant read tools; citations; per-document golden questions. First corpus: solar documents, Rivian R2 extended service/warranty | The library gets used for real questions, and answers hold up against the golden set |
| **2. Facts** | AI proposes key dates/terms from library docs for confirmation, seeding Assets, Agreements, and dated obligations that generate tasks and push reminders. Passport expiry returns here as a confirmed fact, not a scanned doc | Reminders fire for real obligations (warranty expiry, registration, lease milestones) |
| **3. Money links** | Agreements ↔ recurring transactions (e.g. solar payment); purchase → "track a warranty?" prompts (Plaid + Amazon receipts); per-asset cost of ownership | — |
| **4. Estate documents** | Wills, trusts, POA. Dedicated phase with stricter handling than the rest of the library — highest sensitivity, highest cost of a wrong answer | — |
| **Later / triggered** | In-app upload or Drive sync — triggered when a non-maintainer user wants to add a document themselves | "I wish I could just add this" |

Phases 2+ are directional; each gets its own refinement pass before build.

**Motivating Phase 2 case (found 2026-10-17 while importing the solar documents):** the family's own production log shows about 5,930 kWh over the first 12 months, against a CAP-package year-1 estimate of 9,047 kWh. The lease guarantees 90% of estimate, audited every 2 years and refunded at $0.110/kWh, with a cumulative year-2 guarantee of 16,244 kWh. Nobody would have connected a spreadsheet to a clause on page 16. Phase 2 should make "actual vs. guaranteed" a tracked obligation, with the audit date as a reminder.

---

## 3. Phase 1 Requirements

### 3.1 Ingest

- **REQ-F001** Documents are imported one at a time by the source-controlled `/import-document` skill (`.claude/skills/import-document/`), not by ad-hoc sessions. Sources are a Drive link or a local PDF. Raw extracted text lives only in the session scratchpad and is never committed. (D-F07)
- **REQ-F002** Each document becomes one library entry conforming to the format in §4. Page boundaries are preserved as markers so answers can cite pages.
- **REQ-F003** Re-importing is idempotent: an unchanged source (Drive `modifiedTime`, or sha256 for a local file) writes nothing; the same source cannot be imported under two ids. (D-F03)
- **REQ-F004** The production push is a maintainer-run command; the agent prepares and verifies but does not write to production.
- **REQ-F005** Library entries are ordinary keys under the existing data prefix, so versioning, IAM, snapshots, `sync:production` and `backup:local` cover them unchanged. (D-F08)
- **REQ-F006** Everything that must not depend on model judgment — redaction, counts, validation, duplicate detection, the production write — lives in code (`npm run library`, `libraryValidators.ts`), not in the skill's prose.

### 3.2 Redaction

- **REQ-F010** Redaction runs at ingest, by value **shape**, via `backend/src/utils/redaction.ts`. Redacted: SSNs, full bank account numbers, routing numbers, card numbers. Kept: VINs, policy numbers, contract numbers. (D-F04)
- **REQ-F011** Each redaction is replaced by a **typed marker** that preserves the last 4 where applicable: `[REDACTED:bank_account …4821]`. SSNs keep no digits — the last 4 is itself an identity-verification secret. Untyped masks (`****`) are not permitted — in this codebase asterisks already mean institution-side masking.
- **REQ-F012** Each document records redaction counts by type, and validation rejects counts that disagree with the markers in the body. Import shows every redaction in context, plus every surviving 8+ digit run, for maintainer review before push.
- **REQ-F013** The library never stores a redacted value or a mapping back to one. Drive is the faithful copy.

### 3.3 Scope

- **REQ-F020** In scope (D-F05):
  - **Vehicles** — purchase/lease agreements, warranties, extended service plans, insurance policies, service records
  - **Home** — solar lease, home insurance, home warranty, HOA documents, contractor agreements
  - **Major purchases** — warranties, receipts, manuals for major appliances and electronics
  - **Health plan benefit summaries** — plan documents only
- **REQ-F021** Out of scope for Phase 1: tax returns, medical records/claims, IDs and passports, estate documents.

### 3.4 Assistant

- **REQ-F030** Two T0 tools: `list_documents` (catalog: id, title, type, summary, ingest date, redaction counts) and `read_document` (full text by id, with page markers).
- **REQ-F031** Library access goes through `ReadOnlyDataService`. The assistant has no write path to the library.
- **REQ-F032** The business workspace has no library access (enforced by the existing route-level refusal).
- **REQ-F033** A document may declare `amends: [docId…]`. Where an amending document conflicts with the one it amends, the amending document governs, and the assistant says so when the difference matters. Referenced documents must exist before an amending document is staged or pushed. (D-F09)

### 3.5 Answer Trust (D-F06)

- **REQ-F040** Every answer drawn from the library cites document title, section/page, and ingest date, and links to the Drive source.
- **REQ-F041** Dollar amounts, dates, deadlines, mileage, and percentages are **quoted verbatim** from the source clause, not paraphrased.
- **REQ-F042** When the library does not answer the question, the assistant says so and names the documents it checked. It does not fill the gap from general knowledge; any general context is explicitly labeled as not from the family's documents.
- **REQ-F043** When the answer involves a redacted value, the assistant states what was withheld (type, last 4) and points to the source page, rather than claiming the document is silent.
- **REQ-F044** Each import collects 2–3 golden questions for that document, with answers that never come from the model that extracted it. Either a human supplies them from the source, or two subagents on *different* models answer independently from the **original PDF** (never the staged transcription, never each other's output) and a human approves the side-by-side comparison, settling any disagreement from the source. The independence is what breaks the circularity: a transcription error cannot appear in both the body and the answer key. The set grows with the library and is re-run after each import or prompt change. Golden answers contain real contract figures and live in data storage, never in git.

---

## 4. Library File Format

The authoritative definition is `backend/src/validators/libraryValidators.ts`; this section summarizes it.

| Key | Contents |
|-----|----------|
| `library_{familyId}_{docId}` | One document |
| `library_evals_{familyId}_{docId}` | That document's golden questions. Deliberately outside the `library_{familyId}_` prefix, so listing a family's documents can never surface eval answers |

```json
{
  "formatVersion": 1,
  "docId": "solar-lease",
  "title": "Solar Lease Agreement",
  "domain": "home",
  "kind": "solar_lease",
  "subject": "Rooftop solar system",
  "summary": "20-year residential lease. Monthly payment with annual escalator, production guarantee, transfer-on-sale terms, end-of-term options.",
  "effectiveDate": "2023-04-01",
  "source": { "kind": "drive", "fileId": "1AbC…", "url": "https://drive.google.com/…", "modifiedTime": "2023-04-02T18:11:00Z" },
  "pageCount": 34,
  "ingestedAt": "2026-10-17T15:00:00Z",
  "redactions": { "bank_account": 1, "routing_number": 1 },
  "body": "<!-- page 1 -->\n…\n<!-- page 2 -->\n…"
}
```

- `domain` is an enum of the in-scope domains only (`vehicle`, `home`, `purchase`, `health_plan`); out-of-scope documents have no value they can validate with.
- `source` is either `drive` (fileId, url, modifiedTime) or `file` (base filename, sha256) — a local path is never stored.
- `subject` groups documents about one asset ("2026 Rivian R2") and is the seed for Phase 2 assets.
- Page markers must be exactly `1..pageCount` in order.
- There is no catalog file. `list_documents` is the documents' metadata minus `body`, derived by listing the prefix, so it cannot drift from the documents.

---

## 5. Security

| ID | Requirement |
|----|-------------|
| SEC-F001 | Library text is **untrusted input**. A document can contain text that reads as instructions. It can reach writes only through the existing confirmation-card path; no new write path is introduced. |
| SEC-F002 | No reversible redaction mapping exists anywhere (REQ-F013). |
| SEC-F003 | Document content is never committed to the repository. Staging lives outside the repo. |
| SEC-F004 | Library reads are family-scoped by path; a read that omits the family id must fail, not list the bucket. |
| SEC-F005 | Out-of-scope categories (REQ-F021) are excluded at ingest, not filtered at read. |

---

## 6. Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-F01 | Core job is **find the facts fast** (arbitrary Q&A), not "never miss a date" | Maintainer's primary pain is retrieval at the moment of need. Dates/reminders become Phase 2, seeded from the library rather than hand-entered |
| D-F02 | Phase 1 ingests **text only**, via Claude Code; no service account, no OAuth, no Google credential in the app | Tests whether the library gets used before paying for integration. Claude Code already has Drive access. No duplicate file storage. Cost: only the maintainer can add docs; trigger for in-app upload/sync is a non-maintainer wanting to |
| D-F03 | Freshness is **re-run on demand**, keyed on Drive `modifiedTime` | Contracts rarely change. Ingest date on every citation surfaces staleness |
| D-F04 | Redact by shape at ingest; **typed markers + per-doc counts**; no reversible mapping | Kept fields (VIN, policy #) are the useful ones; redacted fields have ~zero Q&A value and would otherwise land in traces and model context. Typed markers let the assistant answer honestly about what was withheld and keep `****` unambiguous |
| D-F05 | Scope = owned things + signed contracts + health plan summaries; estate docs deferred to a dedicated phase | Excluded categories are where SSNs cluster; included ones are where retrieval pain is. Estate docs warrant stricter handling, not omission |
| D-F06 | Citations mandatory; figures verbatim; "the documents don't say" is a valid answer; golden set | A confident wrong number is worse than no answer — the user will act on it. Cost: wordier answers, no deep page links (Drive PDF viewer), prompt-level enforcement in Phase 1 |
| D-F07 | No inventory phase; import per document via `/import-document`, starting with the solar documents and the Rivian R2 extended service/warranty documents. Golden questions are collected per import rather than as an upfront set | The initial corpus is a handful of known documents. Per-import questions mean every document is covered by someone who just read it |
| D-F09 | Documents declare what they amend (`amends`), and the amending document governs on conflict | Found on the first real corpus: the Sunrun CAP package revises the lease's payment schedule ($280.76 → $268.31/mo) and production guarantee table. Both documents are correctly cited, so citations alone cannot stop a wrong answer |
| D-F08 | Library entries are JSON keys in the existing storage layer, not markdown files under a new path, and there is no catalog file | `StorageAdapter.list` already works by prefix, and prod sync, local backup, versioning and snapshots then cover the library with zero new infrastructure. A catalog would be a second source of truth that a partial push could leave stale |

---

## 7. Open Questions

- **Vector search** — not planned. Catalog + full-document reads with prompt caching should hold at tens to low hundreds of documents. Revisit only if the catalog stops fitting comfortably in context or read costs climb.
- **Long documents** — a 100+ page document read in full on every turn is costly. Whether `read_document` needs a page-range parameter is a Phase 1 build-time call, informed by the real corpus.
- **Estate documents** — handling model for Phase 4 (per-document opt-in? excluded from AI by default like the business workspace?) is undecided.

---

## 8. References

- [AI-CAPABILITY-PLATFORM-BRD.md](AI-CAPABILITY-PLATFORM-BRD.md) — tiers, `ReadOnlyDataService`, external-link host disclosure
- [AI-CHATBOT-BRD.md](AI-CHATBOT-BRD.md) — SEC-018, chat attachments
- `backend/src/utils/redaction.ts` — shape-based redaction
- `backend/src/services/imageStore.ts` — precedent for data-prefix storage outside the chatbot's reach
