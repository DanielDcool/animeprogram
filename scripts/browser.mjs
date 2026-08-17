// ブラウザ自動起動用のヘルパー。start.mjs から TANKU_OPEN_BROWSER=1 のときだけ使う。
// 純関数 + 注入 fetch で構成し、実際の spawn は start.mjs 側に置く（precheck.mjs と同じ方針）。

const DEFAULT_WEB_PORT = 5173;

export function resolveWebUrl(env) {
  const parsed = Number.parseInt(String(env.WEB_PORT ?? ''), 10);
  const port = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WEB_PORT;
  return `http://localhost:${port}/`;
}

export function browserOpenCommand(platform, url) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  // `start` の第 1 引数はウィンドウタイトルとして解釈されるため空文字を挟む
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * URL が HTTP 応答を返すまでポーリングする。ステータスは問わない（Vite が応答すれば準備完了）。
 * 接続エラーは再試行し、timeoutMs を超えたら false。
 */
export async function waitForHttpOk(url, { timeoutMs, intervalMs, fetchImpl }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetchImpl(url, { redirect: 'manual' });
      return true;
    } catch {
      // まだ起動していない
    }
    await sleep(intervalMs);
  }
  return false;
}
