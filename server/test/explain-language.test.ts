import { describe, it, expect } from 'vitest';
import {
  detectExplainLanguage,
  parseExplainLanguage,
  resolveExplainLanguage,
} from '../src/modules/ai/language.js';

describe('parseExplainLanguage', () => {
  it('accepts only zh / en; anything else means auto', () => {
    expect(parseExplainLanguage('zh')).toBe('zh');
    expect(parseExplainLanguage('en')).toBe('en');
    expect(parseExplainLanguage('auto')).toBeUndefined();
    expect(parseExplainLanguage('ja')).toBeUndefined();
    expect(parseExplainLanguage(undefined)).toBeUndefined();
  });
});

describe('detectExplainLanguage', () => {
  it('maps any Chinese tag to zh', () => {
    expect(detectExplainLanguage('zh-CN,zh;q=0.9,en;q=0.8')).toBe('zh');
    expect(detectExplainLanguage('zh-Hant-TW')).toBe('zh');
    expect(detectExplainLanguage('ZH')).toBe('zh');
  });

  it('maps English and unsupported languages to en', () => {
    expect(detectExplainLanguage('en-US,en;q=0.9')).toBe('en');
    expect(detectExplainLanguage('fr-FR')).toBe('en');
    expect(detectExplainLanguage('ja-JP')).toBe('en');
  });

  it('picks the first supported language in the preference list, skipping unsupported ones', () => {
    // 日本語 OS の中国人学習者: ja が先頭でも zh を優先する
    expect(detectExplainLanguage('ja,zh-CN;q=0.8,en;q=0.5')).toBe('zh');
    expect(detectExplainLanguage('ja,en-US;q=0.8,zh;q=0.5')).toBe('en');
  });

  it('falls back to the system locale when no Accept-Language, then to en', () => {
    expect(detectExplainLanguage(undefined, 'zh-Hans-CN')).toBe('zh');
    expect(detectExplainLanguage('', 'en-GB')).toBe('en');
    expect(detectExplainLanguage(undefined, undefined)).toBe('en');
  });
});

describe('resolveExplainLanguage', () => {
  it('explicit setting wins over the request language', () => {
    expect(resolveExplainLanguage('en', 'zh-CN')).toBe('en');
    expect(resolveExplainLanguage('zh', 'en-US')).toBe('zh');
  });

  it('auto / unset follows the request language', () => {
    expect(resolveExplainLanguage(undefined, 'zh-CN')).toBe('zh');
    expect(resolveExplainLanguage('auto', 'en-US')).toBe('en');
  });
});
