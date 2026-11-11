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

console.log('\n' + (failed ? '有 ' + failed + ' 項沒通過（通過 ' + passed + ' 項）' : '全部通過（' + passed + ' 項）') + '\n');
process.exit(failed ? 1 : 0);
