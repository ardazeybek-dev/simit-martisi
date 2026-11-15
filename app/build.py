"""Build the store app's web content (app/www) from docs/ without touching docs/.

    python app/build.py

Everything the game needs ships inside the app, so it starts offline and never loads
from a browser or CDN: three.js and the Baloo 2 font come from platform/vendor/.
The service worker is dropped (the app is updated through the store); the shared
leaderboard stays on (Supabase over HTTPS). Then: cd app && npx cap sync
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "platform"))
from build import FONT_CSS, THREE_CDN, VENDOR, sub1  # noqa: E402  (same vendor files and font as the portal copy)

DOCS = ROOT / "docs"
OUT = ROOT / "app" / "www"
# outside addresses the app may still contain: leaderboard server, share/invite links to the web version, SVG namespaces
ALLOWED = ("https://sznwlsoyssseckgljulb.supabase.co", "https://ardazeybek-dev.github.io/", "http://www.w3.org/", "https://www.w3.org/", "https://github.com/ardazeybek-dev/")


def patch_html(html):
    html = re.sub(r'<link rel="(manifest|preconnect)"[^>]*>\n', "", html)
    html = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n', "", html)
    html = re.sub(r'<meta name="(apple-mobile-web-app[^"]*|mobile-web-app-capable)"[^>]*>\n', "", html)
    html = sub1(html, f'<link rel="modulepreload" href="{THREE_CDN}" crossorigin>', '<link rel="modulepreload" href="js/three.module.min.js">', "modulepreload")
    html = sub1(html, THREE_CDN, "./js/three.module.min.js", "import map")
    html = sub1(html, '<script type="module" src="js/main.js"></script>', '<script src="js/native.js"></script>\n<script type="module" src="js/main.js"></script>', "native glue")
    html = sub1(html, "if ('serviceWorker' in navigator && location.protocol === 'https:') {", "if (false) { // uygulama: güncelleme mağazadan gelir, service worker yok", "service worker")
    return html


def check_urls(out):
    for p in out.rglob("*"):
        if p.suffix not in (".html", ".css", ".js") or p.name == "three.module.min.js":
            continue
        text = p.read_text("utf-8")
        left = [u for u in re.findall(r'https?://[^"\'\s)`<>]+', text) if not u.startswith(ALLOWED)]
        if left:
            raise SystemExit(f"outside URL left in {p.relative_to(out)}: {sorted(set(left))[:6]}")


def main():
    if OUT.exists():  # only the contents: a test server running inside www holds the folder itself on Windows
        for p in OUT.iterdir():
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    shutil.copytree(DOCS, OUT, dirs_exist_ok=True, ignore=shutil.ignore_patterns("sw.js", "manifest.webmanifest", "_mock", "og.png", "preview.png", "*.map"))
    (OUT / "fonts").mkdir(exist_ok=True)
    for f in VENDOR.glob("*.woff2"):
        shutil.copy2(f, OUT / "fonts" / f.name)
    shutil.copy2(VENDOR / "OFL-Baloo2.txt", OUT / "fonts" / "OFL-Baloo2.txt")
    shutil.copy2(VENDOR / "three.module.min.js", OUT / "js" / "three.module.min.js")
    shutil.copy2(ROOT / "app" / "native.js", OUT / "js" / "native.js")
    (OUT / "style.css").write_text(FONT_CSS + (DOCS / "style.css").read_text("utf-8"), "utf-8")
    (OUT / "index.html").write_text(patch_html((DOCS / "index.html").read_text("utf-8")), "utf-8")
    check_urls(OUT)
    files = [p for p in OUT.rglob("*") if p.is_file()]
    print(f"app/www: {len(files)} files, {sum(p.stat().st_size for p in files) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
