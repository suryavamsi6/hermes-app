"""Start hermes-bridge (the real package, ../hermes-bridge) in front of its fake Hermes dashboard on
random loopback ports, print {"bridge": url, "key": key} and serve until stdin closes. Test-only."""
import json, os, sys, tempfile, threading
from http.server import ThreadingHTTPServer
from pathlib import Path

root = Path(os.environ.get("HERMES_BRIDGE_SRC", Path(__file__).resolve().parents[2] / "hermes-bridge"))
sys.path[:0] = [str(root / "src"), str(root / "tests")]
from fake_dashboard import TOKEN, FakeHermes  # noqa: E402
from hermes_bridge.app import Bridge  # noqa: E402
from hermes_bridge.config import load  # noqa: E402
from hermes_bridge.server import make_handler  # noqa: E402

KEY = "bridge-key-" + "b" * 40
fake = FakeHermes()
fake.auth_required = os.environ.get("HM_GATED") == "1"  # simulate a dashboard in browser-login mode
dash = fake.start()
d = Path(tempfile.mkdtemp())
(d / "key").write_text(KEY)
(d / "token").write_text(TOKEN)
cfg = load(environ={"HERMES_BRIDGE_DASHBOARD_URL": dash, "HERMES_BRIDGE_KEY_FILE": str(d / "key"),
                    "HERMES_BRIDGE_DASHBOARD_TOKEN_FILE": str(d / "token"), "HERMES_BRIDGE_LISTEN": "127.0.0.1:0"})
httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(Bridge(cfg)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
print(json.dumps({"bridge": f"http://127.0.0.1:{httpd.server_address[1]}", "key": KEY}), flush=True)
sys.stdin.read()
