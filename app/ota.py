"""Publish the game files to installed store apps (in-app update, no store review).

    python app/ota.py            # after the web version is verified: build app/www, zip it,
                                 # upload as GitHub release ota-<version>, write docs/app-update.json
    then commit docs/app-update.json and push main (the zip is uploaded first, the manifest goes live last).

Test bundles (nothing in docs/ changes; a prerelease is created and its manifest printed):
    python app/ota.py --test 3.13.99           # higher version, same files
    python app/ota.py --test 3.13.100 --broken  # main.js throws at load: the app must roll back by itself

MIN_NATIVE: the lowest store build (versionCode) whose native shell (plugins, permissions) can run these
files. Raise it to the new versionCode whenever a release adds or changes a native plugin; older store
apps then show "New version · Update" on the menu and open the store instead of downloading.
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import importlib.util
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("appbuild", ROOT / "app" / "build.py")  # platform/build.py is also "build"
build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build)

REPO = "ardazeybek-dev/simit-martisi"
MIN_NATIVE = 31314
STORE = {"android": "https://play.google.com/store/apps/details?id=com.simitmartisi.game", "ios": ""}
OUT = ROOT / "app" / "ota"


def zip_www(version, broken):
    OUT.mkdir(exist_ok=True)
    z = OUT / f"bundle-{version}.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as f:
        for p in sorted(build.OUT.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(build.OUT).as_posix()
            data = p.read_bytes()
            if rel == "index.html":
                html, n = re.subn(r'(name="app-version" content=")[^"]+', r"\g<1>" + version, data.decode("utf-8"), count=1)
                assert n == 1
                data = html.encode("utf-8")
            if broken and rel == "js/main.js":
                data = b"throw new Error('ota test: broken bundle');\n" + data
            f.writestr(rel, data)
    return z


def gh(*args):
    subprocess.run(["gh", *args, "-R", REPO], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", metavar="VERSION")
    ap.add_argument("--broken", action="store_true")
    a = ap.parse_args()
    build.main()
    game = re.search(r'name="app-version" content="([^"]+)"', (build.DOCS / "index.html").read_text("utf-8")).group(1)
    version = a.test or game
    z = zip_www(version, a.broken)
    tag = f"ota-{version}" + ("-broken" if a.broken else "")
    gh("release", "create", tag, str(z), "--title", f"In-app update {version}" + (" (test)" if a.test else ""),
       "--notes", "Game files for installed store apps (app/ota.py).", *(["--prerelease"] if a.test else ["--latest=false"]))
    manifest = {
        "version": version,
        "url": f"https://github.com/{REPO}/releases/download/{tag}/{z.name}",
        "checksum": hashlib.sha256(z.read_bytes()).hexdigest(),
        "minNative": MIN_NATIVE if not a.test else 0,
        "store": STORE,
    }
    text = json.dumps(manifest, indent=2) + "\n"
    if a.test:
        print("test manifest (put into localStorage otaManifestJson on the device):")
        print(json.dumps(manifest))
    else:
        (build.DOCS / "app-update.json").write_text(text, "utf-8")
        print(f"docs/app-update.json -> {version}; commit and push main to publish")
    print(f"{z.name}: {z.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
