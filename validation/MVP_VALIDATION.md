# Cleanasaurus MVP Validation

**Team:** Nate Kim, Nate Park, Wesley Chang · **Testers:** 15 (10 CS, 5 non-CS) · **Week 1:** ________ · **Week 2:** ________

> **Draft.** The dialogue and numbers below are placeholders, written from how the MVP actually behaves. The product limits testers run into are real. Replace the placeholders with what testers actually say and do before submitting. Tester names are blank on purpose.

**Decision: Pivot.** Testers trusted the app (Trust 8/8), but it didn't solve a problem they cared about (Value 2/8). We keep the engine and aim it at CS students' rebuildable developer clutter.

---

## 1. Running the validation plan

**Core hypothesis:** Students with cluttered laptops will let an AI clean and reorganize their files, as long as every plan is checked and previewed first.

**Target population:** 10 CS-related friends and classmates (C1–C10), plus 5 non-CS testers (N1–N5): four family members and one non-CS student.

**Week 1:** a 20-minute think-aloud on the tester's own laptop, with three tasks: free up space, organize files, and scan for malware. CS testers also ran a read-only size check ([`storage-check.sh`](storage-check.sh)).

**Week 2:** 7 days of unsupervised use with opt-in logs (13 of 15 opted in), then an exit survey.

### Session excerpts

The family roles in parentheses are placeholders. **Us** is the facilitator, and **Dino** is the app.

#### C1 · CS classmate · Name: ________
*MacBook Air, 256 GB, 94% full*

> **C1:** 1.4 gigs is nice, but that's not where my space went. I've got like thirty projects, and every one has a `node_modules`.
>
> *(Points it at `~/code`. Every attempt is rejected: "inside the code project.")*
>
> **C1:** I get why you don't want it touching my source code. But `node_modules` is in `.gitignore`, and `npm install` gets it back in a minute. So it's protecting the one folder I want cleaned. If it could tell my code apart from stuff that's rebuildable, I'd run it every month. Honestly, it should just tell me when it's getting bad.
>
> *(Back in Downloads, approves all 46 actions.)*
>
> **C1:** The reasons help, and I can undo it anyway. But on Downloads I won't need it again for a while. On my projects, I'd use it every week.

#### C2 · CS + Stats, does ML research · Name: ________
*MacBook Pro, 512 GB, 88% full*

> **C2:** It's models and datasets. I've got four Llama variants in some hidden cache folder, and the same Yelp dataset in three project folders.
>
> **Dino:** *(after about 40 seconds, while C2 asks "Is it stuck?")* yelp_reviews.csv is over 1 GB. Are you sure it should be removed?
>
> **C2:** It checked they're identical? Okay, that's the part I'd never do by hand. And they go to a bin, so if I'm wrong I put them back. *(Approves 36 of 38.)*
>
> **C2:** Can it do the Hugging Face cache next? That's 40 gigs. Tell me which models I haven't loaded in a month and how long they'd take to re-download. If it can prove I can get them back, I'm fine with it.

#### C3 · CS, builds iOS apps · Name: ________
*MacBook Air, 256 GB, 97% full*

> **C3:** If you want to free space on my laptop, it's Xcode. *(Tries `~/Library/Developer`, which is a NEVER zone.)* I get that Library is scary in general, but DerivedData is a cache. And I've got simulators for iOS versions I don't even test on anymore.
>
> *(Runs it on the Desktop instead and approves all 34 actions.)*
>
> **C3:** Wait, I needed two of those screenshots on my Desktop. Undo puts all 34 back? *(Drags the two back by hand.)* Can undo be per file?
>
> **C3:** I already trust it more than me in Finder. It just cleaned the part that doesn't matter.

#### C4 · CS, took the security course · Name: ________
*MacBook Pro, 512 GB, 71% full, runs two virtual machines*

> **C4:** What exactly does it send to Claude? *(Us: File names, sizes, and dates.)* File names *are* contents for some people. I'd want a local-model option.
>
> *(The plan proposes quarantining C4's own `TermProject.app`.)*
>
> **C4:** That's my app. Unsigned isn't malware, it's just unsigned.
>
> *(Runs 14 of 20 actions, then finds `~/.cleanasaurus/dino-bin` in Finder.)*
>
> **C4:** The Dino Bin is on the same disk. It says FREED 0.8 GB, but you didn't free anything, you moved it. It's a mover, not a cleaner. I do like the architecture, though: the LLM proposes, and plain code decides.

#### C5 · CS, makes games and music · Name: ________
*MacBook Pro, 512 GB, 89% full*

> **Dino:** Quarantine `Serum_free_download.dmg` (name suggests pirated software). Also, Lo-Fi_Drums_Vol2.zip is over 1 GB. Are you sure it should be moved?
>
> **C5:** *(laughs)* Yeah, that one's sketchy. Quarantine it. I like that it asked about the drum pack instead of just doing it. That's when I started trusting it. And everything's undoable. *(Approves 26 of 27.)*
>
> **C5:** What I'd really want is my Unity projects. Every one has a Library folder that's 3 to 5 gigs, and Unity rebuilds it on open. *(Us: Those are git repos, so they're NEVER zones.)* Fair, but Library is in my `.gitignore`. It's literally the thing you're supposed to delete.

#### C6 · CS, Windows user · Name: ________
*Dell laptop, 512 GB, 92% full. The MVP is macOS-only, so this ran on our MacBook with a copy of C6's Downloads folder.*

> **C6:** This feels easy because it's not my computer. On my actual laptop I'd read every line. *(Approves 50 of 52.)* The reasons are good, and the undo button is what makes me willing to try it at all.
>
> **C6:** But on Windows my problem isn't Downloads. It's WSL. The virtual disk is 60 gigs and it never shrinks on its own. Plus Docker. And I can't use this next week anyway, because there's no Windows version.

#### C7 · CS, "I never delete anything" · Name: ________
*MacBook Air, 256 GB, 90% full, 2,812 files in Downloads*

> *(The plan takes 71 seconds. The Safety Log shows two rejected attempts, then a pass.)*
>
> **C7:** It's arguing with itself? It got rejected, fixed it, got rejected again, fixed it. It's like watching the autograder.
>
> **C7:** Hold on, 61 actions? I have almost three thousand files. *(Us: It only plans with the first 400 per request.)* So I have to ask it seven times? *(Approves 58 of 61.)*
>
> **C7:** It put all my "Untitled" files into Documents/Other, which is just my mess in a new folder. And why does it keep forty `.dmg`s I already installed? Undo's there, so I'm not worried, but I'd rather it just did this every Sunday night.

#### C8 · CS, very organized · Name: ________
*MacBook Pro, 1 TB, 41% full*

> **C8:** My Downloads is pretty clean. I clear it every Sunday. *(Approves all 6 actions.)* It's good, I just don't have this problem. I'd want it at graduation, for four years of stuff to sort before I wipe this laptop. Or if it kept things organized by itself, so I could stop doing my Sunday thing.

#### C9 · CS grad student and TA · Name: ________
*MacBook Air, 512 GB, 76% full*

> **Dino:** I can't tell which class `Lecture 7.pdf`, `slides.pdf`, and `Document (3).pdf` belong to from their names. Leave them, or put them in an Unsorted folder?
>
> **C9:** Unsorted. *(Approves all 44 actions, then finds three misfiled PDFs and fixes them by hand.)* It's guessing from the file name. Could it peek at the first page? The course code is right on the title slide. Opt-in, though. I don't want my students' names going anywhere.
>
> **C9:** The memory panel means it won't ask me again, which is great. This is the first one of these I'd actually tell my students about.

#### C10 · CS, goes to every hackathon · Name: ________
*MacBook Air, 256 GB, 95% full*

> **Dino:** Plan: trash 2 exact duplicates (20 MB) and move 7 installers into Downloads/Installers.
>
> **C10:** Twenty megabytes? Why isn't it deleting the installers? I've installed all of those. *(Us: It can only remove exact copies of something you're keeping.)* So it can't delete anything that isn't a copy? That's most of what clutter is.
>
> *(Runs only the two duplicate trashes.)*
>
> **C10:** I trust it. It just didn't do anything I needed. My space is Docker and like nine hackathon projects with `node_modules`.

#### N1 · Family member (parent) · Name: ________
*MacBook Air, 256 GB, 93% full, mostly email attachments in Downloads*

> **N1:** Is it going to delete my pictures? It just sees numbers, so it doesn't know which ones are from the graduation. And what's a "Dino Bin"? Why isn't it in the Trash? *(to the facilitator)* Would you click it?
>
> *(Unchecks all 12 photo moves and approves 18 of 30.)*
>
> **N1:** What I really need: the doctor's office emails me a form, I download it, and then I can never find it. Can I just ask it where it is? That's the one I'd use every week. And the computer keeps telling me it's Photos that's full anyway.
>
> **Us:** Would you run it again on your own?
>
> **N1:** If you were sitting next to me.

#### N2 · Family member (parent) · Name: ________
*Family iMac, 1 TB, 78% full, about 300 icons on the Desktop*

> **Dino:** Quarantine `VideoConverterPro.pkg` (unsigned app or installer).
>
> **N2:** "Unsigned." Is that a virus or not? Just tell me yes or no, and what to do. *(Decides to quarantine it.)* It says why for each one, and I can put things back, so okay. *(Approves 70 of 72.)*
>
> **N2:** I can see the wallpaper! Can it do this every month by itself? The bigger thing for me is email attachments. If it told me "this is a scam, don't open it," that's what I'd pay for.

#### N3 · Family member (sibling, not in CS) · Name: ________
*MacBook Air, 256 GB, 96% full*

> **N3:** *(types)* "make my laptop faster" *(after 30 seconds)* This is taking forever.
>
> *(Clicks Approve on a 41-action plan about ten seconds later, without scrolling.)*
>
> **N3:** …wait, where's my history essay? I was about to upload that. *(Undoes all 41 actions, then approves a 12-action screenshot plan.)*
>
> **N3:** I'm not reading all that. Just tell me what it's going to do in one sentence. And the thing taking all my space is games. Can it delete the ones I don't play?

#### N4 · Family member (least comfortable with technology) · Name: ________
*MacBook, 89% full*

> **N4:** Not on my computer. Show me on yours first.
>
> *(We run the demo tour on the fake demo folder.)*
>
> **N4:** It's very cute. I still wouldn't let it touch my things. My pictures are on there. If someone in the family did it for me, or if there was a person I could call, maybe. What I'd want to know is whether an email is a virus.

#### N5 · Girlfriend, non-CS student (major: ________) · Name: ________
*MacBook Air, 256 GB, 91% full*

> **Dino:** I found 3 versions of Essay2 with different contents: `Essay2_final.docx`, `Essay2_final_v2.docx`, `Essay2_FINAL_actually.docx`. Keep all three, or keep the newest and move the others to Old Drafts?
>
> **N5:** *(laughs)* The version thing is literally my life. Keep the newest. It remembered that? So next time it won't ask? And it tells me why, and I can undo it. *(Approves all 33 actions.)*
>
> **N5:** Can it move last semester's stuff to my external drive? I don't want it deleted, I just don't want it on my laptop.
>
> *(Exit survey, day 7:)* "I ran it before midterms and it didn't ask about the drafts again."

---

## 2. KPI data

### 2.1 How we score it

Every metric gets a color and points: green 2, yellow 1, red 0. **Bold** metrics are the four KPIs from our MVP plan.

| Dimension | Metric | How we measure it | Green | Yellow | Red |
|---|---|---|---|---|---|
| Trust | **First-session approval** (primary) | Ran a plan on their own files in session 1, keeping ≥80% of proposed actions | ≥60% | 40–59% | <40% |
| Trust | **Unsafe actions** | Shown to a tester, and would lose data, touch a NEVER zone, delete a non-duplicate, or quarantine an unflagged file | 0 | — | ≥1 |
| Trust | Trust Ladder | Mean level, from the rubric below | ≥3.0 | 2.0–2.9 | <2.0 |
| Trust | "I trusted the plan before I approved it" | Survey mean, 1–5 | ≥4.0 | 3.0–3.9 | <3.0 |
| Accuracy | **Undo rate** | Actions undone ÷ actions run | ≤10% | 11–20% | >20% |
| Value | **Repeat use** | Ran another plan within 7 days, unsupervised | ≥40% | 25–39% | <25% |
| Value | "It solved a problem I actually have" | Survey mean, 1–5 | ≥3.5 | 2.5–3.4 | <2.5 |
| Value | "Very disappointed" if they could no longer use it | Sean Ellis product-market-fit question | ≥40% | 25–39% | <25% |
| Value | Space freed ÷ space wanted | Medians | ≥50% | 20–49% | <20% |

**Trust Ladder**, coded from what each tester did in session 1:

| Level | What we observe |
|---|---|
| L0 Refuses | Won't select a real folder |
| L1 Spectator | Only watches the demo |
| L2 Guarded | Runs under 80% of a plan out of distrust, or approves without reading and then reverses it |
| L3 Verifying | Reads the plan and runs ≥80%, but would want to check every time |
| L4 Delegating | Runs ≥80%, then asks it to do more or says they'd let it run on its own |

**Themes:** we tag each quote with a theme. A theme is a signal if at least 5 of 15 testers, or 3 of the 5 non-CS testers, raise it unprompted.

**Decision rules:**
- **Validated:** Trust ≥6/8 and Value ≥6/8.
- **Pivot:** Trust ≥6/8, but Value ≤5/8. The engine works, but it's aimed at the wrong problem or people.
- **Invalidated:** Trust is under 6/8, or first-session approval or unsafe actions are red.

### 2.2 Quantitative results

| Metric | All (n=15) | CS (n=10) | Non-CS (n=5) | Score |
|---|---|---|---|---|
| First-session approval | **11/15 = 73%** | 8/10 = 80% | 3/5 = 60% | 🟢 2 |
| Unsafe actions | **0** | 0 | 0 | 🟢 2 |
| Trust Ladder mean | **3.07** | 3.4 | 2.4 | 🟢 2 |
| Survey: trusted the plan | **4.1** | 4.4 | 3.4 | 🟢 2 |
| Undo rate | **41/657 = 6.2%** | 0/458 = 0% | 41/199 = 21% | 🟢 2 |
| Repeat use within 7 days | **5/15 = 33%** | 4/10 = 40% | 1/5 = 20% | 🟡 1 |
| Survey: solved a real problem | **2.9** | 2.7 | 3.2 | 🟡 1 |
| "Very disappointed" | **3/15 = 20%** | 2/10 = 20% | 1/5 = 20% | 🔴 0 |
| Space freed ÷ space wanted | **0.55 ÷ 20 GB ≈ 3%** | 0.95 ÷ 22.5 GB ≈ 4% | 0.3 ÷ 15 GB = 2% | 🔴 0 |

**Totals: Trust 8/8, Accuracy 2/2, Value 2/8.** CS testers alone scored 8/8, 2/2, and 3/8. Non-CS testers alone scored 6/8, 0/2, and 1/8. All three groups land on **Pivot**.

| Tester | Kept / proposed | Full plan? | Trust | Reported freed | Wants back | Rebuildable dev clutter | Week-2 plans |
|---|---|---|---|---|---|---|---|
| C1 | 46/46 | ✅ | L4 | 1.4 GB | 30 GB | 38 GB | 0 |
| C2 | 36/38 | ✅ | L4 | 6.6 GB | 40 GB | 61 GB | 1 |
| C3 | 34/34 | ✅ | L3 | 0.3 GB | 50 GB | 57 GB | 0 |
| C4 | 14/20 | ❌ 70% | L2 | 0.8 GB | 15 GB | 9 GB | 0 |
| C5 | 26/27 | ✅ | L4 | 2.1 GB | 25 GB | 27 GB | 1 |
| C6 | 50/52, on a copy | ✅\* | L3 | 1.1 GB | 40 GB | n/a (Windows) | 0 |
| C7 | 58/61 | ✅ | L4 | 3.9 GB | 20 GB | 12 GB | 2 |
| C8 | 6/6 | ✅ | L3 | 0.02 GB | 0 GB | 6 GB | 0 |
| C9 | 44/44 | ✅ | L4 | 0.4 GB | 10 GB | 14 GB | 1 |
| C10 | 2/9 | ❌ 22% | L3 | 0.02 GB | 20 GB | 31 GB | 0 |
| N1 | 18/30 | ❌ 60% | L2 | 0.1 GB | 10 GB | — | 0 |
| N2 | 70/72 | ✅ | L3 | 0.6 GB | "no idea" | — | 0 |
| N3 | 41/41, all undone | ✅\* | L2 | 0 GB | 50 GB | — | 0 |
| N4 | Demo only | ❌ | L1 | — | "no idea" | — | 0 |
| N5 | 33/33 | ✅ | L4 | 0.5 GB | 15 GB | — | 1 |

\* Weak approvals: C6 ran on a copy, and N3 approved without reading. C10's low number is a value problem, not distrust, so it's still L3.

**How firm these numbers are:**
- Without C6 and N3, approval is 9/13 = 69%, still green.
- If "full plan" meant every single action, approval would be 6/15 = 40%, right at the fail line. We allow unchecking because that's the preview doing its job.
- C7's week-2 plans mostly finished files the 400-file cap left behind. Without them, repeat use is 4/15 = 27%.
- N2 reopened the app once for a malware scan. That wasn't a cleanup plan, so it doesn't count as repeat use.

**Other measurements:**
- **Validator:** of 56 plan requests, 54 passed within 3 tries (37 on the first), and 2 fell back to the safe part or nothing. It caught 31 errors along the way, and no unsafe action reached a tester.
- **Accuracy:** testers unchecked 35 of 513 proposed actions (6.8%). All 41 undone actions came from N3's single panic undo. Testers fixed another 5 files by hand, because undo is all-or-nothing.
- **Space:** the FREED counter reported 17.8 GB in total, but **0 bytes were actually freed on disk**, because the Dino Bin is on the same drive.
- **Speed:** a validated plan took a median of 34 seconds.
- **Malware:** 3 flags on 14 real laptops: a pirated-software installer (C5), an installer nobody remembered (N2), and a false positive (C4's own unsigned app).

**Where CS testers' space actually is** (the 9 CS testers with Macs):

| Category | Total | Testers who had it |
|---|---|---|
| Xcode build data and simulators | 57 GB | 1 |
| ML model caches (Hugging Face, PyTorch) | 50 GB | 3 |
| Docker images and build cache | 49 GB | 4 |
| JavaScript packages (`node_modules`, npm cache) | 44 GB | 6 |
| Python environments and caches | 37 GB | 5 |
| Game-engine build folders (Unity `Library/`) | 18 GB | 1 |
| **Total rebuildable** | **255 GB** (median 27 GB per tester, range 6–61 GB) | |

The same 9 testers had a median of **0.8 GB** of reported savings from duplicates, so their rebuildable clutter is **about 34× larger**.

### 2.3 Qualitative results

**Trust Ladder:** 6 testers at L4, 5 at L3, 3 at L2, 1 at L1, and none at L0.

**Themes:**

| # | Theme | Testers | Count | Signal? |
|---|---|---|---|---|
| T1 | The preview and plain-English reasons are why I approved | C1–C7, C9, N2, N5 | 10/15 | **Yes** |
| T2 | "Nothing is gone for good" and undo are why I approved | C1, C2, C5, C6, C7, N2, N5 | 7/15 | **Yes** |
| T3 | My real space problem is somewhere it won't go | C1–C6, C10, N1, N3 | 9/15 (7/10 CS) | **Yes** |
| T4 | I want it to run by itself | C1, C7, C8, N2 | 4/15 | No |
| T5 | File names aren't enough to sort correctly | C7, C9, N1 | 3/15 | No |
| T6 | It can't remove things that aren't exact copies | C7, C10, N3 | 3/15 | No |
| T7 | Helper needs: find my file, is this download a scam? | N1, N2, N4 | 3/5 non-CS | **Yes, non-CS** |
| T8 | Too technical, or too much to read | N1, N2, N3, N4 | 4/5 non-CS | **Yes, non-CS** |
| T9 | File names are private | C4, C9 | 2/15 | No |
| T10 | Too slow | C2, C7, N3 | 3/15 | No |
| T11 | The questions and memory were the best part | C2, C5, C9, N5 | 4/15 | No |

**Exit survey, beyond the scorecard:**
- 6 of 15 would pay for the app as it is: 4 at $1–3/month and 2 at $5/month.
- CS testers were also asked how they'd feel without a version that safely clears rebuildable dev clutter: **7 very, 2 somewhat, and 1 not disappointed**. For the current app, it was 2, 5, and 3.

---

## 3. Decision: Pivot

### 3.1 What the evidence says

**Trust is validated.**
- 73% ran a full plan in their first session, above our 60% bar, and still 69% without the two weakest approvals.
- No unsafe action reached anyone, even though the validator caught 31 errors.
- The trust features we designed were the top reasons testers gave for approving: previews with reasons (10/15) and undo (7/15).

**Value is not validated.**
- Testers wanted a median of 20 GB back. The app reported 0.55 GB, and the real number was 0, because the Dino Bin sits on the same disk ([executor.js:8](../app/backend/executor.js#L8)).
- Only 20% would be "very disappointed" without it, against a 40% benchmark.
- "Solved a problem I actually have" averaged 2.9/5, and it was lowest among CS testers (2.7).
- Only 33% used it again in week 2.
- 9 of 15 said, unprompted, that their real space problem was somewhere the app won't go. That's by design today: git repos are NEVER zones ([profile.js:47](../app/backend/profile.js#L47)), `~/Library` is too ([profile.js:11](../app/backend/profile.js#L11)), and the scan skips `node_modules` ([scanner.js:6](../app/backend/scanner.js#L6)).

**Why not "Validated"?** The hypothesis only asked whether people would *let* the app act. They did, but with someone sitting next to them and on low-stakes folders. That shows permission, not demand. An app that frees about 3% of the space people want doesn't have a business, however much they trust it.

**Why not just "Invalidated"?** Nothing about trust failed. The preview, reasons, validator, undo, and questions are the parts that work, and they carry over. What failed is the problem we aimed them at, so we change the target and keep the engine.

**Limits of this evidence.** Testers are friends and family, which inflates approval and trust, though value still scored low despite that bias. With n = 15, one tester moves a percentage by about 7 points, so treat the numbers as directional. Seven days is also a short window for a problem that builds up over weeks.

### 3.2 What we're pivoting to

**From:** a general file cleaner for "students with cluttered laptops" that sorts Downloads and trashes exact duplicates.

**To: Cleanasaurus for developers' laptops, starting with CS students.** It reclaims space from developer clutter that can be rebuilt, and it only deletes what the validator can prove you can get back.

This is a **customer-segment pivot** (from everyone with a Mac to CS students) plus a **zoom-in pivot** (one capability, "free up space," becomes the product). The vision stays the same: tell your computer to clean itself, and trust it to do it safely.

**New hypothesis:**

> CS students whose laptops are over 80% full will, without us in the room, approve a validated plan that actually frees at least 10 GB of rebuildable developer clutter in their first session (≥60% of testers), and at least 40% will run it again within 30 days.

**What it looks like:**

> **Student:** I'm out of space. I'm done with CS 3140 and the fall hackathon, but don't touch my capstone or anything on my resume.
>
> **Dino:** I found 38 GB I can prove you can rebuild:
> - `node_modules` in 6 projects you haven't opened since spring: 4.1 GB. `npm ci` rebuilds each in about a minute.
> - 3 Python environments from CS 3140: 2.2 GB. Rebuilt from each `requirements.txt`.
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
| Where it looks | One folder; skips repos, hidden folders, and `~/Library` | Projects, their ignored build folders, and known tool caches, but never source code |
| Space freed | Only reported; files sit in the Dino Bin | Real: rebuildables are deleted, and the app shows the actual change on disk |
| Undo | Undoes the whole last run | Per item; for a rebuildable, one click runs the recorded rebuild command |
| Why come back | No reason once Downloads is clean | An alert at 85% full, an end-of-semester sweep, and a cleanup after each hackathon |
| **Unchanged** | Chat → plan → validator → self-correction → ask when stuck → remember → approve | Same |

**The rebuild proof (new validator check).** An item can be deleted only if all five hold:
1. **Known artifact type:** for example `node_modules`, a `.venv` or conda environment, Xcode DerivedData, package-manager caches, the Hugging Face cache, or Docker images no container uses.
2. **Not source code:** git tracks nothing inside it, and it's in `.gitignore` or a tool's own cache folder.
3. **A rebuild recipe exists:** the lockfile or manifest is present (`package-lock.json`, `requirements.txt`, `environment.yml`, or a model ID), and we save its hash and the exact rebuild command.
4. **Nothing irreplaceable inside:** no `.env` files, keys, datasets the user made, or trained checkpoints.
5. **Inactive:** the project hasn't changed in 30 days, or the user named it.

Source code, uncommitted work, Xcode Archives, Docker volumes, and VM disks stay NEVER no matter what.

This is the MVP's duplicate proof made broader. Today the app may delete a file because it can prove an identical copy survives. After the pivot, it may also delete a folder because it can prove the recipe to rebuild it survives.

**Why the LLM is still core.** Without it, this is just npkill. Deleting `node_modules` is the easy part. The hard part is knowing that "I'm done with CS 3140 but keep anything on my resume" means these six projects and not those three, then explaining each item, asking when a project looks half-finished, and remembering what you always keep.

### 3.3 Why this is sensible

1. **It's where the space is.** CS testers had a median of 27 GB of rebuildable clutter against 0.8 GB of duplicates, and 7 of 9 had over 10 GB. Public reports match: one npkill run found [58.68 GB across 128 `node_modules` folders](https://flaviocopes.com/npkill/), and Xcode cleanup guides routinely [promise 30–50 GB back](https://dev.to/nixeton/how-to-clean-up-xcode-and-free-30-50gb-on-your-mac-3ogh).
2. **It's where testers pointed us, unprompted.** 7 of 10 CS testers named a place the app won't go as their real problem. C1 put it best: "It's protecting the one folder I want cleaned."
3. **Our trust engine carries over.** CS testers scored 8/8 on trust. C2 approved 6.4 GB of dataset deletes because the app proved the copies identical, and the pivot relies on that same kind of proof-based approval.
4. **Stated pull is much stronger.** 7 of 10 CS testers would be "very disappointed" without the dev version, against 2 of 10 for the current app. This is a stated answer to a hypothetical, so it's the weakest evidence here, but it does point the same way as the measurements.
5. **It fixes our retention problem by design.** Dev clutter grows back with every new project, class, and hackathon. A clean Downloads folder stays clean.
6. **It fixes the MVP's two biggest value flaws.** Rebuildables are actually deleted, so space is actually freed. And the app can finally remove things that aren't duplicates, with proof.
7. **We are the customer, and we can reach more of them.** All three of us have this problem, and we can recruit through CS classes, clubs, and hackathons.
8. **There's room to grow.** SlashData estimates [48.4 million developers worldwide](https://www.slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there) as of Q3 2025. Students are the beachhead, and working developers come next.
9. **The competition proves the pain but leaves a gap.** Tools like npkill (only `node_modules`), DevCleaner (only Xcode), `docker system prune`, and `conda clean` each cover one ecosystem. None of them know which projects you're done with, and none prove an item can be rebuilt before deleting it.

**Why not the other directions?**

| Option | Why not |
|---|---|
| Same product, better hypothesis | Value scored 2/8, and a new hypothesis doesn't free more space |
| Auto-file new downloads | Below our signal bar (4/15), crowded (Sparkle, Hazel), and it frees no space |
| Family "computer helper" (find files, scam checks) | Real need (T7, T8), but lowest trust (2.4), people want a human to call, and their storage is in Apple's Photos and iCloud |

**Main risks:**
- Developers are used to free tools, and willingness to pay is unproven.
- Every ecosystem needs its own rebuild rule. Five (JavaScript, Python, Xcode, Docker, ML caches) cover 93% of what we measured, so we'd start there.
- A wrong deletion the night before a deadline is worse than a lost PDF, so anything we can't verify as rebuildable stays NEVER.
