# Cleanasaurus MVP Pitch: Presentation Script

**Hard limit: 5:00. Target: about 4:30 (≈620 words at a normal pace).**

> ⚠️ **One person will be picked at random to give the whole talk.** The parts below are split by who built what, so each person "owns" the slides and Q&A closest to their work, but **all three of us must rehearse the entire script.** Practice it with a timer at least 3 times.

| Part | Speaker (owner) | Slides | Time |
|---|---|---|---|
| 1. Problem & Market | **Nate Park** (front end) | Title, 01 Pain, 02 Market | 0:00–1:30 |
| 2. MVP & Hypothesis | **Wesley Chang** (front end) | 03 What it does, 04 Hypothesis, 05 MVP demo | 1:30–3:05 |
| 3. Safety & Validation | **Nate Kim** (back end) | 06 Safety loop, 07 Validation plan, 08 Metrics | 3:05–4:45 |

`(pause)` = stop for one beat. **Bold** = hit this word.

---

## Part 1: Nate Park (front end): Problem & Market

**[Title · 0:00–0:10]**
Hello, our startup is called Cleanasaurus. So the main idea is that you should be able to tell your computer to clean itself, in plain English, and **trust** it to do it safely. 

**[01 The Pain · 0:10–0:55]**
Imagine this scenario: the "Storage Almost Full" pop-up. You open Downloads and there are two thousand files, five copies of the same lecture PDF, and an installer you don't even remember downloading. Cleaning it up by hand would take hours, and one wrong delete can cost you something important, so most people just leave this everything there and suffer the consequences of full storage. Our target user is **anyone** with storage or organization problems, and we're starting with college students on laptops, because we know this audience the best.

**[02 The Market · 0:55–1:30]**
People are already paying to fix this issue. There are over a **hundred million** active Macs, and MacPaw, the company behind CleanMyMac, reaches over thirty million users. But through our research about other companies, we learned that every tool does one slice. CleanMyMac cleans and scans for malware but can't organize or understand what you want. Sparkle organizes with AI, but has no malware checks and no limits you control. Hazel makes you write rules by hand. Cleanasaurus is the first to do **all four** in one conversation.

*Hand-off line (if splitting): "Wesley's going to show you what it actually does."*

---

## Part 2: Wesley Chang (front end): MVP & Hypothesis

**[03 What It Does · 1:30–2:00]**
Cleanasaurus is a local desktop app with a chat interface. You ask for what you want in plain english. The LLM writes a concrete plan for every move, delete, or new folder. Then there's a validator that checks that plan **before** you ever see it. Then you approve it with one click, and everything can be undone. Along the way it scans for malware, and it learns your habits so next time it needs less input.

**[04 Hypothesis · 2:00–2:25]**
Our hypothesis is that we believe students with cluttered laptops will let an AI clean and reorganize their files, as long as every plan is checked and previewed first. The question with this is **trust**, not capability. Our bar is if at least **sixty percent** of testers approve and run a full cleanup plan in their very first session.

**[05 The MVP · 2:25–3:05]**
This is our working MVP. The dino **is** the chatbot. You type "free up space and sort my school files by class." It comes back with a plan that already passed the validator: quarantine two files the malware scanner flagged, trash duplicates proven identical by hash, and move lecture PDFs into class folders. You uncheck anything you don't want, approve, and can undo with one click. When it hits something strange, like three different resumes, it **asks** you instead of guessing, and remembers your answer.

*Hand-off line: "Nate Kim built the engine that makes that safe."*

---

## Part 3: Nate Kim (back end): Safety Loop, Validation & Metrics

**[06 Why These Features · 3:05–3:20]**
With our MVP we wanted to focus on items that tested trust. So right now, we have chat-to-plan, malware scans, permission zones, and undo. We also want to implement Windows support later down the road. And the core of trust is this loop is that **no plan reaches you** until the validator passes it. Failures go back to the LLM automatically, and if it's still stuck, it asks you.

**[07 Validation Plan · 3:20–3:55]**
To test it, we're recruiting our friends. We want at least ten friends and classmates, plus five non-CS students or family members, so we aren't only testing on people like us.

**optional ngl:***Week one, we sit with each of them for twenty minutes on their own laptop while they think aloud through three tasks. Week two, we step back: seven days of unsupervised use, with opt-in logs of every plan, approval, retry, question, and undo, then an exit survey.

**[08 Success Metrics · 3:55–4:45]**
Our primary KPI is that at least **sixty percent** of testers approve and run a full plan in their first session. If we have under forty percent, our hypothesis is wrong. Second, forty percent run another cleanup within a week, which shows it's useful, not just anothe ruseless desktop app. Third, fewer than ten percent of actions get undone, which shows the plans are actually right. And for safety, **zero** unsafe actions can reach a user. One, and we stop. Thank you!

---

## Q&A (1–2 minutes): who answers first

Whoever is presenting answers. If the room allows teammates to help, the owner jumps in.

| Question | Owner | Answer (≤40 words) |
|---|---|---|
| Why does this need an LLM? | Wesley | Turning "sort my school stuff by class" into specific file moves needs language understanding. Fixed rules can't do it, which is why Hazel makes you write rules yourself. |
| What if it deletes something important? | Nate Kim | It can only remove files proven byte-identical by SHA-256 to a copy that survives. Removed files go to the Dino Bin, every run can be undone, and NEVER zones are blocked by the validator. |
| How does the self-correction loop work? | Nate Kim | Validator errors are sent back to the LLM word-for-word, like "this destination is a NEVER zone." It retries up to three times; if it still fails, it keeps only the safe actions and asks the user. |
| Can the AI call something malware wrongly? | Nate Kim | No. Only the scanners (ClamAV, signatures, file-type and signing checks) can flag a file. The validator rejects any quarantine the scanner didn't flag. |
| Privacy? | Nate Kim | Everything runs locally. Only file names and metadata go to Claude, never file contents, and demo mode works fully offline. |
| Why not just CleanMyMac? | Nate Park | It can't organize files, and you can't tell it what you want in plain English. We combine cleaning, organizing, and malware checks in one conversation. |
| Testing on friends is biased. | Nate Park | That's why a third of testers are non-CS students or family, and we measure what people *do* (logs), not just what they say. |
| How do you make money? | Nate Park | Freemium: cleanup is free; automatic organizing and ongoing protection are paid, like CleanMyMac. |
| Can you actually ship it? | Wesley | It already runs. It's an Electron app, so it packages as a signed macOS installer with auto-updates. No server needed. |

## Key numbers to memorize
- **≥60%** approve a full plan in session 1 (fail **<40%**)
- **≥40%** run a second cleanup in 7 days · **≤10%** of actions undone · **0** unsafe actions
- **15** testers (10 friends + 5 non-CS/family), **2** weeks
- **100M+** active Macs (Apple, 2018) · **30M+** MacPaw users
