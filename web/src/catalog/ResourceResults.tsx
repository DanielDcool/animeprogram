import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ResourceCategory, ResourceSearchResponse } from '../types';
import {
  compatibilityMessage,
  resourceMetaLabels,
  resourceStateCopy,
  type ResourceViewState,
} from './resourceView';

const CATEGORIES: Array<{ value: ResourceCategory; label: string }> = [
  { value: 'english', label: '字幕付き' },
  { value: 'raw', label: '字幕なし' },
  { value: 'all', label: 'すべて' },
];

interface ApiFailure extends Error {
  body?: { externalSearchUrl?: string };
}

export default function ResourceResults({ animeId }: { animeId: number }) {
  const [category, setCategory] = useState<ResourceCategory>('english');
  const [state, setState] = useState<ResourceViewState>('idle');
  const [result, setResult] = useState<ResourceSearchResponse | null>(null);
  const [errorFallback, setErrorFallback] = useState('');

  useEffect(() => {
    setCategory('english');
    setState('idle');
    setResult(null);
    setErrorFallback('');
  }, [animeId]);

  async function load(nextCategory = category) {
    setState('loading');
    setErrorFallback('');
    try {
      const response = await api.catalogResources(animeId, nextCategory);
      setResult(response);
      setState(response.items.length ? 'ready' : 'empty');
    } catch (error) {
      setResult(null);
      setErrorFallback((error as ApiFailure).body?.externalSearchUrl ?? '');
      setState('error');
    }
  }

  function changeCategory(nextCategory: ResourceCategory) {
    setCategory(nextCategory);
    if (state !== 'idle') void load(nextCategory);
  }

  const fallbackUrl = result?.externalSearchUrl || errorFallback;

  return (
    <section className="detail-section download-section">
      <p className="eyebrow">LOCAL DOWNLOAD</p>
      <h2>ローカル用リソース</h2>
      <p className="download-explainer">
        動画はこのサーバーではなく、この Mac のダウンロード先に保存されます。
        Transmission などの保存先を <code>~/AnimeLibrary</code> にすると、完了後そのままライブラリへ追加できます。
      </p>

      <div className="download-controls">
        <div className="download-tabs" aria-label="リソース分類">
          {CATEGORIES.map((option) => (
            <button
              className={category === option.value ? 'active' : ''}
              key={option.value}
              type="button"
              onClick={() => changeCategory(option.value)}
              disabled={state === 'loading'}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          className="download-search"
          type="button"
          onClick={() => void load()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? '検索中…' : 'ダウンロードを探す'}
        </button>
      </div>

      {state !== 'ready' && (
        <div className={`download-state ${state}`}>
          <p>{resourceStateCopy(state)}</p>
          {(state === 'empty' || state === 'error') && fallbackUrl && (
            <a href={fallbackUrl} target="_blank" rel="noreferrer">Nyaa で検索 ↗</a>
          )}
        </div>
      )}

      {state === 'ready' && result && (
        <div className="download-results">
          <div className="download-summary">
            <span>「{result.query}」の候補 {result.items.length}件</span>
            <a href={result.externalSearchUrl} target="_blank" rel="noreferrer">Nyaa で続けて見る ↗</a>
          </div>
          {result.items.map((resource) => {
            const warning = compatibilityMessage(resource);
            return (
              <article className="download-card" key={resource.id}>
                <div className="download-card-main">
                  <div className="download-badges">
                    {resource.trusted && <span className="trusted-badge">信頼済み</span>}
                    {resource.remake && <span className="remake-badge">再投稿</span>}
                  </div>
                  <h3>{resource.title}</h3>
                  <div className="download-meta">
                    {resourceMetaLabels(resource).map((label) => <span key={label}>{label}</span>)}
                  </div>
                  {warning && <p className="download-warning">{warning}</p>}
                </div>
                <div className="download-actions">
                  <a className="primary-link" href={resource.magnet}>ローカルのダウンロードアプリで開く</a>
                  <a href={resource.detailUrl} target="_blank" rel="noreferrer">Nyaa の詳細 ↗</a>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="download-footnote">利用条件と権利者の許可を確認できるリソースだけをダウンロードしてください。</p>
    </section>
  );
}
