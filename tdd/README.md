# Activity 3 · AI-Assisted Test-Driven Development

**Team:** Nate Kim, Nate Park, Wesley Chang · **Branch:** `alpha-dev` · **Stories and issues:** [requirements/USER_STORIES.md](../requirements/USER_STORIES.md), GitHub issues #2–#30

## 1. How we ran it

1. **Tests first.** For every open GitHub issue we wrote tests from the story's acceptance criteria before any production code. Claude generated the first drafts, and we inspected and refined them (see the [review log](#4-review-log-what-we-changed-in-the-ai-generated-tests)). All story tests live in [`app/test/stories/`](../app/test/stories), one file per issue, named `usNN-*.test.js`.
2. **Confirm they fail.** We committed the tests on their own and ran them. The run is saved in [`01-red-run.txt`](01-red-run.txt).
3. **Build the Alpha core until green.** We built the stories the pivot depends on (rebuild proof, labels, JavaScript and Python cleanup, honest space freed, validator reasons) one at a time, rerunning the suite after each. The final run is saved in [`02-green-run.txt`](02-green-run.txt).
4. **Everything else stays red, on purpose.** Tests for stories we haven't built yet run on every `npm test` and are marked `todo` with their issue number, so they're visible but don't block the build. When someone starts one of those stories, they remove `todo`, watch it fail, then build it.
5. **CI.** [`.github/workflows/test.yml`](../.github/workflows/test.yml) runs `npm test` on every push, so each red and green step is recorded on GitHub.

### The commits, in order

| Commit | What it shows | Result |
|---|---|---|
| `c1c337d` | Tests for every open issue, **no code** | 🔴 11 failing (core stories), 46 todo, 25 existing pass |
| `d2f885d` | Rebuild proof, labels, JS and Python detection, plus one edge-case test added during review | 🟢 US-02, US-06, US-07 pass |
| `454d384` | Validator, executor, engine, and planner use the proof; FREED is measured on disk | 🟢 US-05, US-11, US-12 pass; tests caught bug REG-1 |
| `86c2846` | CI workflow and a dev-clutter demo folder (`npm run dev-demo`) | 🟢 |
| `14138e7` | Regression REG-2 (found in a screenshot), test written first | 🔴 → 🟢 |
| `607919a` | Wording: build folders are rebuilt, not undone | 🟢 UI test 14/14 |

### Totals

| | Before (`c1c337d`) | After (`607919a`) |
|---|---|---|
| Backend tests passing | 25 | **62** |
| Failing | 11 | **0** |
| Todo (written, story not built yet) | 46 | 46 |
| UI end-to-end test (clicks the real app) | 14 steps | **14/14 pass** |

Run them: `cd app && npm test` and `npm run test:ui`.

## 2. Every GitHub issue and its tests

| Issue | Story | Priority | Tests | Status |
|---|---|---|---|---|
| #2 | US-01 Storage breakdown | Must | `us01-storage-breakdown.test.js` (3) | 🔴 todo |
| #3 | US-02 Label rebuildable vs. not | Must | `us02-labels.test.js` (5) | 🟢 pass |
| #4 | US-03 Clean by intent | Must | `us03-clean-by-intent.test.js` (3) | 🔴 todo |
| #5 | US-04 Protect projects | Must | `us04-protect-projects.test.js` (3) | 🔴 todo |
| #6 | US-05 Rebuild proof | Must | `us05-rebuild-proof.test.js` (12) | 🟢 pass |
| #7 | US-06 JavaScript packages | Must | `us06-javascript.test.js` (6) | 🟢 pass* |
| #8 | US-07 Python environments | Must | `us07-python.test.js` (5) | 🟢 pass* |
| #9 | US-08 Xcode | Must | `us08-xcode.test.js` (3) | 🔴 todo |
| #10 | US-09 Docker | Must | `us09-docker.test.js` (4) | 🔴 todo |
| #11 | US-10 ML caches | Must | `us10-ml-caches.test.js` (3) | 🔴 todo |
| #12 | US-11 Validator reasons | Must | `us11-validator-reasons.test.js` (3) | 🟢 pass |
| #13 | US-12 Real space freed | Must | `us12-real-freed.test.js` (4), UI step 5 | 🟢 pass |
| #14 | US-13 macOS Trash | Should | `us13-macos-trash.test.js` (2) | 🔴 todo |
| #15 | US-14 Undo one action | Must | `us14-undo-one.test.js` (3) | 🔴 todo |
| #16 | US-15 One-click rebuild | Must | `us15-rebuild.test.js` (3) | 🔴 todo |
| #17 | US-16 Storage watch | Must | `us16-storage-watch.test.js` (3) | 🔴 todo |
| #18 | US-17 Semester sweep | Could | `us17-semester-sweep.test.js` (2) | 🔴 todo |
| #19 | US-18 One-sentence summary | Must | `us18-summary.test.js` (3) | 🔴 todo |
| #20 | US-19 Unsigned isn't malware | Must | `us19-unsigned.test.js` (2) | 🔴 todo |
| #21 | US-20 Local model | Could | `us20-local-model.test.js` (2) | 🔴 todo |
| #22 | US-21 Logs and Go Pro | Must | `usage-log.test.js` (8, built part), `us21-logs-go-pro.test.js` (2) | 🟡 log built, rest todo |
| #23 | US-22 Huge folders | Should | `us22-huge-folder.test.js` (2) | 🔴 todo |
| #24 | US-23 First-page sorting | Could | `us23-first-page.test.js` (3) | 🔴 todo |
| #25 | US-24 Plain English → plan | Built | `engine.test.js` (demo plan), `minimal.test.js` MIN-1, MIN-2 | 🟢 pass |
| #26 | US-25 Preview and approve | Built | `engine.test.js` (newest plan only), MIN-6, UI steps 4–8 | 🟢 pass |
| #27 | US-26 Permission zones | Built | MIN-7, `engine.test.js` (NEVER refusal, home git repo), UI step 7 | 🟢 pass |
| #28 | US-27 Ask and remember | Built | MIN-8, `engine.test.js` (answers remembered), UI steps 8–9 | 🟢 pass |
| #29 | US-28 Safety checks visible | Built | `engine.test.js` (rejects unsafe plans, retries) | 🟢 pass |
| #30 | US-29 Malware from real scanners | Built | MIN-3, `engine.test.js` (flags test malware) | 🟢 pass |
| — | Regressions | — | `regressions.test.js` REG-1, REG-2 | 🟢 pass |

\* The acceptance criteria pass at the unit level. Two pieces are built but not yet wired into plans: package-manager caches (US-06) and the conda export (US-07). They're listed as the next step in §5.

## 3. What the core does now (the green part)

- **Rebuild proof** ([`backend/devclutter.js`](../app/backend/devclutter.js)): a folder can be deleted only if every check passes:
  - Known type (`node_modules`, a Python venv, a conda env).
  - Not source: git tracks nothing inside it, and it's gitignored.
  - A lockfile or requirements file exists. Its SHA-256 hash and the exact rebuild command are saved.
  - No `.env`, key, or certificate files inside.
  - The project is unchanged for 30 days, or the user named it.
  - No uncommitted work.
- **Every failure names its condition**, for example "no lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) in hoohacks-2026". The reason goes back to the planner and shows in the Safety Log.
- **Real space freed**: proven folders are really deleted, and FREED is the measured change in free disk space. Duplicates in the Dino Bin are reported as "frees up when you empty it", which fixes the "12.4 GB reported, 0 bytes freed" finding from validation.
- **Honest sizes**: files hard-linked to pnpm's shared store aren't counted as freed.
- **Demo:** `npm run dev-demo` builds old projects plus every case the proof must refuse. On it, the planner proposes 6 folders, the validator rejects 3 (uncommitted work, a project touched 4 days ago, a `.env` secret), and the retry passes with 3 deletions that free about 150 MB measured on disk.

## 4. Review log: what we changed in the AI-generated tests

Claude drafted the tests from each story's acceptance criteria. Before writing code, we checked each file against three questions: does it test the criterion and not the implementation, does it cover the NEVER cases, and does it miss an edge case?

| # | Finding | Type | What we did |
|---|---|---|---|
| 1 | One of us (Wesley) has a git repo at the home folder (dotfiles). A naive proof would call every project "not gitignored." | Missing edge case | Added a US-05 test **before** writing the proof; the proof ignores a repo at home or above, like the zones already do |
| 2 | Generated tests only had the happy path for `node_modules` | Missing edge cases | Added: no lockfile → not rebuildable; nested `node_modules` listed once; a file hard-linked twice counted once; a venv not named `.venv`; the project folder itself as a target; NEVER zone still blocks |
| 3 | US-11 test expected exactly one failure, but deleting `package.json` in a committed repo also leaves uncommitted changes | Wrong test assumption | Test now looks for the `recipe` failure among all failures and also expects `clean_worktree` |
| 4 | MIN-1 and UI step 5 asserted that FREED grows after removing duplicates | Requirement changed | US-12 makes FREED the measured disk change, and the Dino Bin is on the same disk. Updated both to check the estimate and the "frees up when you empty it" note |
| 5 | US-11's engine test kept failing all 3 tries | **Real bug the tests found** (REG-1) | Identical source files in two code projects were offered as duplicates, rejected, and re-offered. The planner now skips NEVER zones and drops anything the validator rejected |
| 6 | A screenshot showed "6 different versions of index.js" | **Real bug** (REG-2) | Wrote REG-2 first (failed), then fixed it: source files in code projects never trigger a "versions" question |
| 7 | The todo test "US-03 ambiguous request asks" already passes by accident (the demo planner proposes nothing) | Weak test | Left as todo; it doesn't count as done until US-03 is built. Whoever builds US-03 should tighten it |

**Known limits of the current tests:**
- The secret check is cautious: a `node_modules` that ships test certificates (`.pem`) will be refused. That's the safe direction, but it may hide real space.
- The measured FREED can be off if another app writes to the disk during a run. Tests use a fake disk to stay deterministic.
- The tests need `git`, and CI runs on macOS because the malware checks call `codesign` and `xattr`.
- The LLM path is covered by the same validator, but these tests run the offline planner, not Claude.

## 5. Next stories, in sprint order

1. Wire package caches (US-06) and the conda export (US-07) into plans.
2. US-01 storage breakdown, then US-03 clean by intent (needs US-01).
3. US-15 one-click rebuild and US-14 per-action undo.
4. US-18 summary and US-19 unsigned-is-unknown (small).
5. US-08 Xcode, US-09 Docker, US-10 ML caches, US-16 storage watch, US-21 Go Pro.
