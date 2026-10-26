"""Render portal cover images from the game's own title scene.

    python platform/build.py crazygames
    python platform/covers.py <out_dir>

Serves platform/crazygames/, lets the autopilot seagull fly for a few seconds and takes
screenshots with every menu element hidden except the logo: CrazyGames allows the game
name as the only text on a cover. Needs Playwright (pip install playwright).
"""
import functools
import http.server
import pathlib
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAME = ROOT / "platform" / "crazygames"
# the logo sits in the sky so the seagull and the ferry stay visible below it
COVERS = {  # name: (width, height, extra css)
    "crazygames-landscape-1920x1080": (1920, 1080, ".logo-badge { display: none; } .logo h1 span { display: inline; font-size: 150px; }"
                                                   " .logo h1 span + span { margin-left: .25em; } #title { padding-top: 40px; }"),
    "crazygames-portrait-800x1200": (800, 1200, ".logo { transform: scale(1.45); transform-origin: top; } #title { padding-top: 70px; }"),
    "crazygames-square-800x800": (800, 800, ".logo-badge { display: none; } .logo h1 span { font-size: 112px; } #title { padding-top: 26px; }"),
}
CSS = """
#title .top-actions, #title .spacer, #title .tagline, #title .title-bottom, #hud, #powers, #tutorial { display: none !important; }
#title { justify-content: flex-start; background: linear-gradient(rgba(28, 36, 86, .55), transparent 45%); }
.logo, .logo-badge { animation: none !important; margin-top: 0; }
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main(out_dir):
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=GAME))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for name, (w, h, extra) in COVERS.items():
            page = b.new_page(viewport={"width": w, "height": h}, locale="en-US")
            page.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://127.0.0.1") else r.abort())
            page.goto(f"http://127.0.0.1:{srv.server_port}/?q=2")
            page.wait_for_function("window.__game && __game.state === 'title' && !document.getElementById('loader')", timeout=60000)
            page.add_style_tag(content=CSS + extra)
            page.wait_for_function("__game.z < -60", timeout=60000)  # let the scene fill with ferries
            page.screenshot(path=str(out / f"{name}.png"))
            page.close()
            print(f"{name}.png")
        b.close()
    srv.shutdown()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "platform" / "covers")
