import { describe, it, expect } from 'vitest';
import { parseSrt, parseAss, parseSubtitle } from '../src/modules/subtitle/parser.js';

const SRT = `1
00:00:01,500 --> 00:00:03,200
それでも、あたしは

2
00:00:03,400 --> 00:00:05,000
<i>あんたのことが</i>
好きなんだよ
`;

describe('parseSrt', () => {
  it('parses cues with times and joined text', () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1.5, end: 3.2, text: 'それでも、あたしは' });
    expect(cues[1].start).toBeCloseTo(3.4);
    expect(cues[1].text).toBe('あんたのことが 好きなんだよ');
  });

  it('tolerates \\r\\n and BOM', () => {
    const cues = parseSrt('﻿' + SRT.replace(/\n/g, '\r\n'));
    expect(cues).toHaveLength(2);
  });
});

const ASS = `[Script Info]
Title: test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.50,0:00:03.20,Default,,0,0,0,,{\\an8}それでも、あたしは
Dialogue: 0,0:00:03.40,0:00:05.00,Default,,0,0,0,,あんたのことが\\Nすきなんだよ
Comment: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,これは出ない
`;

describe('parseAss', () => {
  it('parses Dialogue lines, strips override tags, \\N becomes space', () => {
    const cues = parseAss(ASS);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1.5, end: 3.2, text: 'それでも、あたしは' });
    expect(cues[1].text).toBe('あんたのことが すきなんだよ');
  });
});

describe('parseSubtitle', () => {
  it('dispatches by extension and sorts by start', () => {
    expect(parseSubtitle(SRT, 'srt')[0].start).toBe(1.5);
    expect(parseSubtitle(ASS, 'ass')[0].start).toBe(1.5);
  });
});
