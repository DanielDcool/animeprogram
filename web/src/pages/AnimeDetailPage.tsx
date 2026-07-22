import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { scoreLabel, statusLabel } from '../catalog/view';
import type { CatalogAnime } from '../types';

export default function AnimeDetailPage() {
  const { id } = useParams();
  const [anime, setAnime] = useState<CatalogAnime | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const animeId = Number(id);
    if (!Number.isSafeInteger(animeId)) {
      setError('作品IDが不正です。');
      return;
    }
    setError('');
    api.catalogDetail(animeId).then(setAnime).catch(() => setError('作品情報を取得できませんでした。'));
  }, [id]);

  if (error) {
    return <main className="detail-state"><p>{error}</p><Link to="/">← 新番一覧へ</Link></main>;
  }
  if (!anime) return <main className="detail-state">作品情報を読み込んでいます…</main>;

  const streaming = anime.links.filter((link) => link.type === 'STREAMING');
  const information = anime.links.filter((link) => link.type === 'INFO');

  return (
    <main className="anime-detail">
      <section
        className="detail-banner"
        style={anime.bannerImage ? { backgroundImage: `linear-gradient(0deg, var(--bg) 0%, rgba(14, 17, 23, .35) 70%), url("${anime.bannerImage}")` } : undefined}
      >
        <Link className="detail-back" to="/">← 新番一覧へ</Link>
      </section>
      <div className="detail-layout">
        <aside className="detail-aside">
          <div className="detail-cover">
            {anime.coverImage && <img src={anime.coverImage} alt={`${anime.title}のカバー`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
          </div>
          <dl className="detail-facts">
            <div><dt>評価</dt><dd>{scoreLabel(anime.score)}</dd></div>
            <div><dt>状態</dt><dd>{statusLabel(anime.status)}</dd></div>
            {anime.episodes != null && <div><dt>話数</dt><dd>{anime.episodes}話</dd></div>}
            {anime.studio && <div><dt>制作</dt><dd>{anime.studio}</dd></div>}
            {anime.startDate && <div><dt>開始</dt><dd>{anime.startDate}</dd></div>}
          </dl>
        </aside>
        <article className="detail-main">
          {anime.recommendation && <span className="hero-badge">{anime.recommendation.badge}</span>}
          <h1>{anime.title}</h1>
          <p className="detail-romaji">{anime.titleRomaji}</p>
          {anime.titleEnglish && anime.titleEnglish !== anime.titleRomaji && <p className="detail-english">{anime.titleEnglish}</p>}
          <div className="anime-tags detail-tags">{anime.genres.map((genre) => <span key={genre}>{genre}</span>)}</div>
          {anime.recommendation && <blockquote className="recommendation-note">{anime.recommendation.reason}</blockquote>}

          <section className="detail-section">
            <p className="eyebrow">STORY</p><h2>作品紹介</h2>
            <p className="detail-description">{anime.description || '作品紹介はまだ登録されていません。'}</p>
          </section>

          <section className="detail-section resource-section">
            <p className="eyebrow">OFFICIAL LINKS</p><h2>公式で見る・調べる</h2>
            {streaming.length > 0 && <div className="resource-group"><h3>配信サービス</h3><div className="resource-links">{streaming.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={`${link.site}-${link.url}`}>{link.site}<span>↗</span></a>)}</div></div>}
            {information.length > 0 && <div className="resource-group"><h3>公式情報</h3><div className="resource-links">{information.map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={`${link.site}-${link.url}`}>{link.site}<span>↗</span></a>)}</div></div>}
            {anime.links.length === 0 && <p className="muted-copy">AniList に公式リンクが登録されていません。作品公式サイトで配信先を確認してください。</p>}
          </section>

          <section className="local-learning">
            <div><p className="eyebrow">LOCAL LEARNING</p><h2>手元の動画で日本語を学ぶ</h2><p>合法的に入手した動画を <code>~/AnimeLibrary</code> に置けば、字幕検索・文解析・単語保存まで同じアプリで続けられます。</p></div>
            <Link className="primary-link" to="/library">ライブラリを開く</Link>
          </section>
        </article>
      </div>
      <footer className="catalog-footer">作品データ：AniList。外部サービスの利用条件を確認して視聴してください。</footer>
    </main>
  );
}
