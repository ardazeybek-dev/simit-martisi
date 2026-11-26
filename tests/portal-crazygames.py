"""Portal build check: python platform/build.py crazygames, then python tests/portal-crazygames.py
Serves platform/crazygames/, opens the title, flies, crashes, presses "play again" and checks that the
ad break is asked for once, that nothing but the CrazyGames SDK is requested from outside and that the
console stays clean. Needs Playwright (pip install playwright; python -m playwright install chromium)."""
import functools, http.server, pathlib, re, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "platform" / "crazygames"
VERSION = re.search(r'name="app-version" content="([^"]+)"', (ROOT / "docs" / "index.html").read_text("utf-8")).group(1)
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8791), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(GAME)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

fails = 0
def ok(c, m):
    global fails
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails += 1

outside, errors = set(), []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.on("request", lambda r: outside.add(r.url.split("?")[0]) if not r.url.startswith(("http://127.0.0.1", "data:", "blob:")) else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:8791/index.html")
    pg.wait_for_function("window.__game && __game.state === 'title'", timeout=60000)
    ok(True, "title screen")
    v = pg.eval_on_selector('meta[name="app-version"]', "m => m.content")
    ok(v == VERSION, f"version {v} (docs: {VERSION})")
    ok(pg.title() == "Simit Seagull", f"page title: {pg.title()}")
    hidden = pg.evaluate("['boardBtn', 'shareBtn'].map(i => getComputedStyle(document.getElementById(i)).display)")
    ok(hidden == ["none", "none"], f"leaderboard and share buttons hidden {hidden}")
    ok(pg.evaluate("!!window.PF && typeof PF.adBreak === 'function'"), "portal bridge (PF) loaded")
    ads_on = "'on' === 'on'" in (GAME / "platform.js").read_text("utf-8")
    print(f"     build: ads {'on (Full launch)' if ads_on else 'off (Basic launch)'}")
    if not ads_on:
        ok(pg.evaluate("PF.canReward() === false"), "ads off: no rewarded 'watch ad' button")
    pg.evaluate("__game.startGame()")
    pg.wait_for_function("__game.state === 'play'", timeout=15000)
    time.sleep(4)
    z0 = pg.evaluate("__game.z")
    time.sleep(2)
    ok(pg.evaluate("__game.z") != z0, "flying")
    # "; 0": Playwright calls the result when an expression evaluates to a function
    pg.evaluate("window.__ads = 0; const a = PF.adBreak; PF.adBreak = (cb) => { window.__ads++; return a(cb); }; 0")
    pg.wait_for_function("(__game.state === 'play' && __game.crash(), __game.state === 'over')", timeout=20000, polling=300)
    ok(True, "crash -> game over screen")
    time.sleep(3)  # overLock
    pg.click("#againBtn")
    pg.wait_for_function("__game.state === 'play' || __game.state === 'countdown'", timeout=20000)
    time.sleep(2)
    ok(pg.evaluate("window.__ads") == 1, f"play again asks for one ad break, then flies (adBreak={pg.evaluate('window.__ads')})")

    # Data module (progress save): a stand-in SDK whose save survives reloads (kept in sessionStorage)
    FAKE_SDK = """window.CrazyGames = { SDK: {
      init: () => new Promise(r => setTimeout(r, 300)),
      environment: 'local',
      game: { gameplayStart() {}, gameplayStop() {}, happytime() {}, loadingStart() {}, loadingStop() {}, settings: {}, addSettingsChangeListener() {} },
      ad: { requestAd(t, cb) { cb.adFinished && cb.adFinished(); } },
      data: (() => { const S = 'fakeCG', o = () => JSON.parse(sessionStorage.getItem(S) || '{}'), w = d => sessionStorage.setItem(S, JSON.stringify(d));
        return { getItem: k => (k in o() ? o()[k] : null), setItem: (k, v) => { const d = o(); d[k] = String(v); w(d); },
                 removeItem: k => { const d = o(); delete d[k]; w(d); }, clear: () => w({}) }; })()
    } };"""
    ctx = b.new_context(viewport={"width": 1280, "height": 720})
    ctx.route("https://sdk.crazygames.com/**", lambda r: r.fulfill(status=200, content_type="text/javascript", body=FAKE_SDK))
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    # a returning player: this browser already has a save from before the Data module
    # (a same-origin page that is not the game, so nothing is in the Data module yet; with the one-time marks a real save has)
    marks = re.findall(r"_MARK = '([^']+)'", (ROOT / "docs" / "js" / "util.js").read_text("utf-8"))
    pg.goto("http://127.0.0.1:8791/fonts/OFL-Baloo2.txt")
    pg.evaluate("m => { for (const k of m) localStorage.setItem(k, '1'); localStorage.setItem('simit-martisi-best', '4321'); }", marks)
    pg.goto("http://127.0.0.1:8791/index.html")
    pg.wait_for_function("window.__game && __game.state === 'title'", timeout=60000)
    ok(pg.evaluate("!!(PF.storage && PF.storage.sdk)"), "save goes through the Data module (PF.storage)")
    fake = lambda: pg.evaluate("JSON.parse(sessionStorage.getItem('fakeCG') || '{}')")
    ok(fake().get("simit-martisi-best") == "4321", "an older local save is copied into the Data module")
    pg.evaluate("__game.startGame()")
    pg.wait_for_function("(__game.state === 'play' && __game.crash(), __game.state === 'over')", timeout=30000, polling=300)
    time.sleep(1)
    keys = [k for k in fake() if k.startswith("simit-martisi")]
    ok(len(keys) >= 3, f"a flight writes the save into the Data module ({len(keys)} keys)")
    pg.evaluate("PF.storage.setItem('simit-martisi-wallet', '777'); localStorage.removeItem('simit-martisi-wallet')")
    pg.reload()
    pg.wait_for_function("window.__game && __game.state === 'title'", timeout=60000)
    ok(pg.evaluate("__game.wallet") == 777, f"after a reload the save comes back from the Data module (wallet {pg.evaluate('__game.wallet')})")
    ok(pg.evaluate("localStorage.getItem('simit-martisi-wallet')") is None, "the wallet is not written to plain localStorage")
    ctx.close()
    b.close()
srv.shutdown()

ext = sorted(outside)
ok(all(u.startswith("https://sdk.crazygames.com/") for u in ext), f"outside requests: only the CrazyGames SDK {ext}")
real = [e for e in errors if "crazygames" not in e.lower() and "sdk" not in e.lower()]
ok(not real, f"no console errors from the game {real[:5]}")
print("PORTAL OK" if not fails else f"{fails} FAIL")
sys.exit(1 if fails else 0)
