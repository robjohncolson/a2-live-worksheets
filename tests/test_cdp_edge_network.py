"""Unit tests for EdgeCDP Network response-body capture.

These tests use a fake websocket only. They do not launch a browser or touch
live Schoology.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import types
import unittest


TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
CDP_DIR = os.path.join(REPO_ROOT, "tools", "cdp")
sys.path.insert(0, CDP_DIR)

sys.modules.setdefault(
    "websocket",
    types.SimpleNamespace(
        WebSocketTimeoutException=TimeoutError,
        create_connection=None,
    ),
)

from edge import EdgeCDP  # noqa: E402


CREATE_URL = "https://example.com/assignment-creation-complete"


def response_received(request_id: str, url: str, status: int = 200) -> dict:
    return {
        "method": "Network.responseReceived",
        "params": {
            "requestId": request_id,
            "response": {"url": url, "status": status},
        },
    }


def loading_finished(request_id: str) -> dict:
    return {
        "method": "Network.loadingFinished",
        "params": {"requestId": request_id},
    }


class FakeWS:
    def __init__(self, frames=None, bodies=None):
        self.frames = list(frames or [])
        self.bodies = bodies or {}
        self.sent = []
        self.timeout = None

    def settimeout(self, timeout):
        self.timeout = timeout

    def send(self, payload):
        msg = json.loads(payload)
        self.sent.append(msg)
        if msg.get("method") != "Network.getResponseBody":
            return
        request_id = msg["params"]["requestId"]
        body = self.bodies[request_id]
        self.frames.append({"id": msg["id"], "result": body})

    def recv(self):
        if not self.frames:
            raise TimeoutError("fake websocket timeout")
        frame = self.frames.pop(0)
        if isinstance(frame, BaseException):
            raise frame
        return json.dumps(frame)


def make_cdp(frames=None, bodies=None) -> EdgeCDP:
    cdp = EdgeCDP()
    cdp.ws = FakeWS(frames=frames, bodies=bodies)
    return cdp


class TestEdgeNetworkCapture(unittest.TestCase):
    def test_wait_for_response_returns_body(self):
        body = json.dumps({"assignment_nid": "8405518810"})
        cdp = make_cdp(
            frames=[
                response_received("r1", CREATE_URL),
                loading_finished("r1"),
            ],
            bodies={"r1": {"body": body, "base64Encoded": False}},
        )

        captured = cdp.wait_for_response("assignment-creation-complete", timeout=0.2)

        self.assertIsNotNone(captured)
        self.assertEqual(captured["requestId"], "r1")
        self.assertEqual(captured["status"], 200)
        self.assertEqual(json.loads(captured["body"])["assignment_nid"], "8405518810")

    def test_buffered_events_from_send_are_seen(self):
        body = json.dumps({"assignment_nid": "123"})
        cdp = make_cdp(
            frames=[
                response_received("r1", CREATE_URL),
                loading_finished("r1"),
                {"id": 1, "result": {"value": True}},
            ],
            bodies={"r1": {"body": body, "base64Encoded": False}},
        )

        result = cdp.send("Runtime.evaluate", timeout=0.2)
        captured = cdp.wait_for_response("assignment-creation-complete", timeout=0.2)

        self.assertEqual(result, {"value": True})
        self.assertIsNotNone(captured)
        self.assertEqual(json.loads(captured["body"])["assignment_nid"], "123")

    def test_url_miss_times_out(self):
        cdp = make_cdp(frames=[
            response_received("r1", "https://example.com/other"),
            loading_finished("r1"),
        ])

        captured = cdp.wait_for_response("assignment-creation-complete", timeout=0.01)

        self.assertIsNone(captured)
        methods = [msg["method"] for msg in cdp.ws.sent]
        self.assertNotIn("Network.getResponseBody", methods)

    def test_base64_body_decoded(self):
        raw_body = json.dumps({"assignment_nid": "456"})
        encoded = base64.b64encode(raw_body.encode("utf-8")).decode("ascii")
        cdp = make_cdp(
            frames=[
                response_received("r1", CREATE_URL),
                loading_finished("r1"),
            ],
            bodies={"r1": {"body": encoded, "base64Encoded": True}},
        )

        captured = cdp.wait_for_response("assignment-creation-complete", timeout=0.2)

        self.assertIsNotNone(captured)
        self.assertTrue(captured["base64Encoded"])
        self.assertEqual(captured["body"], raw_body)

    def test_concurrent_request_ids_only_fetches_matching_body(self):
        hit_body = json.dumps({"assignment_nid": "789"})
        cdp = make_cdp(
            frames=[
                response_received("miss", "https://example.com/other"),
                response_received("hit", CREATE_URL),
                loading_finished("miss"),
                loading_finished("hit"),
            ],
            bodies={
                "miss": {"body": "wrong", "base64Encoded": False},
                "hit": {"body": hit_body, "base64Encoded": False},
            },
        )

        captured = cdp.wait_for_response("assignment-creation-complete", timeout=0.2)

        self.assertIsNotNone(captured)
        self.assertEqual(captured["requestId"], "hit")
        fetched_ids = [
            msg["params"]["requestId"]
            for msg in cdp.ws.sent
            if msg["method"] == "Network.getResponseBody"
        ]
        self.assertEqual(fetched_ids, ["hit"])

    def test_send_still_returns_only_matching_command_result(self):
        cdp = make_cdp(frames=[
            response_received("r1", CREATE_URL),
            {"id": 1, "result": {"frameId": "abc"}},
        ])

        result = cdp.send("Page.navigate", timeout=0.2)

        self.assertEqual(result, {"frameId": "abc"})
        self.assertEqual(len(cdp._net_events), 1)
        self.assertEqual(cdp._net_events[0]["method"], "Network.responseReceived")


if __name__ == "__main__":
    unittest.main()
