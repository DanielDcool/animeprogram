import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { MediaItem } from '../types';

interface Candidate { id: number; name: string; englishName: string | null; japaneseName: string | null }

export default function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [scanning, setScanning] = useState(false);
  // 字幕検索の進行状態（1 件ずつ）
  const [subSearch, setSubSearch] = useState<{ mediaId: number; candidates: Candidate[] } | null>(null);
  const [subMsg, setSubMsg] = useState<{ mediaId: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listMedia().then(setItems).catch(console.error);
  useEffect(() => { refresh(); }, []);

  const scan = async () => {
    setScanning(true);
    try { await api.scan(); await refresh(); } finally { setScanning(false); }
  };

  async function findSubtitle(mediaId: number) {
    setBusy(true); setSubMsg(null); setSubSearch(null);
    try {
      const r = await api.jimakuCandidates(mediaId);
      if (r.mappingEntryId != null) {
        // この作品は選択済み → そのままダウンロード
        await doDownload(mediaId, undefined);
      } else if (r.candidates.length === 0) {
        setSubMsg({ mediaId, text: 'jimaku に該当作品が見つかりません' });
      } else {
        setSubSearch({ mediaId, candidates: r.candidates });
      }
    } catch (err: any) {
      setSubMsg({
        mediaId,
        text: err?.body?.code === 'JIMAKU_NOT_CONFIGURED'
          ? 'jimaku API キー未設定（設定ページで入力してください）'
          : `検索に失敗: ${err?.body?.error ?? err.message}`,
      });
    } finally { setBusy(false); }
  }

  async function doDownload(mediaId: number, entryId?: number) {
    setBusy(true);
    try {
      const r = await api.jimakuDownload(mediaId, entryId);
      setSubMsg({ mediaId, text: `字幕を取得しました: ${r.file}` });
      setSubSearch(null);
      await refresh();
    } catch (err: any) {
      setSubMsg({ mediaId, text: `ダウンロード失敗: ${err?.body?.error ?? err.message}` });
    } finally { setBusy(false); }
  }

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
            <div className="media-row">
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
              {!m.hasSubtitle && (
                <button className="sub-btn" disabled={busy} onClick={() => findSubtitle(m.id)}>
                  字幕を探す
                </button>
              )}
              {m.hasSubtitle && (
                <button className="sub-btn" disabled={busy} onClick={() => findSubtitle(m.id)} title="jimaku から字幕を取り直す">
                  ↺ 字幕
                </button>
              )}
            </div>
            {subMsg?.mediaId === m.id && <p className="sub-msg">{subMsg.text}</p>}
            {subSearch?.mediaId === m.id && (
              <div className="candidates">
                <p className="sub-msg">jimaku の作品を選んでください（この作品では今後この選択を使います）:</p>
                {subSearch.candidates.map((c) => (
                  <button key={c.id} className="candidate" disabled={busy} onClick={() => doDownload(m.id, c.id)}>
                    {c.name}
                    {c.japaneseName && <span className="cand-sub"> {c.japaneseName}</span>}
                  </button>
                ))}
                <button className="candidate cancel" onClick={() => setSubSearch(null)}>キャンセル</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
