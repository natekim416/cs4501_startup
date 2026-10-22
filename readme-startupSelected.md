# Startup Idea 1: CleanMyMac → Cleanasaurus — Your Files, Cleaned Up by Conversation

**Reference company:** [CleanMyMac](https://macpaw.com/cleanmymac) by MacPaw (Kyiv, Ukraine)
**What it does today:** Mac cleanup, storage tools, duplicate and large-file finder ("My Clutter"), and malware removal powered by MacPaw's Moonlock engine.
**Our product:** Cleanasaurus, a better version of CleanMyMac rebuilt around plain-English requests, a learned user profile, and validated plans.
**Team:** Nate Kim, Nate Park, Wesley Chang
**Mascot:** an 8-bit, arcade-style T-rex in a maid costume, armed with a feather duster
**Category:** AI · Productivity · Desktop Utilities · Storage & Security

---

## Overview

Cleanasaurus is a **downloadable desktop app that runs locally** and manages your files through a simple chat interface. You tell it what you want in plain English:

> "My laptop is almost full. Delete duplicate files in Downloads, put my school PDFs into folders by class, and check anything I downloaded this month for malware."

Cleanasaurus turns that request into a **concrete plan**: create these folders, move these files, delete these exact duplicates, quarantine this suspicious installer. It shows the plan before anything changes, then carries it out safely.

Core capabilities:
- **Plain-English file control:** create, rename, move, and reorganize files and directories.
- **Duplicate & storage cleanup:** finds byte-identical duplicates (by hash) and large forgotten files, and shows how much space each action frees.
- **Malware checks:** scans files with real signature engines (ClamAV/YARA) and hash reputation, then explains the results in plain English.
- **Personalized profile:** learns how *you* like things stored (naming style, folder structure, what you usually download, and where it should go), so it can organize new files automatically.
- **Human in the loop:** you decide which folders it may touch freely, which need approval, and which it must never touch.

---

## How Cleanasaurus Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: people's computers are full and disorganized, and cleaning them up is so tedious and risky that nobody does it.**
Downloads folders hold thousands of files, the same PDF exists five times, and "Storage Almost Full" warnings keep coming back. People also download files without knowing whether they're safe. Cleanasaurus does one job: **get your computer clean, organized, and safe, and keep it that way, with one conversation.**

### 2. You know the target customers or have direct access to them
The target user is **anyone with storage or organization problems on their computer**, starting with students. We have direct access to:
- **Friends and classmates at UVA:** MacBooks with 256 GB drives, Downloads folders full of lecture slides and assignment files.
- **Club members** (music, diabolo, CS organizations) whose work creates large media files.
- **Family members** who are less technical, are most at risk from malware, and are least able to clean up a computer themselves.
- **Ourselves:** all three of us have this problem.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Desktop app | Tauri or Electron + React | Learnable quickly (web stack) |
| File operations | Node/Rust file system APIs, file watchers, OS trash | Familiar |
| Duplicate detection | SHA-256 hashing, size pre-filtering | Familiar |
| Malware scanning | ClamAV, YARA rules, hash reputation lookups | Learnable quickly |
| User profile | Local SQLite store of preferences and past decisions | Familiar |
| LLM | Claude API with tool use / structured output (optional local model via Ollama) | Familiar |
| Distribution | Code-signed installers with auto-update | Learnable quickly |

### 4. Reimagines the problem space to make it significantly better
**Why CleanMyMac falls short:** it already cleans junk, finds duplicates, and removes malware, but only through **fixed categories and buttons**. It can't *organize* your files, can't understand a request like "sort my school files by class," and doesn't learn how you like things stored. Cleanasaurus keeps what CleanMyMac does well and fixes those gaps.

Today's options make **you** do the work:
- **Finder / File Explorer:** manual dragging, one folder at a time.
- **CleanMyMac / CCleaner:** fixed categories ("system junk"); you can't say *what you want*.
- **Sparkle (Every):** AI organizing, but cloud-processed, no malware checks, no per-folder permission zones.
- **Duplicate finders (Gemini 2, dupeGuru):** produce long lists for you to review by hand.
- **Antivirus (Malwarebytes):** separate app, technical alerts, no organizing.
- **Hazel:** powerful automation, but you write the rules yourself.

Cleanasaurus combines cleaning, organizing, and security into **one conversation**, and it **learns your habits** so organization happens automatically over time instead of as a yearly cleanup marathon.

### 5. An LLM/Generative model is core to the solution (not a "chatbot in a sidebar")
The LLM is the **planner**. It turns a vague human request plus the user's profile into a structured action plan:
```json
{
  "request": "Clean up Downloads and sort school files by class",
  "actions": [
    {"op": "mkdir", "path": "~/Documents/School/CS4501"},
    {"op": "move", "src": "~/Downloads/LLM_lecture3.pdf", "dst": "~/Documents/School/CS4501/", "reason": "Matches course CS4501; profile: school files go in Documents/School/<course>"},
    {"op": "delete_duplicate", "path": "~/Downloads/LLM_lecture3 (1).pdf", "keep": "~/Downloads/LLM_lecture3.pdf", "reason": "Identical copy"},
    {"op": "quarantine", "path": "~/Downloads/free_vst_crack.dmg", "reason": "Scanner flagged; unsigned installer"}
  ]
}
```
Understanding that "Lecture 3 – Transformers.pdf" belongs to CS 4501, or that a user always keeps receipts in a "Finance" folder, takes language understanding. Without the LLM, Cleanasaurus would be just another file browser.

### 6. Validation Guardrail: No LLM-generated artifact reaches the user without passing through a validator
Every plan is checked by a deterministic **validator** before the user sees it, and nothing touches disk until then:
1. **Target plan check:** the user sets (or approves) a **target plan**: the folder structure and rules they want. Every action must move the file system *toward* that target. Actions that contradict it are rejected.
2. **Permission zones:** every path must be inside a zone the user allowed. 🟢 *free* (act automatically), 🟡 *ask first*, 🔴 *never touch* (e.g., system folders, `~/Library`, git repos). Any red-zone action fails validation.
3. **Schema & existence:** the JSON matches the schema, `op` is in the allowed set, source files exist, and destinations are valid with no name collisions.
4. **Duplicate proof:** a `delete_duplicate` is allowed only if the SHA-256 hashes **actually match**, and the kept copy must still exist afterward.
5. **Malware ground truth:** the LLM can't call a file safe or dangerous on its own. Quarantine actions must be backed by a ClamAV/YARA/hash-reputation result.
6. **Dry-run simulation:** the whole plan runs on a virtual copy of the file tree to check that nothing is lost and to calculate the space freed.
7. **Reversible by design:** deletes go to the trash/quarantine with an undo log, never permanent deletion.

### 7. Self-Correction Loop: Validation errors automatically feed back into the LLM to retry/correct
Validation failures are sent back to the LLM automatically:
```
Plan failed validation:
- actions[2] delete_duplicate: hashes differ ("LLM_lecture3 (1).pdf" is a different version). Do not delete; consider renaming.
- actions[5] move targets ~/Library/Preferences, which is a never-touch zone. Remove this action.
Return a corrected plan.
```
- The LLM re-plans and the new plan is **validated again**, for up to 3 retries.
- **The LLM asks the user when it's stuck or sees something strange.** If retries run out, or the validator flags something unusual (an unknown file type, a hidden folder with thousands of files, an unsigned executable), Cleanasaurus asks a clear question instead of guessing: *"I found 3 versions of Resume.pdf with different contents. Keep all three, or only the newest?"*
- The user's answers are **saved to their profile**, so it doesn't ask the same question twice.

### 8. Deployability: If built, you are able to fully deploy it
- **Desktop app:** Tauri/Electron builds for macOS (and Windows), code-signed and notarized, downloadable from our website with auto-updates.
- **Local-first:** file scanning, hashing, malware checks, and the user profile all stay on the user's machine. Only file names and metadata (not file contents) are sent to the LLM, or nothing is sent at all when using a local model.
- **Backend:** a small API service (Fly.io/Render) for accounts and LLM proxying, so no API keys ship in the app.
- **Malware signatures:** ClamAV's free, regularly updated signature database.

---

## Architecture Sketch
```
User: "Clean up my Downloads and sort school stuff"
          │
          ▼
Local scan (file tree · hashes · malware scan) + User profile + Target plan
          │
          ▼
   LLM planner ──► structured action plan (JSON)
          ▲                     │
          │                     ▼
 error report (≤3 retries) ◄─ fail ─ Validator (target plan · permission zones · schema ·
          │                            hash proof · malware ground truth · dry-run)
          │                     │ pass
  still failing or strange?     ▼
          ▼             Plan preview ("frees 18.4 GB") ──► user approves ──► execute (undoable)
  Ask the user a question                                         │
          │                                                       ▼
          └──────────────► answer saved to profile ◄──── learns from decisions
```
