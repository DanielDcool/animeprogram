import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import ResourceResults from '../catalog/ResourceResults';
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

  return (
    <main className="anime-detail">
      {/* 背景画像が無いときは大きな空帯にせず、戻る導線だけの細い帯に縮める */}
      <section
        className={drama.bannerImage ? 'detail-banner' : 'detail-banner is-bare'}
        // ドラマは明るい地なので、アニメ側の墨色スクリムを流用すると画が灰色に濁る。
        // 下は地色でしっかり溶かし、上へ向けて素の画に戻す。
        style={drama.bannerImage ? { backgroundImage: `linear-gradient(0deg, var(--bg) 0%, rgba(251, 250, 247, .72) 34%, rgba(251, 250, 247, 0) 100%), url("${drama.bannerImage}")` } : undefined}
      >
        <Link className="detail-back" to="/">← ドラマ一覧へ</Link>
      </section>
      <div className="detail-layout">
        <aside className="detail-aside">
          <div className="detail-cover">
            {drama.coverImage && <img src={drama.coverImage} alt={`${drama.title}のカバー`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
          </div>
          <dl className="detail-facts">
            <div><dt>目安</dt><dd>{drama.level}</dd></div>
            {drama.startDate && <div><dt>放送開始</dt><dd>{drama.startDate}</dd></div>}
          </dl>
        </aside>
        <article className="detail-main">
          <span className="hero-badge">{drama.recommendation.badge}</span>
          <h1>{drama.title}</h1>
          {drama.titleRomaji && <p className="detail-english">{drama.titleRomaji}</p>}
          <blockquote className="recommendation-note">{drama.recommendation.reason}</blockquote>

          <ResourceResults
            subjectId={drama.id}
            defaultCategory="all"
            fetchResources={(category) => api.dramaResources(drama.id, category)}
          />

          <section className="local-learning">
            <div><p className="eyebrow">LOCAL LEARNING</p><h2>手元の動画で日本語を学ぶ</h2><p>合法的に入手した動画を設定ページで指定したメディアフォルダに置けば、字幕検索・文解析・単語保存まで同じアプリで続けられます。</p></div>
            <Link className="primary-link" to="/library">ライブラリを開く</Link>
          </section>
        </article>
      </div>
      <footer className="catalog-footer">
        作品リストはこのアプリに同梱の手書きです。ポスター画像は TMDB のものを参照しています。
      </footer>
    </main>
  );
}
