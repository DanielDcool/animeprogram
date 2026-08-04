import { useLayoutEffect, useRef } from 'react';
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
  const currentRef = useRef<HTMLLIElement>(null);

  // タブを開いた時点で、現在の句をすぐ読みやすい位置に表示する。
  useLayoutEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, [currentIdx]);

  if (cues.length === 0) return <p className="panel-idle">字幕がありません。</p>;

  return (
    <ol className="transcript">
      {cues.map((c, i) => (
        <li ref={i === currentIdx ? currentRef : null} key={i} className={i === currentIdx ? 'current' : ''} onClick={() => onSelect(i)}>
          <span className="t">{fmt(c.start)}</span>
          <span>{c.text}</span>
        </li>
      ))}
    </ol>
  );
}
