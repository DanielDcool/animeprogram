import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import ResourceResults from '../catalog/ResourceResults';
import { scoreLabel, statusLabel } from '../catalog/view';
import { networkLabel } from '../drama/view';
import type { CatalogDrama } from '../types';

export default function DramaDetailPage() {
  const { id } = useParams();
  const [drama, setDrama] = useState<CatalogDrama | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const dramaId = Number(id);
    if (!Number.isSafeInteger(dramaId)) {
      setError('作品IDが不正です。');
      return;
    }
    setError('');
    api.dramaDetail(dramaId).then(setDrama).catch(() => setError('作品情報を取得できませんでした。'));
  }, [id]);

  if (error) {
    return <main className="detail-state"><p>{error}</p><Link to="/">← ドラマ一覧へ</Link></main>;
  }
  if (!drama) return <main className="detail-state">作品情報を読み込んでいます…</main>;

  const streaming = drama.links.filter((link) => link.type === 'STREAMING');
  const information = drama.links.filter((link) => link.type === 'INFO');

  return (
    <main className="anime-detail">
      <section
        className="detail-banner"
        style={drama.bannerImage ? { backgroundImage: `linear-gradient(0deg, var(--bg) 0%, rgba(11, 11, 10, .35) 70%), url("${drama.bannerImage}")` } : undefined}
      >
        <Link className="detail-back" to="/">← ドラマ一覧へ</Link>
      </section>
      <div className="detail-layout">
        <aside className="detail-aside">
          <div className="detail-cover">
            {drama.coverImage && <img src={drama.coverImage} alt={`${drama.title}のカバー`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
          </div>
          {/* TMDB 未設定時やダウン時は厳選リストの最小情報だけになるため、
              各項目は「無ければ出さない」で組む */}
          <dl className="detail-facts">
            {drama.score != null && <div><dt>評価</dt><dd>{scoreLabel(drama.score)}</dd></div>}
            <div><dt>状態</dt><dd>{statusLabel(drama.status)}</dd></div>
            {drama.episodes != null && <div><dt>話数</dt><dd>{drama.episodes}話</dd></div>}
            {drama.network && <div><dt>放送局</dt><dd>{networkLabel(drama.network)}</dd></div>}
            {drama.startDate && <div><dt>放送開始</dt><dd>{drama.startDate}</dd></div>}
          </dl>
        </aside>
        <article className="detail-main">
          {drama.recommendation && <span className="hero-badge">{drama.recommendation.badge}</span>}
          <h1>{drama.title}</h1>
          {drama.titleEnglish && drama.titleEnglish !== drama.title && (
            <p className="detail-english">{drama.titleEnglish}</p>
          )}
          {drama.recommendation && <blockquote className="recommendation-note">{drama.recommendation.reason}</blockquote>}

          <section className="detail-section">
            <p className="eyebrow">STORY</p><h2>作品紹介</h2>
            <p className="detail-description">
              {drama.description || 'TMDB のトークンを設定すると、日本語のあらすじが表示されます。'}
            </p>
          </section>

          <section className="detail-section resource-section">
            <p className="eyebrow">OFFICIAL LINKS</p><h2>公式で見る・調べる</h2>
            {streaming.length > 0 && <div className="resource-group"><h3>配信サービス</h3><div className="resource-links">{streaming.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={`${link.site}-${link.url}`}>{link.site}<span>↗</span></a>)}</div></div>}
            {information.length > 0 && <div className="resource-group"><h3>公式情報</h3><div className="resource-links">{information.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={`${link.site}-${link.url}`}>{link.site}<span>↗</span></a>)}</div></div>}
            {drama.links.length === 0 && <p className="muted-copy">配信リンクは未取得です。TMDB のトークンを設定すると、日本での配信先を確認できます。</p>}
          </section>

          <ResourceResults
            subjectId={drama.id}
            defaultCategory="raw"
            fetchResources={(category) => api.dramaResources(drama.id, category)}
          />

          <section className="local-learning">
            <div><p className="eyebrow">LOCAL LEARNING</p><h2>手元の動画で日本語を学ぶ</h2><p>合法的に入手した動画を設定ページで指定したメディアフォルダに置けば、字幕検索・文解析・単語保存まで同じアプリで続けられます。</p></div>
            <Link className="primary-link" to="/library">ライブラリを開く</Link>
          </section>
        </article>
      </div>
      <footer className="catalog-footer">
        作品データ：TMDB。本製品は TMDB の API を利用していますが、TMDB による推奨・認証を受けたものではありません。
      </footer>
    </main>
  );
}
