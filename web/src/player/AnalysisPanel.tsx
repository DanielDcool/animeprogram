import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Token, Explanation } from '../types';

interface Props {
  sentence: string | null;   // 一時停止中の現在の句。null = 再生中
  context: string[];
}

export default function AnalysisPanel({ sentence, context }: Props) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explainState, setExplainState] = useState<'idle' | 'loading' | 'error' | 'unconfigured'>('idle');

  useEffect(() => {
    setTokens([]); setActive(null); setExplanation(null); setExplainState('idle');
    if (!sentence) return;
    api.analyze(sentence).then((r) => setTokens(r.tokens)).catch(console.error);
  }, [sentence]);

  // D キーで深掘り解説
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'KeyD' && sentence) requestExplain(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function requestExplain() {
    if (!sentence || explainState === 'loading' || explanation) return;
    setExplainState('loading');
    try {
      const r = await api.explain(sentence, context);
      setExplanation(r.explanation);
      setExplainState('idle');
    } catch (err: any) {
      setExplainState(err?.status === 503 ? 'unconfigured' : 'error');
    }
  }

  if (!sentence) {
    return (
      <aside className="analysis-panel">
        <h2>解析パネル</h2>
        <p style={{ color: '#777' }}>Space で一時停止すると、現在のセリフを解析します。</p>
      </aside>
    );
  }

  const activeToken = active != null ? tokens[active] : null;

  return (
    <aside className="analysis-panel">
      <h2>現在のセリフ</h2>
      <div className="sentence">{sentence}</div>

      <div>
        {tokens.map((t, i) =>
          t.pos === '記号' ? (
            <span key={i}>{t.surface}</span>
          ) : (
            <span
              key={i}
              className={`token-chip${active === i ? ' active' : ''}`}
              onClick={() => setActive(active === i ? null : i)}
            >
              {t.surface}
            </span>
          ),
        )}
      </div>

      {activeToken && (
        <div className="gloss-box">
          <div>
            <b>{activeToken.base}</b>
            <span className="reading">{activeToken.reading}</span>
            <span className="reading">［{activeToken.pos}{activeToken.posDetail && `・${activeToken.posDetail}`}］</span>
          </div>
          {activeToken.surface !== activeToken.base && <div className="reading">活用形: {activeToken.surface} → {activeToken.base}</div>}
          {activeToken.glosses.length > 0
            ? activeToken.glosses.map((g, i) => <div key={i}>{g.gloss}</div>)
            : <div className="reading">辞書に見つかりません</div>}
        </div>
      )}

      <div className="explain-box">
        {explanation ? (
          <dl>
            <dt>翻訳</dt><dd>{explanation.translation}</dd>
            <dt>文法構造</dt><dd>{explanation.structure}</dd>
            <dt>表現</dt>
            {explanation.expressions.map((e, i) => <dd key={i}><b>{e.expression}</b> — {e.meaning}</dd>)}
            <dt>ニュアンス</dt><dd>{explanation.nuance}</dd>
          </dl>
        ) : explainState === 'loading' ? (
          <p>AI 解説を生成中…</p>
        ) : explainState === 'unconfigured' ? (
          <p>API キー未設定。設定ページで Anthropic API キーを入れてください。</p>
        ) : explainState === 'error' ? (
          <p>AI 解説に失敗しました。<button onClick={requestExplain}>再試行</button></p>
        ) : (
          <button onClick={requestExplain}>AI 深度講解（D）</button>
        )}
      </div>
    </aside>
  );
}
