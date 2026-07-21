import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import type { SubtitleData } from '../types';
import { initialState, reduce, currentCueIndex, type LearnState, type LearnAction, type Effect } from '../player/learningMode';
import SubtitleOverlay from '../player/SubtitleOverlay';
import AnalysisPanel from '../player/AnalysisPanel';

export default function PlayerPage() {
  const { id } = useParams();
  const mediaId = Number(id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [subs, setSubs] = useState<SubtitleData | null>(null);
  const [subError, setSubError] = useState(false);
  const [learn, setLearn] = useState<LearnState>(initialState);
  const [time, setTime] = useState(0);

  useEffect(() => {
    api.subtitles(mediaId).then(setSubs).catch(() => setSubError(true));
  }, [mediaId]);

  const cues = subs?.cues ?? [];
  const cueIdx = useMemo(() => currentCueIndex(cues, time), [cues, time]);
  const cue = cueIdx >= 0 ? cues[cueIdx] : null;

  const runEffects = useCallback((effects: Effect[]) => {
    const v = videoRef.current;
    if (!v) return;
    for (const e of effects) {
      if (e.type === 'pause') v.pause();
      else if (e.type === 'play') v.play();
      else if (e.type === 'seek') { v.currentTime = e.time + 0.01; setTime(e.time + 0.01); }
    }
  }, []);

  const dispatch = useCallback((action: LearnAction) => {
    setLearn((s) => {
      const { state, effects } = reduce(s, action);
      runEffects(effects);
      return state;
    });
  }, [runEffects]);

  // ホットキー
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); dispatch({ type: 'TOGGLE_PAUSE' }); break;
        case 'KeyA': dispatch({ type: 'REPLAY', cueStart: cue?.start ?? null }); break;
        case 'ArrowLeft': e.preventDefault(); dispatch({ type: 'JUMP', cueStart: cueIdx > 0 ? cues[cueIdx - 1].start : null }); break;
        case 'ArrowRight': e.preventDefault(); dispatch({ type: 'JUMP', cueStart: cueIdx < cues.length - 1 ? cues[cueIdx + 1].start : null }); break;
        case 'KeyS': dispatch({ type: 'TOGGLE_ALWAYS_ON' }); break;
        case 'BracketLeft': adjustOffset(-100); break;
        case 'BracketRight': adjustOffset(+100); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function adjustOffset(deltaMs: number) {
    if (!subs) return;
    const next = subs.offsetMs + deltaMs;
    await api.setOffset(mediaId, next);
    const fresh = await api.subtitles(mediaId);
    setSubs(fresh);
  }

  // 視聴位置の保存（5 秒毎）
  useEffect(() => {
    const t = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) api.saveProgress(mediaId, v.currentTime);
    }, 5000);
    return () => clearInterval(t);
  }, [mediaId]);

  const subtitleVisible = learn.alwaysOn || learn.revealed;

  return (
    <main className="player-page">
      <div className="player-main">
        <div className="video-wrap">
          <video
            ref={videoRef}
            src={`/api/media/${mediaId}/stream`}
            controls
            autoPlay
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => dispatch({ type: 'EXTERNAL_PLAY' })}
            onPause={() => dispatch({ type: 'EXTERNAL_PAUSE' })}
          />
          <SubtitleOverlay text={cue?.text ?? null} visible={subtitleVisible} />
        </div>
        <div className="hotkeys">
          <span><b>Space</b> 暂停+显示字幕</span>
          <span><b>A</b> 回到本句重听</span>
          <span><b>←/→</b> 上一句/下一句</span>
          <span><b>S</b> 字幕常显 {learn.alwaysOn ? 'ON' : 'OFF'}</span>
          <span><b>[ ]</b> 字幕偏移 {subs ? `${subs.offsetMs}ms` : ''}</span>
          <Link to="/">← ライブラリ</Link>
        </div>
        {subError && <p className="warn">この動画に字幕がありません。学習モードは使えません。</p>}
      </div>
      <AnalysisPanel
        sentence={learn.paused && cue ? cue.text : null}
        context={cueIdx >= 0 ? cues.slice(Math.max(0, cueIdx - 2), cueIdx + 3).map((c) => c.text) : []}
      />
    </main>
  );
}
