# Team review of the AI-generated tests

Every test in this repo was written by Claude. The assignment asks **us** to inspect, refine, and make sure they're complete, correct, and edge-case aware. Each of us takes the stories closest to our part of the app, reads every test against its acceptance criteria in [USER_STORIES.md](../requirements/USER_STORIES.md), and makes at least one real change: a missing edge case, a wrong assumption, or an assertion that's too weak.

**For each test file, ask:**
1. Does every acceptance criterion in the story have a test? Which one is missing?
2. Can each test actually fail? Break the code on purpose (for example, delete a check in `devclutter.js`) and confirm a test goes red.
3. What edge case would a real student's laptop hit that this test doesn't? (Symlinks, huge folders, a lockfile with no `package.json`, a project with no git, a monorepo.)
4. Is the test checking behavior, or just copying the implementation?

**Assignments** (make your change, commit it under your own name, and log it below):

| Reviewer | Files | Why |
|---|---|---|
| Nate Kim (back end) | `us05-rebuild-proof`, `us11-validator-reasons`, `llm-planner`, `us07-python` | Engine, validator, planner owner |
| Nate Park | `us02-labels`, `us06-javascript`, `us12-real-freed`, `regressions` | Labels, sizes, what the user sees |
| Wesley Chang | `us03-clean-by-intent`, `us04-protect-projects`, `us18-summary`, `us14-undo-one`, `ui-smoke` | Front end and the next stories to build |

After each change, run `cd app && npm test` and make sure it still passes.

## Log

| Date | Reviewer | File | What was wrong or missing | What we changed | Commit |
|---|---|---|---|---|---|
| | | | | | |

When this log has entries, update the "AI-generated vs. refined" row in [README.md](README.md) §1 and on the metrics slide.
