"""docs/ klasörünü önbelleksiz sunar: tarayıcı her yenilemede güncel js dosyalarını alır.

Düz `python -m http.server` önbellek başlığı göndermez; tarayıcı eski modülleri tutup
yeni kodla karıştırabilir. Kullanım: python serve.py [port]   (varsayılan 8765)
"""
import functools
import http.server
import os
import sys


TESTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tests')


class NoCache(http.server.SimpleHTTPRequestHandler):
    # /test → tests/test-merkezi.html (yalnız yerelde: docs/ dışında, canlıya gitmez)
    def translate_path(self, path):
        if path.split('?')[0].rstrip('/') == '/test':
            return os.path.join(TESTS, 'test-merkezi.html')
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs')
handler = functools.partial(NoCache, directory=root)
print(f'http://localhost:{port}')
http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
