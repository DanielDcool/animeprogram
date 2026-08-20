#!/usr/bin/env bash
# tanku Anime one-line installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/DanielDcool/tankuanime/master/scripts/install.sh | bash
#
# What it does (idempotent — run it again to update):
#   1. Downloads the source tarball into ~/tankuanime (no git needed). If that folder is already
#      a git checkout, it runs `git pull --ff-only` instead.
#   2. Makes sure Node.js 22 is available: uses the one on PATH if it is already 22, otherwise
#      downloads the official nodejs.org build into ~/tankuanime/.tools/node (SHA-256 verified).
#   3. Makes sure ffmpeg + ffprobe are available: uses PATH if present; on macOS uses Homebrew
#      when installed, otherwise downloads the static builds linked from ffmpeg.org (evermeet.cx)
#      into ~/tankuanime/.tools/ffmpeg. On Linux it only prints the package-manager hint.
#   4. npm ci (skipped when package-lock.json did not change and node_modules exists).
#   5. npm run setup:jmdict (dictionary; failure is not fatal).
#   6. macOS: puts a "tanku Anime.command" shortcut on the Desktop and launches the app once.
#
# Nothing here needs sudo, touches the system PATH, or edits shell profiles. Everything lives
# inside the install folder; deleting it (plus the Desktop shortcut) is a complete uninstall.
#
# Environment overrides:
#   TANKU_INSTALL_DIR  install folder (default: $HOME/tankuanime)
#   TANKU_REF          git ref to download (default: master; CI passes a commit SHA)
#   TANKU_NO_LAUNCH=1  do not start the app at the end
#   TANKU_SKIP_JMDICT=1  skip the dictionary download

set -euo pipefail

REPO_URL="https://github.com/DanielDcool/tankuanime"
REF="${TANKU_REF:-master}"
INSTALL_DIR="${TANKU_INSTALL_DIR:-$HOME/tankuanime}"
TOOLS_DIR="$INSTALL_DIR/.tools"
NODE_DIST="https://nodejs.org/dist/latest-v22.x"
EVERMEET="https://evermeet.cx/ffmpeg"
LAUNCHER="tanku Anime.command"

log()  { printf '\n[tanku Anime] %s\n' "$*"; }
warn() { printf '\n[tanku Anime] WARNING: %s\n' "$*" >&2; }
die()  { printf '\n[tanku Anime] ERROR: %s\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
case "$OS" in
  Darwin) OS_ID="darwin" ;;
  Linux)  OS_ID="linux" ;;
  *) die "Unsupported OS: $OS. On Windows, use scripts/install.ps1 (see README.md)." ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH_ID="arm64" ;;
  x86_64|amd64)  ARCH_ID="x64" ;;
  *) die "Unsupported CPU architecture: $(uname -m)" ;;
esac

for tool in curl tar; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but was not found."
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

download() { # url, dest
  curl -fL --progress-bar --retry 3 "$1" -o "$2" || die "Download failed: $1"
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

node_major() { # prints major version of the given node binary, or nothing
  "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true
}

# ---------------------------------------------------------------- 1. source
fetch_source() {
  mkdir -p "$INSTALL_DIR"
  if [ -d "$INSTALL_DIR/.git" ]; then
    log "$INSTALL_DIR is a git checkout; updating with git pull --ff-only."
    if ! (cd "$INSTALL_DIR" && git pull --ff-only); then
      warn "git pull failed; continuing with the files already there."
    fi
    return
  fi
  log "Downloading tanku Anime ($REF) into $INSTALL_DIR ..."
  download "$REPO_URL/archive/$REF.tar.gz" "$TMP_DIR/source.tar.gz"
  # The tarball has a single top-level folder (tankuanime-<ref>); strip it and unpack in place.
  # Untracked user data (server/data, server/vendor, node_modules, .tools) is left untouched.
  tar -xzf "$TMP_DIR/source.tar.gz" -C "$INSTALL_DIR" --strip-components=1
  chmod +x "$INSTALL_DIR/$LAUNCHER" 2>/dev/null || true
}

# ---------------------------------------------------------------- 2. node 22
ensure_node() {
  if [ -x "$TOOLS_DIR/node/bin/node" ]; then
    export PATH="$TOOLS_DIR/node/bin:$PATH"
  fi
  if command -v node >/dev/null 2>&1 && [ "$(node_major node)" = "22" ]; then
    log "Node.js $(node -v) found; using it."
    return
  fi

  log "Node.js 22 not found; downloading the official build from nodejs.org ..."
  download "$NODE_DIST/SHASUMS256.txt" "$TMP_DIR/SHASUMS256.txt"
  local line file sha
  line="$(grep -E "node-v22\.[0-9]+\.[0-9]+-${OS_ID}-${ARCH_ID}\.tar\.gz$" "$TMP_DIR/SHASUMS256.txt" | head -n1 || true)"
  [ -n "$line" ] || die "Could not find a Node 22 build for ${OS_ID}-${ARCH_ID} in $NODE_DIST"
  sha="${line%% *}"
  file="${line##* }"

  download "$NODE_DIST/$file" "$TMP_DIR/$file"
  [ "$(sha256_of "$TMP_DIR/$file")" = "$sha" ] || die "SHA-256 mismatch for $file; aborting."

  rm -rf "$TOOLS_DIR/node.tmp"
  mkdir -p "$TOOLS_DIR/node.tmp"
  tar -xzf "$TMP_DIR/$file" -C "$TOOLS_DIR/node.tmp" --strip-components=1
  rm -rf "$TOOLS_DIR/node"
  mv "$TOOLS_DIR/node.tmp" "$TOOLS_DIR/node"
  export PATH="$TOOLS_DIR/node/bin:$PATH"

  [ "$(node_major node)" = "22" ] || die "Downloaded Node did not run as expected."
  log "Installed Node.js $(node -v) into $TOOLS_DIR/node (private to tanku Anime)."
}

# ---------------------------------------------------------------- 3. ffmpeg
have_ffmpeg() {
  command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1 \
    && ffmpeg -version >/dev/null 2>&1 && ffprobe -version >/dev/null 2>&1
}

install_ffmpeg_static_macos() {
  if [ "$ARCH_ID" = "arm64" ] && ! arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
    log "The static FFmpeg build is Intel-only; installing Rosetta 2 (may ask for your password) ..."
    if ! softwareupdate --install-rosetta --agree-to-license; then
      warn "Rosetta 2 could not be installed automatically. Run this once, then re-run the installer:"
      warn "  softwareupdate --install-rosetta --agree-to-license"
      return 1
    fi
  fi
  command -v unzip >/dev/null 2>&1 || { warn "'unzip' not found; cannot unpack FFmpeg."; return 1; }

  log "Downloading static ffmpeg + ffprobe (evermeet.cx, linked from ffmpeg.org) ..."
  download "$EVERMEET/getrelease/zip" "$TMP_DIR/ffmpeg.zip"
  download "$EVERMEET/getrelease/ffprobe/zip" "$TMP_DIR/ffprobe.zip"
  mkdir -p "$TOOLS_DIR/ffmpeg"
  unzip -oq "$TMP_DIR/ffmpeg.zip" -d "$TOOLS_DIR/ffmpeg"
  unzip -oq "$TMP_DIR/ffprobe.zip" -d "$TOOLS_DIR/ffmpeg"
  chmod +x "$TOOLS_DIR/ffmpeg/ffmpeg" "$TOOLS_DIR/ffmpeg/ffprobe"
  export PATH="$TOOLS_DIR/ffmpeg:$PATH"
}

ensure_ffmpeg() {
  if [ -x "$TOOLS_DIR/ffmpeg/ffprobe" ]; then
    export PATH="$TOOLS_DIR/ffmpeg:$PATH"
  fi
  if have_ffmpeg; then
    log "ffmpeg and ffprobe found; using them."
    return
  fi

  if [ "$OS_ID" = "darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      log "Installing FFmpeg with Homebrew ..."
      brew install ffmpeg || warn "brew install ffmpeg failed; trying the static build instead."
    fi
    if ! have_ffmpeg; then
      install_ffmpeg_static_macos || true
    fi
  else
    warn "ffmpeg/ffprobe not found. Install them with your package manager (e.g. sudo apt install ffmpeg) and restart the app."
  fi

  if have_ffmpeg; then
    log "FFmpeg ready: $(command -v ffmpeg)"
  else
    warn "FFmpeg is still missing. The app will start, but importing/playing local video needs it."
  fi
}

# ---------------------------------------------------------------- 4. deps
install_deps() {
  cd "$INSTALL_DIR"
  local lock_after
  lock_after="$(sha256_of package-lock.json)"
  if [ -d node_modules ] && [ "$lock_after" = "${LOCK_BEFORE:-}" ]; then
    log "Dependencies unchanged; skipping npm ci."
    return
  fi
  log "Installing dependencies (npm ci) ..."
  npm ci --no-fund --no-audit
}

# ---------------------------------------------------------------- 5. dictionary
setup_dictionary() {
  if [ "${TANKU_SKIP_JMDICT:-}" = "1" ]; then return; fi
  cd "$INSTALL_DIR"
  if [ -f server/vendor/jmdict-eng.json ]; then
    log "JMdict already downloaded; skipping."
    return
  fi
  log "Downloading the Japanese dictionary (JMdict, CC BY-SA 4.0) ..."
  if ! npm run setup:jmdict; then
    warn "Dictionary setup failed. You can retry later inside $INSTALL_DIR with: npm run setup:jmdict"
  fi
}

# ---------------------------------------------------------------- 6. shortcut + launch
create_shortcut() {
  [ "$OS_ID" = "darwin" ] || return 0
  # ランチャーに標識アイコンを付ける（Finder 表示用。失敗しても致命的ではない）
  if [ -f "$INSTALL_DIR/docs/images/tanku.png" ] && command -v osascript >/dev/null 2>&1; then
    osascript -l JavaScript -e 'function run(argv) {
      ObjC.import("AppKit");
      const img = $.NSImage.alloc.initWithContentsOfFile(argv[0]);
      return $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, argv[1], 0);
    }' "$INSTALL_DIR/docs/images/tanku.png" "$INSTALL_DIR/$LAUNCHER" >/dev/null 2>&1 \
      || warn "Could not set the launcher icon (cosmetic only)."
  fi
  [ -d "$HOME/Desktop" ] || return 0
  ln -sfn "$INSTALL_DIR/$LAUNCHER" "$HOME/Desktop/$LAUNCHER"
  log "Desktop shortcut created: ~/Desktop/$LAUNCHER"
}

launch_app() {
  [ "${TANKU_NO_LAUNCH:-}" = "1" ] && return 0
  if [ "$OS_ID" = "darwin" ]; then
    log "Starting tanku Anime in a new Terminal window; the browser opens when it is ready."
    open "$INSTALL_DIR/$LAUNCHER"
  fi
}

# ---------------------------------------------------------------- main
main() {
  log "Installing tanku Anime into $INSTALL_DIR"
  LOCK_BEFORE=""
  [ -f "$INSTALL_DIR/package-lock.json" ] && LOCK_BEFORE="$(sha256_of "$INSTALL_DIR/package-lock.json")"

  fetch_source
  ensure_node
  ensure_ffmpeg
  install_deps
  setup_dictionary
  create_shortcut

  cat <<EOF

[tanku Anime] Done.
  Folder:     $INSTALL_DIR
  Start:      double-click "$LAUNCHER" (Desktop shortcut on macOS), or run: cd "$INSTALL_DIR" && npm start
  Update:     run this install command again
  Uninstall:  delete the folder above and the Desktop shortcut
EOF
  launch_app
}

main
