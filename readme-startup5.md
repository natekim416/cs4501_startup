# Startup Idea 5: Malwarebytes → A Download Checkpoint That Explains Itself

**Reference company:** [Malwarebytes](https://www.malwarebytes.com/) (Santa Clara, CA)
**What it does today:** anti-malware software for Mac, Windows, and mobile that scans for and removes malware, adware, and other threats, with real-time protection.
**Our product:** a better version of Malwarebytes focused on downloads: every new file is scanned, explained in plain English, and then filed in the right place automatically.
**Team:** Nate Kim, Nate Park, Wesley Chang
**Category:** AI · Security · Desktop Utilities

---

## Overview

Antivirus tools are either **silent** (you never know what they checked) or **full of jargon** ("PUP.Optional.Bundler detected"). Most people just click "ignore." Meanwhile, the Downloads folder is where risky files enter a computer, and where clutter builds up.

Our version is a **checkpoint for every download**:
1. A new file lands in Downloads and is held in a staging area.
2. It's scanned with real signature engines (ClamAV, YARA, hash reputation).
3. The LLM explains it in plain English: *"This is an unsigned installer from a file-sharing site that claims to be a free copy of a paid plugin. Files like this often carry malware. I quarantined it."*
4. Safe files are **automatically filed** where the user's profile says they belong, and repeat downloads are recognized as duplicates.

---

## How It Satisfies the 8 Criteria

### 1. Solves one problem extremely well
**Problem: people download risky files because nothing explains the risk in words they understand.** We make every download understandable, safe, and organized.

### 2. You know the target customers or have direct access to them
Students (who download course files, game mods, and free software constantly) and less-technical family members (the most likely malware victims). We have direct access to both through friends, classmates, and our own families.

### 3. You are familiar with (or can quickly learn) most of the required infrastructure
| Component | Technology | Familiarity |
|---|---|---|
| Desktop app | Tauri or Electron + React | Learnable quickly |
| Download watching | File watchers + macOS quarantine attributes (`com.apple.quarantine`, source URL) | Learnable quickly |
| Scanning | ClamAV, YARA rules, code-signature checks (`codesign`, `spctl`) | Learnable quickly |
| Filing | Rules + user profile in SQLite | Familiar |
| LLM | Claude API structured output | Familiar |

### 4. Reimagines the problem space to make it significantly better
Malwarebytes protects your *whole system* in the background. Our version puts the **moment of download** first and turns security into a **conversation**: you can ask "Why is this risky?" or "Is it safe to open this from my professor?" and get a clear answer. It also handles the cleanup work antivirus ignores: filing safe downloads and removing repeat copies.

### 5. An LLM/Generative model is core to the solution
The LLM combines scanner results, code signature, source URL, file type, and file name into a **verdict explanation and a filing decision**:
```json
{"file": "Serum_FREE_crack.dmg", "verdict": "quarantine",
 "evidence": ["unsigned", "source: file-sharing site", "YARA: macos_adware_installer"],
 "explanation": "This claims to be a free copy of a paid plugin and is unsigned...",
 "filing": null}
```

### 6. Validation Guardrail
No verdict or filing decision reaches the user without validation:
1. **Ground truth only:** the LLM can't mark a file "safe" if any scanner flagged it, and it can't mark a file "dangerous" without scanner or signature evidence.
2. **Evidence check:** every item in `evidence` must match a real scanner or signature result. Made-up evidence fails.
3. **Filing check:** destinations must be inside allowed permission zones, and executables are never auto-filed.
4. **Schema:** valid JSON, with `verdict` in {`safe`, `quarantine`, `ask_user`}.

### 7. Self-Correction Loop
Validator errors go back to the LLM, e.g. "evidence item 'known trojan' does not appear in scanner output; YARA matched only `macos_adware_installer`. Rewrite the explanation using only real evidence." The corrected verdict is re-validated, up to 3 retries. Anything still uncertain becomes `ask_user`: the app **asks the user a question** ("This came from your email. Do you know the sender?") and saves the answer.

### 8. Deployability
Signed macOS app with a background helper, auto-updates, and ClamAV's regularly updated signature database. A thin backend proxies LLM calls. Scanning happens entirely on the device.

---

## Architecture Sketch
```
New file in Downloads ──► staging area
          │
          ▼
 ClamAV · YARA · code signature · source URL ──► evidence
          │
          ▼
  LLM verdict + explanation + filing plan
          ▲                    │
          │                    ▼
  errors (≤3) ◄── fail ── Validator (ground truth · evidence match · zones · schema)
          │                    │ pass
  uncertain? ask user          ▼
                   Plain-English notice ──► quarantine, or file to the right folder
```
