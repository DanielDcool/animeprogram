import { describe, it, expect } from 'vitest';
import { parseFilename } from '../src/modules/media/filename.js';

describe('parseFilename', () => {
  it.each([
    // 既存の命名（スペース + " - NN" / 第NN話）
    ['[SubsPlease] Yagate Kimi ni Naru - 05 (1080p) [ABCD1234].mkv', 'Yagate Kimi ni Naru', 5],
    ['[Erai-raws] Adachi to Shimamura - 12 END [1080p].mkv', 'Adachi to Shimamura', 12],
    ['Aoi Hana - 03v2 [BD 1080p].mkv', 'Aoi Hana', 3],
    ['citrus 第08話.mp4', 'citrus', 8],
    // タイトル内に " - " を含む場合、話数は最後の " - NN" で判定
    ['[Anitsu] Mushoku Tensei - Isekai Ittara Honki Dasu - 01 (BD 1080p x265).mkv', 'Mushoku Tensei - Isekai Ittara Honki Dasu', 1],

    // SxxExx（スペース区切り + 先頭/末尾タグ）
    ['[Group] Show Name S01E05 [1080p][x265].mkv', 'Show Name', 5],
    ['Sousou no Frieren S1E7.mkv', 'Sousou no Frieren', 7],

    // ドット区切りの scene リリース
    ['Mushoku.Tensei.Jobless.Reincarnation.S02E01.The.Depressed.Magician.1080p.AMZN.WEB-DL.DDP2.0.H.264-VARYG.mkv', 'Mushoku Tensei Jobless Reincarnation', 1],
    ['Kimetsu.no.Yaiba.S01E19.1080p.WEB-DL.x264.mkv', 'Kimetsu no Yaiba', 19],

    // 年号・バージョン・リリースグループ・画質タグを剥がす
    ['You and I Are Polar Opposites (2026) - S01E07v2 (CR WEB-DL 1080p H.264 Opus 2.0) [Prozac].mkv', 'You and I Are Polar Opposites', 7],

    // 話数が無い（映画など）→ 末尾の年号は落とす
    ['My Movie (2020).mp4', 'My Movie', null],
    ['Your Name.mkv', 'Your Name', null],
  ])('%s -> %s ep %s', (input, series, episode) => {
    expect(parseFilename(input)).toEqual({ series, episode });
  });
});
