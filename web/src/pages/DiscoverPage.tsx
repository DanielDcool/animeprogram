import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { scoreLabel, seasonLabel, statusLabel } from '../catalog/view';
import type { CatalogAnime, CatalogHome } from '../types';

function AnimeCard({ anime }: { anime: CatalogAnime }) {
  return (
    <Link className="anime-card" to={`/anime/${anime.id}`}>
      <div className="anime-cover">
        {anime.coverImage && (
          <img
            src={anime.coverImage}
            alt=""
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        <span className="anime-score">{scoreLabel(anime.score)}</span>
      </div>
      <div className="anime-card-body">
        <h3>{anime.title}</h3>
        <p className="anime-romaji">{anime.titleRomaji}</p>
        <div className="anime-tags">
          <span>{statusLabel(anime.status)}</span>
          {anime.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
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

export default function DiscoverPage() {
  const [home, setHome] = useState<CatalogHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [season, setSeason] = useState<'current' | 'previous'>('current');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogAnime[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHome(await api.catalogHome());
    } catch {
      setError('新番情報を取得できませんでした。ネットワークを確認して、もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadHome(); }, [loadHome]);

  async function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setResults(null);
      setError('');
      return;
    }
    if (Array.from(term).length < 2) {
      setError('検索語は2文字以上で入力してください。');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const response = await api.catalogSearch(term);
      setResults(response.items);
    } catch {
      setError('検索できませんでした。しばらくしてから再試行してください。');
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setResults(null);
    setError('');
  }

  const hero = home?.featured[0] ?? home?.current.items[0];
  const seasonalItems = useMemo(() => home?.[season].items ?? [], [home, season]);

  return (
    <main className="discover-page">
      <section className="discover-intro">
        <p className="eyebrow">日本語で、次の一本へ。</p>
        <h1>今季のアニメを見つけて、<br />そのまま学ぶ。</h1>
        <form className="anime-search" onSubmit={search} role="search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="作品名を日本語・ローマ字・英語で検索"
            aria-label="アニメを検索"
          />
          <button type="submit" disabled={searching}>{searching ? '検索中…' : '検索'}</button>
          {results && <button type="button" className="quiet-button" onClick={clearSearch}>新番へ戻る</button>}
        </form>
      </section>

      {error && (
        <div className="catalog-error" role="alert">
          <p>{error}</p>
          {!results && <button onClick={loadHome}>再読み込み</button>}
        </div>
      )}

      {loading && !home ? <LoadingCards /> : results ? (
        <section className="catalog-section">
          <div className="section-heading">
            <div><p className="eyebrow">SEARCH</p><h2>「{query.trim()}」の検索結果</h2></div>
            <span>{results.length}作品</span>
          </div>
          {results.length ? (
            <div className="anime-grid">{results.map((anime) => <AnimeCard anime={anime} key={anime.id} />)}</div>
          ) : (
            <div className="empty-catalog">該当する作品が見つかりませんでした。別の表記でも試してみてください。</div>
          )}
        </section>
      ) : home && (
        <>
          {hero && (
            <section
              className="catalog-hero"
              style={hero.bannerImage ? { backgroundImage: `linear-gradient(90deg, rgba(14, 17, 23, .98) 0%, rgba(14, 17, 23, .78) 48%, rgba(14, 17, 23, .18) 100%), url("${hero.bannerImage}")` } : undefined}
            >
              <div className="hero-content">
                <span className="hero-badge">{hero.recommendation?.badge ?? '今季の注目作'}</span>
                <h2>{hero.title}</h2>
                <p className="hero-romaji">{hero.titleRomaji}</p>
                <p className="hero-reason">{hero.recommendation?.reason ?? '今季の人気作から、次に見る一本を選びました。'}</p>
                <div className="hero-meta"><span>★ {scoreLabel(hero.score)}</span><span>{statusLabel(hero.status)}</span></div>
                <Link className="primary-link" to={`/anime/${hero.id}`}>作品を見る</Link>
              </div>
            </section>
          )}

          <section className="catalog-section editorial-section">
            <div className="section-heading">
              <div><p className="eyebrow">EDITOR'S PICK</p><h2>今季まず見る3本</h2></div>
              <p>日本語学習の切り口で選びました</p>
            </div>
            <div className="editorial-grid">
              {home.featured.map((anime, index) => (
                <Link to={`/anime/${anime.id}`} className="editorial-card" key={anime.id}>
                  <span className="pick-number">0{index + 1}</span>
                  <div><span className="pick-badge">{anime.recommendation?.badge ?? '注目作'}</span><h3>{anime.title}</h3><p>{anime.recommendation?.reason}</p></div>
                </Link>
              ))}
            </div>
          </section>

          <section className="catalog-section">
            <div className="section-heading season-heading">
              <div><p className="eyebrow">SEASONAL</p><h2>季節の新番</h2></div>
              <div className="season-tabs" role="tablist" aria-label="放送時期">
                <button className={season === 'current' ? 'active' : ''} onClick={() => setSeason('current')} role="tab" aria-selected={season === 'current'}>{seasonLabel(home.current)}</button>
                <button className={season === 'previous' ? 'active' : ''} onClick={() => setSeason('previous')} role="tab" aria-selected={season === 'previous'}>{seasonLabel(home.previous)}</button>
              </div>
            </div>
            <div className="anime-grid">{seasonalItems.map((anime) => <AnimeCard anime={anime} key={anime.id} />)}</div>
          </section>
        </>
      )}

      <footer className="catalog-footer">作品データ：AniList。配信先は各公式サービスで確認してください。</footer>
    </main>
  );
}
