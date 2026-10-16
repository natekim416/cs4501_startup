# Startup Idea 1: Vimcal — The Fastest Calendar, Rebuilt Around Language

**Reference company:** [Vimcal](https://www.ycombinator.com/companies/vimcal) (YC S18, New York City)
**YC tagline:** "The world's fastest calendar, beautifully designed for remote teams."
**Category:** SaaS · Productivity · Scheduling · Calendar

---

## Overview

Vimcal is a keyboard-first calendar for people who live in their calendars: founders, recruiters, salespeople, and anyone on a remote team spread across time zones. Its main advantage is speed. You can create events, send availability, and switch time zones in a few keystrokes instead of many clicks.

This version keeps that speed and adds an LLM-powered **command bar**. A user types or pastes free-form text, such as "30 min with Priya and Sam next week, mornings Pacific, not Friday" or a raw email thread asking to meet. The system turns it into a **validated** calendar action: an event, a set of proposed slots, or a reschedule. That action is checked against the user's real calendar before it is shown or sent.

---

## How Vimcal Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: turning scheduling intent into a correct calendar action as fast as possible.**
Vimcal does not try to be a CRM, a task manager, or a meeting recorder. It does one thing: get a meeting from "we should talk" to "on everyone's calendar in the right time zone" with as little friction as possible. Every feature (keyboard shortcuts, availability sharing, time-zone overlays, the NL command bar) serves that goal.

### 2. You know the target customers or have direct access to them
The core users are heavy calendar users on distributed teams. As a university student I have direct access to:
- **Student org leaders and TAs**, who schedule dozens of meetings a week across conflicting class schedules.
- **Recruiters and alumni** I talk to during internship season, who coordinate across time zones every day.
- **Startup founders** in the university entrepreneurship network and YC alumni communities, who are Vimcal's original power-user group.

I can interview these people this week, watch them schedule a meeting, and count the clicks.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Frontend | React / Next.js, keyboard-shortcut handling | Familiar |
| Calendar data | Google Calendar API, Microsoft Graph API (OAuth 2.0) | Learnable quickly: well-documented REST APIs |
| Backend | Node.js or Python (FastAPI), PostgreSQL | Familiar |
| Time zones | `luxon` / `date-fns-tz` / Python `zoneinfo` (IANA tz database) | Familiar |
| LLM | Claude API with structured (JSON) tool output | Familiar from coursework |
| Hosting | Vercel (frontend) + Fly.io/Render (API) + managed Postgres | Familiar |

### 4. Reimagines the problem space to make it significantly better
Traditional calendars (Google Calendar, Outlook) are **form-driven**: click a slot, fill in fields, open a separate time-zone converter, then copy-paste availability into an email. Vimcal reimagines the calendar as a **command-driven tool**, like Vim for your schedule:
- **Keyboard-first:** almost every action is a shortcut, so there is no mouse round-trip.
- **Availability as a first-class object:** you select open slots and paste them as text or a booking link in seconds, already converted to the recipient's time zone.
- **Language as input:** with the LLM command bar, the input is what you would have said to an assistant, not a form. Pasting an email thread like "Does Tues or Wed afternoon work for you guys? I'm in London" produces correctly converted candidate slots that avoid existing conflicts.

The result is a 5–10x reduction in time-to-scheduled for common meetings.

### 5. An LLM/Generative model is core to the solution (not a "chatbot in a sidebar")
The LLM is **the parser for scheduling intent**, the main way scheduling input enters the product. It is not a chat window next to the calendar. Its job:
- **Input:** free text or a pasted email thread, plus context (the user's time zone, working hours, known contacts).
- **Output:** a strict structured object, for example:
```json
{
  "action": "propose_slots",
  "title": "Sync with Priya & Sam",
  "duration_minutes": 30,
  "attendees": ["priya@acme.com", "sam@acme.com"],
  "window": {"start": "2026-10-19", "end": "2026-10-23"},
  "constraints": {
    "time_of_day": {"start": "09:00", "end": "12:00", "tz": "America/Los_Angeles"},
    "exclude_weekdays": ["FRI"]
  }
}
```
A deterministic slot-finding engine then uses this object to query free/busy data. Without the LLM, the user goes back to filling out forms, so the product's main interaction depends on it.

### 6. Validation Guardrail: No LLM-generated artifact reaches the user without passing through a validator
Every LLM output passes through a **layered validator** before it is rendered or sent:
1. **Schema validation** (Zod / Pydantic): required fields present, correct types, `action` is in an allowed set.
2. **Semantic/temporal validation:**
   - All time zones are valid IANA identifiers.
   - The date window is in the future and `start < end`.
   - Duration is between 5 and 480 minutes.
   - Times fall within declared constraints and do not cross DST gaps ambiguously.
3. **Grounding validation:**
   - Every attendee email resolves to a known contact or appears literally in the input text. Invented emails are rejected.
   - Relative dates ("next Tuesday") are recomputed deterministically and must match the LLM's resolved dates.
4. **Calendar-reality validation:** proposed slots must have no conflicts on the user's free/busy data (and on attendees' data, when visible).

Only an object that passes all four layers is shown as a confirmation card ("Create event?" / "Copy these 3 slots?"). Nothing is written to the calendar or emailed without passing.

### 7. Self-Correction Loop: Validation errors automatically feed back into the LLM to retry/correct
When validation fails, the system builds a **structured error report** and sends it back to the LLM with the original input:
```
Your previous output failed validation:
- constraints.time_of_day.tz = "PST" is not a valid IANA zone (did you mean "America/Los_Angeles"?)
- attendees[1] = "sam@company.com" does not appear in the input or contacts; known match: "sam@acme.com"
- Resolved "next Tuesday" as 2026-10-21, but deterministic resolution gives 2026-10-20.
Return a corrected JSON object.
```
- Up to **3 automatic retries**, each with the cumulative error list.
- If the loop still fails, the UI falls back to a **pre-filled manual form** that highlights the uncertain fields, so the user is never shown an unvalidated guess.
- All failures are logged with their error types to improve the prompt and few-shot examples over time.

### 8. Deployability: If built, you are able to fully deploy it
- **Web app:** Next.js on Vercel, deployed through CI/CD on every push to `main`.
- **API + workers:** containerized FastAPI/Node service on Fly.io or Render, using managed PostgreSQL (Supabase/Neon) for users, tokens, and preferences.
- **Auth:** Google and Microsoft OAuth, with tokens encrypted at rest.
- **LLM:** Claude API through server-side calls, so no keys reach the client.
- **Cost/scale:** each command is a single short LLM call (plus at most 3 retries), so it is cheap enough for a free tier.
- **Compliance step:** Google OAuth verification for calendar scopes, which is a documented and achievable process.

Every piece is standard, documented infrastructure that a small team can deploy and run end to end.

---

## Architecture Sketch
```
User input (text / pasted email)
        │
        ▼
   LLM intent parser ──► structured JSON
        │                     │
        │                     ▼
        │           Validator (schema → temporal → grounding → calendar)
        │                     │
        │        ┌────── fail ┴ pass ──────┐
        │        ▼                         ▼
        └── error report (≤3 retries)   Confirmation card → Calendar API / clipboard
                 │
                 └── after 3 fails → pre-filled manual form
```
