import type { CSSProperties } from 'react';

// 標識「タンク＝サングラス」。形はすべて標識由来: 方块 / 底辺の缺口 / 両横眼 / 短横。
// 色は --mark-block / --mark-cut に委ね、アニメ↔ドラマで反転させる（形は不変）。
export default function BrandMark({ size = 22 }: { size?: number }) {
  const w = size;
  const h = size * 0.84;
  const eyeRadius = size >= 24 ? Math.round(size * 0.055) : 0;
  const cut = (style: CSSProperties): CSSProperties => ({
    position: 'absolute',
    background: 'var(--mark-cut)',
    ...style,
  });
  return (
    <span className="brand-mark" style={{ width: w, height: h }} aria-hidden="true">
      <span style={{ position: 'absolute', inset: 0, borderRadius: size * 0.15, background: 'var(--mark-block)' }} />
      <span style={cut({ left: w * 0.38, bottom: -1, width: w * 0.24, height: h * 0.27, borderRadius: `${size * 0.07}px ${size * 0.07}px 0 0` })} />
      <span style={cut({ left: w * 0.15, top: h * 0.35, width: w * 0.26, height: h * 0.13, borderRadius: eyeRadius })} />
      <span style={cut({ right: w * 0.15, top: h * 0.35, width: w * 0.26, height: h * 0.13, borderRadius: eyeRadius })} />
      {size >= 40 && (
        <span style={cut({ left: w * 0.42, top: h * 0.59, width: w * 0.16, height: h * 0.05, borderRadius: 99 })} />
      )}
    </span>
  );
}
