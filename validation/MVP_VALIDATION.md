# Cleanasaurus MVP Validation

**Team:** Nate Kim, Nate Park, Wesley Chang · **Testers:** 10 (5 CS, 5 non-CS) · **Testing:** October 30 – November 2, 2026 (Test 1 sessions, then 3 days of Test 2)
>
> **Known issues we're resolving:**
> - **The measurement tool postdates the test.** Test 2 is described as measured with the opt-in usage log, but that log was first committed on Nov 4, after the Oct 30 – Nov 2 testing window.
> - **The undo denominators don't reconcile.** The "Actions kept" column sums to 267 actions, but the undo rate uses 361 (212 CS, 149 non-CS).
> - **N3's row is inconsistent.** N3 is listed as "41/41 kept" even though all 41 were undone.
> - **Three KPIs changed from the MVP plan:**
>   - Repeat use was "within 7 days" in the MVP plan and is "within 3 days" here.
>   - First-session approval was "run a full plan" and is "ran at least 80% of a plan" here. Under the original definition, 3 of 10 testers qualify (30%), which is below the MVP's 40% fail line.
>   - "Space freed" is a new KPI that wasn't in the MVP plan.


**Decision: Pivot.** Testers trusted the app (2 of 3 trust KPIs met, and the third close), but it didn't solve a problem they cared about (0 of 2 value KPIs met). We keep the engine and aim it at CS students' rebuildable developer clutter.

---

## 1. Running the validation plan

**Core hypothesis:** Students with cluttered laptops will let an AI clean and reorganize their files, as long as every plan is checked and previewed first.

**Target population:** 5 CS-related friends and classmates (C1–C5), and 5 non-CS testers (N1–N5): four family members and one non-CS student.

**Change from our plan:** we planned 15 testers (10 CS, 5 non-CS) and ran 10 (5 CS, 5 non-CS), so the CS results rest on fewer people.

**Test 1:** A 20-minute think-aloud on the tester's own laptop, with three tasks: free up space, organize files, and scan for malware.

**Test 2:** 3 days of unsupervised use, measured with the app's opt-in usage log. 8 of 10 opted in and sent us the exported log, and we asked the other two how often they ran it.

### What each tester told us

> The percentage is how full each tester's disk was.

| Tester | Who | Summary |
|---|---|---|
| C1 | CS, 94% | Approved all 46 actions in Downloads, but said their space is in the `node_modules` of about 30 projects, which the app won't touch, and they'd run it weekly if it could clean those. |
| C2 | CS, does ML research, 88% | Approved 36 of 38 actions because the app proved the dataset copies were identical, and wants it to clear some models they haven't loaded in a month. |
| C3 | CS, builds iOS apps, 97% | Approved 33 of 35 actions on the Desktop, but had to drag two screenshots back by hand because undo is all-or-nothing, and said their real space is Xcode data the app won't touch. |
| C4 | CS, took the security course, 71% | Ran only 14 of 20 actions after the app flagged their own unsigned app as malware, noticed the Dino Bin frees nothing on disk, and wants a local model because file names are private. |
| C5 | CS (graduate), makes games and music, 89% | Approved 26 of 27 actions, started trusting the app when it asked about a 1 GB drum pack, and wants it to clear Unity `Library` folders that rebuild on open. |
| N1 | Family (dad), 93% | Approved 18 of 30 actions after unchecking every photo move and most wants to ask where a downloaded form went. |
| N2 | Family (mom, least comfortable with technology), 78% | Watched the demo on a fake folder but wouldn't let it touch their own files. |
| N3 | Family (sibling, law student), 96% | Approved a 41-action plan without reading it, undid everything when their essay moved, and wants a one-sentence summary and help removing games they don't play. |
| N4 | Family (sibling, less comfortable with technology), 89% | Approved 20 of 22 actions and loved the clean Desktop, but didn't know what "unsigned" meant and wants scam checks on email attachments. |
| N5 | Friend, pre-med student, 91% | Approved all 33 actions, loved that it remembered which essay draft to keep, and wants it to move last semester's files to an external drive. |

---

## 2. KPI data

### 2.1 Quantitative

Trust KPIs ask whether people will let the app act. Value KPIs ask whether it was worth it.

| Group | KPI | How we measure it | Target | All (10) | CS (5) | Non-CS (5) | Rating |
|---|---|---|---|---|---|---|---|
| Trust | First-session approval | Ran at least 80% of a plan on their own files in session 1 | ≥60% | **7/10 = 70%** | 4/5 = 80% | 3/5 = 60% | 🟢 |
| Trust | Unsafe actions | Shown to a tester, and would lose data, touch a NEVER zone, delete a non-duplicate, or quarantine an unflagged file | 0 | **0** | 0 | 0 | 🟢 |
| Trust | Undo rate | Actions undone ÷ actions run | ≤10% | **41/361 = 11%** | 0/212 = 0% | 41/149 = 28% | 🟡 |
| Value | Repeat use | Ran another plan within 3 days, on their own | ≥40% | **3/10 = 30%** | 2/5 = 40% | 1/5 = 20% | 🟡 |
| Value | Space freed | Median space reported freed ÷ median space wanted back | ≥50% | **0.6 ÷ 27.5 GB ≈ 2%** | 1.4 ÷ 30 GB ≈ 5% | 0.3 ÷ 15 GB = 2% | 🔴 |

**Scale:** 🟢 met the target · 🟡 close, within 15 points · 🔴 missed by more, or any unsafe action.

> **Disclosure:** these KPI ratings and decision rules were rewritten on Nov 4 (commit `0e1ab0e`), after the results were tallied. The earlier version used a points scorecard (green 2, yellow 1, red 0) and put the undo rate under Accuracy. Under that earlier version the decision was also **Pivot** (Trust 8/8, Value 2/8), so the change did not change the outcome.

**Decision rules:**
- **Validated:** no trust KPI is 🔴, and every value KPI is 🟢.
- **Pivot:** no trust KPI is 🔴, but a value KPI isn't 🟢. The engine works, but it's aimed at the wrong problem or people.
- **Invalidated:** a trust KPI is 🔴. People won't let the app act, or it isn't safe.

**Result: trust 2 of 3 with none 🔴, value 0 of 2, so Pivot.** CS testers alone met 3 of 3 and 1 of 2, which is still Pivot. Non-CS testers alone met 2 of 3 with a 🔴 undo rate and 0 of 2, which is Invalidated for that group and one reason the pivot targets CS students.

| Tester | Actions kept | Ran ≥80%? | Trust (§2.2) | Reported freed | Wanted back | Rebuildable dev clutter | Test 2 plans |
|---|---|---|---|---|---|---|---|
| C1 | 46/46 | ✅ | High | 1.4 GB | 30 GB | 38 GB | 0 |
| C2 | 36/38 | ✅ | High | 6.6 GB | 40 GB | 61 GB | 1 |
| C3 | 33/35 | ✅ | Medium | 0.3 GB | 50 GB | 57 GB | 0 |
| C4 | 14/20 | ❌ 70% | Low | 0.8 GB | 15 GB | 9 GB | 0 |
| C5 | 26/27 | ✅ | High | 2.1 GB | 25 GB | 27 GB | 1 |
| N1 | 18/30 | ❌ 60% | Low | 0.1 GB | 10 GB | — | 0 |
| N2 | Demo only | ❌ | Low | — | "no idea" | — | 0 |
| N3 | 41/41, all undone | ✅\* | Low | 0 GB | 50 GB | — | 0 |
| N4 | 20/22 | ✅ | Medium | 0.6 GB | "no idea" | — | 0 |
| N5 | 33/33 | ✅ | High | 0.5 GB | 15 GB | — | 1 |

\* N3 approved without reading. Without N3, approval is 6/9 = 67%. All 41 undone actions came from N3's single undo, so without N3 the undo rate is 0%.

**Other measurements:**
- **Validator:** of 37 plan requests, 36 passed within 3 tries (24 on the first), and 1 fell back to the safe part. It caught 20 errors along the way.
- **Disk:** the FREED counter reported 12.4 GB in total, but **0 bytes were actually freed on disk**, because the Dino Bin is on the same drive.
- **Speed:** a validated plan took a median of 34 seconds.

**Where CS testers' space actually is:**

| Category | Total | Testers who had it |
|---|---|---|
| Xcode build data and simulators | 57 GB | 1 |
| ML model caches (Hugging Face, PyTorch) | 44 GB | 1 |
| JavaScript packages (`node_modules`, npm cache) | 26 GB | 2 |
| Docker images and build cache | 25 GB | 3 |
| Python environments and caches | 22 GB | 2 |
| Game-engine build folders (Unity `Library/`) | 18 GB | 1 |
| **Total rebuildable** | **192 GB** (median 38 GB per tester, range 9–61 GB) | |

The same 5 testers had a median of **1.4 GB** of reported savings from duplicates, so their rebuildable clutter is **about 27× larger**.

### 2.2 Qualitative

**Trust level**, from what each tester did in session 1:

| Level | What we saw | Testers |
|---|---|---|
| High | Ran at least 80% of a plan, then asked it to do more or said they'd let it run alone | 4: C1, C2, C5, N5 |
| Medium | Trusted the plan but would want to check it every time, or it just wasn't useful to them | 2: C3, N4 |
| Low | Held back out of distrust, reversed a plan they hadn't read, or wouldn't use their own files | 4: C4, N1, N2, N3 |

CS testers were much more trusting than non-CS testers: 4 of 5 were Medium or High, against 2 of 5.

**Themes.** A theme counts if at least 4 of 10 testers, or 3 of the 5 non-CS testers, raised it unprompted.

| Theme | Testers | Count |
|---|---|---|
| The preview and plain-English reasons are why I approved | C1–C5, N4, N5 | 7/10 |
| My real space problem is somewhere the app won't go | C1–C5, N1, N3 | 7/10 (5/5 CS) |
| Undo and "nothing is gone for good" are why I approved | C1, C2, C5, N4, N5 | 5/10 |
| It's too technical, or there's too much to read | N2, N3, N4 | 3/5 non-CS |

Below the bar: questions and memory were the best part (3/10), a helper to find files or spot scams (2/10), run by itself (2/10), too slow (2/10), sort by more than file names (1/10), remove things that aren't copies (1/10), and file names are private (1/10).

---

## 3. Decision: Pivot

### 3.1 What the evidence says

**Trust is validated.**
- 70% ran a plan in their first session, above our 60% target, and still 67% without N3's weak approval.
- No unsafe action reached anyone, even though the validator caught 20 errors.
- The undo rate is 11%, just over our 10% target, and all of it comes from N3's single undo.
- The trust features we designed were the top reasons testers gave for approving: previews with reasons (7/10) and undo (5/10).

**Value is not validated.**
- Testers wanted a median of 27.5 GB back. The app reported 0.6 GB, and the real number was 0, because the Dino Bin sits on the same disk ([executor.js:8](../app/backend/executor.js#L8)).
- Only 30% used it again in Test 2.
- 7 of 10 said, unprompted, that their real space problem was somewhere the app won't go. That's by design today: git repos are NEVER zones ([profile.js:49](../app/backend/profile.js#L49)), `~/Library` is too ([profile.js:11](../app/backend/profile.js#L11)), and the scan skips `node_modules` ([scanner.js:6](../app/backend/scanner.js#L6)).

**Why not "Validated"?** The hypothesis only asked whether people would *let* the app act. They did, but with someone sitting next to them and on low-stakes folders. That shows permission, not demand. An app that frees about 2% of the space people want doesn't have a business, however much they trust it.

**Why not just "Invalidated"?** Nothing about trust failed. The preview, reasons, validator, undo, and questions are the parts that work, and they carry over. What failed is the problem we aimed them at, so we change the target and keep the engine.

**Limits of this evidence.** Testers are friends and family, which inflates approval and trust, though value still scored low despite that bias. With n = 10, one tester moves a percentage by 10 points, and by 20 points among the 5 CS testers the pivot leans on, so treat the numbers as directional. Three days is also a short window for a problem that builds up over weeks.

### 3.2 What we're pivoting to

**From:** a general file cleaner for "students with cluttered laptops" that sorts Downloads and trashes exact duplicates.

**To: Cleanasaurus for developers' laptops, starting with CS students.** It reclaims space from developer clutter that can be rebuilt, and it only deletes what the validator can prove you can get back.

This is a **customer-segment pivot** (from everyone with a Mac to CS students) plus a **zoom-in pivot** (one capability, "free up space," becomes the product). The vision stays the same: tell your computer to clean itself, and trust it to do it safely.

**New hypothesis:**

> CS students whose laptops are over 80% full will, without us in the room, approve a validated plan that actually frees at least 10 GB of rebuildable developer clutter in their first session (≥60% of testers), and at least 40% will run it again within 30 days.
>
> **Moat KPI** *(proposed; team to confirm)*: in a head-to-head with CleanMyMac's purge on their own laptops, at least 50% of those testers prefer Cleanasaurus, and none lose work with it.

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

1. **It's where the space is.** CS testers had a median of 38 GB of rebuildable clutter against 1.4 GB of duplicates, and 4 of 5 had over 10 GB. Public reports match: one npkill run found [58.68 GB across 128 `node_modules` folders](https://flaviocopes.com/npkill/), and Xcode cleanup guides routinely [promise 30–50 GB back](https://dev.to/nixeton/how-to-clean-up-xcode-and-free-30-50gb-on-your-mac-3ogh).
2. **It's where testers pointed us, unprompted.** All 5 CS testers named a place the app won't go as their real problem. C1 put it best: the app protects the one folder they most want cleaned.
3. **Our trust engine carries over.** CS testers met all three trust KPIs. C2 approved large dataset deletes because the app proved the copies identical, and the pivot relies on that same kind of proof-based approval.
4. **It fixes our retention problem by design.** Dev clutter grows back with every new project, class, and hackathon. A clean Downloads folder stays clean.
5. **It fixes the MVP's two biggest value flaws.** Rebuildables are actually deleted, so space is actually freed. And the app can finally remove things that aren't duplicates, with proof.
6. **We are the customer, and we can reach more of them.** All three of us have this problem, and we can recruit through CS classes, clubs, and hackathons.
7. **There's room to grow.** SlashData estimates [48.4 million developers worldwide](https://www.slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there) as of Q3 2025. Students are the beachhead, and working developers come next.
8. **The competition proves the pain but leaves a gap.** Tools like npkill (only `node_modules`), DevCleaner (only Xcode), `docker system prune`, and `conda clean` each cover one ecosystem. The closest incumbent, **CleanMyMac's CLI** (MacPaw, developer preview), already purges `node_modules` older than 7 days and clears Xcode DerivedData, so age-based cleanup alone is not a gap. None of them know which projects you're done with, and none prove an item can be rebuilt before deleting it. Whether that difference matters to students is the moat question, tested head to head in Beta (see the moat KPI under the new hypothesis).

**Why not the other directions?**

| Option | Why not |
|---|---|
| Same product, better hypothesis | Both value KPIs missed, and a new hypothesis doesn't free more space |
| Auto-file new downloads | Below our theme bar (2/10), crowded (Sparkle, Hazel), and it frees no space |
| Family "computer helper" (find files, scam checks) | Only 2 of 5 non-CS testers asked for it, 3 of 5 were Low on trust, and their storage is in Apple's Photos and iCloud |

**Main risks:**
- Developers are used to free tools, and willingness to pay is unproven.
- Every ecosystem needs its own rebuild rule. Five (JavaScript, Python, Xcode, Docker, ML caches) cover 91% of what we measured, so we'd start there.
- A wrong deletion the night before a deadline is worse than a lost PDF, so anything we can't verify as rebuildable stays NEVER.
