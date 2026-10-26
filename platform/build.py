"""Build portal copies of the game from docs/ without touching docs/.

    python platform/build.py                      # all targets
    python platform/build.py crazygames
    python platform/build.py --zip <out_dir>      # also write <target>.zip files

Output: platform/<target>/ (index.html, style.css, platform.js, js/, fonts/, icons/).
three.js and the Baloo 2 font come from platform/vendor/ instead of a CDN: portals
reject absolute URLs. The service worker, manifest, share button and absolute links are
dropped: portals serve the game inside their own iframe and do not allow a PWA or links
to other sites.
"""
import argparse
import pathlib
import re
import shutil
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SRC = ROOT / "platform" / "src"
VENDOR = ROOT / "platform" / "vendor"
THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"

SDK_TAG = {
    # https://docs.crazygames.com/sdk/intro/
    "crazygames": '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
}
ALLOWED_URLS = ("https://sdk.crazygames.com/", "http://www.w3.org/", "https://www.w3.org/")

# Baloo 2 variable font, latin + latin-ext (Turkish letters), same ranges as @fontsource-variable/baloo-2
FONT_CSS = """@font-face {
  font-family: "Baloo 2"; font-style: normal; font-display: swap; font-weight: 400 800;
  src: url(fonts/baloo-2-latin-ext-wght-normal.woff2) format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: "Baloo 2"; font-style: normal; font-display: swap; font-weight: 400 800;
  src: url(fonts/baloo-2-latin-wght-normal.woff2) format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
"""


def sub1(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"patch '{label}': expected 1 match, found {n}. docs/ changed, update build.py")
    return text.replace(old, new)


def patch_main(js):
    # translation helper and the portal hooks, available to the whole module
    js = sub1(js, "import { audio, sfx } from './audio.js';\n",
              "import { audio, sfx } from './audio.js';\n"
              "const PF = window.PF, T = (s) => PF.t(s);\n"
              "let adLock = false;\n"
              "PF.bind({ mute(on) { audio.setForced(on); }, pauseInput(on) { adLock = !!on; } });\n", "helpers")
    js = sub1(js, "const fmt = n => n.toLocaleString('tr-TR');",
              "const fmt = n => n.toLocaleString(PF.lang === 'tr' ? 'tr-TR' : 'en-US');", "number format")

    # texts
    js = sub1(js, "best ? `Rekor ${fmt(best)}` : 'İlk uçuşun!'", "best ? `${T('Rekor')} ${fmt(best)}` : T('İlk uçuşun!')", "title best")
    js = sub1(js, "popText('Kalkan!'", "popText(T('Kalkan!')", "shield text")
    js = sub1(js, "$('overTitle').textContent = msg[cause] || 'Pat!';", "$('overTitle').textContent = T(msg[cause] || 'Pat!');", "over title")
    js = sub1(js, "` (+${goldCount} altın)`", "` (+${goldCount} ${T('altın')})`", "gold count")
    js = sub1(js, "isBest ? 'Önceki rekoru geçtin' : `Rekor ${fmt(best)}`",
              "isBest ? T('Önceki rekoru geçtin') : `${T('Rekor')} ${fmt(best)}`", "over best")
    js = sub1(js, "popText('Öhö öhö!'", "popText(T('Öhö öhö!')", "smoke text")
    js = sub1(js, "popText(pick(shouts)", "popText(T(pick(shouts))", "shouts")
    js = sub1(js, "`Kıl payı! +${gain}`", "`${T('Kıl payı!')} +${gain}`", "near miss")
    js = sub1(js, "popText(POWER[p.kind].name", "popText(T(POWER[p.kind].name)", "power name")

    # gameplay events
    js = sub1(js, "function showTitle() {\n  state = 'title';", "function showTitle() {\n  PF.gameplayStop();\n  state = 'title';", "home event")
    js = sub1(js, "function startGame() {\n  audio.unlock();", "function startGame() {\n  if (adLock) return;\n  audio.unlock();", "start lock")
    js = sub1(js, "  resetWorld(); state = 'play';\n", "  resetWorld(); state = 'play'; PF.gameplayStart();\n", "start event")
    js = sub1(js, "  state = 'dead'; cause = why;", "  PF.gameplayStop();\n  state = 'dead'; cause = why;", "stop event")
    # CrazyGames: no gameplayStop when the tab is hidden, only for a real pause
    js = sub1(js, "  state = 'paused'; show('pause'); show('countdown', false);\n",
              "  state = 'paused'; show('pause'); show('countdown', false);\n"
              "  if (!document.hidden && document.hasFocus()) PF.gameplayStop();\n", "pause event")
    js = sub1(js, "if (countdown <= 0) { state = 'play'; show('countdown', false); sfx.go(); }",
              "if (countdown <= 0) { state = 'play'; show('countdown', false); sfx.go(); PF.gameplayStart(); }", "resume event")
    js = sub1(js, "  if (isBest) { best = final; store.set(KEY_BEST, best); }",
              "  if (isBest) { if (best > 0) PF.happy(); best = final; store.set(KEY_BEST, best); }", "happytime")
    js = sub1(js, "if (firstFrame) { firstFrame = false;", "if (firstFrame) { firstFrame = false; PF.loaded();", "loaded")

    # ad break between runs; startGame is blocked while the ad runs
    js = sub1(js, "if (state === 'title' && !isUi(e)) startGame();", "if (state === 'title' && !isUi(e)) PF.adBreak(startGame);", "title ad")
    js = sub1(js, "if (state === 'title' || (state === 'over' && overLock <= 0)) { e.preventDefault(); startGame(); }",
              "if (state === 'title' || (state === 'over' && overLock <= 0)) { e.preventDefault(); PF.adBreak(startGame); }", "key ad")
    js = sub1(js, "onBtn('againBtn', () => { if (overLock <= 0) startGame(); });",
              "onBtn('againBtn', () => { if (overLock <= 0) PF.adBreak(startGame); });", "again ad")
    return js


def patch_audio(js):
    # a forced mute (ad playing / portal setting) that the in-game toggles cannot override
    js = sub1(js, "const opts = { sfx: true, music: true };\n", "const opts = { sfx: true, music: true };\nlet forced = false;\n", "forced var")
    js = sub1(js, "master = AC.createGain(); master.gain.value = 0.8;", "master = AC.createGain(); master.gain.value = forced ? 0 : 0.8;", "init gain")
    js = sub1(js, "  suspend() {",
              "  setForced(v) { forced = !!v; if (master) master.gain.setTargetAtTime(forced ? 0 : 0.8, AC.currentTime, 0.02); },\n  suspend() {",
              "setForced")
    return js


def patch_html(html, target):
    html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon|preconnect)"[^>]*>\n', "", html)
    html = re.sub(r'<meta (property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\n', "", html)
    html = re.sub(r'<meta name="(apple-mobile-web-app[^"]*|mobile-web-app-capable)"[^>]*>\n', "", html)
    html = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n', "", html)
    html = re.sub(r'<meta name="description"[^>]*>', '<meta name="description" content="Be an Istanbul seagull gliding over'
                  ' the ferries and snatching simits from passengers. A one-finger 3D endless flyer.">', html)
    html = sub1(html, "<title>Simit Martısı</title>", "<title>Simit Seagull</title>", "title")
    html = sub1(html, f'<link rel="modulepreload" href="{THREE_CDN}" crossorigin>',
                '<link rel="modulepreload" href="js/three.module.min.js">', "modulepreload")
    html = sub1(html, THREE_CDN, "./js/three.module.min.js", "import map")
    # end of body: the SDK appends to document.body during init
    html = sub1(html, '<script type="module" src="js/main.js"></script>\n',
                SDK_TAG[target] + '\n<script src="platform.js"></script>\n<script type="module" src="js/main.js"></script>\n', "scripts")
    html = sub1(html, '<button class="btn ghost" id="shareBtn">', '<button class="btn ghost" id="shareBtn" style="display:none">', "share")
    sw = re.search(r"<script>\n  // modül yüklenemezse.*?</script>\n", html, re.S)
    if not sw:
        raise SystemExit("patch 'service worker': not found")
    html = html.replace(sw.group(0), (
        "<script>\n"
        "  PF.translateDom();\n"
        "  setTimeout(function () { var m = document.getElementById('loaderMsg'); if (m && document.getElementById('loader'))"
        " m.textContent = PF.t('Oyun yüklenemedi. Bağlantını kontrol edip sayfayı yenile.'); }, 15000);\n"
        "</script>\n"))  # classic script: runs before the deferred main.js module
    return html


def check_urls(out):
    for p in out.rglob("*"):
        if p.suffix not in (".html", ".css", ".js"):
            continue
        left = [u for u in re.findall(r'https?://[^"\'\s)`]+', p.read_text("utf-8"))
                if not u.startswith(ALLOWED_URLS) and not (p.name == "three.module.min.js" and "threejs.org" in u)]
        if left:
            raise SystemExit(f"absolute URL left in {p.relative_to(out)}: {left[:5]}")


def build(target, zip_dir):
    out = ROOT / "platform" / target
    if out.exists():
        shutil.rmtree(out)
    (out / "js").mkdir(parents=True)
    (out / "fonts").mkdir()
    (out / "icons").mkdir()
    for f in VENDOR.glob("*.woff2"):
        shutil.copy2(f, out / "fonts" / f.name)
    shutil.copy2(VENDOR / "OFL-Baloo2.txt", out / "fonts" / "OFL-Baloo2.txt")
    shutil.copy2(VENDOR / "three.module.min.js", out / "js" / "three.module.min.js")
    shutil.copy2(DOCS / "icons" / "icon.svg", out / "icons" / "icon.svg")
    (out / "style.css").write_text(FONT_CSS + (DOCS / "style.css").read_text("utf-8"), "utf-8")
    for f in (DOCS / "js").glob("*.js"):
        js = f.read_text("utf-8")
        js = {"main.js": patch_main, "audio.js": patch_audio}.get(f.name, lambda s: s)(js)
        (out / "js" / f.name).write_text(js, "utf-8")
    (out / "index.html").write_text(patch_html((DOCS / "index.html").read_text("utf-8"), target), "utf-8")
    (out / "platform.js").write_text((SRC / "platform.js").read_text("utf-8").replace("__TARGET__", target), "utf-8")
    check_urls(out)
    files = sorted(p for p in out.rglob("*") if p.is_file())
    size = sum(p.stat().st_size for p in files)
    print(f"{target}: {len(files)} files, {size / 1024:.0f} KB -> {out.relative_to(ROOT)}")
    if zip_dir:
        zp = pathlib.Path(zip_dir) / f"simit-seagull-{target}.zip"
        zp.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for p in files:  # index.html at the zip root, as the portals expect
                z.write(p, p.relative_to(out).as_posix())
        print(f"  zip: {zp} ({zp.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*", default=list(SDK_TAG))
    ap.add_argument("--zip", default="")
    a = ap.parse_args()
    for t in a.targets:
        build(t, a.zip)
