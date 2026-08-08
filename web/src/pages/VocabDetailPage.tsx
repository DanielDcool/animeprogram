import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { playbackUrl } from '../player/playbackPosition';
import type { VocabDetail } from '../types';

function fmtTime(sec: number | null): string {
  if (sec == null) return '';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export default function VocabDetailPage() {
  const { id } = useParams();
  const vocabId = Number(id);
  const [item, setItem] = useState<VocabDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    api.getVocab(vocabId).then(setItem).catch(() => setFailed(true));
  }, [vocabId]);

  if (failed) return <main className="detail-state">単語が見つかりません。<br /><Link to="/vocab">← 単語帳へ戻る</Link></main>;
  if (!item) return <main className="detail-state">読み込み中…</main>;

  return (
    <main className="library vocab-detail">
      <Link className="vocab-back" to="/vocab">← 単語帳へ戻る</Link>
      <header className="vocab-detail-header">
        <div>
          <p className="eyebrow">VOCAB DETAIL</p>
          <h1>{item.kind === 'word' ? item.word : item.sentence}</h1>
          {item.kind === 'word' && item.reading && item.reading !== item.word && <p className="vocab-detail-reading">{item.reading}</p>}
        </div>
      </header>

      <section className="vocab-detail-section">
        <h2>保存した説明</h2>
        <p>{item.kind === 'word' ? item.gloss || '保存された辞書説明はありません。' : item.translation || '保存された翻訳はありません。'}</p>
      </section>

      <section className="vocab-detail-section">
        <h2>元のセリフ</h2>
        <p className="vocab-detail-sentence">{item.sentence}</p>
        {item.mediaId != null && item.series && (
          <Link className="primary-link vocab-video-link" to={playbackUrl(item.mediaId, item.positionSec)}>
            {item.series}{item.episode != null && ` 第${item.episode}話`}
            {item.positionSec != null && ` ${fmtTime(item.positionSec)}`} から再生
          </Link>
        )}
      </section>

      <section className="vocab-detail-section">
        <h2>AI 講解キャッシュ</h2>
        {item.aiExplanation ? (
          <dl className="vocab-explanation">
            <dt>翻訳</dt><dd>{item.aiExplanation.translation}</dd>
            <dt>文法構造</dt><dd>{item.aiExplanation.structure}</dd>
            <dt>表現</dt>
            {item.aiExplanation.expressions.map((expression, index) => (
              <dd key={index}><b>{expression.expression}</b> — {expression.meaning}</dd>
            ))}
            <dt>ニュアンス</dt><dd>{item.aiExplanation.nuance}</dd>
          </dl>
        ) : (
          <p className="panel-idle">このセリフには保存済みの AI 講解がありません。ここから新しい AI リクエストは行いません。</p>
        )}
      </section>
    </main>
  );
}
