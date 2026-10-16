# Startup Idea 5: River — The AI Desktop for Knowledge Workers

**Reference company:** [River](https://www.ycombinator.com/companies/rivereditor) (YC F26, San Francisco · [meetriver.com](https://meetriver.com))
**Founders:** Brian Joseff (previously founded Bedrock; founding team at Progressly, acquired by Box), Chandler Supple (ex-Roboflow engineer, co-founded Outwork)
**Tagline:** "The AI desktop."
**Category:** AI · Productivity

---

## Overview

River's thesis: AI tools such as Cursor and Claude Code made software engineers much more productive by putting an AI **inside the environment where the work happens**, with access to the whole codebase and the ability to make real, reviewable edits. River aims to bring the same change to **knowledge workers** (analysts, operators, consultants, marketers, PMs), whose "codebase" is a desktop of documents, spreadsheets, emails, and notes.

The YC listing gives only the high-level "AI desktop" positioning. The concept below interprets it through the "Cursor for knowledge work" model: an AI-native workspace that understands all of your files and makes **concrete, reviewable edits** to them, instead of answering questions in a chat window.

---

## How River Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: knowledge workers spend most of their time moving information between documents by hand.**
Examples: updating a slide deck with this month's spreadsheet numbers, rewriting a proposal to match a client's feedback email, or pulling notes from five documents into one brief. River does one thing: **apply a high-level instruction across your files as precise, reviewable edits**, the way Cursor applies an instruction across a codebase.

### 2. You know the target customers or have direct access to them
The customers are knowledge workers who live in documents. I have direct access to:
- **Students in consulting, finance, and business clubs**, who constantly build decks, memos, and models from many source files.
- **Former internship colleagues** in operations, product, and analyst roles.
- **Research assistants and grad students** who synthesize papers, notes, and data into reports.
- **Myself and my classmates:** writing lab reports, group papers, and résumés means constantly editing across documents.

I can watch these users work, see where they copy and paste, and measure time saved.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Desktop app | Electron or Tauri + React | Learnable quickly (web stack I already know) |
| Document handling | `.docx`/`.xlsx`/`.pptx`/Markdown/PDF parsers (e.g., `python-docx`, `openpyxl`, `pdf.js`) | Learnable quickly |
| Local indexing | Embeddings + local vector store (SQLite + `sqlite-vec` / LanceDB), file watchers | Familiar / learnable |
| Diff & review UI | Text/structured diff libraries (`diff-match-patch`), rich-text editor (TipTap/ProseMirror) | Learnable quickly |
| Backend | Thin API (FastAPI/Node) for auth, billing, LLM proxying | Familiar |
| LLM | Claude API with tool use / structured edit operations | Familiar |
| Distribution | Code-signed installers, auto-update (electron-updater / Tauri updater) | Learnable quickly |

### 4. Reimagines the problem space to make it significantly better
Current AI for knowledge workers is mostly a **chatbot next to the work**: you copy text into ChatGPT, ask for a rewrite, then paste it back into the right place in the right file. The AI cannot see your other files and cannot make the change itself. River reimagines the desktop:
- **Workspace-aware:** River indexes your documents, sheets, and notes, so "update the Q3 deck with the numbers from the finance sheet" works without manual context gathering.
- **Edits, not answers:** the output is a **set of tracked changes across real files**. You review them like a pull request and accept or reject each one.
- **Multi-file operations:** one instruction can update a memo, a spreadsheet, and an email draft consistently.
- **Human stays in control:** every change is a reviewable diff with source citations, so the user stays the editor-in-chief.

This shift (chat assistant → agent that makes reviewable edits in your actual workspace) is what made AI coding tools much more productive. River applies it to the rest of knowledge work.

### 5. An LLM/Generative model is core to the solution (not a "chatbot in a sidebar")
The LLM is the **planner and editor** of the workspace. It does not just answer questions. Given an instruction and retrieved file context, it produces a **structured edit plan**:
```json
{
  "instruction": "Update the Q3 board memo with final revenue numbers from finance.xlsx",
  "edits": [
    {
      "file": "Board/Q3_memo.docx",
      "op": "replace",
      "anchor": {"paragraph_id": "p14", "match": "revenue of $4.1M"},
      "new_text": "revenue of $4.3M",
      "sources": [{"file": "Finance/finance.xlsx", "sheet": "Summary", "cell": "C7"}]
    },
    {
      "file": "Finance/finance.xlsx",
      "op": "add_comment",
      "anchor": {"sheet": "Summary", "cell": "C7"},
      "new_text": "Referenced in Q3_memo.docx §3"
    }
  ]
}
```
The edit plan is the product: River applies it to real files as reviewable diffs. Remove the LLM and River is just a file browser.

### 6. Validation Guardrail: No LLM-generated artifact reaches the user without passing through a validator
No edit is shown as a proposed diff, and none is applied to a file, until it passes a **validator**:
1. **Schema validation:** the edit plan matches the operation schema. `op` must be in the allowed set (`replace`, `insert`, `delete`, `add_comment`, `set_cell`), and each operation's fields must be valid for that file type.
2. **Anchor validation:** every `file` must exist in the workspace, and every `anchor` must resolve to exactly one location (the paragraph ID exists *and* the `match` text is actually found there). Ambiguous or missing anchors are rejected.
3. **Source grounding:** every factual value introduced (numbers, dates, names, quotes) must appear in a cited `source` location. For example, `$4.3M` must equal the value in `finance.xlsx!Summary!C7`, checked deterministically.
4. **Structural integrity:** a dry-run application in a sandbox copy must produce a valid file. The `.docx`/`.xlsx` must re-open without errors, spreadsheet formulas must still evaluate, and no unrelated content may change outside the anchored ranges.
5. **Scope & permission policy:** edits may touch only files inside the user-approved workspace scope. Destructive operations (deleting files, large deletions) are blocked or require explicit confirmation.
6. **Consistency check:** if the same fact is edited in multiple files, all edits must agree.

### 7. Self-Correction Loop: Validation errors automatically feed back into the LLM to retry/correct
Failures are returned to the LLM as precise, actionable feedback:
```
Edit plan failed validation:
- edits[0].anchor.match "revenue of $4.1M" not found in p14. Actual p14 text: "...reported revenue of $4.08M for the quarter..."
- edits[0].new_text "$4.3M" does not match cited source finance.xlsx!Summary!C7 = 4,312,500 → expected "$4.31M" or "$4.3M (rounded)" with consistent rounding.
- edits[2] targets "Legal/NDA_template.docx", which is outside the approved workspace scope.
Return a corrected edit plan.
```
- The LLM re-plans with the actual file text and source values attached. The corrected plan is **re-validated, including another sandbox dry-run**.
- Up to **3 retries**. Edits that still fail are **dropped from the proposal** and listed separately as "couldn't complete" with the reason, so the user never sees a broken or unsupported change.
- Error categories (anchor drift, rounding mismatches, scope violations) are logged to improve retrieval, anchoring, and prompts.

### 8. Deployability: If built, you are able to fully deploy it
- **Desktop app:** Tauri/Electron builds for macOS and Windows, code-signed and notarized, distributed from the website with automatic updates.
- **Local-first data:** file indexing and the vector store run on the user's machine. Only the context needed for each request is sent to the LLM, which is a simpler privacy story.
- **Backend:** small FastAPI/Node service on Fly.io/Render for authentication, billing (Stripe), usage metering, and server-side LLM proxying so no API keys ship in the client.
- **LLM:** Claude API with tool use and structured outputs.
- **Updates & telemetry:** opt-in crash reporting (Sentry) and validator-failure analytics.

Desktop apps with a thin cloud backend are a well-understood deployment pattern that a small team can ship and maintain end to end.

---

## Architecture Sketch
```
User instruction ("update the deck with Q3 numbers")
          │
          ▼
Local index retrieval (docs · sheets · notes) ──► context
          │
          ▼
   LLM edit planner ──► structured edit plan (JSON)
          ▲                       │
          │                       ▼
 error report (≤3 retries) ◄── fail ── Validator (schema · anchors · source grounding ·
                                        sandbox dry-run · scope policy · consistency)
                                  │ pass
                                  ▼
                 Reviewable multi-file diff ──► user accepts/rejects ──► files updated
```
