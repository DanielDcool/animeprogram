import { useEffect, useState } from 'react';
import { api } from '../api';

type AiProvider = 'anthropic' | 'deepseek' | 'openai' | 'gemini';

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
  const [mediaDir, setMediaDir] = useState('');
  const [activeMediaDir, setActiveMediaDir] = useState('');
  const [defaultMediaDir, setDefaultMediaDir] = useState('');
  const [mediaDirOverridden, setMediaDirOverridden] = useState(false);
  const [saved, setSaved] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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

  async function save() {
    const payload: Record<string, string> = { ai_provider: provider, ai_model: model };
    if (apiKey) payload[`${provider}_api_key`] = apiKey;
    if (jimakuKey) payload.jimaku_api_key = jimakuKey;
    if (!mediaDirOverridden) payload.media_dir = mediaDir.trim();
    setSaveError('');
    try {
      await api.saveSettings(payload);
      setSaved(true);
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
            type="password"
            value={apiKey}
            placeholder={selectedKeySet ? '変更する場合のみ入力' : provider === 'anthropic' ? 'sk-ant-...' : provider === 'gemini' ? 'Google AI Studio で取得' : 'sk-...'}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: 360 }}
          />
        </label>
      </p>
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
          <input type="password" value={jimakuKey} placeholder={jimakuKeySet ? '変更する場合のみ入力' : 'https://jimaku.cc/profile で取得'} onChange={(e) => setJimakuKey(e.target.value)} style={{ width: 360 }} />
        </label>
      </p>
      <p>
        <label>AI モデル<br />
          <input value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 360 }} />
        </label>
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
      {restartRequired && <p className="settings-restart">メディアフォルダを保存しました。アプリを再起動すると変更が反映されます。</p>}
      {saveError && <p className="settings-error">{saveError}</p>}
      <hr />
      <p className="settings-help">
        辞書データ: server/vendor/jmdict-eng.json を置いて npm run import-jmdict -w server
      </p>
    </main>
  );
}
