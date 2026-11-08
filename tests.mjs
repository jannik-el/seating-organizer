// Unit tests for the pure logic block in seating.html.
// Run: node tests.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./seating.html', import.meta.url), 'utf8');
const src = html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1];
const ctx = { module: {} };
vm.runInNewContext(src, ctx);
const L = ctx.module.exports;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function eq(a, b, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

function makeClass(n, rows, cols) {
  const s = L.defaultState();
  s.grid.rows = rows; s.grid.cols = cols;
  s.students = Array.from({ length: n }, (_, i) => ({ id: 's' + i, name: 'S' + i, tags: [], note: '' }));
  return s;
}
function sample() {
  const s = makeClass(25, 5, 6);
  for (const i of [3, 9, 21]) s.students[i].tags.push('glasses');
  s.relations = [
    { a: 's1', b: 's5', type: 'conflict', minDistance: 2 },
    { a: 's11', b: 's13', type: 'conflict', minDistance: 1 },
    { a: 's6', b: 's19', type: 'conflict', minDistance: 1 },
    { a: 's0', b: 's12', type: 'together' },
    { a: 's4', b: 's10', type: 'together' },
    { a: 's7', b: 's18', type: 'together' },
  ];
  return s;
}

console.log('distance & grid');
test('Chebyshev distance: diagonal counts as 1', () => eq(L.dist({ r: 0, c: 0 }, { r: 1, c: 1 }), 1));
test('row from front respects bottom front', () => {
  const s = makeClass(0, 5, 5); s.grid.front = 'bottom';
  eq(L.rowFromFront(s, 4), 0); eq(L.rowFromFront(s, 0), 4);
});
test('deskKeys skips empty cells', () => {
  const s = makeClass(0, 2, 2); s.grid.empty = ['0,1'];
  eq(L.deskKeys(s), ['0,0', '1,0', '1,1']);
});
test('resizeGrid drops seats and empties outside the new bounds', () => {
  const s = makeClass(2, 4, 4); s.seats = { '0,0': 's0', '3,3': 's1' }; s.grid.empty = ['2,3', '0,1'];
  L.resizeGrid(s, 3, 3);
  eq(s.seats, { '0,0': 's0' }); eq(s.grid.empty, ['0,1']);
});

console.log('evaluate');
test('conflict neighbours (incl. diagonal) are flagged', () => {
  const s = makeClass(2, 3, 3);
  s.relations = [{ a: 's0', b: 's1', type: 'conflict', minDistance: 1 }];
  s.seats = { '0,0': 's0', '1,1': 's1' };
  const r = L.evaluate(s);
  eq(r.issues.map(i => i.kind), ['conflict']); ok(r.bad.has('s0') && r.bad.has('s1'));
  s.seats = { '0,0': 's0', '0,2': 's1' };
  eq(L.evaluate(s).issues.length, 0);
});
test('minDistance 2 requires one seat between', () => {
  const s = makeClass(2, 1, 4);
  s.relations = [{ a: 's0', b: 's1', type: 'conflict', minDistance: 2 }];
  s.seats = { '0,0': 's0', '0,2': 's1' };
  eq(L.evaluate(s).issues.length, 1);
  s.seats = { '0,0': 's0', '0,3': 's1' };
  eq(L.evaluate(s).issues.length, 0);
});
test('priority student outside front rows is flagged with German text', () => {
  const s = makeClass(1, 4, 2); s.students[0].tags = ['glasses'];
  s.seats = { '3,0': 's0' };
  const r = L.evaluate(s);
  eq(r.issues[0].kind, 'priority'); ok(r.issues[0].text.includes('Reihe 4'), r.issues[0].text);
});
test('together pair apart gives a low-severity hint', () => {
  const s = makeClass(2, 1, 4);
  s.relations = [{ a: 's0', b: 's1', type: 'together' }];
  s.seats = { '0,0': 's0', '0,3': 's1' };
  eq(L.evaluate(s).issues.map(i => i.severity), ['low']);
});
test('too few desks is reported', () => {
  const s = makeClass(5, 2, 2);
  ok(L.evaluate(s).issues.some(i => i.kind === 'capacity'));
});

console.log('arrange');
test('sample class (25 students, 5×6) gets zero violations in < 1 s', () => {
  const s = sample();
  const t0 = performance.now();
  s.seats = L.arrange(s, { rng: L.mulberry32(1) });
  const ms = performance.now() - t0;
  const r = L.evaluate(s);
  eq(r.issues.map(i => i.text), []);
  eq(Object.keys(s.seats).length, 25);
  ok(ms < 1000, `took ${ms} ms`);
});
test('zero violations across 20 random seeds', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = sample();
    s.seats = L.arrange(s, { rng: L.mulberry32(seed) });
    const hard = L.evaluate(s).issues.filter(i => i.severity !== 'low');
    eq(hard.map(i => i.text), [], `seed ${seed}:`);
  }
});
test('locked students never move', () => {
  const s = sample();
  s.seats = { '4,5': 's3', '2,2': 's1' }; s.locked = ['s3', 's1'];
  for (let seed = 1; seed <= 5; seed++) {
    const seats = L.arrange(s, { rng: L.mulberry32(seed) });
    eq(seats['4,5'], 's3'); eq(seats['2,2'], 's1');
  }
});
test('every student seated at most once, only on desks', () => {
  const s = sample(); s.grid.empty = ['0,2', '1,2', '2,2'];
  const seats = L.arrange(s, { rng: L.mulberry32(7) });
  const ids = Object.values(seats);
  eq(new Set(ids).size, ids.length);
  ok(Object.keys(seats).every(k => !s.grid.empty.includes(k)));
  eq(ids.length, 25);
});
test('front rows filled with priority students when there are more of them than front seats', () => {
  const s = makeClass(10, 5, 2); // 4 seats in front 2 rows
  for (let i = 0; i < 6; i++) s.students[i].tags = ['glasses'];
  const seats = L.arrange(s, { rng: L.mulberry32(3) });
  const front = ['0,0', '0,1', '1,0', '1,1'].map(k => seats[k]);
  ok(front.every(id => Number(id.slice(1)) < 6), JSON.stringify(front));
});
test('respects front = bottom', () => {
  const s = makeClass(10, 5, 2); s.grid.front = 'bottom';
  s.students[0].tags = ['glasses'];
  const seats = L.arrange(s, { rng: L.mulberry32(3) });
  const k = Object.keys(seats).find(k => seats[k] === 's0');
  ok(L.parseKey(k).r >= 3, k);
});
test('more students than desks: fills every desk, no crash', () => {
  const s = makeClass(8, 2, 3);
  eq(Object.keys(L.arrange(s, { rng: L.mulberry32(1) })).length, 6);
});
test('impossible conflicts produce a best effort with issues listed', () => {
  const s = makeClass(3, 1, 3);
  s.relations = [{ a: 's0', b: 's1', type: 'conflict', minDistance: 1 }, { a: 's1', b: 's2', type: 'conflict', minDistance: 1 },
    { a: 's0', b: 's2', type: 'conflict', minDistance: 1 }];
  s.seats = L.arrange(s, { rng: L.mulberry32(1) });
  // best layout: s1 can't avoid both; exactly 2 adjacent conflict pairs remain
  eq(L.evaluate(s).issues.filter(i => i.kind === 'conflict').length, 2);
});

console.log('names & import');
test('parseNameList strips numbering, blanks and duplicates', () => {
  const r = L.parseNameList('1. Anna\n\n2) Ben\n  anna \nCem\tYilmaz\nDana', ['Dana']);
  eq(r.added, ['Anna', 'Ben', 'Cem Yilmaz']); eq(r.duplicates, ['anna', 'Dana']);
});
test('25 pasted names create 25 entries', () => {
  eq(L.parseNameList(Array.from({ length: 25 }, (_, i) => 'Kind ' + i).join('\n')).added.length, 25);
});
test('export → import round trip is identical', () => {
  const s = sample(); s.seats = L.arrange(s, { rng: L.mulberry32(2) }); s.locked = ['s1']; s.className = '7b';
  s.grid.empty = ['0,5'];
  delete s.seats['0,5'];
  eq(L.normalize(JSON.parse(JSON.stringify(s))), s);
});
test('normalize drops broken references and rejects garbage', () => {
  const s = L.normalize({ grid: { rows: 99, cols: 3 }, students: [{ id: 'a', name: 'A', tags: ['nope'] }],
    relations: [{ a: 'a', b: 'ghost', type: 'conflict' }], seats: { '0,0': 'a', '0,1': 'a', '9,9': 'a' }, locked: ['ghost'] });
  eq(s.grid.rows, 15); eq(s.students[0].tags, []); eq(s.relations, []); eq(s.seats, { '0,0': 'a' }); eq(s.locked, []);
  let threw = false; try { L.normalize({ foo: 1 }); } catch { threw = true; }
  ok(threw, 'should reject non-plan data');
});

console.log('animals & name cards');
test('assignAnimals gives unique animals and keeps existing ones', () => {
  const s = makeClass(30, 6, 6); s.students[0].animal = '🦄';
  L.assignAnimals(s, L.mulberry32(4));
  eq(s.students[0].animal, '🦄');
  const all = s.students.map(x => x.animal);
  ok(all.every(Boolean)); eq(new Set(all).size, 30);
});
test('more students than animals still works (reuse)', () => {
  const s = makeClass(L.ANIMALS.length + 5, 15, 15);
  L.assignAnimals(s, L.mulberry32(1));
  ok(s.students.every(x => x.animal));
});
test('rerolling one student changes only that animal and stays unique', () => {
  const s = makeClass(10, 4, 4); L.assignAnimals(s, L.mulberry32(2));
  const before = s.students.map(x => x.animal);
  L.rerollAnimals(s, 's3', L.mulberry32(9));
  const after = s.students.map(x => x.animal);
  ok(after[3] !== before[3]); eq(after.filter((_, i) => i !== 3), before.filter((_, i) => i !== 3));
  eq(new Set(after).size, 10);
});
test('rerolling everyone keeps animals unique', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = makeClass(40, 7, 7); L.assignAnimals(s, L.mulberry32(seed));
    L.rerollAnimals(s, undefined, L.mulberry32(seed + 100));
    eq(new Set(s.students.map(x => x.animal)).size, 40, `seed ${seed}:`);
  }
});
test('normalize keeps animals through export/import', () => {
  const s = makeClass(3, 2, 2); L.assignAnimals(s, L.mulberry32(5));
  eq(L.normalize(JSON.parse(JSON.stringify(s))).students.map(x => x.animal), s.students.map(x => x.animal));
});
test('cards are ordered front row first, left to right, unseated last', () => {
  const s = makeClass(4, 3, 3); s.grid.front = 'bottom';
  s.seats = { '0,0': 's0', '2,1': 's1', '2,0': 's2' };
  const order = L.cardOrder(s);
  eq(order.map(o => o.student.id), ['s2', 's1', 's0', 's3']);
  eq(order[0].seat, 'Reihe 1 · Platz 1'); eq(order[3].seat, '');
});

test('animal list uses only emoji that exist on Windows 10 (Emoji ≤ 11), no duplicates', () => {
  const tooNew = ['🦦', '🦥', '🦩', '🦫', '🦭', '🦻', '🦧', '🦮', '🦤', '🪲', '🪱', '🦬', '🐻‍❄️'];
  ok(!L.ANIMALS.some(a => tooNew.includes(a)), 'contains a too-new emoji');
  eq(new Set(L.ANIMALS).size, L.ANIMALS.length);
  ok(L.ANIMALS.length >= 55, 'pool too small');
});
test('old saved plans: hearing-aid emoji is migrated to 👂', () => {
  const s = L.normalize({ grid: { rows: 2, cols: 2 }, students: [], tags: [{ id: 'hearing', label: 'Hörgerät', icon: '🦻', frontRows: 2 }] });
  eq(s.tags[0].icon, '👂');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
