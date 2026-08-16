import type Anthropic from '@anthropic-ai/sdk';
import type { ExplainLanguage } from './language.js';

// テストで差し替えられるよう、使用する最小インターフェースだけに依存する
export type ExplainClient = Pick<Anthropic, 'messages'>;

export interface Explanation {
  translation: string;
  structure: string;
  expressions: { expression: string; meaning: string }[];
  nuance: string;
}

export interface ExplainInput {
  text: string;
  context: string[];
  language: ExplainLanguage;
}

interface LanguageProfile {
  /** 解説を読む学習者（システムプロンプト用、日本語で記述） */
  audience: string;
  /** 解説の記述言語（システムプロンプト用、日本語で記述） */
  outputLanguage: string;
  /** その言語自身の漢字に読み仮名を付けない、という追加ルール（漢字を使う言語のみ） */
  extraFuriganaRule: string;
  /** JSON Schema の各フィールド説明 */
  fields: { translation: string; structure: string; expressions: string; nuance: string };
}

const PROFILES: Record<ExplainLanguage, LanguageProfile> = {
  zh: {
    audience: '中国語話者',
    outputLanguage: '中国語',
    extraFuriganaRule: '中国語そのものの漢字にも読み仮名を付けません。',
    fields: {
      translation: '整句中文翻译',
      structure: '语法结构拆解（中文说明）',
      expressions: '句中的句型/惯用表达及说明',
      nuance: '语气、语境、使用场合',
    },
  },
  en: {
    audience: '英語話者',
    outputLanguage: '英語',
    extraFuriganaRule: '',
    fields: {
      translation: 'Full English translation of the line',
      structure: 'Grammar structure breakdown (explained in English)',
      expressions: 'Sentence patterns / idiomatic expressions in the line, with explanations',
      nuance: 'Tone, register, and the situations where it is used',
    },
  },
};

export function buildSchema(language: ExplainLanguage) {
  const { fields } = PROFILES[language];
  return {
    type: 'object',
    properties: {
      translation: { type: 'string', description: fields.translation },
      structure: { type: 'string', description: fields.structure },
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
        description: fields.expressions,
      },
      nuance: { type: 'string', description: fields.nuance },
    },
    required: ['translation', 'structure', 'expressions', 'nuance'],
    additionalProperties: false,
  } as const;
}

export function buildSystemPrompt(language: ExplainLanguage): string {
  const profile = PROFILES[language];
  return `あなたは日本語教師です。アニメの台詞を、日本語を勉強している${profile.audience}（N1レベル）向けに解説します。`
    + `解説は${profile.outputLanguage}で書き、文法用語は必要に応じて日本語を併記してください。`
    + '読み仮名の対象は、解説対象の台詞に含まれる日本語の漢字だけです。その語を解説内で日本語として引用・提示するときは、直後に読み仮名を全角括弧で添えてください。'
    + '例：原文に「一発」があれば「一発（いっぱつ）」と書きます。'
    + '原文にない漢字を含む日本語、特に説明のために追加した名詞、動詞、仮定形、推量などの文法用語や品詞名には読み仮名を付けないでください。'
    + profile.extraFuriganaRule;
}

function makeUserPrompt(input: ExplainInput): string {
  const contextBlock = input.context.length
    ? `前後の台詞（文脈参考用）:\n${input.context.join('\n')}\n\n`
    : '';
  return `${contextBlock}解説対象の台詞:\n${input.text}`;
}

function parseExplanation(text: string): Explanation {
  return JSON.parse(text) as Explanation;
}

export async function explainSentence(
  client: ExplainClient,
  model: string,
  input: ExplainInput,
): Promise<Explanation> {
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: buildSystemPrompt(input.language),
    output_config: { format: { type: 'json_schema', schema: buildSchema(input.language) as any } },
    messages: [
      { role: 'user', content: makeUserPrompt(input) },
    ],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('AI declined to answer');
  }
  const text = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
  if (!text) throw new Error('empty AI response');
  return parseExplanation(text.text);
}

export async function explainSentenceWithDeepSeek(
  apiKey: string,
  model: string,
  input: ExplainInput,
  fetchFn: typeof fetch = fetch,
): Promise<Explanation> {
  const response = await fetchFn('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${buildSystemPrompt(input.language)}\n必ず JSON オブジェクトだけを返してください。形式例: {"translation":"...","structure":"...","expressions":[{"expression":"...","meaning":"..."}],"nuance":"..."}`,
        },
        { role: 'user', content: makeUserPrompt(input) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek request failed (${response.status})`);
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty AI response');
  return parseExplanation(text);
}

export async function explainSentenceWithOpenAI(
  apiKey: string,
  model: string,
  input: ExplainInput,
  fetchFn: typeof fetch = fetch,
): Promise<Explanation> {
  const response = await fetchFn('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_output_tokens: 2048,
      instructions: buildSystemPrompt(input.language),
      input: makeUserPrompt(input),
      text: {
        format: {
          type: 'json_schema',
          name: 'japanese_explanation',
          strict: true,
          schema: buildSchema(input.language),
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
  const payload = await response.json() as {
    output?: { content?: { type?: string; text?: string; refusal?: string }[] }[];
  };
  const content = payload.output?.flatMap((item) => item.content ?? []) ?? [];
  if (content.some((item) => item.type === 'refusal')) throw new Error('AI declined to answer');
  const text = content.find((item) => item.type === 'output_text')?.text;
  if (!text) throw new Error('empty AI response');
  return parseExplanation(text);
}

export async function explainSentenceWithGemini(
  apiKey: string,
  model: string,
  input: ExplainInput,
  fetchFn: typeof fetch = fetch,
): Promise<Explanation> {
  const response = await fetchFn('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: makeUserPrompt(input),
      system_instruction: buildSystemPrompt(input.language),
      store: false,
      generation_config: { max_output_tokens: 4096, thinking_level: 'low' },
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: buildSchema(input.language),
      },
    }),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const payload = await response.json() as {
    steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  };
  const modelOutput = payload.steps?.filter((step) => step.type === 'model_output').at(-1);
  const text = modelOutput?.content
    ?.filter((content) => content.type === 'text')
    .map((content) => content.text ?? '')
    .join('');
  if (!text) throw new Error('empty AI response');
  return parseExplanation(text);
}
