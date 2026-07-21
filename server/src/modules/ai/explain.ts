import type Anthropic from '@anthropic-ai/sdk';

// テストで差し替えられるよう、使用する最小インターフェースだけに依存する
export type ExplainClient = Pick<Anthropic, 'messages'>;

export interface Explanation {
  translation: string;
  structure: string;
  expressions: { expression: string; meaning: string }[];
  nuance: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    translation: { type: 'string', description: '整句中文翻译' },
    structure: { type: 'string', description: '语法结构拆解（中文说明）' },
    expressions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['expression', 'meaning'],
        additionalProperties: false,
      },
      description: '句中的句型/惯用表达及说明',
    },
    nuance: { type: 'string', description: '语气、语境、使用场合' },
  },
  required: ['translation', 'structure', 'expressions', 'nuance'],
  additionalProperties: false,
} as const;

const SYSTEM = `あなたは日本語教師です。アニメの台詞を、日本語を勉強している中国語話者（N1レベル）向けに解説します。解説は中国語で書き、文法用語は必要に応じて日本語を併記してください。`;

export async function explainSentence(
  client: ExplainClient,
  model: string,
  input: { text: string; context: string[] },
): Promise<Explanation> {
  const contextBlock = input.context.length
    ? `前後の台詞（文脈参考用）:\n${input.context.join('\n')}\n\n`
    : '';
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA as any } },
    messages: [
      { role: 'user', content: `${contextBlock}解説対象の台詞:\n${input.text}` },
    ],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('AI declined to answer');
  }
  const text = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
  if (!text) throw new Error('empty AI response');
  return JSON.parse(text.text) as Explanation;
}
