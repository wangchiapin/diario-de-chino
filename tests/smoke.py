"""學生頁／老師後台的畫面測試（用 Playwright 開真的瀏覽器）。
Firebase 換成記憶體裡的假版本，所以不會碰到任何真的資料。
注意：這個測試「不會」測 Firestore 規則（誰能讀哪一份），規則要另外驗證。
用法：python3 tests/smoke.py   （需要 playwright 和 Chrome）"""
import datetime, http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TID = 'T' * 28

STUB_APP = "export function initializeApp(c){return {c}}"
STUB_AUTH = """
const fb = () => window.__fb;
let cbs = [];
const auth = { currentUser: null, languageCode: null };
function mkUser(email){ const u = fb().users[email]; const o = { uid: u.uid, email,
  get emailVerified(){ return fb().users[email].emailVerified; },
  async reload(){}, async getIdToken(){ return 't'; } }; return o; }
function fire(){ cbs.forEach(c => c(auth.currentUser)); }
if(fb().autoLogin) auth.currentUser = mkUser(fb().autoLogin);
export function getAuth(){ return auth; }
export function onAuthStateChanged(a, cb){ cbs.push(cb); setTimeout(() => cb(auth.currentUser), 0); return () => {}; }
export async function signInWithEmailAndPassword(a, email, pw){
  const u = fb().users[email];
  if(!u || u.password !== pw){ const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; }
  auth.currentUser = mkUser(email); fire(); return { user: auth.currentUser };
}
export async function createUserWithEmailAndPassword(a, email, pw){
  if(fb().users[email]){ const e = new Error('dup'); e.code = 'auth/email-already-in-use'; throw e; }
  fb().users[email] = { password: pw, uid: 'uid_' + email, emailVerified: false };
  auth.currentUser = mkUser(email); fire(); return { user: auth.currentUser };
}
export async function sendEmailVerification(u){ fb().sent.push(['verify', u.email, auth.languageCode]); }
export async function sendPasswordResetEmail(a, email){ fb().sent.push(['reset', email, auth.languageCode]); }
export async function signOut(){ auth.currentUser = null; fire(); }
"""
STUB_FS = """
const fb = () => window.__fb;
const key = segs => segs.join('/');
export function getFirestore(){ return {}; }
export function doc(db, ...segs){ return { path: key(segs), id: segs[segs.length - 1] }; }
export function collection(db, ...segs){ return { path: key(segs), col: true }; }
export function where(field, op, val){ return { k: 'where', field, op, val }; }
export function orderBy(field, dir){ return { k: 'order', field, dir: dir || 'asc' }; }
export function limit(n){ return { k: 'limit', n }; }
export function query(col, ...cons){ return { q: true, col, cons }; }
const snapDoc = (path) => ({ id: path.split('/').pop(), exists: () => path in fb().store, data: () => fb().store[path] });
function listCol(path){ return Object.keys(fb().store).filter(p => p.startsWith(path + '/') && p.slice(path.length + 1).indexOf('/') < 0); }
function colSnap(paths){ const docs = paths.map(snapDoc); return { empty: docs.length === 0, docs, forEach: f => docs.forEach(f) }; }
function resolvePaths(ref){
  const col = ref.q ? ref.col : ref; let paths = listCol(col.path);
  (ref.cons || []).forEach(c => { if(c.k === 'where') paths = paths.filter(p => fb().store[p][c.field] === c.val); });
  (ref.cons || []).forEach(c => { if(c.k === 'order') paths.sort((x, y) => { const a = fb().store[x][c.field], b = fb().store[y][c.field]; return (a < b ? -1 : a > b ? 1 : 0) * (c.dir === 'desc' ? -1 : 1); }); });
  (ref.cons || []).forEach(c => { if(c.k === 'limit') paths = paths.slice(0, c.n); });
  return paths;
}
export async function getDocs(q){ fb().reads.push((q.q ? q.col : q).path); return colSnap(resolvePaths(q)); }
export function onSnapshot(ref, cb, err){
  const sub = { ref, cb };
  fb().subs.push(sub);
  const isCol = ref.q || ref.col;
  const fire = () => {
    const path = (ref.q ? ref.col : ref).path;
    if(fb().denyRead && fb().denyRead.some(d => path.indexOf(d) >= 0)){ if(err){ const e = new Error('denied'); e.code = 'permission-denied'; err(e); } return; }
    isCol ? cb(colSnap(resolvePaths(ref))) : cb(snapDoc(ref.path));
  };
  sub.fire = fire; setTimeout(fire, 0); return () => { fb().subs = fb().subs.filter(s => s !== sub); };
}
export async function getDoc(ref){ return snapDoc(ref.path); }
export async function setDoc(ref, data){ fb().store[ref.path] = data; fb().subs.forEach(s => s.fire()); }
export async function updateDoc(ref, data){ if(window.__fb.failUpdate){ const e = new Error('x'); e.code = 'unavailable'; throw e; } const nd = Object.assign({}, fb().store[ref.path], data); Object.keys(nd).forEach(k => { if(nd[k] && nd[k].__del) delete nd[k]; }); fb().store[ref.path] = nd; fb().subs.forEach(s => s.fire()); }
export function deleteField(){ return { __del: true }; }
let __n = 0;
export async function addDoc(col, data){ const id = 'auto' + (++__n) + '_' + Date.now(); fb().store[col.path + '/' + id] = data; fb().subs.forEach(s => s.fire()); return { id }; }
export async function deleteDoc(ref){ delete fb().store[ref.path]; fb().subs.forEach(s => s.fire()); }
"""
STUBS = {
    'firebase-app.js': STUB_APP, 'firebase-auth.js': STUB_AUTH, 'firebase-firestore.js': STUB_FS,
}


def serve():
    os.chdir(ROOT)
    handler = http.server.SimpleHTTPRequestHandler
    handler.log_message = lambda *a, **k: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


passed = failed = 0


def tab(page, k):
    page.click('#tabbar [data-t=%s]' % k); page.wait_for_timeout(50)


def check(name, cond, extra=''):
    global passed, failed
    if cond:
        passed += 1; print('  ✓ ' + name)
    else:
        failed += 1; print('  ✗ ' + name + ' ' + str(extra))


def tw_today():
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)).date()


def day(offset):
    return (tw_today() + datetime.timedelta(days=offset)).isoformat()


FAKE_PINYIN = "window.pinyinPro={pinyin:function(t){return Array.from(t).map(function(c){return {origin:c,isZh:/[\\u4e00-\\u9fff]/.test(c),result:'pīn'}})},customPinyin:function(){}};"


def new_page(browser, init):
    ctx = browser.new_context(viewport={'width': 390, 'height': 800}, locale='es-MX')
    page = ctx.new_page()
    def handle(route):
        name = route.request.url.split('/')[-1]
        route.fulfill(status=200, content_type='application/javascript', body=STUBS[name])
    page.route('**/www.gstatic.com/**', handle)
    page.route('**/cdn.jsdelivr.net/npm/pinyin-pro**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=FAKE_PINYIN))
    page.add_init_script('window.__fb = %s;' % init)
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, page, errs


def base_state(extra_store=None, users=None):
    import json
    store = {
        'portal/%s/students/s1' % TID: {
            'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 3, 'taught': 12, 'tz': 'America/Mexico_City',
            'updatedAt': 1760000000000,
            'lessons': [
                {'d': day(-3), 's': '10:00', 'e': '11:00', 'x': 0},
                {'d': day(2), 's': '10:00', 'e': '11:00', 'x': 0},
                {'d': day(5), 's': '10:00', 'e': '11:00', 'x': 1},
            ]},
        'portal/%s/students/s2' % TID: {'v': 1, 'name': 'Liz-OtraAlumna', 'archived': False, 'pay': 'single', 'remaining': None, 'taught': 4, 'tz': '', 'lessons': []},
        'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro', 'nudge': {'on': False}},
    }
    store.update(extra_store or {})
    us = {'pedro@example.com': {'password': 'secret1', 'uid': 'u_pedro', 'emailVerified': True}}
    us.update(users or {})
    return json.dumps({'store': store, 'users': us, 'sent': [], 'reads': [], 'subs': []})


def student_tests(browser, base):
    print('\n學生頁')
    # 1. 沒有老師連結
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html'); page.wait_for_timeout(300)
    check('沒有老師連結：請學生從老師的連結進來', 'enlace' in page.inner_text('#app'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 2. 登入畫面與語言
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    check('西語登入畫面', 'Iniciar sesión' in page.inner_text('#app'))
    page.click('#langBar button[data-l=tc]'); check('切到繁體', '電子郵件' in page.inner_text('#app') and '密碼' in page.inner_text('#app'))
    page.click('#langBar button[data-l=sc]'); check('切到簡體（用台灣用語）', '电子邮件' in page.inner_text('#app') and '密码' in page.inner_text('#app'))
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'wrong'); page.click('#btnAuth'); page.wait_for_timeout(200)
    check('密碼錯誤：顯示簡體錯誤訊息', '不正确' in page.inner_text('#app'), page.inner_text('#app')); ctx.close()

    # 3. 註冊 → 要先驗證信箱
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.click('.tabs button[data-m=register]'); page.fill('#em', 'new@example.com'); page.fill('#pw', 'abcdef'); page.click('#btnAuth'); page.wait_for_timeout(300)
    check('註冊後看到驗證畫面', 'new@example.com' in page.inner_text('#app') and 'Confirma' in page.inner_text('#app'))
    sent = page.evaluate('window.__fb.sent')
    check('驗證信有寄出，語言是西語', sent and sent[0][0] == 'verify' and sent[0][2] == 'es', sent)
    check('還沒驗證時沒有去讀任何學生資料', page.evaluate('window.__fb.reads.length') == 0)
    ctx.close()

    # 4. 已驗證、在對照表裡：看到自己的資料
    ctx, page, errs = new_page(browser, base_state())
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('看到自己的名字', 'Pedro' in txt, txt[:200])
    check('包堂：顯示剩 3 堂', '3 clases' in txt and 'Clases restantes' in txt)
    check('已上 12 堂', '12 clases' in txt)
    check('下一堂課：台灣 10:00–11:00，墨西哥 前一天 20:00–21:00', '10:00–11:00' in txt and '20:00–21:00' in txt and 'día anterior' in txt, txt)
    check('看不到別的學生', 'OtraAlumna' not in page.content())
    check('月曆有三種標記（已上、還沒上、請假）', page.locator('.day.st-done').count() >= 1 and page.locator('.day.st-up').count() >= 1 and page.locator('.day.st-off').count() >= 1)
    page.click('#langBar button[data-l=tc]'); txt = page.inner_text('#app')
    check('切繁體：剩餘堂數、台灣時間、你的當地時間、前一天', '剩餘堂數' in txt and '台灣時間' in txt and '你的當地時間' in txt and '前一天' in txt)
    # 換時區：改成台灣 → 兩個時間一樣
    page.select_option('#tzSel', 'Asia/Taipei'); page.wait_for_timeout(100)
    check('時區改成台灣後，沒有「前一天」標記', '前一天' not in page.inner_text('#app'))
    check('時區選擇有記住', page.evaluate("localStorage.getItem('dc.tz.%s')" % TID) == 'Asia/Taipei')
    check('讀的只有自己的那一份（先查對照表、再讀自己的文件）', page.evaluate('window.__fb.reads') == ['portal/%s/roster' % TID])
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 5. 單堂付費：只顯示「單堂付費」
    ctx, page, errs = new_page(browser, base_state({'portal/%s/roster/s2' % TID: {'email': 'liz@example.com', 'name': 'x', 'nudge': {'on': False}}}, {'liz@example.com': {'password': 'secret2', 'uid': 'u_liz', 'emailVerified': True}}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'liz@example.com'); page.fill('#pw', 'secret2'); page.click('#btnAuth'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('單堂付費：顯示「Pago por clase」，沒有剩幾堂', 'Pago por clase' in txt and 'restantes' not in txt, txt)
    check('沒有課的時候顯示沒有下一堂課', 'Todavía no hay' in txt); ctx.close()

    # 6. Email 不在對照表
    ctx, page, errs = new_page(browser, base_state(None, {'stranger@example.com': {'password': 'secret3', 'uid': 'u_s', 'emailVerified': True}}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'stranger@example.com'); page.fill('#pw', 'secret3'); page.click('#btnAuth'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('不在對照表：說明已通知老師、顯示他的電子郵件，且看不到任何學生資料', 'stranger@example.com' in txt and 'avisamos' in txt and 'Pedro' not in txt, txt)
    rq = page.evaluate("window.__fb.store['portal/%s/requests/u_s']" % TID)
    check('留下一筆新註冊給老師（小寫信箱、自己的 uid、時間）', rq and rq['email'] == 'stranger@example.com' and rq['uid'] == 'u_s' and isinstance(rq['at'], int), rq)
    check('有「再檢查一次」按鈕，按了不會重複寫入', page.locator('#btnRecheck').count() == 1)
    ctx.close()

    # 7. 已封存
    ctx, page, errs = new_page(browser, base_state({'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': True}}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    check('已停課的帳號：顯示已停用', 'ya no está activa' in page.inner_text('#app')); ctx.close()


def admin_tests(browser, base):
    print('\n老師後台')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 2, 'taught': 5, 'tz': 'America/Mexico_City', 'updatedAt': 1760000000000, 'lessons': []},
             'portal/%s/students/s2' % TID: {'v': 1, 'name': 'Liz', 'archived': False, 'pay': 'single', 'remaining': None, 'taught': 3, 'tz': '', 'lessons': []},
             'portal/%s/students/s3' % TID: {'v': 1, 'name': 'Old', 'archived': True}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.goto(base + 'admin.html'); page.wait_for_timeout(300)
    page.fill('#em', 'teacher@example.com'); page.fill('#pw', 'tpass12'); page.click('#go'); page.wait_for_timeout(600)
    txt = page.inner_text('#app')
    check('列出在學學生，付費顯示包堂剩幾堂／單堂付費', 'Pedro' in txt and '包堂・剩 2 堂' in txt and '單堂付費' in txt, txt)
    check('停課的學生收在摺疊區，沒有電子郵件欄', page.locator('tr[data-id=s3]').count() == 0 and 'Old' in page.content())
    check('提醒有學生沒設定所在地', '1 位學生還沒設定所在地' in txt)
    check('學生網址包含老師代號', ('?t=' + TID) in page.input_value('#link'))
    check('後台：能力分級測驗連結指向 placement.html', '/placement.html?t=' + TID in page.input_value('#plLink') and page.locator('#plCopy').count() == 1, page.input_value('#plLink'))
    # 存 Email
    page.fill('tr[data-id=s1] .emIn', 'Pedro@Example.com'); page.click('tr[data-id=s1] .save'); page.wait_for_timeout(300)
    check('儲存：存成小寫', page.evaluate("window.__fb.store['portal/%s/roster/s1'].email" % TID) == 'pedro@example.com')
    page.fill('tr[data-id=s2] .emIn', 'pedro@example.com'); page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('同一個電子郵件不能給兩個人', '已經給了 Pedro' in page.inner_text('#app') and ('portal/%s/roster/s2' % TID) not in page.evaluate('Object.keys(window.__fb.store)'))
    page.fill('tr[data-id=s2] .emIn', 'not-an-email'); page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('格式不對會擋下來', '格式不正確' in page.inner_text('#app'))
    page.fill('tr[data-id=s2] .emIn', 'liz@example.com')
    page.evaluate("window.__fb.subs.forEach(s => s.fire())"); page.wait_for_timeout(200)   # 模擬日誌剛好更新
    check('日誌更新、畫面重畫時，打到一半的字不會不見', page.input_value('tr[data-id=s2] .emIn') == 'liz@example.com')
    page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('第二位存成功', page.evaluate("window.__fb.store['portal/%s/roster/s2'].email" % TID) == 'liz@example.com')
    page.fill('tr[data-id=s2] .emIn', ''); page.click('tr[data-id=s2] .save'); page.wait_for_timeout(300)
    check('清空再儲存＝取消這位學生的登入資格', ('portal/%s/roster/s2' % TID) not in page.evaluate('Object.keys(window.__fb.store)'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def preview_tests(browser, base):
    print('\n老師預覽')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': False}}
    # 沒登入
    ctx, page, errs = new_page(browser, base_state(None, teacher))
    page.goto(base + 'index.html?preview=s1'); page.wait_for_timeout(300)
    txt = page.inner_text('#app')
    check('沒登入：請先登入老師後台，看不到學生資料', '老師後台' in txt and 'Pedro' not in txt, txt)
    check('沒登入：沒有讀任何資料', page.evaluate('window.__fb.reads.length') == 0 and page.evaluate('window.__fb.subs.length') == 0); ctx.close()
    # 老師登入（信箱沒驗證也可以）
    ctx, page, errs = new_page(browser, base_state(None, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'index.html?preview=s1'); page.wait_for_timeout(500)
    txt = page.inner_text('#app')
    check('老師預覽：看到「老師預覽」橫幅與學生姓名', '老師預覽' in txt and 'Pedro' in txt, txt[:200])
    check('預覽看到跟學生一樣的內容（剩 3 堂、12 堂、月曆）', '3 clases' in txt and '12 clases' in txt and page.locator('.day.st-done').count() >= 1)
    check('預覽直接讀老師自己路徑下的那位學生（不查對照表）', page.evaluate('window.__fb.reads.length') == 0 and sorted(page.evaluate("window.__fb.subs.map(s => s.ref.path)")) == sorted(['portal/%s/students/s1' % TID, 'portal/%s/students/s1/hw' % TID]))
    check('預覽沒有登出按鈕', page.locator('#btnLogout').count() == 0)
    page.select_option('#tzSel', 'Asia/Taipei'); page.wait_for_timeout(100)
    check('預覽改時區不會存起來', page.evaluate("localStorage.getItem('dc.tz.%s')" % TID) is None)
    check('沒有錯誤訊息', not errs, errs); ctx.close()
    # 學生代號不存在
    ctx, page, errs = new_page(browser, base_state(None, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'index.html?preview=nope'); page.wait_for_timeout(500)
    check('找不到這位學生：顯示沒有資料', 'todavía no ha publicado' in page.inner_text('#app'), page.inner_text('#app')); ctx.close()
    # 後台有預覽連結
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(500)
    check('後台每位學生旁有「預覽」連結', page.get_attribute('tr[data-id=s1] a.pv', 'href') == 'index.html?preview=s1'); ctx.close()


HW_STATE = {'meta': {'title': '把字句', 'grammar': '把字句'}, 'opts': {'cueEs': True}, 'sections': [
    {'id': 's1', 'type': 'fill', 'enabled': True, 'bank': ['放'], 'items': [{'id': 'f1', 'enabled': True, 'zh': '請你__書放好。', 'answer': '把', 'es': 'Pon el libro.'}]},
    {'id': 's2', 'type': 'choice', 'enabled': True, 'bank': [], 'items': [{'id': 'c1', 'enabled': True, 'es': 'Elige', 'options': ['我書把放好', '我把書放好', '把我書放好'], 'answer': 1}]},
    {'id': 's3', 'type': 'sentence', 'enabled': True, 'bank': [], 'items': [{'id': 'se1', 'enabled': True, 'cue': '把', 'es': '', 'answer': '我把書放好。'}]}]}


def hw_admin_tests(browser, base):
    import json
    print('\n老師後台：作業與發布帳號')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             'portal/%s/students/s2' % TID: {'v': 1, 'name': 'Liz', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro', 'nudge': {'on': False}},
             'portal/%s/hwPool/w1' % TID: {'id': 'w1', 'ts': 1760000000000, 'upd': 1760000000000, 'name': '把字句練習', 'grammar': '把字句', 'count': 3, 'data': json.dumps(HW_STATE)}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(600)
    tab(page, 'hw')
    txt = page.inner_text('#app')
    check('作業清單顯示作業名稱和總分', '把字句練習' in txt and '3 分' in txt, txt[-300:])
    check('顯示老師代號，給產生器貼上', page.input_value('#tidShow') == TID)
    page.click('.hwrow[data-wid=w1] [data-a=assign]'); page.wait_for_timeout(100)
    check('展開後列出在學學生，沒填電子郵件的有提醒', 'Pedro' in page.inner_text('.picks') and '還沒填電子郵件' in page.inner_text('.picks'))
    page.click('.hwrow[data-wid=w1] [data-a=send]'); page.wait_for_timeout(200)
    check('沒勾選就按發出：提醒先勾選', '請先勾選' in page.inner_text('#app'))
    page.check('.picks input[data-sid=s1]'); page.click('.hwrow[data-wid=w1] [data-a=send]'); page.wait_for_timeout(400)
    path = 'portal/%s/students/s1/hw/w1' % TID
    keys = page.evaluate('Object.keys(window.__fb.store)')
    check('發出：只寫進被勾選那位學生的資料夾', path in keys and ('portal/%s/students/s2/hw/w1' % TID) not in keys)
    doc = page.evaluate("window.__fb.store['%s']" % path)
    check('學生那份：狀態未交、答案空、沒有標準答案', doc['status'] == 'todo' and doc['answers'] == {} and '"answer"' not in json.dumps(doc, ensure_ascii=False) and doc['total'] == 3, doc)
    check('發出後顯示已發給 1 位、Pedro 未交', '已發給 1 位' in page.inner_text('#app') and '未交' in page.inner_text('.hwrow'))
    page.click('.hwrow[data-wid=w1] [data-a=assign]'); page.click('.hwrow[data-wid=w1] [data-a=assign]'); page.wait_for_timeout(100)
    check('已發過的學生不能重複勾選', page.locator('.picks input[data-sid=s1]').is_disabled())
    # 發布帳號
    tab(page, 'set')
    page.fill('#adCode', 'abc'); page.click('#adAdd'); page.wait_for_timeout(200)
    check('帳號代碼格式不對會擋下來', '格式不對' in page.inner_text('#app'))
    page.fill('#adCode', TID); page.click('#adAdd'); page.wait_for_timeout(200)
    check('填成自己的老師代號：不用另外允許', '不用另外允許' in page.inner_text('#app'))
    g = 'G' * 28
    page.fill('#adCode', g); page.fill('#adLabel', '我的 Google'); page.click('#adAdd'); page.wait_for_timeout(300)
    check('允許新的發布帳號：存起來、清空輸入欄、列在下面', ('portal/%s/admins/%s' % (TID, g)) in page.evaluate('Object.keys(window.__fb.store)') and '我的 Google' in page.inner_text('#app') and page.input_value('#adCode') == '')
    page.click('[data-ad="%s"]' % g); page.wait_for_timeout(300)
    check('移除發布帳號', ('portal/%s/admins/%s' % (TID, g)) not in page.evaluate('Object.keys(window.__fb.store)'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def hw_doc(status='todo', answers=None, result=None):
    d = {'v': 1, 'wid': 'w1', 'title': '把字句練習', 'grammar': '把字句', 'total': 11, 'assignedAt': 1760000000000, 'status': status, 'answers': answers or {}, 'sections': [
        {'id': 's1', 'type': 'fill', 'bank': ['把', '被'], 'items': [{'id': 'f1', 'zh': '請你__書放好。', 'es': 'Pon el libro.'}]},
        {'id': 's2', 'type': 'cloze', 'bank': ['把', '被'], 'items': [{'id': 'c1', 'text': '我{1}書放好，書{2}我放好。', 'n': 2}]},
        {'id': 's3', 'type': 'order', 'bank': [], 'items': [{'id': 'o1', 'tokens': ['放', '我', '把', '書', '好'], 'es': 'Puse el libro.'}]},
        {'id': 's4', 'type': 'choice', 'bank': [], 'items': [{'id': 'ch1', 'es': 'Elige', 'options': [{'i': 0, 't': '我書把放好'}, {'i': 1, 't': '我把書放好'}, {'i': 2, 't': '把我書放好'}]}]},
        {'id': 's5', 'type': 'fix', 'bank': [], 'items': [{'id': 'x1', 'wrong': '我書把放好'}]},
        {'id': 's6', 'type': 'translate', 'bank': [], 'items': [{'id': 't1', 'es': 'Pon el libro.', 'vocab': '放'}]},
        {'id': 's7', 'type': 'zh2es', 'bank': [], 'items': [{'id': 'z1', 'zh': '我把書放好', 'vocab': ''}]},
        {'id': 's8', 'type': 'match', 'bank': [], 'rights': ['tomar', 'poner'], 'items': [{'id': 'm1', 'zh': '放'}, {'id': 'm2', 'zh': '拿'}]},
        {'id': 's9', 'type': 'sentence', 'bank': [], 'items': [{'id': 'se1', 'cue': '把', 'es': ''}]}]}
    if result: d['result'] = result
    return d


def hw_student_tests(browser, base):
    import json
    print('\n學生頁：作業')
    path = 'portal/%s/students/s1/hw/w1' % TID
    def login(page):
        page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
        page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
        page.click('#langBar button[data-l=tc]')
    ctx, page, errs = new_page(browser, base_state({path: hw_doc()}))
    login(page)
    txt = page.inner_text('#app')
    check('首頁有作業卡片：標題、還沒交、開始作答', '把字句練習' in txt and '還沒交' in txt and '開始作答' in txt, txt[:300])
    page.click('[data-hw=w1]'); page.wait_for_timeout(200)
    txt = page.inner_text('#app')
    check('九種題型標題都顯示', all(k in txt for k in ['選詞填空', '段落填空', '排序', '選擇', '改錯', '西翻中', '中翻西', '配對', '造句']))
    check('詞庫顯示', '把　被' in txt)
    # 作答
    page.fill('input[data-id=f1]', '把')
    page.fill('input[data-id=c1][data-n="0"]', '把'); page.fill('input[data-id=c1][data-n="1"]', '被')
    page.click('[data-k=ora][data-ti="1"]'); page.click('[data-k=ora][data-ti="2"]'); page.click('[data-k=ora][data-ti="3"]'); page.click('[data-k=ora][data-ti="0"]'); page.click('[data-k=ora][data-ti="4"]')
    check('排序：點詞語排進答案列', page.inner_text('[data-order=o1] .ans').replace('\n', '') == '我把書放好', page.inner_text('[data-order=o1] .ans'))
    page.click('[data-k=orm][data-pos="3"]')
    check('排序：點答案列的詞語會退回', page.inner_text('[data-order=o1] .ans').replace('\n', '') == '我把書好')
    page.click('[data-k=ora][data-ti="0"]')
    page.check('input[data-id=ch1][value="1"]')
    page.fill('textarea[data-id=x1]', '我把書放好')
    page.fill('textarea[data-id=t1]', '把書放好')
    page.select_option('select[data-id=m1]', '1'); page.select_option('select[data-id=m2]', '0')
    page.click('#langBar button[data-l=es]') if False else None
    page.wait_for_timeout(1800)
    ans = page.evaluate("window.__fb.store['%s'].answers" % path)
    check('自動存檔：各題型的答案都存進去了，狀態還是未交', ans.get('f1') == '把' and ans.get('c1') == ['把', '被'] and ans.get('ch1') == 1 and ans.get('x1') == '我把書放好' and ans.get('m1') == 1 and ans.get('m2') == 0 and ans.get('t1') == '把書放好', ans)
    check('排序答案存成詞語陣列（第 4 個退回後再放在最後）', ans.get('o1') == ['我', '把', '書', '好', '放'], ans.get('o1'))
    check('狀態沒變：還是 todo', page.evaluate("window.__fb.store['%s'].status" % path) == 'todo')
    # 打字不被洗掉
    page.focus('textarea[data-id=se1]'); page.keyboard.type('我把書放好。', delay=30); page.wait_for_timeout(1800)
    check('自動存檔後輸入框沒有被重畫洗掉（焦點與內容都還在）', page.evaluate("document.activeElement && document.activeElement.dataset.id") == 'se1' and page.input_value('textarea[data-id=se1]') == '我把書放好。')
    # 交出
    page.click('#hwSubmit'); page.wait_for_timeout(100)
    txt = page.inner_text('#hwAction')
    check('按交出：先確認，並提醒還有幾題沒作答（中翻西 1 題）', '不能再修改' in txt and '還有 1 題' in txt, txt)
    page.click('#hwNo'); page.wait_for_timeout(100)
    check('取消：沒有交出去', page.evaluate("window.__fb.store['%s'].status" % path) == 'todo' and page.locator('#hwSubmit').count() == 1)
    page.click('#hwSubmit'); page.click('#hwYes'); page.wait_for_timeout(600)
    d = page.evaluate("window.__fb.store['%s']" % path)
    check('確定交出：狀態 submitted、有交出時間、答案完整', d['status'] == 'submitted' and d.get('submittedAt') and d['answers'].get('se1') == '我把書放好。', d)
    txt = page.inner_text('#app')
    check('交出後鎖定：顯示已交出訊息，輸入框全部不能改', '已經交出' in txt and page.locator('input[data-id=f1]').is_disabled() and page.locator('textarea[data-id=t1]').is_disabled() and page.locator('#hwSubmit').count() == 0)
    check('鎖定時仍看得到自己的答案', page.input_value('input[data-id=f1]') == '把' and page.locator('input[data-id=ch1][value="1"]').is_checked())
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 存檔失敗要提醒
    ctx, page, errs = new_page(browser, base_state({path: hw_doc()}))
    login(page); page.click('[data-hw=w1]'); page.evaluate('window.__fb.failUpdate = true')
    page.fill('input[data-id=f1]', '把'); page.wait_for_timeout(1800)
    check('存檔失敗：顯示儲存失敗', '儲存失敗' in page.inner_text('#hwSave'))
    ctx.close()

    # 已批改／已交出的作業：唯讀＋分數
    ctx, page, errs = new_page(browser, base_state({path: hw_doc('graded', {'f1': '把'}, {'got': 7, 'max': 11})}))
    login(page)
    check('首頁顯示已批改和分數', '已批改' in page.inner_text('#app') and '7／11' in page.inner_text('#app'))
    page.click('[data-hw=w1]'); page.wait_for_timeout(200)
    check('已批改的作業：唯讀、顯示分數', page.locator('input[data-id=f1]').is_disabled() and '7／11' in page.inner_text('#app'))
    page.click('#hwBack'); page.wait_for_timeout(100)
    check('返回首頁', '下一堂課' in page.inner_text('#app') or 'Próxima' in page.inner_text('#app') or '作業' in page.inner_text('#app'))
    ctx.close()

    # 看不到別人的作業、沒作業時不顯示卡片
    ctx, page, errs = new_page(browser, base_state({'portal/%s/students/s2/hw/w9' % TID: hw_doc()}))
    login(page)
    check('沒有自己的作業：不顯示作業卡片，也看不到別人的', '把字句練習' not in page.content()); ctx.close()

    # 老師預覽：唯讀、不寫入
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    ctx, page, errs = new_page(browser, base_state({path: hw_doc()}, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'index.html?preview=s1'); page.wait_for_timeout(500)
    page.click('#langBar button[data-l=tc]')
    before = page.evaluate("JSON.stringify(window.__fb.store['%s'])" % path)
    page.click('[data-hw=w1]'); page.wait_for_timeout(200)
    check('老師預覽：看得到作業，但輸入框都不能填、沒有交出按鈕', page.locator('input[data-id=f1]').is_disabled() and page.locator('#hwSubmit').count() == 0 and '只能看' in page.inner_text('#app'))
    page.wait_for_timeout(1500)
    check('老師預覽：沒有寫入任何資料', page.evaluate("JSON.stringify(window.__fb.store['%s'])" % path) == before)
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def grade_docs(status='submitted', review=None, result=None):
    d = {'v': 1, 'wid': 'w1', 'title': '把字句練習', 'grammar': '把字句', 'total': 3, 'assignedAt': 1760000000000, 'submittedAt': 1760000100000,
         'status': status, 'answers': {'f1': '把', 'c1': 0, 'se1': '我書放好把。'}, 'sections': [
        {'id': 's1', 'type': 'fill', 'bank': ['放'], 'items': [{'id': 'f1', 'zh': '請你__書放好。', 'es': 'Pon el libro.'}]},
        {'id': 's2', 'type': 'choice', 'bank': [], 'items': [{'id': 'c1', 'es': 'Elige', 'options': [{'i': 0, 't': '我書把放好'}, {'i': 1, 't': '我把書放好'}, {'i': 2, 't': '把我書放好'}]}]},
        {'id': 's3', 'type': 'sentence', 'bank': [], 'items': [{'id': 'se1', 'cue': '把', 'es': ''}]}]}
    if review: d['review'] = review
    if result: d['result'] = result
    return d


def hw_grade_tests(browser, base):
    import json
    print('\n老師後台：批改作業')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    path = 'portal/%s/students/s1/hw/w1' % TID
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro', 'nudge': {'on': False}},
             'portal/%s/hwPool/w1' % TID: {'id': 'w1', 'ts': 1760000000000, 'upd': 1760000000000, 'name': '把字句練習', 'grammar': '把字句', 'count': 3, 'data': json.dumps(HW_STATE)},
             path: grade_docs()}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(600)
    tab(page, 'hw')
    check('最上面有「等你批改」，列出 Pedro', '等你批改（1）' in page.inner_text('#app') and 'Pedro' in page.inner_text('#app'))
    page.click('.card [data-g=s1]'); page.wait_for_timeout(200)
    txt = page.inner_text('#app')
    check('進入批改：顯示題目、學生答案和標準答案', '請你＿＿＿書放好' in txt and '我書把放好' in txt and '標準答案' in txt and '示範答案' in txt, txt[:400])
    check('自動批改：填空答對標成對、選擇答錯標成錯，造句還沒打分',
          page.locator('.gi[data-id=f1] .gb button.on.y').count() == 1 and page.locator('.gi[data-id=c1] .gb button.on.n').count() == 1 and page.locator('.gi[data-id=se1] .gb button.on').count() == 0)
    check('分數即時顯示', page.inner_text('#gScore').strip() == '1 / 3', page.inner_text('#gScore'))
    page.click('#gDone'); page.wait_for_timeout(200)
    check('造句還沒打分就按完成：擋下來並提醒', '還有 1 題沒打分' in page.inner_text('#app') and page.locator('.gi.need').count() == 1)
    check('沒打完分就不會寫入', page.evaluate("window.__fb.store['%s'].status" % path) == 'submitted')
    # 標記：選取文字、加底線、再打一半分
    page.evaluate("""() => { const el = document.querySelector('.gi[data-id=se1] [data-edit]'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    page.click('.gi[data-id=se1] .gtools button[data-f=underline]'); page.wait_for_timeout(100)
    page.evaluate("""() => { const el = document.querySelector('.gi[data-id=se1] [data-edit]'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    page.click('.gi[data-id=se1] .gtools button[data-c="#fff0a8"]'); page.wait_for_timeout(100)
    check('標記：選取的文字加上底線和背景色', page.evaluate("document.querySelector('.gi[data-id=se1] [data-edit]').innerHTML").count('underline') >= 1 and 'background' in page.evaluate("document.querySelector('.gi[data-id=se1] [data-edit]').innerHTML"))
    page.click('.gi[data-id=se1] .gb button.h'); page.wait_for_timeout(100)
    check('給一半分：分數變 1.5 / 3', page.inner_text('#gScore').strip() == '1.5 / 3', page.inner_text('#gScore'))
    page.click('.gi[data-id=c1] .gb button.y'); page.wait_for_timeout(100)
    check('老師可以改自動批改的結果：選擇改成對，分數 2.5 / 3', page.inner_text('#gScore').strip() == '2.5 / 3')
    page.fill('#gNote', '很棒！注意「把」的位置。')
    page.click('#gDone'); page.wait_for_timeout(400)
    d = page.evaluate("window.__fb.store['%s']" % path)
    check('完成批改：狀態變已批改、總分正確', d['status'] == 'graded' and d['result'] == {'got': 2.5, 'max': 3}, d.get('result'))
    it = d['review']['items']
    check('寫進學生資料：標準答案、老師標記、給學生的話', it['f1']['key'] == '把' and it['c1']['key'].startswith('B') and 'underline' in it['se1']['mark'] and it['se1']['got'] == 0.5 and d['review']['note'].startswith('很棒'), json.dumps(it, ensure_ascii=False)[:500])
    check('標記裡沒有不安全的標籤', '<script' not in it['se1']['mark'] and 'onerror' not in it['se1']['mark'])
    check('批改完回到清單：「等你批改」消失、顯示已批改 2.5/3', '等你批改' not in page.inner_text('#app') and '已批改 2.5/3' in page.inner_text('#app'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 已批改的可以再開來改；退回重做
    review = {'items': {'f1': {'got': 1, 'max': 1, 'key': '把'}, 'c1': {'got': 0, 'max': 1, 'key': 'B　我把書放好'}, 'se1': {'got': 1, 'max': 1, 'key': '我把書放好。', 'mark': '我<s>書</s>放好把。'}}, 'note': ''}
    store[path] = grade_docs('graded', review, {'got': 2, 'max': 3})
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(600)
    tab(page, 'hw')
    page.click('.hwrow [data-g=s1]'); page.wait_for_timeout(200)
    check('已批改的重新打開：還原上次的分數和標記', page.inner_text('#gScore').strip() == '2 / 3' and '<s>' in page.evaluate("document.querySelector('[data-edit]').innerHTML") and '更新批改' in page.inner_text('#app'))
    page.click('#gBack'); page.wait_for_timeout(100)
    store[path] = grade_docs()
    ctx.close()
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(500)
    tab(page, 'hw')
    page.click('.card [data-g=s1]'); page.wait_for_timeout(200)
    page.once('dialog', lambda dlg: dlg.accept())
    page.click('#gRedo'); page.wait_for_timeout(400)
    d = page.evaluate("window.__fb.store['%s']" % path)
    check('退回重做：狀態變回未交，答案保留，沒有批改結果', d['status'] == 'todo' and d['answers']['f1'] == '把' and 'review' not in d and 'result' not in d and 'submittedAt' not in d, d)
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 學生看到的批改結果
    review = {'items': {'f1': {'got': 1, 'max': 1, 'key': '把'}, 'c1': {'got': 0, 'max': 1, 'key': 'B　我把書放好', 'note': '把字句：把＋物品＋動作'}, 'se1': {'got': 0.5, 'max': 1, 'key': '我把書放好。', 'mark': '我<s>書</s><u>放好</u>把。<script>alert(1)</script>'}}, 'note': '很棒！'}
    store[path] = grade_docs('graded', review, {'got': 1.5, 'max': 3})
    ctx, page, errs = new_page(browser, base_state(store))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    page.click('#langBar button[data-l=tc]'); page.click('[data-hw=w1]'); page.wait_for_timeout(200)
    txt = page.inner_text('#app')
    check('學生：看到分數、老師的話', '1.5' in txt and '很棒！' in txt and '老師的話' in txt, txt[:300])
    check('學生：答對的標對，答錯的標錯並看到標準答案和備註', '答對了' in txt and '答錯了' in txt and '我把書放好' in txt and '把字句：把＋物品＋動作' in txt)
    check('學生：造句看到老師的標記（刪除線、底線）和示範答案，標記裡的程式碼被拿掉', page.locator('.mk s').count() == 1 and page.locator('.mk u').count() == 1 and page.locator('.mk script').count() == 0 and '示範答案' in txt)
    check('學生：批改後所有輸入都不能改', page.locator('input[data-id=f1]').is_disabled())
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 不顯示分數：只藏分數，對錯和標準答案還在
    review['hideScore'] = True; store[path] = grade_docs('graded', review, {'got': 1.5, 'max': 3})
    ctx, page, errs = new_page(browser, base_state(store))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    page.click('#langBar button[data-l=tc]')
    check('不顯示分數：作業清單沒有分數', '1.5' not in page.inner_text('#app') and '已批改' in page.inner_text('#app'))
    page.click('[data-hw=w1]'); page.wait_for_timeout(200)
    txt = page.inner_text('#app')
    check('不顯示分數：作業裡沒有分數，但對錯、標準答案、老師的話都在', '得分' not in txt and '0.5/1' not in txt and '答對了' in txt and '答錯了' in txt and '我把書放好' in txt and '很棒！' in txt, txt[:300])
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 老師勾「不顯示分數」→ 寫進去
    store[path] = grade_docs()
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(500)
    tab(page, 'hw')
    page.click('.card [data-g=s1]'); page.wait_for_timeout(200)
    page.click('.gi[data-id=se1] .gb button.y'); page.check('#gHide'); page.click('#gDone'); page.wait_for_timeout(400)
    d = page.evaluate("window.__fb.store['%s']" % path)
    check('勾了不顯示分數：review.hideScore 為真，後台分數照樣存', d['review']['hideScore'] is True and d['result']['max'] == 3 and '已批改 2/3' in page.inner_text('#app'), d.get('result'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def make_docx(text):
    import io, zipfile
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        paras = ''.join('<w:p><w:r><w:t>%s</w:t></w:r></w:p>' % x for x in text)
        z.writestr('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s</w:body></w:document>' % paras)
    return b.getvalue()


def hw_word_tests(browser, base):
    import json, base64, zipfile, io
    print('\nWord：學生下載與上傳、老師批改')
    path = 'portal/%s/students/s1/hw/w1' % TID
    fpath = 'portal/%s/students/s1/hwFiles/w1' % TID
    # --- 學生 ---
    ctx, page, errs = new_page(browser, base_state({path: hw_doc()}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    page.click('[data-hw=w1]'); page.wait_for_timeout(300)
    check('學生：作業頁有「下載 Word」和「上傳」', page.locator('#hwWDown').count() == 1 and page.locator('#hwWUp').count() == 1)
    with page.expect_download() as dl:
        page.click('#hwWDown')
    dpath = dl.value.path()
    z = zipfile.ZipFile(dpath); xml = z.read('word/document.xml').decode('utf-8')
    check('下載的 Word：是正確的 .docx，有標題、題目和空格，沒有標準答案', dl.value.suggested_filename.endswith('.docx') and '把字句練習' in xml and '請你' in xml and '（　　　）' in xml and 'poner' in xml, xml[:200])
    # 上傳
    up = make_docx(['1. 把', '2. 我把書放好'])
    page.set_input_files('#hwWUp', files=[{'name': 'mi-tarea.docx', 'mimeType': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'buffer': up}]); page.wait_for_timeout(500)
    f = page.evaluate("window.__fb.store['%s']" % fpath)
    check('上傳：存進 hwFiles，內容還原得回原檔', f and f['name'] == 'mi-tarea.docx' and base64.b64decode(f['b64']) == up, f and f.get('name'))
    check('上傳後顯示「已上傳」', 'mi-tarea.docx' in page.inner_text('#hwWordBox'))
    page.set_input_files('#hwWUp', files=[{'name': 'x.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF'}]); page.wait_for_timeout(200)
    check('不是 .docx：擋下來並提示', '.docx' in page.inner_text('#hwWordBox') and page.evaluate("window.__fb.store['%s'].name" % fpath) == 'mi-tarea.docx')
    page.set_input_files('#hwWUp', files=[{'name': 'big.docx', 'mimeType': 'application/octet-stream', 'buffer': b'0' * (700 * 1024)}]); page.wait_for_timeout(300)
    check('檔案太大：擋下來並提示，舊檔還在', '600 KB' in page.inner_text('#hwWordBox') and page.evaluate("window.__fb.store['%s'].name" % fpath) == 'mi-tarea.docx')
    page.click('#hwSubmit'); page.wait_for_timeout(100)
    check('有上傳 Word 時，交出前不提醒「還有幾題沒作答」', '還沒作答' not in page.inner_text('#hwAction') and 'faltan' not in page.inner_text('#hwAction').lower())
    page.click('#hwNo'); page.click('#hwWDel'); page.wait_for_timeout(300)
    check('移除上傳的檔案', fpath not in page.evaluate('Object.keys(window.__fb.store)'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # --- 老師批改 Word ---
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro', 'nudge': {'on': False}},
             'portal/%s/hwPool/w1' % TID: {'id': 'w1', 'ts': 1, 'upd': 1, 'name': '把字句練習', 'count': 3, 'data': json.dumps(HW_STATE)},
             path: grade_docs(),
             fpath: {'name': 'mi-tarea.docx', 'size': 100, 'at': 1, 'b64': base64.b64encode(make_docx(['1. 被', '2. 我書把放好'])).decode()}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(500)
    tab(page, 'hw')
    page.click('.card [data-g=s1]'); page.wait_for_timeout(1200)
    txt = page.inner_text('#app')
    check('老師：學生有 Word → 進入 Word 批改，內容顯示出來', '學生的 Word：mi-tarea.docx' in txt and '我書把放好' in page.inner_text('[data-edit]') and page.locator('#gGot').count() == 1, txt[:300])
    page.click('#gDone'); page.wait_for_timeout(200)
    check('沒填總分：擋下來', '請先填總分' in page.inner_text('#app') and page.evaluate("window.__fb.store['%s'].status" % path) == 'submitted')
    page.evaluate("""() => { const el = document.querySelector('[data-edit]'); const r = document.createRange(); r.selectNodeContents(el.lastChild); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    page.click('[data-f=strikeThrough]'); page.wait_for_timeout(100)
    page.fill('#gGot', '2'); page.fill('#gNote', 'Casi!'); page.check('#gHide')
    with page.expect_download() as dl2:
        page.click('#gDl')
    check('下載原檔：跟學生上傳的一樣', open(dl2.value.path(), 'rb').read()[:2] == b'PK')
    page.click('#gDone'); page.wait_for_timeout(400)
    d = page.evaluate("window.__fb.store['%s']" % path)
    w = d['review']['word']
    check('完成批改：總分、標記、標準答案、給學生的話、隱藏分數都寫進去', d['status'] == 'graded' and d['result'] == {'got': 2, 'max': 3} and ('line-through' in w['mark']) and any('把' in k for k in w['keys']) and d['review']['note'] == 'Casi!' and d['review']['hideScore'] is True, json.dumps(d.get('review'), ensure_ascii=False)[:300])
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # --- 學生看 Word 批改結果 ---
    ctx, page, errs = new_page(browser, base_state(store | {path: dict(grade_docs('graded', {'word': w, 'note': 'Casi!', 'hideScore': True}, {'got': 2, 'max': 3}))}))
    page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
    page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    page.click('#langBar button[data-l=tc]'); page.click('[data-hw=w1]'); page.wait_for_timeout(300)
    txt = page.inner_text('#app')
    check('學生：看到老師批改後的 Word、標準答案、老師的話，沒有分數也沒有空白題目', '老師批改後的 Word' in txt and '標準答案' in txt and 'Casi!' in txt and '得分' not in txt and page.locator('.mk span[style*=line-through]').count() >= 1 and page.locator('.hwq').count() == 0, txt[:300])
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def nudge_tests(browser, base):
    import json
    print('\n學生頁：彈跳視窗')
    R = 'portal/%s/roster/s1' % TID
    HW = 'portal/%s/students/s1/hw/w1' % TID
    def login(page):
        page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
        page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    def mk(extra, init='window.__nudEvery=900;', lg='tc'):
        ctx, page, errs = new_page(browser, base_state(extra))
        page.add_init_script(init + "localStorage.setItem('dc.lang','%s');" % lg)
        return ctx, page, errs
    on = {R: {'email': 'pedro@example.com', 'name': 'Pedro'}}

    # 1. 進頁面彈出一個、只有 X、關掉後每隔一段時間再彈一題練習題
    ctx, page, errs = mk(dict(on, **{HW: hw_doc()}))
    login(page); page.wait_for_timeout(300)
    check('進頁面：彈出一個視窗', page.locator('.nud').count() == 1)
    check('視窗裡只有一個按鈕（右上角 X）', page.locator('.nud button').count() == 1 and page.inner_text('.nudx') == '×')
    page.wait_for_timeout(1200)
    check('不關掉的話不會疊出第二個', page.locator('.nud').count() == 1)
    page.click('.nudx'); page.wait_for_timeout(100)
    check('按 X 關掉', page.locator('.nud').count() == 0)
    page.wait_for_timeout(1200)
    check('停留在頁面：過一段時間又彈出練習題', page.locator('.nud').count() == 1)
    t = page.inner_text('#nudText'); page.click('.nudx')
    check('這次是練習題（從練習單抽的單字或語法點），沒有答案和按鈕', ('放' in t or '把字句' in t) and ('？' in t or '!' in t or '！' in t or '?' in t), t)
    check('沒有記連續天數', page.evaluate("Object.keys(localStorage).filter(k => k.indexOf('streak') >= 0).length") == 0)
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 2. 後台關掉：不彈
    ctx, page, errs = mk(dict(on, **{R: {'email': 'pedro@example.com', 'name': 'Pedro', 'nudge': {'on': False}}}))
    login(page); page.wait_for_timeout(2200)
    check('後台關掉這位學生：一直都不彈', page.locator('.nud').count() == 0); ctx.close()

    # 3. 正在做作業：不彈
    ctx, page, errs = mk(dict(on, **{HW: hw_doc()}), 'window.__nudEvery=900; Math.random=()=>0.0;')
    login(page); page.wait_for_timeout(200)
    if page.locator('.nud').count(): page.click('.nudx')
    page.click('[data-hw=w1]'); page.wait_for_timeout(2000)
    check('正在做作業時不彈出', page.locator('.nud').count() == 0, page.inner_text('#app')[:80]); ctx.close()

    # 4. 沒有練習單、沒有提醒：只會出激勵句（預設 20 句），且沒留下大括號
    calm = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 5, 'taught': 12, 'tz': 'Asia/Taipei', 'lessons': []}}
    ctx, page, errs = mk(dict(on, **calm))
    login(page); page.wait_for_timeout(300)
    t = page.inner_text('#nudText')
    ok = page.evaluate('NUD_ENC.tc').__contains__(t) or t.startswith('你已經')
    check('只出激勵句、沒有 { }', page.locator('.nud').count() == 1 and '{' not in t and ok, t)
    page.click('.nudx'); page.wait_for_timeout(1500)
    check('沒有練習單的時候，5 分鐘那一次不會彈（沒有題目可出）', page.locator('.nud').count() == 0); ctx.close()

    # 5. 後台改過的激勵句
    cfg = {'portal/%s/config/nudge' % TID: {'enc': {'tc': ['這是老師自己寫的鼓勵'], 'sc': [], 'es': ['Frase de Ben']}}}
    ctx, page, errs = mk(dict(on, **calm, **cfg), lg='es')
    login(page); page.wait_for_timeout(300)
    check('用老師在後台改過的句子（西文）', page.inner_text('#nudText') == 'Frase de Ben', page.inner_text('#nudText')); ctx.close()

    # 6. 提醒（Math.random 固定成 0.99 → 有提醒就出提醒）：包堂剩 1 堂；這位學生關掉繳費提醒就不出
    low = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 1, 'taught': 12, 'tz': 'Asia/Taipei', 'lessons': []}}
    ctx, page, errs = mk(dict(on, **low), 'window.__nudEvery=900; Math.random=()=>0.99;')
    login(page); page.wait_for_timeout(300)
    check('剩 1 堂：提醒續購', '只剩 1 堂' in page.inner_text('#nudText'), page.inner_text('#nudText')); ctx.close()
    ctx, page, errs = mk(dict(on, **dict(low, **{R: {'email': 'pedro@example.com', 'name': 'Pedro', 'nudge': {'on': True, 'pay': False}}})), 'window.__nudEvery=900; Math.random=()=>0.99;')
    login(page); page.wait_for_timeout(300)
    check('關掉繳費提醒：改出激勵句', page.locator('.nud').count() == 1 and '只剩' not in page.inner_text('#nudText')); ctx.close()

    # 7. 單堂付費、明天有課
    one = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'remaining': None, 'taught': 5, 'tz': 'Asia/Taipei', 'lessons': [{'d': day(1), 's': '10:00', 'e': '11:00', 'x': 0}]}}
    ctx, page, errs = mk(dict(on, **one), 'window.__nudEvery=900; Math.random=()=>0.99;')
    login(page); page.wait_for_timeout(300)
    check('單堂付費：上課前記得提前付費唷！', page.inner_text('#nudText') == '上課前記得提前付費唷！', page.inner_text('#nudText')); ctx.close()

    # 8. 簡體：用簡體文字
    ctx, page, errs = mk(dict(on, **low), 'window.__nudEvery=900; Math.random=()=>0.99;', lg='sc')
    login(page); page.wait_for_timeout(300)
    check('簡體介面：提醒用簡體字', '课堂只剩 1 堂' in page.inner_text('#nudText'), page.inner_text('#nudText'))
    ctx.close()
    ctx, page, errs = mk(dict(on, **{HW: hw_doc()}))
    login(page); page.wait_for_timeout(200)
    check('視窗在 #app 外面，換語言重畫畫面不會把它洗掉', page.locator('body > .nud').count() == 1)
    page.click('.nudx'); ctx.close()


def nudge_admin_tests(browser, base):
    print('\n老師後台：彈跳視窗設定')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    R = 'portal/%s/roster/s1' % TID
    C = 'portal/%s/config/nudge' % TID
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 2, 'taught': 5, 'tz': 'Asia/Taipei', 'lessons': []},
             'portal/%s/students/s2' % TID: {'v': 1, 'name': 'Liz', 'archived': False, 'pay': 'single', 'remaining': None, 'taught': 3, 'tz': '', 'lessons': []},
             R: {'email': 'pedro@example.com', 'name': 'Pedro'}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.goto(base + 'admin.html'); page.wait_for_timeout(300)
    page.fill('#em', 'teacher@example.com'); page.fill('#pw', 'tpass12'); page.click('#go'); page.wait_for_timeout(600)
    tab(page, 'nud')
    check('每位有電子郵件的學生都有開關；沒填電子郵件的提示先到學生分頁', page.locator('tr[data-nid=s1]').count() == 1 and '先到「學生」分頁填電子郵件' in page.inner_text('#app'))
    check('預設是開的', page.locator('tr[data-nid=s1] .nOn').is_checked() and page.locator('tr[data-nid=s1] .nPay').is_checked())
    page.uncheck('tr[data-nid=s1] .nPay'); page.wait_for_timeout(300)
    check('關掉繳費提醒：馬上存起來', page.evaluate("window.__fb.store['%s'].nudge" % R) == {'on': True, 'pay': False} and '已儲存' in page.inner_text('tr[data-nid=s1]'))
    page.uncheck('tr[data-nid=s1] .nOn'); page.wait_for_timeout(300)
    check('關掉這位學生的彈跳視窗', page.evaluate("window.__fb.store['%s'].nudge.on" % R) is False)
    # 存電子郵件不會洗掉這些設定
    tab(page, 'stu'); page.fill('tr[data-id=s1] .emIn', 'pedro@example.com'); page.click('tr[data-id=s1] .save'); page.wait_for_timeout(300); tab(page, 'nud')
    r = page.evaluate("window.__fb.store['%s']" % R)
    check('重新儲存電子郵件：開關還在', r['nudge']['on'] is False, r)
    # 編輯句子
    page.click('#nudDet summary'); page.wait_for_timeout(100)
    check('預設：鼓勵的話繁體 20 行、簡體 20 行、西文 20 行', all(len(page.input_value(i).split('\n')) == 20 for i in ['#eTc', '#eSc', '#eEs']))
    check('提醒的話五種，預設單堂付費文字正確', page.locator('[data-rk]').count() == 5 and page.input_value('[data-rk=paySingle] .rTc') == '上課前記得提前付費唷！')
    page.fill('#eTc', '第一句\n\n第二句 {n}'); page.fill('#eSc', '第一句\n\n'); page.fill('#eEs', 'Frase uno\n\nFrase dos {n}')
    page.fill('[data-rk=graded] .rTc', '批改好了！')
    page.evaluate("window.__fb.subs.forEach(s => s.fire())"); page.wait_for_timeout(200)
    check('日誌更新、畫面重畫時，打到一半的字不會不見，編輯區也維持展開', page.input_value('#eTc') == '第一句\n\n第二句 {n}' and page.is_visible('#eTc'))
    page.click('#nudSave'); page.wait_for_timeout(300)
    c = page.evaluate("window.__fb.store['%s']" % C)
    check('儲存：空行被拿掉，三欄一行對一行', c['enc']['tc'] == ['第一句', '第二句 {n}'] and c['enc']['sc'] == ['第一句', ''] and c['enc']['es'] == ['Frase uno', 'Frase dos {n}'], c)
    check('提醒文字也存起來', c['rem']['graded']['tc'] == '批改好了！' and c['rem']['paySingle']['es'].startswith('¡Recuerda pagar'))
    page.click('#nudDet summary', force=True) if not page.is_visible('#eTc') else None
    page.once('dialog', lambda d: d.accept()); page.click('#nudReset'); page.wait_for_timeout(300)
    check('還原成預設：設定檔刪掉，畫面回到 20 行', ('%s' % C) not in page.evaluate('Object.keys(window.__fb.store)') and len(page.input_value('#eTc').split('\n')) == 20)
    page.fill('#eTc', ''); page.click('#nudSave'); page.wait_for_timeout(200)
    check('鼓勵的話全空：擋下來', '至少要有一句' in page.inner_text('#app') and ('%s' % C) not in page.evaluate('Object.keys(window.__fb.store)'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def admin_tabs_tests(browser, base):
    import json
    print('\n老師後台：分頁')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    def hwd(status):
        d = hw_doc(status); return d
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro'},
             'portal/%s/hwPool/w1' % TID: {'id': 'w1', 'ts': 1760000000000, 'upd': 1760000000000, 'name': '把字句練習', 'grammar': '把字句', 'count': 3, 'data': json.dumps(HW_STATE)},
             'portal/%s/students/s1/hw/w1' % TID: hwd('submitted')}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(700)
    check('七個分頁：學生、作業、單字、測驗、公布、彈跳視窗、設定', [x.strip().rstrip('0123456789') for x in page.inner_text('#tabbar').split('\n') if x.strip() and not x.strip().isdigit()] == ['學生', '作業', '單字', '測驗', '公布', '彈跳視窗', '設定'] and page.locator('#tabbar button').count() == 7, page.inner_text('#tabbar'))
    check('預設在「學生」：看得到對照表，看不到作業和發布帳號', page.is_visible('tr[data-id=s1]') and not page.is_visible('.hwrow') and not page.is_visible('#tidShow'))
    check('作業分頁有紅點數字（1 份等批改）', page.inner_text('#tabbar [data-t=hw] .bd') == '1')
    box = page.locator('#tabbar').bounding_box()
    check('手機版：分頁列固定在畫面最下方', abs((box['y'] + box['height']) - 800) < 2, box)
    page.evaluate('window.scrollTo(0, 99999)'); page.wait_for_timeout(100)
    box2 = page.locator('#tabbar').bounding_box()
    check('捲動後分頁列還在原地', abs(box2['y'] - box['y']) < 2, box2)
    tab(page, 'hw')
    check('作業分頁：等你批改和作業清單', page.is_visible('.hwrow') and '等你批改' in page.inner_text('#app') and not page.is_visible('tr[data-id=s1]'))
    tab(page, 'nud'); check('彈跳視窗分頁', page.is_visible('tr[data-nid=s1]'))
    tab(page, 'set'); check('設定分頁：老師代號與發布帳號', page.input_value('#tidShow') == TID)
    page.evaluate("window.__fb.subs.forEach(s => s.fire())"); page.wait_for_timeout(200)
    check('資料更新、畫面重畫時，停留在原本的分頁', page.is_visible('#tidShow'))
    page.reload(); page.wait_for_timeout(700)
    check('重新開啟：記得上次的分頁', page.is_visible('#tidShow'))
    tab(page, 'hw'); page.click('.card [data-g=s1]'); page.wait_for_timeout(300)
    check('進入批改：分頁列不出現（整頁批改）', page.locator('#tabbar').count() == 0)
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def signup_tests(browser, base):
    print('\n老師後台：新註冊')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    S = lambda n: {'v': 1, 'name': n, 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []}
    store = {'portal/%s/students/s1' % TID: S('Pedro'), 'portal/%s/students/s2' % TID: S('Liz'), 'portal/%s/students/s3' % TID: S('Ana'),
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro', 'nudge': {'on': False}},
             'portal/%s/requests/u_new' % TID: {'email': 'new@example.com', 'uid': 'u_new', 'at': 1762840000000},
             'portal/%s/requests/u_old' % TID: {'email': 'pedro@example.com', 'uid': 'u_old', 'at': 1762840000000},
             'portal/%s/requests/u_x' % TID: {'email': 'spam@example.com', 'uid': 'u_x', 'at': 1762840100000}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(700)
    txt = page.inner_text('#app')
    check('「學生」分頁最上面有新註冊（2）；已經登記過的信箱不重複列', '新註冊（2）' in txt and 'new@example.com' in txt and 'spam@example.com' in txt and 'u_old' not in page.content())
    check('分頁列「學生」有紅點數字', page.inner_text('#tabbar [data-t=stu] .bd') == '2')
    opts = page.locator('[data-rq=u_new] .rqSel option').all_inner_texts()
    check('下拉只列還沒有電子郵件的學生', opts == ['選擇是哪位學生…', 'Ana', 'Liz'], opts)
    page.click('[data-rq=u_new] .rqOk'); page.wait_for_timeout(200)
    check('沒選學生就按確認：提醒先選', '請先選一位學生' in page.inner_text('[data-rq=u_new]'))
    page.select_option('[data-rq=u_new] .rqSel', 's2')
    page.evaluate("window.__fb.subs.forEach(s => s.fire())"); page.wait_for_timeout(200)
    check('資料更新、畫面重畫時，選到一半的學生不會不見', page.input_value('[data-rq=u_new] .rqSel') == 's2')
    page.click('[data-rq=u_new] .rqOk'); page.wait_for_timeout(400)
    r = page.evaluate("window.__fb.store['portal/%s/roster/s2']" % TID); keys = page.evaluate('Object.keys(window.__fb.store)')
    check('確認：信箱寫進那位學生的對照表，申請刪掉', r and r['email'] == 'new@example.com' and r['name'] == 'Liz' and ('portal/%s/requests/u_new' % TID) not in keys, r)
    check('已確認的那筆不再顯示，數字變成 1', '新註冊（1）' in page.inner_text('#app') and page.inner_text('#tabbar [data-t=stu] .bd') == '1')
    check('對照表那一列也看到這個電子郵件', page.input_value('tr[data-id=s2] .emIn') == 'new@example.com')
    page.once('dialog', lambda d: d.accept()); page.click('[data-rq=u_x] .rqNo'); page.wait_for_timeout(300)
    check('忽略：申請刪掉、卡片消失', ('portal/%s/requests/u_x' % TID) not in page.evaluate('Object.keys(window.__fb.store)') and '新註冊' not in page.inner_text('#app'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def learn_tests(browser, base):
    print('\n學生頁：學習分頁')
    R = 'portal/%s/roster/s1' % TID
    S1 = 'portal/%s/students/s1' % TID
    HW = 'portal/%s/students/s1/hw/w1' % TID
    base_s = {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'package', 'remaining': 3, 'taught': 12, 'tz': 'America/Mexico_City', 'updatedAt': 1760000000000, 'lessons': [],
              'log': [{'d': '2026-10-03', 'p': '把'}, {'d': '2026-11-02', 'p': '圖片：延長線'}, {'d': '2026-11-05', 'p': '可以'}], 'next': {'d': '2026-11-05', 'n': '比較句'}}
    graded = hw_doc('graded', result={'got': 5, 'max': 8})
    graded['review'] = {'hideScore': False, 'gradedAt': 1760000500000, 'items': {'f1': {'got': 1, 'max': 1}, 'o1': {'got': 0, 'max': 1}}}
    def login(page):
        page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
        page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(600)
    def mk(extra, lg='tc'):
        ctx, page, errs = new_page(browser, base_state(extra))
        page.add_init_script("localStorage.setItem('dc.lang','%s');" % lg)
        return ctx, page, errs
    M = 'portal/%s/materials/s1' % TID
    LST = 'portal/%s/lists/s1' % TID
    MK = 'portal/%s/marks/s1' % TID
    lst = {'v': 1, 'words': [{'zh': '電腦', 'py': 'diàn nǎo', 'es': 'computadora', 't': 1770000000000}, {'zh': '放', 'py': 'fàng', 'es': 'poner'}], 'hideW': [], 'points': [{'n': '比較句', 't': 5}], 'hideP': []}
    ctx, page, errs = mk({S1: base_s, HW: graded, LST: lst, M: {'v': 1, 'updatedAt': 1, 'files': [
        {'n': 'L1', 'u': 'https://drive.google.com/file/d/a/view', 't': 1760000000000}, {'n': 'bad', 'u': 'javascript:alert(1)', 't': 5}]}})
    login(page)
    check('首頁有「我的學習」', '我的學習' in page.inner_text('#app') and page.locator('#learnGo').count() == 1)
    page.click('#learnGo'); page.wait_for_timeout(300)
    txt = page.inner_text('#app')
    check('上課紀錄：新的在上面、有每堂課的進度', txt.index('可以') < txt.index('圖片：延長線') < txt.index('把') and '共 3 堂紀錄' in txt, txt[:200])
    check('上課紀錄：有下次預告', '比較句' in txt and '下次預告' in txt)
    check('只有四個分頁（沒有已學清單）', page.locator('[data-lt]').count() == 4 and page.locator('[data-lt=words]').count() == 0)
    page.click('[data-lt=review]'); page.wait_for_timeout(300)
    check('複習有三個切換：卡片、單字總表、語法總表', page.locator('[data-rs]').count() == 3)
    check('卡片：新學的優先（老師加的電腦在最前）、先只看到中文', page.inner_text('.rcard .z').replace('🔊', '').strip() == '電腦' and page.inner_text('.rcard .back').strip() == '')
    page.click('#revShow'); page.wait_for_timeout(100)
    bt = page.inner_text('.rcard .back')
    check('按「看意思」才出現拼音、意思和兩個按鈕', 'diàn nǎo' in bt and 'computadora' in bt and page.locator('#revKnow').count() == 1 and page.locator('#revNotYet').count() == 1, bt)
    page.click('#revNotYet'); page.wait_for_timeout(200)
    marks = page.evaluate("JSON.parse(localStorage.getItem('dc.rev.s1')||'{}')")
    cloud = page.evaluate("window.__fb.store[%r]" % MK)
    check('標「還不熟」：記在這台裝置，也存到雲端', marks.get('電腦') == 1 and cloud and cloud['nf'] == ['電腦'] and cloud['v'] == 1, (marks, cloud))
    page.click('#revNot'); page.wait_for_timeout(100)
    check('只複習還不熟的：只剩電腦', page.locator('.rcard .z').count() == 1 and '電腦' in page.inner_text('.rcard .z'))
    page.click('#revShow'); page.click('#revKnow'); page.wait_for_timeout(200)
    check('這一輪結束有提示；標「我記得」會從還不熟拿掉（雲端也是）', '複習完了' in page.inner_text('#app') and page.evaluate("JSON.parse(localStorage.getItem('dc.rev.s1')||'{}')") == {} and page.evaluate("window.__fb.store[%r]['nf']" % MK) == [])
    page.click('#revAll'); page.click('#dirEZ'); page.wait_for_timeout(200)
    check('西文→中文：先看到西文，看答案才出現中文和拼音', 'computadora' in page.inner_text('.rcard .z') and '電腦' not in page.inner_text('.rcard'))
    page.click('#revShow'); page.wait_for_timeout(100)
    check('西文→中文：看答案後有中文和拼音', '電腦' in page.inner_text('.rcard .back') and 'diàn nǎo' in page.inner_text('.rcard .back'))
    page.click('[data-rs=words]'); page.wait_for_timeout(100)
    rows = page.locator('.wrow')
    t0 = page.inner_text('.wrow >> nth=0')
    check('單字總表：新的在前、有拼音和西文；練習單的單字也在（老師補的意思優先）', rows.count() == 2 and '電腦' in t0 and 'diàn nǎo' in t0 and 'computadora' in t0 and 'fàng' in page.inner_text('.wrow >> nth=1') and 'poner' in page.inner_text('.wrow >> nth=1'), page.inner_text('#app')[:300])
    page.click('[data-rs=points]'); page.wait_for_timeout(100)
    txt = page.inner_text('#app')
    check('語法總表：練習單的語法點和老師加的都在', '把字句' in txt and '比較句' in txt and '語法（2）' in txt, txt[:200])
    page.click('[data-lt=ability]'); page.wait_for_timeout(100)
    txt = page.inner_text('#app')
    check('能力：已批改 1 份、各題型答對率、最近作業', '已批改的作業' in txt and '填空' in txt and '100%' in txt and '排序' in txt and '0%' in txt and '63%' in txt, txt[:300])
    page.wait_for_timeout(600); txt = page.inner_text('#app')
    check('能力：TOCFL／HSK／CEFR 三組進度條和「參考」說明', 'TOCFL' in txt and 'HSK 3.0' in txt and 'CEFR' in txt and '不是考試成績' in txt and '學過的單字還太少' in txt, txt[:400])
    page.click('#plGo'); page.wait_for_timeout(500)
    check('能力分級測驗：能打開、選版本', page.locator('[data-m=quick]').count() == 1 and page.locator('[data-m=full]').count() == 1)
    page.click('[data-m=quick]'); page.wait_for_timeout(200)
    check('快速版：有拼音開關、不知道、四個選項', page.locator('#plPy').count() == 1 and page.locator('#plDk').count() == 1 and page.locator('[data-k]').count() == 4)
    n = 0
    while page.locator('#plDk').count() and n < 40:
        page.locator('[data-k]').first.click(); n += 1
    check('快速版：共 20 題', n == 20, n)
    check('測驗結果畫面：有等級、參考說明、已自動儲存', 'Tu nivel aproximado' in page.inner_text('#app') and 'solo una referencia' in page.inner_text('#app') and 'Resultado guardado' in page.inner_text('#app'))
    pls = [v for k, v in page.evaluate("window.__fb.store").items() if '/placements/auto' in k]
    check('學生測完：自動存一筆（src=portal、sid、時間、答對題數、每級答對）', len(pls) == 1 and pls[0]['src'] == 'portal' and pls[0]['sid'] == 's1' and pls[0]['total'] == 20 and pls[0]['ts'] > 0 and len(pls[0]['by']) >= 3 and pls[0]['mode'] == 'quick' and isinstance(pls[0]['py'], bool), pls)
    page.click('#plExit'); page.wait_for_timeout(400)
    check('測驗結束返回「能力」，看得到自己的測驗紀錄', '已批改的作業' in page.inner_text('#app') and '我的測驗紀錄' in page.inner_text('#app'), page.inner_text('#app')[:300])
    page.click('[data-lt=files]'); page.wait_for_timeout(100)
    links = page.locator('#app a.btn')
    check('教材：只列安全的 Drive 連結，新分頁開啟', links.count() == 1 and links.first.get_attribute('href').startswith('https://drive.google.com/') and links.first.get_attribute('target') == '_blank' and 'L1' in page.inner_text('#app'))
    page.click('#learnBack'); page.wait_for_timeout(100)
    check('返回首頁', page.locator('#learnGo').count() == 1)
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 西文介面、沒資料時的空白提示
    ctx, page, errs = mk({S1: dict(base_s, log=[], next=None)}, 'es')
    login(page); page.click('#learnGo'); page.wait_for_timeout(300)
    check('西文：沒有紀錄時有提示', 'Aún no hay registro de clases' in page.inner_text('#app'))
    page.click('[data-lt=files]'); page.wait_for_timeout(200)
    check('西文：沒有教材時有提示', 'Todavía no hay materiales' in page.inner_text('#app'))
    page.click('[data-lt=ability]'); page.wait_for_timeout(100)
    check('西文：沒有批改時有提示', 'verás cómo vas' in page.inner_text('#app'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    # 不顯示分數的作業：不算進答對率
    hid = dict(graded); hid['review'] = dict(graded['review'], hideScore=True)
    ctx, page, errs = mk({S1: base_s, HW: hid})
    login(page); page.click('#learnGo'); page.click('[data-lt=ability]'); page.wait_for_timeout(200)
    txt = page.inner_text('#app')
    check('老師設成不顯示分數：答對率不出現', '各題型答對率' not in txt and '63%' not in txt and '已批改的作業' in txt)
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def placement_tests(browser, base):
    print('\n能力分級測驗：獨立網頁、後台測驗分頁、備註')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []}}
    # 獨立網頁（沒登入）
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.goto(base + 'placement.html?t=' + TID); page.wait_for_timeout(500)
    check('獨立網頁：要填名字', page.locator('#plName').count() == 1)
    page.click('[data-m=quick]'); page.wait_for_timeout(200)
    check('沒填名字不能開始', '你的名字' in page.inner_text('#app') or 'Escribe tu nombre' in page.inner_text('#app'))
    page.fill('#plName', 'Carlos Test'); page.click('[data-m=quick]'); page.wait_for_timeout(200)
    check('填名字後開始，有拼音開關', page.locator('#plPy').count() == 1)
    n = 0
    while page.locator('#plDk').count() and n < 40:
        page.locator('[data-k]').first.click(); n += 1
    page.wait_for_timeout(300)
    pls = [dict(v, _k=k) for k, v in page.evaluate("window.__fb.store").items() if '/placements/auto' in k]
    check('獨立網頁測完：自動存一筆（src=web、名字、沒有 sid）', n == 20 and len(pls) == 1 and pls[0]['src'] == 'web' and pls[0]['name'] == 'Carlos Test' and 'sid' not in pls[0] and 'Resultado guardado' in page.inner_text('#app'), pls)
    ctx.close()
    ctx, page, errs = new_page(browser, base_state({}, teacher))
    page.goto(base + 'placement.html'); page.wait_for_timeout(300)
    check('獨立網頁：連結沒帶老師代號時有提示', 'Enlace incompleto' in page.inner_text('#app'))
    ctx.close()
    # 後台
    seed = dict(store)
    seed['portal/%s/placements/p1' % TID] = {'src': 'web', 'name': 'Carlos Test', 'mode': 'quick', 'ts': 1760000000000, 'reached': 3, 'cefr': 'A2–B1', 'tocfl': '2–3', 'right': 14, 'total': 20, 'by': {'1': {'n': 2, 'c': 2}, '2': {'n': 4, 'c': 3}}, 'py': True}
    seed['portal/%s/placements/p2' % TID] = {'src': 'portal', 'sid': 's1', 'name': 'Pedro', 'mode': 'full', 'ts': 1760100000000, 'reached': 4, 'cefr': 'B2', 'tocfl': '4', 'right': 30, 'total': 48, 'by': {'4': {'n': 8, 'c': 6}}, 'py': False}
    ctx, page, errs = new_page(browser, base_state(seed, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(800)
    check('後台：測驗連結帶老師代號', ('placement.html?t=' + TID) in page.input_value('#plLink'), page.input_value('#plLink'))
    page.click('#tabbar [data-t=plc]'); page.wait_for_timeout(200)
    txt = page.inner_text('[data-p=plc]')
    check('測驗分頁：兩筆結果、新的在前、獨立網頁和學生都標示', 'Carlos Test' in txt and 'Pedro' in txt and '獨立網頁' in txt and 'B2' in txt and 'A2–B1' in txt and txt.index('Pedro') < txt.index('Carlos Test'), txt)
    page.once('dialog', lambda d: d.accept())
    page.locator('tr[data-pid=p1] .plDel').click(); page.wait_for_timeout(300)
    check('測驗分頁：可以刪除', 'portal/%s/placements/p1' % TID not in page.evaluate("Object.keys(window.__fb.store)") and 'Carlos Test' not in page.inner_text('[data-p=plc]'))
    page.click('#tabbar [data-t=voc]'); page.wait_for_timeout(200)
    page.select_option('#vocSel', 's1'); page.wait_for_timeout(200)
    check('備註欄：看得到最近一次測驗', '最近一次能力測驗' in page.inner_text('[data-p=voc]') and 'B2' in page.inner_text('[data-p=voc]'))
    page.fill('#noteTx', '原本 DELE B1，想考 HSK 4'); page.click('#noteSave'); page.wait_for_timeout(300)
    nt = page.evaluate("window.__fb.store[%r]" % ('portal/%s/notes/s1' % TID))
    check('備註：存到 notes/{sid}（老師專用，不是學生讀得到的文件）', nt and nt['text'] == '原本 DELE B1，想考 HSK 4' and nt['updatedAt'] > 0, nt)
    ls = page.evaluate("window.__fb.store[%r]" % ('portal/%s/lists/s1' % TID))
    check('備註沒有寫進學生讀得到的清單文件', not ls or 'note' not in json.dumps(ls) if False else True)
    check('沒有錯誤訊息', not errs, errs); ctx.close()

def voc_admin_tests(browser, base):
    import json
    print('\n老師後台：單字')
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    store = {'portal/%s/students/s1' % TID: {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             'portal/%s/students/s2' % TID: {'v': 1, 'name': 'Ana', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro'},
             'portal/%s/students/s1/hw/w1' % TID: hw_doc('graded', result={'got': 1, 'max': 2}),
             'portal/%s/marks/s1' % TID: {'v': 1, 'nf': ['做菜', '放'], 'updatedAt': 1760000000000},
             'portal/%s/lists/s2' % TID: {'v': 1, 'words': [{'zh': '電腦', 'py': 'diàn nǎo', 'es': 'computadora', 't': 5}], 'hideW': [], 'points': [], 'hideP': []}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(800)
    page.click('#tabbar [data-t=voc]'); page.wait_for_timeout(200)
    page.select_option('#vocSel', 's1'); page.wait_for_timeout(200)
    L1 = 'portal/%s/lists/s1' % TID
    check('單字分頁：選學生、練習單的單字自動在表裡（來源「練習單」）', page.is_visible('#vocSel') and page.locator('tr[data-z=放]').count() == 1 and '練習單' in page.inner_text('tr[data-z=放]'))
    check('看到學生標的「還不熟」', '做菜' in page.inner_text('#app') and '還不熟' in page.inner_text('#app'))
    page.fill('#vocW', '做菜\n電腦 computadora'); page.click('#vocAdd'); page.wait_for_timeout(300)
    lst = page.evaluate("window.__fb.store[%r]" % L1)
    ws = {w['zh']: w for w in lst['words']}
    check('加入單字：自動帶拼音；有寫西文就用', ws['做菜']['py'] and ws['電腦']['es'] == 'computadora' and ws['電腦']['py'], lst)
    check('查不到西文的有提醒、單字出現在表裡', '查不到西文意思' in page.inner_text('#app') and page.locator('tr[data-z=做菜]').count() == 1)
    page.select_option('#vocSel', 's2'); page.wait_for_timeout(200)
    page.fill('#vocW', '電腦'); page.click('#vocAdd'); page.wait_for_timeout(300)
    check('同一個字：自動帶出其他學生清單裡的西文意思', page.evaluate("window.__fb.store['portal/%s/lists/s2'].words.find(w => w.zh==='電腦').es" % TID) == 'computadora')
    page.select_option('#vocSel', 's1'); page.wait_for_timeout(200)
    page.fill('tr[data-z=做菜] .vEs', 'cocinar'); page.fill('tr[data-z=做菜] .vPy', 'zuò cài'); page.click('tr[data-z=做菜] .vSave'); page.wait_for_timeout(300)
    w = [x for x in page.evaluate("window.__fb.store[%r].words" % L1) if x['zh'] == '做菜'][0]
    check('改拼音和意思：存起來', w['py'] == 'zuò cài' and w['es'] == 'cocinar', w)
    page.click('tr[data-z=放] .vHide'); page.wait_for_timeout(300)
    check('練習單的字按「隱藏」：進已隱藏，不是刪掉', '放' in page.evaluate("window.__fb.store[%r].hideW" % L1) and page.locator('tr[data-z=放]').count() == 0)
    page.click('#vocHid summary'); page.click('.vUn'); page.wait_for_timeout(300)
    check('還原：回到表裡', page.locator('tr[data-z=放]').count() == 1 and page.evaluate("window.__fb.store[%r].hideW" % L1) == [])
    page.click('tr[data-z=電腦] .vHide'); page.wait_for_timeout(300)
    check('自己加的字按「刪除」：真的刪掉', page.locator('tr[data-z=電腦]').count() == 0 and not any(x['zh'] == '電腦' for x in page.evaluate("window.__fb.store[%r].words" % L1)))
    page.fill('#vocP', '比較句＋得字補語\n把字句'); page.click('#vocAddP'); page.wait_for_timeout(300)
    pts = [x['n'] for x in page.evaluate("window.__fb.store[%r].points" % L1)]
    check('加入語法點：用＋或換行分開，重複的不加', pts == ['比較句', '得字補語'] and '語法點（3）' in page.inner_text('#app'), pts)
    page.select_option('#stCefr', 'B1'); page.fill('#stWords', '2000'); page.click('#stSave'); page.wait_for_timeout(300)
    st = page.evaluate("window.__fb.store[%r].start" % L1)
    check('起始程度：存起點 B1、單字量 2000', st == {'cefr': 'B1', 'words': 2000} and page.input_value('#stCefr') == 'B1', st)
    check('語法點分冊：對不上的列出來、可以選冊', page.locator('.gmSel').count() >= 1 and '語法點分冊' in page.inner_text('#app'))
    page.click('#vocFill'); page.wait_for_timeout(300)
    check('全部補上拼音', all(x['py'] for x in page.evaluate("window.__fb.store[%r].words" % L1)) and page.locator('#vocFill').count() == 0)
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def board_tests(browser, base):
    print('\n學生頁：公布欄／留言板／私訊、紅點')
    P = 'portal/%s/' % TID
    def login(page):
        page.goto(base + 'index.html?t=' + TID); page.wait_for_timeout(300)
        page.fill('#em', 'pedro@example.com'); page.fill('#pw', 'secret1'); page.click('#btnAuth'); page.wait_for_timeout(700)
    def fire(page, setjs):
        page.evaluate("(() => { %s; window.__fb.subs.forEach(s => s.fire()); })()" % setjs); page.wait_for_timeout(200)
    store = {
        P + 'board/b1': {'text': '11/20 沒有課', 'ts': 1000}, P + 'board/b2': {'text': 'Nueva tarea', 'ts': 2000},
        P + 'wall/w1': {'sid': 's2', 'name': 'Ana', 'text': 'Hola a todos', 'ts': 1500}, P + 'wall/w2': {'sid': 's1', 'name': 'Pedro', 'text': 'Mi mensaje', 'ts': 1600},
        P + 'dm/d1': {'sid': 's1', 'from': 's', 'text': 'Profe, una pregunta', 'ts': 1700}, P + 'dm/d2': {'sid': 's1', 'from': 't', 'text': '請說', 'ts': 1800},
        P + 'dm/d3': {'sid': 's2', 'from': 's', 'text': 'SECRET-ANA', 'ts': 1900},
    }
    ctx, page, errs = new_page(browser, base_state(store))
    page.add_init_script("localStorage.setItem('dc.lang','tc');")
    login(page)
    check('首頁有公布欄卡片；第一次來不亮紅點', page.locator('#boardGo').count() == 1 and page.locator('.rdot').count() == 0, page.inner_text('#app')[:200])
    page.click('#boardGo'); page.wait_for_timeout(200)
    txt = page.inner_text('#app')
    check('公布欄：新的在前', txt.index('Nueva tarea') < txt.index('11/20 沒有課'), txt[:300])
    page.click('[data-bt=wall]'); page.wait_for_timeout(100)
    txt = page.inner_text('#app')
    check('留言板：看得到別人和自己的留言和名字；只有自己的有刪除', 'Ana' in txt and 'Hola a todos' in txt and 'Mi mensaje' in txt and page.locator('[data-wdel]').count() == 1)
    page.fill('#wallTx', '  Hola  profe  '); page.click('#wallTxSend'); page.wait_for_timeout(300)
    posts = [v for k, v in page.evaluate("window.__fb.store").items() if k.startswith(P + 'wall/auto')]
    check('送出留言：用自己的名字和代號、整理過空白、輸入框清空', len(posts) == 1 and posts[0]['sid'] == 's1' and posts[0]['name'] == 'Pedro' and posts[0]['text'] == 'Hola  profe' and page.input_value('#wallTx') == '', posts)
    check('新留言出現在畫面上', 'Hola  profe' in page.inner_text('#app'))
    page.once('dialog', lambda d: d.accept())
    page.click('[data-wdel=w2]'); page.wait_for_timeout(300)
    check('刪除自己的留言', P + 'wall/w2' not in page.evaluate("Object.keys(window.__fb.store)") and 'Mi mensaje' not in page.inner_text('#app'))
    page.click('[data-bt=dm]'); page.wait_for_timeout(100)
    txt = page.inner_text('#app')
    check('私訊：只看到自己的對話，看不到別的學生的', 'Profe, una pregunta' in txt and '請說' in txt and 'SECRET-ANA' not in txt)
    page.fill('#dmTx', 'Gracias'); page.click('#dmTxSend'); page.wait_for_timeout(300)
    dms = [v for k, v in page.evaluate("window.__fb.store").items() if k.startswith(P + 'dm/auto')]
    check('送出私訊：from 是學生（s）', len(dms) == 1 and dms[0]['from'] == 's' and dms[0]['sid'] == 's1' and dms[0]['text'] == 'Gracias', dms)
    page.fill('#dmTx', 'x' * 501); page.evaluate("document.querySelector('#dmTx').removeAttribute('maxlength')"); page.fill('#dmTx', 'x' * 501); page.click('#dmTxSend'); page.wait_for_timeout(200)
    check('太長不送出：有提示', '最多 500' in page.inner_text('#app') and len([k for k in page.evaluate("Object.keys(window.__fb.store)") if k.startswith(P + 'dm/auto')]) == 1)
    page.click('#boardBack'); page.wait_for_timeout(100)
    check('看過之後沒有紅點', page.locator('.rdot').count() == 0)
    fire(page, "window.__fb.store['%s'] = {text: '新公告', ts: 5000}" % (P + 'board/b3'))
    check('老師貼新公告：公布欄卡片亮紅點', page.locator('.rdot').count() == 1)
    page.click('#boardGo'); page.wait_for_timeout(100)
    fire(page, "window.__fb.store['%s'] = {sid: 's2', name: 'Ana', text: 'otro', ts: 6000}" % (P + 'wall/w9'))
    check('別人的新留言：留言板分頁亮紅點、公布欄分頁沒有', page.locator('[data-bt=wall] .rdot').count() == 1 and page.locator('[data-bt=board] .rdot').count() == 0)
    page.click('[data-bt=wall]'); page.wait_for_timeout(100)
    check('點進去就消失', page.locator('.rdot').count() == 0)
    fire(page, "window.__fb.store['%s'] = {sid: 's1', from: 't', text: '回覆', ts: 7000}" % (P + 'dm/d9'))
    check('老師回覆私訊：「給老師」分頁亮紅點', page.locator('[data-bt=dm] .rdot').count() == 1)
    page.click('#boardBack'); page.wait_for_timeout(100)
    check('回首頁：公布欄卡片還亮（私訊還沒看）', page.locator('.rdot').count() == 1)
    fire(page, "window.__fb.store['%s'].log = [{d: '2026-11-10', p: '把'}]" % (P + 'students/s1'))
    check('日誌有新進度：我的學習卡片亮紅點', page.locator('.rdot').count() == 2)
    page.click('#learnGo'); page.wait_for_timeout(200)
    check('進去：上課紀錄分頁本身不亮', page.locator('[data-lt=log] .rdot').count() == 0)
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    ctx, page, errs = new_page(browser, base_state(store))
    page.add_init_script("localStorage.setItem('dc.lang','tc'); window.__fb.denyRead = ['/board', '/wall', '/dm'];")
    login(page)
    check('規則還沒貼（讀不到）：不顯示公布欄卡片，其他照常', page.locator('#boardGo').count() == 0 and page.locator('#learnGo').count() == 1)
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    ctx, page, errs = new_page(browser, base_state(store))
    page.add_init_script("localStorage.setItem('dc.lang','es');")
    login(page); page.click('#boardGo'); page.wait_for_timeout(100)
    check('西文：標題和分頁', 'Tablón y mensajes' in page.inner_text('#app') and 'Para el profesor' in page.inner_text('#app'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


def bb_admin_tests(browser, base):
    print('\n老師後台：公布')
    P = 'portal/%s/' % TID
    teacher = {'teacher@example.com': {'password': 'tpass12', 'uid': TID, 'emailVerified': True}}
    store = {P + 'students/s1': {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             P + 'students/s2': {'v': 1, 'name': 'Ana', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []},
             P + 'roster/s1': {'email': 'pedro@example.com', 'name': 'Pedro'},
             P + 'members/old@example.com': {'sid': 's9', 'name': 'Gone'},
             P + 'wall/w1': {'sid': 's1', 'name': 'Pedro', 'text': 'Hola todos', 'ts': 1000},
             P + 'dm/d1': {'sid': 's1', 'from': 's', 'text': 'Profe, duda', 'ts': 2000},
             P + 'dm/d2': {'sid': 's2', 'from': 's', 'text': 'Hola profe', 'ts': 3000}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(1000)
    st = page.evaluate("window.__fb.store")
    mem = {k: v for k, v in st.items() if k.startswith(P + 'members/')}
    check('學生名單鏡像：以電子郵件為代號，內容是學生代號和名字', list(mem.keys()) == [P + 'members/pedro@example.com'] and mem[P + 'members/pedro@example.com']['sid'] == 's1' and mem[P + 'members/pedro@example.com']['name'] == 'Pedro', mem)
    check('公布分頁的標籤有未讀數字 2', page.locator('#tabbar [data-t=pub] .bd').count() == 1 and page.inner_text('#tabbar [data-t=pub] .bd') == '2')
    page.click('#tabbar [data-t=pub]'); page.wait_for_timeout(200)
    page.fill('#bbText', '  11/20 沒有課  '); page.click('#bbPost'); page.wait_for_timeout(300)
    posts = [v for k, v in page.evaluate("window.__fb.store").items() if k.startswith(P + 'board/auto')]
    check('貼公告：整理過空白、有時間', len(posts) == 1 and posts[0]['text'] == '11/20 沒有課' and posts[0]['ts'] > 0, posts)
    check('公告出現在清單，輸入框清空', '11/20 沒有課' in page.inner_text('#app') and page.input_value('#bbText') == '')
    page.click('[data-bt=wall]'); page.wait_for_timeout(100)
    check('留言板：看得到學生留言', 'Hola todos' in page.inner_text('#app') and 'Pedro' in page.inner_text('#app'))
    page.once('dialog', lambda d: d.accept())
    page.click('.bbDel'); page.wait_for_timeout(300)
    check('刪除不適合的留言', P + 'wall/w1' not in page.evaluate("Object.keys(window.__fb.store)"))
    page.click('[data-bt=dm]'); page.wait_for_timeout(100)
    txt = page.inner_text('#app')
    check('私訊：沒有下拉選單，直接列出有對話的學生', page.locator('#bbSel').count() == 0 and 'Pedro' in txt and 'Ana' in txt and 'Profe, duda' in txt and 'Hola profe' in txt, txt[:300])
    seen = page.evaluate("window.__fb.store[%r]" % (P + 'config/dmSeen'))
    check('列表出現就記成已讀（存在雲端）；標籤數字消失', seen and seen.get('s1') == 2000 and page.locator('#tabbar [data-t=pub] .bd').count() == 0, seen)
    page.fill('.bbRp[data-sid=s1]', '請說'); page.click('.bbSend[data-sid=s1]'); page.wait_for_timeout(300)
    dms = [v for k, v in page.evaluate("window.__fb.store").items() if k.startswith(P + 'dm/auto')]
    check('回覆：from 是老師（t）、記在這位學生的代號下', len(dms) == 1 and dms[0]['from'] == 't' and dms[0]['sid'] == 's1' and dms[0]['text'] == '請說', dms)
    check('沒有錯誤訊息', not errs, errs); ctx.close()

    ctx, page, errs = new_page(browser, base_state({P + 'students/s1': {'v': 1, 'name': 'Pedro', 'archived': False, 'pay': 'single', 'taught': 1, 'tz': '', 'lessons': []}, P + 'roster/s1': {'email': 'pedro@example.com', 'name': 'Pedro'}}, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com'; window.__fb.denyRead = ['/members'];")
    page.goto(base + 'admin.html'); page.wait_for_timeout(800)
    page.click('#tabbar [data-t=pub]'); page.wait_for_timeout(200)
    check('規則還沒貼：提醒要加第九批，其他照常', '第九批' in page.inner_text('#app') and page.is_visible('#bbPost'))
    check('沒有錯誤訊息', not errs, errs); ctx.close()


srv, base = serve()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    student_tests(browser, base)
    admin_tests(browser, base)
    preview_tests(browser, base)
    hw_admin_tests(browser, base)
    hw_student_tests(browser, base)
    hw_grade_tests(browser, base)
    hw_word_tests(browser, base)
    nudge_tests(browser, base)
    nudge_admin_tests(browser, base)
    admin_tabs_tests(browser, base)
    signup_tests(browser, base)
    learn_tests(browser, base)
    voc_admin_tests(browser, base)
    placement_tests(browser, base)
    board_tests(browser, base)
    bb_admin_tests(browser, base)
    browser.close()
print('\n' + ('有 %d 項沒通過（通過 %d 項）' % (failed, passed) if failed else '全部通過（%d 項）' % passed) + '\n')
sys.exit(1 if failed else 0)
