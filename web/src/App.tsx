import { Routes, Route, NavLink, Link } from 'react-router-dom';
import LibraryPage from './pages/LibraryPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';
import VocabPage from './pages/VocabPage';
import DiscoverPage from './pages/DiscoverPage';
import AnimeDetailPage from './pages/AnimeDetailPage';

export default function App() {
  return (
    <div className="app">
      <nav className="topnav">
        <Link className="brand" to="/">ことばアニメ</Link>
        <div className="nav-links">
          <NavLink to="/" end>見つける</NavLink>
          <NavLink to="/library">ライブラリ</NavLink>
          <NavLink to="/vocab">単語帳</NavLink>
          <NavLink to="/settings">設定</NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<DiscoverPage />} />
        <Route path="/anime/:id" element={<AnimeDetailPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/play/:id" element={<PlayerPage />} />
        <Route path="/vocab" element={<VocabPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
