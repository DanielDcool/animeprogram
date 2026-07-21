import { describe, it, expect } from 'vitest';
import { decidePlayability, buildRemuxArgs, buildExtractSubArgs, pickSubtitleStream } from '../src/modules/media/ffmpeg.js';

const h264mkv = {
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
    { index: 1, codec_type: 'audio', codec_name: 'flac' },
    { index: 2, codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'jpn' } },
  ],
};

describe('decidePlayability', () => {
  it('h264 mkv -> remux', () => {
    expect(decidePlayability(h264mkv as any, '.mkv')).toBe('remux');
  });
  it('h264 mp4 -> direct', () => {
    expect(decidePlayability(h264mkv as any, '.mp4')).toBe('direct');
  });
  it('hevc -> transcode_needed', () => {
    const probe = { streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc' }] };
    expect(decidePlayability(probe as any, '.mkv')).toBe('transcode_needed');
  });
  it('10bit h264 -> transcode_needed', () => {
    const probe = { streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p10le' }] };
    expect(decidePlayability(probe as any, '.mkv')).toBe('transcode_needed');
  });
});

describe('buildRemuxArgs', () => {
  it('copies video, re-encodes audio to aac, drops subs', () => {
    const args = buildRemuxArgs('/in.mkv', '/out.mp4');
    expect(args).toEqual(['-y', '-i', '/in.mkv', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '/out.mp4']);
  });
});

describe('pickSubtitleStream', () => {
  it('prefers jpn text subtitle', () => {
    expect(pickSubtitleStream(h264mkv as any)).toEqual({ index: 2, codec: 'ass' });
  });
  it('returns null when none', () => {
    expect(pickSubtitleStream({ streams: [] } as any)).toBeNull();
  });
});

describe('buildExtractSubArgs', () => {
  it('extracts given stream to ass file', () => {
    expect(buildExtractSubArgs('/in.mkv', 2, '/out.ass')).toEqual(['-y', '-i', '/in.mkv', '-map', '0:2', '/out.ass']);
  });
});
