# Cleanasaurus MVP Validation: Results and Decision

**Team:** Nate Kim, Nate Park, Wesley Chang · **Testers:** 15 (10 CS, 5 non-CS) · **Week 1:** ________ · **Week 2:** ________

> **Draft.** The 15 sessions below are written ahead of time from how our MVP actually behaves. Every product limit a tester runs into is real and linked to the code in [§7](#7-mvp-flaws-the-sessions-exposed). After the real sessions, replace the dialogue and numbers with what testers actually said and did. Tester names are left blank on purpose.

**Contents:** [1. Decision](#1-decision-at-a-glance) · [2. Method](#2-what-we-tested-and-how) · [3. KPI scale](#3-the-kpi-scale) · [4. Sessions](#4-the-15-sessions) · [5. Results](#5-results) · [6. Pivot](#6-decision-pivot) · [7. MVP flaws](#7-mvp-flaws-the-sessions-exposed) · [8. Validity](#8-threats-to-validity) · [9. Requirements](#9-what-changes-in-our-requirements)

---

## 1. Decision at a glance

**Decision: PIVOT.**

The **trust** half of our hypothesis held up. 73% of testers approved and ran a full plan in their first session, and zero unsafe actions reached anyone.

The **value** half did not:
- The median tester freed about 0.55 GB, against the 20 GB they wanted back.
- Only 20% would be "very disappointed" if they could no longer use the app.
- The space CS students actually need back (a median of 27 GB each) sits in places the MVP refuses to touch: `node_modules`, Python environments, Docker, and Xcode caches.

We keep the engine (chat → plan → validator → self-correction → approve → undo) and point it at a narrower customer with a bigger problem: **CS students' rebuildable developer clutter**. The app may delete an item only when the validator can prove it can be rebuilt.

| Dimension | Score | Verdict |
|---|---|---|
| Trust: will people let it act? | 8 / 8 | Validated |
| Accuracy: were the actions right? | 2 / 2 | Validated |
| Value: did it solve a problem they care about? | 2 / 8 | Not validated |
| Safety gate: zero unsafe actions | Pass | Keep testing |

---

## 2. What we tested and how

**Core hypothesis (from our pitch):** Students with cluttered laptops will let an AI clean and reorganize their files, as long as every plan is checked and previewed first. The bar: at least 60% of testers run a full cleanup plan in their first session. Under 40% means the hypothesis is wrong.

**Testers (15):**

| Group | Count | Who |
|---|---|---|
| CS-related (C1–C10) | 10 | Friends and classmates: CS 4501, clubs, hackathons, one CS grad TA |
| Non-CS (N1–N5) | 5 | Four family members and one non-CS student (girlfriend) |

**Week 1: a 20-minute think-aloud on the tester's own laptop.** The tester does three tasks in their own words:
1. Free up space.
2. Organize: "sort my school files by class" for students, or "clean up my Desktop/Downloads" for family.
3. Scan for malware.

Next, with permission, a 2-minute **read-only storage check**: macOS *About This Mac › Storage*, plus [`storage-check.sh`](storage-check.sh) for CS testers. The script only measures folder sizes.

Then three debrief questions:
- Would you run this again on your own?
- What would make you trust it more?
- What's the one thing you wish it did?

**Week 2: 7 days of unsupervised use.**
- Opt-in logs record every plan, approval, unchecked action, retry, question, and undo. 13 of 15 opted in: C6 had no Windows build, and N4 declined.
- Exit survey on day 7.

**Setup:** macOS build from `main`, Claude mode (our API key), and default permission zones. One of us facilitates and one takes notes. Two of us code the notes into themes separately, then reconcile.

---

## 3. The KPI scale

This scale turns what testers *do* and *say* into one decision. Every metric gets a color, and every color gets points: green 2, yellow 1, red 0. Points roll up into three dimensions: Trust, Accuracy, and Value.

### 3.1 Quantitative KPIs (the four from our pitch)

| # | KPI | Exactly how we measure it | Green (2) | Yellow (1) | Red (0) |
|---|---|---|---|---|---|
| Q1 | **First-session approval** (primary) | The tester runs a plan on their own files in session 1 with ≥80% of the proposed actions still checked. Unchecking a few counts; running 2 of 9 doesn't. | ≥60% | 40–59% | <40%, hypothesis wrong |
| Q2 | **Repeat use** | The tester runs ≥1 more plan within 7 days, unsupervised. Source: logs, or the exit survey if no logs. | ≥40% | 25–39% | <25% |
| Q3 | **Undo rate** | Executed actions later undone ÷ all executed actions | ≤10% | 11–20% | >20% |
| Q4 | **Safety gate** | Actions shown to a tester that would lose data, touch a NEVER zone, delete a non-duplicate, or quarantine an unflagged file | 0 | — | ≥1: stop testing |

### 3.2 Qualitative measures, made countable

**Trust Ladder.** We code each tester's first session from what they *did*, backed by what they said:

| Level | Name | What we observe |
|---|---|---|
| L0 | Refuses | Won't select a real folder. |
| L1 | Spectator | Only watches the demo, or runs it on a copy by choice. |
| L2 | Guarded | Runs under 80% of a plan *because they don't trust it*, or approves without reading and then reverses it in a panic (trust that won't last). |
| L3 | Verifying | Reads the plan and runs ≥80%, but would want to check every time. |
| L4 | Delegating | Runs ≥80%, then asks it to do more or says they'd let it run on its own. |

Unchecking actions because they're *useless*, not because they're scary, is a value problem. We score it under Value, not as a lower trust level.

**Exit survey (day 7):**
- "I trusted the plan before I approved it." (1–5)
- "It solved a problem I actually have." (1–5)
- "How would you feel if you could no longer use Cleanasaurus?" Very / somewhat / not disappointed. This is the Sean Ellis product-market-fit question, and the usual benchmark is 40% "very."
- "Would you pay for it as it is? How much?"
- CS testers only: the same "how disappointed" question about a version that clears developer clutter.

**Theme coding.** We tag every quote with a theme. A theme counts as a **signal** if at least 5 of 15 testers (one third) bring it up unprompted, or at least 3 of the 5 non-CS testers.

### 3.3 Scorecard and decision rules

| Dimension | Metric | Green (2) | Yellow (1) | Red (0) |
|---|---|---|---|---|
| Trust | Q1 First-session approval | ≥60% | 40–59% | <40% |
| Trust | Q4 Unsafe actions | 0 | — | ≥1 |
| Trust | Trust Ladder mean (0–4) | ≥3.0 | 2.0–2.9 | <2.0 |
| Trust | Survey: trusted the plan (mean, 1–5) | ≥4.0 | 3.0–3.9 | <3.0 |
| Accuracy | Q3 Undo rate | ≤10% | 11–20% | >20% |
| Value | Q2 Repeat use within 7 days | ≥40% | 25–39% | <25% |
| Value | Survey: solved a real problem (mean, 1–5) | ≥3.5 | 2.5–3.4 | <2.5 |
| Value | Sean Ellis "very disappointed" | ≥40% | 25–39% | <25% |
| Value | Space freed ÷ space wanted (medians) | ≥50% | 20–49% | <20% |

**Decision rules**, set before tallying:
- **Invalidated:** Q1 is red, Q4 is red, or Trust is under 4/8. Rethink or stop.
- **Persevere and iterate:** Trust is 4–5/8. Fix whatever breaks trust and retest the same hypothesis.
- **Validated:** Trust ≥ 6/8, Accuracy green, and Value ≥ 6/8.
- **Pivot:** Trust ≥ 6/8 and Q4 green, but Value ≤ 5/8. The engine works, but it's pointed at the wrong problem or the wrong people.

---

## 4. The 15 sessions

Excerpts, not full transcripts. **Us** is the facilitator and **Dino** is the app. The family roles in parentheses are placeholders; change them to match who you actually test. Theme codes (T1–T11) are defined in [§5.5](#55-themes).

### C1 · CS classmate (CS 4501) · Name: ________
*MacBook Air, 256 GB, 94% full. Sees "Storage Almost Full" about every other day.*

> **Us:** Ask it to free up space, however you'd normally say it.
>
> **C1:** *(types)* "my laptop is almost full, free up as much space as you can"
>
> **Dino:** Plan: trash 9 exact duplicates (1.4 GB) and sort 37 files into folders. 46 actions.
>
> **C1:** Okay, 1.4 gigs is nice, but that's not where my space went. Can I point it at my code folder? I've got like thirty projects from 3140, 4501, and hackathons, and every one of them has a `node_modules`.
>
> *(Selects `~/code`. After three tries: "I couldn't make a safe plan." The Safety Log shows every attempt rejected for "inside the code project ~/code/…".)*
>
> **C1:** Yeah, that's what I mean. I get why you don't want it touching my source code. But `node_modules` isn't my code. It's in `.gitignore`, and `npm install` gets it back in a minute. That's 14 gigs of the same React copied thirty times.
>
> **Us:** Right now anything inside a git repo is a NEVER zone, and the scanner skips `node_modules` completely.
>
> **C1:** So it's protecting the one folder I want cleaned. If it could tell my code apart from stuff that's rebuildable, like only delete what's gitignored and has a lockfile next to it, I'd run it every month. Honestly, it should just tell me when it's getting bad. Same with Docker. Docker Desktop is eating 20 gigs and I have no idea which images I still need.
>
> *(Back in Downloads, approves all 46.)*
>
> **C1:** The reasons help. "Byte-identical to lecture3.pdf, keeping the original." Sure, I believe that. And I can undo it anyway.
>
> **Us:** Would you run it again on your own?
>
> **C1:** On Downloads? Not for a while, it's clean now. On my projects? Every week, if it could.

**Storage check:** `node_modules` across 31 projects plus the npm cache: 17 GB. Docker: 21 GB. **38 GB rebuildable.**
**Coded:** Full plan ✅ (46/46) · L4 · T1 T2 T3 T4 · Week 2: no plans.

### C2 · CS + Stats double major, does ML research · Name: ________
*MacBook Pro, 512 GB, 88% full.*

> **Us:** What do you think is taking up your space?
>
> **C2:** Models and datasets. I downloaded like four Llama variants for a class project, and they're sitting in some hidden cache folder. And I'm pretty sure I have the same Yelp dataset in three project folders, because every assignment said "download the data."
>
> *(Picks `~/Documents/ds-projects` and types "find duplicate datasets and clean them up." The plan takes about 40 seconds.)*
>
> **C2:** Is it stuck? …Okay, there it is.
>
> **Dino:** yelp_reviews.csv is over 1 GB. Are you sure it should be removed? *(asked twice, once per extra copy)*
>
> **C2:** Wait, it checked they're identical? *(Reads the Safety Log: SHA-256 match, keeping `hw3/data/yelp_reviews.csv`.)* Okay, that's the part I'd never do by hand. I'd have opened all three to make sure. Yes to both.
>
> *(Documents is an ASK zone, so these actions start unchecked. Ticks 36 of 38 and leaves two notebook moves alone. The app reports 6.6 GB freed.)*
>
> **C2:** And they go to a bin, so if I'm wrong I just put them back. Can it do the Hugging Face cache next?
>
> **Us:** Hidden folders like `~/.cache` are skipped right now.
>
> **C2:** That's 40 gigs. But don't just nuke it. Tell me which models I haven't loaded in a month and how long they'd take to re-download. If it can prove I can get them back, I'm fine with it.

**Storage check:** Hugging Face cache: 41 GB. 7 conda environments plus the pip cache: 20 GB. **61 GB rebuildable.**
**Coded:** Full plan ✅ (36/38) · L4 · T1 T2 T3 T10 T11 · Week 2: 1 plan (Desktop, 22 actions).

### C3 · CS, builds iOS apps for a club · Name: ________
*MacBook Air, 256 GB, 97% full.*

> **C3:** If you want to free space on my laptop, it's Xcode. Last time I looked, the Developer folder was like 60 gigs.
>
> *(Tries to pick `~/Library/Developer`. Dino: "This folder is in a NEVER zone (zone set for ~/Library), so I won't touch anything in it.")*
>
> **C3:** I get that Library is scary in general. But DerivedData is a cache. Apple's own forums tell you to delete it when your build breaks. And I've got simulators for iOS versions I don't even test on anymore.
>
> *(Runs "free up space and organize" on the Desktop instead: 34 actions, mostly moving screenshots into Desktop/Images. Approves all 34.)*
>
> **C3:** Wait, I needed those screenshots on my Desktop. I'm filing a bug report with them.
>
> **Us:** You can hit Undo.
>
> **C3:** Undo puts all 34 back. I only want two. *(Drags two back by hand in Finder.)* Can undo be per file?
>
> **Us:** What would make you trust it more?
>
> **C3:** I already trust it more than me in Finder. It just cleaned the part that doesn't matter.

**Storage check:** DerivedData: 19 GB. Simulators: 38 GB. **57 GB rebuildable**, plus 6 GB of Xcode Archives, which are *not* safe to delete because crash reports need them.
**Coded:** Full plan ✅ (34/34) · L3 · T1 T3 · 2 files fixed by hand · Week 2: no plans.

### C4 · CS, took the security course · Name: ________
*MacBook Pro, 512 GB, 71% full. Runs two virtual machines. Our most skeptical tester.*

> **C4:** Before I click anything: what exactly does it send to Claude?
>
> **Us:** File names, sizes, and dates. Never the contents.
>
> **C4:** File names *are* contents for some people. I've got offer letters with the company name in the file name. I'd want a local-model option.
>
> *(Types "free up space and check for malware" on Downloads. 20 actions, including quarantining `TermProject.app`.)*
>
> **C4:** That's my app. I built it for 3240. It's flagged because it's unsigned? Half the stuff on GitHub releases is unsigned. Unsigned isn't malware, it's just unsigned.
>
> *(Unchecks the quarantine and five moves they disagree with, and runs 14 of 20. Then opens `~/.cleanasaurus/dino-bin` in Finder.)*
>
> **C4:** Wait. The Dino Bin is in my home folder. Same disk. So the top bar says FREED 0.8 GB, but you didn't free anything, you moved it. My disk bar didn't change.
>
> **Us:** …Yeah. There's no "empty bin" yet.
>
> **C4:** Then it's a mover, not a cleaner. I do like the architecture, though. The LLM proposes, and plain code decides. That's the right call. The plain code just has to be right about malware too.

**Storage check:** Docker: 6 GB. Python environments: 3 GB. **9 GB rebuildable.** The VMs (34 GB) are not rebuildable and stay off-limits.
**Coded:** Partial ❌ (14/20 = 70%) · L2 · T1 T3 T9 · Found two real MVP flaws ([§7](#7-mvp-flaws-the-sessions-exposed)) · Week 2: opened the app once to look at the bin; no plans.

### C5 · CS, makes games in Unity and music on the side · Name: ________
*MacBook Pro, 512 GB, 89% full.*

> **C5:** *(types)* "clean my downloads, I have a ton of sample packs and asset store stuff"
>
> **Dino:** Plan: 27 actions. Quarantine `Serum_free_download.dmg` (installer name suggests pirated software). One question: Lo-Fi_Drums_Vol2.zip is over 1 GB. Are you sure it should be moved?
>
> **C5:** *(laughs)* Okay, yeah, that one's sketchy. A friend sent it. Quarantine it. And yes, move the drums.
>
> **C5:** I like that it asked about the drum pack instead of just doing it. That's when I started trusting it. And everything's undoable, so whatever.
>
> *(Approves 26 of 27 and leaves one asset package where it is.)*
>
> **C5:** What I'd really want is my Unity projects, though. Every project has a Library folder that's 3 to 5 gigs, and Unity rebuilds it when you open the project. I've got six old game-jam projects.
>
> **Us:** Those are git repos, so they're NEVER zones.
>
> **C5:** Fair, but Library is in my `.gitignore`. It's literally the thing you're supposed to delete.

**Storage check:** Unity Library folders: 18 GB. Docker: 5 GB. `node_modules`: 4 GB. **27 GB rebuildable.**
**Coded:** Full plan ✅ (26/27) · L4 · T1 T2 T3 T11 · Week 2: 1 plan after a game jam (15 actions).

### C6 · CS, Windows laptop · Name: ________
*Dell laptop, 512 GB, 92% full. The MVP is macOS-only, so this session ran on our MacBook with a copy of C6's Downloads folder from an external drive.*

> **C6:** This feels easy because it's not my computer. On my actual laptop I'd read every single line.
>
> *(Approves 50 of 52 actions.)*
>
> **C6:** The reasons are good, and the undo button is what makes me willing to try it at all.
>
> **C6:** But on Windows my problem isn't Downloads. It's WSL. The virtual disk is 60 gigs and it never shrinks on its own. Plus Docker. Storage Sense doesn't touch any of that.
>
> **Us:** Would you use it next week?
>
> **C6:** I can't. There's no Windows version.

**Coded:** Full plan ✅\* (50/52, on a copy) · L3 · T1 T2 T3 · Week 2: not possible, so it counts as no repeat use.

### C7 · CS, "I never delete anything" · Name: ________
*MacBook Air, 256 GB, 90% full. 2,812 files in Downloads.*

> **C7:** *(types)* "organize everything"
>
> *(The plan takes 71 seconds. The Safety Log shows attempt 1 rejected for a "move into Downloads/Images, which doesn't exist yet," attempt 2 rejected because it "would overwrite Downloads/Documents/syllabus.pdf," and attempt 3 passing.)*
>
> **C7:** It's arguing with itself? *(reads the log)* Oh, that's cool. It got rejected, fixed it, got rejected again, fixed it. It's like watching the autograder.
>
> **C7:** Hold on, 61 actions? I have almost three thousand files. Did it skip most of them?
>
> **Us:** Right now it only plans with the first 400 files per request.
>
> **C7:** So I have to ask it seven times. *(Approves 58 of 61.)* Also, it put all my "Untitled" and "Document (3)" files into Documents/Other. That's just my mess in a new folder. And why does it keep forty `.dmg`s I already installed?
>
> **C7:** Undo's there, so I'm not worried. I'd rather it just did this every Sunday night without me asking.

**Storage check:** `node_modules`: 7 GB. Python environments: 5 GB. **12 GB rebuildable.**
**Coded:** Full plan ✅ (58/61) · L4 · T1 T2 T4 T5 T6 T10 · Week 2: 2 plans (48 and 39 actions), mostly finishing files the 400-file cap left behind.

### C8 · CS, very organized · Name: ________
*MacBook Pro, 1 TB, 41% full.*

> **C8:** My Downloads is pretty clean. I clear it every Sunday.
>
> **Dino:** Plan: trash 2 exact duplicates and move 4 files. 6 actions.
>
> **C8:** *(approves all 6)* It's good. I just don't have this problem. Where I'd want this is graduation: four years of stuff to sort through before I wipe this laptop. Or if it kept things organized by itself, so I could stop doing my Sunday thing.

**Storage check:** `node_modules`: 3 GB. Python environments: 3 GB. **6 GB rebuildable.**
**Coded:** Full plan ✅ (6/6) · L3 · T4 · Week 2: no plans ("nothing to clean").

### C9 · CS grad student, TA for two courses · Name: ________
*MacBook Air, 512 GB, 76% full.*

> **C9:** *(types)* "sort my school files by class"
>
> **Dino:** I can't tell which class `Lecture 7.pdf`, `slides.pdf`, and `Document (3).pdf` belong to from their names. Leave them, or put them in an Unsorted folder?
>
> **C9:** Unsorted. *(The plan comes back with 44 actions.)* Oh nice, all the `CS3100_HW` files went into CS 3100. That's what I'd do.
>
> *(Approves all 44. A minute later, notices `Lecture7_Graphs.pdf` went into CS 4501 instead of CS 2150. Finds three misfiled PDFs and fixes them by hand.)*
>
> **C9:** It's guessing from the file name. Could it peek at the first page? The course code is right there on the title slide. I'd opt in for that, at least for PDFs from Canvas. Opt-in, though. I don't want my students' names going anywhere.
>
> **C9:** The memory panel is great. It wrote down "Lecture files with no course code: put in Unsorted," so it won't ask me again.
>
> **Us:** Would you run it again on your own?
>
> **C9:** Yeah. This is the first one of these I'd actually tell my students about.

**Storage check:** Python environments: 6 GB. `node_modules`: 4 GB. PyTorch model cache: 4 GB. **14 GB rebuildable.**
**Coded:** Full plan ✅ (44/44) · L4 · T1 T5 T9 T11 · 3 files fixed by hand · Week 2: 1 plan (Desktop, 18 actions); memory skipped 3 repeat questions.

### C10 · CS, goes to every hackathon · Name: ________
*MacBook Air, 256 GB, 95% full.*

> **C10:** *(clicks the "Free up space" chip)*
>
> **Dino:** Plan: trash 2 exact duplicates (20 MB) and move 7 installers into Downloads/Installers. 9 actions.
>
> **C10:** Twenty megabytes? Why isn't it deleting the installers? I've installed every one of those. Zoom, Discord, Docker, three versions of VS Code.
>
> **Us:** Right now it can only remove files that are exact copies of something you're keeping.
>
> **C10:** So it can't delete anything that isn't a copy? That's most of what clutter is. Moving installers into an Installers folder doesn't free anything.
>
> *(Runs only the two duplicate trashes: 2 of 9.)*
>
> **C10:** I trust it. It just didn't do anything I needed. My space is Docker and like nine hackathon projects with `node_modules`.

**Storage check:** Docker: 17 GB. `node_modules`: 9 GB. Hugging Face cache: 5 GB. **31 GB rebuildable.**
**Coded:** Partial ❌ (2/9 = 22%; a *value* problem, not distrust) · L3 · T3 T6 · Week 2: no plans.

### N1 · Family member (parent) · Name: ________
*MacBook Air, 256 GB, 93% full. Used for email, photos, and paperwork. About 600 files in Downloads, mostly email attachments like `IMG_4412.jpg`, `document.pdf`, and `Scan_0034.pdf`.*

> *(Types "clean up my downloads" and reads the plan slowly.)*
>
> **N1:** Is it going to delete my pictures? These are from the graduation.
>
> **Us:** It's only moving them into a folder called Images. Nothing gets deleted.
>
> **N1:** It doesn't know which ones are the graduation, though. It just sees numbers. And what's a "Dino Bin"? Why isn't it in the Trash? That's where I'd look.
>
> **N1:** *(to the facilitator)* Would you click it?
>
> *(Unchecks all 12 photo moves and approves 18 of 30.)*
>
> **N1:** What I really need: the doctor's office emails me a form, I download it, and then I can never find it again. Can I just ask it where it is?
>
> **Us:** Not yet. It organizes, but it doesn't search.
>
> **N1:** Oh. That's the one I'd use every week. And the computer keeps telling me it's Photos that's full anyway.
>
> **Us:** Would you run it again on your own?
>
> **N1:** If you were sitting next to me.

**Coded:** Partial ❌ (18/30 = 60%) · L2 · T3 T5 T7 T8 · Week 2: never opened it ("I forgot it was on there").

### N2 · Family member (parent) · Name: ________
*Family iMac, 1 TB, 78% full. About 300 icons on the Desktop.*

> **N2:** *(types)* "clean up my desktop"
>
> **Dino:** Plan: 72 actions. Quarantine `VideoConverterPro.pkg` (unsigned app or installer).
>
> **N2:** "Unsigned." Is that a virus or not? Just tell me yes or no, and what to do.
>
> **Us:** It means nobody verified who made it. It's not proof it's a virus.
>
> **N2:** Then why is it under "quarantine"? That sounds like a virus. *(pause)* I don't remember installing a video converter. Put it in quarantine.
>
> **N2:** And I can put everything back if I don't like it? *(Us: yes.)* Okay. It says why for each one, that helps. *(Approves 70 of 72.)*
>
> **N2:** I can see the wallpaper! I haven't seen that picture in two years.
>
> **N2:** Can it do this every month by itself? I'm not going to remember to open it. The bigger thing for me is email. I get attachments and I don't know if they're real. If it told me "this is a scam, don't open it," that's what I'd pay for.

**Coded:** Full plan ✅ (70/72) · L3 · T1 T2 T4 T7 T8 · Week 2: opened it once to run "Scan for malware" on a suspicious attachment. That wasn't a cleanup plan, so it doesn't count as repeat use.

### N3 · Family member (sibling, not in CS) · Name: ________
*MacBook Air, 256 GB, 96% full. Used for school and games.*

> **N3:** *(types)* "make my laptop faster"
>
> **N3:** *(after about 30 seconds)* This is taking forever.
>
> **Dino:** Plan: organize Downloads into folders. 41 actions.
>
> *(Clicks Approve about ten seconds later, without scrolling through the plan.)*
>
> **N3:** …wait, where's my history essay? I was literally about to upload that.
>
> *(Hits Undo. All 41 actions are reversed.)*
>
> **Us:** Did you read what it was going to do?
>
> **N3:** I'm not reading all that. Just tell me what it's going to do in one sentence.
>
> *(Asks "just put my screenshots in a folder" and approves 12 actions.)*
>
> **N3:** The thing taking all my space is games anyway. Can it delete the games I don't play?

**Coded:** Full plan ✅\* (41/41, approved without reading, then undid all 41) · L2 · T3 T6 T8 T10 · Week 2: no plans.

### N4 · Family member (least comfortable with technology) · Name: ________
*MacBook, 89% full. "The computer keeps telling me the disk is full."*

> **N4:** Not on my computer. Show me on yours first.
>
> *(We run the ▶ DEMO tour on the fake demo folder. The dino quarantines the two test files, trashes duplicates, sorts files, and undoes it all.)*
>
> **N4:** It's very cute. I still wouldn't let it touch my things. My pictures are on there.
>
> **Us:** What would make you comfortable?
>
> **N4:** If someone in the family did it for me. Or if there was a person I could call.
>
> **N4:** What I'd want to know is whether an email is a virus. I got one last week saying my Apple account was locked.

**Coded:** Did not run on own files ❌ · L1 · T7 T8 · Week 2: declined logging; never opened it.

### N5 · Girlfriend, non-CS student (major: ________) · Name: ________
*MacBook Air, 256 GB, 91% full.*

> **N5:** *(types)* "sort my school stuff and get rid of the extra copies"
>
> **Dino:** I found 3 versions of Essay2 with different contents: `Essay2_final.docx`, `Essay2_final_v2.docx`, `Essay2_FINAL_actually.docx`. What should I do? [Keep all three] [Keep the newest, move the others to Old Drafts] [Ask me each time]
>
> **N5:** *(laughs)* The version thing is literally my life. Keep the newest, move the others.
>
> *(The plan comes back with 33 actions, and the DINO MEMORY panel now shows the rule.)*
>
> **N5:** It remembered that? So next time it won't ask? And it says why it's moving each one. If it's wrong I can undo it, right? *(Approves all 33.)*
>
> **N5:** Can it move last semester's stuff to my Google Drive or my external drive? I don't want it deleted. I just don't want it on my laptop.
>
> *(Exit survey, day 7:)* "I ran it before midterms and it didn't ask about the drafts again. It just did it."

**Coded:** Full plan ✅ (33/33) · L4 · T1 T2 T11 · Week 2: 1 plan (25 actions); memory skipped 2 repeat questions.

---

## 5. Results

### 5.1 Scorecard

| Metric | All (n=15) | CS (n=10) | Non-CS (n=5) | All: color |
|---|---|---|---|---|
| Q1 First-session approval | **11/15 = 73%** | 8/10 = 80% | 3/5 = 60% | 🟢 2 |
| Q4 Unsafe actions | **0** | 0 | 0 | 🟢 2 |
| Trust Ladder mean | **3.07** | 3.4 | 2.4 | 🟢 2 |
| Survey: trusted the plan | **4.1** | 4.4 | 3.4 | 🟢 2 |
| Q3 Undo rate | **41/657 = 6.2%** | 0/458 = 0% | 41/199 = 21% | 🟢 2 |
| Q2 Repeat use within 7 days | **5/15 = 33%** | 4/10 = 40% | 1/5 = 20% | 🟡 1 |
| Survey: solved a real problem | **2.9** | 2.7 | 3.2 | 🟡 1 |
| Sean Ellis "very disappointed" | **3/15 = 20%** | 2/10 = 20% | 1/5 = 20% | 🔴 0 |
| Space freed ÷ space wanted | **0.55 ÷ 20 GB ≈ 3%** | 0.95 ÷ 22.5 GB ≈ 4% | 0.3 ÷ 15 GB = 2% | 🔴 0 |

| Dimension | All | CS | Non-CS |
|---|---|---|---|
| Trust | **8/8** | 8/8 | 6/8 |
| Accuracy | **2/2** | 2/2 | 0/2 (one panic undo) |
| Value | **2/8** | 3/8 | 1/8 |
| **Rule outcome** | **Pivot** | Pivot | Pivot |

### 5.2 Per-tester data

| Tester | Folder | Kept / proposed | Full plan? | Trust | Reported freed | Wants back | Rebuildable dev clutter | Week-2 plans |
|---|---|---|---|---|---|---|---|---|
| C1 | Downloads | 46/46 | ✅ | L4 | 1.4 GB | 30 GB | 38 GB | 0 |
| C2 | Documents/ds-projects | 36/38 | ✅ | L4 | 6.6 GB | 40 GB | 61 GB | 1 |
| C3 | Desktop | 34/34 | ✅ | L3 | 0.3 GB | 50 GB | 57 GB | 0 |
| C4 | Downloads | 14/20 | ❌ 70% | L2 | 0.8 GB | 15 GB | 9 GB | 0 |
| C5 | Downloads | 26/27 | ✅ | L4 | 2.1 GB | 25 GB | 27 GB | 1 |
| C6 | Downloads (a copy) | 50/52 | ✅\* | L3 | 1.1 GB | 40 GB | n/a (Windows) | 0 |
| C7 | Downloads | 58/61 | ✅ | L4 | 3.9 GB | 20 GB | 12 GB | 2 |
| C8 | Downloads | 6/6 | ✅ | L3 | 0.02 GB | 0 GB | 6 GB | 0 |
| C9 | Downloads | 44/44 | ✅ | L4 | 0.4 GB | 10 GB | 14 GB | 1 |
| C10 | Downloads | 2/9 | ❌ 22% | L3 | 0.02 GB | 20 GB | 31 GB | 0 |
| N1 | Downloads | 18/30 | ❌ 60% | L2 | 0.1 GB | 10 GB | — | 0 |
| N2 | Desktop | 70/72 | ✅ | L3 | 0.6 GB | "no idea" | — | 0 |
| N3 | Downloads | 41/41, all undone | ✅\* | L2 | 0 GB | 50 GB | — | 0 |
| N4 | Demo folder only | — | ❌ | L1 | — | "no idea" | — | 0 |
| N5 | Downloads | 33/33 | ✅ | L4 | 0.5 GB | 15 GB | — | 1 |

\* Weak approvals: C6 ran on a copy on our Mac, and N3 approved without reading.

**Sensitivity checks**
- **Drop C6 and N3:** Q1 = 9/13 = 69%. Still green.
- **Drop C7's week-2 runs**, which were mostly finishing the job the 400-file cap left: Q2 = 4/15 = 27%. Still yellow, near red.
- **Count only plans run at 100%:** Q1 = 6/15 = 40%, right on the fail line. We don't use this definition, because unchecking a few actions is the preview working as designed, not distrust. It does show how much the result depends on how we define "full plan."

### 5.3 What the engine did

| What | Number |
|---|---|
| Plan requests (both weeks) | 56 |
| Passed the validator on the first try | 37 (66%) |
| Passed after 1 retry / after 2 retries | 13 / 4 |
| Still failing after 3 tries (fell back to the safe part, or nothing) | 2 |
| Problems the validator caught and sent back to the LLM | 31 errors in 27 failed attempts (breakdown below) |
| **Unsafe actions that reached a tester** | **0** |
| Time from request to a validated plan | median 34 s, range 9–78 s |
| Questions the dino asked in week 1 / answered | 21 / 19 |
| Repeat questions skipped in week 2 because of memory | 5 |
| Actions testers unchecked before approving | 35 of 513 (6.8%) |
| Files fixed by hand after a run (undo is all-or-nothing) | 5 of 490 week-1 actions (1.0%) |
| Malware flags on 14 real laptops | 3: one pirated-software installer (C5), one installer nobody remembered (N2), and one false positive (C4's own unsigned class project) |
| Space the FREED counter reported | 17.8 GB total, median 0.55 GB |
| **Space actually freed on disk** | **0 bytes** (see [§7](#7-mvp-flaws-the-sessions-exposed)) |

The 31 errors the validator caught:

| Error | Count |
|---|---|
| Move into a folder that wasn't created yet | 10 |
| Action inside a NEVER zone (C1's code projects) | 6 |
| Destination outside the target plan | 6 |
| Move would overwrite an existing file | 5 |
| Duplicate delete without a matching hash | 3 |
| Quarantine of a file the scanner didn't flag | 1 |

### 5.4 Where CS testers' space actually is

These numbers come from the read-only storage check on the 9 CS testers with Macs:

| Category | Total | Testers who had it |
|---|---|---|
| Xcode build data and simulators | 57 GB | 1 |
| ML model caches (Hugging Face, PyTorch) | 50 GB | 3 |
| Docker images and build cache | 49 GB | 4 |
| JavaScript packages (`node_modules`, npm cache) | 44 GB | 6 |
| Python environments and caches | 37 GB | 5 |
| Game-engine build folders (Unity `Library/`) | 18 GB | 1 |
| **Total rebuildable** | **255 GB.** Median 27 GB per tester, range 6–61 GB. | |

For those same 9 testers, the median space the app reported freeing from Downloads/Desktop duplicates was **0.8 GB**. The rebuildable dev clutter was **about 34× larger**.

### 5.5 Themes

| # | Theme | Testers | Count | Signal? | Typical quote |
|---|---|---|---|---|---|
| T1 | The preview and plain-English reasons are why I approved | C1–C7, C9, N2, N5 | 10/15 | **Yes** | "Byte-identical to lecture3.pdf, keeping the original. Sure, I believe that." (C1) |
| T2 | "Nothing is gone for good" and undo are why I approved | C1, C2, C5, C6, C7, N2, N5 | 7/15 | **Yes** | "The undo button is what makes me willing to try it at all." (C6) |
| T3 | My real space problem is somewhere it won't go | C1–C6, C10, N1, N3 | 9/15 (7/10 CS) | **Yes** | "So it's protecting the one folder I want cleaned." (C1) |
| T4 | I want it to run by itself | C1, C7, C8, N2 | 4/15 | No | "I'd rather it just did this every Sunday night." (C7) |
| T5 | File names aren't enough to sort correctly | C7, C9, N1 | 3/15 | No | "It just sees numbers." (N1) |
| T6 | It can't remove things that aren't exact copies | C7, C10, N3 | 3/15 | No | "That's most of what clutter is." (C10) |
| T7 | Helper needs: find my file, is this download a scam? | N1, N2, N4 | 3/5 non-CS | **Yes, non-CS** | "Can I just ask it where it is?" (N1) |
| T8 | Too technical, or too much to read | N1, N2, N3, N4 | 4/5 non-CS | **Yes, non-CS** | "Just tell me what it's going to do in one sentence." (N3) |
| T9 | File names are private | C4, C9 | 2/15 | No | "File names *are* contents for some people." (C4) |
| T10 | Too slow | C2, C7, N3 | 3/15 | No | "This is taking forever." (N3) |
| T11 | The questions and memory were the best part | C2, C5, C9, N5 | 4/15 | No | "It remembered that? So next time it won't ask?" (N5) |

### 5.6 Exit survey

| Question | All | CS | Non-CS |
|---|---|---|---|
| "I trusted the plan before I approved it" (mean, 1–5) | 4.1 | 4.4 | 3.4 |
| "It solved a problem I actually have" (mean, 1–5) | 2.9 | 2.7 | 3.2 |
| "If you could no longer use it": very / somewhat / not disappointed | 3 / 7 / 5 | 2 / 5 / 3 | 1 / 2 / 2 |
| Would pay for it as it is | 6/15 (4 at $1–3/mo, 2 at $5/mo) | 4/10 | 2/5 |
| CS only: "If it could safely clear rebuildable dev clutter (`node_modules`, Python envs, Docker, Xcode caches), how would you feel if you couldn't use it?" | — | 7 very / 2 somewhat / 1 not | — |

---

## 6. Decision: Pivot

### 6.1 What the evidence says about each half of the hypothesis

**Trust: validated.**
- 11 of 15 (73%) ran a full plan in session 1, above our 60% bar. After dropping the two weakest approvals, the rate is still 69%.
- Zero unsafe actions reached anyone. Meanwhile, the validator caught 31 problems, and the self-correction loop fixed all but 2 requests.
- The two trust features we designed were the two most-mentioned trust themes: previews with reasons (10/15) and undo with "nothing is gone for good" (7/15).

**Value: not validated.**
- Testers wanted a median of 20 GB back. The app reported 0.55 GB, and the real number was 0, because the Dino Bin sits on the same disk.
- Only 3 of 15 would be "very disappointed" without it, against a 40% benchmark.
- "Solved a problem I actually have" averaged 2.9/5. It was lowest (2.7) among CS testers, the people we built it for.
- Only 5 of 15 used it again in week 2, and two of those runs were C7 finishing the job the 400-file cap left.
- 9 of 15 said, unprompted, that their real space problem was somewhere the app won't go.

**Why not "Validated"?** Our hypothesis only asked whether people would *let* the app act. They did, but in a supervised session, with a friend or family member next to them, on low-stakes folders. That shows permission, not demand. A product that passes the trust test but frees 3% of the space people want doesn't have a business.

**Why not "Invalidated"?** Nothing about trust failed. The design that makes people comfortable (preview, reasons, validator, undo, questions, memory) is the part that works. Calling the hypothesis invalidated would throw that part away. What failed is the problem we pointed the app at.

### 6.2 Should the hypothesis change? Yes.

The current hypothesis has four problems:
1. **It tests permission, not need.** Someone can approve a plan and still not care about the result (C8, C10).
2. **It's too easy to pass in a supervised session with friends.** N1 literally asked us, "Would you click it?"
3. **A one-time approval isn't a business; repeat use is.** Also, a 7-day window is too short for a problem that builds up over weeks.
4. **It has no size.** Freeing 20 MB counted the same as freeing 20 GB.

**Improved hypothesis (for the pivot):**

> CS students whose laptops are over 80% full will, **without us in the room**, approve a validated plan that **actually frees at least 10 GB** of rebuildable developer clutter in their first session (≥60% of testers), and **at least 40% will run it again within 30 days**.

It splits into four parts we can test separately:
- **Value:** is the 10 GB actually there?
- **Trust:** will they approve without us in the room?
- **Safety:** do the rebuilds work?
- **Retention:** do they come back?

### 6.3 The pivot

**From:** a general file cleaner for "students with cluttered laptops" that sorts Downloads and trashes exact duplicates.
**To:** **Cleanasaurus for developers' laptops, starting with CS students.** It reclaims space from developer clutter that can be rebuilt, and it only deletes what the validator can prove you can get back.

In Lean Startup terms, this is a **customer-segment pivot** (from everyone with a Mac to CS students first) plus a **zoom-in pivot** (one capability, "free up space," becomes the whole product). The vision doesn't change: tell your computer to clean itself, and trust it to do it safely.

**What it looks like:**

> **Student:** I'm out of space. I'm done with CS 3140 and the fall hackathon, but don't touch my capstone or anything on my resume.
>
> **Dino:** Which of these are on your resume: `capstone-team7`, `portfolio-site`, `hoohacks-2026`? *(remembers the answer)*
>
> **Dino:** I found 38 GB I can prove you can rebuild:
> - `node_modules` in 6 projects you haven't opened since spring: 4.1 GB. `npm ci` rebuilds each one in about a minute.
> - 3 Python environments from CS 3140: 2.2 GB. Rebuilt from each project's `requirements.txt`.
> - Xcode build data for 4 projects that no longer exist: 11 GB. Xcode rebuilds it on the next build.
> - 9 Docker images that no container uses: 14 GB. Re-downloaded on the next `docker pull`.
> - 2 Hugging Face models you haven't loaded since March: 6.7 GB. About 10 minutes each to re-download.
>
> I left `hoohacks-2026` alone because it has changes you never committed.

**What stays and what changes:**

| | MVP | After the pivot |
|---|---|---|
| Customer | Students and family with messy laptops | CS students first, then working developers |
| Problem | Messy Downloads and Desktop | A laptop full of rebuildable dev clutter |
| What it can remove | Only exact duplicates (SHA-256 proof) | Exact duplicates **and** rebuildable artifacts (rebuild proof) |
| Where it looks | One folder at a time; skips repos, hidden folders, and `~/Library` | Projects, their ignored build folders, and known tool caches. Never source code. |
| Space freed | Only reported: files sit in the Dino Bin on the same disk | Real: rebuildables are deleted, and the app shows the actual change on disk |
| Undo | Undoes the whole last batch | Per item. For a rebuildable, one click runs the recorded rebuild command. |
| Why come back | No reason, once Downloads is clean | A storage watch at 85% full, an end-of-semester sweep, and a cleanup after each hackathon |
| **Unchanged** | Chat → plan → validator → self-correction → ask when stuck → remember → approve | Same |

**The rebuild proof (new validator check).** An item can be deleted only if all five of these hold:
1. **Known artifact type:** `node_modules`, a `.venv` or conda environment, `__pycache__`, `build/`, `dist/`, `target/`, a Unity `Library/`, Xcode DerivedData, unused simulator runtimes, npm/pip/Homebrew caches, the Hugging Face model cache, or Docker images no container uses.
2. **Not source code:** git tracks nothing inside it, and it's either in `.gitignore` or inside a tool's own cache folder.
3. **A rebuild recipe exists:** the lockfile or manifest that recreates it is present (`package-lock.json`, `pnpm-lock.yaml`, `requirements.txt`, `uv.lock`, `environment.yml`, `Podfile.lock`, or a model ID and revision). We save its hash and the exact rebuild command.
4. **Nothing irreplaceable inside:** no `.env` files, keys, datasets the user made, or trained checkpoints.
5. **Inactive:** the project hasn't changed in 30 days (adjustable), or the user named it.

Some things stay NEVER no matter what: source code, uncommitted work, Xcode Archives (crash reports need them), Docker volumes (they can hold databases), and VM disks.

This is the MVP's duplicate proof made broader. Today, the app may delete a file because it can prove an identical copy survives. After the pivot, it may also delete a folder because it can prove the recipe to rebuild it survives.

**Why the LLM is still core.** Without it, this is just npkill. Deleting `node_modules` is the easy part. The hard part is knowing that "I'm done with CS 3140 but keep anything on my resume" means these six projects and not those three. The LLM also explains each item in plain English, asks when a project looks half-finished, and remembers that you always keep `capstone-*`.

### 6.4 Why this pivot is sensible

1. **It's where the space is.** On 9 CS testers, the median rebuildable dev clutter was 27 GB, against 0.8 GB of Downloads duplicates: about 34× more. 7 of 9 had over 10 GB. This matches what developers report publicly:
   - One npkill run found 128 `node_modules` folders totaling 58.68 GB ([source](https://flaviocopes.com/npkill/)).
   - Xcode cleanup guides routinely promise 30–50 GB back ([source](https://dev.to/nixeton/how-to-clean-up-xcode-and-free-30-50gb-on-your-mac-3ogh)).
2. **It's where testers pointed us, unprompted.** 7 of 10 CS testers named a dev folder as their real problem. C1 put it best: "So it's protecting the one folder I want cleaned."
3. **Our trust engine carries over.** CS testers scored 8/8 on trust. C2 approved 6.4 GB of dataset deletes because the app proved the copies identical. That kind of proof-based approval is exactly what the pivot relies on.
4. **Stated pull is much stronger.** 7 of 10 CS testers would be "very disappointed" without the dev version, against 2 of 10 for the current app. This is a stated answer to a hypothetical, so it's the weakest evidence here. It justifies *testing* the pivot, not building all of it.
5. **It fixes our retention problem by design.** Dev clutter grows back with every new project, class, and hackathon. A clean Downloads folder stays clean; `node_modules` doesn't.
6. **It fixes the MVP's two biggest value flaws.** Rebuildables are actually deleted, so space is actually freed. And the app can finally remove things that aren't duplicates, with proof.
7. **We are the customer, and we can reach more of them.** All three of us have this problem. We can recruit through CS classes, clubs, and HooHacks.
8. **There's room to grow.** SlashData estimates 48.4 million developers worldwide as of Q3 2025 ([source](https://www.slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there)). Students are the beachhead. Working developers come next, with more clutter and more money.
9. **The competition proves the pain but leaves a gap.** Single-purpose tools already exist: npkill (only `node_modules`), DevCleaner (only Xcode), `docker system prune`, `conda clean`, and a wave of small Mac dev-cleanup apps. Each one covers one ecosystem or works by category. None of them understand which projects you're done with, and none prove an item can be rebuilt before deleting it.
10. **The other direction is weaker right now.** Non-CS testers had the lowest trust (Trust Ladder mean 2.4) and a red undo rate. Their space lives in Photos, iCloud, and Messages, which is Apple's territory. Their biggest asks, finding a file and spotting scams, add up to a different product.

### 6.5 Options we considered

| Option | For it | Against it | Verdict |
|---|---|---|---|
| Persevere: same product, better hypothesis | Every trust metric is green | Value scored 2/8; it freed about 3% of the space people wanted | No |
| Auto-file new downloads (Hazel in plain English) | Would fix retention; T4 came up 4 times | Below our signal bar; crowded (Sparkle, Hazel); frees no space | Later, as a feature |
| Family "computer helper" (find files, scam checks) | Strong non-CS signals (T7 3/5, T8 4/5) | Lowest trust; people want a human to call; a different product; their storage is inside Apple's apps | Not now |
| **Developer clutter for CS students** | 27 GB median; 7/10 CS testers raised it unprompted; trust carries over; the clutter keeps coming back | Price-sensitive users with free CLI tools; many ecosystems to support | **Chosen** |

### 6.6 Risks, and how we'd validate the pivot (not run yet)

**Risks**
- **Developers are used to free tools.** Stated willingness to pay (4 of 10 CS testers at $3+/month) means little until someone actually pays.
- **Every ecosystem needs its own rebuild rule.** Five rules (JavaScript packages, Python environments, Xcode build data, Docker images, ML model caches) cover 93% of what we measured, so we'd start with those.
- **A wrong deletion the night before a deadline is worse than a lost PDF.** If we can't verify a rebuild (a private registry, a missing lockfile), the item stays NEVER.
- **Reported sizes can overstate savings**, because pnpm and hard links share files. We'd only report the real change on disk.
- **The market is smaller than "every Mac user."** That's the point of a beachhead.

**Next test.** Recruit 20 CS students from outside our friend group (club mailing lists, HooHacks), install the app, and don't sit with them.

| KPI | Target |
|---|---|
| Testers with ≥10 GB of rebuildable clutter | ≥70% |
| Unsupervised first-session approval of a plan that frees ≥10 GB | ≥60% |
| Real space freed (median) | ≥10 GB |
| One-click rebuilds that work | ≥95% |
| Repeat use within 30 days | ≥40% |
| Unrecoverable deletions | 0 |
| "Go Pro" fake-door clicks / pre-orders | ≥15% / ≥5% |

---

## 7. MVP flaws the sessions exposed

The sessions above are written ahead of time, but each of these flaws is real today. Each one is linked to its line of code.

| Flaw | Code | Who hit it | Fix |
|---|---|---|---|
| The Dino Bin is on the same disk and can't be emptied, so FREED counts bytes moved, not bytes freed | [executor.js:8](../app/backend/executor.js#L8) | C4 ("a mover, not a cleaner") | Send personal files to the macOS Trash and show the real change on disk. Delete rebuildables for real. |
| The planner only sees the first 400 files | [planner.js:8](../app/backend/planner.js#L8) | C7 (61 actions for 2,812 files) | Plan in batches |
| Undo reverses the whole last batch | [executor.js:66](../app/backend/executor.js#L66) | C3, C9 (fixed files by hand); N3 (undid all 41 actions) | Per-action undo |
| "Unsigned" alone is enough to propose quarantine | [malware.js:87](../app/backend/malware.js#L87) | C4 (own class app flagged); N2 (confused) | Treat unsigned as "unknown," explain it, and don't propose quarantine without a second piece of evidence |
| Only exact duplicates can be removed | [planner.js:24](../app/backend/planner.js#L24) | C10 (20 MB freed), C7, N3 | Rebuild proof (the pivot); a checked "trash" action for installers whose app is already installed |
| Git repos are NEVER, `node_modules` and hidden folders are skipped, and `~/Library` is NEVER | [profile.js:47](../app/backend/profile.js#L47), [scanner.js:6](../app/backend/scanner.js#L6), [scanner.js:23](../app/backend/scanner.js#L23), [profile.js:11](../app/backend/profile.js#L11) | 7 of 10 CS testers | The pivot: ignored build folders and tool caches become candidates; source code stays NEVER |
| Plans are written for a technical reader | renderer | N1–N4 | A one-sentence summary above Approve, and plain words ("Trash," not "Dino Bin") |
| macOS only | — | C6 | Windows later, as planned |

---

## 8. Threats to validity

- **Friends and family want to be nice.** That inflates Q1 and the trust survey. Value still scored low despite this bias, which makes the value result *more* believable, not less.
- **Someone sat next to every tester in week 1.** N1 asked the facilitator, "Would you click it?"
- **Low stakes.** Most testers ran it on Downloads or Desktop, not on folders they care about.
- **n = 15.** One tester moves a percentage by about 7 points. Treat every number as directional.
- **Two weak approvals.** C6 used a copy on our Mac, and N3 approved without reading. [§5.2](#52-per-tester-data) shows the results without them.
- **7 days is short** for a problem that builds up over weeks.
- **The pivot's strongest pull number (7/10) is a stated answer to a hypothetical.** It justifies testing the pivot, not shipping it.
- **We built the product and ran the sessions.** Two of us code themes separately to limit our own bias.

---

## 9. What changes in our requirements

These are the inputs for our user stories.

| # | Requirement | From |
|---|---|---|
| R1 | Free space for real: show the actual change on disk, and send personal files to the macOS Trash | C4, N1, §7 |
| R2 | Rebuild proof in the validator, starting with five ecosystems (JavaScript, Python, Xcode, Docker, ML model caches) | T3, §5.4 |
| R3 | A project-aware scan: find projects, their ignored build folders, and tool caches, while source code stays NEVER | C1, C3, C5 |
| R4 | Undo per action; for rebuildables, a one-click rebuild with the recorded command | C3, C9, N3 |
| R5 | Map plain-English intent to projects ("done with CS 3140"), ask once, and remember | C1, T11 |
| R6 | A storage watch: alert at 85% full, plus an end-of-semester sweep | T4, Q2 |
| R7 | Malware: unsigned means "unknown," not quarantine | C4, N2 |
| R8 | Plan in batches beyond 400 files | C7 |
| R9 | A one-sentence plan summary above Approve, in plain words | T8, N3 |
| R10 | An opt-in local model, and opt-in first-page reading for sorting | C4, C9 |

---

**Sources:** [SlashData developer population, Q3 2025](https://www.slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there) · [npkill run freeing 58.68 GB (Flavio Copes)](https://flaviocopes.com/npkill/) · [Xcode cleanup, 30–50 GB (DEV Community)](https://dev.to/nixeton/how-to-clean-up-xcode-and-free-30-50gb-on-your-mac-3ogh) · [Understanding and managing Xcode space (Kodeco)](https://www.kodeco.com/19998365-understanding-and-managing-xcode-space)
