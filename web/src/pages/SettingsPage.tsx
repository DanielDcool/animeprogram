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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setProvider(s.ai_provider);
      setAnthropicKeySet(s.anthropic_api_key_set);
      setDeepseekKeySet(s.deepseek_api_key_set);
      setOpenaiKeySet(s.openai_api_key_set);
      setGeminiKeySet(s.gemini_api_key_set);
      setJimakuKeySet(s.jimaku_api_key_set);
      setModel(s.ai_model);
    });
  }, []);

  async function save() {
    const payload: Record<string, string> = { ai_provider: provider, ai_model: model };
    if (apiKey) payload[`${provider}_api_key`] = apiKey;
    if (jimakuKey) payload.jimaku_api_key = jimakuKey;
    await api.saveSettings(payload);
    setSaved(true);
    if (provider === 'deepseek') setDeepseekKeySet(deepseekKeySet || apiKey !== '');
    else if (provider === 'openai') setOpenaiKeySet(openaiKeySet || apiKey !== '');
    else if (provider === 'gemini') setGeminiKeySet(geminiKeySet || apiKey !== '');
    else setAnthropicKeySet(anthropicKeySet || apiKey !== '');
    setApiKey('');
    setJimakuKeySet(jimakuKeySet || jimakuKey !== ''); setJimakuKey('');
    setTimeout(() => setSaved(false), 2000);
  }

  const providerName = provider === 'deepseek' ? 'DeepSeek' : provider === 'openai' ? 'OpenAI' : provider === 'gemini' ? 'Gemini' : 'Anthropic';
  const selectedKeySet = provider === 'deepseek' ? deepseekKeySet : provider === 'openai' ? openaiKeySet : provider === 'gemini' ? geminiKeySet : anthropicKeySet;

  return (
    <main className="library">
      <h1>設定</h1>
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
        <p style={{ color: '#888', fontSize: 13 }}>
          OpenAI Platform の API キーを使用します。ChatGPT / Codex のサブスクリプションとは別です。
        </p>
      )}
      {provider === 'gemini' && (
        <p style={{ color: '#888', fontSize: 13 }}>
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
      <button onClick={save}>保存</button> {saved && '保存しました'}
      <hr />
      <p style={{ color: '#888', fontSize: 13 }}>
        メディアフォルダ: ~/AnimeLibrary（環境変数 MEDIA_DIR で変更可）<br />
        辞書データ: server/vendor/jmdict-eng.json を置いて npm run import-jmdict -w server
      </p>
    </main>
  );
}
