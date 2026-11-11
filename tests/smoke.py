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
export function where(field, op, val){ return { field, op, val }; }
export function query(col, w){ return { col, w }; }
const snapDoc = (path) => ({ id: path.split('/').pop(), exists: () => path in fb().store, data: () => fb().store[path] });
function listCol(path){ return Object.keys(fb().store).filter(p => p.startsWith(path + '/') && p.slice(path.length + 1).indexOf('/') < 0); }
function colSnap(paths){ const docs = paths.map(snapDoc); return { empty: docs.length === 0, docs, forEach: f => docs.forEach(f) }; }
export async function getDocs(q){
  const col = q.col || q; let paths = listCol(col.path);
  if(q.w) paths = paths.filter(p => fb().store[p][q.w.field] === q.w.val);
  fb().reads.push(col.path); return colSnap(paths);
}
export function onSnapshot(ref, cb, err){
  const sub = { ref, cb };
  fb().subs.push(sub);
  const fire = () => ref.col ? cb(colSnap(listCol(ref.path))) : cb(snapDoc(ref.path));
  sub.fire = fire; setTimeout(fire, 0); return () => { fb().subs = fb().subs.filter(s => s !== sub); };
}
export async function setDoc(ref, data){ fb().store[ref.path] = data; fb().subs.forEach(s => s.fire()); }
export async function updateDoc(ref, data){ if(window.__fb.failUpdate){ const e = new Error('x'); e.code = 'unavailable'; throw e; } const nd = Object.assign({}, fb().store[ref.path], data); Object.keys(nd).forEach(k => { if(nd[k] && nd[k].__del) delete nd[k]; }); fb().store[ref.path] = nd; fb().subs.forEach(s => s.fire()); }
export function deleteField(){ return { __del: true }; }
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


def new_page(browser, init):
    ctx = browser.new_context(viewport={'width': 390, 'height': 800}, locale='es-MX')
    page = ctx.new_page()
    def handle(route):
        name = route.request.url.split('/')[-1]
        route.fulfill(status=200, content_type='application/javascript', body=STUBS[name])
    page.route('**/www.gstatic.com/**', handle)
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
        'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro'},
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
    ctx, page, errs = new_page(browser, base_state({'portal/%s/roster/s2' % TID: {'email': 'liz@example.com', 'name': 'x'}}, {'liz@example.com': {'password': 'secret2', 'uid': 'u_liz', 'emailVerified': True}}))
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
    check('不在對照表：請學生告訴老師這個電子郵件，且看不到任何學生資料', 'stranger@example.com' in txt and 'Pedro' not in txt, txt); ctx.close()

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
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro'},
             'portal/%s/hwPool/w1' % TID: {'id': 'w1', 'ts': 1760000000000, 'upd': 1760000000000, 'name': '把字句練習', 'grammar': '把字句', 'count': 3, 'data': json.dumps(HW_STATE)}}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(600)
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
             'portal/%s/roster/s1' % TID: {'email': 'pedro@example.com', 'name': 'Pedro'},
             'portal/%s/hwPool/w1' % TID: {'id': 'w1', 'ts': 1760000000000, 'upd': 1760000000000, 'name': '把字句練習', 'grammar': '把字句', 'count': 3, 'data': json.dumps(HW_STATE)},
             path: grade_docs()}
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(600)
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
    page.click('.hwrow [data-g=s1]'); page.wait_for_timeout(200)
    check('已批改的重新打開：還原上次的分數和標記', page.inner_text('#gScore').strip() == '2 / 3' and '<s>' in page.evaluate("document.querySelector('[data-edit]').innerHTML") and '更新批改' in page.inner_text('#app'))
    page.click('#gBack'); page.wait_for_timeout(100)
    store[path] = grade_docs()
    ctx.close()
    ctx, page, errs = new_page(browser, base_state(store, teacher))
    page.add_init_script("window.__fb.autoLogin = 'teacher@example.com';")
    page.goto(base + 'admin.html'); page.wait_for_timeout(500)
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
    page.click('.card [data-g=s1]'); page.wait_for_timeout(200)
    page.click('.gi[data-id=se1] .gb button.y'); page.check('#gHide'); page.click('#gDone'); page.wait_for_timeout(400)
    d = page.evaluate("window.__fb.store['%s']" % path)
    check('勾了不顯示分數：review.hideScore 為真，後台分數照樣存', d['review']['hideScore'] is True and d['result']['max'] == 3 and '已批改 2/3' in page.inner_text('#app'), d.get('result'))
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
    browser.close()
print('\n' + ('有 %d 項沒通過（通過 %d 項）' % (failed, passed) if failed else '全部通過（%d 項）' % passed) + '\n')
sys.exit(1 if failed else 0)
