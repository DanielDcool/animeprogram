import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { KeyGuide } from '../settings/KeyGuide';
import { AI_KEY_GUIDES, JIMAKU_KEY_GUIDE, backLinkLabel, parseSettingsIntent } from '../settings/keyGuides';
import type { AiProvider } from '../settings/keyGuides';

type ExplainLanguage = 'auto' | 'zh' | 'en';

const LANGUAGE_LABELS: Record<'zh' | 'en', string> = { zh: '中文', en: 'English' };

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-opus-4-8',
  deepseek: 'deepseek-v4-flash',
  openai: 'gpt-5.6-sol',
  gemini: 'gemini-3.6-flash',
};

export default function SettingsPage() {
  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [anthropicKeySet, setAnthropicKeySet] = useState(false);
  const [deepseekKeySet, setDeepseekKeySet] = useState(false);
  const [openaiKeySet, setOpenaiKeySet] = useState(false);
  const [geminiKeySet, setGeminiKeySet] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [jimakuKeySet, setJimakuKeySet] = useState(false);
  const [jimakuKey, setJimakuKey] = useState('');
  const [model, setModel] = useState('claude-opus-4-8');
  const [explainLanguage, setExplainLanguage] = useState<ExplainLanguage>('auto');
  const [detectedLanguage, setDetectedLanguage] = useState<'zh' | 'en'>('en');
  const [mediaDir, setMediaDir] = useState('');
  const [activeMediaDir, setActiveMediaDir] = useState('');
  const [defaultMediaDir, setDefaultMediaDir] = useState('');
  const [mediaDirOverridden, setMediaDirOverridden] = useState(false);
  const [saved, setSaved] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // 他ページから「キーが必要」で飛ばされたときの意図（?need=jimaku|ai&back=/library など）
  const location = useLocation();
  const intent = parseSettingsIntent(location.search);
  const [savedOnce, setSavedOnce] = useState(false);
  const jimakuInputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const s = await api.getSettings();
      setProvider(s.ai_provider);
      setAnthropicKeySet(s.anthropic_api_key_set);
      setDeepseekKeySet(s.deepseek_api_key_set);
      setOpenaiKeySet(s.openai_api_key_set);
      setGeminiKeySet(s.gemini_api_key_set);
      setJimakuKeySet(s.jimaku_api_key_set);
      setModel(s.ai_model);
      setExplainLanguage(s.explain_language);
      setDetectedLanguage(s.explain_language_detected);
      setMediaDir(s.media_dir);
      setActiveMediaDir(s.media_dir);
      setDefaultMediaDir(s.default_media_dir);
      setMediaDirOverridden(s.media_dir_overridden);
      setLoadError('');
    } catch {
      setLoadError('設定を読み込めませんでした。サーバーが起動しているか確認してください。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // 誘導されてきたときは該当欄までスクロールしてフォーカスする
  useEffect(() => {
    if (loading || !intent.need) return;
    const el = intent.need === 'jimaku' ? jimakuInputRef.current : aiInputRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }, [loading, intent.need]);

  async function save() {
    const payload: Record<string, string> = { ai_provider: provider, ai_model: model, explain_language: explainLanguage };
    if (apiKey) payload[`${provider}_api_key`] = apiKey;
    if (jimakuKey) payload.jimaku_api_key = jimakuKey;
    if (!mediaDirOverridden) payload.media_dir = mediaDir.trim();
    setSaveError('');
    try {
      await api.saveSettings(payload);
      setSaved(true);
      setSavedOnce(true);
      setRestartRequired(!mediaDirOverridden && mediaDir.trim() !== activeMediaDir);
      if (provider === 'deepseek') setDeepseekKeySet(deepseekKeySet || apiKey !== '');
      else if (provider === 'openai') setOpenaiKeySet(openaiKeySet || apiKey !== '');
      else if (provider === 'gemini') setGeminiKeySet(geminiKeySet || apiKey !== '');
      else setAnthropicKeySet(anthropicKeySet || apiKey !== '');
      setApiKey('');
      setJimakuKeySet(jimakuKeySet || jimakuKey !== ''); setJimakuKey('');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setSaveError(err?.body?.error ?? '設定を保存できませんでした');
    }
  }

  const providerName = provider === 'deepseek' ? 'DeepSeek' : provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'Anthropic';
  const selectedKeySet = provider === 'deepseek' ? deepseekKeySet : provider === 'openai' ? openaiKeySet : provider === 'gemini' ? geminiKeySet : anthropicKeySet;

  return (
    <main className="library settings-page">
      <h1>設定</h1>
      <p className="settings-intro">ローカル動画の再生と学習モードには API キーは不要です。AI 解説と Jimaku 字幕検索だけ、使う機能のキーを設定してください。</p>
      {intent.need === 'jimaku' && !jimakuKeySet && (
        <div className="status-message settings-banner" role="status">
          <span>字幕検索には jimaku の API キーが必要です。下の欄に入力して保存してください（取得方法はすぐ下にあります）。</span>
        </div>
      )}
      {intent.need === 'ai' && !selectedKeySet && (
        <div className="status-message settings-banner" role="status">
          <span>AI 解説には選んだ AI サービスの API キーが必要です。下の欄に入力して保存してください（取得方法はすぐ下にあります）。</span>
        </div>
      )}
      {loading && <p className="status-message" aria-live="polite">設定を読み込み中…</p>}
      {loadError && (
        <div className="status-message error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()}>再試行</button>
        </div>
      )}
      <section className="settings-section">
        <h2>任意の拡張</h2>
      <p>
        <label>AI サービス<br />
          <select value={provider} onChange={(e) => {
            const next = e.target.value as AiProvider;
            setProvider(next);
            setModel(DEFAULT_MODELS[next]);
          }}>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI（Codex / GPT）</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>
      </p>
      <p>
        <label>{providerName} API キー {selectedKeySet && '（設定済み）'}<br />
          <input
            ref={aiInputRef}
            type="password"
            className={intent.need === 'ai' && !selectedKeySet ? 'settings-highlight' : undefined}
            value={apiKey}
            placeholder={selectedKeySet ? '変更する場合のみ入力' : provider === 'anthropic' ? 'sk-ant-...' : provider === 'gemini' ? 'Google AI Studio で取得' : 'sk-...'}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: 360 }}
          />
        </label>
      </p>
      <KeyGuide guide={AI_KEY_GUIDES[provider]} open={intent.need === 'ai' && !selectedKeySet} />
      {provider === 'openai' && (
        <p className="settings-help">
          OpenAI Platform の API キーを使用します。ChatGPT / Codex のサブスクリプションとは別です。
        </p>
      )}
      {provider === 'gemini' && (
        <p className="settings-help">
          Google AI Studio で作成した Gemini API キーを使用します。
        </p>
      )}
      <p>
        <label>jimaku API キー {jimakuKeySet && '（設定済み）'}<br />
          <input
            ref={jimakuInputRef}
            type="password"
            className={intent.need === 'jimaku' && !jimakuKeySet ? 'settings-highlight' : undefined}
            value={jimakuKey}
            placeholder={jimakuKeySet ? '変更する場合のみ入力' : 'https://jimaku.cc/account で取得'}
            onChange={(e) => setJimakuKey(e.target.value)}
            style={{ width: 360 }}
          />
        </label>
      </p>
      <KeyGuide guide={JIMAKU_KEY_GUIDE} open={intent.need === 'jimaku' && !jimakuKeySet} />
      <p>
        <label>AI モデル<br />
          <input value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 360 }} />
        </label>
      </p>
      <p>
        <label>AI 解説の言語<br />
          <select value={explainLanguage} onChange={(e) => setExplainLanguage(e.target.value as ExplainLanguage)}>
            <option value="auto">自動（システム言語: {LANGUAGE_LABELS[detectedLanguage]}）</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </p>
      <p className="settings-help">
        「自動」はブラウザ / OS の言語設定に従います。中国語以外の環境では英語で解説します。
      </p>
      </section>
      <hr />
      <section className="settings-section">
        <h2>メディア</h2>
        <label htmlFor="media-directory">メディアフォルダ</label>
        <input
          id="media-directory"
          className="settings-path"
          value={mediaDir}
          disabled={mediaDirOverridden}
          onChange={(e) => setMediaDir(e.target.value)}
          spellCheck={false}
        />
        {defaultMediaDir && <p className="settings-help">既定: <code>{defaultMediaDir}</code></p>}
        {mediaDirOverridden ? (
          <p className="settings-help settings-warning"><code>MEDIA_DIR</code> 環境変数が優先されています。変更するには環境変数を外して再起動してください。</p>
        ) : (
          <p className="settings-help">絶対パスを入力してください。保存したフォルダはアプリの再起動後から監視・スキャンされます。</p>
        )}
      </section>
      <button className="solid-button" onClick={save} disabled={loading || Boolean(loadError)}>保存</button> {saved && '保存しました'}
      {intent.back && savedOnce && (
        <p className="settings-back"><Link to={intent.back}>← {backLinkLabel(intent.back)}</Link></p>
      )}
      {restartRequired && <p className="settings-restart">メディアフォルダを保存しました。アプリを再起動すると変更が反映されます。</p>}
      {saveError && <p className="settings-error">{saveError}</p>}
      <hr />
      <p className="settings-help">
        辞書データ: server/vendor/jmdict-eng.json を置いて npm run import-jmdict -w server
      </p>
    </main>
  );
}
