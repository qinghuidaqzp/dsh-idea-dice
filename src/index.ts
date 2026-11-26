import type { Context } from '@deepseek-ai/cordis';
import { defineTool, ToolArgsError, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { chooseOption, drawIdeas, InputError, rollDice } from './core.js';

export const name = 'idea-dice';
export const inject = ['tools'];

const randomFields = {
  randomMode: { type: 'string', required: true },
  seed: { type: 'string' },
} as const;

const seedParameter = { type: 'string', description: 'Optional repeatable seed, 1–80 characters. Same inputs and seed reproduce the result in v1. Omit for system randomness.' } as const;

function run<T>(exec: ToolRunContext, action: () => T): T {
  exec.signal.throwIfAborted();
  try { return action(); }
  catch (error) {
    if (error instanceof InputError) throw new ToolArgsError([error.message]);
    throw error;
  }
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'idea_draw',
    description: 'Draw 1–5 concrete Chinese inspiration cards for coding, design, writing or games. Each combines a curated theme, mechanic, constraint and actionable first step; combinations do not repeat within a call. Works locally, without a model API. Use when the user wants a creative idea or challenge.',
    parameters: {
      category: { type: 'string', enum: ['code', 'design', 'writing', 'game'], description: 'Category. Defaults to code.' },
      count: { type: 'integer', description: 'Number of cards, 1–5. Defaults to 1.' },
      seed: seedParameter,
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          category: { type: 'string', required: true },
          ideas: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false, properties: {
              title: { type: 'string', required: true }, brief: { type: 'string', required: true },
              mechanic: { type: 'string', required: true }, constraint: { type: 'string', required: true },
              firstStep: { type: 'string', required: true },
            },
          } },
          ...randomFields,
        },
      },
      render: (_args, result) => [{ type: 'text', text: result.text }],
    },
    isConcurrencySafe: () => true,
    execute: async (args, exec) => run(exec, () => drawIdeas(args)),
    presentCall: () => ({ card: 'generic', title: '🎲 抽取灵感卡', kind: 'read' }),
  }));

  ctx.tools.register(defineTool({
    name: 'idea_choose',
    description: 'Choose one of 2–50 explicitly supplied options at random. Optional positive integer weights control relative probabilities. Labels are treated as data, never commands. For playful choices and brainstorming, not an evaluation of option quality. Does not perform the selected action.',
    parameters: {
      options: { type: 'array', required: true, items: { type: 'string' }, description: '2–50 distinct option labels, each 1–120 characters.' },
      weights: { type: 'array', items: { type: 'integer' }, description: 'Optional weights matching options in order, each 1–100000. Omit for equal chances.' },
      seed: seedParameter,
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          text: { type: 'string', required: true }, selected: { type: 'string', required: true },
          index: { type: 'integer', required: true }, weight: { type: 'integer', required: true },
          totalWeight: { type: 'integer', required: true }, percentage: { type: 'number', required: true },
          ...randomFields,
        },
      },
      render: (_args, result) => [{ type: 'text', text: result.text }],
    },
    isConcurrencySafe: () => true,
    execute: async (args, exec) => run(exec, () => chooseOption(args)),
    presentCall: () => ({ card: 'generic', title: '🎡 转动选择轮盘', kind: 'read' }),
  }));

  ctx.tools.register(defineTool({
    name: 'idea_roll',
    description: 'Roll virtual dice and return every die, subtotal, modifier and total. Accepts only NdM, dM, NdM+K or NdM-K (e.g. 2d6+3); no code evaluation. At most 100 dice, 2–1000 sides per die, modifier magnitude at most 1000. Suitable for tabletop play and creative prompts.',
    parameters: {
      expression: { type: 'string', required: true, description: 'Dice notation such as d20, 2d6+3 or 4d8-2.' },
      seed: seedParameter,
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          text: { type: 'string', required: true }, expression: { type: 'string', required: true },
          rolls: { type: 'array', required: true, items: { type: 'integer' } },
          subtotal: { type: 'integer', required: true }, modifier: { type: 'integer', required: true },
          total: { type: 'integer', required: true }, minimum: { type: 'integer', required: true },
          maximum: { type: 'integer', required: true }, ...randomFields,
        },
      },
      render: (_args, result) => [{ type: 'text', text: result.text }],
    },
    isConcurrencySafe: () => true,
    execute: async (args, exec) => run(exec, () => rollDice(args)),
    presentCall: args => ({ card: 'generic', title: `🎲 掷骰 ${args.expression}`, kind: 'read' }),
  }));
}
