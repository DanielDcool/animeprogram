import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { MediaItem } from '../types';
import { groupMediaByFolder, toggleCollapsedFolder } from '../library/mediaView';
import { countNeedsMapping, subtitleAction } from '../library/subtitleView';

interface Candidate { id: number; name: string; englishName: string | null; japaneseName: string | null }

export default function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [scanning, setScanning] = useState(false);
  // 字幕検索の進行状態（1 件ずつ）
  const [subSearch, setSubSearch] = useState<{ mediaId: number; candidates: Candidate[] } | null>(null);
  const [subMsg, setSubMsg] = useState<{ mediaId: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setItems(await api.listMedia());
      setLoadError('');
    } catch {
      setLoadError('ライブラリを読み込めませんでした。サーバーが起動しているか確認してください。');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(true); }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const scan = async () => {
    setScanning(true);
    setActionError('');
    try {
      await api.scan();
      await refresh(true);
    } catch {
      setActionError('フォルダをスキャンできませんでした。設定したフォルダとサーバーを確認してください。');
    } finally { setScanning(false); }
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
      await refresh();
    } finally { setBusy(false); }
  }

  const needsMapping = countNeedsMapping(items);
  const groups = groupMediaByFolder(items);

  function renderMediaItem(m: MediaItem) {
    const action = subtitleAction(m);
    return <li key={m.id}>
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
        {!m.hasSubtitle && <em className="subtitle-state"> 字幕なし</em>}
        {m.positionSec > 30 && <em> 続き {Math.floor(m.positionSec / 60)}:{String(Math.floor(m.positionSec % 60)).padStart(2, '0')}</em>}
        <button
          className="sub-btn"
          disabled={busy || action.disabled}
          onClick={() => m.subtitleStatus === 'failed' ? doDownload(m.id) : findSubtitle(m.id)}
          title={m.subtitleStatus === 'ready' ? 'jimaku から字幕を取り直す' : undefined}
        >
          {action.label}
        </button>
      </div>
      {m.subtitleStatus === 'failed' && m.subtitleError && (
        <p className="subtitle-error">字幕の自動取得に失敗: {m.subtitleError}</p>
      )}
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
    </li>;
  }

  return (
    <main className="library">
      <header>
        <h1>ライブラリ</h1>
        <button onClick={scan} disabled={scanning}>{scanning ? 'スキャン中…' : 'フォルダをスキャン'}</button>
      </header>
      {needsMapping > 0 && (
        <p className="library-notice">字幕作品の選択が必要です（{needsMapping}件）</p>
      )}
      {loading && <p className="status-message" aria-live="polite">ライブラリを読み込み中…</p>}
      {loadError && (
        <div className="status-message error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void refresh()}>再試行</button>
        </div>
      )}
      {actionError && <p className="status-message error" role="alert">{actionError}</p>}
      {!loading && !loadError && items.length === 0 && (
        <section className="library-onboarding">
          <h2>最初の1本を再生するまで</h2>
          <ol>
            <li><Link to="/settings">設定</Link>で、アニメ専用のメディアフォルダを指定します。</li>
            <li>そのフォルダに <code>.mp4</code> または <code>.mkv</code> を置きます。同名の日本語 <code>.srt</code> / <code>.ass</code> があれば一緒に置けます。</li>
            <li>ここに戻ってスキャンし、動画を開きます。再生中に <kbd>Space</kbd> を押すと字幕を確認できます。</li>
          </ol>
          <p>動画再生だけなら API キーは不要です。AI 解説と Jimaku は必要になってから設定できます。</p>
          <Link className="primary-link" to="/settings">メディアフォルダを設定</Link>
        </section>
      )}
      <div className="library-groups">
        {groups.map((group) => {
          const collapsed = collapsedFolders.has(group.folder);
          return (
            <section className={`library-group${collapsed ? ' is-collapsed' : ''}`} key={group.folder}>
              <h2>
                <button
                  type="button"
                  className="library-group-toggle"
                  aria-expanded={!collapsed}
                  onClick={() => setCollapsedFolders((folders) => toggleCollapsedFolder(folders, group.folder))}
                >
                  <span className="library-group-chevron" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                  <span>{group.folder}</span>
                  <small>{group.items.length}件</small>
                </button>
              </h2>
              {!collapsed && <ul className="media-list">{group.items.map(renderMediaItem)}</ul>}
            </section>
          );
        })}
      </div>
    </main>
  );
}
