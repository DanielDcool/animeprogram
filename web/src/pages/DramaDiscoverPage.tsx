import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import ResourceResults from '../catalog/ResourceResults';
import { airYearLabel } from '../drama/view';
import type { CatalogDrama, DramaHome } from '../types';

const MARQUEE_TEXT = '生の日本語を、毎日の会話から · ';

function DramaCard({ drama }: { drama: CatalogDrama }) {
  return (
    <Link className="anime-card" to={`/drama/${drama.id}`}>
      <div className="anime-cover">
        {drama.coverImage && (
          <img
            src={drama.coverImage}
            alt=""
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        <span className="anime-score">{drama.level}</span>
      </div>
      <div className="anime-card-body">
        <h3>{drama.title}</h3>
        <p className="anime-romaji">{drama.titleRomaji ?? airYearLabel(drama.startDate)}</p>
        <div className="anime-tags"><span>{drama.recommendation.badge}</span></div>
      </div>
    </Link>
  );
}

export default function DramaDiscoverPage() {
  const [home, setHome] = useState<DramaHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  /** 実際に検索に出した語。入力途中で結果が入れ替わらないように分けて持つ */
  const [submitted, setSubmitted] = useState('');

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHome(await api.dramaHome());
    } catch {
      setError('ドラマ情報を取得できませんでした。サーバーが起動しているか確認してください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadHome(); }, [loadHome]);

  function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (Array.from(term).length < 2) {
      setError(term ? '検索語は2文字以上で入力してください。' : '');
      setSubmitted('');
      return;
    }
    setError('');
    setSubmitted(term);
  }

  return (
    <main className="discover-page">
      <section className="discover-intro">
        <div>
          <p className="eyebrow">毎日の日本語を、ドラマで。</p>
          <h1>会話がそのまま<br />教材になる一本を。</h1>
        </div>
        <form className="anime-search" onSubmit={search} role="search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="作品名で資料を検索（日本語・ローマ字）"
            aria-label="ドラマの資料を検索"
          />
          <button type="submit">検索</button>
          {submitted && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => { setQuery(''); setSubmitted(''); setError(''); }}
            >
              厳選へ戻る
            </button>
          )}
        </form>
      </section>

      {error && <div className="catalog-error" role="alert"><p>{error}</p></div>}

      {submitted ? (
        <section className="catalog-section">
          <div className="section-heading">
            <div><p className="eyebrow">SEARCH</p><h2>「{submitted}」の資料</h2></div>
            <p>厳選リストに無い作品はここから探せます</p>
          </div>
          <ResourceResults
            defaultCategory="raw"
            autoLoadOn={submitted}
            fetchResources={(category) => api.dramaSearchResources(submitted, category)}
          />
        </section>
      ) : loading ? (
        <div className="anime-grid" aria-label="読み込み中">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="anime-card skeleton-card" key={index}><div className="anime-cover" /></div>
          ))}
        </div>
      ) : home && (
        <>
          <section
            className="catalog-hero drama-hero"
            style={home.hero.bannerImage
              ? { backgroundImage: `linear-gradient(90deg, rgba(251, 250, 247, .98) 0%, rgba(251, 250, 247, .86) 46%, rgba(251, 250, 247, .18) 100%), url("${home.hero.bannerImage}")` }
              : undefined}
          >
            <div className="hero-content">
              <span className="hero-badge">{home.hero.recommendation.badge}</span>
              <h2>{home.hero.title}</h2>
              <p className="hero-romaji">
                {[home.hero.titleRomaji, airYearLabel(home.hero.startDate)].filter(Boolean).join(' · ')}
              </p>
              <p className="hero-reason">{home.hero.recommendation.reason}</p>
              <div className="hero-meta"><span>目安 {home.hero.level}</span></div>
              <Link className="primary-link" to={`/drama/${home.hero.id}`}>作品を見る →</Link>
            </div>
          </section>

          <section className="catalog-section editorial-section">
            <div className="section-heading">
              <div><p className="eyebrow">EDITOR'S PICK</p><h2>日本語学習に効くドラマ</h2></div>
              <p>聞き取りの重さが軽い順に並べています</p>
            </div>
            <div className="drama-pick-grid">
              {home.picks.map((drama, index) => (
                <Link to={`/drama/${drama.id}`} className="drama-pick-card" key={drama.id}>
                  <span className="pick-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="drama-pick-body">
                    <span className="pick-badge">{drama.recommendation.badge}</span>
                    <h3>{drama.title}</h3>
                    <p className="drama-pick-meta">
                      {[`目安 ${drama.level}`, airYearLabel(drama.startDate)].filter(Boolean).join(' · ')}
                    </p>
                    <p>{drama.recommendation.reason}</p>
                  </div>
                  {drama.coverImage && (
                    <img
                      className="drama-pick-poster"
                      src={drama.coverImage}
                      alt=""
                      loading="lazy"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>{MARQUEE_TEXT.repeat(8)}</span>
          <span>{MARQUEE_TEXT.repeat(8)}</span>
        </div>
      </div>
      <footer className="catalog-footer">
        作品リストはこのアプリに同梱の手書きです。ポスター画像は TMDB のものを参照しています。
      </footer>
    </main>
  );
}
