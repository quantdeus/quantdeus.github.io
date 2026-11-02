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


    def test_json_single_secret(self):
        from unittest.mock import patch
        for name in ("login", "username", "email", "QD_MAIL_USER"):
            for secret_key in ("password", "pass", "QD_MAIL_PASSWORD"):
                value = json.dumps({name: "info@quantdeus.ru", secret_key: "test-no-real-password"})
                with self.subTest(name=name, password_field=secret_key), patch.dict(os.environ, {"QD_MAIL_DATA": value}):
                    self.assertEqual(bridge.resolve_credentials(), ("info@quantdeus.ru", "test-no-real-password"))

    def test_key_value_secret(self):
        from unittest.mock import patch
        value = "LOGIN: info@quantdeus.ru\nPASSWORD: example value with : colons"
        with patch.dict(os.environ, {"QD_MAIL_DATA": value}):
            self.assertEqual(bridge.resolve_credentials(), ("info@quantdeus.ru", "example value with : colons"))

    def test_two_line_secret(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {"QD_MAIL_DATA": "info@quantdeus.ru\nvalue:with:colons"}):
            self.assertEqual(bridge.resolve_credentials(), ("info@quantdeus.ru", "value:with:colons"))

    def test_two_line_secret_reverse_order(self):
        from unittest.mock import patch
        test_cases = (
            "fake-pass\\ninfo@quantdeus.ru",
            "password fake-pass\\nlogin info@quantdeus.ru",
            "info@quantdeus.ru\\npassword fake-pass",
        )
        for raw in test_cases:
            raw = raw.replace("\\\\n", "\\n")
            with self.subTest(raw_prefix=raw.startswith("info@")), patch.dict(os.environ, {"QD_MAIL_DATA": raw}):
                self.assertEqual(bridge.resolve_credentials(), ("info@quantdeus.ru", "fake-pass"))

    def test_one_line_colon_secret(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {"QD_MAIL_DATA": "info@quantdeus.ru:abc:test"}):
            self.assertEqual(bridge.resolve_credentials(), ("info@quantdeus.ru", "abc:test"))

    def test_invalid_credentials_are_fail_closed(self):
        from unittest.mock import patch
        cases = ['{"login":"hacker@example.test","password":"shhh"}', '{"username":"info@quantdeus.ru"}', "{invalid"]
        for value in cases:
            with self.subTest(secret=value[:4]), patch.dict(os.environ, {"QD_MAIL_DATA": value}):
                with self.assertRaises(RuntimeError) as caught:
                    bridge.resolve_credentials()
                self.assertNotIn("shhh", str(caught.exception))
                self.assertNotIn(value, str(caught.exception))

    def test_legacy_separate_secret_env(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {"QD_MAIL_DATA": "", "QD_MAIL_USER": "info@quantdeus.ru", "QD_MAIL_PASSWORD": "fake"}):
            self.assertEqual(bridge.resolve_credentials(), ("info@quantdeus.ru", "fake"))

    def test_auth_check_never_selects_or_reads(self):
        from unittest.mock import patch
        class FakeIMAP:
            def __init__(self, *args, **kwargs):
                self.logged_in = False
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def login(self, username, password):
                assert username == "info@quantdeus.ru" and password == "fake"
                self.logged_in = True
            def logout(self):
                assert self.logged_in
            def select(self, *args, **kwargs):
                raise AssertionError("auth-check may not read folders")
        with patch.object(bridge, "resolve_credentials", return_value=("info@quantdeus.ru", "fake")), patch.object(bridge.imaplib, "IMAP4_SSL", FakeIMAP):
            bridge.auth_check()



    def test_smtp_no_send_without_explicit_gate(self):
        from unittest.mock import patch
        with patch.dict(os.environ, {"QD_MAIL_SEND_TEST": "0"}):
            with self.assertRaises(RuntimeError):
                bridge.send_test_email()

    def test_smtp_only_one_message_to_confirmed_owner(self):
        from unittest.mock import patch
        sent = []
        class FakeSMTP:
            def __init__(self, host, port, **kwargs):
                assert host == "smtp.timeweb.ru" and port == 465
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def login(self, username, password):
                assert username == "info@quantdeus.ru" and password == "synthetic"
            def send_message(self, msg):
                sent.append(msg)
        with patch.dict(os.environ, {"QD_MAIL_SEND_TEST": "1"}), \
             patch.object(bridge, "resolve_credentials", return_value=("info@quantdeus.ru", "synthetic")), \
             patch.object(bridge.smtplib, "SMTP_SSL", FakeSMTP):
            bridge.send_test_email()
        self.assertEqual(len(sent), 1)
        self.assertEqual(str(sent[0]["From"]), "info@quantdeus.ru")
        self.assertEqual(str(sent[0]["To"]), "elektron2345@gmail.com")
        self.assertIn("Проверка почты", str(sent[0]["Subject"]))



if __name__ == "__main__":
    unittest.main()
