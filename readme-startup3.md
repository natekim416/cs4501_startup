# Startup Idea 3: Circleback — Meeting Notes That Actually Do the Follow-Up

**Reference company:** [Circleback](https://www.ycombinator.com/companies/circleback) (YC W24, San Francisco)
**Founders:** Ali Haghani (ex-Stripe, led the first LLM integration into support), Kevin Jacyna (ex-Tableau)
**Category:** AI · Productivity · Meetings

---

## Overview

Circleback is an AI meeting assistant that produces **accurate, topic-organized notes, action items, and transcripts** for meetings on Zoom, Google Meet, Microsoft Teams, and in person. It then **automates the follow-up work**: it updates the CRM after a sales call, turns feature requests from a demo into Linear tasks, and shares notes to Slack. Teams can also search across all past meetings as a shared knowledge base. It supports more than 100 languages.

---

## How Circleback Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: important information from meetings is lost, and follow-up work does not happen.**
Circleback focuses on turning a conversation into correct, actionable records. Notes, action items, CRM updates, and tasks are all forms of the same output: what was decided and who needs to do what. It does not try to be a calendar, video platform, or project manager. It connects to those tools instead.

### 2. You know the target customers or have direct access to them
The customers are teams that meet often: sales, product, customer success, recruiting, and startup founders. I have direct access to:
- **Student organizations and project teams** that hold weekly meetings and regularly lose track of who agreed to do what.
- **Startup founders and early sales reps** in the university entrepreneurship community, who take many customer-discovery calls and need to log them.
- **Internship managers and recruiters** I meet with, who juggle back-to-back calls.
- **Research labs** whose weekly group meetings produce action items that are often never written down.

I sit in these meetings myself, so I can test the product on real meetings starting on day one.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Meeting capture | Meeting-bot API (e.g., Recall.ai) or native Zoom/Meet SDKs; browser/mobile recording for in-person | Learnable quickly |
| Transcription | Speech-to-text API (Deepgram / AssemblyAI / Whisper) with diarization and timestamps | Learnable quickly |
| Backend | Python (FastAPI) + job queue | Familiar |
| Storage/search | PostgreSQL + `pgvector` for semantic search | Familiar |
| Integrations | Google/Microsoft Calendar, Slack, Notion, HubSpot, Salesforce, Linear, webhooks | Learnable quickly: REST + OAuth |
| LLM | Claude API with structured outputs | Familiar |
| Frontend | Next.js | Familiar |

### 4. Reimagines the problem space to make it significantly better
Traditional approaches are either **a human taking notes** (distracted and incomplete) or **a raw transcript** (complete but unusable: nobody rereads 45 minutes of text). Circleback reimagines the meeting record as **structured, actionable data**:
- Notes are **organized by topic**, not chronologically, so they read like a well-written memo.
- **Action items have owners and due dates** and are pushed directly to the tools where work happens (Linear, HubSpot, Salesforce, Slack).
- **Workflows** let teams define rules once ("for every external sales call, update the HubSpot deal stage and log next steps"), so follow-up happens without anyone remembering to do it.
- **Search across all meetings** turns months of conversation into a searchable team memory.

The meeting goes from a lost hour to a structured event that updates your systems of record.

### 5. An LLM/Generative model is core to the solution (not a "chatbot in a sidebar")
The LLM is the **engine that turns unstructured speech into structured records**. Given a diarized, timestamped transcript, it produces:
```json
{
  "topics": [
    {
      "title": "Q4 pricing change",
      "summary": "Team agreed to move Pro tier from $20 to $25 starting Nov 1.",
      "evidence": [{"start": "00:12:41", "end": "00:14:05"}]
    }
  ],
  "action_items": [
    {
      "owner": "Dana Lee",
      "task": "Update pricing page copy",
      "due": "2026-10-24",
      "evidence": [{"start": "00:13:50", "end": "00:14:02"}]
    }
  ],
  "crm_updates": {"deal_stage": "Proposal Sent", "next_step": "Send revised quote"}
}
```
Topic segmentation, decision extraction, owner attribution, and CRM field mapping all require language understanding, so the LLM produces the main output of the product. It is not an add-on.

### 6. Validation Guardrail: No LLM-generated artifact reaches the user without passing through a validator
Before notes are shown, shared, or written to any external tool, a **validator** checks them:
1. **Schema validation:** the output matches the notes schema, and CRM updates match the **target CRM's field schema** (for example, `deal_stage` must be one of the actual pipeline stages configured in that HubSpot account).
2. **Evidence grounding:** every topic summary and action item must cite timestamp ranges that exist in the transcript. A **semantic-support check** (embedding similarity + an NLI-style entailment check) confirms that the cited span actually supports the claim.
3. **Attribution validation:** every action-item `owner` must be a meeting participant (from the calendar invite or diarized speaker list). Invented people are rejected.
4. **Date sanity:** due dates must be valid and on or after the meeting date. Relative phrases ("by Friday") are recomputed deterministically and compared.
5. **Numeric fidelity:** numbers, prices, and dates in the summary must appear in the cited transcript span (for example, "$25" must actually be spoken).
6. **Action safety:** any write to an external system (CRM, Linear, Slack) is validated against the user's workflow rules and permissions before execution.

### 7. Self-Correction Loop: Validation errors automatically feed back into the LLM to retry/correct
Validation failures are sent back to the LLM as targeted corrections:
```
Validation failed:
- action_items[1].owner "Mike" is not a participant. Participants: [Dana Lee, Raj Patel, Michelle Ortiz].
- topics[0].summary states "$30" but cited span 00:12:41–00:14:05 contains "$25".
- crm_updates.deal_stage "Negotiating" is not a valid stage. Valid: [Discovery, Demo, Proposal Sent, Closed Won, Closed Lost].
Fix these specific errors and return the full corrected JSON.
```
- Only failing fields are regenerated, with the relevant transcript spans re-attached as context.
- Up to **3 retries**. If an item still fails, it is **withheld** and flagged as "needs review" in the UI instead of being published or pushed to a CRM.
- Failure patterns (such as a speaker-name mismatch from diarization) are logged to improve diarization-to-participant mapping and prompts.

### 8. Deployability: If built, you are able to fully deploy it
- **Web app:** Next.js on Vercel.
- **API + processing pipeline:** containerized Python services on Fly.io / Render / AWS ECS, with a job queue for transcription and LLM processing.
- **Meeting capture:** a hosted meeting-bot API removes the need to run headless browsers ourselves at the start.
- **Data:** managed PostgreSQL with `pgvector`, and recordings in S3-compatible object storage with encryption and retention policies.
- **Integrations:** OAuth apps for Google, Microsoft, Slack, Notion, HubSpot, Salesforce, and Linear, plus outbound webhooks.
- **Compliance roadmap:** consent notices for recording, data-deletion controls, and SOC 2 readiness through standard tooling (e.g., Vanta).

All components are standard SaaS building blocks that can be deployed end to end.

---

## Architecture Sketch
```
Meeting (Zoom/Meet/Teams/in-person)
      │
      ▼
Recording ──► Speech-to-text (diarized, timestamped)
                    │
                    ▼
            LLM notes + actions + CRM mapping ──► JSON
                    ▲                               │
                    │                               ▼
        error report (≤3 retries) ◄── fail ── Validator (schema · evidence · owners · numbers · CRM fields)
                                                    │ pass
                                                    ▼
                         Notes UI · Slack · Notion · Linear · HubSpot/Salesforce · Search index
```
