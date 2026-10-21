#!/usr/bin/env bash
# Generate one image with ChatGPT image generation through the Codex CLI.
# Usage: codex_image.sh <out.png> <prompt-file> [reference images...]
# Skips the job if <out.png> already exists.
out="$1"; prompt="$2"; shift 2
[ -f "$out" ] && { echo "skip $out"; exit 0; }
args=(); for r in "$@"; do args+=(-i "$r"); done
{ printf 'Generate ONE image with your image generation tool, then save it as a PNG file at exactly this path:\n%s\n\n' "$out"
  cat "$prompt"
  printf '\n\nDo not modify any other files. When done, reply with the saved file path only.\n'
} | codex exec --skip-git-repo-check -s workspace-write -c model_reasoning_effort=low "${args[@]}" - > ".tools/work/codex_logs/$(basename "$out" .png).log" 2>&1
[ -f "$out" ] && echo "ok   $out" || echo "FAIL $out"
