import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseOption, drawIdeas, InputError, randomSource, rollDice, validateSeed } from '../src/core.js';
import { categories, decks } from '../src/catalog.js';

test('each category produces concrete bounded cards and distinct combinations even at one RNG boundary', () => {
  for (const category of categories) {
    const result = drawIdeas({ category, count: 5 }, () => 0);
    assert.equal(result.ideas.length, 5);
    assert.equal(new Set(result.ideas.map(idea => JSON.stringify(idea))).size, 5);
    for (const idea of result.ideas) {
      assert.ok(decks[category].themes.some(theme => theme.title === idea.title));
      assert.ok(idea.brief && idea.mechanic && idea.constraint && idea.firstStep);
    }
  }
});

test('a fixed seed reproduces cards and dice across fresh generators', () => {
  const input = { category: 'game', count: 3, seed: '周末小实验' };
  assert.deepEqual(drawIdeas(input), drawIdeas(input));
  assert.deepEqual(rollDice({ expression: '10d20+3', seed: 'repeat-me' }), rollDice({ expression: '10d20+3', seed: 'repeat-me' }));
  assert.notDeepEqual(drawIdeas(input).ideas, drawIdeas({ ...input, seed: '另一个种子' }).ideas);
});

test('seed stream has stable v1 values and all generated values lie in the requested range', () => {
  const rng = randomSource('stable');
  const values = Array.from({ length: 8 }, () => rng(6));
  // Public v1 compatibility vector: changing this sequence requires a versioned RNG change.
  assert.deepEqual(values, [3, 4, 0, 1, 1, 4, 3, 4]);
  const again = randomSource('stable');
  assert.deepEqual(values, Array.from({ length: 8 }, () => again(6)));
  for (const max of [1, 2, 6, 1000, 5_000_000]) {
    const seeded = randomSource(`bounds-${max}`);
    const system = randomSource();
    for (let i = 0; i < 40; i++) {
      for (const value of [seeded(max), system(max)]) assert.ok(Number.isSafeInteger(value) && value >= 0 && value < max);
    }
  }
});

test('draw rejects unknown categories and unbounded or fractional card counts', () => {
  assert.throws(() => drawIdeas({ category: 'unknown' }), InputError);
  for (const count of [0, 6, 1.5, NaN, Infinity]) assert.throws(() => drawIdeas({ count }), InputError);
});

test('invalid seeds fail consistently and whitespace normalization is explicit', () => {
  for (const seed of ['', '  ', 'x'.repeat(81), 'x\ny', 'x\0y']) assert.throws(() => validateSeed(seed), InputError);
  assert.equal(validateSeed('  hello  '), 'hello');
  assert.deepEqual(drawIdeas({ seed: 'hello' }), drawIdeas({ seed: '  hello  ' }));
});

test('weighted choice maps every ticket to exactly the documented integer weight', () => {
  const selected: string[] = [];
  for (let ticket = 0; ticket < 6; ticket++) {
    const result = chooseOption({ options: ['甲', '乙', '丙'], weights: [1, 3, 2] }, () => ticket);
    selected.push(result.selected);
    assert.equal(result.totalWeight, 6);
  }
  assert.deepEqual(selected, ['甲', '乙', '乙', '乙', '丙', '丙']);
  assert.equal(chooseOption({ options: ['甲', '乙'] }, max => max - 1).index, 2);
  assert.equal(chooseOption({ options: ['甲', '乙'] }, () => 0).percentage, 50);
});

test('choice rejects duplicate or empty labels, mismatched weights and invalid weight bounds', () => {
  for (const options of [[], ['one'], Array(51).fill('x'), ['same', ' same '], ['x', ''], ['x', 'a'.repeat(121)], ['x', 'a\nb']]) {
    assert.throws(() => chooseOption({ options }), InputError);
  }
  for (const weights of [[1], [1, 0], [1, -1], [1, 1.5], [1, Infinity], [1, 100001]]) {
    assert.throws(() => chooseOption({ options: ['a', 'b'], weights }), InputError);
  }
});

test('choice inputs remain unchanged and seeded choices are repeatable', () => {
  const options = ['  hello ', 'world'];
  const weights = [2, 3];
  const input = { options, weights, seed: 'wheel' };
  const first = chooseOption(input);
  assert.deepEqual(first, chooseOption(input));
  assert.deepEqual(options, ['  hello ', 'world']);
  assert.deepEqual(weights, [2, 3]);
});

test('displayed seed and option labels cannot create Markdown links or images', () => {
  const image = '![x](https://example.org/pixel)';
  const escapedImage = '\\!\\[x\\]\\(https\\:\\/\\/example\\.org\\/pixel\\)';
  const link = '[open](https://example.org/page)';
  const escapedLink = '\\[open\\]\\(https\\:\\/\\/example\\.org\\/page\\)';
  const imageChoice = chooseOption({ options: [image, 'plain'], seed: image }, () => 0);
  assert.equal(imageChoice.selected, image);
  assert.equal(imageChoice.seed, image);
  assert.ok(imageChoice.text.includes(escapedImage));
  assert.ok(!imageChoice.text.includes(image));
  const linkChoice = chooseOption({ options: ['plain', link] }, max => max - 1);
  assert.equal(linkChoice.selected, link);
  assert.ok(linkChoice.text.includes(escapedLink));
  assert.ok(!linkChoice.text.includes(link));
  for (const result of [drawIdeas({ seed: image }), rollDice({ expression: 'd6', seed: image })]) {
    assert.equal(result.seed, image);
    assert.ok(result.text.includes(escapedImage));
    assert.ok(!result.text.includes(image));
  }
});

test('dice parsing returns every roll and correct totals at both range boundaries', () => {
  const low = rollDice({ expression: '2d6+3' }, () => 0);
  assert.deepEqual(low.rolls, [1, 1]);
  assert.equal(low.total, 5);
  assert.equal(low.minimum, 5);
  assert.equal(low.maximum, 15);
  const high = rollDice({ expression: '3D8-2' }, max => max - 1);
  assert.deepEqual(high.rolls, [8, 8, 8]);
  assert.equal(high.total, 22);
  assert.equal(high.expression, '3d8-2');
  assert.equal(rollDice({ expression: 'd20' }, () => 0).expression, '1d20');
  const zero = rollDice({ expression: 'd6-0' }, () => 0);
  assert.equal(zero.expression, '1d6');
  assert.equal(Object.is(zero.modifier, -0), false);
});

test('maximum dice count and negative totals are supported within bounded arithmetic', () => {
  const maximum = rollDice({ expression: '100d1000+1000' }, max => max - 1);
  assert.equal(maximum.rolls.length, 100);
  assert.equal(maximum.total, 101000);
  assert.equal(rollDice({ expression: 'd2-1000' }, () => 0).total, -999);
});

test('dice rejects code, extra operators and out-of-range arithmetic', () => {
  for (const expression of ['process.exit()', '1d6;alert(1)', '2d6+1d4', '2d6*2', '0d6', '101d6', 'd1', 'd1001', 'd6+1001', '-2d6', '2 d6', '', 'x'.repeat(31)]) {
    assert.throws(() => rollDice({ expression }), InputError);
  }
});
