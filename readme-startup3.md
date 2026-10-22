# Startup Idea 3: Hazel → Folder Automation You Describe in Plain English

**Reference company:** [Hazel](https://www.noodlesoft.com/) by Noodlesoft
**What it does today:** a long-running Mac automation app that watches folders and runs user-written rules (e.g., "if a file in Downloads is a PDF older than 2 weeks, move it to Documents/Archive").
**Our product:** a better version of Hazel where you describe what you want in plain English, and the LLM writes, tests, and maintains the rules for you.
**Team:** Nate Kim, Nate Park, Wesley Chang
**Category:** AI · Productivity · Automation

---

## Overview

Hazel is powerful, but **you have to think like a programmer** to use it: conditions, operators, nested rules, regular expressions. Most people who need it never set it up. Our version lets you say:

> "Anything I download from Canvas goes into a folder for that class. Screenshots older than a week go to the trash. Never touch my Music folder."

The LLM turns that into **real, deterministic rules**. They're tested against your actual files before they go live, and they keep running automatically, with duplicate cleanup and malware checks built in.

---

## How It Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: keeping a computer organized takes constant effort, and automation tools are too hard for normal people to set up.** We make "set it and forget it" organization possible for anyone.

### 2. You know the target customers or have direct access to them
Students who download course files every day, and anyone with a cluttered Downloads folder. We have direct access to UVA classmates, friends, and club members.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Desktop app | Tauri or Electron + React | Learnable quickly |
| Folder watching | FSEvents / chokidar file watchers | Learnable quickly |
| Rule engine | JSON rule DSL evaluated in TypeScript/Rust | Familiar |
| Malware / duplicates | ClamAV + SHA-256 hashing | Learnable quickly |
| LLM | Claude API structured output | Familiar |

### 4. Reimagines the problem space to make it significantly better
Hazel: *you* write the rules. Our version: **you describe your intent, and the AI writes the rules, shows you exactly what they would do to your real files, and updates them as your habits change.** It also learns from what you download and where you move things, and suggests new rules ("You always move .stl files to 3D Prints. Make that a rule?").

### 5. An LLM/Generative model is core to the solution
The LLM translates natural language into a **rule DSL**:
```json
{"name": "Canvas downloads by class",
 "watch": "~/Downloads",
 "if": {"source_url_contains": "canvas", "name_matches_course": true},
 "then": [{"op": "move", "dst": "~/Documents/School/{course}/"}]}
```
Without the LLM, users are back to building rules by hand.

### 6. Validation Guardrail
Every generated rule passes a validator before it's activated:
1. **Schema:** the rule matches the DSL grammar, with no unknown conditions or actions.
2. **Permission zones:** watched folders and destinations must be inside allowed zones.
3. **Backtest:** the rule runs in **dry-run mode on the user's real files**. The validator checks it matches the files the user described and nothing unexpected (e.g., a "screenshots" rule must not match 400 PDFs).
4. **Conflict check:** a new rule can't contradict or loop with an existing rule (A moves to B, B moves back to A).

### 7. Self-Correction Loop
Failures go back to the LLM with evidence, e.g. "Rule matched 212 files, including 180 non-screenshots such as `thesis_draft.png`. Narrow the condition." The corrected rule is backtested again, up to 3 retries. If the intent is still ambiguous, the app **asks the user**: "Should 'screenshots' include images you saved from the web?"

### 8. Deployability
Signed macOS app with a background helper for folder watching, auto-updates, and a thin backend for LLM proxying. Rules run locally and deterministically, so the LLM is only needed when creating or editing rules.

---

## Architecture Sketch
```
"Sort my Canvas downloads by class"
          │
          ▼
  LLM rule writer ──► rule (JSON DSL)
          ▲                 │
          │                 ▼
  errors (≤3) ◄── fail ── Validator (schema · zones · backtest on real files · conflicts)
          │                 │ pass
  ambiguous? ask user       ▼
                  "This rule would move 37 files" ──► user approves ──► rule goes live (folder watcher)
```
