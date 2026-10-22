# Startup Idea 2: Sparkle → A Local, Validated AI File Organizer

**Reference company:** [Sparkle](https://every.to/on-every/introducing-sparkle) by Every (New York City · [makeitsparkle.co](https://makeitsparkle.co))
**What it does today:** a Mac app that uses AI to organize your Desktop, Downloads, and Documents folders. The 2026 rebuild is "agent-native": it clears clutter (screenshots, installers, junk) first, then builds a folder structure, and you can adjust it by chatting with a built-in agent.
**Our product:** a better version of Sparkle that runs locally, validates every plan before it touches disk, checks for malware, and lets the user set permission zones.
**Team:** Nate Kim, Nate Park, Wesley Chang
**Category:** AI · Productivity · Desktop Utilities

---

## Overview

Sparkle proved that people want an AI to organize their computer. But it has gaps that matter for trust:
- File names are **sent to Every's servers and OpenAI** for processing.
- It **reorganizes whole folders into its own structure** (Recents / AI Library / Manual Library) instead of one the user defines.
- It **doesn't check for malware** in the files it's organizing.
- It's only available as part of a **paid Every subscription**.

Our version keeps the chat-driven organizing and adds what Sparkle lacks: **local-first processing, user-defined permission zones, a validator that proves every action is safe, and malware scanning**, in a standalone app.

---

## How It Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: AI file organizers ask you to trust them with your whole computer, and most people don't.** We solve that by making AI organizing *safe and controllable*: every move is previewed, checked, and undoable.

### 2. You know the target customers or have direct access to them
Students and anyone with a messy computer. We have direct access to friends and classmates at UVA, club members, and family members, all of whom have full Downloads folders and limited storage.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Desktop app | Tauri or Electron + React | Learnable quickly |
| File operations | File system APIs, file watchers, OS trash | Familiar |
| Malware scanning | ClamAV / YARA | Learnable quickly |
| Local model | Ollama (Llama/Qwen) with Claude API as an option | Learnable quickly |
| Storage | SQLite for permission zones, undo log, and preferences | Familiar |

### 4. Reimagines the problem space to make it significantly better
Sparkle's approach is "**let the AI decide**." Ours is "**you decide, the AI does the work**":
- **You define the target structure** (or approve one we propose), so the AI organizes toward your plan instead of its own.
- **Permission zones:** 🟢 free, 🟡 ask first, 🔴 never touch.
- **Local by default:** file names never leave the machine when using the local model.
- **Security built in:** every file it organizes is also scanned.

### 5. An LLM/Generative model is core to the solution
The LLM reads file names, metadata, and the user's request, then writes a **structured action plan** (`mkdir`, `move`, `rename`, `trash`, `quarantine`). Knowing that "Lab6_Crypto.pages" belongs in a security class folder takes language understanding that fixed rules can't provide.

### 6. Validation Guardrail
No plan is shown or executed until a validator confirms:
1. **Schema:** JSON is valid and every `op` is allowed.
2. **Permission zones:** no action touches a 🔴 zone, and 🟡 actions are flagged for approval.
3. **Target plan:** every destination exists in, or is created by, the user's target structure.
4. **No data loss:** a dry run on a virtual file tree confirms no file is lost or overwritten.
5. **Reversibility:** every action has an undo entry; deletes go to the trash.

### 7. Self-Correction Loop
Validator errors go straight back to the LLM ("`move` destination `~/Library/…` is a never-touch zone; `rename` collides with an existing file"). The corrected plan is validated again, up to 3 retries. If it still fails, or the validator spots something strange, the app **asks the user a question** and saves the answer to their profile.

### 8. Deployability
Signed and notarized macOS app distributed from our website with auto-updates. It runs fully offline with a local model, or uses a small proxy backend (Fly.io/Render) for Claude API access.

---

## Architecture Sketch
```
User request ──► Local scan + permission zones + target plan
                         │
                         ▼
                LLM planner (local or Claude) ──► action plan (JSON)
                         ▲                              │
                         │                              ▼
            errors (≤3 retries) ◄── fail ── Validator (schema · zones · target plan · dry-run)
                         │                              │ pass
        still failing? ──► ask the user                 ▼
                                         Preview ──► approve ──► execute (undoable)
```
