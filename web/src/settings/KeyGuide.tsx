import type { KeyGuide as KeyGuideData } from './keyGuides';

const URL_RE = /(https?:\/\/[^\s、（）「」]+)/g;

/** 手順文中の URL をそのままリンクにする（テキストは変えない） */
function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener">{part}</a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

interface Props {
  guide: KeyGuideData;
  /** true のとき最初から開いておく（他ページから「キーが必要」で飛ばされたとき） */
  open?: boolean;
}

/**
 * API キーの取得方法。既定では折りたたみ、見出しをクリックで手順と直リンクボタンを表示。
 */
export function KeyGuide({ guide, open }: Props) {
  return (
    <details className="key-guide" open={open}>
      <summary>{guide.title}</summary>
      <ol>
        {guide.steps.map((step, i) => <li key={i}>{linkify(step)}</li>)}
      </ol>
      {guide.note && <p className="key-guide-note">{guide.note}</p>}
      <a className="primary-link key-guide-link" href={guide.url} target="_blank" rel="noreferrer noopener">
        {guide.linkLabel} ↗
      </a>
    </details>
  );
}
