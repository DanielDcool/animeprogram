import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { api, joinApiBase } from '../api';
import type { MediaItem, SubtitleData } from '../types';
import {
  initialState,
  reduce,
  currentCueIndex,
  replayTargetIndex,
  analysisCueIndex,
  storedAlwaysOnPreference,
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
import { linkedPlaybackPosition, playbackStartPosition } from '../player/playbackPosition';
import { episodeNavigation } from '../player/episodeNavigation';
import { formatClock, seekTimeFromFraction, progressFraction } from '../player/playerControls';

const PLAYER_WIDTH_KEY = 'player-main-width';
const SUBTITLE_ALWAYS_ON_KEY = 'player-subtitles-always-on';

export default function PlayerPage() {
  const { id } = useParams();
  const mediaId = Number(id);
  const location = useLocation();
  const navigate = useNavigate();
  const initialSearch = useMemo(() => location.search, [mediaId]);
  const pageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const playerWidthRef = useRef(DEFAULT_PLAYER_WIDTH);
  const resizingRef = useRef(false);
  const lastReplayAtRef = useRef<number | null>(null);
  const [subs, setSubs] = useState<SubtitleData | null>(null);
  const [subError, setSubError] = useState(false);
  const [learn, setLearn] = useState<LearnState>(() => ({
    ...initialState,
    alwaysOn: storedAlwaysOnPreference(localStorage.getItem(SUBTITLE_ALWAYS_ON_KEY)),
  }));
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedAnalysisCueIdx, setSelectedAnalysisCueIdx] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<'analysis' | 'transcript'>('analysis');
  const [explainRequest, setExplainRequest] = useState({ id: 0, sentence: null as string | null });
  const [playerWidth, setPlayerWidth] = useState(() => normalizeStoredPlayerWidth(localStorage.getItem(PLAYER_WIDTH_KEY)));
  const [fullscreen, setFullscreen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [episodeError, setEpisodeError] = useState(false);

  useEffect(() => {
    playerWidthRef.current = playerWidth;
  }, [playerWidth]);

  useEffect(() => {
    localStorage.setItem(SUBTITLE_ALWAYS_ON_KEY, String(learn.alwaysOn));
  }, [learn.alwaysOn]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === videoWrapRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSubs(null);
    setSubError(false);
    setLearn((state) => ({ ...initialState, alwaysOn: state.alwaysOn }));
    setTime(0);
    setDuration(0);
    setIsPaused(false);
    setSelectedAnalysisCueIdx(null);
    setPanelMode('analysis');
    setExplainRequest({ id: 0, sentence: null });
    lastReplayAtRef.current = null;
    api.subtitles(mediaId)
      .then((result) => { if (!cancelled) setSubs(result); })
      .catch(() => { if (!cancelled) setSubError(true); });
    return () => { cancelled = true; };
  }, [mediaId]);

  useEffect(() => {
    api.listMedia()
      .then((items) => { setMediaItems(items); setEpisodeError(false); })
      .catch(() => setEpisodeError(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let removeMetadataListener = () => {};
    api.getProgress(mediaId).then(({ positionSec }) => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video) return;
      const start = playbackStartPosition(initialSearch, positionSec);
      const applyStart = () => {
        if (cancelled) return;
        video.currentTime = start;
        setTime(start);
      };
      if (video.readyState >= 1) applyStart();
      else {
        video.addEventListener('loadedmetadata', applyStart, { once: true });
        removeMetadataListener = () => video.removeEventListener('loadedmetadata', applyStart);
      }
      if (linkedPlaybackPosition(initialSearch) != null) navigate(`/play/${mediaId}`, { replace: true });
    }).catch(console.error);
    return () => {
      cancelled = true;
      removeMetadataListener();
    };
  }, [mediaId, initialSearch, navigate]);

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
        case 'Space': e.preventDefault(); if (!e.repeat) togglePause(); break;
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

  const saveVideoPosition = useCallback((video: HTMLVideoElement | null) => {
    if (video && Number.isFinite(video.currentTime) && video.currentTime > 0) {
      void api.saveProgress(mediaId, video.currentTime);
    }
  }, [mediaId]);

  // 視聴位置の保存（5 秒毎 + 一時停止/ページ移動時）
  useEffect(() => {
    const t = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) saveVideoPosition(v);
    }, 5000);
    return () => {
      clearInterval(t);
      saveVideoPosition(videoRef.current);
    };
  }, [saveVideoPosition]);

  const subtitleVisible = learn.alwaysOn || learn.revealed;
  const episodes = useMemo(() => episodeNavigation(mediaItems, mediaId), [mediaItems, mediaId]);
  const currentMedia = episodes.currentIndex >= 0 ? episodes.items[episodes.currentIndex] : null;
  const multipleSeries = new Set(episodes.items.map((item) => item.series)).size > 1;

  function episodeLabel(item: MediaItem) {
    const episode = item.episode == null ? '' : `第${item.episode}話`;
    return multipleSeries ? `${item.series}${episode && ` · ${episode}`}` : episode || item.series;
  }

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

  function handlePanelSpace(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.code !== 'Space') return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) togglePause();
  }

  function blockPanelSpaceKeyUp(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.code !== 'Space') return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <main
      ref={pageRef}
      className="player-page"
      style={{ '--player-main-width': `${playerWidth}%` } as CSSProperties}
    >
      <div className="player-main">
        <div ref={videoWrapRef} className={`video-wrap${isPaused ? ' is-paused' : ''}`}>
          <video
            ref={videoRef}
            src={joinApiBase(`/api/media/${mediaId}/stream`)}
            autoPlay
            onClick={togglePause}
            onKeyDownCapture={(e) => {
              if (e.code !== 'Space') return;
              e.preventDefault();
              e.stopPropagation();
              if (!e.repeat) togglePause();
            }}
            onKeyUpCapture={(e) => {
              if (e.code !== 'Space') return;
              e.preventDefault();
              e.stopPropagation();
            }}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => { setIsPaused(false); dispatch({ type: 'EXTERNAL_PLAY' }); }}
            onPause={(e) => {
              setIsPaused(true);
              saveVideoPosition(e.currentTarget);
              dispatch({ type: 'EXTERNAL_PAUSE' });
            }}
          />
          <SubtitleOverlay text={cue?.text ?? null} visible={subtitleVisible} />
          <div className="video-overlay">
            <button
              type="button"
              className="fullscreen-button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? '全画面を終了' : '字幕付きで全画面再生'}
              title={fullscreen ? '全画面を終了' : '字幕付きで全画面再生'}
            >
              {fullscreen ? '全画面を終了' : '⛶ 全画面'}
            </button>
            <div className="video-scrubber">
              <button
                type="button"
                className="scrub-play"
                onClick={togglePause}
                aria-label={isPaused ? '再生' : '一時停止'}
              >
                {isPaused ? '▶' : '❚❚'}
              </button>
              <span className="scrub-time">{formatClock(time)}</span>
              <input
                className="scrub-range"
                type="range"
                min={0}
                max={1000}
                step={1}
                value={Math.round(progressFraction(time, duration) * 1000)}
                aria-label="再生位置"
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  const next = seekTimeFromFraction(Number(e.currentTarget.value) / 1000, duration);
                  v.currentTime = next;
                  setTime(next);
                }}
              />
              <span className="scrub-time scrub-duration">{formatClock(duration)}</span>
            </div>
          </div>
        </div>
        <div className="player-controls">
          <div className="hotkeys primary-controls">
            <button type="button" className="key-chip" onClick={togglePause}><b>Space</b>一時停止・字幕表示</button>
            <button type="button" className="key-chip" onClick={replayCue}><b>A</b>この文を聞き直す</button>
            <button type="button" className="key-chip" onClick={() => jumpCue(-1)}><b>←</b>前の文</button>
            <button type="button" className="key-chip" onClick={() => jumpCue(1)}><b>→</b>次の文</button>
          </div>
          <div className="hotkeys secondary-controls">
            <button type="button" className="key-chip" onClick={requestExplanation}><b>D</b>AI 解説</button>
            <button type="button" className="key-chip" onClick={toggleAlwaysOn}><b>S</b>字幕常時表示 {learn.alwaysOn ? <span className="on">ON</span> : 'OFF'}</button>
            <button type="button" className="key-chip" onClick={toggleTranscript}><b>T</b>字幕一覧</button>
            <Link to="/library">← ライブラリ</Link>
          </div>
        </div>
        {episodeError && <p className="status-message error" role="alert">同じフォルダの動画を読み込めませんでした。</p>}
        {!episodeError && currentMedia && (
          <section className="episode-navigation" aria-label="エピソード選択">
            <header>
              <div>
                <strong>{currentMedia.folder}</strong>
                <span>{episodes.currentIndex + 1} / {episodes.items.length}</span>
              </div>
              <nav aria-label="前後のエピソード">
                {episodes.previous
                  ? <Link to={`/play/${episodes.previous.id}`}>← 前の話</Link>
                  : <span aria-disabled="true">← 前の話</span>}
                {episodes.next
                  ? <Link to={`/play/${episodes.next.id}`}>次の話 →</Link>
                  : <span aria-disabled="true">次の話 →</span>}
              </nav>
            </header>
            <div className="episode-list">
              {episodes.items.map((item) => (
                <Link
                  key={item.id}
                  to={`/play/${item.id}`}
                  className={item.id === mediaId ? 'current' : undefined}
                  aria-current={item.id === mediaId ? 'page' : undefined}
                >
                  {episodeLabel(item)}
                </Link>
              ))}
            </div>
          </section>
        )}
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
      <aside
        className="analysis-panel"
        onKeyDownCapture={handlePanelSpace}
        onKeyUpCapture={blockPanelSpaceKeyUp}
      >
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
