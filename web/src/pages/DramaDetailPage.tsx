import { useEffect, useState } from 'react';
import { Link, useMatch, useParams } from 'react-router-dom';
import { api } from '../api';
import ResourceResults from '../catalog/ResourceResults';
import { dramaScoreLabel } from '../drama/view';
import type { CatalogDrama } from '../types';

/**
 * 厳選（/drama/:id）と Bangumi の検索結果（/drama/bgm/:id）を同じページで見せる。
 * 取得口だけが違い、難易度・推薦文は厳選にしか無く、あらすじ・評価・局は Bangumi にしか無い。
 */
export default function DramaDetailPage() {
  const { id } = useParams();
  const isBangumi = useMatch('/drama/bgm/:id') != null;
  const [drama, setDrama] = useState<CatalogDrama | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const dramaId = Number(id);
    if (!Number.isSafeInteger(dramaId)) {
      setError('作品IDが不正です。');
      return;
    }
    setError('');
    setDrama(null);
    const load = isBangumi ? api.dramaBangumiDetail : api.dramaDetail;
    load(dramaId).then(setDrama).catch((failure: { status?: number }) => {
      setError(failure?.status === 404 ? '作品が見つかりませんでした。' : '作品情報を取得できませんでした。');
    });
  }, [id, isBangumi]);

  if (error) {
    return <main className="detail-state"><p>{error}</p><Link to="/">← ドラマ一覧へ</Link></main>;
  }
  if (!drama) return <main className="detail-state">作品情報を読み込んでいます…</main>;

  const fetchResources = drama.source === 'bangumi'
    ? (category: Parameters<typeof api.dramaBangumiResources>[1]) => api.dramaBangumiResources(drama.id, category)
    : (category: Parameters<typeof api.dramaResources>[1]) => api.dramaResources(drama.id, category);

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
            {drama.level && <div><dt>目安</dt><dd>{drama.level}</dd></div>}
            {drama.source === 'bangumi' && <div><dt>評価</dt><dd>{dramaScoreLabel(drama.score)}</dd></div>}
            {drama.episodes != null && <div><dt>話数</dt><dd>{drama.episodes}話</dd></div>}
            {drama.network && <div><dt>放送局</dt><dd>{drama.network}</dd></div>}
            {drama.startDate && <div><dt>放送開始</dt><dd>{drama.startDate}</dd></div>}
          </dl>
        </aside>
        <article className="detail-main">
          {drama.recommendation && <span className="hero-badge">{drama.recommendation.badge}</span>}
          <h1>{drama.title}</h1>
          {drama.titleRomaji && <p className="detail-english">{drama.titleRomaji}</p>}
          {drama.recommendation && <blockquote className="recommendation-note">{drama.recommendation.reason}</blockquote>}
          {drama.description && (
            <section className="detail-section">
              <p className="eyebrow">STORY</p><h2>作品紹介</h2>
              <p className="detail-description">{drama.description}</p>
            </section>
          )}

          <ResourceResults
            key={`${drama.source}-${drama.id}`}
            subjectId={drama.id}
            defaultCategory="all"
            fetchResources={fetchResources}
          />

          <section className="local-learning">
            <div><p className="eyebrow">LOCAL LEARNING</p><h2>手元の動画で日本語を学ぶ</h2><p>合法的に入手した動画を設定ページで指定したメディアフォルダに置けば、字幕検索・文解析・単語保存まで同じアプリで続けられます。</p></div>
            <Link className="primary-link" to="/library">ライブラリを開く</Link>
          </section>
        </article>
      </div>
      <footer className="catalog-footer">
        厳選リストはこのアプリに同梱の手書き、検索結果と作品情報は Bangumi (bgm.tv) を参照しています。ポスター画像は各サービスのものです。
      </footer>
    </main>
  );
}
