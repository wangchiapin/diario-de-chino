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
vm.runInContext(fs.readFileSync(path.join(root, 'vendor/opencc-t2cn.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-hw.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-nudge.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-learn.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-board.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-survey.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'portal-pinyin.js'), 'utf8') + ';this.symToZhuyin = symToZhuyin;', ctx);
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
  assert.strictEqual(C('pcDetectLang')('zh-CN'), 'sc'); assert.strictEqual(C('pcDetectLang')('en-US'), 'en');
  assert.strictEqual(C('pcDetectLang')('pt-BR'), 'es'); assert.strictEqual(C('pcDetectLang')('fr'), 'es');
});
test('英文介面文字：每個 key 都有英文，英文單字意思優先、沒填就退回西文', () => {
  const I = C('PC_I18N');
  Object.keys(I.es).forEach(k => assert.ok(I.en[k], 'core en 缺 ' + k));
  assert.strictEqual(C('pcT')('en', 'hwTitle'), 'Homework');
  const LI = C('LEARN_I18N'); Object.keys(LI.es).forEach(k => assert.ok(LI.en[k], 'learn en 缺 ' + k));
  const BI = C('BOARD_I18N'); Object.keys(BI.es).forEach(k => assert.ok(BI.en[k], 'board en 缺 ' + k));
  assert.strictEqual(C('learnMean')({ es: 'agua', en: 'water' }, 'en'), 'water');
  assert.strictEqual(C('learnMean')({ es: 'agua' }, 'en'), 'agua');
  assert.strictEqual(C('learnMean')({ es: 'agua', en: 'water' }, 'es'), 'agua');
  const T = C('learnTotals')({}, { words: [{ zh: '水', py: 'shuǐ', es: 'agua', en: 'water' }] });
  assert.strictEqual(T.words[0].en, 'water');
  assert.strictEqual(C('nudSpan')('2024-01-05', '2026-11-17', 'en'), '2 years and 10 months');
  const pool = { words: [{ zh: '水', es: 'agua', en: 'water' }], points: [] };
  const qEn = C('nudMakeQuestion')(pool, 'en', () => 0), qEs = C('nudMakeQuestion')(pool, 'es', () => 0);
  assert.ok(/water/.test(qEn.text) && !/agua/.test(qEn.text), qEn.text);
  assert.ok(/agua/.test(qEs.text), qEs.text);
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

console.log('\n作業：簡體作答也算對');
test('學生用簡體字作答，能對上繁體的標準答案（填空、段落填空、排序、改錯）', () => {
  const S2 = { meta: { title: 't' }, sections: [
    { id: 's1', type: 'fill', enabled: true, bank: [], items: [{ id: 'f1', enabled: true, zh: '我__書。', answer: '買' }] },
    { id: 's2', type: 'cloze', enabled: true, bank: [], items: [{ id: 'c1', enabled: true, text: '{1}喜歡{2}', answers: ['我', '學習'] }] },
    { id: 's3', type: 'order', enabled: true, items: [{ id: 'o1', enabled: true, tokens: ['我', '喜歡', '電腦'], answer: '我喜歡電腦' }] },
    { id: 's4', type: 'fix', enabled: true, items: [{ id: 'x1', enabled: true, wrong: '他很高興了', correct: '他很高興' }] }
  ] };
  const g = C('hwAutoGrade')(S2, { f1: '买', c1: ['我', '学习'], o1: ['我', '喜欢', '电脑'], x1: '他很高兴' });
  assert.strictEqual(g.autoGot, g.autoMax);
  const bad = C('hwAutoGrade')(S2, { f1: '卖', c1: ['你', '学习'], o1: ['我', '电脑', '喜欢'], x1: '他很高兴了' });
  assert.strictEqual(bad.autoGot, 1);   // 只有段落填空的「學習」那一格對
});
test('繁體作答照樣對', () => {
  const S2 = { sections: [{ id: 's1', type: 'fill', enabled: true, items: [{ id: 'f1', enabled: true, zh: '我__書。', answer: '買' }] }] };
  assert.strictEqual(C('hwAutoGrade')(S2, { f1: '買' }).autoGot, 1);
});

test('派出作業時，生詞表（中文＋西文）一起存進去，學生頁單字總表就有西文意思', () => {
  const S3 = { meta: { title: 't' }, vocab: [{ zh: '醫生', es: 'médico', esSrc: '醫生' }, { zh: '健康', es: '' }, { zh: '', es: 'x' }],
    sections: [{ id: 's1', type: 'fill', enabled: true, items: [{ id: 'f1', enabled: true, zh: '我__書。', answer: '買' }] }] };
  const d = C('hwAssignDoc')('w1', S3, 1);
  assert.strictEqual(J(d.vocab), J([{ zh: '醫生', es: 'médico', en: '' }, { zh: '健康', es: '', en: '' }]));
  const w = C('learnTotals')({ w1: d }, {}).words;
  assert.strictEqual(w.find(x => x.zh === '醫生').es, 'médico');
  assert.ok(!JSON.stringify(d).includes('"answer"'));
  assert.strictEqual(J(C('hwAssignDoc')('w2', { sections: [] }, 1).vocab), '[]');   // 沒有生詞表也不會壞
});

test('練習單的英文欄位：發給學生時一起存，沒有英文的舊練習單照舊', () => {
  const S4 = { meta: { title: 't', titleEn: 'T-en' }, vocab: [{ zh: '醫生', es: 'médico', en: 'doctor' }],
    sections: [
      { id: 's1', type: 'fill', enabled: true, items: [{ id: 'f1', enabled: true, zh: '我__書。', answer: '買', es: 'comprar', en: 'to buy' }] },
      { id: 's2', type: 'zh2es', enabled: true, items: [{ id: 'z1', enabled: true, zh: '你好', answer: 'hola', answerEn: 'hello', vocab: '你好 hola', vocabEn: '你好 hello' }] },
      { id: 's3', type: 'match', enabled: true, items: [{ id: 'm1', enabled: true, zh: '貓', es: 'gato', en: 'cat' }, { id: 'm2', enabled: true, zh: '狗', es: 'perro', en: 'dog' }] }] };
  const d = C('hwAssignDoc')('w9', S4, 1);
  assert.strictEqual(d.titleEn, 'T-en');
  assert.strictEqual(d.vocab[0].en, 'doctor');
  assert.strictEqual(d.sections[0].items[0].en, 'to buy');
  assert.strictEqual(d.sections[1].items[0].vocabEn, '你好 hello');
  assert.ok(!JSON.stringify(d).includes('"answerEn"'));
  assert.strictEqual(d.sections[2].rightsEn.length, 2);
  assert.strictEqual(C('hwKeyTextEn')('zh2es', S4.sections[1].items[0]), 'hello');
  const w = C('learnTotals')({ w9: d }, {}).words;
  assert.strictEqual(w.find(x => x.zh === '醫生').en, 'doctor');
  assert.strictEqual(w.find(x => x.zh === '你好').en, 'hello');
  const old = C('hwAssignDoc')('w8', { sections: [{ id: 's', type: 'fill', enabled: true, items: [{ id: 'a', enabled: true, zh: '__', answer: 'x', es: 'e' }] }] }, 1);
  assert.strictEqual(old.sections[0].items[0].en, undefined);
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

console.log('\n學習分頁');
test('三種語言的文字 key 一樣齊全', () => {
  const I = C('LEARN_I18N'), keys = Object.keys(I.tc).sort();
  ['es', 'sc'].forEach(l => assert.strictEqual(J(Object.keys(I[l]).sort()), J(keys), l));
  ['es', 'tc', 'sc'].forEach(l => assert.strictEqual(J(Object.keys(I[l].types).sort()), J(Object.keys(I.tc.types).sort())));
  assert.strictEqual(C('learnT')('es', 'logCount', { n: 3 }), '3 clases registradas');
});
test('簡體文字沒有大陸用語、沒有繁體字殘留', () => {
  const sc = JSON.stringify(C('LEARN_I18N').sc);
  assert.ok(!/紀錄|單字|複習|語法|能力這/.test(sc));
  assert.ok(sc.indexOf('纪录') >= 0 && sc.indexOf('单字') >= 0);
});
test('上課紀錄分組：月份新到舊、月內新到舊，壞資料略過', () => {
  const g = C('learnLogGroups')([{ d: '2026-10-03', p: '把' }, { d: '2026-11-02', p: '可以' }, { d: '2026-10-20', p: '比較句' }, { d: 'bad', p: 'x' }, { d: '2026-10-21', p: '  ' }, null]);
  assert.strictEqual(J(g.map(x => [x.ym, x.rows.map(r => r.p)])), J([['2026-11', ['可以']], ['2026-10', ['比較句', '把']]]));
  assert.strictEqual(C('learnLogGroups')(undefined).length, 0);
});
test('複習：只還不熟的、同一種子順序固定、不同種子會變', () => {
  const words = [{ zh: '一' }, { zh: '二' }, { zh: '三' }, { zh: '四' }, { zh: '五' }, { zh: '六' }, { zh: '' }, null];
  const D = C('learnDeck');
  assert.strictEqual(D(words, {}, false, 1).length, 6);
  assert.strictEqual(J(D(words, {}, false, 1)), J(D(words, {}, false, 1)));
  assert.notStrictEqual(J(D(words, {}, false, 1)), J(D(words, {}, false, 2)));
  assert.strictEqual(J(D(words, { '三': 1, '五': 1 }, true, 1).map(w => w.zh).sort()), J(['三', '五']));
  assert.strictEqual(D(words, {}, true, 1).length, 0);
});
test('能力：各題型答對率、走向；不顯示分數的作業不算；沒批改的不算', () => {
  const mk = (title, status, got, max, hide, ts) => ({ title, status, assignedAt: ts, result: status === 'graded' ? { got, max } : undefined,
    sections: [{ type: 'fill', items: [{ id: 'a' }, { id: 'b' }] }, { type: 'order', items: [{ id: 'c' }] }],
    review: status === 'graded' ? { hideScore: hide, gradedAt: ts, items: { a: { got: 1, max: 1 }, b: { got: 0, max: 1 }, c: { got: 1, max: 1 } } } : undefined });
  const r = C('learnAbility')({ x: mk('A', 'graded', 2, 3, false, 100), y: mk('B', 'graded', 3, 3, false, 200), z: mk('C', 'graded', 1, 3, true, 300), w: mk('D', 'submitted', 0, 0, false, 400) });
  assert.strictEqual(r.graded, 3);
  assert.strictEqual(J(r.byType), J({ fill: { got: 2, max: 4, pct: 50 }, order: { got: 2, max: 2, pct: 100 } }));
  assert.strictEqual(J(r.trend.map(t => [t.title, t.pct])), J([['A', 67], ['B', 100]]));
  assert.strictEqual(C('learnAbility')({}).graded, 0);
});
test('公布欄：輸入整理（空白、換行、長度上限）', () => {
  const B = C('boardClean');
  assert.strictEqual(B('  hola  \r\n\r\n\r\n\r\nmundo \n'), 'hola\n\nmundo');
  assert.strictEqual(B('   \n '), ''); assert.strictEqual(B(null), '');
  assert.strictEqual(B('a'.repeat(500)).length, 500); assert.strictEqual(B('a'.repeat(501)), null);
  assert.strictEqual(B('你'.repeat(500)).length, 500);
});
test('公布欄：排序（新的在前）、壞資料略過；私訊只收這位學生、舊的在前', () => {
  const S = C('boardSortDesc');
  assert.strictEqual(J(S([{ id: 'a', text: 'x', ts: 1 }, { id: 'b', text: 'y', ts: 3 }, { id: 'c', text: '', ts: 9 }, null, { id: 'd', text: 'z', ts: 3 }]).map(x => x.id)), J(['b', 'd', 'a']));
  const m = [{ id: '1', sid: 's1', from: 's', text: 'hi', ts: 5 }, { id: '2', sid: 's2', from: 's', text: 'no', ts: 6 }, { id: '3', sid: 's1', from: 't', text: 'yo', ts: 7 }, { id: '4', sid: 's1', from: 'x', text: 'bad', ts: 8 }];
  assert.strictEqual(J(C('dmThread')(m, 's1').map(x => x.id)), J(['1', '3']));
  assert.strictEqual(C('boardMaxTs')(m, x => x.from === 't'), 7); assert.strictEqual(C('boardMaxTs')([], null), 0);
});
test('私訊未讀：老師每位學生各自算（只算學生寫的、比老師看到的時間新的）', () => {
  const m = [{ sid: 's1', from: 's', ts: 10 }, { sid: 's1', from: 's', ts: 20 }, { sid: 's1', from: 't', ts: 30 }, { sid: 's2', from: 's', ts: 5 }];
  assert.strictEqual(J(C('dmUnreadBySid')(m, { s1: 10 })), J({ s1: 1, s2: 1 }));
  assert.strictEqual(J(C('dmUnreadBySid')(m, { s1: 20, s2: 5 })), '{}');
  assert.strictEqual(J(C('dmUnreadBySid')(null, null)), '{}');
});
test('紅點：第一次不亮（記下現在的）；之後特徵變了才亮；資料沒載入不判斷', () => {
  const N = C('newDots');
  let r = N({}, { log: '3|a', files: null });
  assert.strictEqual(J(r), J({ dot: { log: false, files: false }, seed: { log: '3|a' } }));
  r = N({ log: '3|a' }, { log: '3|a', files: '1|5' });
  assert.strictEqual(J(r.dot), J({ log: false, files: false })); assert.strictEqual(J(r.seed), J({ files: '1|5' }));
  r = N({ log: '3|a', files: '1|5' }, { log: '4|b', files: '1|5' });
  assert.strictEqual(J(r.dot), J({ log: true, files: false }));
});
test('學習分頁的紅點特徵：沒載入好的是 null；內容變了特徵就變', () => {
  const L = C('learnSigs'), tot = { words: [1, 2], points: [1] };
  const base = { studentDoc: { log: [{ d: '2026-11-10', p: '把' }], next: { n: '可以' } }, hwDocs: {}, hwLoaded: true, tot, listReady: true, files: [] };
  const a = L(base);
  assert.strictEqual(a.log, '1|2026-11-10|可以'); assert.strictEqual(a.review, '2/1'); assert.strictEqual(a.files, '0|0');
  assert.strictEqual(L(Object.assign({}, base, { files: null })).files, null);
  assert.strictEqual(L(Object.assign({}, base, { listReady: false })).review, null);
  assert.strictEqual(L(Object.assign({}, base, { hwLoaded: false })).ability, null);
  const b = L(Object.assign({}, base, { files: [{ t: 9 }], hwDocs: { w: { status: 'graded', review: { gradedAt: 7 } } } }));
  assert.strictEqual(b.files, '1|9'); assert.strictEqual(b.ability, '1|7');
});
test('公布欄文字：三種語言的項目一樣多、都有字', () => {
  const k = Object.keys(C('BOARD_I18N').tc).sort();
  ['es', 'sc'].forEach(l => assert.strictEqual(J(Object.keys(C('BOARD_I18N')[l]).sort()), J(k), l));
  k.forEach(x => ['es', 'tc', 'sc'].forEach(l => assert.ok(String(C('BOARD_I18N')[l][x]).length > 0, l + x)));
});
test('複習：新學的優先（同一批才打散）；西→中只出有西文意思的', () => {
  const D = C('learnDeck');
  const words = [{ zh: '舊1', t: 100, es: 'a' }, { zh: '舊2', t: 100, es: 'b' }, { zh: '新', t: 300, es: 'c' }, { zh: '中', t: 200 }];
  const d = D(words, {}, false, 1).map(w => w.zh);
  assert.strictEqual(d[0], '新'); assert.strictEqual(d[1], '中'); assert.strictEqual(J(d.slice(2).sort()), J(['舊1', '舊2']));
  assert.strictEqual(D(words, {}, false, 1, 'e2z').length, 3);
  assert.ok(!D(words, {}, false, 1, 'e2z').some(w => w.zh === '中'));
});
test('單字／語法總表：練習單自動匯入＋老師補充、改、隱藏；新的在前', () => {
  const hw = { a: { assignedAt: 100, grammar: '把＋可以', vocab: [{ zh: '做菜', es: 'cocinar' }] },
    b: { assignedAt: 200, sections: [{ items: [{ vocab: '放 poner · 桌子 mesa' }] }] } };
  const r = C('learnTotals')(hw, { words: [{ zh: '做菜', py: 'zuò cài' }, { zh: '電腦', py: 'diàn nǎo', es: 'computadora', t: 300 }, { zh: '放', py: 'fàng', es: 'colocar' }],
    hideW: ['桌子'], points: [{ n: '比較句', t: 50 }], hideP: ['可以'] });
  assert.strictEqual(J(r.words.map(w => w.zh)), J(['電腦', '放', '做菜']));
  const z = r.words.find(w => w.zh === '做菜'); assert.strictEqual(z.py, 'zuò cài'); assert.strictEqual(z.es, 'cocinar');   // 老師只補拼音，西文沿用練習單
  assert.strictEqual(r.words.find(w => w.zh === '放').es, 'colocar');                                                         // 老師改過的意思優先
  assert.strictEqual(J(r.points.map(p => p.n)), J(['把', '比較句']));
  assert.strictEqual(C('learnTotals')(null, null).words.length, 0);
  // 壞資料不會讓它出錯
  assert.strictEqual(C('learnTotals')({ x: null }, { words: [null, { zh: '' }, { zh: ' 好 ' }], points: [null, {}] }).words.length, 1);
});
test('「還不熟」標記：雲端格式（字串陣列）來回轉換、壞資料略過', () => {
  const d = C('learnMarksToDoc')({ '做菜': 1, '放': 1, '好': 0 }, 123);
  assert.strictEqual(J(d), J({ v: 1, nf: ['做菜', '放'], updatedAt: 123 }));
  assert.strictEqual(J(C('learnMarksFromDoc')({ nf: ['做菜', 5, '', null, '放'] })), J({ '做菜': 1, '放': 1 }));
  assert.strictEqual(J(C('learnMarksFromDoc')(null)), '{}');
});
test('教材：只收 Google Drive／Docs 的 https 連結，新的在上面', () => {
  const f = C('learnFiles')({ files: [{ n: 'a.pdf', u: 'https://drive.google.com/file/d/1/view', t: 1 }, { n: '', u: 'https://docs.google.com/x', t: 5 },
    { n: 'bad', u: 'http://drive.google.com/x', t: 9 }, { n: 'evil', u: 'javascript:alert(1)', t: 9 }, { n: 'o', u: 'https://evil.com/drive.google.com/', t: 9 }, null] });
  assert.strictEqual(J(f.map(x => [x.n, x.t])), J([['教材', 5], ['a.pdf', 1]]));
  assert.strictEqual(C('learnFiles')(null).length, 0);
});

console.log('\n單字量對照');
test('覆蓋率、連續達標 75%、單字太少不評估', () => {
  const data = { t: { 我: 1, 你: 1, 他: 1, 好: 1, 學: 2, 校: 2 }, h: { 我: 1 }, ts: [4, 2, 5, 5, 5, 5], hs: [1, 1, 1, 1, 1, 1, 1] };
  const ws = ['我', '你', '他', '學', '校', '沒有'].map(zh => ({ zh }));
  const few = C('learnLevels')(ws, data);
  assert.strictEqual(few.tocfl.enough, false);
  assert.strictEqual(few.tocfl.reached, 0);
  const many = C('learnLevels')(ws, data, 0.75, 3);
  assert.strictEqual(many.tocfl.matched, 5);
  assert.strictEqual(many.tocfl.levels[0].pct, 75);
  assert.strictEqual(many.tocfl.reached, 2);
  assert.strictEqual(many.tocfl.learning, 3);
  assert.strictEqual(many.cefr.levels[1].lv, 'A2');
  assert.strictEqual(C('learnLevels')(ws, null).tocfl, null);
});
test('老師設起點 B1：B1 以下算已會，單字少也能評估', () => {
  const data = { t: { 我: 1 }, h: { 我: 1 }, ts: [4, 2, 5, 5, 5, 5], hs: [1, 1, 1, 1, 1, 1, 1] };
  const r = C('learnLevels')([{ zh: '我' }], data, 0.75, 30, { cefr: 'B1' });
  assert.strictEqual(r.tocfl.enough, true);
  assert.strictEqual(r.tocfl.reached, 3);
  assert.strictEqual(r.tocfl.learning, 4);
  assert.strictEqual(r.tocfl.levels[2].pct, 100);
  assert.strictEqual(r.tocfl.levels[3].pct, 0);
  assert.strictEqual(r.hsk.reached, 3);
  assert.strictEqual(r.start, 'B1');
  assert.strictEqual(C('learnLevels')([{ zh: '我' }], data, 0.75, 30, { cefr: '' }).tocfl.enough, false);
});
test('語法點對照：標題一樣自動分冊，對不上的列出來，手動分過就記住', () => {
  const map = { books: { 1: 'A1–A2', 2: 'A2–B1', 3: 'B1' }, titles: { 把字句: 1, 比較句: 2, 得字補語: 3, 嗎: 1 } };
  const pts = ['把字句', '「比較句」', '怪文法', '得字補語'].map(n => ({ n }));
  const g = C('learnGrammar')(pts, map, {});
  assert.strictEqual(g.matched, 3);
  assert.strictEqual(g.unmatched.join(), '怪文法');
  assert.strictEqual(g.cefr, 'B1');   // 沒有任何一冊有 3 個，取最高的第 3 冊
  const g2 = C('learnGrammar')(pts, map, { 怪文法: 1 });
  assert.strictEqual(g2.unmatched.length, 0);
  assert.strictEqual(g2.matched, 4);
  assert.strictEqual(C('learnGrammar')(pts, map, { 怪文法: 0 }).unmatched.length, 0);
  assert.strictEqual(C('learnGrammar')(pts, null, {}).cefr, '');
});
test('真實對照表：載入後 我／你好 等基本字在第 1 級', () => {
  const c2 = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'levels-data.js'), 'utf8'), c2);
  const D = c2.window.LEVELS_DATA;
  assert.ok(D.t['你好'] === 1 || D.t['你'] === 1);
  assert.strictEqual(D.h['謝謝'], 1);
  assert.strictEqual(D.ts.length, 6);
  assert.strictEqual(D.hs.length, 7);
});

console.log('\n能力分級測驗');
{
  const c3 = vm.createContext({ window: {}, Math, Object, Array, String, JSON, document: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'placement-bank.js'), 'utf8'), c3);
  vm.runInContext(fs.readFileSync(path.join(root, 'placement.js'), 'utf8'), c3);
  const B = c3.window.PLACEMENT_BANK, P = n => c3[n];
  test('題庫：每個西文選項和閱讀題目都有英文，英文版選項不重複', () => {
    B.items.forEach(x => {
      if (x.q.e != null) assert.ok(x.q.n, x.id + ' q 缺英文');
      const ns = [];
      x.o.forEach(o => { if (o.e != null) { assert.ok(o.n, x.id + ' 選項缺英文'); ns.push(o.n); } });
      assert.strictEqual(new Set(ns).size, ns.length, x.id + ' 英文選項重複');
    });
    assert.strictEqual(P('plMean')({ e: 'agua', n: 'water' }), 'agua');
  });
  test('題庫：每級 10 單字＋10 語法＋2 篇短文各 2 題，每題 4 個選項', () => {
    for (let lv = 1; lv <= 6; lv++) {
      assert.strictEqual(B.items.filter(x => x.lv === lv && x.k === 'v').length, 10);
      assert.strictEqual(B.items.filter(x => x.lv === lv && x.k === 'g').length, 10);
      assert.strictEqual(B.items.filter(x => x.lv === lv && x.k === 'r').length, 4);
    }
    assert.ok(B.items.every(x => x.o.length === 4));
    assert.ok(B.items.filter(x => x.k !== 'r').every(x => x.o.every(o => o.e != null || (o.s && o.t && o.p)) ));
  });
  test('完整版 48 題、快速版 8＋12 題，第二階段不重複第一階段的題', () => {
    assert.strictEqual(P('plBuildFull')(B).length, 48);
    const s1 = P('plStage1')(B), s2 = P('plStage2')(B, 3, s1.map(x => x.id));
    assert.strictEqual(s1.length, 8);
    assert.strictEqual(s2.length, 12);
    assert.ok(s2.every(x => !s1.some(y => y.id === x.id)));
    assert.strictEqual(J(P('plStage2')(B, 1, []).map(x => x.lv).filter((v, i, a) => a.indexOf(v) === i)), J([1, 2, 3]));
    assert.strictEqual(J(P('plStage2')(B, 6, []).map(x => x.lv).filter((v, i, a) => a.indexOf(v) === i)), J([4, 5, 6]));
  });
  test('粗估：要連續低一級也答對才升級', () => {
    const E = P('plEstimate');
    assert.strictEqual(E([{ lv: 1, ok: true }, { lv: 2, ok: true }, { lv: 4, ok: true }]), 2);
    assert.strictEqual(E([{ lv: 1, ok: true }, { lv: 2, ok: true }, { lv: 3, ok: true }, { lv: 4, ok: true }]), 4);
    assert.strictEqual(E([{ lv: 1, ok: false }]), 1);
  });
  test('計分：正確率 60% 才算過、結果給範圍', () => {
    const S = P('plScore'), mk = (lv, c, n) => Array.from({ length: n }, (_, i) => ({ lv, ok: i < c }));
    const r = S([].concat(mk(1, 4, 4), mk(2, 4, 4), mk(3, 3, 4), mk(4, 1, 4), mk(5, 0, 4)));
    assert.strictEqual(r.reached, 3);
    assert.strictEqual(r.cefr, 'B1');
    const r2 = S([].concat(mk(1, 4, 4), mk(2, 3, 4), mk(3, 2, 4)));
    assert.strictEqual(r2.reached, 2);
    assert.strictEqual(r2.cefr, 'A2–B1');
    assert.strictEqual(r2.tocfl, '2–3');
    assert.strictEqual(S(mk(1, 0, 4)).cefr, '<A1');
    assert.strictEqual(S(mk(1, 0, 4)).reached, 0);
    assert.strictEqual(S([].concat(mk(3, 2, 2), mk(4, 2, 2), mk(5, 0, 2))).reached, 4);   // 沒考的更低級視為已過
  });
}

console.log('\n後台新增單字：中文 西文 ｜ 英文');
{
  const src = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const fn = src.slice(src.indexOf('function vocParse(txt){'), src.indexOf('// 給 AI 的提示詞'));
  const pr = src.match(/const VOC_PROMPT = `([\s\S]*?)`;/)[1];
  const vm2 = vm.createContext({ nudParseVocab: C('nudParseVocab') });
  vm.runInContext(fn + ';this.vocParse = vocParse;', vm2);
  test('「中文 西文 ｜ 英文」三欄都拆得出來', () => {
    assert.strictEqual(J(vm2.vocParse('冰 hielo ｜ ice')), J([{ zh: '冰', es: 'hielo', en: 'ice' }]));
    assert.strictEqual(J(vm2.vocParse('便利商店 tienda de conveniencia | convenience store')), J([{ zh: '便利商店', es: 'tienda de conveniencia', en: 'convenience store' }]));
    assert.strictEqual(J(vm2.vocParse('花時間 llevar tiempo, dedicar tiempo ｜ take time, spend time')), J([{ zh: '花時間', es: 'llevar tiempo, dedicar tiempo', en: 'take time, spend time' }]));
  });
  test('舊寫法照舊：只有中文、中文＋西文、頓號分開', () => {
    assert.strictEqual(J(vm2.vocParse('做菜\n電腦 computadora')), J([{ zh: '做菜', es: '' }, { zh: '電腦', es: 'computadora' }]));
    assert.strictEqual(J(vm2.vocParse('冰、房間')), J([{ zh: '冰', es: '' }, { zh: '房間', es: '' }]));
  });
  test('只有中文加英文（西文留空）也行；多個字一行不套英文', () => {
    assert.strictEqual(J(vm2.vocParse('冰 ｜ ice')), J([{ zh: '冰', es: '', en: 'ice' }]));
    assert.strictEqual(J(vm2.vocParse('冰、房間 ｜ ice')), J([{ zh: '冰', es: '' }, { zh: '房間', es: '' }]));
  });
  test('AI 提示詞：講清楚格式、有範例，而且範例本身能被解析', () => {
    assert.ok(pr.includes('中文 西班牙文 ｜ 英文') && pr.includes('只輸出結果'));
    const ex = pr.split('範例：')[1].split('以下是')[0];
    assert.strictEqual(vm2.vocParse(ex).length, 3);
    assert.ok(vm2.vocParse(ex).every(v => v.zh && v.es && v.en));
  });
}

console.log('\n作業的拼音／注音');
test('拼音轉注音：一聲不標、輕聲加點、ü／y／w／整體認讀音節', () => {
  const Z = C('symToZhuyin');
  assert.strictEqual(J(['zhōng', 'nǐ', 'ma', 'yuè', 'wǒ', 'shì', 'xué', 'ér'].map(Z)), J(['ㄓㄨㄥ', 'ㄋㄧˇ', '˙ㄇㄚ', 'ㄩㄝˋ', 'ㄨㄛˇ', 'ㄕˋ', 'ㄒㄩㄝˊ', 'ㄦˊ']));
});
test('發給學生的作業：練習單選了拼音／注音才帶 rb，沒選就沒有', () => {
  const st = o => ({ meta: { title: 'x' }, opts: o, sections: [{ id: 's1', type: 'fill', enabled: true, items: [{ id: 'a', enabled: true, zh: '我__學生', es: 'soy' }] }], vocab: [] });
  assert.strictEqual(C('hwAssignDoc')('w', st({ student: 'pinyin', cueEs: true }), 1).rb, 'pinyin');
  assert.strictEqual(C('hwAssignDoc')('w', st({ student: 'zhuyin' }), 1).rb, 'zhuyin');
  assert.strictEqual('rb' in C('hwAssignDoc')('w', st({ student: 'none' }), 1), false);
  assert.strictEqual('rb' in C('hwAssignDoc')('w', st({}), 1), false);
});

console.log('\n起始上課日期與上了多久');
test('四種語言都有「起始上課日期」「上了多久」文字', () => {
  ['tc', 'sc', 'es', 'en'].forEach(l => {
    assert.ok(C('pcT')(l, 'startedOn') !== 'startedOn', l + ' startedOn');
    assert.ok(C('pcT')(l, 'studyTime') !== 'studyTime', l + ' studyTime');
  });
});
test('上了多久：2026-02-13 到 2026-11-18 = 9 個月；不到一個月顯示天數', () => {
  assert.strictEqual(C('nudSpan')('2026-02-13', '2026-11-18', 'tc'), '9 個月');
  assert.strictEqual(C('nudSpan')('2026-11-01', '2026-11-18', 'tc'), '17 天');
  assert.strictEqual(C('nudSpan')('', '2026-11-18', 'tc'), '');
});

console.log('\n問卷調查');
test('基本模板：通過檢查、每題都有中西英、選項也有', () => {
  const t = C('svTemplate')();
  assert.strictEqual(C('svValidate')(t), '');
  assert.ok(t.questions.length >= 15);
  t.questions.forEach(q => {
    ['zh', 'es', 'en'].forEach(k => assert.ok(q[k], q.id + ' 缺 ' + k));
    (q.opts || []).forEach(o => ['zh', 'es', 'en'].forEach(k => assert.ok(o[k], q.id + '/' + o.id + ' 缺 ' + k)));
    assert.ok(q.t === 'text' || (q.opts && q.opts.length >= 2), q.id);
  });
  const ids = t.questions.map(q => q.id); assert.strictEqual(new Set(ids).size, ids.length);
});
test('發布：最後一題固定是「是否同意」，外語空白的欄位會去掉', () => {
  const sv = { title: 'x', questions: [{ id: 'q1', t: 'text', zh: '你好', es: ' ', en: 'Hi' }] };
  const qs = C('svPublishQs')(sv);
  assert.strictEqual(qs.length, 2); assert.strictEqual(qs[1].id, 'consent'); assert.strictEqual(qs[1].t, 'consent');
  assert.strictEqual('es' in qs[0], false); assert.strictEqual(qs[0].en, 'Hi');
  assert.strictEqual(sv.questions.length, 1);   // 沒動到原本的問卷
});
test('檢查：沒名字、沒題目、沒中文題目、選擇題少於 2 個選項都會擋', () => {
  const V = C('svValidate');
  assert.ok(V({ title: '', questions: [] }));
  assert.ok(V({ title: 'a', questions: [] }));
  assert.ok(V({ title: 'a', questions: [{ id: 'q1', t: 'text', zh: '' }] }));
  assert.ok(V({ title: 'a', questions: [{ id: 'q1', t: 'single', zh: 'x', opts: [{ id: 'o1', zh: 'a' }] }] }));
  assert.ok(V({ title: 'a', questions: [{ id: 'q1', t: 'single', zh: 'x', opts: [{ id: 'o1', zh: 'a' }, { id: 'o2', zh: '' }] }] }));
  assert.strictEqual(V({ title: 'a', questions: [{ id: 'q1', t: 'single', zh: 'x', opts: [{ id: 'o1', zh: 'a' }, { id: 'o2', zh: 'b' }] }] }), '');
});
test('新增空白題：選擇題預設有選項、量表預設五段', () => {
  assert.strictEqual(C('svBlankQ')('scale').opts.length, 5);
  assert.strictEqual(C('svBlankQ')('single').opts.length, 2);
  assert.strictEqual(C('svBlankQ')('text').opts, undefined);
  assert.strictEqual(C('svBlankQ')('???').t, 'text');
});
test('外語顯示：要的外語沒有就退到另一種', () => {
  const P = C('svPick');
  assert.strictEqual(J(P({ zh: '你', es: 'tú', en: 'you' }, 'en')), J({ zh: '你', fl: 'you' }));
  assert.strictEqual(J(P({ zh: '你', es: 'tú' }, 'en')), J({ zh: '你', fl: 'tú' }));
  assert.strictEqual(J(P({ zh: '你' }, 'es')), J({ zh: '你', fl: '' }));
});
test('答案整理：不存在的選項、別題的答案、超長文字都處理掉', () => {
  const qs = [{ id: 'a', t: 'text' }, { id: 'b', t: 'single', opts: [{ id: 'o1' }, { id: 'o2' }] }, { id: 'c', t: 'multi', opts: [{ id: 'o1' }, { id: 'o2' }] }];
  const out = C('svCleanAnswers')(qs, { a: '  hola \r\n', b: 'zzz', c: ['o1', 'o1', 'x', 'o2'], d: 'extra' });
  assert.strictEqual(J(out), J({ a: 'hola', c: ['o1', 'o2'] }));
  assert.strictEqual(C('svCleanAnswers')(qs, { a: 'x'.repeat(5000) }).a.length, 2000);
  assert.strictEqual(C('svUnansweredCount')(qs, { a: 'hi', b: 'o1' }), 1);
});
test('彙整：單選／複選人數、量表平均、開放題列出', () => {
  const qs = [{ id: 'a', t: 'text' }, { id: 'b', t: 'single', opts: [{ id: 'o1' }, { id: 'o2' }] }, { id: 'c', t: 'multi', opts: [{ id: 'o1' }, { id: 'o2' }] }, { id: 'd', t: 'scale', opts: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }] }];
  const es = [{ answers: { a: 'x', b: 'o1', c: ['o1', 'o2'], d: 'o1' } }, { answers: { b: 'o1', c: ['o2'], d: 'o3' } }, { answers: { a: 'y', b: 'o2' } }];
  const r = C('svTally')(qs, es);
  assert.strictEqual(r.a.n, 2); assert.strictEqual(r.a.texts.length, 2);
  assert.strictEqual(J(r.b.counts), J({ o1: 2, o2: 1 }));
  assert.strictEqual(J(r.c.counts), J({ o1: 1, o2: 2 }));
  assert.strictEqual(r.d.avg, 2); assert.strictEqual(r.d.n, 2);
});
test('匯出：標題列＋每份回覆一列，選項用中文、複選用頓號', () => {
  const qs = [{ id: 'a', t: 'text', zh: '好嗎' }, { id: 'c', t: 'multi', zh: '功能', opts: [{ id: 'o1', zh: '作業' }, { id: 'o2', zh: '單字' }] }];
  const rows = C('svExportRows')(qs, [{ when: '2026/11/18', who: 'Pedro', answers: { a: 'bien', c: ['o1', 'o2'] } }]);
  assert.strictEqual(J(rows[0]), J(['填寫時間', '學生／名字', '1. 好嗎', '2. 功能']));
  assert.strictEqual(J(rows[1]), J(['2026/11/18', 'Pedro', 'bien', '作業、單字']));
});
test('問卷文字：四種語言的 key 一樣齊全', () => {
  const I = C('SV_I18N'); Object.keys(I.es).forEach(k => { ['en', 'tc', 'sc'].forEach(l => assert.ok(I[l][k], l + ' 缺 ' + k)); });
  assert.strictEqual(C('svT')('es', 'svRequiredMsg', { n: 3 }), 'Falta contestar: 3');
});

test('預設模板：17 題，對得上原本的滿意度調查（含「還有什麼想對老師說的嗎」，英文照原文）', () => {
  const t = C('svTemplate')().questions;
  assert.strictEqual(t.length, 17);
  assert.ok(t[16].zh.indexOf('還有什麼想對老師說的嗎') === 0 && t[16].es.indexOf('¿Hay algo más que te gustaría decirle al profesor?') === 0 && t[16].en.indexOf('Is there anything else you would like to tell the teacher?') === 0);
  assert.ok(t[0].en.indexOf('Is there anything in particular that you found especially helpful?') > -1);
  assert.ok(t[5].en.indexOf('clearly and in an easy-to-understand way') > -1);
});

console.log('\n問卷：公開連結、合併回覆、匯出、翻譯');
test('公開版只含題目和 open，不含老師資料；連結帶老師代號和發布代號', () => {
  const round = { surveyId: 'x', title: 'T', qs: [{ id: 'q1' }], zh: 'tc', fl: 'es', sids: ['s1'], pub: true, createdAt: 5 };
  const d = C('svPublicDoc')(round);
  assert.strictEqual(J(Object.keys(d).sort()), J(['createdAt', 'fl', 'open', 'qs', 'title', 'zh']));
  assert.strictEqual(d.open, true);
  assert.strictEqual(C('svPublicUrl')('https://x.io/a/', 'UID1', 'r 1'), 'https://x.io/a/survey.html?t=UID1&r=r%201');
});
test('名字：去空白、合併空白、最多 60 字', () => {
  assert.strictEqual(C('svCleanName')('  Ana   María '), 'Ana María');
  assert.strictEqual(C('svCleanName')(null), '');
  assert.strictEqual(C('svCleanName')('a'.repeat(100)).length, 60);
});
test('合併回覆：學生日誌交出的＋公開連結的；公開的可對應到學生；只算這次發布的', () => {
  const round = { sids: ['s1', 's2'] };
  const docs = { s1: { r1: { status: 'submitted', answers: { q1: 'a' }, submittedAt: 10, assignedAt: 1 } }, s2: { r1: { status: 'todo', answers: {}, assignedAt: 2 }, r2: { status: 'submitted', answers: {} } } };
  const resps = [{ id: 'x1', rid: 'r1', name: 'Luis', answers: { q1: 'b' }, ts: 30 }, { id: 'x2', rid: 'r1', name: 'Ana', answers: {}, ts: 20, sid: 's2' }, { id: 'x3', rid: 'r9', name: 'Otro', answers: {}, ts: 1 }];
  const nameOf = sid => ({ s1: '王一', s2: '李二' }[sid] || sid);
  const e = C('svCollect')('r1', round, docs, resps, nameOf);
  assert.strictEqual(e.length, 4);
  assert.strictEqual(e[0].who, '王一'); assert.strictEqual(e[0].status, 'submitted'); assert.strictEqual(e[0].ts, 10);
  assert.strictEqual(e[1].status, 'todo');
  assert.strictEqual(e[2].name, 'Ana'); assert.strictEqual(e[2].who, '李二（公開連結：Ana）'); assert.strictEqual(e[2].sid, 's2');   // 時間較早的先
  assert.strictEqual(e[3].who, 'Luis（公開連結）'); assert.strictEqual(e[3].kind, 'public'); assert.strictEqual(e[3].sid, '');
  assert.ok(e.every(x => x.key));
});
test('合併回覆：沒有任何回覆也不會出錯', () => {
  assert.strictEqual(C('svCollect')('r1', undefined, {}, [], s => s).length, 0);
});
test('Excel：欄位字母 A、Z、AA；特殊符號和控制字元會處理；第一列粗體並凍結', () => {
  const c = C('svColName');
  assert.strictEqual(c(0), 'A'); assert.strictEqual(c(25), 'Z'); assert.strictEqual(c(26), 'AA'); assert.strictEqual(c(701), 'ZZ');
  const f = C('svXlsxFiles')([['時間', '名字'], ['a<b & "c"', 'x\u0001y\n換行']], '問卷/1:*?');
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml'].forEach(k => assert.ok(f[k], '缺 ' + k));
  const sh = f['xl/worksheets/sheet1.xml'];
  assert.ok(sh.indexOf('a&lt;b &amp; &quot;c&quot;') > -1);
  assert.ok(sh.indexOf('\u0001') < 0);
  assert.ok(sh.indexOf('r="B2"') > -1 && sh.indexOf('s="1"') > -1 && sh.indexOf('state="frozen"') > -1);
  assert.ok(f['xl/workbook.xml'].indexOf('name="問卷 1   "') < 0 && /sheet name="[^\[\]*?\/\\:]+"/.test(f['xl/workbook.xml']));
});
test('Excel：工作表名稱最多 31 字，空的用「問卷」', () => {
  assert.strictEqual(C('svSheetName')('a'.repeat(50)).length, 31);
  assert.strictEqual(C('svSheetName')(''), '問卷');
});
test('翻譯：中文不用翻；Google 翻譯連結帶來源語言、目標繁體、文字有編碼', () => {
  const L = C('svLooksChinese');
  assert.strictEqual(L('我覺得很好'), true); assert.strictEqual(L('Muy bien'), false); assert.strictEqual(L('Muy bien 好'), false); assert.strictEqual(L(''), false);
  const u = C('svGoogleTranslateUrl')('Hola, ¿qué tal?', 'es');
  assert.ok(u.indexOf('sl=es') > -1 && u.indexOf('tl=zh-TW') > -1 && u.indexOf(encodeURIComponent('Hola, ¿qué tal?')) > -1);
  assert.ok(C('svGoogleTranslateUrl')('x'.repeat(5000)).length < 1700);
});

console.log('\n' + (failed ? '有 ' + failed + ' 項沒通過（通過 ' + passed + ' 項）' : '全部通過（' + passed + ' 項）') + '\n');
process.exit(failed ? 1 : 0);
