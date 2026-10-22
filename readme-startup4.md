# Startup Idea 4: Gemini 2 → A Duplicate Cleaner That Understands Your Files

**Reference company:** [Gemini 2](https://macpaw.com/gemini) by MacPaw (Kyiv, Ukraine)
**What it does today:** a Mac duplicate finder that scans folders for identical and similar files (photos, music, documents) and lets you remove them in bulk.
**Our product:** a better version of Gemini 2 that understands *versions* and near-duplicates, explains which copy to keep and why, and frees space through a plain-English chat.
**Team:** Nate Kim, Nate Park, Wesley Chang
**Category:** AI · Storage · Desktop Utilities

---

## Overview

Duplicate finders are good at finding identical bytes, but they hand you **a list of thousands of matches and ask you to decide**. The hard cases are the ones that matter:
- `Resume.pdf`, `Resume (1).pdf`, `Resume_FINAL.pdf`, `Resume_FINAL_v2.pdf`: which one is current?
- The same song as `.wav` and `.mp3`, or the same photo edited and unedited.
- A project folder copied to three places, with slightly different files in each.

Our version answers those questions. You say *"Free up 20 GB, but keep the latest version of anything I've edited,"* and it builds a plan that explains each decision.

---

## How It Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: duplicate files waste storage, and cleaning them up is a risky, manual review job.** We make it a single, safe conversation.

### 2. You know the target customers or have direct access to them
Students with 256 GB laptops, and friends who do music, video, and photography (large media files with many copies). We have direct access through UVA classes and clubs.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Desktop app | Tauri or Electron + React | Learnable quickly |
| Exact duplicates | Size pre-filter + SHA-256 hashing | Familiar |
| Near-duplicates | Perceptual image hashes, text diffing, audio fingerprints | Learnable quickly |
| Malware | ClamAV scan on files being kept | Learnable quickly |
| LLM | Claude API structured output | Familiar |

### 4. Reimagines the problem space to make it significantly better
Gemini 2 asks *"Which of these do you want to delete?"* Our version says *"Here's what I'd keep and why, and it frees 18 GB."* It groups files by **meaning** (versions of the same document, exports of the same project), not just matching bytes. It also learns from your choices (e.g., you always keep the newest edited version), so later cleanups need less review.

### 5. An LLM/Generative model is core to the solution
The LLM reads file names, dates, sizes, and diff summaries for each duplicate group and decides which copy is the **keeper**, with a reason:
```json
{"group": "Resume", "keep": "Resume_FINAL_v2.pdf",
 "trash": ["Resume.pdf", "Resume (1).pdf"],
 "keep_also": ["Resume_FINAL.pdf"],
 "reason": "v2 is newest and contains all edits; FINAL differs in content, so keep it, as the user hasn't confirmed it's obsolete"}
```

### 6. Validation Guardrail
Every cleanup plan passes a validator before the user sees it:
1. **Exact-duplicate proof:** a file may be auto-trashed only if its SHA-256 hash matches a kept file.
2. **Near-duplicate rule:** files with *different* content can never be auto-trashed. They're downgraded to "ask the user."
3. **Keeper exists:** every group must keep at least one copy, and the keeper must exist and be readable.
4. **Permission zones:** nothing inside 🔴 zones (system folders, git repos, app libraries).
5. **Space math:** the claimed space savings must match the real sum of file sizes.

### 7. Self-Correction Loop
Errors go back to the LLM automatically, e.g. "group 'Resume': you marked `Resume_FINAL.pdf` for deletion but its hash differs from the keeper. Move it to `keep_also` or ask the user." The corrected plan is re-validated, up to 3 retries. If a group stays ambiguous, the app **asks the user a short question** and remembers the answer as a preference.

### 8. Deployability
Signed macOS app with auto-updates, distributed from our website. Hashing and comparisons run locally; only metadata summaries go to the LLM. A small proxy backend handles API keys.

---

## Architecture Sketch
```
"Free up 20 GB, keep latest versions"
          │
          ▼
 Local scan: hashes · perceptual hashes · diffs ──► duplicate groups
          │
          ▼
  LLM picks keepers + reasons ──► cleanup plan
          ▲                           │
          │                           ▼
   errors (≤3) ◄── fail ── Validator (hash proof · keeper exists · zones · space math)
          │                           │ pass
   ambiguous? ask user                ▼
                     "Frees 18.4 GB, 3 groups need your input" ──► approve ──► trash (undoable)
```
