import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { VocabItem } from '../types';
import { playbackUrl } from '../player/playbackPosition';

function fmtTime(sec: number | null): string {
  if (sec == null) return '';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export default function VocabPage() {
  const [items, setItems] = useState<VocabItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [ankiMessage, setAnkiMessage] = useState('');
  const [ankiError, setAnkiError] = useState('');

  const refresh = () => api.listVocab().then(setItems).catch(console.error);
  useEffect(() => { refresh(); }, []);

  async function remove(id: number) {
    await api.deleteVocab(id);
    await refresh();
  }

  async function exportToAnki() {
    setExporting(true);
    setAnkiMessage('');
    setAnkiError('');
    try {
      const result = await api.exportVocabToAnki();
      setAnkiMessage(result.added > 0
        ? `「${result.deck}」に ${result.added} 件追加しました。${result.skipped > 0 ? ` ${result.skipped} 件は追加済みです。` : ''}`
        : `「${result.deck}」は最新です。${result.skipped} 件はすでに追加されています。`);
    } catch (error: any) {
      setAnkiError(error?.body?.code === 'ANKI_CONNECT_UNAVAILABLE'
        ? 'Anki を起動し、AnkiConnect（アドオンコード: 2055492159）をインストールしてください。'
        : `Anki への追加に失敗しました。${error?.body?.error ?? ''}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="library">
      <header>
        <h1>単語帳</h1>
        <button onClick={exportToAnki} disabled={items.length === 0 || exporting}>
          {exporting ? 'Anki に送信中…' : 'Anki に一括追加'}
        </button>
      </header>
      {ankiMessage && <p className="anki-export-status">{ankiMessage}</p>}
      {ankiError && <p className="anki-export-error">{ankiError}</p>}
      {items.length === 0 && (
        <p className="panel-idle">
          まだ何も保存されていません。再生ページで一時停止 → 単語の「☆ 保存」または「☆ この文を保存」から追加できます。
        </p>
      )}
      <ul className="vocab-list">
        {items.map((v) => (
          <li key={v.id}>
            <div className="vocab-main">
              <Link className="vocab-detail-link" to={`/vocab/${v.id}`}>
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
              </Link>
              <div className="vocab-src">
                {v.series && (
                  v.mediaId != null
                    ? <Link to={playbackUrl(v.mediaId, v.positionSec)}>{v.series}{v.episode != null && ` 第${v.episode}話`}</Link>
                    : <span>{v.series}{v.episode != null && ` 第${v.episode}話`}</span>
                )}
                {v.positionSec != null && <span> {fmtTime(v.positionSec)}</span>}
              </div>
            </div>
            <button className="del-btn" onClick={() => remove(v.id)} title="削除">✕</button>
          </li>
        ))}
      </ul>
      <p className="anki-export-help">
        Anki と AnkiConnect を起動してから追加してください。デッキ「tanku Anime」は自動で作成され、追加済みのカードはスキップされます。
      </p>
    </main>
  );
}
