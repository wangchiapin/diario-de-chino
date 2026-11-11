/* Diario de chino：自動檢查（只要有 Node.js，不需要安裝任何東西）
   用法：在專案資料夾執行  node tests/run.js
   載入 portal-core.js，檢查台灣時間換算成學生當地時間（含夏令換季）、月曆、付費文字、三種語言文字齊全。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ Date, Intl, Math, Object, Array, String, Number, JSON, parseInt, isNaN });
vm.runInContext(fs.readFileSync(path.join(root, 'portal-core.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-hw.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-nudge.js'), 'utf8'), ctx);
const C = name => ctx[name];
const J = x => JSON.stringify(JSON.parse(JSON.stringify(x)));

let passed = 0, failed = 0;
function test(name, f) {
  try { f(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + String(e.message).split('\n').join('\n      ')); }
}

console.log('\n時間換算（台灣時間 → 學生當地時間）');
test('墨西哥（無夏令）：台灣 10:00 → 前一天 20:00', () => {
  const v = C('pcLessonView')({ d: '2026-11-12', s: '10:00', e: '11:00', x: 0 }, 'America/Mexico_City');
  assert.strictEqual(J([v.localDate, v.localStart, v.localEnd, v.dayShift]), J(['2026-11-11', '20:00', '21:00', -1]));
});
test('台灣自己：時間不變、沒有日期差', () => {
  const v = C('pcLessonView')({ d: '2026-11-12', s: '10:00', e: '11:00', x: 0 }, 'Asia/Taipei');
  assert.strictEqual(J([v.localDate, v.localStart, v.dayShift]), J(['2026-11-12', '10:00', 0]));
});
test('西班牙馬德里：夏令（7月，UTC+2）與冬令（12月，UTC+1）各自正確', () => {
  const sum = C('pcLessonView')({ d: '2026-07-15', s: '20:00', e: '21:00' }, 'Europe/Madrid');
  const win = C('pcLessonView')({ d: '2026-12-15', s: '20:00', e: '21:00' }, 'Europe/Madrid');
  assert.strictEqual(sum.localStart, '14:00');   // 20:00 台灣 = 12:00 UTC = 14:00 夏令
  assert.strictEqual(win.localStart, '13:00');   // = 12:00 UTC = 13:00 冬令
});
test('美國紐約換季：11/1 冬令開始，前後兩週同樣的台灣時間，當地時間差一小時', () => {
  const before = C('pcLessonView')({ d: '2026-10-30', s: '21:00', e: '22:00' }, 'America/New_York');
  const after = C('pcLessonView')({ d: '2026-11-06', s: '21:00', e: '22:00' }, 'America/New_York');
  assert.strictEqual(before.localStart, '09:00');   // 夏令 UTC-4：13:00 UTC → 09:00
  assert.strictEqual(after.localStart, '08:00');    // 冬令 UTC-5：13:00 UTC → 08:00
});
test('台灣早上的課，在美洲是前一天晚上；在西班牙是同一天', () => {
  assert.strictEqual(C('pcLessonView')({ d: '2026-11-12', s: '03:00', e: '04:00' }, 'America/Bogota').localDate, '2026-11-11');
  assert.strictEqual(C('pcLessonView')({ d: '2026-11-12', s: '20:00', e: '21:00' }, 'Europe/Madrid').localDate, '2026-11-12');
});
test('時區名稱打錯不會當掉，退回台灣時間', () => {
  const v = C('pcLessonView')({ d: '2026-11-12', s: '10:00', e: '11:00' }, 'Nowhere/Land');
  assert.strictEqual(v.localStart, '10:00');
});
test('整天行程：沒有時間，算沒上課', () => {
  const v = C('pcLessonView')({ d: '2026-11-12', s: '', e: '', x: 1 }, 'America/Mexico_City');
  assert.strictEqual(J([v.allDay, v.localDate, v.localStart]), J([true, '2026-11-12', '']));
  assert.strictEqual(C('pcStatus')(v, 0), 'off');
});

console.log('\n狀態、下一堂、月曆');
const now = C('pcTwToUtcMs')('2026-11-12', '10:30');   // 台灣 11/12 10:30
test('已上完／正在上／還沒上／請假', () => {
  const st = l => C('pcStatus')(C('pcLessonView')(l, 'Asia/Taipei'), now);
  assert.strictEqual(st({ d: '2026-11-12', s: '09:00', e: '10:00', x: 0 }), 'done');
  assert.strictEqual(st({ d: '2026-11-12', s: '10:00', e: '11:00', x: 0 }), 'now');
  assert.strictEqual(st({ d: '2026-11-12', s: '11:00', e: '12:00', x: 0 }), 'upcoming');
  assert.strictEqual(st({ d: '2026-11-13', s: '10:00', e: '11:00', x: 1 }), 'off');
});
test('下一堂：跳過請假的、已結束的，取最早的', () => {
  const lessons = [
    { d: '2026-11-12', s: '09:00', e: '10:00', x: 0 }, { d: '2026-11-13', s: '10:00', e: '11:00', x: 1 },
    { d: '2026-11-15', s: '10:00', e: '11:00', x: 0 }, { d: '2026-11-14', s: '10:00', e: '11:00', x: 0 }];
  assert.strictEqual(C('pcNextLesson')(lessons, 'Asia/Taipei', now).twDate, '2026-11-14');
  assert.strictEqual(C('pcNextLesson')([], 'Asia/Taipei', now), null);
});
test('依當地日期分組：同一天兩堂依時間排序', () => {
  const g = C('pcGroupByLocalDate')([{ d: '2026-11-12', s: '12:00', e: '13:00', x: 0 }, { d: '2026-11-12', s: '09:00', e: '10:00', x: 0 }], 'Asia/Taipei');
  assert.strictEqual(J(g['2026-11-12'].map(v => v.localStart)), J(['09:00', '12:00']));
});
test('月曆：2026 年 11 月，週一開頭、42 格、11/1 是週日所以排在第 7 格', () => {
  const cells = C('pcMonthGrid')(2026, 11);
  assert.strictEqual(cells.length, 42);
  assert.strictEqual(cells[0].date, '2026-10-26');
  assert.strictEqual(cells[6].date, '2026-11-01'); assert.strictEqual(cells[6].inMonth, true);
  assert.strictEqual(cells[0].inMonth, false);
});
test('日期加減與天數差：跨月、跨年', () => {
  assert.strictEqual(C('pcIsoAdd')('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(C('pcDaysBetween')('2026-11-01', '2026-11-12'), 11);
});

console.log('\n付費文字與語言');
test('包堂顯示剩幾堂；單堂付費只顯示單堂付費；沒設定不顯示', () => {
  assert.strictEqual(J(C('pcPayLine')({ pay: 'package', remaining: 3 }, 'tc')), J({ label: '剩餘堂數', value: '3 堂' }));
  assert.strictEqual(J(C('pcPayLine')({ pay: 'single', remaining: null }, 'tc')), J({ label: '付費', value: '單堂付費' }));
  assert.strictEqual(C('pcPayLine')({ pay: '', remaining: null }, 'tc'), null);
  assert.strictEqual(C('pcPayLine')({ pay: 'package', remaining: -1 }, 'es').value, '0 clases');   // 超堂不顯示負數
});
test('瀏覽器語言判斷', () => {
  assert.strictEqual(C('pcDetectLang')('es-MX'), 'es'); assert.strictEqual(C('pcDetectLang')('zh-TW'), 'tc');
  assert.strictEqual(C('pcDetectLang')('zh-CN'), 'sc'); assert.strictEqual(C('pcDetectLang')('en-US'), 'es');
});
test('三種語言的文字一個都沒少', () => {
  const keys = k => Object.keys(ctx.PC_I18N[k]).sort().join(',');
  assert.strictEqual(keys('tc'), keys('es')); assert.strictEqual(keys('sc'), keys('es'));
});
test('欄位帶入、找不到的文字退回西語', () => {
  assert.strictEqual(C('pcT')('tc', 'hello', { name: 'Pedro' }), 'Pedro，你好');
  assert.strictEqual(C('pcT')('tc', 'notExistingKey'), 'notExistingKey');
});
test('簡體介面沒有大陸用語（登录、数据、信息、软件、网络、设置）', () => {
  const all = JSON.stringify(ctx.PC_I18N.sc);
  ['登录', '数据', '信息', '软件', '网络', '设置', '屏幕', '菜单'].forEach(w => assert.strictEqual(all.indexOf(w), -1, w));
});
test('簡體介面沒有留著繁體字', () => {
  const all = Object.values(ctx.PC_I18N.sc).join('');
  ['號', '電', '郵', '驗', '設', '時', '課', '費', '載', '連', '資', '發', '訊', '還', '這', '麼'].forEach(c => assert.strictEqual(all.indexOf(c), -1, c));
});
test('登入錯誤代碼對應', () => {
  assert.strictEqual(C('pcAuthErrorKey')('auth/invalid-credential'), 'errLogin');
  assert.strictEqual(C('pcAuthErrorKey')('auth/email-already-in-use'), 'errExists');
  assert.strictEqual(C('pcAuthErrorKey')('whatever'), 'errOther');
});


console.log('\n作業（學生版不含答案、自動批改）');
const SAMPLE = {
  meta: { title: '把字句', grammar: '把字句' },
  opts: { cueEs: true },
  sections: [
    { id: 's1', type: 'fill', enabled: true, bank: ['放', '拿'], items: [
      { id: 'f1', enabled: true, zh: '請你__書放在桌上。', answer: '把', es: 'Pon el libro en la mesa.', note: '老師備註' },
      { id: 'f2', enabled: false, zh: '被停用的題__', answer: '把', es: '' }] },
    { id: 's2', type: 'cloze', enabled: true, bank: ['把', '被'], items: [{ id: 'c1', enabled: true, text: '我{1}書放好，書{2}我放在桌上。', answers: ['把', '被'], es: 'x' }] },
    { id: 's3', type: 'order', enabled: true, bank: [], items: [{ id: 'o1', enabled: true, tokens: ['放', '我', '把', '書', '好'], answer: '我把書放好', es: 'Puse el libro.' }] },
    { id: 's4', type: 'choice', enabled: true, bank: [], items: [{ id: 'ch1', enabled: true, es: 'Elige', options: ['我書把放好', '我把書放好', '把我書放好'], answer: 1 }] },
    { id: 's5', type: 'fix', enabled: true, bank: [], items: [{ id: 'x1', enabled: true, wrong: '我書把放好', correct: '我把書放好', tip: '提示' }] },
    { id: 's6', type: 'translate', enabled: true, bank: [], items: [{ id: 't1', enabled: true, es: 'Pon el libro.', vocab: '放', answer: '請把書擺到桌上' }] },
    { id: 's7', type: 'zh2es', enabled: true, bank: [], items: [{ id: 'z1', enabled: true, zh: '我把書放好', vocab: '', answer: 'Dejé el libro bien puesto' }] },
    { id: 's8', type: 'match', enabled: true, bank: [], items: [
      { id: 'm1', enabled: true, zh: '放', es: 'poner' }, { id: 'm2', enabled: true, zh: '拿', es: 'tomar' }, { id: 'm3', enabled: true, zh: '看', es: 'mirar' }, { id: 'm4', enabled: true, zh: '吃', es: 'comer' }] },
    { id: 's9', type: 'sentence', enabled: true, bank: [], items: [{ id: 'se1', enabled: true, cue: '把', es: '', answer: '我把書放好。' }] }
  ]
};
test('總分：段落填空每個空 1 分，其他每題 1 分，停用的題目不算', () => {
  assert.strictEqual(C('hwTotal')(SAMPLE), 1 + 2 + 1 + 1 + 1 + 1 + 1 + 4 + 1);
});
test('學生版：沒有任何答案欄位，也沒有標準答案的文字', () => {
  const v = C('hwBuildStudent')(SAMPLE), txt = JSON.stringify(v);
  ['"answer"', '"answers"', '"correct"', '"tip"', '"note"', '老師備註', '提示', '請把書擺到桌上', 'Dejé el libro'].forEach(k => assert.ok(!txt.includes(k), '不該出現：' + k));
  assert.strictEqual(v.total, 13);
  assert.strictEqual(v.sections.length, 9);
  assert.strictEqual(v.sections[0].items.length, 1);      // 停用的題目不給學生
});
test('學生版：選擇題保留原始選項編號，配對題右欄只有西文且已打散', () => {
  const v = C('hwBuildStudent')(SAMPLE);
  assert.strictEqual(J(v.sections[3].items[0].options.map(o => o.i)), J([0, 1, 2]));
  const m = v.sections[7];
  assert.strictEqual(J(m.items.map(i => i.zh)), J(['放', '拿', '看', '吃']));
  assert.strictEqual(J(m.rights.slice().sort()), J(['comer', 'mirar', 'poner', 'tomar']));
  assert.notStrictEqual(J(m.rights), J(['poner', 'tomar', 'mirar', 'comer']));
});
test('配對題打散順序是固定的（同一份練習單每次都一樣）', () => {
  const a = C('hwMatchPerm')(SAMPLE.sections[7].items), b = C('hwMatchPerm')(SAMPLE.sections[7].items);
  assert.strictEqual(J(a), J(b)); assert.strictEqual(J(a.slice().sort()), J([0, 1, 2, 3]));
});
test('全對：自動批改的題目都拿滿分，西翻中／中翻西／造句留給老師', () => {
  const perm = C('hwMatchPerm')(SAMPLE.sections[7].items);
  const ans = { f1: '把', c1: ['把', '被'], o1: ['我', '把', '書', '放', '好'], ch1: 1, x1: '我把書放好。', t1: '請把書擺到桌上', z1: 'x', se1: 'y' };
  const rights = k => perm.indexOf(k);
  ans.m1 = rights(0); ans.m2 = rights(1); ans.m3 = rights(2); ans.m4 = rights(3);
  const g = C('hwAutoGrade')(SAMPLE, ans);
  assert.strictEqual(g.max, 13); assert.strictEqual(g.autoMax, 10); assert.strictEqual(g.autoGot, 10); assert.strictEqual(g.manual, 3);
  assert.strictEqual(g.items.t1.got, null); assert.strictEqual(g.items.t1.auto, false);
});
test('全錯或沒作答：自動題 0 分，不會當掉', () => {
  const g = C('hwAutoGrade')(SAMPLE, { f1: '被', c1: ['被', '把'], o1: ['書', '我'], ch1: 0, x1: '', m1: 99 });
  assert.strictEqual(g.autoGot, 0); assert.strictEqual(g.items.c1.blanks.join(), 'false,false');
  assert.strictEqual(C('hwAutoGrade')(SAMPLE, null).autoGot, 0);
});
test('段落填空答對一半拿一半分數；空白不算對', () => {
  const g = C('hwAutoGrade')(SAMPLE, { c1: ['把', ''] });
  assert.strictEqual(g.items.c1.got, 1); assert.strictEqual(g.items.c1.ok, false);
});
test('比對時忽略標點、空白、大小寫', () => {
  const g = C('hwAutoGrade')(SAMPLE, { f1: ' 把 ', x1: '我 把 書 放 好！' });
  assert.strictEqual(g.items.f1.got, 1); assert.strictEqual(g.items.x1.got, 1);
});
test('發給學生的文件：狀態是 todo、答案是空的、不含標準答案', () => {
  const d = C('hwAssignDoc')('w1', SAMPLE, 123);
  assert.strictEqual(d.status, 'todo'); assert.strictEqual(J(d.answers), '{}'); assert.strictEqual(d.wid, 'w1'); assert.strictEqual(d.total, 13);
  assert.ok(!JSON.stringify(d).includes('"answer"'));
});
test('資料夾裡的 portal-hw.js 用到的 Firestore 文件格式，不含 undefined（Firestore 不接受）', () => {
  const d = C('hwAssignDoc')('w1', SAMPLE, 123);
  assert.ok(!/undefined/.test(JSON.stringify(d, (k, v) => v === undefined ? 'undefined' : v)));
});
test('標準答案文字：選擇題顯示字母加選項、段落填空用頓號、配對顯示西文', () => {
  const K = C('hwKeyText');
  assert.strictEqual(K('choice', { options: ['甲', '乙'], answer: 1 }), 'B　乙');
  assert.strictEqual(K('cloze', { answers: ['把', '被'] }), '把、被');
  assert.strictEqual(K('match', { es: 'poner' }), 'poner');
  assert.strictEqual(K('fix', { correct: '我把書放好' }), '我把書放好');
});
test('批改總分：半分加總、四捨五入到 0.5', () => {
  const r = C('hwSumReview')({ a: { got: 1, max: 1 }, b: { got: 0.5, max: 1 }, c: { got: 0, max: 2 } });
  assert.strictEqual(r.got, 1.5); assert.strictEqual(r.max, 4);
});
test('Word 批改用的標準答案清單：一題一行、含大題編號', () => {
  const L = C('hwKeyLines')(SAMPLE);
  assert.ok(L.length > 0 && L.every(x => typeof x.key === 'string' && typeof x.no === 'number'));
});

console.log('\n彈跳視窗（練習題、激勵句、提醒）');
const HWD = {
  w1: { status: 'todo', assignedAt: 1000, grammar: '比較句 ＋ 得字補語', sections: [
    { type: 'translate', items: [{ id: 'a', vocab: '媽媽 mamá · 做菜 cocinar · 好 bien' }, { id: 'b', vocab: '' }] },
    { type: 'zh2es', items: [{ id: 'c', vocab: '她 ella · 跑 correr' }] }, { type: 'fill', items: [{ id: 'd', zh: '___' }] }] },
  w2: { status: 'graded', assignedAt: 2000, grammar: '比較句', sections: [{ type: 'translate', items: [{ id: 'e', vocab: '媽媽 mamá' }] }] }
};
test('題庫：單字（中文＋西文）與語法點都抽得到，重複的只算一次', () => {
  const p = C('nudBuildPool')(HWD);
  assert.strictEqual(p.words.length, 5);
  assert.strictEqual(J(p.points), J(['比較句', '得字補語']));
  assert.ok(p.words.some(w => w.zh === '做菜' && w.es === 'cocinar'));
});
test('題庫：沒有練習單就是空的，出不了題', () => {
  const p = C('nudBuildPool')({});
  assert.strictEqual(C('nudMakeQuestion')(p, 'tc', () => 0.1), null);
});
test('題庫：之後練習單變多，題庫跟著變大', () => {
  const one = C('nudBuildPool')({ w2: HWD.w2 }), all = C('nudBuildPool')(HWD);
  assert.ok(all.words.length > one.words.length && all.points.length > one.points.length);
});
test('5 種題型都出得到，且文字裡沒有留下 { }', () => {
  const p = C('nudBuildPool')(HWD), seen = {};
  for (let i = 0; i < 400; i++) { const q = C('nudMakeQuestion')(p, 'tc', Math.random); seen[q.kind] = 1; assert.ok(!/[{}]/.test(q.text), q.text); }
  assert.strictEqual(Object.keys(seen).sort().join(), 'meaning,recall,sentGram,sentWord,zhOf');
});
test('題型文字：三種語言的樣子', () => {
  const p = { words: [{ zh: '媽媽', es: 'mamá' }], points: ['比較句'] };
  const q = (k, l) => { for (let i = 0; i < 200; i++) { const r = C('nudMakeQuestion')(p, l, Math.random); if (r.kind === k) return r.text; } };
  assert.strictEqual(q('zhOf', 'tc'), '「mamá」的中文怎麼說？');
  assert.strictEqual(q('meaning', 'tc'), '「媽媽」是什麼意思？');
  assert.strictEqual(q('sentWord', 'tc'), '用「媽媽」造一個句子吧！然後傳給 Ben！');
  assert.strictEqual(q('sentGram', 'sc'), '用「比較句」造一个句子吧！然后传给 Ben！');
  assert.strictEqual(q('recall', 'tc'), '你還記得「比較句」怎麼用嗎？');
  assert.strictEqual(q('zhOf', 'es'), '¿Cómo se dice «mamá» en chino?');
});
test('只有語法點、沒有單字時，只出語法點題', () => {
  const p = { words: [], points: ['被字句'] };
  for (let i = 0; i < 100; i++) assert.ok(/sentGram|recall/.test(C('nudMakeQuestion')(p, 'tc', Math.random).kind));
});
test('激勵句：預設各 20 句，三種語言一樣多，簡體用台灣用字', () => {
  ['es', 'tc', 'sc'].forEach(l => assert.strictEqual(C('nudEncList')(null, l).length, 20));
  const sc = C('nudEncList')(null, 'sc').join('');
  assert.ok(!/視頻|軟件|網絡|信息/.test(sc) && /台湾/.test(sc));
});
test('激勵句：缺資料的句子（堂數、多久）會跳過，有資料才出現', () => {
  const none = new Set(); for (let i = 0; i < 500; i++) { const e = C('nudMakeEnc')(null, 'tc', {}, Math.random); none.add(e.text); assert.ok(!/[{}]/.test(e.text)); }
  assert.strictEqual(none.size, 18);
  const all = new Set(); for (let i = 0; i < 1500; i++) all.add(C('nudMakeEnc')(null, 'tc', { n: 12, t: '3 個月' }, Math.random).text);
  assert.ok(all.has('你已經跟 Ben 上了 12 堂課了，好棒！') && all.has('你已經學習中文 3 個月 了，繼續保持！'));
});
test('學了多久：天、月、年', () => {
  const S = C('nudSpan');
  assert.strictEqual(S('2026-11-01', '2026-11-11', 'tc'), '10 天');
  assert.strictEqual(S('2026-08-11', '2026-11-11', 'tc'), '3 個月');
  assert.strictEqual(S('2024-05-01', '2026-11-11', 'tc'), '2 年 6 個月');
  assert.strictEqual(S('2024-11-11', '2026-11-11', 'es'), '2 años');
  assert.strictEqual(S('', '2026-11-11', 'tc'), '');
  assert.strictEqual(S('2026-11-12', '2026-11-11', 'tc'), '');
});
test('後台改過的激勵句會取代預設；簡體沒填就用繁體', () => {
  const cfg = { enc: { tc: ['加油！', '你很棒'], sc: ['加油！', ''], es: [] } };
  assert.strictEqual(J(C('nudEncList')(cfg, 'sc')), J(['加油！', '你很棒']));
  assert.strictEqual(J(C('nudEncList')(cfg, 'es')), J(['加油！', '你很棒']));
});
const NOW = Date.UTC(2026, 10, 11, 4, 0, 0);
test('提醒：作業發出滿 3 天還沒交才提醒；批改好還沒看過才提醒', () => {
  const R = C('nudReminders');
  const d3 = { w: { status: 'todo', assignedAt: NOW - 3 * 86400000 } }, d2 = { w: { status: 'todo', assignedAt: NOW - 2 * 86400000 } };
  assert.strictEqual(R(null, { lang: 'tc', hwDocs: d3, now: NOW })[0].text, '你有 1 份作業還沒交，記得寫完傳上來喔！');
  assert.strictEqual(R(null, { lang: 'tc', hwDocs: d2, now: NOW }).length, 0);
  const g = { w: { status: 'graded' } };
  assert.strictEqual(R(null, { lang: 'tc', hwDocs: g, now: NOW, seenGraded: {} })[0].key, 'graded');
  assert.strictEqual(R(null, { lang: 'tc', hwDocs: g, now: NOW, seenGraded: { w: 1 } }).length, 0);
});
test('提醒：今天或明天有課；更久以後不提醒', () => {
  const R = C('nudReminders');
  assert.strictEqual(R(null, { lang: 'tc', next: { dd: 1, localStart: '10:00' } })[0].text, '明天 10:00 有課，別忘了喔！');
  assert.strictEqual(R(null, { lang: 'es', next: { dd: 0, localStart: '20:00' } })[0].text, '¡Hoy a las 20:00 tienes clase, no lo olvides!');
  assert.strictEqual(R(null, { lang: 'tc', next: { dd: 2, localStart: '10:00' } }).length, 0);
});
test('提醒：包堂剩 2 堂以下提醒續購；單堂付費在課前一天提醒「上課前記得提前付費唷！」', () => {
  const R = C('nudReminders');
  assert.strictEqual(R(null, { lang: 'tc', pay: 'package', remaining: 2 })[0].text, '你的課堂只剩 2 堂了，記得提前續購喔！');
  assert.strictEqual(R(null, { lang: 'tc', pay: 'package', remaining: 3 }).length, 0);
  assert.strictEqual(R(null, { lang: 'tc', pay: 'single', next: { dd: 1, localStart: '10:00' } }).map(x => x.key).join(), 'classSoon,paySingle');
  assert.strictEqual(R(null, { lang: 'tc', pay: 'single', next: { dd: 1, localStart: '10:00' } }).pop().text, '上課前記得提前付費唷！');
});
test('提醒：這位學生的繳費提醒關掉時不出現（其他提醒照常）', () => {
  const R = C('nudReminders');
  assert.strictEqual(R(null, { lang: 'tc', pay: 'package', remaining: 1, payOn: false }).length, 0);
  assert.strictEqual(R(null, { lang: 'tc', pay: 'package', remaining: 1, payOn: false, next: { dd: 1, localStart: '9:00' } }).length, 1);
});
test('後台改過的提醒文字會取代預設', () => {
  const cfg = { rem: { graded: { tc: '批改好囉', sc: '', es: '' } } };
  assert.strictEqual(C('nudReminders')(cfg, { lang: 'tc', hwDocs: { w: { status: 'graded' } } })[0].text, '批改好囉');
  assert.strictEqual(C('nudReminders')(cfg, { lang: 'sc', hwDocs: { w: { status: 'graded' } } })[0].text, '批改好囉');
  assert.strictEqual(C('nudReminders')(cfg, { lang: 'es', hwDocs: { w: { status: 'graded' } } })[0].text, '¡Tu tarea ya fue corregida, ve a verla!');
});
test('進頁面：沒題庫也沒提醒時只會出激勵句；有的話三種都有機會', () => {
  const O = C('nudOnEnter'), kinds = new Set();
  for (let i = 0; i < 100; i++) assert.strictEqual(O({ pool: { words: [], points: [] }, reminders: [], lang: 'tc', vars: {} }, Math.random).kind, 'enc');
  for (let i = 0; i < 300; i++) kinds.add(O({ pool: { words: [{ zh: '好', es: 'bien' }], points: [] }, reminders: [{ kind: 'rem', text: 'x' }], lang: 'tc', vars: {} }, Math.random).kind);
  assert.ok(kinds.has('enc') && kinds.has('rem') && kinds.has('sentWord'));
});

console.log('\n' + (failed ? '有 ' + failed + ' 項沒通過（通過 ' + passed + ' 項）' : '全部通過（' + passed + ' 項）') + '\n');
process.exit(failed ? 1 : 0);
