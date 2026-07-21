import { Routes, Route, Link } from 'react-router-dom';
import LibraryPage from './pages/LibraryPage';
import PlayerPage from './pages/PlayerPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <div className="app">
      <nav className="topnav">
        <Link to="/">ライブラリ</Link>
        <Link to="/settings">設定</Link>
      </nav>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/play/:id" element={<PlayerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
