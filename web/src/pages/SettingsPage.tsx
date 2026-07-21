import { useEffect, useState } from 'react';
import { api } from '../api';

export default function SettingsPage() {
  const [keySet, setKeySet] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [jimakuKeySet, setJimakuKeySet] = useState(false);
  const [jimakuKey, setJimakuKey] = useState('');
  const [model, setModel] = useState('claude-opus-4-8');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setKeySet(s.anthropic_api_key_set);
      setJimakuKeySet(s.jimaku_api_key_set);
      setModel(s.ai_model);
    });
  }, []);

  async function save() {
    const payload: Record<string, string> = { ai_model: model };
    if (apiKey) payload.anthropic_api_key = apiKey;
    if (jimakuKey) payload.jimaku_api_key = jimakuKey;
    await api.saveSettings(payload);
    setSaved(true);
    setKeySet(keySet || apiKey !== ''); setApiKey('');
    setJimakuKeySet(jimakuKeySet || jimakuKey !== ''); setJimakuKey('');
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="library">
      <h1>設定</h1>
      <p>
        <label>Anthropic API キー {keySet && '（設定済み）'}<br />
          <input type="password" value={apiKey} placeholder={keySet ? '変更する場合のみ入力' : 'sk-ant-...'} onChange={(e) => setApiKey(e.target.value)} style={{ width: 360 }} />
        </label>
      </p>
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
