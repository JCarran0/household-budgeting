---
name: import-document
description: Import a family document (a Google Drive link or a local PDF) into the Family Library so the assistant can answer questions from it. Extracts text with page markers, redacts financial identifiers deterministically, validates against the library schema, collects human-verified golden questions, extracts verified ledger dates (also for documents already in the library), and hands back the gated production push command. Use when the user says "import-document", "add this to the library", or gives a contract, lease, warranty, policy, or service plan to make searchable.
---

# /import-document

Turns one source document into one Family Library entry. Spec: `docs/features/FAMILY-LIBRARY-BRD.md`.

**Division of labor.** You do the judgment work: reading the document, transcribing it faithfully, writing the summary. `npm run library` (in `backend/`) does everything that must not depend on judgment: redaction, counts, validation, duplicate detection, and the production write. Never redact by hand, never write a library key directly, never hand-edit a staged file.

## Hard rules

1. **Scope.** Only `vehicle`, `home`, `purchase` and `health_plan` documents (BRD REQ-F020). Refuse tax returns, medical records or claims, IDs and passports, and estate documents (wills, trusts, POA). Say they're out of scope for now, and don't open them to check.
2. **Raw text never touches the repo.** Write extracted text and metadata only to your scratchpad directory. The raw text contains unredacted SSNs and account numbers. Delete it once `prepare` succeeds.
3. **You never write golden answers.** You may propose questions. The answers come from the user, or from the cross-check in step 5. If neither happens, skip evals. Never fill them in yourself, or the check becomes circular (BRD REQ-F044).
4. **You never push.** `push` writes production. Hand the user the `!` command.
5. **You never compute a date.** Ledger facts carry a printed date, or an anchor plus an offset, and code computes the rest (REQ-H004).

## Steps

### 1. Identify the source

- **Drive link:** get the file metadata through the Google Drive connector and note `fileId`, the canonical URL and `modifiedTime`. Prefer the PDF form. For a native Google Doc, export it as PDF so page numbers match a printed copy.
- **Local file:** compute `shasum -a 256 <file>` and keep only the base filename, never the path. If the user names a place the original lives (an insurer's or lender's portal), record it as the source `url` (https only). Never take a URL from the document's own text.
- **Page count:** run `pdfinfo <file> | grep Pages` before transcribing. The Read tool does not report a PDF's length, and a wrong count leaves pages out without any error.

Run `npm run library -- families` and use the **personal** family id. Then run `npm run library -- list --family <id>` to see what's already imported, with each document's `subject`. If this source is already there, reuse its `docId`: the script refuses a second id for the same source, and skips an unchanged one.

### 2. Extract the text faithfully

Write `body.md` to the scratchpad:

- Start each page with `<!-- page N -->`, numbered 1..N, in order, every page once, including blank ones (`<!-- page 7 -->` followed by `[blank page]`). Validation rejects gaps.
- Transcribe **verbatim**. Keep section numbers, headings, defined terms and every figure exactly as printed. Don't summarize, paraphrase, fix typos or skip boilerplate: the clause you skip is the one someone will ask about.
- Render tables as markdown tables. Mark text you can't read as `[illegible]`, never a guess.
- **Layout isn't content.** Joining printed line-wraps, straight vs. curly quotes, turning a multi-column layout into a table or labelled block, and adding a column header the layout implies are all fine. Every word, figure and cell value must still be printed in the source and sit in the right row and column. Write images as a bracketed placeholder (`[QR code]`, `[logo]`) and checkboxes as printed (`YES: [ ] NO: [X]`).
- `pdftotext -layout` is a good cross-check, but it splits words ("inf ormation") and can reorder columns. The rendered page is the authority.
- Read PDFs in page ranges (at most 20 pages per Read call) and check you got every page.

### 3. Write the metadata

Write `meta.json` to the scratchpad:

```json
{
  "docId": "rivian-r2-extended-service-plan",
  "title": "Rivian R2 Extended Service Plan",
  "domain": "vehicle",
  "kind": "extended_service_plan",
  "subject": "2026 Rivian R2",
  "summary": "What it covers, term and mileage limits, deductible, claims process, transfer and cancellation terms. Written so the assistant can tell from this paragraph alone whether the answer is in here.",
  "effectiveDate": "2026-09-30",
  "source": { "kind": "drive", "fileId": "…", "url": "https://drive.google.com/file/d/…/view", "modifiedTime": "…" }
}
```

A local file's source is `{ "kind": "file", "filename": "<base name>", "sha256": "<hex>", "url": "<optional https portal link>" }`.

- `docId`: a lowercase kebab slug, stable across re-imports. **No year or term in it** (`travelers-homeowners-policy`, not `…-2026-2027`): next year's renewal is a re-import under the same id, which replaces this one and carries its ledger facts forward.
- `kind`: a lowercase snake_case noun for the document type. Reuse one from `list` if it fits (`auto_insurance_policy`, `homeowners_insurance_policy`, `solar_lease`).
- `subject`: names the asset, so all of one car's or system's documents share it exactly (`2027 Rivian R2`, `Rooftop solar system`, `Home — 33 Grandview Ave`). Reuse an existing subject whenever it is the same asset. When one document covers several assets (an auto policy on two cars), pick the one it is most bound to, such as the financed or leased car, and name every asset in the summary so a question about any of them still finds the document. Say which you picked to the user.
- `effectiveDate`: the date the terms in this document start: a policy period's start, a contract's signing date. Not the print or issue date.
- `summary`: describes *what questions this document can answer*, not the document's own marketing copy.
- `amends`: list the `docId`s this document revises, such as a change order, final-design package, addendum or renewal. Where the two conflict, this document governs. Say in the summary *which* terms it changes ("Replaces the lease's Exhibit A payment schedule and production guarantee table"). The referenced documents must be imported first. Look for this on every import: a document that silently overrides another is the most likely source of a confidently wrong answer.
- Don't include `redactions`, `pageCount`, `ingestedAt`, `formatVersion` or `body`. The script derives them and refuses them if you supply them.

### 4. Stage it

```bash
cd backend && npm run library -- prepare --family <id> --meta <scratch>/meta.json --body <scratch>/body.md
```

On a validation error, fix the input and re-run. Never hand-edit the staged file. On success, show the user:

- title, page count, redaction counts,
- every redaction in context,
- every line the script flags as **"Kept, but contain 8+ digit runs."** Ask the user to confirm none of these is a bank or card number. If one is, add a label the redactor recognizes (e.g. `Bank account #:`) to that line in `body.md`, note the change to the user, and re-run with `--force`. Changing labels is the only edit to the transcription that's allowed.
- any personal identifier that survived and isn't a bank or card number. The redactor removes labelled SSNs, card, routing, bank account and loan numbers, and dates of birth (labelled or in a "Date of Birth" table column). Anything else, raise with the user.

Delete the scratchpad `body.md` only after the user has confirmed the review. If a fix is needed later, the staged entry's `body` is the redacted transcription and can serve as the input to a re-run.

### 5. Golden questions

Propose 2 or 3 questions the family would realistically ask of this document:

- at least one with a figure, date or limit, as `answerable`,
- one involving a redacted value if the document has any, as `redacted`.

Ask the user to supply each answer and page **from the source**. If the user prefers a model cross-check, launch two subagents on different models (e.g. `sonnet` and `fable`). Give each the Drive fileIds or local file paths, not your transcription, and forbid reading `backend/data/`. Each downloads into its own scratch directory and deletes the copies afterwards. Each returns `{q, expect, answer, page, confidence, note}` per question. Show the user both sets side by side, flag every disagreement or low-confidence answer, and write evals only after the user approves.

Write `evals.json`:

```json
{ "questions": [ { "question": "…", "expect": "answerable", "expectedAnswer": "…", "sourcePage": 4 } ] }
```

```bash
cd backend && npm run library -- evals --family <id> --doc <docId> --file <scratch>/evals.json
```

### 6. Ledger facts

Extract the dates and terms the household should be reminded of into the Household Ledger. Spec: `docs/features/HOUSEHOLD-LEDGER-BRD.md` §3.2. Do this for every new import. For a document already in the library, start here: the facts mode needs no source file because facts are verified against the stored body.

**Two models, never you alone (REQ-H011).** Launch two subagents on different models (e.g. `sonnet` and `fable`). Give each one:

- the path to the staged entry `backend/data/library_<familyId>_<docId>.json`. It is already redacted, and reading it is allowed here because every quote is checked against that same text;
- the format below and these rules;
- a request to return the JSON only.

Rules for the extractors:

- **Which facts to propose:** deadlines, windows (cancellation, refund, opt-out, transfer), expirations of coverage or term, recurring obligations (inspections, audits, payments the household must act on), and undated terms worth remembering (`note`) such as fees or limits. Skip anything that needs no action and won't be asked about.
- **Dates are never computed by the model.** Use `{"date": "YYYY-MM-DD"}` only for a date printed in the document. Otherwise use `{"anchor": "<a printed date>", "offset": {"days"|"months"|"years": n}}` and let code do the arithmetic. "Through the 6th year" is `{"years": 6, "days": -1}`.
- **Quotes:**
  - Every fact needs at least one quote, copied verbatim with its page number.
  - The first quote is the clause itself.
  - Every date the schedule uses (each literal date and each anchor) must appear in some quote, so add a second quote for the line that prints the anchor date (for example "Contract Purchase Date: 10/17/2026").
  - Each quote is at least 10 characters and at most 600.
- **Slugs:** stable, lowercase-kebab, and descriptive (`full-refund-window`, not `fact-3`), because the slug is the fact's identity across re-imports.

```json
{ "docId": "<docId>", "facts": [ {
  "slug": "full-refund-window", "title": "Full refund if cancelled within 60 days",
  "detail": "optional one or two sentences", "amount": "$2,078.45 (optional, as printed)",
  "schedule": { "kind": "deadline", "due": { "anchor": "2026-10-17", "offset": { "days": 60 } } },
  "leadDays": [30, 7],
  "quotes": [ { "page": 3, "text": "…" }, { "page": 1, "text": "Contract Purchase Date: 10/17/2026" } ]
} ] }
```

The schedule kinds are:

- `note`
- `deadline` with `due`
- `expiration` with `due`
- `window` with `opens` and `closes`
- `recurring` with `first`, `every` and an optional `until`

`leadDays` is optional and replaces the defaults (deadline 30/7, expiration 90/30, window 30, recurring 60).

**Merge the two results.**

1. Union the two results into one `<scratch>/facts.json`.
2. Add `"foundBy": ["sonnet", "fable"]` to a fact both models proposed (matched by meaning, not slug), or the one model's name otherwise.
3. Where the models disagree on a date or an offset, keep neither: re-read the page yourself and show the user the disagreement.

Then stage:

```bash
cd backend && npm run ledger -- stage --family <id> --file <scratch>/facts.json
```

`stage` verifies every quote verbatim and every date against the stored body and stages nothing if any fact fails. Fix a failing quote by copying the exact text from the body, never by loosening it. Show the user the review list, and walk them through every **⚠ single-model** fact and every computed date. Stage only what the user approves: drop the rest from `facts.json` and re-stage.

Don't record that something was *done*, such as "we sent the opt-out email". That is a user fact, added by a person in the app or through a confirmed chat card, never by import.

### 7. Hand off the push

Give the user the commands. Don't run them:

```
! cd backend && AWS_PROFILE=budget-app-prod npm run library -- push --family <id> --doc <docId>
! cd backend && AWS_PROFILE=budget-app-prod npm run ledger -- push --family <id> --doc <docId>
```

Push the library entry before the ledger: the ledger push re-verifies against the production copy of the document. After they run them, confirm with `npm run library -- list --family <id> --prod` and `npm run ledger -- list --family <id> --prod`.

## Re-importing

When the Drive file has changed, run the same steps with the same `docId`. `prepare` replaces the staged entry, and `push` replaces production. When the source hasn't changed, `prepare` says so and writes nothing.

Re-extract the facts too, keeping the existing slugs for facts that still apply. A fact that keeps its slug also keeps its handled marks and its `trackFrom`. A fact missing from the new extraction is **withdrawn**, never deleted, and `stage` lists it so the user can confirm the withdrawal is intended.
