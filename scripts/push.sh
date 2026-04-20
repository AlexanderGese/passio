#!/usr/bin/env bash
# Full-push pipeline — rebuild, commit, push, optionally tag a release.
#
# Usage
#   scripts/push.sh                           # rebuild + commit (if dirty) + push main
#   scripts/push.sh "commit message"          # same, but use this message (skips $EDITOR)
#   scripts/push.sh --release v2.3.1          # also bump version to 2.3.1, tag, push tag
#                                             # → triggers .github/workflows/release.yml
#   scripts/push.sh --skip-build               # skip the rebuild step (just commit + push)
#   scripts/push.sh --dry-run                  # print every step, touch nothing remote
#
# Flags can be combined: `scripts/push.sh --release v2.3.1 "release notes commit"`.
# Everything aborts on the first failure (set -euo pipefail).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# ---- flag parsing ----------------------------------------------------------
MESSAGE=""
RELEASE_TAG=""
SKIP_BUILD=0
DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      RELEASE_TAG="${2:-}"
      [[ -z "$RELEASE_TAG" ]] && { echo "--release requires a tag (e.g. v2.3.1)" >&2; exit 2; }
      [[ ! "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$ ]] && {
        echo "invalid tag: $RELEASE_TAG (want vMAJOR.MINOR.PATCH)" >&2; exit 2; }
      shift 2;;
    --skip-build) SKIP_BUILD=1; shift;;
    --dry-run)    DRY=1; shift;;
    -h|--help)    sed -n '2,14p' "$0"; exit 0;;
    --*)          echo "unknown flag: $1" >&2; exit 2;;
    *)            MESSAGE="$1"; shift;;
  esac
done

run() {
  if [[ $DRY -eq 1 ]]; then echo "+ $*"; else eval "$@"; fi
}

# ---- 1. rebuild -----------------------------------------------------------
if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "── rebuild sidecar + HUD + tauri .deb ─────────────────────────────"
  run "cd packages/sidecar && bun run build && cd ../.."
  run "cd apps/desktop && bun run build && cd ../.."
  # Kill any running instance so the Tauri build can overwrite the binary
  # it currently has mapped in. Safe: process respawns at end.
  if pgrep -f 'passio-(desktop|sidecar)' >/dev/null; then
    run "pgrep -f 'passio-(desktop|sidecar)' | xargs -r /bin/kill"
    run "sleep 3"
  fi
  run "cd apps/desktop && bun run tauri build --bundles deb && cd ../.."
fi

# ---- 2. version bump (release flow) --------------------------------------
if [[ -n "$RELEASE_TAG" ]]; then
  V="${RELEASE_TAG#v}"
  echo "── bump versions to $V ───────────────────────────────────────────"
  run "node -e 'const fs=require(\"fs\"); for(const f of [\"package.json\",\"apps/desktop/src-tauri/tauri.conf.json\"]){const j=JSON.parse(fs.readFileSync(f,\"utf8\"));j.version=\"$V\";fs.writeFileSync(f, JSON.stringify(j, null, 2)+\"\\n\");}'"
fi

# ---- 3. commit -----------------------------------------------------------
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git status --porcelain)" ]]; then
  echo "── commit ────────────────────────────────────────────────────────"
  run "git add -A"
  if [[ -z "$MESSAGE" ]]; then
    if [[ -n "$RELEASE_TAG" ]]; then MESSAGE="chore: release $RELEASE_TAG"
    else
      # Open $EDITOR if interactive; otherwise abort.
      if [[ -t 0 ]]; then
        MESSAGE=$(mktemp)
        echo -e "# commit message (empty = abort)\n\n" > "$MESSAGE"
        ${EDITOR:-vi} "$MESSAGE"
        MSG_BODY=$(grep -v '^#' "$MESSAGE" | sed '/./,$!d')
        rm -f "$MESSAGE"
        [[ -z "${MSG_BODY// /}" ]] && { echo "empty message — aborting" >&2; exit 1; }
        MESSAGE="$MSG_BODY"
      else
        echo "working tree is dirty and no message given (stdin not a tty)" >&2
        exit 1
      fi
    fi
  fi
  run "git commit -m \"\$(cat <<'PASSIO_COMMIT_EOF'
$MESSAGE
PASSIO_COMMIT_EOF
)\""
else
  echo "── nothing to commit — working tree clean ────────────────────────"
fi

# ---- 4. push main --------------------------------------------------------
echo "── push origin main ──────────────────────────────────────────────"
run "git push origin main"

# ---- 5. tag + trigger release workflow -----------------------------------
if [[ -n "$RELEASE_TAG" ]]; then
  echo "── tag $RELEASE_TAG + push tag (triggers release.yml) ────────────"
  run "git tag -a \"$RELEASE_TAG\" -m \"Passio $RELEASE_TAG\""
  run "git push origin \"$RELEASE_TAG\""
  echo
  echo "🍇 release workflow dispatched."
  echo "   https://github.com/AlexanderGese/passio/actions/workflows/release.yml"
fi

# ---- 6. relaunch (only if we rebuilt + stopped the app) ------------------
if [[ $SKIP_BUILD -eq 0 ]] && ! pgrep -f 'passio-desktop' >/dev/null; then
  DEB_BIN="$(pwd)/apps/desktop/src-tauri/target/release/passio-desktop"
  if [[ -x "$DEB_BIN" ]]; then
    echo "── relaunch Passio ───────────────────────────────────────────────"
    run "nohup '$DEB_BIN' >/dev/null 2>&1 &"
  fi
fi

echo
echo "✓ done."
