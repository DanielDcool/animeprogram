export interface EditorialNote {
  badge: string;
  reason: string;
}

const EDITORIAL_NOTES: Record<number, EditorialNote> = {
  196187: {
    badge: '会話で選ぶ',
    reason: '大人同士の日常会話が中心。自然な相づちや距離感のある話し方を拾いやすい一本。',
  },
  177699: {
    badge: '挑戦する一本',
    reason: '科幻題材と硬めの語彙で、ニュースや仕事にもつながる正式な表現へ挑戦できる。',
  },
  178789: {
    badge: '続編の本命',
    reason: '前作を見ているなら今季の軸に。既知の人物関係が日本語の聞き取りを助けてくれる。',
  },
  147105: {
    badge: '春の見逃し',
    reason: '世界観を説明する台詞が豊富で、物語を楽しみながら語彙を広げやすい。',
  },
  189046: {
    badge: '人気シリーズ',
    reason: '感情表現の幅が広い人気続編。前作を復習しながら長い会話を追う練習に向く。',
  },
  186497: {
    badge: '日常会話',
    reason: '学校生活と人間関係を描く会話劇。普段使いの短い表現を集めたいときに選びたい。',
  },
};

const FEATURED_ORDER = [196187, 177699, 178789, 147105, 189046, 186497];

export function editorialNote(id: number): EditorialNote | undefined {
  return EDITORIAL_NOTES[id];
}

export function editorialRank(id: number): number {
  const rank = FEATURED_ORDER.indexOf(id);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}
