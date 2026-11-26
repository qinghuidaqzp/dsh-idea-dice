import { createHash, randomInt } from 'node:crypto';
import { categories, decks, type Category } from './catalog.js';

export class InputError extends Error {
  constructor(message: string) { super(message); this.name = 'InputError'; }
}

export type RandomSource = (maxExclusive: number) => number;

/** Escape user-supplied labels in Markdown while preserving their structured values. */
function displayLabel(value: string): string {
  return value.replace(/[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/g, character => `\\${character}`);
}

function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new InputError(`${label} 必须是 ${min} 到 ${max} 之间的整数。`);
  }
  return value;
}

export function validateSeed(seed?: string): string | undefined {
  if (seed === undefined) return undefined;
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 80 || /[\u0000-\u001f\u007f]/u.test(seed)) {
    throw new InputError('seed 必须是 1–80 个字符的非空文字，且不能包含控制字符。');
  }
  return seed.trim();
}

/** Unseeded requests use crypto.randomInt. Seeded requests use a stable v1 hash stream. */
export function randomSource(seed?: string): RandomSource {
  const normalized = validateSeed(seed);
  if (normalized === undefined) return max => randomInt(max);
  let counter = 0;
  return max => {
    integer(max, 1, 5_000_000, '随机范围');
    // Rejection sampling keeps seeded integer buckets equal-sized, rather than using biased modulo alone.
    const cutoff = Math.floor(0x1_0000_0000 / max) * max;
    for (;;) {
      const value = createHash('sha256').update(`idea-dice-v1\0${normalized}\0${counter++}`).digest().readUInt32BE(0);
      if (value < cutoff) return value % max;
    }
  };
}

function draw(random: RandomSource, max: number): number {
  return integer(random(max), 0, max - 1, '随机结果');
}

export interface Idea {
  title: string;
  brief: string;
  mechanic: string;
  constraint: string;
  firstStep: string;
}

export function drawIdeas(input: { category?: string; count?: number; seed?: string }, source?: RandomSource) {
  const category = input.category ?? 'code';
  if (!categories.includes(category as Category)) throw new InputError('category 只能是 code、design、writing 或 game。');
  const count = integer(input.count ?? 1, 1, 5, '灵感数量');
  const seed = validateSeed(input.seed);
  const random = source ?? randomSource(seed);
  const deck = decks[category as Category];
  const total = deck.themes.length * deck.mechanics.length * deck.constraints.length;
  const available = new Map<number, number>();
  const ideas: Idea[] = [];
  // Partial Fisher–Yates: unique combinations, with a strict count-bounded loop.
  for (let index = 0; index < count; index++) {
    const remaining = total - index;
    const selected = draw(random, remaining);
    let code = available.get(selected) ?? selected;
    available.set(selected, available.get(remaining - 1) ?? remaining - 1);
    const constraint = deck.constraints[code % deck.constraints.length];
    code = Math.floor(code / deck.constraints.length);
    const mechanic = deck.mechanics[code % deck.mechanics.length];
    const theme = deck.themes[Math.floor(code / deck.mechanics.length)];
    ideas.push({ ...theme, mechanic, constraint, firstStep: deck.firstStep });
  }
  const text = [`🎲 ${deck.label} · ${count} 张灵感卡`, ...ideas.map((idea, index) =>
    `\n${index + 1}. ${idea.title}\n场景：${idea.brief}\n玩法：${idea.mechanic}\n限制：${idea.constraint}\n第一步：${idea.firstStep}`),
  seed === undefined ? '\n抽取方式：系统随机。' : `\n复现种子：${displayLabel(seed)}（相同类别与数量可复现本次结果）`].join('\n');
  return { text, category, ideas, randomMode: seed === undefined ? 'system' : 'seeded', ...(seed === undefined ? {} : { seed }) };
}

export function chooseOption(input: { options: string[]; weights?: number[]; seed?: string }, source?: RandomSource) {
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 50) {
    throw new InputError('请提供 2–50 个候选项。');
  }
  const options = input.options.map(option => {
    if (typeof option !== 'string' || !option.trim() || option.length > 120 || /[\u0000-\u001f\u007f]/u.test(option)) {
      throw new InputError('每个候选项必须是 1–120 个字符的非空文字，不能包含控制字符。');
    }
    return option.trim();
  });
  if (new Set(options).size !== options.length) throw new InputError('候选项不能重复；请使用 weights 调整概率。');
  if (input.weights !== undefined && (!Array.isArray(input.weights) || input.weights.length !== options.length)) {
    throw new InputError('weights 数量必须与候选项完全一致。');
  }
  const weights = input.weights?.map(weight => integer(weight, 1, 100000, '权重')) ?? options.map(() => 1);
  const seed = validateSeed(input.seed);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const ticket = draw(source ?? randomSource(seed), totalWeight);
  let cumulative = 0;
  let index = 0;
  for (; index < weights.length; index++) {
    cumulative += weights[index];
    if (ticket < cumulative) break;
  }
  const percentage = weights[index] / totalWeight * 100;
  const text = `🎡 转盘选中了：${displayLabel(options[index])}\n位置：第 ${index + 1} 项 / 共 ${options.length} 项\n本项概率：${percentage.toFixed(2)}%（权重 ${weights[index]} / ${totalWeight}）\n这是随机选择，不是优劣评估。${seed === undefined ? '' : `\n复现种子：${displayLabel(seed)}`}`;
  return { text, selected: options[index], index: index + 1, weight: weights[index], totalWeight, percentage, randomMode: seed === undefined ? 'system' : 'seeded', ...(seed === undefined ? {} : { seed }) };
}

export function rollDice(input: { expression: string; seed?: string }, source?: RandomSource) {
  if (typeof input.expression !== 'string' || input.expression.length > 30) throw new InputError('骰子表达式最多 30 个字符，例如 2d6+3。');
  const expression = input.expression.trim();
  const match = /^(\d{1,3})?[dD](\d{1,4})(?:([+-])(\d{1,4}))?$/.exec(expression);
  if (!match) throw new InputError('只接受 NdM、dM、NdM+K 或 NdM-K，例如 2d6+3；不执行表达式代码。');
  const count = integer(match[1] === undefined ? 1 : Number(match[1]), 1, 100, '骰子数量');
  const sides = integer(Number(match[2]), 2, 1000, '骰子面数');
  const magnitude = integer(match[4] === undefined ? 0 : Number(match[4]), 0, 1000, '加减值');
  const modifier = magnitude === 0 ? 0 : match[3] === '-' ? -magnitude : magnitude;
  const normalized = `${count}d${sides}${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : modifier}`;
  const seed = validateSeed(input.seed);
  const random = source ?? randomSource(seed);
  const rolls = Array.from({ length: count }, () => draw(random, sides) + 1);
  const subtotal = rolls.reduce((sum, value) => sum + value, 0);
  const total = subtotal + modifier;
  const text = `🎲 ${normalized} → ${total}\n逐骰结果：[${rolls.join(', ')}]\n骰子小计：${subtotal}；修正值：${modifier >= 0 ? '+' : ''}${modifier}\n理论范围：${count + modifier}–${count * sides + modifier}${seed === undefined ? '' : `\n复现种子：${displayLabel(seed)}`}`;
  return { text, expression: normalized, rolls, subtotal, modifier, total, minimum: count + modifier, maximum: count * sides + modifier, randomMode: seed === undefined ? 'system' : 'seeded', ...(seed === undefined ? {} : { seed }) };
}
