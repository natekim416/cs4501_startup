# Cleanasaurus MVP Pitch: Talking Points

**5:00 hard limit, aim for ~4:30.** One of us gets picked at random, so everyone should know all three parts.

| Part | Owner | Slides | Time |
|---|---|---|---|
| 1. Problem & Market | Nate Park | Title, Pain, Market | 0:00–1:30 |
| 2. MVP & Hypothesis | Wesley Chang | What it does, Hypothesis, Demo | 1:30–3:10 |
| 3. Safety & Validation | Nate Kim | Safety loop, Validation, Metrics | 3:10–4:40 |

---

## Part 1: Nate Park, Problem & Market

**Title (0:00–0:10)**
- We're Cleanasaurus
- Tell your computer to clean itself in plain English, and trust it to do it safely

**01 The Pain (0:10–0:55)**
- The "Storage Almost Full" pop-up: **4 in 10** iPhone users have seen it
- Downloads folder: 2,000 files, 5 copies of the same lecture PDF, a mystery installer
- **20–30%** of what people keep is duplicated (research on personal file collections)
- Cleaning by hand takes hours and is risky: accidental deletion is the **#1** cause of data loss (~1/3 of cases)
- So most people just leave it
- We start with college students because we know them best

**02 The Market (0:55–1:30)**
- People pay to make this go away: **55%** have paid for cloud storage after running out
- **100M+** active Macs, and CleanMyMac's maker reaches **30M+** users
- Today it takes a stack of apps:
  - CleanMyMac to clean, Sparkle to organize, Hazel if you write rules yourself
  - Gemini for duplicates, Malwarebytes for malware
- That's **$100+/year**, and none of them understand what you want
- Cleanasaurus does all of it in one conversation

*Hand-off: "Wesley's going to show you what it actually does."*

---

## Part 2: Wesley Chang, MVP & Hypothesis

**03 What It Does (1:30–2:00)**
- Local desktop app with a chat interface
- You ask in plain English, and the LLM writes a concrete plan (every move, delete, new folder)
- A validator checks the plan before you ever see it
- One-click approve, and everything can be undone
- Scans for malware, and learns your habits so it needs less input next time

**04 Hypothesis (2:00–2:35)**
- Students with cluttered laptops will let an AI clean their files *if* every plan is checked and previewed first
- Demand is there, trust isn't:
  - **86%** of students already use AI in their studies
  - only **46%** of people are willing to trust AI (KPMG 2025, 48,000 people)
- Closing that trust gap is our whole design
- Bar: 60%+ of testers run a full plan in their first session

**05 The MVP (2:35–3:10)**
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

**06 Why These Features (3:10–3:30)**
- MVP focuses on what tests trust: chat-to-plan, malware scans, permission zones, undo
- Malware is real on Macs: macOS backdoor variants up **67%** in 2025 (Moonlock)
- Windows support comes later
- Core loop: no plan reaches you until the validator passes it
- Failures go back to the LLM automatically. If it's still stuck, it asks you

**07 Validation Plan (3:30–3:50)**
- 15 testers: 10 friends and classmates plus 5 non-CS students or family, so we don't only test people like us
- *(Optional if short on time)* Week 1: 20-minute think-aloud sessions on their own laptops, 3 tasks
- *(Optional)* Week 2: 7 days unsupervised, opt-in logs of plans, approvals, retries, questions, and undos, then an exit survey

**08 Success Metrics (3:50–4:40)**
- Primary: 60%+ approve and run a full plan in session 1. Under 40% means the hypothesis is wrong
- 40%+ run another cleanup within a week, so it's actually useful
- Under 10% of actions undone, so the plans are right
- Safety: zero unsafe actions reach a user. One, and we stop
- "Thank you!"

---

Sources and the competitor cheat sheet are at the bottom of [PRESENTATION_SCRIPT.md](PRESENTATION_SCRIPT.md).
