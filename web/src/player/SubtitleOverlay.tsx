export default function SubtitleOverlay({ text, visible }: { text: string | null; visible: boolean }) {
  if (!visible || !text) return null;
  return <div className="subtitle-overlay">{text}</div>;
}
