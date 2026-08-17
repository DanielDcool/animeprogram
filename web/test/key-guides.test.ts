import { describe, expect, it } from 'vitest';
import { AI_KEY_GUIDES, JIMAKU_KEY_GUIDE, backLinkLabel, parseSettingsIntent } from '../src/settings/keyGuides';

describe('parseSettingsIntent', () => {
  it('returns nothing for a plain visit', () => {
    expect(parseSettingsIntent('')).toEqual({ need: null, back: null });
    expect(parseSettingsIntent('?foo=bar')).toEqual({ need: null, back: null });
  });

  it('reads a known need and an in-app back path', () => {
    expect(parseSettingsIntent('?need=jimaku&back=/library')).toEqual({ need: 'jimaku', back: '/library' });
    expect(parseSettingsIntent('?need=ai&back=%2Fplay%2F12')).toEqual({ need: 'ai', back: '/play/12' });
  });

  it('ignores unknown needs', () => {
    expect(parseSettingsIntent('?need=other&back=/library')).toEqual({ need: null, back: '/library' });
  });

  it('rejects back paths that could leave the app', () => {
    expect(parseSettingsIntent('?back=https://evil.example').back).toBeNull();
    expect(parseSettingsIntent('?back=//evil.example').back).toBeNull();
    expect(parseSettingsIntent('?back=library').back).toBeNull();
  });
});

describe('backLinkLabel', () => {
  it('names the library and player routes', () => {
    expect(backLinkLabel('/library')).toBe('ライブラリに戻って字幕を探す');
    expect(backLinkLabel('/play/3')).toBe('プレーヤーに戻る');
    expect(backLinkLabel('/vocab')).toBe('戻る');
  });
});

describe('key guides', () => {
  it('point jimaku users to the login/register page and the account page', () => {
    expect(JIMAKU_KEY_GUIDE.url).toBe('https://jimaku.cc/account');
    expect(JIMAKU_KEY_GUIDE.steps.join(' ')).toContain('https://jimaku.cc/login');
  });

  it('has a console URL and steps for every AI provider', () => {
    for (const provider of ['anthropic', 'deepseek', 'openai', 'gemini'] as const) {
      const guide = AI_KEY_GUIDES[provider];
      expect(guide.url).toMatch(/^https:\/\//);
      expect(guide.steps.length).toBeGreaterThanOrEqual(2);
    }
  });
});
