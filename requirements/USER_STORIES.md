# Cleanasaurus User Stories

**Team:** Nate Kim, Nate Park, Wesley Chang · **Builds on:** [MVP validation and pivot decision](../validation/MVP_VALIDATION.md)

> These stories come from the requirements in [§2](#2-requirements): the MVP requirements we're keeping, plus what the [validation sessions](../validation/MVP_VALIDATION.md) found. The evidence column points to the validation sessions (C1–C5, N1–N5) or to a section of the report. Every story is a GitHub issue (#2–#30), and the tests for each one are listed in [tdd/README.md](../tdd/README.md#2-every-github-issue-and-its-tests).

**Contents:** [1. How we derived them](#1-how-we-derived-the-stories) · [2. Requirements](#2-requirements) · [3. Personas](#3-personas) · [4. Stories](#4-user-stories) · [5. Won't do yet](#5-wont-do-this-release) · [6. Release plan](#6-release-plan) · [7. Traceability](#7-traceability)

---

## 1. How we derived the stories

1. **List the requirements and where each came from**: our original 8 criteria, or a finding in the validation sessions ([§2](#2-requirements)). Then mark the core subset: what sets us apart, what's in the MVP, and where the LLM does the work.
2. **Ask who needs each requirement and why.** The answer is a persona plus the session evidence ([§3](#3-personas)). Each pair becomes a story: *As a … I want … so that …*
3. **Split until every story is small and testable (INVEST).** For example, "the rebuild proof" became one shared rule (US-05) plus one story per ecosystem (US-06 to US-10). Each ecosystem story can ship and be tested on its own.
4. **Write acceptance criteria from what went wrong in the sessions.** For example, N3 approved without reading and lost track of an essay. That became a criterion in US-18: the summary must call out files opened in the last day.
5. **Prioritize with MoSCoW against one goal:** Alpha (Release 1) must be able to run the pivot test described in [§6](#6-release-plan). Anything that test doesn't need is Should, Could, or Won't.

**Sizes** are story points on a 1-2-3-5-8 scale, relative to each other: 2 is about an afternoon, and 8 is most of a week for one of us. Built stories are size 0, because there's no work left.
**Status** says what the MVP already has: **New** (not built), **Change** (modifies something built), or **Built** (works as-is).

---

## 2. Requirements

### Core subset

These nine requirements set Cleanasaurus apart, cover the MVP, and hold its LLM/AI integration. The full list follows.

| Requirement | Sets us apart | In the MVP | Core LLM/AI | What it does |
|---|---|---|---|---|
| FR1 Plain English → plan | | ✅ | ✅ | Claude turns a request and a file scan into a structured plan. |
| FR2 Validator gate | ✅ | ✅ | ✅ | Plain code checks every plan Claude writes before the user sees it. |
| FR3 Self-correction loop | ✅ | ✅ | ✅ | Validator errors go back to Claude, up to 3 tries. |
| FR4 Ask and remember | | ✅ | ✅ | Claude asks instead of guessing, and saved answers go into later plans. |
| FR6 Rebuild proof | ✅ | | ✅ | The validator rejects any deletion Claude proposes unless the folder can be proven rebuildable. |
| FR7 Intent → projects | ✅ | | ✅ | Claude works out which projects "I'm done with CS 3140" means. |
| FR11 Malware accuracy | | ✅ | | Only scanners can flag a file, so the LLM can't. |
| FR15 Permission zones | | ✅ | | The user decides where the app may act. |
| FR17 Preview and approve | | ✅ | | Nothing runs until the user approves it. |

**How the LLM fits in:** Claude writes the plan, and plain code decides whether it can run. Claude reads the request, file names and metadata, permission zones, and saved answers, then returns a plan in a fixed JSON format. It never touches a file, flags malware, or clears a folder for deletion. The validator, the malware scanners, and (after the pivot) the rebuild proof decide those. Without an API key, an offline rule-based planner stands in so the app can still be demoed.

**What sets us apart:** tools like npkill, DevCleaner, `docker system prune`, and `conda clean` each cover one ecosystem. The closest incumbent is **CleanMyMac** (MacPaw): its CLI, a developer preview, already purges `node_modules` older than 7 days and clears Xcode DerivedData, with an ignore list ([MacPaw docs](https://github.com/MacPaw/cleanmymac-cli/wiki/Find-and-Remove-Old-node_modules-on-Mac)). None of them prove an item can be rebuilt before deleting it ([validation §3.3](../validation/MVP_VALIDATION.md#33-why-this-is-sensible)).

**Our moat, if an incumbent adds an LLM front end.** A chat box on top of age-based purging still deletes by age. Ours is the combination:
1. **Proof per folder** (FR6): lockfile present and hashed, gitignored, nothing tracked, no uncommitted work, no secrets. Anything we can't prove stays NEVER.
2. **Rebuild, not just delete** (FR9): the exact command is saved, so undo still works after the files are gone.
3. **Intent** (FR7): the LLM maps "I'm done with CS 3140 and the hackathon" to projects; plain code decides who may skip the 30-day rule.
4. **What it learns** (FR4): saved answers ("keep anything on my resume") carry into every later plan.

Parts 1 and 2 are copyable code, so on their own they aren't a moat. The bet is that 3 and 4 together, built on a reputation for never losing work, make students prefer us over a purge tool. That's testable, so it's a Beta KPI (§6): **at least 50% of testers prefer Cleanasaurus over CleanMyMac's purge, head to head** *(proposed; team to confirm)*.

### Functional

| ID | Requirement | Source |
|---|---|---|
| FR1 | Turn a plain-English request into a structured plan | Criterion 5 (kept) |
| FR2 | No plan reaches the user until the validator passes it | Criterion 6 (kept) |
| FR3 | Send validator errors back to the planner, retry up to 3 times, then show only the safe part and ask | Criterion 7 (kept) |
| FR4 | Ask instead of guessing when something is ambiguous, and remember the answer | Criterion 7 (kept); C5, N5 |
| FR5 | Scan projects, their ignored build folders, and known tool caches | C1, C3, C5 |
| FR6 | Delete a folder only if the validator can prove it can be rebuilt (the rebuild proof) | C1–C5; validation §2.1 |
| FR7 | Map plain-English intent ("done with CS 3140") to specific projects | C1; validation §3.2 |
| FR8 | Free space for real: delete rebuildables, send personal files to the macOS Trash, and show the actual change on disk | C4; validation §2.1 |
| FR9 | Undo per action; for anything deleted, rebuild it with the recorded command | C3, N3 |
| FR10 | Watch storage and offer cleanups (85% full, end of semester) | C1; repeat-use KPI; validation §3.2 |
| FR11 | Only scanners can flag a file as malware, and an unsigned app alone is "unknown," not malware | Criterion 6 (kept); C4, N4 |
| FR12 | Plan folders of any size by working in batches of 400 files | The MVP's 400-file limit |
| FR13 | A one-sentence, plain-word summary above Approve | N2–N4 |
| FR14 | Opt-in privacy and accuracy options: a local model, and first-page reading for sorting | C4; validation §2.2 |
| FR15 | Permission zones (FREE / ASK / NEVER) that the user can edit | Criterion 6 (kept) |
| FR16 | Opt-in usage logs and a "Go Pro" fake door, so we can measure the pivot test without sitting with testers | Pivot test ([§6](#6-release-plan)) |
| FR17 | Show every action with its reason before anything runs; the user can uncheck any action, and nothing runs until they approve | Core hypothesis; validation §2.2 (7/10) |

### Non-functional

| ID | Requirement | Target | Source |
|---|---|---|---|
| NFR1 | Safety | 0 unrecoverable deletions. Source code, uncommitted work, Archives, Docker volumes, and VM disks are never deleted. | Unsafe-actions KPI; rebuild proof (validation §3.2) |
| NFR2 | Rebuild reliability | ≥95% of one-click rebuilds succeed | Pivot test KPI |
| NFR3 | Privacy | Only file names and metadata leave the laptop, never contents, unless the user opts in | C4 |
| NFR4 | Speed | Scan of home dev folders ≤60 s; validated plan ≤30 s median (today: 34 s) | Validation §2.1 (34 s), §2.2 (too slow, 2/10) |
| NFR5 | Honest numbers | Every "freed" number is the measured change on disk | C4 |

---

## 3. Personas

**P1 · Dev student (primary).** *"My laptop is 95% full and I know it's my projects. I just don't know which folders are safe to delete."*
- CS student with a 256–512 GB MacBook.
- 10–60 GB of rebuildable clutter across 20–30 class and hackathon projects, plus Docker, Xcode, or ML caches.
- Comfortable in a terminal, but doesn't want to learn five cleanup tools.
- Afraid of breaking a project the night before a deadline.
- Drawn from C1, C2, C3, C5.

**P2 · Careful engineer (secondary).** *"Show me the proof, not the promise."*
- Reads every line of a plan.
- Cares about privacy and false positives.
- Will recommend the app to others if it holds up, and will warn them off if it doesn't.
- Drawn from C4.

**P3 · Non-CS student (secondary).** *"Just tell me what it's going to do in one sentence."*
- Messy Downloads folder, five versions of every essay.
- Won't read a long plan.
- Trusts the app once it remembers their answers.
- Drawn from N5 and N3, who are both students.

**Not a target this release: family members who aren't students.** Their needs are finding a file, checking for scams, and Photos storage. Those belong to a different product (validation [§3.3](../validation/MVP_VALIDATION.md#33-why-this-is-sensible)), so they're in [§5](#5-wont-do-this-release).

---

## 4. User stories

Each story lists **Priority · Size · Status · Requirements · Evidence**.

### Epic A · See where my space went

#### US-01 · Storage breakdown before anything changes
`Must · 5 · New · FR5, NFR4, NFR5 · C1, C3; validation §2.1`

**As a** dev student whose laptop is almost full, **I want** to see where my space went, by type and by project, before anything changes, **so that** I know whether cleaning is worth it.

- **Given** I haven't approved anything, **when** I ask "where did my space go?", **then** I see measured totals for JavaScript packages, Python environments, Xcode build data, Docker, and ML model caches, plus my 10 largest projects, and no file is modified.
- **Given** about 50 projects under my home folder, **when** the scan runs, **then** it finishes within 60 seconds and shows progress.
- **Given** macOS blocks the app from reading a folder (Documents, Desktop), **when** the scan reaches it, **then** the app names the folder and says how to grant access, instead of silently skipping it.

#### US-02 · Label what's rebuildable and what isn't
`Must · 3 · New · FR5, FR6, NFR1 · Validation §3.2 (rebuild proof)`

**As a** dev student, **I want** every item labeled "rebuildable" (and how) or "not rebuildable" (and why), **so that** I can tell clutter apart from things I'd lose.

- **Given** a `node_modules` folder with a lockfile, **then** it's labeled "Rebuildable: `npm ci`, about 1 minute."
- **Given** Xcode Archives, a VM disk, or a Docker volume, **then** it's labeled "Not rebuildable" with a reason (for example, "crash reports need it" or "may hold a database"), and it never appears in a cleanup plan.
- **Given** an item the app doesn't recognize, **then** it's labeled "Unknown" and treated as not rebuildable.

### Epic B · Clean dev clutter safely

#### US-03 · Clean by saying what I'm done with
`Must · 8 · New · FR1, FR4, FR7 · C1; validation §3.2 example`

**As a** dev student, **I want** to say which classes or projects I'm done with in my own words, **so that** I don't have to hunt down each project folder myself.

- **Given** projects named `cs3140-hw1` through `cs3140-final` and `hoohacks-2026`, **when** I say "I'm done with CS 3140 and the hackathon," **then** the plan includes artifacts from only those projects, and every action names its project and reason.
- **Given** a request that could match projects in two ways, **when** the dino can't tell which I mean, **then** it asks a question with options instead of guessing.
- **Given** I name a project that changed in the last 30 days, **then** its artifacts show up unchecked, with a note that the project is still active.

#### US-04 · Protect the projects I care about, once
`Must · 3 · Change (extends DINO MEMORY) · FR4, FR7 · N5; validation §3.2 example`

**As a** dev student, **I want** to tell Cleanasaurus once which projects to always keep, **so that** it never offers to clean them again.

- **Given** I said "keep anything on my resume" and picked `capstone-team7` and `portfolio-site`, **when** I ask for any later cleanup, **then** those projects are skipped and listed as protected.
- **Given** a saved pattern like `capstone-*`, **when** a new matching project appears, **then** it's protected too.
- **Given** I remove a protected project from DINO MEMORY, **then** it can appear in plans again.

#### US-05 · Delete only what can be proven rebuildable
`Must · 8 · New · FR2, FR6, NFR1 · C1, C2, C5; validation §3.2`

**As a** dev student, **I want** Cleanasaurus to delete a folder only when it can prove I can rebuild it, **so that** freeing space never costs me work.

- **Given** a folder that is a known artifact type, is gitignored or inside a tool cache, has its lockfile or manifest present, contains no `.env` files or user data, and belongs to a project unchanged for 30 days, **when** the validator checks a plan that deletes it, **then** the action passes, and the app saves the lockfile's hash and the exact rebuild command.
- **Given** a project with uncommitted changes, **then** nothing in it is offered for deletion, and the dino says why.
- **Given** a folder where git tracks any file, or a folder with no lockfile or manifest, **when** the planner proposes deleting it, **then** the validator rejects the action and sends the reason back to the planner.

#### US-06 · JavaScript packages
`Must · 5 · New · FR6, NFR5 · C1; validation §2.1 (2 of 5 had it)`

**As a** dev student who builds web apps, **I want** unused `node_modules` folders and package-manager caches cleaned, **so that** I get back a common kind of dev clutter.

- **Given** `node_modules` next to `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`, **then** the recorded rebuild command is `npm ci`, `yarn install --frozen-lockfile`, or `pnpm install --frozen-lockfile`.
- **Given** a pnpm project, **then** the space shown is what deleting it actually frees, without double-counting files that are hard-linked to the shared store.
- **Given** the npm, Yarn, or pnpm cache, **then** clearing it is offered as one item with its measured size.

#### US-07 · Python environments
`Must · 5 · New · FR6 · Validation §2.1 (2 of 5 had it)`

**As a** dev student who does data science, **I want** old virtual environments and conda environments cleaned, **so that** I stop paying gigabytes for classes I've finished.

- **Given** a `.venv` whose project has `requirements.txt`, `uv.lock`, or `poetry.lock`, **then** it's offered with the matching rebuild command.
- **Given** a conda environment with no `environment.yml`, **then** before offering it, the app exports the environment into its own data folder and records that export as the rebuild recipe.
- **Given** an environment changed in the last 30 days, **then** it isn't offered unless I name it.

#### US-08 · Xcode build data and simulators
`Must · 5 · New · FR6, FR15 · C3`

**As a** dev student who builds iOS apps, **I want** build data for old projects and simulators I no longer use cleaned, **so that** I get back the tens of gigabytes Xcode hoards.

- **Given** DerivedData folders for projects that no longer exist or haven't been built in 30 days, **then** they're offered as rebuildable ("Xcode rebuilds it on the next build").
- **Given** simulator runtimes unused for 180 days, **then** they're offered with their size and a note that they re-download from Xcode Settings.
- **Given** any other folder in `~/Library`, including Xcode Archives, **then** it stays NEVER. Only these named Xcode folders are opened up.

#### US-09 · Docker images and build cache
`Must · 5 · New · FR6, NFR1, NFR5 · Validation §2.1 (3 of 5 had it)`

**As a** dev student who uses Docker, **I want** images that no container uses and old build cache removed, **so that** Docker Desktop stops eating 20 GB.

- **Given** images that no container (running or stopped) uses, **then** they're offered with their size and the note "re-downloads on the next pull."
- **Given** Docker volumes, **then** they're never offered.
- **Given** Docker isn't running, **then** the dino says so and skips Docker, instead of failing the whole plan.
- **Given** the change on disk is smaller than the space freed inside Docker, **then** both numbers are shown.

#### US-10 · ML model caches
`Must · 5 · New · FR6 · C2`

**As a** dev student who does ML, **I want** to see which downloaded models I haven't used lately and how long each would take to re-download, **so that** I can drop the big ones without worrying.

- **Given** Hugging Face or PyTorch cache entries, **then** each one shows the model name, size, last-used date, and estimated re-download time.
- **Given** a model unused for 30 days, **then** it's offered. A model used more recently is offered only if I name it.
- **Given** a model I trained or saved myself (anything outside the download cache), **then** it's never offered.

#### US-11 · Clear reasons when the validator says no
`Must · 3 · Change · FR2, FR3 · Validation §2.1 (validator caught 20 errors)`

**As a** careful engineer, **I want** to see exactly which safety check stopped an action, **so that** I can trust that the checks are real.

- **Given** the validator rejects an action, **then** the error goes back to the planner, up to 3 tries. *(Built)*
- **Given** it still fails after 3 tries, **then** only the safe part is shown and the dino asks. *(Built)*
- **Given** a rebuild-proof failure, **then** the Safety Log names which of the five conditions failed, for example "no lockfile in `hoohacks-2026`." *(New)*

### Epic C · Get it back, and count it honestly

#### US-12 · Show the real space freed
`Must · 3 · Change · FR8, NFR5 · C4`

**As a** careful engineer, **I want** the "freed" number to be the real change on my disk, **so that** I can believe what the app tells me.

- **Given** a plan has run, **then** FREED shows the measured change in free disk space, not the total size of the files touched.
- **Given** personal files went to the Trash, **then** FREED notes "frees up when you empty the Trash."
- **Given** the estimate and the measured change differ by more than 10%, **then** both are shown.

#### US-13 · Removed personal files go to the macOS Trash
`Should · 2 · Change · FR8 · Validation §2.1 (Dino Bin frees nothing)`

**As a** non-CS student, **I want** removed files to go to the normal Trash, **so that** I know where to look if I want one back.

- **Given** a duplicate is removed, **then** it appears in the Finder Trash under its original name.
- **Given** I undo the action, **then** the file returns to its original folder.
- **Given** a file is quarantined for malware, **then** it still goes to the app's quarantine folder, because quarantine means isolating a file, not throwing it away.

#### US-14 · Undo one action
`Must · 3 · Change · FR9 · C3, N3`

**As a** dev student, **I want** to undo a single action instead of the whole run, **so that** I can fix one mistake without losing the rest.

- **Given** a finished run, **then** each action has its own Undo, and "Undo all" is still there.
- **Given** I undo one action, **then** every other action stays done.
- **Given** I undo a move whose original folder has since been deleted, **then** the folder is recreated.

#### US-15 · One-click rebuild
`Must · 5 · New · FR9, NFR2 · Pivot test KPI (rebuilds ≥95%)`

**As a** dev student, **I want** one click to rebuild something Cleanasaurus deleted, using the exact command it recorded, **so that** undo still works when the files are truly gone.

- **Given** a deleted `node_modules`, **when** I click Rebuild, **then** the app runs the recorded command in that project and shows success or the error.
- **Given** the lockfile changed after the deletion, **then** the app warns that the rebuild will follow the new lockfile.
- **Given** a rebuild fails, **then** the app shows the command so I can run it myself, and records the failure (we track this against the 95% target).

### Epic D · Stay clean

#### US-16 · Storage watch
`Must · 5 · New · FR10 · C1; repeat-use KPI; validation §3.2`

**As a** dev student who forgets about cleanup until it's an emergency, **I want** a heads-up when my disk passes 85% full, with how much I could get back, **so that** I clean up before "Storage Almost Full."

- **Given** my disk passes 85% full, **then** I get one notification, such as "You're 87% full. I can get you about 18 GB back." It opens the plan preview and never runs anything on its own.
- **Given** I dismiss it, **then** it stays quiet until the disk fills another 5% or 7 days pass.
- **Given** I turn the watch off, **then** I get no notifications.

#### US-17 · End-of-semester sweep
`Could · 3 · New · FR7, FR10 · Validation §3.2 (end-of-semester sweep)`

**As a** dev student finishing a semester, **I want** the dino to offer to clean up that semester's class projects, **so that** old classes don't pile up year after year.

- **Given** the semester-end date I set has passed, **then** the dino offers a sweep of class projects unchanged for 30 days.
- **Given** I accept, **then** the sweep is an ordinary plan: nothing runs until I approve it.

### Epic E · Trust and clarity

#### US-18 · One-sentence summary above Approve
`Must · 2 · Change · FR13 · N2–N4`

**As a** non-CS student who won't read 40 lines, **I want** a one-sentence summary of what will change, right above Approve, **so that** I know what I'm agreeing to.

- **Given** any plan, **then** one sentence above Approve says what changes, such as "Delete 6 rebuildable folders (12 GB) and move 30 files into 4 folders. Nothing outside Downloads changes."
- **Given** the plan moves a file I opened in the last 24 hours, **then** the summary names it ("includes `final_essay.docx`, opened today").
- **Given** any plan text, **then** it uses plain words: "Trash," not "Dino Bin."

#### US-19 · Unsigned isn't malware
`Must · 2 · Change · FR11 · C4, N4`

**As a** careful engineer who builds my own apps, **I want** unsigned apps labeled "unknown" instead of quarantined, **so that** my own projects aren't treated like malware.

- **Given** an unsigned app with no other evidence, **then** it's shown as "Unknown: not signed by a verified developer," with no quarantine action.
- **Given** an unsigned app that also matches a malware signature or a pirated-software name, **then** quarantine is still proposed.
- **Given** a quarantine is proposed, **then** the reason is in plain words with a clear recommendation, for example "Likely unwanted software. Quarantine it."

#### US-20 · Keep even file names on my laptop
`Could · 8 · New · FR14, NFR3 · C4`

**As a** careful engineer, **I want** to run the planner on a local model, **so that** not even my file names leave my laptop.

- **Given** local mode is on, **then** the app makes no network request during scan, plan, or validation (checked by a test).
- **Given** local mode is on, **then** the validator and the rebuild proof work exactly the same.
- **Given** I turn local mode on, **then** the app says once that plans may be slower or less accurate.

#### US-21 · Opt-in usage logs and a "Go Pro" fake door
`Must · 3 · Change · FR16, NFR3 · Pivot test (§6)`

**As a** Cleanasaurus team member, **I want** opt-in logs of plans, approvals, undos, rebuilds, and "Go Pro" clicks, **so that** I can measure the pivot test without sitting next to testers.

*Status: the opt-in log, its first-launch prompt, the USAGE LOG panel, and EXPORT are already built for the MVP validation. Still to do: log rebuilds, and add the "Go Pro" fake door.*

- **Given** a tester opts in, **then** we log counts, sizes, categories, and timings, but never file names or paths.
- **Given** a tester clicks "Go Pro," **then** they see "Pro isn't available yet. Want us to email you when it is?" and the click is logged.
- **Given** a tester opts out at any time, **then** logging stops and their log file is deleted.

### Epic F · Personal files (secondary)

#### US-22 · One request for a huge folder
`Should · 3 · Change · FR12, NFR4 · The MVP's 400-file limit`

**As a** student with thousands of files in Downloads, **I want** one request to cover the whole folder, **so that** I don't have to ask seven times.

- **Given** 2,800 files, **when** I ask once, **then** the app plans in batches of 400 or fewer, validates each batch, and shows one combined plan.
- **Given** one batch still fails after 3 tries, **then** the other batches still show, and the dino asks about the one that failed.

#### US-23 · Sort by the first page (opt-in)
`Could · 5 · New · FR14, NFR3 · Validation §2.2 (sort by more than file names, 1/10)`

**As a** student whose lecture files have useless names, **I want** to let the app read the first page of a PDF to find its course code, **so that** "Lecture 7.pdf" lands in the right class.

- **Given** I haven't opted in, **then** only file names are used, as they are today.
- **Given** I opt in for PDFs in Downloads, **then** only the first page's text is read, and the reason shows what was found ("course code on page 1: CS 2150").
- **Given** no course code is found, **then** the file goes to Unsorted, or the dino asks.

#### US-30 · Empty the Trash, only after I confirm
`Should · 2 · New · NFR1 · Found while testing the Alpha (removed files sat in the Trash and freed nothing)`

**As a** student whose Trash holds gigabytes, **I want** the dino to permanently delete what's already in the Trash after I confirm, **so that** removed files actually free space, without the app ever permanently deleting anything else.

*Status: built (tests in `app/test/stories/us30-trash-delete.test.js` and the UI step "emptying the Trash…").*

- **Given** I ask to empty the Trash, **then** each item in the Trash is listed as PERMANENT, unchecked, with a warning that it can't be undone.
- **Given** a path outside the Trash (including `..` tricks, or the Trash folder itself), **then** the validator and the executor both refuse to delete it.
- **Given** I approve, **then** a separate confirmation must say yes before anything is deleted; Cancel deletes nothing.

### Epic G · Already built in the MVP

These work today, so they're size 0. They're part of Alpha, and any change we make has to keep them working.

#### US-24 · Ask in plain English and get a plan
`Must · 0 · Built · FR1 · 7/10 ran a plan`

**As a** non-CS student, **I want** to ask in plain English and get a concrete plan, **so that** I don't have to sort files myself.

- **Given** an API key, **when** I send a request, **then** Claude returns a plan in a fixed JSON format, and only file names and metadata leave my laptop.
- **Given** no API key, **then** the app shows DEMO, and an offline planner makes the plan.
- **Given** I ask "Free up space," **then** the plan removes only exact duplicates and keeps one copy of each.
- **Given** I ask "Sort my school files by class," **then** the plan moves lecture PDFs into a folder for each class.

#### US-25 · See every action before anything runs
`Must · 0 · Built · FR2, FR17 · 7 of 10 testers`

**As a** careful engineer, **I want** to see every action with its reason and uncheck any of them, **so that** I stay in control.

- **Given** a plan passes the validator, **then** every action is listed with its reason and a checkbox.
- **Given** I uncheck actions and press Approve, **then** the app re-checks the actions I kept and runs only those.
- **Given** I haven't pressed Approve, **then** no file changes.
- **Given** a newer plan exists, **then** the older plan can't be approved.

#### US-26 · Set folders to FREE, ASK, or NEVER
`Must · 0 · Built · FR15 · No tester was shown an action touching a NEVER zone (validation §2.1)`

**As a** dev student, **I want** to set folders to FREE, ASK, or NEVER, **so that** some places are always off-limits.

- **Given** a folder in a NEVER zone, **when** I ask for a plan, **then** the dino says why it won't touch the folder, shows no plan, and no file changes.
- **Given** a move, rename, or duplicate removal in an ASK zone, **then** it's marked ASK FIRST and starts unchecked.
- **Given** I press a zone button for the current folder, **then** the zone is saved and applies to the next plan.
- **Given** a folder inside a code project (git repo), **then** it's NEVER.

#### US-27 · Get asked instead of guessed at
`Must · 0 · Built · FR4 · C5, N5`

**As a** non-CS student, **I want** to be asked about anything unclear, and never asked the same thing twice, **so that** the app doesn't guess with my files or make me repeat myself.

- **Given** files that look like versions of each other, **then** the dino asks with options and leaves those files out of the plan.
- **Given** a plan includes a file over 1 GB, **then** the dino asks if I'm sure.
- **Given** I answer a question, **then** the answer is saved to DINO MEMORY, a new plan follows, and the same question isn't asked again.
- **Given** I remove an answer from DINO MEMORY, **then** the app no longer uses it.

#### US-28 · See the safety checks at work
`Must · 0 · Built · FR2, FR3 · The validator caught 20 errors, and no unsafe action reached a tester (validation §2.1)`

**As a** careful engineer, **I want** a Safety Log of every check, **so that** I can see the validator working.

- **Given** a try passes, **then** the log shows its number and PASS.
- **Given** a try fails, **then** the log shows how many errors it had and the first one, and the errors go back to the planner.
- **Given** a plan runs or is undone, **then** the log shows how many actions ran or steps were undone.
- **Given** a scan finishes, **then** the log names the malware engine it used.

#### US-29 · Malware checks come from real scanners
`Must · 0 · Built · FR11 · No tester was shown an unflagged file for quarantine (validation §2.1); C4's false flag led to US-19`

**As a** careful engineer, **I want** downloads checked for malware by real scanners, never by the AI's opinion, **so that** the LLM's guess can't quarantine a file or clear one.

- **Given** a scan, **then** only ClamAV (if installed) and the built-in checks can flag a file.
- **Given** a plan quarantines a file no scanner flagged, **then** the validator rejects that action.
- **Given** a file is flagged, **then** the dino names it after the scan, and a plan that leaves it in place adds a warning to the Safety Log.
- **Given** a file is quarantined, **then** Undo moves it back to its original folder.

---

## 5. Won't do this release

These came up in the sessions. We're saying no for now on purpose.

| Request | Who asked | Why not now |
|---|---|---|
| Find a downloaded form by asking | N1 | Family segment is deprioritized; this is a search product |
| Scam checks for email attachments | N4 | A different product; needs email access |
| Move old semesters to an external drive or cloud | N5 | Useful, but the pivot test doesn't need it. First in line for Release 2. |
| Delete games and apps I don't use | N3 | Uninstalling apps is a different safety problem |
| Auto-file new downloads | Two testers (validation §2.2) | Below our theme bar (2/10); revisit after the storage watch ships |
| Unity `Library/` folders | C5 | The smallest category we measured (18 GB); next after the five main ecosystems |
| Windows | No tester asked | macOS first, as planned |

---

## 6. Release plan

**Where we are (Nov 4):** the Alpha delivered Sprints 1–3 except US-04 (19 of 29 stories done; see [tdd/README.md](../tdd/README.md#3-every-github-issue-and-its-tests)). **Beta goal:** finish Sprint 4 and US-04, then run the pivot test: 20 CS students from outside our friend group, using the app unsupervised, measured against the KPIs in [§7](#pivot-test-kpi--stories-it-depends-on).

| Priority | Stories | Points |
|---|---|---|
| Already built (Alpha) | US-24–US-29 | 0 |
| Must (Alpha) | US-01–12, US-14–16, US-18, US-19, US-21 | 78 |
| Should | US-13, US-22 | 5 |
| Could | US-17, US-20, US-23 | 16 |
| **Total** | **29 stories** | **99** |

**Sprint plan.** This assumes the three of us finish about 20 points a week. That's a guess; after Sprint 1, we'll replace it with our real pace.

| Sprint | Stories | Points | Done means | Status |
|---|---|---|---|---|
| 1 · Foundation | US-01 breakdown, US-02 labels, US-05 rebuild proof, US-12 real freed | 19 | We can show a tester their clutter and prove what's safe | ✅ Alpha |
| 2 · First cleanups | US-06 JavaScript, US-07 Python, US-03 clean by intent, US-11 validator reasons | 21 | A tester can say "I'm done with CS 3140" and get real space back | ✅ Alpha |
| 3 · Get it back | US-15 rebuild, US-14 per-action undo, US-04 protect projects, US-18 summary, US-19 unsigned | 15 | Every deletion can be rebuilt, and every plan is readable in one sentence | ✅ Alpha, except US-04 |
| 4 · Coverage and test kit | US-08 Xcode, US-09 Docker, US-10 ML caches, US-16 storage watch, US-21 logs and fake door | 23 | All five ecosystems are covered, and the pivot test can run unsupervised | Beta |

**Beta schedule** *(proposed; team to confirm)*: week of Nov 9: US-04, record the Claude demo video, rerun the live Claude tests · Nov 16: US-08 Xcode, US-09 Docker · Nov 23: US-10 ML caches, US-16 storage watch · Nov 30: US-21 Go Pro and rebuild logging, recruit 20 testers, start the pivot test.

**Dependencies:** US-05 comes before US-06 to US-10 and US-15. US-01 comes before US-03. US-21 must be done before the test starts.

**Definition of done (every story):**
- Every acceptance criterion passes, as an automated test wherever possible. Every NEVER case in the rebuild proof has a test that proves it gets rejected.
- `npm test` and `npm run test:ui` pass.
- Demo mode still works offline.
- Any user-facing text uses plain words (US-18).

---

## 7. Traceability

### Requirement → stories

| Requirement | Stories |
|---|---|
| FR1 Plain English → plan | US-03, US-24 |
| FR2 Validator gate | US-05, US-11, US-25, US-28 |
| FR3 Self-correction loop | US-11, US-28 |
| FR4 Ask and remember | US-03, US-04, US-27 |
| FR5 Project-aware scan | US-01, US-02 |
| FR6 Rebuild proof | US-02, US-05, US-06, US-07, US-08, US-09, US-10 |
| FR7 Intent → projects | US-03, US-04, US-17 |
| FR8 Real space freed | US-12, US-13 |
| FR9 Per-action undo and rebuild | US-14, US-15 |
| FR10 Storage watch and sweeps | US-16, US-17 |
| FR11 Malware accuracy | US-19, US-29 |
| FR12 Large folders in batches | US-22 |
| FR13 One-sentence summary | US-18 |
| FR14 Privacy and accuracy options | US-20, US-23 |
| FR15 Permission zones | US-08, US-26 |
| FR16 Usage logs and fake door | US-21 |
| FR17 Preview and approve | US-25 |
| NFR1 Safety | US-02, US-05, US-09 |
| NFR2 Rebuild reliability | US-15 |
| NFR3 Privacy | US-20, US-21, US-23 |
| NFR4 Speed | US-01, US-22 |
| NFR5 Honest numbers | US-01, US-06, US-09, US-12 |

### Pivot test KPI → stories it depends on

| KPI | Target | Stories |
|---|---|---|
| Testers with ≥10 GB of rebuildable clutter | ≥70% | US-01, US-06–US-10 |
| Unsupervised first-session approval of a plan freeing ≥10 GB | ≥60% | US-02, US-03, US-05, US-18 |
| Real space freed (median) | ≥10 GB | US-06–US-10, US-12 |
| One-click rebuilds that work | ≥95% | US-15 |
| Repeat use within 30 days | ≥40% | US-04, US-16 |
| Unrecoverable deletions | 0 | US-02, US-05 |
| "Go Pro" fake-door clicks / pre-orders | ≥15% / ≥5% | US-21 |
