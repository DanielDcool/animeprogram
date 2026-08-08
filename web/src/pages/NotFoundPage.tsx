import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="detail-state">
      <h1>ページが見つかりません</h1>
      <p>URL が変わったか、ページが削除された可能性があります。</p>
      <p><Link to="/">作品を見つける</Link> · <Link to="/library">ライブラリへ戻る</Link></p>
    </main>
  );
}
