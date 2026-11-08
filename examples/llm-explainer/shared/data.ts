/**
 * 片中出现的全部事实、示意数字与来源，集中放在这里，便于核对与更新（完整来源见 ../SOURCES.md）。
 *
 * 两类数字分开：
 * - 事实（有来源）：词元的经验换算、温度的作用、“胡说”的成因。画面底部写来源。
 * - 示意（为讲清原理而设）：候选词和它们的概率、词元编号。画面上一律标“示意”，不说来自哪个具体模型。
 */

export const SRC = {
  tokens: '来源：OpenAI 帮助中心《What are tokens and how to count them?》（经验估算，因语言和模型而异）',
  predict: '来源：3Blue1Brown《Large Language Models explained briefly》；Hugging Face《How to generate text》',
  temp: '来源：Hugging Face《How to generate text》（温度采样）。概率由同一组分数按温度重新换算',
  hallu: '来源：OpenAI《Why language models hallucinate》（2025 年 9 月）',
  demo: '示意：候选与概率为讲清原理而设，不来自某个具体模型',
} as const;

/** 贯穿全片的例子：同一个问题。 */
export const PROMPT = '给我的橘猫起个名字';
export const PROMPT_TOKENS = ['给', '我的', '橘', '猫', '起', '个', '名字'] as const;
/** 词元编号（示意）。 */
export const PROMPT_IDS = ['4912', '25008', '13802', '9937', '6151', '702', '15742'] as const;

export const ANSWER_1 = '就叫它“橘子”吧！';
export const ANSWER_TOKENS = ['就', '叫', '它', '“', '橘子', '”', '吧', '！'] as const;
/** 每一块被选中时的概率（示意），开场“定格”时写在词元下面。 */
export const ANSWER_PROBS = ['34%', '61%', '72%', '88%', '45%', '96%', '52%', '71%'] as const;
/** 第二次问：前面一样，只有名字这一块抽到了别的。 */
export const ANSWER_2 = '就叫它“南瓜”吧！';

export type Cand = { label: string; p: number };
/** 第二章：几次“猜下一块”的候选（示意）：前 5 名 + 其余所有候选合在一起。 */
export const STEPS: Record<'first' | 'name' | 'end', Cand[]> = {
  first: [{ label: '就', p: 34 }, { label: '叫', p: 24 }, { label: '我', p: 14 }, { label: '可以', p: 10 }, { label: '好', p: 8 }, { label: '其他', p: 10 }],
  name: [{ label: '橘子', p: 45 }, { label: '南瓜', p: 20 }, { label: '大黄', p: 16 }, { label: '芒果', p: 11 }, { label: '布丁', p: 8 }],
  end: [{ label: '［结束］', p: 62 }, { label: '它', p: 14 }, { label: '橘', p: 9 }, { label: '圆', p: 6 }, { label: '你', p: 4 }, { label: '其他', p: 5 }],
};
/** 第三章用：温度 t 下五个名字的候选。 */
export const namesAt = (t: number): Cand[] => probsAt(t).map((p, i) => ({ label: NAMES[i]!, p }));

/**
 * 第三章：温度。五个名字在温度 1 时的概率就是 STEPS.name；
 * 它们的“分数”取 ln(p)，任意温度 T 下的概率 = softmax(分数 / T)，在这里算好，画面只放结果。
 */
export const NAMES = STEPS.name.map((c) => c.label);
const SCORES = STEPS.name.map((c) => Math.log(c.p));
export function probsAt(t: number): number[] {
  const e = SCORES.map((s) => Math.exp(s / t));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => (x / sum) * 100);
}
export const TEMPS = [0.2, 1, 1.5] as const;

/** 第四章：问一个它不可能知道的事实，候选日期都很低（示意）；对照起名时第一名的 45%。 */
export const BIRTHDAY_Q = '我的橘猫是哪天生日？';
export const BIRTHDAY_A = '它的生日是 3 月 12 日。';
export const DATES: Cand[] = [
  { label: '3月12日', p: 2.1 }, { label: '5月20日', p: 1.9 }, { label: '10月1日', p: 1.8 }, { label: '8月8日', p: 1.6 }, { label: '不知道', p: 0.6 }, { label: '其余几百个日期', p: 92 },
];

/** OpenAI 2025 的论证：只按答对计分时，蒙一个日期的期望得分高于“不知道”；答错扣分后反过来。 */
export const SCORE = {
  guessPlain: 1 / 365,
  guessPenalty: 1 / 365 - 364 / 365,
  idk: 0,
};
export const fmtScore = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(v === 0 ? 0 : Math.abs(v) < 0.01 ? 3 : 2)} 分`;
