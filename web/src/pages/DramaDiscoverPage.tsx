import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import ResourceResults from '../catalog/ResourceResults';
import { airYearLabel, dramaCardMeta, dramaDetailPath, dramaScoreLabel } from '../drama/view';
import type { CatalogDrama, DramaHome } from '../types';

const MARQUEE_TEXT = '生の日本語を、毎日の会話から · ';

/** 厳選と Bangumi の検索結果を同じカードで見せる。難易度が分かるものは評価より難易度を優先 */
function DramaCard({ drama }: { drama: CatalogDrama }) {
  const meta = dramaCardMeta(drama);
  return (
    <Link className="anime-card" to={dramaDetailPath(drama)}>
      <div className="anime-cover">
        {drama.coverImage && (
          <img
            src={drama.coverImage}
            alt=""
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        <span className="anime-score">{drama.level ?? dramaScoreLabel(drama.score)}</span>
      </div>
      <div className="anime-card-body">
        <h3>{drama.title}</h3>
        {/* 副行はローマ字綴り優先。無ければ「年 · 話数 · 局」。両方あるときは後者をタグに回す */}
        <p className="anime-romaji">{drama.titleRomaji || meta}</p>
        <div className="anime-tags">
          {drama.recommendation
            ? <span>{drama.recommendation.badge}</span>
            : (drama.titleRomaji && meta ? <span>{meta}</span> : null)}
        </div>
      </div>
    </Link>
  );
}

function LoadingCards() {
  return (
    <div className="anime-grid" aria-label="読み込み中">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="anime-card skeleton-card" key={index}><div className="anime-cover" /></div>
      ))}
    </div>
  );
}

export default function DramaDiscoverPage() {
  const [home, setHome] = useState<DramaHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  /** 実際に検索に出した語。入力途中で結果が入れ替わらないように分けて持つ */
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState<CatalogDrama[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  /** Nyaa 直引きを開いているか。カタログが 0 件・不通のときは自動で開く */
  const [showResources, setShowResources] = useState(false);

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

  function resetSearch() {
    setQuery('');
    setSubmitted('');
    setResults(null);
    setSearchError('');
    setShowResources(false);
    setError('');
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (Array.from(term).length < 2) {
      setError(term ? '検索語は2文字以上で入力してください。' : '');
      if (!term) resetSearch();
      return;
    }
    setError('');
    setSearchError('');
    setSubmitted(term);
    setSearching(true);
    setShowResources(false);
    try {
      const { items } = await api.dramaSearch(term);
      setResults(items);
      // 作品カタログに無いものは Nyaa に直接当たるしかないので、待たせずに開く
      setShowResources(items.length === 0);
    } catch {
      setResults([]);
      setSearchError('作品情報を取得できませんでした。Nyaa で直接探せます。');
      setShowResources(true);
    } finally {
      setSearching(false);
    }
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
            placeholder="作品名で検索（日本語・ローマ字）"
            aria-label="ドラマを検索"
          />
          <button type="submit">検索</button>
          {submitted && (
            <button type="button" className="quiet-button" onClick={resetSearch}>
              厳選へ戻る
            </button>
          )}
        </form>
      </section>

      {error && <div className="catalog-error" role="alert"><p>{error}</p></div>}

      {submitted ? (
        <section className="catalog-section">
          <div className="section-heading">
            <div><p className="eyebrow">SEARCH</p><h2>「{submitted}」の検索結果</h2></div>
            <p>{!searching && results ? `${results.length}作品` : ''}</p>
          </div>
          {searching && <LoadingCards />}
          {!searching && results && results.length > 0 && (
            <div className="anime-grid">
              {results.map((drama) => <DramaCard drama={drama} key={`${drama.source}-${drama.id}`} />)}
            </div>
          )}
          {!searching && searchError && <div className="catalog-error" role="alert"><p>{searchError}</p></div>}
          {!searching && results && results.length === 0 && !searchError && (
            <p className="search-empty">作品が見つかりませんでした。下の Nyaa 直接検索で探せます。</p>
          )}
          {!searching && results && !showResources && (
            <div className="search-more">
              <button type="button" className="quiet-button" onClick={() => setShowResources(true)}>
                もっと探す（Nyaa で直接検索）
              </button>
            </div>
          )}
          {!searching && showResources && (
            <ResourceResults
              defaultCategory="all"
              autoLoadOn={submitted}
              fetchResources={(category) => api.dramaSearchResources(submitted, category)}
            />
          )}
        </section>
      ) : loading ? (
        <LoadingCards />
      ) : home && (
        <>
          <section
            className="catalog-hero drama-hero"
            style={home.hero.bannerImage
              ? { backgroundImage: `linear-gradient(90deg, rgba(251, 250, 247, .98) 0%, rgba(251, 250, 247, .86) 46%, rgba(251, 250, 247, .18) 100%), url("${home.hero.bannerImage}")` }
              : undefined}
          >
            <div className="hero-content">
              {home.hero.recommendation && <span className="hero-badge">{home.hero.recommendation.badge}</span>}
              <h2>{home.hero.title}</h2>
              <p className="hero-romaji">
                {[home.hero.titleRomaji, airYearLabel(home.hero.startDate)].filter(Boolean).join(' · ')}
              </p>
              {home.hero.recommendation && <p className="hero-reason">{home.hero.recommendation.reason}</p>}
              {home.hero.level && <div className="hero-meta"><span>目安 {home.hero.level}</span></div>}
              <Link className="primary-link" to={dramaDetailPath(home.hero)}>作品を見る →</Link>
            </div>
          </section>

          <section className="catalog-section editorial-section">
            <div className="section-heading">
              <div><p className="eyebrow">EDITOR'S PICK</p><h2>日本語学習に効くドラマ</h2></div>
              <p>聞き取りの重さが軽い順に並べています</p>
            </div>
            <div className="drama-pick-grid">
              {home.picks.map((drama, index) => (
                <Link to={dramaDetailPath(drama)} className="drama-pick-card" key={drama.id}>
                  <span className="pick-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="drama-pick-body">
                    {drama.recommendation && <span className="pick-badge">{drama.recommendation.badge}</span>}
                    <h3>{drama.title}</h3>
                    <p className="drama-pick-meta">
                      {[drama.level ? `目安 ${drama.level}` : '', airYearLabel(drama.startDate)].filter(Boolean).join(' · ')}
                    </p>
                    {drama.recommendation && <p>{drama.recommendation.reason}</p>}
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
        厳選リストはこのアプリに同梱の手書き、検索結果と作品情報は Bangumi (bgm.tv) を参照しています。ポスター画像は各サービスのものです。
      </footer>
    </main>
  );
}
