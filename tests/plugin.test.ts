import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { ToolsService, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import * as plugin from '../src/index.js';

async function harness(t: TestContext) {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(SystemPrompt, {}).await();
  await ctx.plugin(ToolsService).await();
  const fiber = ctx.plugin(plugin);
  await fiber.await();
  const execute = (name: string, args: unknown, signal = new AbortController().signal) => {
    const tool = ctx.tools.get(name);
    assert.ok(tool);
    return tool.execute(args, { signal } as ToolRunContext) as Promise<any>;
  };
  return { ctx, fiber, execute };
}

test('real Cordis registry exposes three native tools and removes them on unload', async t => {
  const h = await harness(t);
  assert.deepEqual(h.ctx.tools.schemas().map(tool => tool.name), ['idea_draw', 'idea_choose', 'idea_roll']);
  assert.deepEqual(h.ctx.tools.get('idea_choose')!.parameters.required, ['options']);
  assert.deepEqual(h.ctx.tools.get('idea_roll')!.parameters.required, ['expression']);
  await h.fiber.dispose();
  assert.equal(h.ctx.tools.definitions().length, 0);
});

test('native inspiration tool returns structured cards and readable rendered text', async t => {
  const h = await harness(t);
  const result = await h.execute('idea_draw', { category: 'design', count: 2, seed: 'demo' });
  assert.equal(result.ideas.length, 2);
  assert.equal(result.category, 'design');
  assert.equal(result.randomMode, 'seeded');
  assert.match(result.text, /设计挑战/);
  assert.deepEqual(h.ctx.tools.get('idea_draw')!.output.render({}, result), [{ type: 'text', text: result.text }]);
});

test('choice and dice execute through actual native definitions', async t => {
  const h = await harness(t);
  const choice = await h.execute('idea_choose', { options: ['画画', '写代码'], weights: [1, 3], seed: 'weekend' });
  assert.ok(['画画', '写代码'].includes(choice.selected));
  assert.equal(choice.totalWeight, 4);
  const dice = await h.execute('idea_roll', { expression: '4d6+2', seed: 'game-night' });
  assert.equal(dice.rolls.length, 4);
  assert.equal(dice.total, dice.rolls.reduce((a: number, b: number) => a + b, 0) + 2);
});

test('semantic input failures have native INVALID_ARGS codes', async t => {
  const h = await harness(t);
  await assert.rejects(h.execute('idea_draw', { count: 100 }), { code: 'INVALID_ARGS' });
  await assert.rejects(h.execute('idea_choose', { options: ['same', 'same'] }), { code: 'INVALID_ARGS' });
  await assert.rejects(h.execute('idea_roll', { expression: '1d6+process.exit()' }), { code: 'INVALID_ARGS' });
});

test('cancelled calls preserve host cancellation reason', async t => {
  const h = await harness(t);
  const controller = new AbortController();
  const reason = new Error('cancelled by harness');
  controller.abort(reason);
  await assert.rejects(h.execute('idea_draw', {}, controller.signal), error => error === reason);
});
