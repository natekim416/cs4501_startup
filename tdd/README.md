# Activity 3 · AI-Assisted Test-Driven Development

**Team:** Nate Kim, Nate Park, Wesley Chang · **Stories and issues:** [requirements/USER_STORIES.md](../requirements/USER_STORIES.md), GitHub issues #2–#30

> **Who wrote what.** Every test in this repo was drafted by Claude (Claude Code, Opus 5.5), working in our sessions. The reviews in §5 were also done by AI: Claude's own review pass, plus an independent AI review that played a critical grader. **No team member has hand-edited a test yet.** Our human review is scheduled in [TEAM_REVIEW.md](TEAM_REVIEW.md), and §5 will be updated with its results. We'd rather report 0% human-refined than claim review we haven't done.

## 1. Engineering metrics

| Metric | Value | How it's measured |
|---|---|---|
| User stories | **30** (US-30, emptying the Trash, was added in the Beta; its GitHub issue is still to be filed) | [USER_STORIES.md](../requirements/USER_STORIES.md) §4 |
| GitHub issues logged vs. closed | **29 logged, 28 closed** after the Beta merge. #24 (US-23 first-page sorting) stays open as partial: the course-code logic is built and tested, but the app doesn't read PDFs yet | `gh issue list`; §3 |
| Automated tests | **230** unit and integration tests, plus a **35-step** end-to-end UI test, plus **13 live tests against the real Claude API** (`npm run test:live`, kept out of `npm test` because they need a key and cost API calls). Every Beta story's tests were switched on or written before its code, and every red-team and usability finding got a failing test before its fix | `npm test`, `npm run test:ui`, commit history |
| Average tests per issue | **7.7** per story (230 / 30). Every story has **at least 2 tests** | Shared files (`engine.test.js`, `minimal.test.js`) cover several built stories |
| Pass rate | **100% (230/230)**, with **0 todo** left: every story now has running tests. Live Claude tests: **11/13** on the Beta run ([`07-live-claude-run.txt`](07-live-claude-run.txt)); LIVE-8 passed on rerun (it failed during a laptop sleep), and LIVE-11 couldn't finish because the API account ran out of credit | [`05-green-run.txt`](05-green-run.txt), [`07-live-claude-run.txt`](07-live-claude-run.txt) |
| Line coverage (`backend/` only) | **97.5%** lines, **91.7%** branches, 96.3% functions | `npm run test:coverage`, [`04-coverage.txt`](04-coverage.txt). Test files and scripts are excluded; tests run with a throwaway HOME (`test/setup.js`) |
| AI-generated vs. refined | **All drafted by Claude.** Beyond the 25 tests changed after the Alpha review, the Beta added tests from three red-team rounds (SEC, STATE, INPUT, R3) and a usability pass playing a CS student (U, N); each finding failed first. **0 tests hand-edited by a team member so far** | Commit history; §5 |

## 2. How we ran it, and what the history actually shows

1. **Tests before code.** For every open issue, Claude wrote tests from the story's acceptance criteria before any production code. Commit `c1c337d` contains only tests, one file per story in [`app/test/stories/`](../app/test/stories).
2. **Confirmed they fail.** The run is saved in [`01-red-run.txt`](01-red-run.txt).
   - For the six core stories, the failure was mostly the plain kind: "Cannot find module", because `backend/devclutter.js` didn't exist yet. Four of those files failed as a whole, so their 34 tests never failed on an individual assertion. Only US-11 and US-12 failed test by test.
   - That's weaker red evidence than one assertion per test, and we're saying so.
   - The later LLM tests (§2 step 5) failed on real assertions.
3. **Built the core until green.** We built the rebuild proof, labels, and JS and Python detection (`d2f885d`), then wired them into the validator, executor, engine, and planner (`454d384`). The first implementation took minutes, not days, because Claude wrote it.
4. **Tests for unbuilt stories stay red on purpose.** They run on every `npm test` and are marked `todo` with their issue number. An independent review found four of them that passed even though their story wasn't built. They tested the wrong thing, so we tightened them (§5).
5. **The Claude path got its own tests later.** The independent review found the LLM planner had 0% coverage. Tests LLM-1…6 use a fake Anthropic client and were committed before the code change (`3464586` red, then `c4c4aee` green). The red output in [`03-red-run-llm.txt`](03-red-run-llm.txt) was captured right after `3464586` but committed together with `c4c4aee`.
6. **Live tests against the real Claude.** Every Claude-path test above uses a fake client, which proves how we handle Claude's output but not Claude's judgment. So we wrote five live tests (`app/test/live/`, commit `5932552`) from the demo's tricky requests *before* running any of them with a key. They skip without one. The first run, saved in [`06-live-claude-run.txt`](06-live-claude-run.txt), passed **5/5** with `claude-opus-5-5`, 5–16 s per plan:
   - **LIVE-1** "done with CS 3140 and the hackathon": only the two CS 3140 folders. Claude left `hoohacks-2026` out **on its own** and asked about it, because the snapshot says it has uncommitted changes.
   - **LIVE-2** "done with my machine learning class": `cs4774-ml`. The offline planner can't match this phrasing and asks which project. This is the clearest case of the LLM doing what a regex can't.
   - **LIVE-3** "I'm not done with CS 3140": nothing from CS 3140. On try 1 Claude proposed `cs2150-lab`, whose `node_modules` hides a `.env`; the **validator rejected it** ("Rebuild proof failed… contains .env"), the reason went back, and try 2 passed. That's the safety loop working on the real model.
   - **LIVE-4** "done with CS 3140, but keep the final project": `cs3140-hw1` only.
   - **LIVE-5** "done with the CS class": no deletions; Claude asked which class.

   Honest limits: there was no red phase (the tests passed on their first run), it's one run of a model whose output varies, and the tests aren't in CI because CI has no key.
7. **CI.** [`.github/workflows/test.yml`](../.github/workflows/test.yml) runs `npm test` on every push. It was added after the first red commit, and our first push was the finished branch. So **GitHub only shows green runs**: the red steps live in the commit history and the saved run files, not on CI.

| Commit | What it contains | Result |
|---|---|---|
| `c1c337d` | Tests for all 23 open issues, no production code | 🔴 6 core files fail (4 whole-file "module not found", US-11 and US-12 test by test), 46 todo |
| `d2f885d` | Rebuild proof, labels, JS and Python detection | 🟢 US-02, US-06, US-07 |
| `454d384` | Validator, real deletes, measured FREED | 🟢 US-05, US-11, US-12 |
| `86c2846` | CI workflow and `npm run dev-demo` | 🟢 |
| `14138e7` | REG-1 and REG-2 regression tests with a planner fix | 🟢 (test and fix in one commit, so red isn't shown) |
| `3464586` | LLM-1…6 tests, and four weak todo tests made able to fail | 🔴 6 LLM tests fail on assertions |
| `c4c4aee` | Planner accepts an injected client; coverage script | 🟢 69/69, 94.5% lines |
| `dab3cfb` → `659210e` | US-03 tests switched on and 2 added (red), then clean-by-intent | 🔴 5 fail → 🟢 |
| `91356d7` → `d02ed7a` | Plan-level tests for caches and conda (red), then the wiring; REG-3 added after its fix | 🔴 2 fail → 🟢 |
| US-19 commits | Tests switched on (red; one test bug fixed), then unsigned-is-unknown | 🔴 2 fail → 🟢 |
| LLM-7 commit → next | Claude's prompt gets course, age, and uncommitted status | 🔴 1 fail → 🟢 81/81 |
| US-13, US-18 | Todo tests switched on, then Trash and one-line summary | 🔴 5 fail → 🟢 |
| US-15 | Todo tests switched on, then one-click rebuild | 🔴 3 fail → 🟢 |
| US-14 | Todo tests switched on (red was "undoAction is not a function", a weak red), then per-action undo | 🔴 2 fail → 🟢 |
| US-01 | Todo tests switched on (red was "Cannot find module", a weak red) plus an engine-level test (real assertion), then the breakdown | 🔴 4 fail → 🟢 |
| `9f87272` → `53542fb` | "But keep …" and no-match questions | 🔴 2 fail → 🟢 |
| round-3 tests → `e365edc` | Negation, keep-first, exact answers, scan root (REG-5) | 🔴 3 fail → 🟢 101/101 |
| `5932552` | LIVE-1…5 against the real Claude, written before any live run | ⏭ skipped without a key → 🟢 5/5 with a key (no red phase) |
| FEAT-01 (#41) | Changing a zone from the zones panel: 6 tests in `test/feat01-change-zone.test.js` and 5 UI steps, written before any code ([`07-feat01-red-run.txt`](07-feat01-red-run.txt)), then `profile.changeZone`, the macOS-folder lock, and the picker ([`08-feat01-green-run.txt`](08-feat01-green-run.txt)) | 🔴 6 fail (3 on real checks; 3 on "changeZone is not a function", a weak red) and UI step 16 fails → 🟢 117/117 runnable, UI 20/20 |
| US-04 (#5), branch `us-04-protect-projects` from `beta` | The 3 todo tests switched on, 7 tests and 3 UI steps added, all before any code ([`09-us04-red-run.txt`](09-us04-red-run.txt)); then saved protections, "always keep" in chat, the project checklist, and the validator check ([`10-us04-green-run.txt`](10-us04-green-run.txt)). 4 more tests were added after the code to cover parts nothing tested; each was shown to fail with its code taken out (9 of 9 caught) | 🔴 10 fail (6 on real checks; 4 on "protect is not a function", a weak red) and UI step 16 fails → 🟢 125/125 runnable, UI 18/18 |
| US-08 (#9), branch `us-08-xcode-cleanup` from `beta` (after #42 and #43 merged) | The 3 todo tests switched on, 7 tests and 1 UI step added, all before any code ([`11-us08-red-run.txt`](11-us08-red-run.txt)); then `backend/ecosystems/xcode.js`, the validator opening only the exact Xcode items in `~/Library`, the `remove_simulator` action, and undo notes ([`12-us08-green-run.txt`](12-us08-green-run.txt)). A removal check first missed 3 guards, so 1 test and 2 stronger assertions were added after the code; it then caught 18/18. The simulator commands ran only against fake `simctl` output: this Mac has no Xcode | 🔴 11 fail (7 on real checks; 4 on "Cannot find module", a weak red) and UI step 24 fails → 🟢 143/143 runnable, UI 24/24 |
| REG-8, branch `fix-library-caches` from `beta` | Found while building US-08: the Yarn and pnpm caches live in `~/Library`, which is always NEVER, so the validator refused them before checking they were known caches. The US-06 tests used a home folder with no zones, so they missed it. One test in `regressions.test.js`, written before the fix ([`13-reg08-red-run.txt`](13-reg08-red-run.txt)); then known caches are matched by exact path before the zone check ([`14-reg08-green-run.txt`](14-reg08-green-run.txt)). A removal check caught 3/3 | 🔴 1 fail → 🟢 132/132 runnable, UI 23/23 |

## 3. Every GitHub issue and its tests

| Issue | Story | Priority | Tests | Status |
|---|---|---|---|---|
| #2 | US-01 Storage breakdown | Must | `us01-storage-breakdown.test.js` (5: 4 pass, 1 todo) | 🟡 partial: JS/Python totals, top projects, blocked folders work; Xcode/Docker/ML totals wait for US-08–10 |
| #3 | US-02 Label rebuildable vs. not | Must | `us02-labels.test.js` (5) | 🟢 pass |
| #4 | US-03 Clean by intent | Must | `us03-clean-by-intent.test.js` (10), LLM-7, REG-3, REG-4, REG-5 | 🟢 pass  |
| #5 | US-04 Protect projects | Must | `us04-protect-projects.test.js` (14), UI steps 21–23 | 🟢 pass (merged into `beta` in #43) |
| #6 | US-05 Rebuild proof | Must | `us05-rebuild-proof.test.js` (12) | 🟢 pass |
| #7 | US-06 JavaScript packages | Must | `us06-javascript.test.js` (7) | 🟢 pass; caches now offered in plans  |
| #8 | US-07 Python environments | Must | `us07-python.test.js` (6) | 🟢 pass; conda export wired into plans  |
| #9 | US-08 Xcode | Must | `us08-xcode.test.js` (12), UI step 24 | 🟢 pass (on `us-08-xcode-cleanup`, not merged yet; simulator removal not tried on a real Xcode) |
| #10 | US-09 Docker | Must | `us09-docker.test.js` (4) | 🔴 todo |
| #11 | US-10 ML caches | Must | `us10-ml-caches.test.js` (3) | 🔴 todo |
| #12 | US-11 Validator reasons | Must | `us11-validator-reasons.test.js` (3), `llm-planner.test.js` LLM-2, LLM-3 | 🟢 pass |
| #13 | US-12 Real space freed | Must | `us12-real-freed.test.js` (4), UI step 5 | 🟢 pass |
| #14 | US-13 macOS Trash | Should | `us13-macos-trash.test.js` (2) | 🟢 pass  |
| #15 | US-14 Undo one action | Must | `us14-undo-one.test.js` (3) | 🟢 pass  |
| #16 | US-15 One-click rebuild | Must | `us15-rebuild.test.js` (3) | 🟢 pass  |
| #17 | US-16 Storage watch | Must | `us16-storage-watch.test.js` (3) | 🔴 todo |
| #18 | US-17 Semester sweep | Could | `us17-semester-sweep.test.js` (2) | 🔴 todo |
| #19 | US-18 One-sentence summary | Must | `us18-summary.test.js` (3) | 🟢 pass  |
| #20 | US-19 Unsigned isn't malware | Must | `us19-unsigned.test.js` (2) | 🟢 pass  |
| #21 | US-20 Local model | Could | `us20-local-model.test.js` (2) | 🔴 todo |
| #22 | US-21 Logs and Go Pro | Must | `usage-log.test.js` (8, built part), `us21-logs-go-pro.test.js` (2) | 🟡 log built, rest todo |
| #23 | US-22 Huge folders | Should | `us22-huge-folder.test.js` (2) | 🔴 todo |
| #24 | US-23 First-page sorting | Could | `us23-first-page.test.js` (3) | 🔴 todo |
| #25 | US-24 Plain English → plan | Built | `llm-planner.test.js` LLM-1, 4, 5, 6; `engine.test.js`; MIN-1, MIN-2 | 🟢 pass |
| #26 | US-25 Preview and approve | Built | `engine.test.js` (newest plan only), MIN-6, UI steps 4–8 | 🟢 pass |
| #27 | US-26 Permission zones | Built | MIN-7, `engine.test.js` (NEVER refusal, home git repo), UI step 7 | 🟢 pass |
| #28 | US-27 Ask and remember | Built | MIN-8, `engine.test.js` (answers remembered), UI steps 8–9 | 🟢 pass |
| #29 | US-28 Safety checks visible | Built | `engine.test.js` (rejects unsafe plans, retries), LLM-2, LLM-3 | 🟢 pass |
| #30 | US-29 Malware from real scanners | Built | MIN-3, `engine.test.js` (flags test malware) | 🟢 pass |
| #41 | FEAT-01 Change a zone from the zones panel (a team feature, not a user story; extends US-26) | Feature | `feat01-change-zone.test.js` (6), UI steps 16–20 | 🟢 pass |
| — | Regressions | — | `regressions.test.js` REG-1…REG-5 | 🟢 pass |

## 4. What the core does now

- **Rebuild proof** ([`backend/devclutter.js`](../app/backend/devclutter.js)). A folder can be deleted only if all of these hold:
  - It's a known type (`node_modules`, a Python venv, a conda env).
  - git tracks nothing inside it, and it's gitignored.
  - A lockfile or requirements file exists. Its SHA-256 and the exact rebuild command are saved.
  - No `.env`, key, or certificate files are inside.
  - The project is unchanged for 30 days, or the user named it.
  - There's no uncommitted work.
- **Every failure names its condition**, for example "no lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) in hoohacks-2026". The reason goes back to the planner (Claude or the offline planner) and shows in the Safety Log.
- **Real space freed.** Proven folders are deleted, and FREED is the measured change in free disk space. Duplicates go to the macOS Trash and are reported as "frees up when you empty it."
- **Honest sizes.** Files hard-linked to pnpm's shared store don't count.
- **Demo.** `npm run dev-demo` builds 8 projects plus every case the proof must refuse. The scripted request "I'm done with CS 3140 and the hackathon. Free up space." targets only the CS 3140 and hackathon projects. The validator rejects `hoohacks-2026` for uncommitted work, and try 2 passes with the two CS 3140 folders. The other courses, the `.env` secret, and the VM are never proposed. With an API key, Claude makes the same choice from the request. That path is tested with a simulated client (LLM-2, LLM-7); a live run hasn't been recorded yet.

## 5. Review log: what changed in the AI-generated tests

| # | Finding | Found by | Type | What changed |
|---|---|---|---|---|
| 1 | A git repo at the home folder (Wesley has one) would make every project look "not gitignored" | Claude, while reviewing its own tests | Missing edge case | Added a US-05 test before the proof was written (committed together with it in `d2f885d`) |
| 2 | US-11 expected one failure, but deleting `package.json` in a committed repo also leaves uncommitted changes | The test run | Wrong assumption | The test looks for the `recipe` failure among all failures |
| 3 | MIN-1 and UI step 5 expected FREED to grow after removing duplicates | A requirement change (US-12) | Outdated test | They check the estimate and the "frees up when you empty it" note |
| 4 | A real bug: identical source files in two code projects were offered as duplicates, rejected, and re-offered for all 3 tries | The US-11 engine test failing | **Bug** | Planner fixed in `454d384`; a regression test (REG-1) was added afterward in `14138e7` |
| 5 | A real bug: "6 different versions of index.js" | A screenshot | **Bug** | REG-2 written and the fix made in `14138e7` (same commit) |
| 6 | US-08 Archives, US-13 quarantine, and US-03 ambiguity passed while their stories weren't built | Independent AI review | Tests that couldn't fail | Each now asserts the actual criterion |
| 7 | US-14 "Undo all" passes because it already works | Independent AI review | Mislabeled | Changed from todo to a guard test |
| 8 | The Claude planner path had 0% coverage | Independent AI review | Missing tests | Added LLM-1…6 with a fake client, red first |
| 9 | US-19's tests pointed at the app's `Contents` folder, not the `.app` | The test run | Test bug | Fixed the path |
| 10 | Approving a named, still-active project failed the run-time re-check | Found while wiring #7/#8 | **Bug** (REG-3) | Fixed first, test written after (says so in its name) |
| 11 | The demo request ("done with CS 3140…") also deleted an unnamed course (`cs4774`) | Independent AI review, round 1 | **Bug** | Fixed by US-03; REG-4 guards the exact demo request |
| 12 | Claude wasn't told a project's course, age, or uncommitted status | Independent AI review, round 1 | Missing context | LLM-7 red, then the prompt adds them |
| 13 | "Done with CS 3140 but keep the final" still deleted the final; "the robot project" returned an empty plan | Independent AI review, round 2 | Missing edge cases | Two US-03 tests red, then keep-clauses and a "which projects?" question |
| 14 | A plain request with "but keep my capstone" | Same review | Missing edge case | **Code first, test right after** (US-03 last test); disclosed |
| 15 | Unused `const TODO` lines | Same review | Dead code in tests | Removed 2 in round 3, but **5 more were missed** and our log wrongly said all were gone; the round-3 review caught it, and all 7 are now removed |
| 16 | "I'm not done with CS 3140", "still need the final", "Keep X, I'm done with the rest", and "before I leave for break" were misread | Independent AI review, round 3 | **Bugs** | Test red, then clause splitting, negation, and exact names win over course codes |
| 17 | Answering "Which projects?" with one project also planned its sibling | Same review | **Bug** | Test red, then the answer names exactly that project |
| 18 | The scanned folder itself was offered as a project | Same review | **Bug** (REG-5) | Test red, then excluded |
| 19 | US-01's Xcode/Docker/ML keys were asserted to exist but couldn't fail | Same review | Test that couldn't fail | New todo test that needs real totals; US-01 marked partial |

**Known limits:**
- The secret check is cautious: a `node_modules` that ships test certificates (`.pem`) is refused.
- Measured FREED can be off if another app writes to the disk during a run. Tests use a fake disk.
- The tests need `git`. CI runs on macOS because the malware checks call `codesign` and `xattr`.
- Only 5 tests call the real Claude API, and they've run once (5/5). The model's output varies between runs, so a pass is evidence, not a guarantee. They aren't in CI, because CI has no API key.

## 6. Next stories, in sprint order

1. Record the demo on Claude as the backup video, and rerun `npm run test:live` before class (5/5 on Nov 4). (`alpha-review` was merged in #32; #2 was reopened because US-01 is partial.)
2. ~~US-04 protect projects.~~ Built on `us-04-protect-projects` (from `beta`) and merged into `beta` in #43; see §2.
3. ~~US-08 Xcode~~ (built on `us-08-xcode-cleanup`; see §2), US-09 Docker, US-10 ML caches (which also completes US-01), US-16 storage watch, US-21 Go Pro.
