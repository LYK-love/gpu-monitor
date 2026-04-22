import unittest

from gpumon.__main__ import _build_parser


class CLITests(unittest.TestCase):
    def test_help_lists_public_subcommands(self):
        help_text = _build_parser().format_help()

        self.assertIn("tui", help_text)
        self.assertIn("server", help_text)
        self.assertIn("web", help_text)

    def test_server_subcommand_accepts_host_port_and_interval(self):
        args = _build_parser().parse_args(
            ["server", "--host", "127.0.0.1", "--port", "9000", "--interval", "2.5"]
        )

        self.assertEqual(args.command, "server")
        self.assertEqual(args.host, "127.0.0.1")
        self.assertEqual(args.port, 9000)
        self.assertEqual(args.interval, 2.5)

    def test_web_subcommand_has_separate_backend_and_dashboard_ports(self):
        args = _build_parser().parse_args(
            [
                "web",
                "--host",
                "0.0.0.0",
                "--port",
                "8765",
                "--web-host",
                "127.0.0.1",
                "--web-port",
                "8766",
            ]
        )

        self.assertEqual(args.command, "web")
        self.assertEqual(args.port, 8765)
        self.assertEqual(args.web_host, "127.0.0.1")
        self.assertEqual(args.web_port, 8766)


if __name__ == "__main__":
    unittest.main()
