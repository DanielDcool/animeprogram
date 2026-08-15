// かな → ローマ字（ヘボン式）。
// 用途は「日本語で入力された作品名を、リリース側の綴りに寄せる」こと。
// Nyaa の実写カテゴリでは、リリース名にローマ字が入っていることが多く、
// 日本語の原題では 0 件でもローマ字なら当たる場合がある。
//   例（2026-08-15 実測）: 「きのう何食べた」0 件 / 「Kinou Nani Tabeta」48 件（全て該当作）
// 厳密な翻字ではなく検索語の生成が目的なので、長音は落とすなど検索に有利な方へ倒す。
import type { JaToken } from './tokenizer.js';

// 2 文字の拗音を先に引くため、長いキーから順に試す
const DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho', じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che', うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
};

const MONOGRAPHS: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
};

const JAPANESE_RE = /[぀-ヿ㐀-䶿一-鿿]/;

/** 日本語（かな・漢字）を含むか。ラテン文字だけの入力に翻字をかけないための判定 */
export function hasJapanese(text: string): boolean {
  return JAPANESE_RE.test(text);
}

function kataToHira(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function hiraganaToRomaji(kana: string): string {
  const source = kataToHira(kana);
  let out = '';
  let i = 0;
  while (i < source.length) {
    // 促音「っ」は次の子音を重ねる
    if (source[i] === 'っ') {
      const rest = hiraganaToRomaji(source.slice(i + 1));
      return out + (rest ? rest[0] + rest : '');
    }
    // 長音記号は検索の邪魔になるので落とす（グルメ ← グールメ の揺れも吸収する）
    if (source[i] === 'ー') { i += 1; continue; }
    const pair = source.slice(i, i + 2);
    if (DIGRAPHS[pair]) { out += DIGRAPHS[pair]; i += 2; continue; }
    const mono = MONOGRAPHS[source[i]];
    if (mono) { out += mono; i += 1; continue; }
    // 未知の文字（ラテン文字・数字・記号）はそのまま通す
    out += source[i];
    i += 1;
  }
  return out;
}

/** 助詞として使われるとき、綴りが読みとずれる 3 つ */
const PARTICLE_SPELLING: Record<string, string> = { は: 'wa', へ: 'e', を: 'o' };

/**
 * 形態素ごとの読みをローマ字にして空白でつなぐ。
 * リリース名が「Nigeru wa Haji da ga Yaku ni Tatsu」のように
 * 語単位で区切られているため、単語境界を保つ方が当たりやすい。
 */
export function romajiSearchTerm(tokens: JaToken[]): string {
  return tokens
    .filter((token) => token.pos !== '記号')
    .map((token) => {
      if (token.pos === '助詞' && PARTICLE_SPELLING[token.surface]) {
        return PARTICLE_SPELLING[token.surface];
      }
      return hiraganaToRomaji(token.reading || token.surface);
    })
    .filter(Boolean)
    .join(' ');
}
