// AI 解説の出力言語。日本語学習者向けなので日本語は対象外（中国語 / 英語のみ）。
export type ExplainLanguage = 'zh' | 'en';

/** 設定値として保存された文字列を検証する。zh / en 以外（'auto' 含む）は「自動」として undefined を返す。 */
export function parseExplainLanguage(value: string | undefined): ExplainLanguage | undefined {
  return value === 'zh' || value === 'en' ? value : undefined;
}

function toSupported(tag: string): ExplainLanguage | undefined {
  const primary = tag.trim().toLowerCase().split('-')[0];
  if (primary === 'zh') return 'zh';
  if (primary === 'en') return 'en';
  return undefined;
}

/**
 * Accept-Language ヘッダから解説言語を推定する。
 * 優先順に並んだタグのうち、最初に見つかった対応言語（zh / en）を採用する。
 * 例: "ja,zh-CN;q=0.8" → zh（日本語 OS を使う中国語話者を想定）
 * どれも対応外なら systemLocale（サーバー側 OS のロケール）を見て、それでも決まらなければ en。
 */
export function detectExplainLanguage(
  acceptLanguage: string | undefined,
  systemLocale?: string,
): ExplainLanguage {
  const tags = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    // Array.prototype.sort は安定ソートなので、同じ重みならヘッダの並び順が保たれる
    .sort((a, b) => b.weight - a.weight);
  for (const { tag } of tags) {
    const supported = toSupported(tag);
    if (supported) return supported;
  }
  if (systemLocale) {
    const supported = toSupported(systemLocale);
    if (supported) return supported;
  }
  return 'en';
}

/** サーバーが動いている OS のロケール（ローカルアプリなので利用者のシステム言語とほぼ一致する）。 */
export function systemLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

/** 設定で明示された言語があればそれを、なければリクエストの言語（→ OS ロケール → en）から決める。 */
export function resolveExplainLanguage(
  setting: string | undefined,
  acceptLanguage: string | undefined,
  fallbackLocale: string | undefined = systemLocale(),
): ExplainLanguage {
  return parseExplainLanguage(setting) ?? detectExplainLanguage(acceptLanguage, fallbackLocale);
}
