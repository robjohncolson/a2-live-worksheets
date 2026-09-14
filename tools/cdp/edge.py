"""Edge-via-CDP rig for visually testing the follow-alongs Desk.

Local-only dev tool. Launches Edge with --remote-debugging-port + a
dedicated profile dir (so it doesn't trample the user's real Edge),
then drives it via the Chrome DevTools Protocol over WebSocket.

Why Edge: per the user's preference. Chrome would also work; only the
exe path needs to change.

Typical use from CC:
    python tools/cdp/edge.py --shot tools/cdp/_shots/boot.png
    python tools/cdp/edge.py --eval "document.title" --keep
    python tools/cdp/edge.py --signin --shot tools/cdp/_shots/post-signin.png

Use --keep to leave Edge running across calls (the rig reuses the
profile + the CDP port so a subsequent call attaches to the existing
process instead of spawning a new one).

ASCII only. LF line endings.
"""
from __future__ import annotations

import argparse
import base64
import collections
import json
import os
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen

import websocket  # websocket-client


# Paths resolve from the environment / home dir so no machine-specific
# username is baked into the repo. Override EDGE_EXE / CC_TEST_CREDS via env
# if your install differs. On the dev host these resolve to the same values
# as before (system %TEMP% + ~/.claude).
EDGE_EXE      = os.environ.get(
    "EDGE_EXE",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
)
PROFILE_DIR   = os.path.join(tempfile.gettempdir(), "edge-claude-cdp")
DEFAULT_PORT  = 9223        # avoid 9222 in case another debug session is up
DEFAULT_URL   = os.environ.get("A2_DESK_URL", "https://robjohncolson.github.io/a2-live-worksheets/desk.html")
CREDS_PATH    = os.environ.get(
    "CC_TEST_CREDS",
    os.path.join(os.path.expanduser("~"), ".claude", "test-credentials.json"),
)
SHOT_DIR      = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_shots")


# --------------------------------------------------------------------------- #
# Credentials                                                                  #
# --------------------------------------------------------------------------- #

def load_creds() -> dict:
    """Read test-account credentials from the user's gitignored .claude dir.

    Shape:
        { "default_username": "...", "password": "...", "usernames": [...] }

    Returns an empty dict if the file doesn't exist yet (caller decides).
    """
    if not os.path.exists(CREDS_PATH):
        return {}
    try:
        with open(CREDS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


# --------------------------------------------------------------------------- #
# CDP wrapper                                                                  #
# --------------------------------------------------------------------------- #

class EdgeCDP:
    def __init__(self, port: int = DEFAULT_PORT, profile_dir: str = PROFILE_DIR):
        self.port        = port
        self.profile_dir = profile_dir
        self.process     = None
        self.ws          = None
        self._cmd_id     = 0
        self._net_events = collections.deque(maxlen=200)
        self._network_enabled = False
        self.page_target = None   # whatever /json/list returned for our active page

    # ----- lifecycle ------------------------------------------------------ #

    def _cdp_alive(self) -> bool:
        """True if the port is already serving CDP (reuse an existing Edge)."""
        try:
            urlopen(f"http://localhost:{self.port}/json/version", timeout=1).read()
            return True
        except (URLError, ConnectionResetError, TimeoutError, OSError):
            return False

    def launch(self, url: str = DEFAULT_URL, reuse: bool = True) -> None:
        """Spawn Edge (or reuse an existing CDP-enabled instance) + attach."""
        if reuse and self._cdp_alive():
            # Don't re-spawn -- just attach. URL navigation happens via attach_url.
            pass
        else:
            os.makedirs(self.profile_dir, exist_ok=True)
            args = [
                EDGE_EXE,
                f"--remote-debugging-port={self.port}",
                f"--user-data-dir={self.profile_dir}",
                # Chromium 144+ rejects WS handshakes from non-allowlisted
                # origins by default. websocket-client sends an Origin of
                # http://localhost:<port>, which is the same origin Edge
                # would otherwise reject. `*` allows all -- safe for a
                # local-only dev rig spawned on a per-session profile.
                "--remote-allow-origins=*",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-features=msEdgeIdentityWebSignin",   # no MS sign-in nag
                url,
            ]
            # DETACHED_PROCESS = 0x00000008; CREATE_NEW_PROCESS_GROUP = 0x00000200
            self.process = subprocess.Popen(
                args,
                creationflags=0x00000008 | 0x00000200,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            # Wait for CDP to come up.
            for _ in range(60):
                if self._cdp_alive():
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError("CDP port did not come up within 30 s")

        self._attach()

    def _attach(self) -> None:
        """Find a page target + open the WS."""
        last_err = None
        for _ in range(30):
            try:
                tabs = json.loads(urlopen(f"http://localhost:{self.port}/json/list", timeout=2).read())
                pages = [
                    t for t in tabs
                    if t.get("type") == "page"
                    and t.get("url", "").startswith(("http://", "https://", "file://", "about:blank"))
                ]
                if pages:
                    self.page_target = pages[0]
                    self.ws = websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=10)
                    self._network_enabled = False
                    try:
                        self.send("Network.enable")
                        self._network_enabled = True
                    except Exception:
                        pass
                    return
            except Exception as e:  # noqa: BLE001
                last_err = e
            time.sleep(0.5)
        raise RuntimeError(f"No page target found in /json/list: {last_err}")

    def attach_url(self, url: str, wait_ms: int = 2500) -> None:
        """Navigate the attached page + crude wait for load."""
        self.send("Page.enable")
        self.send("Page.navigate", {"url": url})
        time.sleep(wait_ms / 1000.0)

    def close(self) -> None:
        if self.ws is not None:
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None
        if self.process is not None:
            try:
                self.process.terminate()
            except Exception:
                pass
            self.process = None

    # ----- CDP send/recv -------------------------------------------------- #

    def send(self, method: str, params: dict | None = None, timeout: float = 30.0) -> dict:
        """One round trip, ignoring intermediate events."""
        self._cmd_id += 1
        cmd_id = self._cmd_id
        self.ws.settimeout(timeout)
        self.ws.send(json.dumps({"id": cmd_id, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == cmd_id:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method} error: {msg['error']}")
                return msg.get("result", {})
            if msg.get("method") in ("Network.responseReceived", "Network.loadingFinished"):
                self._net_events.append(msg)
        raise TimeoutError(f"CDP {method} timed out after {timeout} s")

    def wait_for_response(self, url_substring, timeout=15.0) -> dict | None:
        """Capture one Network response body whose URL contains url_substring."""
        deadline = time.time() + timeout
        pending = {}
        body_unavailable = object()

        def handle_event(msg):
            method = msg.get("method")
            params = msg.get("params") or {}
            request_id = params.get("requestId")
            if not request_id:
                return None

            if method == "Network.responseReceived":
                response = params.get("response") or {}
                url = response.get("url") or ""
                if url_substring in url:
                    pending[request_id] = {
                        "url": url,
                        "status": response.get("status"),
                    }
                return None

            if method != "Network.loadingFinished" or request_id not in pending:
                return None

            meta = pending[request_id]
            try:
                body_result = self.send(
                    "Network.getResponseBody",
                    {"requestId": request_id},
                    timeout=max(0.1, min(2.0, deadline - time.time())),
                )
            except RuntimeError as e:
                if "No resource with given identifier" in str(e):
                    return body_unavailable
                raise

            body = body_result.get("body", "")
            base64_encoded = bool(body_result.get("base64Encoded"))
            if base64_encoded:
                body = base64.b64decode(body).decode("utf-8")
            return {
                "url": meta["url"],
                "requestId": request_id,
                "status": meta["status"],
                "body": body,
                "base64Encoded": base64_encoded,
            }

        try:
            while self._net_events:
                result = handle_event(self._net_events.popleft())
                if result is body_unavailable:
                    return None
                if result is not None:
                    return result

            while time.time() < deadline:
                remaining = deadline - time.time()
                self.ws.settimeout(max(0.1, min(remaining, 1.0)))
                try:
                    msg = json.loads(self.ws.recv())
                except (TimeoutError, websocket.WebSocketTimeoutException):
                    continue
                result = handle_event(msg)
                if result is body_unavailable:
                    return None
                if result is not None:
                    return result
            return None
        finally:
            self.ws.settimeout(30.0)

    # ----- ergonomics ----------------------------------------------------- #

    def screenshot(self, path: str) -> str:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        result = self.send("Page.captureScreenshot", {"format": "png"})
        with open(path, "wb") as f:
            f.write(base64.b64decode(result["data"]))
        return path

    def eval_js(self, expression: str):
        """Run JS in the page; returns the value (must be JSON-serializable)."""
        result = self.send("Runtime.evaluate", {
            "expression":     expression,
            "returnByValue":  True,
            "awaitPromise":   True,
        })
        rv = result.get("result", {})
        if rv.get("type") == "undefined":
            return None
        return rv.get("value")

    def click(self, x: int, y: int) -> None:
        """CSS-pixel click at (x, y) -- mouseDown + mouseUp."""
        for ev in ("mousePressed", "mouseReleased"):
            self.send("Input.dispatchMouseEvent", {
                "type":       ev,
                "x":          int(x),
                "y":          int(y),
                "button":     "left",
                "clickCount": 1,
            })
        time.sleep(0.05)

    def type_into(self, selector: str, text: str) -> None:
        """Set the value of an <input> matching the selector + dispatch input event.

        Simpler than synthetic keystrokes for password fields.
        """
        js = (
            "(function(){"
            "var el = document.querySelector(" + json.dumps(selector) + ");"
            "if (!el) return false;"
            "var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;"
            "setter.call(el, " + json.dumps(text) + ");"
            "el.dispatchEvent(new Event('input',  {bubbles:true}));"
            "el.dispatchEvent(new Event('change', {bubbles:true}));"
            "return true;"
            "})();"
        )
        ok = self.eval_js(js)
        if not ok:
            raise RuntimeError(f"type_into: selector not found: {selector}")

    # ----- domain helpers ------------------------------------------------- #

    def signin(self, username: str, password: str) -> dict:
        """Drive the Desk sign-in modal. Caller must have already navigated.

        Returns the post-signin rosterClient.current() so the caller can
        verify the right account is signed in.
        """
        # Force the sign-in modal open (idempotent if already open).
        self.eval_js("if (typeof openSignInModal === 'function') openSignInModal();")
        # The Desk has these input ids per the user's console log:
        #   signin-username, signin-password
        self.type_into("#signin-username", username)
        self.type_into("#signin-password", password)
        # Submit. The form binds Enter -> submitSignIn(); call directly to skip key sim.
        self.eval_js("if (typeof submitSignIn === 'function') submitSignIn();")
        # Wait for the call to settle (server round trip).
        time.sleep(2.0)
        return self.eval_js(
            "(function(){"
            "  try {"
            "    var c = (window.rosterClient && window.rosterClient.current) ? window.rosterClient.current() : null;"
            "    return c ? { username: c.username, section: c.section, role: c.role || null } : null;"
            "  } catch (_) { return null; }"
            "})();"
        )


# --------------------------------------------------------------------------- #
# CLI                                                                          #
# --------------------------------------------------------------------------- #

def main() -> int:
    p = argparse.ArgumentParser(description="Drive Edge via CDP for visual testing.")
    p.add_argument("--url",      default=DEFAULT_URL, help="Page to navigate to.")
    p.add_argument("--shot",     default=None,        help="Screenshot output path (PNG).")
    p.add_argument("--eval",     default=None,        help="JS expression to eval (must JSON-encode).")
    p.add_argument("--signin",   default=None,        help="Username to sign in as (uses creds file for pw).")
    p.add_argument("--password", default=None,        help="Override password from creds file.")
    p.add_argument("--port",     type=int, default=DEFAULT_PORT)
    p.add_argument("--keep",     action="store_true", help="Don't kill Edge on exit (default: kill).")
    p.add_argument("--fresh",    action="store_true", help="Force a fresh launch even if Edge is already up.")
    args = p.parse_args()

    creds = load_creds()
    cdp   = EdgeCDP(port=args.port)
    try:
        cdp.launch(args.url, reuse=not args.fresh)
        # If Edge was already running, attach_url to force-load the target page.
        cdp.attach_url(args.url)

        if args.signin:
            password = args.password or creds.get("password") or os.environ.get("CC_TEST_PASSWORD")
            if not password:
                print(f"signin: no password available (set --password, "
                      f"CC_TEST_PASSWORD env, or write {CREDS_PATH})", file=sys.stderr)
                return 2
            who = cdp.signin(args.signin, password)
            print(json.dumps({"signed_in_as": who}, indent=2))

        if args.eval:
            value = cdp.eval_js(args.eval)
            print(json.dumps({"eval": value}, indent=2))

        if args.shot:
            shot_path = args.shot
            if not os.path.isabs(shot_path):
                shot_path = os.path.join(SHOT_DIR, shot_path) if not shot_path.startswith(SHOT_DIR) else shot_path
            cdp.screenshot(shot_path)
            print(f"screenshot: {shot_path}")
    finally:
        if not args.keep:
            cdp.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
