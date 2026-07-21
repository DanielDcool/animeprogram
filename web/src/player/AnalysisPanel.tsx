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
      <div className="panel-body">
        <p className="panel-idle">Space で一時停止すると、現在のセリフをここで解析します。<br />聞き取れるまでは字幕を見ない――それが上達のコツ。<br />字幕一覧タブ（T）から好きな句を選んで解析もできます。</p>
      </div>
    );
  }

  const activeToken = active != null ? tokens[active] : null;

  return (
    <div className="panel-body">
      <h2>現在のセリフ</h2>

      {/* 原句：選択中の語をハイライト */}
      <div className="sentence">
        {tokens.length > 0
          ? tokens.map((t, i) => (
              <span key={i} className={active === i ? 'hl' : ''}>{t.surface}</span>
            ))
          : sentence}
      </div>

      <div className="token-row">
        {tokens.map((t, i) =>
          t.pos === '記号' ? (
            <span key={i} className="token-punct">{t.surface}</span>
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
          <div className="head">
            <b>{activeToken.base}</b>
            <span className="reading">{activeToken.reading}</span>
            <span className="pos-tag">{activeToken.pos}{activeToken.posDetail && `・${activeToken.posDetail}`}</span>
          </div>
          {activeToken.surface !== activeToken.base && (
            <div className="conj">活用形: {activeToken.surface} → {activeToken.base}</div>
          )}
          {activeToken.glosses.length > 0
            ? activeToken.glosses.map((g, i) => <div key={i} className="meaning">{g.gloss}</div>)
            : <div className="none">辞書に見つかりません</div>}
        </div>
      )}

      <div className="explain-box">
        <div className="ai-label">AI 講解（D で生成）</div>
        {explanation ? (
          <dl>
            <dt>翻訳</dt><dd>{explanation.translation}</dd>
            <dt>文法構造</dt><dd>{explanation.structure}</dd>
            <dt>表現</dt>
            {explanation.expressions.map((e, i) => <dd key={i}><b>{e.expression}</b> — {e.meaning}</dd>)}
            <dt>ニュアンス</dt><dd>{explanation.nuance}</dd>
          </dl>
        ) : explainState === 'loading' ? (
          <p className="hint">AI 解説を生成中…</p>
        ) : explainState === 'unconfigured' ? (
          <p className="hint">API キー未設定。設定ページで Anthropic API キーを入れてください。</p>
        ) : explainState === 'error' ? (
          <p className="hint">AI 解説に失敗しました。<button onClick={requestExplain}>再試行</button></p>
        ) : (
          <button onClick={requestExplain}>この文を AI で深掘りする</button>
        )}
      </div>

      <button className="fav-btn" disabled title="第二版で実装予定">☆ この文を保存（近日公開）</button>
    </div>
  );
}
