import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import type { SubtitleData } from '../types';
import {
  initialState,
  reduce,
  currentCueIndex,
  replayTargetIndex,
  analysisCueIndex,
  type LearnState,
  type LearnAction,
  type Effect,
} from '../player/learningMode';
import SubtitleOverlay from '../player/SubtitleOverlay';
import AnalysisPanel from '../player/AnalysisPanel';
import TranscriptList from '../player/TranscriptList';
import {
  DEFAULT_PLAYER_WIDTH,
  normalizeStoredPlayerWidth,
  playerWidthFromPointer,
  resizePlayerWidthByKey,
} from '../player/playerLayout';

const PLAYER_WIDTH_KEY = 'player-main-width';

export default function PlayerPage() {
  const { id } = useParams();
  const mediaId = Number(id);
  const pageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const playerWidthRef = useRef(DEFAULT_PLAYER_WIDTH);
  const resizingRef = useRef(false);
  const lastReplayAtRef = useRef<number | null>(null);
  const [subs, setSubs] = useState<SubtitleData | null>(null);
  const [subError, setSubError] = useState(false);
  const [learn, setLearn] = useState<LearnState>(initialState);
  const [time, setTime] = useState(0);
  const [selectedAnalysisCueIdx, setSelectedAnalysisCueIdx] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<'analysis' | 'transcript'>('analysis');
  const [explainRequest, setExplainRequest] = useState({ id: 0, sentence: null as string | null });
  const [playerWidth, setPlayerWidth] = useState(() => normalizeStoredPlayerWidth(localStorage.getItem(PLAYER_WIDTH_KEY)));
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    playerWidthRef.current = playerWidth;
  }, [playerWidth]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === videoWrapRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    api.subtitles(mediaId).then(setSubs).catch(() => setSubError(true));
  }, [mediaId]);

  const cues = subs?.cues ?? [];
  const cueIdx = useMemo(() => currentCueIndex(cues, time), [cues, time]);
  const cue = cueIdx >= 0 ? cues[cueIdx] : null;
  const analysisCue = selectedAnalysisCueIdx == null ? null : cues[selectedAnalysisCueIdx] ?? null;

  useEffect(() => {
    setSelectedAnalysisCueIdx((selectedCueIdx) => analysisCueIndex(selectedCueIdx, cueIdx, learn.paused));
  }, [cueIdx, learn.paused]);

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

  function togglePause() {
    lastReplayAtRef.current = null;
    dispatch({ type: 'TOGGLE_PAUSE' });
  }

  function replayCue() {
    const now = Date.now();
    const targetIdx = replayTargetIndex(cueIdx, lastReplayAtRef.current, now);
    lastReplayAtRef.current = now;
    if (targetIdx === cueIdx) dispatch({ type: 'REPLAY', cueStart: cue?.start ?? null });
    else dispatch({ type: 'JUMP', cueStart: cues[targetIdx]?.start ?? null });
  }

  function jumpCue(direction: -1 | 1) {
    lastReplayAtRef.current = null;
    dispatch({ type: 'JUMP', cueStart: cues[cueIdx + direction]?.start ?? null });
  }

  function toggleTranscript() {
    lastReplayAtRef.current = null;
    setPanelMode((m) => (m === 'analysis' ? 'transcript' : 'analysis'));
  }

  function requestExplanation() {
    lastReplayAtRef.current = null;
    const sentence = analysisCue?.text ?? null;
    if (!sentence) return;
    setPanelMode('analysis');
    setExplainRequest((request) => ({ id: request.id + 1, sentence }));
  }

  // ホットキー
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePause(); break;
        case 'KeyA': if (!e.repeat) replayCue(); break;
        case 'ArrowLeft': e.preventDefault(); jumpCue(-1); break;
        case 'ArrowRight': e.preventDefault(); jumpCue(1); break;
        case 'KeyD': requestExplanation(); break;
        case 'KeyS': toggleAlwaysOn(); break;
        case 'KeyT': toggleTranscript(); break;
        case 'BracketLeft': adjustOffset(-100); break;
        case 'BracketRight': adjustOffset(+100); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function adjustOffset(deltaMs: number) {
    lastReplayAtRef.current = null;
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

  function toggleAlwaysOn() {
    lastReplayAtRef.current = null;
    dispatch({ type: 'TOGGLE_ALWAYS_ON' });
  }

  function playerContentBox() {
    const page = pageRef.current;
    if (!page) return null;
    const rect = page.getBoundingClientRect();
    const style = getComputedStyle(page);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    return {
      left: rect.left + paddingLeft,
      width: page.clientWidth - paddingLeft - paddingRight,
    };
  }

  function rememberPlayerWidth(width: number) {
    playerWidthRef.current = width;
    setPlayerWidth(width);
    localStorage.setItem(PLAYER_WIDTH_KEY, String(width));
  }

  async function toggleFullscreen() {
    const wrap = videoWrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement === wrap) await document.exitFullscreen();
    else await wrap.requestFullscreen();
  }

  return (
    <main
      ref={pageRef}
      className="player-page"
      style={{ '--player-main-width': `${playerWidth}%` } as CSSProperties}
    >
      <div className="player-main">
        <div ref={videoWrapRef} className="video-wrap">
          <span className="mode-badge">
            {learn.alwaysOn ? '字幕常時ON' : learn.revealed ? '学習モード・一時停止で字幕表示中' : '学習モード・字幕OFF'}
          </span>
          <button
            type="button"
            className="fullscreen-button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? '全画面を終了' : '字幕付きで全画面再生'}
            title={fullscreen ? '全画面を終了' : '字幕付きで全画面再生'}
          >
            {fullscreen ? '全画面を終了' : '⛶ 全画面'}
          </button>
          <video
            ref={videoRef}
            src={`/api/media/${mediaId}/stream`}
            controls
            controlsList="nofullscreen"
            autoPlay
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => dispatch({ type: 'EXTERNAL_PLAY' })}
            onPause={() => dispatch({ type: 'EXTERNAL_PAUSE' })}
          />
          <SubtitleOverlay text={cue?.text ?? null} visible={subtitleVisible} />
        </div>
        <div className="hotkeys">
          <button type="button" className="key-chip" onClick={togglePause}><b>Space</b>暂停+显示字幕</button>
          <button type="button" className="key-chip" onClick={replayCue}><b>A</b>回到本句重听</button>
          <button type="button" className="key-chip" onClick={() => jumpCue(-1)}><b>←</b>上一句</button>
          <button type="button" className="key-chip" onClick={() => jumpCue(1)}><b>→</b>下一句</button>
          <button type="button" className="key-chip" onClick={requestExplanation}><b>D</b>AI 深度讲解</button>
          <button type="button" className="key-chip" onClick={toggleAlwaysOn}><b>S</b>字幕常显 {learn.alwaysOn ? <span className="on">ON</span> : 'OFF'}</button>
          <button type="button" className="key-chip" onClick={toggleTranscript}><b>T</b>字幕一覧</button>
          <button type="button" className="key-chip" onClick={() => adjustOffset(-100)}><b>[</b>偏移 −100ms</button>
          <button type="button" className="key-chip" onClick={() => adjustOffset(+100)}><b>]</b>偏移 +100ms</button>
          <span className="key-chip">偏移 {subs ? `${subs.offsetMs}ms` : '—'}</span>
          <Link to="/library">← ライブラリ</Link>
        </div>
        {subError && <p className="warn">この動画に字幕がありません。学習モードは使えません。</p>}
      </div>
      <div
        className="player-resizer"
        role="separator"
        aria-label="動画と解析パネルの幅を調整"
        aria-orientation="vertical"
        aria-valuemin={40}
        aria-valuemax={80}
        aria-valuenow={Math.round(playerWidth)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.focus();
          e.preventDefault();
          resizingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!resizingRef.current) return;
          const box = playerContentBox();
          if (!box) return;
          const width = playerWidthFromPointer(e.clientX, box.left, box.width);
          playerWidthRef.current = width;
          setPlayerWidth(width);
        }}
        onPointerUp={(e) => {
          resizingRef.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          localStorage.setItem(PLAYER_WIDTH_KEY, String(playerWidthRef.current));
        }}
        onPointerCancel={() => { resizingRef.current = false; }}
        onKeyDown={(e) => {
          const box = playerContentBox();
          const width = resizePlayerWidthByKey(playerWidthRef.current, e.key, box?.width ?? window.innerWidth);
          if (width == null) return;
          e.preventDefault();
          rememberPlayerWidth(width);
        }}
      />
      <aside className="analysis-panel">
        <div className="panel-tabs">
          <button className={`tab${panelMode === 'analysis' ? ' active' : ''}`} onClick={() => setPanelMode('analysis')}>解析</button>
          <button className={`tab${panelMode === 'transcript' ? ' active' : ''}`} onClick={() => setPanelMode('transcript')}>字幕一覧</button>
        </div>
        {panelMode === 'transcript' ? (
          <TranscriptList
            cues={cues}
            currentIdx={cueIdx}
            onSelect={(i) => {
              lastReplayAtRef.current = null;
              setSelectedAnalysisCueIdx(i);
              dispatch({ type: 'SELECT', cueStart: cues[i].start });
              setPanelMode('analysis');
            }}
          />
        ) : (
          <AnalysisPanel
            sentence={analysisCue?.text ?? null}
            context={selectedAnalysisCueIdx != null && analysisCue
              ? cues.slice(Math.max(0, selectedAnalysisCueIdx - 2), selectedAnalysisCueIdx + 3).map((c) => c.text)
              : []}
            mediaId={mediaId}
            positionSec={analysisCue?.start ?? time}
            explainRequest={explainRequest}
          />
        )}
      </aside>
    </main>
  );
}
