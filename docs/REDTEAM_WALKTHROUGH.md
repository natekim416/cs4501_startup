# Cleanasaurus · Red-Team Deep Dive (1 page)

**What it is:** a macOS desktop app (Electron) that cleans a CS student's laptop. You say what you want in plain English. **Claude proposes** a plan, **plain code proves** each action is safe, and **you approve** before anything runs. Branch `beta`. Run it with `cd app && npm run dev-demo`; test it with `npm test`.

## Core use cases (user stories → GitHub issues)
| Use case | Stories | Tested by |
|---|---|---|
| Free space from rebuildable build folders (`node_modules`, `.venv`, conda, Xcode DerivedData) | US-05 rebuild proof, US-06/07/08 | `us05` (12), `us06`, `us07`, `us08` (12) |
| Clean by intent ("I'm done with CS 3140, keep the final") | US-03, US-04 protect projects | `us03` (10), `us04` (14), live Claude tests (5) |
| Organize files, trash exact duplicates, quarantine scanner-flagged files | US-24–29 (MVP), US-13, US-19 | `engine`, `minimal`, `us13`, `us19` |
| Get things back: undo one or all, one-click rebuild | US-14, US-15 | `us14`, `us15`, `sec-state` |
| Empty the Trash, only after a separate confirmation | US-30 | `us30` (5), UI step |
| Honest numbers: real space freed, one-line summary | US-12, US-18 | `us12`, `us18` |
| **Not built yet:** Docker, ML caches, storage watch, sweep, local model, huge folders, first-page sort | US-09, 10, 16, 17, 20, 22, 23 | 22 `todo` tests kept red on purpose; CI fails if one passes |

## Architecture and core execution path
```
renderer (sandboxed page) ──IPC, checked sender──▶ main.js ──▶ engine.js
  scan:      scanner.js (files, SHA-256 duplicates) · devclutter.js (build folders + rebuild proof) · malware.js
  plan:      intent.js (which projects you named) → planner.js (Claude, or offline rules with no key)
  check:     validator.js: zones, ".." ban, symlink targets, duplicate proof, rebuild proof, scanner-only quarantine
  you:       APPROVE (ASK-zone and permanent actions start unchecked; the Trash needs a 2nd confirmation)
  run:       executor.js (re-checks paths) → undo log; FREED measured on disk
```
The API key stays in the main process (`.env`). Claude sees **file names and sizes only**, never contents.

## Tests: 188 total (166 pass, 0 fail, 22 todo) · 32-step click-through UI test · ~97% backend line coverage
- **Automated:** `npm test` (16 s; runs with a throwaway HOME), `npm run test:ui` (drives the real window), `npm run test:todos`. CI runs on every push.
- **Manual:**
  - `npm run test:live`: 5 requests to the real Claude, 5/5 (needs a key; run by Wesley, Nov 4–5).
  - The demo video.
  - Hand testing by Wesley, which found 3 bugs (REG-6, 7, 9), each now an automated test.
- **Edge cases are tested explicitly:**
  - `..` and symlink tricks, and `~/library` vs `~/Library`
  - a `.env` hidden in `node_modules`, an unreadable folder, a lockfile that is a folder
  - undo after Finder adds `.DS_Store`, undo when a newer file sits at the old spot
  - 1 GB files, and every answer option of every question

## The probe questions, answered
| Probe | Answer and evidence |
|---|---|
| **Malformed input** | Wrong-typed or missing fields, null actions, unknown ops, >500 actions, and `..` paths become validator errors that Claude must fix. Nothing crashes (`sec-input`, INPUT-2). |
| **LLM outage or throttling** | 90 s plan timeout; the SDK times out at 60 s with 1 retry; 429/5xx/network errors become plain sentences (INPUT-4). With no key, the offline planner works. |
| **State and rollback** | Every run is logged. Undo never overwrites a newer file, keeps steps it couldn't reverse and reports them, and removes the folders it made. Build folders come back with the saved rebuild command (`sec-state`, REG-7). |
| **Access control** | No accounts; the boundary is page → IPC → main. The page is sandboxed and can't navigate away or open windows, and every IPC call checks the sender. Rebuild runs only commands the app recorded itself (SEC-1, UI step 32). |
| **Leakage** | Errors shown to users carry no stack traces or raw API JSON. The opt-in usage log stores counts only, with no file names or paths (`usage-log.test.js`). |

## Most critical or fragile areas (where we'd point a red team)
1. **The validator and the rebuild proof:** the only thing between Claude and a real delete. 15 issues found by our internal red team (command injection through rebuild, `..`+symlink, case tricks, undo overwrites) are fixed and re-verified by re-running the original attacks.
2. **Claude's judgment:** proven only by 5 live tests (one run each); everything else uses a fake client.
3. **Known limits:**
   - macOS only.
   - ClamAV is optional, so without it malware checks are heuristic.
   - The window lockdown (F15) is verified by our own UI test, not independently.
   - The secret-file list is a denylist.
