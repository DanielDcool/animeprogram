import { describe, it, expect } from 'vitest';
import { parseFilename } from '../src/modules/media/filename.js';

describe('parseFilename', () => {
  it.each([
    ['[SubsPlease] Yagate Kimi ni Naru - 05 (1080p) [ABCD1234].mkv', 'Yagate Kimi ni Naru', 5],
    ['[Erai-raws] Adachi to Shimamura - 12 END [1080p].mkv', 'Adachi to Shimamura', 12],
    ['Aoi Hana - 03v2 [BD 1080p].mkv', 'Aoi Hana', 3],
    ['citrus 第08話.mp4', 'citrus', 8],
    ['My Movie (2020).mp4', 'My Movie (2020)', null],
  ])('%s -> %s ep %s', (input, series, episode) => {
    expect(parseFilename(input)).toEqual({ series, episode });
  });
});
