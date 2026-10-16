# Startup Idea 2: Elessar — Automatic, Grounded Engineering Changelogs

**Reference company:** [Elessar](https://www.ycombinator.com/companies/elessar) (YC S22, San Francisco)
**Category:** AI · Developer Tools · Engineering Productivity

---

## Overview

Elessar connects to an engineering team's existing tools (GitHub, Slack, Notion, Linear, VS Code) and **automatically generates code changelogs, documentation, and progress reports** from the actual code changes. Engineers spend less time writing status updates and PR descriptions. Managers can see what shipped, what is blocked, and where time goes, without asking for a status meeting.

Main features (from YC listing):
- Automatic function-level changelogs for every GitHub pull request
- Auto-generated documentation and weekly progress reports in Notion
- Temporary, two-way-synced Slack channels per PR with AI summaries
- VS Code extension that shows changelogs in the editor
- Daily email digests for engineers and managers, plus Linear integration

---

## How Elessar Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: engineering work is invisible unless someone manually writes it up.**
Elessar focuses on one job: turning raw code changes (diffs, commits, PRs) into accurate, human-readable descriptions of what changed and why. The other features (Notion reports, Slack summaries, email digests) are delivery channels for that one artifact, the grounded changelog.

### 2. You know the target customers or have direct access to them
The customers are software engineers and engineering managers. I have direct access to:
- **Classmates on team software projects** (capstones, CS courses, hackathons), who have to write PR descriptions and weekly status reports for TAs.
- **Former internship teams and managers**, who sat through standups that existed mainly to share status.
- **Open-source maintainers** whose projects I contribute to, who struggle to write release notes.
- **Student-run dev clubs and startup teams** in the university entrepreneurship ecosystem.

I am also a target user myself: I write PRs every week.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Code ingestion | GitHub App + webhooks, REST/GraphQL API | Familiar |
| Diff/AST analysis | `tree-sitter` parsers, `git diff` hunks | Learnable quickly |
| Backend | Python (FastAPI) + background workers (Celery/RQ) | Familiar |
| Storage | PostgreSQL | Familiar |
| Integrations | Slack API, Notion API, Linear API, VS Code extension API | Learnable quickly: well-documented |
| LLM | Claude API with structured outputs | Familiar |
| Hosting | Docker on Fly.io / Render / AWS | Familiar |

### 4. Reimagines the problem space to make it significantly better
Today, engineering communication is **manual, after the fact, and lossy**: engineers write vague PR descriptions ("fix stuff"), managers run standups to collect status, and release notes are put together from memory at the end of a sprint. Elessar reverses this:
- **Code is the source of truth.** Documentation is *derived* from the diff, so it never drifts from what actually shipped.
- **Push, not pull.** Managers receive digests and reports automatically instead of asking for updates.
- **Function-level granularity.** Instead of "updated auth.py," the changelog says *which functions changed and how their behavior changed*. No human writes at that level of detail consistently.

Status reporting moves from a human chore to a byproduct of writing code.

### 5. An LLM/Generative model is core to the solution (not a "chatbot in a sidebar")
The LLM is the **engine that turns code diffs into natural-language explanations**. No rule-based system can read a diff and explain that "`refreshToken()` now retries up to 3 times with exponential backoff instead of failing immediately." For each PR:
- **Input:** the diff hunks, a list of changed symbols extracted by `tree-sitter`, the PR title, linked Linear issue, and commit messages.
- **Output:** a structured changelog:
```json
{
  "summary": "Adds retry with backoff to token refresh to reduce login failures.",
  "changes": [
    {
      "file": "src/auth/session.ts",
      "symbol": "refreshToken",
      "change_type": "modified",
      "description": "Now retries up to 3 times with exponential backoff before throwing."
    }
  ],
  "risk_notes": ["Changes error propagation for callers of refreshToken."],
  "linked_issue": "ENG-412"
}
```
Without the LLM, there is no product: every downstream report is built from this output.

### 6. Validation Guardrail: No LLM-generated artifact reaches the user without passing through a validator
Every changelog is checked by a **grounding validator** before it is posted to GitHub, Slack, Notion, or email:
1. **Schema validation:** JSON matches the changelog schema, and `change_type` is in `{added, modified, removed, renamed}`.
2. **Symbol grounding:** every `(file, symbol)` pair must exist in the set of changed symbols that `tree-sitter` extracted from the actual diff. Invented functions or files are rejected.
3. **Coverage check:** every changed public symbol in the diff must appear in at least one `changes` entry, so important changes are not silently dropped.
4. **Change-type consistency:** a symbol marked `added` must not exist in the base branch, and one marked `removed` must not exist in the head branch (checked deterministically against the AST).
5. **Reference validation:** `linked_issue` must match an issue ID that actually exists in Linear or in the PR body.
6. **Safety filter:** a secrets/PII scan makes sure no API keys or credentials from the diff get copied into a Slack or email digest.

### 7. Self-Correction Loop: Validation errors automatically feed back into the LLM to retry/correct
Failed checks are turned into precise feedback and sent back to the LLM:
```
Validation failed:
- changes[2].symbol "validateUser" not found in diff. Changed symbols in src/auth/session.ts: [refreshToken, clearSession].
- Coverage: public symbol "clearSession" (src/auth/session.ts) changed but is not described.
- changes[0].change_type "added" is wrong: refreshToken exists in base branch → should be "modified".
Regenerate the changelog fixing only these issues.
```
- Up to **3 retries**. Each retry includes the specific error list and the authoritative list of changed symbols.
- If retries are exhausted, Elessar posts only the **validated subset** of entries. Uncovered symbols are listed with "description pending review," so no hallucinated text is ever published.
- Retry and error statistics are tracked per repository to tune prompts (for example, for unusual languages or very large diffs).

### 8. Deployability: If built, you are able to fully deploy it
- **GitHub App:** registered and installable by any org. Webhooks hit a public HTTPS endpoint.
- **Backend:** Dockerized FastAPI service + worker queue on Fly.io/Render, using managed PostgreSQL and Redis.
- **Integrations:** Slack app, Notion integration, and Linear OAuth app, each with a documented install flow.
- **VS Code extension:** published to the VS Code Marketplace.
- **Email digests:** sent through a transactional provider (Resend/SendGrid) on a cron schedule.
- **Security:** least-privilege GitHub permissions (read contents and pull requests, write PR comments), encrypted tokens, and no code stored after processing.

Each component uses standard, self-serve deployment platforms, so it can be fully launched by a small team.

---

## Architecture Sketch
```
GitHub PR webhook
      │
      ▼
Diff + tree-sitter symbol extraction ──► authoritative symbol list
      │                                          │
      ▼                                          │
LLM changelog generator ──► JSON ──► Validator ◄─┘
      ▲                                   │
      │        fail (≤3 retries)          │ pass
      └─────── structured error report ◄──┤
                                          ▼
              GitHub PR comment · Slack · Notion · VS Code · Email digest
```
