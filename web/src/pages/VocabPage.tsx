import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { VocabItem } from '../types';

function fmtTime(sec: number | null): string {
  if (sec == null) return '';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export default function VocabPage() {
  const [items, setItems] = useState<VocabItem[]>([]);

  const refresh = () => api.listVocab().then(setItems).catch(console.error);
  useEffect(() => { refresh(); }, []);

  async function remove(id: number) {
    await api.deleteVocab(id);
    await refresh();
  }

  return (
    <main className="library">
      <header>
        <h1>単語帳</h1>
        <a href="/api/vocab/export.tsv" download>
          <button disabled={items.length === 0}>Anki 用 TSV エクスポート</button>
        </a>
      </header>
      {items.length === 0 && (
        <p className="panel-idle">
          まだ何も保存されていません。再生ページで一時停止 → 単語の「☆ 保存」または「☆ この文を保存」から追加できます。
        </p>
      )}
      <ul className="vocab-list">
        {items.map((v) => (
          <li key={v.id}>
            <div className="vocab-main">
              {v.kind === 'word' ? (
                <>
                  <b>{v.word}</b>
                  {v.reading && v.reading !== v.word && <span className="reading">{v.reading}</span>}
                  {v.gloss && <div className="vocab-gloss">{v.gloss}</div>}
                  <div className="vocab-sentence">例: {v.sentence}</div>
                </>
              ) : (
                <>
                  <b>{v.sentence}</b>
                  {v.translation && <div className="vocab-gloss">{v.translation}</div>}
                </>
              )}
              <div className="vocab-src">
                {v.series && (
                  v.mediaId != null
                    ? <Link to={`/play/${v.mediaId}`}>{v.series}{v.episode != null && ` 第${v.episode}話`}</Link>
                    : <span>{v.series}{v.episode != null && ` 第${v.episode}話`}</span>
                )}
                {v.positionSec != null && <span> {fmtTime(v.positionSec)}</span>}
              </div>
            </div>
            <button className="del-btn" onClick={() => remove(v.id)} title="削除">✕</button>
          </li>
        ))}
      </ul>
      <p style={{ color: '#888', fontSize: 13 }}>
        Anki への取り込み: ファイル → 読み込む → vocab.tsv を選択（フィールド区切り: タブ、HTML を許可）。
      </p>
    </main>
  );
}
