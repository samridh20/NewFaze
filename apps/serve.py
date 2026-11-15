"""Serves the two minimum web apps with single-page fallback: Odyssey on 3001, Signal Lab on 3002."""
import http.server
import socketserver
import threading
from pathlib import Path

HERE = Path(__file__).parent


def handler(root: Path):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(root), **k)

        def do_GET(self):
            if "." not in self.path.rsplit("/", 1)[-1]:
                self.path = "/index.html"
            super().do_GET()

        def log_message(self, *a):
            pass
    return H


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    for port, name in ((3001, "odyssey-web"), (3002, "lab-web")):
        threading.Thread(target=Server(("127.0.0.1", port), handler(HERE / name)).serve_forever, daemon=True).start()
    threading.Event().wait()
