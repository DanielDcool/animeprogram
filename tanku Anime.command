#!/bin/bash
# tanku Anime 起動用（macOS）。Finder でダブルクリックすると server と web を起動し、
# 準備ができたらブラウザを開く。ターミナル派は今まで通り `npm start` でよい。
#
# 依存の探し方: 同じフォルダの .tools/（scripts/install.sh が置く Node 22 と FFmpeg）を最優先し、
# 次に通常の PATH、最後に Homebrew の標準パスを見る。ユーザーのシェル設定には依存しない。

cd "$(dirname "$0")" || exit 1

export PATH="$PWD/.tools/node/bin:$PWD/.tools/ffmpeg:$PATH:/opt/homebrew/bin:/usr/local/bin"
export TANKU_OPEN_BROWSER=1

pause() {
  echo
  read -r -p "Press Enter to close this window..." _
}

if ! command -v node >/dev/null 2>&1; then
  echo "[tanku Anime] Node.js was not found."
  echo "Run the one-line install command from README.md first, or install Node.js 22 from https://nodejs.org/en/download"
  pause
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" != "22" ]; then
  echo "[tanku Anime] Node.js 22 is required, but node $(node -v) was found first on PATH."
  echo "Run the one-line install command from README.md (it keeps a private Node 22 under .tools/), or install Node.js 22."
  pause
  exit 1
fi

npm start
status=$?
echo
echo "[tanku Anime] stopped (exit code $status)."
pause
exit "$status"
