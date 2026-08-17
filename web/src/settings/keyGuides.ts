// 設定ページの「API キーの取得方法」データと、他ページから /settings に飛ばされたときの意図（?need=&back=）の解釈。
// UI から切り離した純データ / 純関数にしてテストできるようにしている。

export type SettingsNeed = 'jimaku' | 'ai';
export type AiProvider = 'anthropic' | 'deepseek' | 'openai' | 'gemini';

export interface KeyGuide {
  /** 取得方法の見出し */
  title: string;
  /** キーを発行するページ（直リンクボタンの飛び先） */
  url: string;
  /** ボタンの文言 */
  linkLabel: string;
  /** 手順（上から順に） */
  steps: string[];
  /** つまずきやすい点（任意） */
  note?: string;
}

export const JIMAKU_KEY_GUIDE: KeyGuide = {
  title: 'jimaku API キーの取得方法',
  url: 'https://jimaku.cc/account',
  linkLabel: 'jimaku.cc/account を開く',
  steps: [
    'https://jimaku.cc/login を開き、ユーザー名とパスワードを決めて「Register」を押す（メールアドレスは不要。すでにアカウントがあれば「Login」）。',
    'ログイン後 https://jimaku.cc/account を開き、「API Key」の「Generate」を押す。',
    '表示されたキーを「Copy」して、上の入力欄に貼り付けて保存する。',
  ],
  note: 'キーはこのアプリのローカル DB にだけ保存されます。ブラウザから jimaku に直接アクセスすることはありません。',
};

export const AI_KEY_GUIDES: Record<AiProvider, KeyGuide> = {
  anthropic: {
    title: 'Anthropic API キーの取得方法',
    url: 'https://console.anthropic.com/settings/keys',
    linkLabel: 'Anthropic Console を開く',
    steps: [
      'https://console.anthropic.com でアカウントを作成（またはログイン）する。',
      '「Settings → Billing」でクレジットを購入する（API は前払い制。Claude.ai の有料プランとは別）。',
      '「Settings → API Keys」で「Create Key」を押し、表示された sk-ant-... をコピーして上の入力欄に貼る。',
    ],
    note: 'キーは作成直後の一度しか表示されません。閉じてしまった場合は作り直してください。',
  },
  deepseek: {
    title: 'DeepSeek API キーの取得方法',
    url: 'https://platform.deepseek.com/api_keys',
    linkLabel: 'DeepSeek Platform を開く',
    steps: [
      'https://platform.deepseek.com でアカウントを作成（またはログイン）する。',
      '「Top up」で少額チャージする（前払い制）。',
      '「API keys」で「Create new API key」を押し、表示された sk-... をコピーして上の入力欄に貼る。',
    ],
  },
  openai: {
    title: 'OpenAI API キーの取得方法',
    url: 'https://platform.openai.com/api-keys',
    linkLabel: 'OpenAI Platform を開く',
    steps: [
      'https://platform.openai.com でアカウントを作成（またはログイン）する。ChatGPT Plus / Codex のサブスクリプションとは別で、API は従量課金です。',
      '「Settings → Billing」で支払い方法を登録する。',
      '「API keys」で「Create new secret key」を押し、表示された sk-... をコピーして上の入力欄に貼る。',
    ],
    note: 'キーは作成直後の一度しか表示されません。',
  },
  gemini: {
    title: 'Google Gemini API キーの取得方法',
    url: 'https://aistudio.google.com/app/apikey',
    linkLabel: 'Google AI Studio を開く',
    steps: [
      'https://aistudio.google.com を Google アカウントで開く。',
      '左メニューの「Get API key」→「Create API key」を押す（無料枠あり。プロジェクトを聞かれたら新規作成でよい）。',
      '表示されたキーをコピーして上の入力欄に貼る。',
    ],
  },
};

const NEEDS: readonly SettingsNeed[] = ['jimaku', 'ai'];

/**
 * `/settings?need=jimaku&back=/library` のようなクエリを解釈する。
 * back はアプリ内パス（`/` で始まり `//` ではない）だけを受け付ける。
 */
export function parseSettingsIntent(search: string): { need: SettingsNeed | null; back: string | null } {
  const params = new URLSearchParams(search);
  const rawNeed = params.get('need');
  const need = (NEEDS as readonly string[]).includes(rawNeed ?? '') ? (rawNeed as SettingsNeed) : null;
  const rawBack = params.get('back');
  const back = rawBack && rawBack.startsWith('/') && !rawBack.startsWith('//') ? rawBack : null;
  return { need, back };
}

export function backLinkLabel(back: string): string {
  if (back === '/library' || back.startsWith('/library?')) return 'ライブラリに戻って字幕を探す';
  if (back.startsWith('/play/')) return 'プレーヤーに戻る';
  return '戻る';
}

/** 他ページから設定ページへ誘導するときの URL を組み立てる */
export function settingsUrlFor(need: SettingsNeed, back: string): string {
  return `/settings?need=${need}&back=${encodeURIComponent(back)}`;
}
