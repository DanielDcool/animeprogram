import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { scoreLabel, statusLabel } from '../catalog/view';
import { airYearLabel, courLabel, networkLabel } from '../drama/view';
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
        <span className="anime-score">{scoreLabel(drama.score)}</span>
      </div>
      <div className="anime-card-body">
        <h3>{drama.title}</h3>
        <p className="anime-romaji">
          {[airYearLabel(drama.startDate), networkLabel(drama.network)].filter(Boolean).join(' · ')}
        </p>
        <div className="anime-tags">
          {drama.level && <span className="level-tag">{drama.level}</span>}
          <span>{statusLabel(drama.status)}</span>
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
  const [season, setSeason] = useState<'current' | 'previous'>('current');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogDrama[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHome(await api.dramaHome());
    } catch {
      setError('ドラマ情報を取得できませんでした。ネットワークを確認して、もう一度お試しください。');
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
      setResults((await api.dramaSearch(term)).items);
    } catch {
      setError('検索できませんでした。しばらくしてから再試行してください。');
    } finally {
      setSearching(false);
    }
  }

  const configured = home?.tmdbConfigured ?? false;
  const seasonalItems = useMemo(() => home?.[season].items ?? [], [home, season]);

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
            placeholder={configured ? '作品名を日本語で検索' : 'TMDB トークン未設定'}
            aria-label="ドラマを検索"
            disabled={!configured}
          />
          <button type="submit" disabled={searching || !configured}>{searching ? '検索中…' : '検索'}</button>
          {results && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => { setQuery(''); setResults(null); setError(''); }}
            >
              厳選へ戻る
            </button>
          )}
        </form>
      </section>

      {!loading && !configured && (
        <div className="status-message" role="status">
          <p>
            TMDB のトークンを設定すると、今期のドラマ一覧と検索が使えるようになります。
            未設定のままでも、下の厳選リストから資料の検索・字幕の取得・学習まで進められます。
          </p>
          <Link className="primary-link" to="/settings">設定を開く →</Link>
        </div>
      )}

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
            <div className="anime-grid">{results.map((drama) => <DramaCard drama={drama} key={drama.id} />)}</div>
          ) : (
            <div className="empty-catalog">該当する作品が見つかりませんでした。別の表記でも試してみてください。</div>
          )}
        </section>
      ) : home && (
        <>
          {home.hero && (
            <section
              className="catalog-hero drama-hero"
              style={home.hero.bannerImage
                ? { backgroundImage: `linear-gradient(90deg, rgba(251, 250, 247, .98) 0%, rgba(251, 250, 247, .86) 46%, rgba(251, 250, 247, .18) 100%), url("${home.hero.bannerImage}")` }
                : undefined}
            >
              <div className="hero-content">
                <span className="hero-badge">{home.hero.recommendation?.badge ?? '注目作'}</span>
                <h2>{home.hero.title}</h2>
                <p className="hero-romaji">
                  {[airYearLabel(home.hero.startDate), networkLabel(home.hero.network)].filter(Boolean).join(' · ')}
                </p>
                <p className="hero-reason">{home.hero.recommendation?.reason}</p>
                <div className="hero-meta">
                  {home.hero.level && <span>目安 {home.hero.level}</span>}
                  <span>{statusLabel(home.hero.status)}</span>
                </div>
                <Link className="primary-link" to={`/drama/${home.hero.id}`}>作品を見る →</Link>
              </div>
            </section>
          )}

          <section className="catalog-section editorial-section">
            <div className="section-heading">
              <div><p className="eyebrow">EDITOR'S PICK</p><h2>日本語学習に効くドラマ</h2></div>
              <p>職場と日常の会話という切り口で選びました</p>
            </div>
            <div className="drama-pick-grid">
              {home.featured.map((drama, index) => (
                <Link to={`/drama/${drama.id}`} className="drama-pick-card" key={drama.id}>
                  <span className="pick-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="drama-pick-body">
                    <span className="pick-badge">{drama.recommendation?.badge}</span>
                    <h3>{drama.title}</h3>
                    <p className="drama-pick-meta">
                      {[drama.level && `目安 ${drama.level}`, airYearLabel(drama.startDate)].filter(Boolean).join(' · ')}
                    </p>
                    <p>{drama.recommendation?.reason}</p>
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

          {configured && (
            <section className="catalog-section">
              <div className="section-heading season-heading">
                <div><p className="eyebrow">SEASONAL</p><h2>クール別</h2></div>
                <div className="season-tabs" role="tablist" aria-label="放送時期">
                  <button
                    className={season === 'current' ? 'active' : ''}
                    onClick={() => setSeason('current')}
                    role="tab"
                    aria-selected={season === 'current'}
                  >
                    {courLabel(home.current)}
                  </button>
                  <button
                    className={season === 'previous' ? 'active' : ''}
                    onClick={() => setSeason('previous')}
                    role="tab"
                    aria-selected={season === 'previous'}
                  >
                    {courLabel(home.previous)}
                  </button>
                </div>
              </div>
              <div className="anime-grid">{seasonalItems.map((drama) => <DramaCard drama={drama} key={drama.id} />)}</div>
            </section>
          )}
        </>
      )}

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>{MARQUEE_TEXT.repeat(8)}</span>
          <span>{MARQUEE_TEXT.repeat(8)}</span>
        </div>
      </div>
      <footer className="catalog-footer">
        作品データ：TMDB。本製品は TMDB の API を利用していますが、TMDB による推奨・認証を受けたものではありません。
      </footer>
    </main>
  );
}
