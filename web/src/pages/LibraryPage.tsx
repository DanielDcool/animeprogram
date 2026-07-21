import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { MediaItem } from '../types';

export default function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [scanning, setScanning] = useState(false);

  const refresh = () => api.listMedia().then(setItems).catch(console.error);
  useEffect(() => { refresh(); }, []);

  const scan = async () => {
    setScanning(true);
    try { await api.scan(); await refresh(); } finally { setScanning(false); }
  };

  return (
    <main className="library">
      <header>
        <h1>ライブラリ</h1>
        <button onClick={scan} disabled={scanning}>{scanning ? 'スキャン中…' : 'フォルダをスキャン'}</button>
      </header>
      {items.length === 0 && <p>動画がありません。~/AnimeLibrary に mkv/mp4 と字幕を置いてスキャンしてください。</p>}
      <ul className="media-list">
        {items.map((m) => (
          <li key={m.id}>
            {m.playable ? (
              <Link to={`/play/${m.id}`}>
                {m.series} {m.episode != null && `- 第${m.episode}話`}
              </Link>
            ) : (
              <span title="このコーデックはブラウザ再生不可。別ソースを推奨">
                {m.series} {m.episode != null && `- 第${m.episode}話`}（要トランスコード）
              </span>
            )}
            {!m.hasSubtitle && <em> 字幕なし</em>}
            {m.positionSec > 30 && <em> 続き {Math.floor(m.positionSec / 60)}:{String(Math.floor(m.positionSec % 60)).padStart(2, '0')}</em>}
          </li>
        ))}
      </ul>
    </main>
  );
}
