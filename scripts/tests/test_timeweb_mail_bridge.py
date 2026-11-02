import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "timeweb_mail_bridge.py"
spec = importlib.util.spec_from_file_location("timeweb_mail_bridge", SOURCE)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def msg(body: str, subject: str = "Hello", sender: str = "person@example.test") -> bytes:
    return (f"From: {sender}\nTo: info@quantdeus.ru\nSubject: {subject}\nContent-Type: text/plain; charset=utf-8\n\n{body}").encode()


class BridgeTest(unittest.TestCase):
    def test_business_routed_to_unity(self):
        event = bridge.parse_message(msg("Нужна автоматизация CRM"))
        self.assertEqual(event["category"], "business")
        self.assertEqual(event["assigned_agent"], "unity")
        self.assertFalse(event["external_reply_allowed"])

    def test_media_routes_to_herald(self):
        self.assertEqual(bridge.parse_message(msg("Выступление Ксении", "Концерт"))["assigned_agent"], "herald")

    def test_auto_replies_and_self_sent_rejected(self):
        self.assertIsNone(bridge.parse_message(msg("A", sender="info@quantdeus.ru")))
        self.assertIsNone(bridge.parse_message(b"From: sender@example.test\nAuto-Submitted: auto-replied\n\nHello"))

    def test_large_mail_rejected(self):
        self.assertIsNone(bridge.parse_message(msg("a" * bridge.MAX_MESSAGE_BYTES)))

    def test_private_queue_and_deduplication(self):
        with tempfile.TemporaryDirectory() as d:
            os.chmod(d, 0o700)
            private = bridge.private_directory(d)
            event = bridge.parse_message(msg("Партнерство"))
            self.assertTrue(bridge.enqueue(private, event))
            self.assertFalse(bridge.enqueue(private, event))
            files = list(private.glob("mail-*.json"))
            self.assertEqual(len(files), 1)
            self.assertEqual(os.stat(files[0]).st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(files[0].read_text())["status"], "needs_human_review")

    def test_non_private_queue_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            os.chmod(d, 0o755)
            with self.assertRaises(RuntimeError):
                bridge.private_directory(d)

    def test_no_live_without_explicit_gate(self):
        old = os.environ.pop("QD_MAIL_POLL_ENABLED", None)
        try:
            with self.assertRaises(RuntimeError):
                bridge.poll()
        finally:
            if old is not None:
                os.environ["QD_MAIL_POLL_ENABLED"] = old


if __name__ == "__main__":
    unittest.main()
