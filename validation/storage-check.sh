#!/usr/bin/env bash
# Read-only storage check for validation sessions (CS testers, macOS).
# Prints how much space common developer clutter takes up. It only measures sizes
# with du and find: it never deletes, moves, or uploads anything.
#
# Usage: bash storage-check.sh [extra project folder ...]

ROOTS=("$HOME/code" "$HOME/dev" "$HOME/projects" "$HOME/src" "$HOME/GitHub" "$HOME/Documents" "$HOME/Desktop" "$@")

# Reads directory paths on stdin and prints their total size in KB.
sum_dirs() {
  local total=0 size dir
  while IFS= read -r dir; do
    [ -e "$dir" ] || continue
    size=$(du -sk "$dir" 2>/dev/null | cut -f1)
    total=$((total + ${size:-0}))
  done
  echo "$total"
}

# Runs find with the given tests in every project folder that exists.
in_roots() {
  for root in "${ROOTS[@]}"; do
    [ -d "$root" ] && find "$root" -maxdepth 6 "$@" 2>/dev/null
  done | sort -u
}

gb() { awk -v kb="$1" 'BEGIN { printf "%6.1f GB", kb / 1048576 }'; }

echo "Measuring (read-only, takes about a minute)..."

js=$({
  in_roots -type d -name node_modules -prune -print
  printf '%s\n' "$HOME/.npm" "$HOME/Library/Caches/Yarn" "$HOME/Library/pnpm/store"
} | sum_dirs)

python=$({
  in_roots -name pyvenv.cfg -not -path '*/node_modules/*' -exec dirname {} \;
  ls -d "$HOME"/{miniconda3,anaconda3,opt/miniconda3,opt/anaconda3,.conda}/envs/* 2>/dev/null
  printf '%s\n' "$HOME/Library/Caches/pip" "$HOME/.cache/pip"
} | sum_dirs)

ml=$(printf '%s\n' "$HOME/.cache/huggingface" "$HOME/.cache/torch" | sum_dirs)

docker=$(printf '%s\n' "$HOME/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw" | sum_dirs)

xcode=$(printf '%s\n' "$HOME/Library/Developer/Xcode/DerivedData" "$HOME/Library/Developer/CoreSimulator" | sum_dirs)

# A Unity project is a folder with Assets/ and ProjectSettings/; its Library/ is rebuilt on open.
unity=$(in_roots -type d -name ProjectSettings | while IFS= read -r settings; do
  project=$(dirname "$settings")
  [ -d "$project/Assets" ] && [ -d "$project/Library" ] && echo "$project/Library"
done | sum_dirs)

other=$(printf '%s\n' "$HOME/Library/Caches/Homebrew" "$HOME/.gradle/caches" | sum_dirs)

archives=$(printf '%s\n' "$HOME/Library/Developer/Xcode/Archives" | sum_dirs)

total=$((js + python + ml + docker + xcode + unity + other))

echo
df -k "$HOME" | awk 'NR == 2 { printf "Disk: %.0f GB free of %.0f GB (%s full)\n\n", $4 / 1048576, $2 / 1048576, $5 }'
printf '%s  JavaScript packages (node_modules, npm/yarn/pnpm caches)\n' "$(gb "$js")"
printf '%s  Python environments and caches\n' "$(gb "$python")"
printf '%s  ML model caches (Hugging Face, PyTorch)\n' "$(gb "$ml")"
printf '%s  Docker disk (images and build cache; volumes may hold data)\n' "$(gb "$docker")"
printf '%s  Xcode build data and simulators\n' "$(gb "$xcode")"
printf '%s  Unity Library folders\n' "$(gb "$unity")"
printf '%s  Other caches (Homebrew, Gradle)\n' "$(gb "$other")"
echo   "---------"
printf '%s  Rebuildable total\n\n' "$(gb "$total")"
printf 'Not rebuildable, for context only: Xcode Archives %s\n' "$(gb "$archives")"
