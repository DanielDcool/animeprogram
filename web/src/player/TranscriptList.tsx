import { useEffect, useRef } from 'react';
import type { Cue } from '../types';

interface Props {
  cues: Cue[];
  currentIdx: number;
  onSelect: (idx: number) => void;
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export default function TranscriptList({ cues, currentIdx, onSelect }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  // 再生に合わせて現在の句を自動スクロール
  useEffect(() => {
    listRef.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIdx]);

  if (cues.length === 0) return <p className="panel-idle">字幕がありません。</p>;

  return (
    <ol className="transcript" ref={listRef}>
      {cues.map((c, i) => (
        <li key={i} className={i === currentIdx ? 'current' : ''} onClick={() => onSelect(i)}>
          <span className="t">{fmt(c.start)}</span>
          <span>{c.text}</span>
        </li>
      ))}
    </ol>
  );
}
