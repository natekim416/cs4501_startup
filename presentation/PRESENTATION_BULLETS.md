# Cleanasaurus MVP Pitch: Talking Points

**5:00 hard limit, aim for ~4:30.** One of us gets picked at random, so everyone should know all three parts.

| Part | Owner | Slides | Time |
|---|---|---|---|
| 1. Problem & Market | Nate Park | Title, Pain, Market | 0:00–1:30 |
| 2. MVP & Hypothesis | Wesley Chang | What it does, Hypothesis, Demo | 1:30–3:05 |
| 3. Safety & Validation | Nate Kim | Safety loop, Validation, Metrics | 3:05–4:45 |

---

## Part 1: Nate Park, Problem & Market

**Title (0:00–0:10)**
- We're Cleanasaurus
- Tell your computer to clean itself in plain English, and trust it to do it safely

**01 The Pain (0:10–0:55)**
- The "Storage Almost Full" pop-up
- Downloads folder: 2,000 files, 5 copies of the same lecture PDF, a mystery installer
- Cleaning by hand takes hours, and one wrong delete can cost you something important
- So most people just leave it
- Target user: anyone with storage or organization problems. We start with college students because we know them best

**02 The Market (0:55–1:30)**
- People already pay to fix this: 100M+ active Macs, and CleanMyMac's maker reaches 30M+ users
- But every tool only does one slice:
  - CleanMyMac: cleans and scans, but can't organize or understand what you want
  - Sparkle: organizes with AI, but has no malware checks and no limits you control
  - Hazel: you write the rules by hand
- Cleanasaurus does all four in one conversation

*Hand-off: "Wesley's going to show you what it actually does."*

---

## Part 2: Wesley Chang, MVP & Hypothesis

**03 What It Does (1:30–2:00)**
- Local desktop app with a chat interface
- You ask in plain English, and the LLM writes a concrete plan (every move, delete, new folder)
- A validator checks the plan before you ever see it
- One-click approve, and everything can be undone
- Scans for malware, and learns your habits so it needs less input next time

**04 Hypothesis (2:00–2:25)**
- Students with cluttered laptops will let an AI clean their files *if* every plan is checked and previewed first
- The question is trust, not capability
- Bar: 60%+ of testers approve and run a full plan in their first session

**05 The MVP (2:25–3:05)**
- Working MVP. The dino is the chatbot
- Example request: "free up space and sort my school files by class"
- The plan comes back already validated:
  - quarantine 2 files flagged as malware
  - trash duplicates proven identical by hash
  - move lecture PDFs into class folders
- Uncheck what you don't want, approve, undo in one click
- When it hits something strange (3 different resumes), it asks you instead of guessing, and remembers your answer

*Hand-off: "Nate Kim built the engine that makes that safe."*

---

## Part 3: Nate Kim, Safety, Validation & Metrics

**06 Why These Features (3:05–3:20)**
- MVP focuses on what tests trust: chat-to-plan, malware scans, permission zones, undo
- Windows support comes later
- Core loop: no plan reaches you until the validator passes it
- Failures go back to the LLM automatically. If it's still stuck, it asks you

**07 Validation Plan (3:20–3:55)**
- 15 testers: 10 friends and classmates plus 5 non-CS students or family, so we don't only test people like us
- *(Optional if short on time)* Week 1: 20-minute think-aloud sessions on their own laptops, 3 tasks
- *(Optional)* Week 2: 7 days unsupervised, opt-in logs of plans, approvals, retries, questions, and undos, then an exit survey

**08 Success Metrics (3:55–4:45)**
- Primary: 60%+ approve and run a full plan in session 1. Under 40% means the hypothesis is wrong
- 40%+ run another cleanup within a week, so it's actually useful
- Under 10% of actions undone, so the plans are right
- Safety: zero unsafe actions reach a user. One, and we stop
- "Thank you!"
