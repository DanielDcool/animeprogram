import { useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom';
import LibraryPage from './pages/LibraryPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';
import VocabPage from './pages/VocabPage';
import VocabDetailPage from './pages/VocabDetailPage';
import DiscoverPage from './pages/DiscoverPage';
import DramaDiscoverPage from './pages/DramaDiscoverPage';
import AnimeDetailPage from './pages/AnimeDetailPage';
import DramaDetailPage from './pages/DramaDetailPage';
import NotFoundPage from './pages/NotFoundPage';
import BrandMark from './components/BrandMark';
import {
  MODE_STORAGE_KEY,
  effectiveMode,
  normalizeStoredMode,
  type ContentMode,
} from './mode';

/** 詳細ページは自分のモードを強制する（履歴から直接開いても配色がずれないように） */
function ForceMode(
  { mode, onForce, children }: { mode: ContentMode; onForce: (mode: ContentMode) => void; children: ReactNode },
) {
  useEffect(() => { onForce(mode); }, [mode, onForce]);
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const [mode, setMode] = useState<ContentMode>(
    () => normalizeStoredMode(localStorage.getItem(MODE_STORAGE_KEY)),
  );

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', effectiveMode(mode, location.pathname));
  }, [mode, location.pathname]);

  return (
    <div className="app">
      <nav className="topnav">
        <Link className="brand" to="/" aria-label="tanku ホーム">
          <BrandMark size={22} />
          <span className="brand-name">tanku</span>
          <span className="brand-sub">{mode === 'drama' ? 'DRAMA' : 'ANIME'}</span>
        </Link>
        <div className="mode-switch" role="group" aria-label="コンテンツの種類">
          <button
            type="button"
            className={mode === 'anime' ? 'active' : ''}
            aria-pressed={mode === 'anime'}
            onClick={() => setMode('anime')}
          >
            アニメ
          </button>
          <button
            type="button"
            className={mode === 'drama' ? 'active' : ''}
            aria-pressed={mode === 'drama'}
            onClick={() => setMode('drama')}
          >
            ドラマ
          </button>
        </div>
        <div className="nav-links">
          <NavLink to="/" end>見つける</NavLink>
          <NavLink to="/library">ライブラリ</NavLink>
          <NavLink to="/vocab">単語帳</NavLink>
          <NavLink to="/settings">設定</NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={mode === 'drama' ? <DramaDiscoverPage /> : <DiscoverPage />} />
        <Route
          path="/anime/:id"
          element={<ForceMode mode="anime" onForce={setMode}><AnimeDetailPage /></ForceMode>}
        />
        <Route
          path="/drama/:id"
          element={<ForceMode mode="drama" onForce={setMode}><DramaDetailPage /></ForceMode>}
        />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/play/:id" element={<PlayerPage />} />
        <Route path="/vocab" element={<VocabPage />} />
        <Route path="/vocab/:id" element={<VocabDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
