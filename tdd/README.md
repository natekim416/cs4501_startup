# Activity 3 · AI-Assisted Test-Driven Development

**Team:** Nate Kim, Nate Park, Wesley Chang · **Stories and issues:** [requirements/USER_STORIES.md](../requirements/USER_STORIES.md), GitHub issues #2–#30

> **Who wrote what.** Every test in this repo was drafted by Claude (Claude Code, Opus 5.5), working in our sessions. The reviews in §5 were also done by AI: Claude's own review pass, plus an independent AI review that played a critical grader. **No team member has hand-edited a test yet.** Our human review is scheduled in [TEAM_REVIEW.md](TEAM_REVIEW.md), and §4 will be updated with its results. We'd rather report 0% human-refined than claim review we haven't done.

## 1. Engineering metrics

| Metric | Value | How it's measured |
|---|---|---|
| User stories | **29** | [USER_STORIES.md](../requirements/USER_STORIES.md) §4 |
| GitHub issues logged vs. closed | **29 logged, 10 closed on GitHub**, plus **4 more built** on `alpha-review` (#4, #7, #8, #20) that close when it merges, so **14 of 29 done** | Closed: 6 already built in the MVP (#25–#30), 4 by Alpha work (#3, #6, #12, #13) |
| Automated tests | **121** unit and integration tests, plus a **14-step** end-to-end UI test | `npm test`, `npm run test:ui` |
| Average tests per issue | **4.2** overall (121 / 29). Every issue has **at least 2 tests mapped to it** in §3 | Shared files (`engine.test.js`, `minimal.test.js`) cover several built stories |
| Pass rate | **100% of runnable tests (81/81)**. Counting every test: **67% (81/121)**. The other 40 (33%) are written for stories not built yet and run as `todo`; CI fails if any of them starts passing (`npm run test:todos`) | [`05-green-run.txt`](05-green-run.txt) |
| Line coverage (`backend/` only) | **95.7%** lines, **90.5%** branches, 94.6% functions | `npm run test:coverage`, [`04-coverage.txt`](04-coverage.txt). Test files and scripts are excluded. The UI (renderer, main) is exercised by the end-to-end test but not measured |
| AI-generated vs. refined | **100% AI-generated** (121 tests + 14 UI steps). **14 changed or added because of AI review** (§5). **0 refined by a team member so far** | Commit history; §5 |

## 2. How we ran it, and what the history actually shows

1. **Tests before code.** For every open issue, Claude wrote tests from the story's acceptance criteria before any production code. Commit `c1c337d` contains only tests, one file per story in [`app/test/stories/`](../app/test/stories).
2. **Confirmed they fail.** The run is saved in [`01-red-run.txt`](01-red-run.txt).
   - For the six core stories, the failure was mostly the plain kind: "Cannot find module", because `backend/devclutter.js` didn't exist yet. Four of those files failed as a whole, so their 34 tests never failed on an individual assertion. Only US-11 and US-12 failed test by test.
   - That's weaker red evidence than one assertion per test, and we're saying so.
   - The later LLM tests (§2 step 5) failed on real assertions.
3. **Built the core until green.** We built the rebuild proof, labels, and JS and Python detection (`d2f885d`), then wired them into the validator, executor, engine, and planner (`454d384`). The first implementation took minutes, not days, because Claude wrote it.
4. **Tests for unbuilt stories stay red on purpose.** They run on every `npm test` and are marked `todo` with their issue number. An independent review found four of them that passed even though their story wasn't built. They tested the wrong thing, so we tightened them (§5).
5. **The Claude path got its own tests later.** The independent review found the LLM planner had 0% coverage. Tests LLM-1…6 use a fake Anthropic client and were committed before the code change (`3464586` red, then `c4c4aee` green). The red output in [`03-red-run-llm.txt`](03-red-run-llm.txt) was captured right after `3464586` but committed together with `c4c4aee`.
6. **CI.** [`.github/workflows/test.yml`](../.github/workflows/test.yml) runs `npm test` on every push. It was added after the first red commit, and our first push was the finished branch. So **GitHub only shows green runs**: the red steps live in the commit history and the saved run files, not on CI.

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

## 3. Every GitHub issue and its tests

| Issue | Story | Priority | Tests | Status |
|---|---|---|---|---|
| #2 | US-01 Storage breakdown | Must | `us01-storage-breakdown.test.js` (3) | 🔴 todo |
| #3 | US-02 Label rebuildable vs. not | Must | `us02-labels.test.js` (5) | 🟢 pass |
| #4 | US-03 Clean by intent | Must | `us03-clean-by-intent.test.js` (5), LLM-7, REG-3, REG-4 | 🟢 pass (on `alpha-review`) |
| #5 | US-04 Protect projects | Must | `us04-protect-projects.test.js` (3) | 🔴 todo |
| #6 | US-05 Rebuild proof | Must | `us05-rebuild-proof.test.js` (12) | 🟢 pass |
| #7 | US-06 JavaScript packages | Must | `us06-javascript.test.js` (7) | 🟢 pass; caches now offered in plans (on `alpha-review`) |
| #8 | US-07 Python environments | Must | `us07-python.test.js` (6) | 🟢 pass; conda export wired into plans (on `alpha-review`) |
| #9 | US-08 Xcode | Must | `us08-xcode.test.js` (3) | 🔴 todo |
| #10 | US-09 Docker | Must | `us09-docker.test.js` (4) | 🔴 todo |
| #11 | US-10 ML caches | Must | `us10-ml-caches.test.js` (3) | 🔴 todo |
| #12 | US-11 Validator reasons | Must | `us11-validator-reasons.test.js` (3), `llm-planner.test.js` LLM-2, LLM-3 | 🟢 pass |
| #13 | US-12 Real space freed | Must | `us12-real-freed.test.js` (4), UI step 5 | 🟢 pass |
| #14 | US-13 macOS Trash | Should | `us13-macos-trash.test.js` (2) | 🔴 todo |
| #15 | US-14 Undo one action | Must | `us14-undo-one.test.js` (3: 2 todo, 1 guard) | 🔴 todo |
| #16 | US-15 One-click rebuild | Must | `us15-rebuild.test.js` (3) | 🔴 todo |
| #17 | US-16 Storage watch | Must | `us16-storage-watch.test.js` (3) | 🔴 todo |
| #18 | US-17 Semester sweep | Could | `us17-semester-sweep.test.js` (2) | 🔴 todo |
| #19 | US-18 One-sentence summary | Must | `us18-summary.test.js` (3) | 🔴 todo |
| #20 | US-19 Unsigned isn't malware | Must | `us19-unsigned.test.js` (2) | 🟢 pass (on `alpha-review`) |
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
| — | Regressions | — | `regressions.test.js` REG-1…REG-4 | 🟢 pass |

## 4. What the core does now

- **Rebuild proof** ([`backend/devclutter.js`](../app/backend/devclutter.js)). A folder can be deleted only if all of these hold:
  - It's a known type (`node_modules`, a Python venv, a conda env).
  - git tracks nothing inside it, and it's gitignored.
  - A lockfile or requirements file exists. Its SHA-256 and the exact rebuild command are saved.
  - No `.env`, key, or certificate files are inside.
  - The project is unchanged for 30 days, or the user named it.
  - There's no uncommitted work.
- **Every failure names its condition**, for example "no lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) in hoohacks-2026". The reason goes back to the planner (Claude or the offline planner) and shows in the Safety Log.
- **Real space freed.** Proven folders are deleted, and FREED is the measured change in free disk space. Duplicates in the Dino Bin are reported as "frees up when you empty it."
- **Honest sizes.** Files hard-linked to pnpm's shared store don't count.
- **Demo.** `npm run dev-demo` builds old projects plus every case the proof must refuse. With no API key, the *offline* planner proposes everything labeled rebuildable, and the validator rejects 3 (uncommitted work, a project touched 4 days ago, a `.env` secret). With an API key, Claude chooses which projects match the request. That path is tested with a fake client (LLM-2), but we haven't recorded a live run yet.

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

**Known limits:**
- The secret check is cautious: a `node_modules` that ships test certificates (`.pem`) is refused.
- Measured FREED can be off if another app writes to the disk during a run. Tests use a fake disk.
- The tests need `git`. CI runs on macOS because the malware checks call `codesign` and `xattr`.
- No test calls the real Claude API. LLM tests use a fake client, so they prove our handling of Claude's output, not Claude's judgment.

## 6. Next stories, in sprint order

1. Merge `alpha-review` (closes #4, #7, #8, #20). Record a real Claude run of the demo request.
2. US-01 storage breakdown.
3. US-15 one-click rebuild and US-14 per-action undo.
4. US-18 summary.
5. US-08 Xcode, US-09 Docker, US-10 ML caches, US-16 storage watch, US-21 Go Pro.
