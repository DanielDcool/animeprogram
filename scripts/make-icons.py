#!/usr/bin/env python3
"""tanku Anime のアイコン生成（標準ライブラリのみ）。

web/src/components/BrandMark.tsx の形状パラメータをそのまま再現し、
docs/images/tanku.ico（Windows ショートカット用: 16/32/48 BMP + 256 PNG）と
docs/images/tanku.png（macOS のカスタムアイコン用 512px）を書き出す。

色はアニメモードの標識色（--mark-block: bone-200 / --mark-cut: ink-800）で固定。
ロゴの形や色を変えたら、このスクリプトを再実行して両ファイルを更新する:

    python3 scripts/make-icons.py
"""
import struct
import zlib
from pathlib import Path

BLOCK = (0xE6, 0xE1, 0xD6)  # --bone-200
CUT = (0x14, 0x13, 0x10)    # --ink-800

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'docs' / 'images'


def rounded_rect_coverage(px: float, py: float, x: float, y: float, w: float, h: float, r: float) -> float:
    """1px アンチエイリアス付きの角丸長方形カバレッジ（符号付き距離ベース）。"""
    cx, cy = x + w / 2, y + h / 2
    hx, hy = w / 2 - r, h / 2 - r
    qx = abs(px - cx) - hx
    qy = abs(py - cy) - hy
    ox = max(qx, 0.0)
    oy = max(qy, 0.0)
    dist = (ox * ox + oy * oy) ** 0.5 + min(max(qx, qy), 0.0) - r
    return min(1.0, max(0.0, 0.5 - dist))


def render(size: int) -> bytes:
    """BrandMark.tsx と同じ比率でアイコンを 1 枚描く。戻り値は RGBA バイト列。"""
    s = float(size)
    bw = s * 0.96
    bx = s * 0.02
    bh = bw * 0.84
    by = (s - bh) / 2
    block_r = bw * 0.15
    eye_r = bw * 0.055 if size >= 24 else 0.0
    notch_r = bw * 0.07

    # (x, y, w, h, r) — BrandMark の cut 群。ノッチは下辺の丸みがブロック外に出るよう下へ延長する
    cuts = [
        (bx + bw * 0.38, by + bh - bh * 0.27, bw * 0.24, bh * 0.27 + notch_r, notch_r),
        (bx + bw * 0.15, by + bh * 0.35, bw * 0.26, bh * 0.13, eye_r),
        (bx + bw - bw * 0.15 - bw * 0.26, by + bh * 0.35, bw * 0.26, bh * 0.13, eye_r),
    ]
    if size >= 40:
        dash_h = bh * 0.05
        cuts.append((bx + bw * 0.42, by + bh * 0.59, bw * 0.16, dash_h, dash_h / 2))

    buf = bytearray(size * size * 4)
    for j in range(size):
        py = j + 0.5
        for i in range(size):
            px = i + 0.5
            a_block = rounded_rect_coverage(px, py, bx, by, bw, bh, block_r)
            if a_block <= 0.0:
                continue
            a_cut = max(rounded_rect_coverage(px, py, *c) for c in cuts)
            # ブロック色の上に、ブロック内に限って cut 色を重ねる
            r = BLOCK[0] * (1 - a_cut) + CUT[0] * a_cut
            g = BLOCK[1] * (1 - a_cut) + CUT[1] * a_cut
            b = BLOCK[2] * (1 - a_cut) + CUT[2] * a_cut
            o = j * size * 4 + i * 4
            buf[o] = round(r)
            buf[o + 1] = round(g)
            buf[o + 2] = round(b)
            buf[o + 3] = round(a_block * 255)
    return bytes(buf)


def to_png(rgba: bytes, size: int) -> bytes:
    raw = b''.join(b'\x00' + rgba[y * size * 4:(y + 1) * size * 4] for y in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def to_ico_bmp_entry(rgba: bytes, size: int) -> bytes:
    """ICO 内の古典的 BMP エントリ（32bit BGRA、上下反転、AND マスク付き）。"""
    header = struct.pack('<IiiHHIIiiII', 40, size, size * 2, 1, 32, 0, size * size * 4, 0, 0, 0, 0)
    rows = []
    for y in range(size - 1, -1, -1):  # BMP は下から上
        row = bytearray()
        for x in range(size):
            o = y * size * 4 + x * 4
            row += bytes((rgba[o + 2], rgba[o + 1], rgba[o], rgba[o + 3]))  # BGRA
        rows.append(bytes(row))
    mask_stride = ((size + 31) // 32) * 4
    mask = b'\x00' * mask_stride * size  # アルファがあるのでマスクは全 0
    return header + b''.join(rows) + mask


def build_ico(images: dict[int, bytes]) -> bytes:
    """images: size -> RGBA。256 は PNG、それ以外は BMP でパックする。"""
    entries = []
    payloads = []
    offset = 6 + 16 * len(images)
    for size in sorted(images):
        data = to_png(images[size], size) if size >= 256 else to_ico_bmp_entry(images[size], size)
        dim = 0 if size >= 256 else size
        entries.append(struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(data), offset))
        payloads.append(data)
        offset += len(data)
    return struct.pack('<HHH', 0, 1, len(images)) + b''.join(entries) + b''.join(payloads)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    images = {size: render(size) for size in (16, 32, 48, 256)}
    (OUT_DIR / 'tanku.ico').write_bytes(build_ico(images))
    (OUT_DIR / 'tanku.png').write_bytes(to_png(render(512), 512))
    print(f'wrote {OUT_DIR / "tanku.ico"} and {OUT_DIR / "tanku.png"}')


if __name__ == '__main__':
    main()
