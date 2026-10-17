---
name: import-document
description: Import a family document (a Google Drive link or a local PDF) into the Family Library so the assistant can answer questions from it. Extracts text with page markers, redacts financial identifiers deterministically, validates against the library schema, collects human-verified golden questions, and hands back the gated production push command. Use when the user says "import-document", "add this to the library", or gives a contract, lease, warranty, policy, or service plan to make searchable.
---

# /import-document

Turns one source document into one Family Library entry. Spec: `docs/features/FAMILY-LIBRARY-BRD.md`.

**Division of labor.** You do the judgment work: reading the document, transcribing it faithfully, writing the summary. `npm run library` (in `backend/`) does everything that must not depend on judgment: redaction, counts, validation, duplicate detection, and the production write. Never redact by hand, never write a library key directly, never hand-edit a staged file.

## Hard rules

1. **Scope.** Only `vehicle`, `home`, `purchase` and `health_plan` documents (BRD REQ-F020). Refuse tax returns, medical records or claims, IDs and passports, and estate documents (wills, trusts, POA). Say they're out of scope for now, and don't open them to check.
2. **Raw text never touches the repo.** Write extracted text and metadata only to your scratchpad directory. The raw text contains unredacted SSNs and account numbers. Delete it once `prepare` succeeds.
3. **You never write golden answers.** You may propose questions. The user supplies the answers from the source. If they decline, skip evals. Never fill them in yourself, or the check becomes circular (BRD REQ-F044).
4. **You never push.** `push` writes production. Hand the user the `!` command.

## Steps

### 1. Identify the source

- **Drive link:** get the file metadata through the Google Drive connector and note `fileId`, the canonical URL and `modifiedTime`. Prefer the PDF form. For a native Google Doc, export it as PDF so page numbers match a printed copy.
- **Local file:** compute `shasum -a 256 <file>` and keep only the base filename, never the path.

Run `npm run library -- families` and use the **personal** family id. Then run `npm run library -- list --family <id>` to see what's already imported. If this source is already there, reuse its `docId`: the script refuses a second id for the same source, and skips an unchanged one.

### 2. Extract the text faithfully

Write `body.md` to the scratchpad:

- Start each page with `<!-- page N -->`, numbered 1..N, in order, every page once, including blank ones (`<!-- page 7 -->` followed by `[blank page]`). Validation rejects gaps.
- Transcribe **verbatim**. Keep section numbers, headings, defined terms and every figure exactly as printed. Don't summarize, paraphrase, fix typos or skip boilerplate: the clause you skip is the one someone will ask about.
- Render tables as markdown tables. Mark text you can't read as `[illegible]`, never a guess.
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

- `docId`: a lowercase kebab slug, stable across re-imports.
- `subject`: names the asset, so all of one car's or system's documents share it exactly (`2026 Rivian R2`, `Rooftop solar system`).
- `summary`: describes *what questions this document can answer*, not the document's own marketing copy.
- Don't include `redactions`, `pageCount`, `ingestedAt`, `formatVersion` or `body`. The script derives them and refuses them if you supply them.

### 4. Stage it

```bash
cd backend && npm run library -- prepare --family <id> --meta <scratch>/meta.json --body <scratch>/body.md
```

On a validation error, fix the input and re-run. Never hand-edit the staged file. On success, show the user:

- title, page count, redaction counts,
- every redaction in context,
- every line the script flags as **"Kept, but contain 8+ digit runs."** Ask the user to confirm none of these is a bank or card number. If one is, add a label the redactor recognizes (e.g. `Bank account #:`) to that line in `body.md`, note the change to the user, and re-run with `--force`. Changing labels is the only edit to the transcription that's allowed.

Then delete the scratchpad `body.md`.

### 5. Golden questions

Propose 2 or 3 questions the family would realistically ask of this document:

- at least one with a figure, date or limit, as `answerable`,
- one involving a redacted value if the document has any, as `redacted`.

Ask the user to supply each answer and page **from the source**. Write `evals.json`:

```json
{ "questions": [ { "question": "…", "expect": "answerable", "expectedAnswer": "…", "sourcePage": 4 } ] }
```

```bash
cd backend && npm run library -- evals --family <id> --doc <docId> --file <scratch>/evals.json
```

### 6. Hand off the push

Give the user the command. Don't run it:

```
! cd backend && AWS_PROFILE=budget-app-prod npm run library -- push --family <id> --doc <docId>
```

After they run it, confirm with `npm run library -- list --family <id> --prod`.

## Re-importing

When the Drive file has changed, run the same steps with the same `docId`. `prepare` replaces the staged entry, and `push` replaces production. When the source hasn't changed, `prepare` says so and writes nothing.
