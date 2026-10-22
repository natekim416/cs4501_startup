# Cleanasaurus MVP Pitch: Presentation Script

**Hard limit: 5:00. Target: about 4:35 (≈690 words at a normal pace, not counting the optional Week 1/2 lines).**

> ⚠️ **One person will be picked at random to give the whole talk.** The parts below are split by who built what, so each person "owns" the slides and Q&A closest to their work, but **all three of us must rehearse the entire script.** Practice it with a timer at least 3 times.

| Part | Speaker (owner) | Slides | Time |
|---|---|---|---|
| 1. Problem & Market | **Nate Park** (front end) | Title, 01 Pain, 02 Market | 0:00–1:30 |
| 2. MVP & Hypothesis | **Wesley Chang** (front end) | 03 What it does, 04 Hypothesis, 05 MVP demo | 1:30–3:10 |
| 3. Safety & Validation | **Nate Kim** (back end) | 06 Safety loop, 07 Validation plan, 08 Metrics | 3:10–4:40 |

`(pause)` = stop for one beat. **Bold** = hit this word.

---

## Part 1: Nate Park (front end): Problem & Market

**[Title · 0:00–0:10]**
Hello, our startup is called Cleanasaurus. So the main idea is that you should be able to tell your computer to clean itself, in plain English, and **trust** it to do it safely. 

**[01 The Pain · 0:10–0:55]**
Imagine the "Storage Almost Full" pop-up. You're not alone: in one survey, more than **four in ten** iPhone users had seen that exact warning. You open Downloads and there are two thousand files, five copies of the same lecture PDF, and an installer you don't remember. Research on personal file collections estimates **twenty to thirty percent** of what people keep is duplicated. Cleaning it by hand takes hours, and it's risky: accidental deletion is the **number one** cause of personal data loss, about a third of cases. So most people just leave it. We're starting with college students on laptops, because we know them best.

**[02 The Market · 0:55–1:30]**
And people **pay** to make this go away. Fifty-five percent of U.S. adults in one survey have paid for cloud storage after running out of space. There are over a **hundred million** active Macs, and MacPaw, the company behind CleanMyMac, reaches thirty million users. But fixing a messy laptop today takes a stack of apps: CleanMyMac to clean, Sparkle to organize, Hazel if you write the rules yourself, Gemini for duplicates, Malwarebytes for malware. That's over a hundred dollars a year, and none of them understand what you actually want. Cleanasaurus does **all of it** in one conversation.

*Hand-off line (if splitting): "Wesley's going to show you what it actually does."*

---

## Part 2: Wesley Chang (front end): MVP & Hypothesis

**[03 What It Does · 1:30–2:00]**
Cleanasaurus is a local desktop app with a chat interface. You ask for what you want in plain english. The LLM writes a concrete plan for every move, delete, or new folder. Then there's a validator that checks that plan **before** you ever see it. Then you approve it with one click, and everything can be undone. Along the way it scans for malware, and it learns your habits so next time it needs less input.

**[04 Hypothesis · 2:00–2:35]**
Our hypothesis is that students with cluttered laptops will let an AI clean and reorganize their files, as long as every plan is checked and previewed first. Research says the demand is there but trust isn't: **eighty-six percent** of students already use AI in their studies, but a 2025 KPMG study of 48,000 people found only **forty-six percent** are willing to trust AI. Closing that gap is our whole design. So the question is **trust**, not capability, and our bar is at least **sixty percent** of testers running a full cleanup plan in their first session.

**[05 The MVP · 2:35–3:10]**
This is our working MVP. The dino **is** the chatbot. You type "free up space and sort my school files by class." It comes back with a plan that already passed the validator: quarantine two files the malware scanner flagged, trash duplicates proven identical by hash, and move lecture PDFs into class folders. You uncheck anything you don't want, approve, and can undo with one click. When it hits something strange, like three different resumes, it **asks** you instead of guessing, and remembers your answer.

*Hand-off line: "Nate Kim built the engine that makes that safe."*

---

## Part 3: Nate Kim (back end): Safety Loop, Validation & Metrics

**[06 Why These Features · 3:10–3:30]**
With our MVP we wanted to focus on items that tested trust. So right now, we have chat-to-plan, malware scans, permission zones, and undo. Malware matters here: Moonlock found macOS backdoor variants rose **sixty-seven percent** in 2025. We also want to implement Windows support later down the road. And the core of trust is this loop is that **no plan reaches you** until the validator passes it. Failures go back to the LLM automatically, and if it's still stuck, it asks you.

**[07 Validation Plan · 3:30–3:50]**
To test it, we're recruiting our friends. We want at least ten friends and classmates, plus five non-CS students or family members, so we aren't only testing on people like us.

*Optional, only if you are under time:* Week one, we sit with each of them for twenty minutes on their own laptop while they think aloud through three tasks. Week two, we step back: seven days of unsupervised use, with opt-in logs of every plan, approval, retry, question, and undo, then an exit survey.

**[08 Success Metrics · 3:50–4:40]**
Our primary KPI is that at least **sixty percent** of testers approve and run a full plan in their first session. If we have under forty percent, our hypothesis is wrong. Second, forty percent run another cleanup within a week, which shows it's useful, not just another useless desktop app. Third, fewer than ten percent of actions get undone, which shows the plans are actually right. And for safety, **zero** unsafe actions can reach a user. One, and we stop. Thank you!

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
- **42%** of iPhone users have seen "Storage Almost Full" (SellCell survey)
- **20–30%** of personal file collections is duplicated · **47%** of people say they struggle with duplicates (Henderson 2005/2011, Hicks et al. 2008, via arXiv 2402.06421)
- **~34%** of data loss is accidental deletion, the #1 cause (Handy Recovery survey of 1,000 people)
- **55%** have paid for cloud storage after running out (All About Cookies U.S. survey)
- **86%** of students use AI in their studies (Digital Education Council, 3,839 students, 2024)
- **46%** willing to trust AI (KPMG + Univ. of Melbourne, 48,000 people, 47 countries, 2025)
- **+67%** macOS backdoor variants in 2025 (Moonlock / MacPaw threat report)

## Competitor cheat sheet (for "why not just use X?")
Prices vary by source and changed in 2025–26, so say "about."

| App | Does | ~Price | Missing |
|---|---|---|---|
| CleanMyMac | Junk cleanup, malware scan | ~$40–70/yr | Can't organize or understand requests |
| Sparkle (Every) | AI folder sorting | ~$10/mo | No malware checks, no limits you set, reads names only |
| Hazel | Folder rules | ~$42 once | You write every rule by hand |
| Gemini 2 | Duplicate finder | ~$20/yr | Gives you a list to review yourself |
| Malwarebytes | Antivirus | ~$40–45/yr | No cleanup or organizing |

## Sources
- SellCell iPhone storage survey: https://www.sellcell.com/blog/electronics-hoarding-survey/
- Duplicates in personal collections: https://arxiv.org/pdf/2402.06421
- Data loss causes: https://www.handyrecovery.com/data-loss-statistics/
- Paying for cloud storage: https://allaboutcookies.org/cloud-storage-statistics
- Students and AI: https://campustechnology.com/articles/2024/08/28/survey-86-of-students-already-use-ai-in-their-studies.aspx
- Trust in AI: https://kpmg.com/za/en/newsroom/press-releases/2025/05/global-study-reveals-trust-of-ai-remains-a-critical-challenge-reflecting-tension-between-benefits-and-risks.html
- Mac malware: https://moonlock.com/2025-macos-threat-report
- Competitor prices: Macworld, Software Advice, Every, Tom's Guide reviews
