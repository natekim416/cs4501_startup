# Startup Idea 4: Motion — An AI-Planned Workday That Is Always Feasible

**Reference company:** [Motion](https://www.ycombinator.com/companies/motion) (YC W20, San Francisco)
**Founder:** Harry Qi (Dartmouth Math & CS, former quant trader)
**Tagline:** "The only work management platform for both Human and AI Employees."
**Category:** AI · Productivity · Project Management · Calendar

---

## Overview

Motion is an AI-native work management platform. It combines projects, tasks, calendar, docs, and scheduling, and its central feature is **automatic daily planning**: Motion takes everyone's tasks (with duration, priority, deadlines, and dependencies) and their calendars (meetings and working hours), then **schedules the work onto the calendar automatically**. When plans change because a meeting moves or a task runs over, Motion **re-prioritizes and reschedules in real time**. It has since grown into a platform where companies also deploy "AI Employees" that do work alongside humans.

---

## How Motion Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: "What should I work on right now, and will everything get done on time?"**
Under all of its features, Motion solves one problem: turning a pile of tasks and a fragmented calendar into a **realistic, constantly updated plan**. Projects, docs, and AI Employees all feed that one schedule, so the plan stays at the center of the product.

### 2. You know the target customers or have direct access to them
The customers are knowledge workers and teams who juggle many priorities. I have direct access to:
- **University students**, who are an extreme version of this problem: 5 classes, problem sets with hard deadlines, a part-time job, club commitments, and recruiting, all competing for the same hours.
- **Student startup teams and club leadership boards**, who coordinate shared projects with dependencies.
- **Internship managers and small-business owners** in my network, who live in their calendars.
- **Myself:** I currently do this planning by hand every Sunday night and regularly get it wrong.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Calendar sync | Google Calendar & Microsoft Graph APIs (OAuth, push notifications/webhooks) | Learnable quickly |
| Scheduling engine | Constraint solver: Google OR-Tools (CP-SAT) or a custom greedy/ILP scheduler | Familiar from algorithms/optimization coursework |
| Backend | Python (FastAPI) + PostgreSQL + Redis queue | Familiar |
| Frontend | React / Next.js, drag-and-drop calendar UI | Familiar |
| LLM | Claude API with structured outputs | Familiar |
| Hosting | Vercel + Fly.io/Render + managed Postgres | Familiar |

### 4. Reimagines the problem space to make it significantly better
Traditional tools keep **the task list** (Todoist, Asana, Jira) separate from **the calendar** (Google Calendar). The user has to combine them mentally, and the result is usually a to-do list that is impossible to finish in the time available. Motion reimagines planning:
- **Tasks get time, not just a checkbox.** Every task is placed in a concrete time block, so the plan has to be physically possible.
- **The plan updates continuously.** When a meeting gets added at 2pm, affected tasks move automatically instead of being silently missed.
- **Deadline risk is visible early.** Because the schedule is computed, Motion can warn you on Monday that Thursday's deadline is at risk.
- **Team-aware.** Dependencies across people are scheduled together, so a blocked task is not scheduled before its blocker finishes.

Planning moves from a weekly manual chore to a continuously optimized system.

### 5. An LLM/Generative model is core to the solution (not a "chatbot in a sidebar")
The deterministic solver needs **structured constraints**, but people describe work in messy language: "Finish the investor update before the board meeting, probably 2 hours, needs Sarah's numbers first, I focus best in the morning." The LLM is the **constraint compiler** between human intent and the optimizer:
- **Input:** free-form task descriptions, emails, meeting notes, or project briefs, plus the user's existing projects and teammates.
- **Output:** structured tasks and constraints:
```json
{
  "tasks": [
    {
      "id": "t1",
      "title": "Write investor update",
      "estimated_minutes": 120,
      "deadline": "2026-10-22T09:00:00-04:00",
      "priority": "high",
      "depends_on": ["t0"],
      "preferred_time": "morning",
      "chunkable": true,
      "min_chunk_minutes": 45
    }
  ],
  "new_dependencies": [{"task": "t0", "owner": "sarah@company.com", "title": "Provide Q3 numbers"}]
}
```
The LLM also **decomposes vague projects** ("launch the new landing page") into concrete, estimated subtasks with dependencies. The optimizer then turns all of this into a calendar. Without the LLM, users fill out a 7-field form for every task, which is the friction that makes people abandon planners.

### 6. Validation Guardrail: No LLM-generated artifact reaches the user without passing through a validator
No LLM-generated task, constraint, or plan reaches the user's calendar without passing a **validator**:
1. **Schema validation:** required fields present, `estimated_minutes` within 5–960, `priority` in the allowed enum, valid ISO-8601 datetimes with time zones.
2. **Referential integrity:** `depends_on` IDs must exist, assignees must be real workspace members, and referenced projects must exist.
3. **Graph validation:** the dependency graph must be a **DAG** (cycle detection via topological sort). A cycle such as "A depends on B depends on A" is rejected.
4. **Temporal sanity:** deadlines are in the future, and a task's deadline must be no earlier than its dependencies' earliest completion.
5. **Feasibility validation (the solver as validator):** the constraint set is passed to the CP-SAT solver. If there is **no feasible schedule** (for example, 14 hours of high-priority work due tomorrow with only 6 working hours free), the solver returns an infeasibility certificate showing which constraints conflict.
6. **Grounding check:** extracted deadlines and durations must be traceable to the source text, or explicitly marked `"estimated": true` so the UI shows them as estimates.

Only a validated, **feasible** plan is written to the calendar.

### 7. Self-Correction Loop: Validation errors automatically feed back into the LLM to retry/correct
Validation and solver errors go straight back to the LLM:
```
Validation failed:
- Dependency cycle detected: t2 → t4 → t2. Remove or reverse one edge.
- t3.assignee "alex@company.com" is not a workspace member. Members: [alex.kim@company.com, sarah@company.com].
- Infeasible: tasks {t1, t5, t6} total 840 min of high-priority work before 2026-10-22T09:00, but only 360 min free.
  Options: lower priority on non-critical tasks, split into chunks, or propose a deadline extension (must be flagged as a proposal).
Return corrected tasks/constraints.
```
- The LLM revises the constraints (fixes the cycle, resolves the assignee, re-scopes or re-prioritizes). The output is **re-validated and re-solved**.
- Up to **3 retries**. If the plan is still infeasible, the user sees a clear, validated **trade-off choice** ("These 3 tasks can't all fit before Thursday. Push X, or drop Y?") instead of a broken or silently over-packed schedule.
- The LLM can never move a hard deadline on its own. Deadline changes are always surfaced as proposals that need user approval.

### 8. Deployability: If built, you are able to fully deploy it
- **Web app:** Next.js on Vercel. A mobile companion can follow as a PWA.
- **Backend:** FastAPI service + background workers (scheduling, calendar sync) in Docker on Fly.io/Render, using managed PostgreSQL and Redis.
- **Solver:** OR-Tools runs in-process in the worker containers, with no external service needed.
- **Calendar integration:** Google/Microsoft OAuth, using webhook push notifications to trigger rescheduling in real time.
- **LLM:** server-side Claude API calls with per-user rate limiting.
- **Observability:** Sentry + structured logs that track validation-failure rates and solver runtimes.

Everything runs on standard, self-serve cloud infrastructure, so it is fully deployable by a small team.

---

## Architecture Sketch
```
Free-form tasks / emails / project briefs
            │
            ▼
   LLM constraint compiler ──► tasks + constraints (JSON)
            ▲                            │
            │                            ▼
 error/infeasibility report ◄── fail ── Validator (schema · refs · DAG · temporal)
     (≤3 retries)                        │ pass
            ▲                            ▼
            └────────── infeasible ── CP-SAT scheduler (feasibility = final validator)
                                         │ feasible
                                         ▼
                           Calendar time blocks (auto-rescheduled on change)
```
