import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from gpumon.gpu_collector import GPUCollector


class GPUCollectorNvidiaSmiTests(unittest.TestCase):
    def _collector_without_init(self):
        collector = GPUCollector.__new__(GPUCollector)
        collector.nvml = None
        collector.handle_count = 0
        collector.source = "nvidia-smi"
        collector.unavailable_reason = ""
        return collector

    def test_collect_nvidia_smi_parses_gpu_rows_and_processes(self):
        collector = self._collector_without_init()

        gpu_stdout = (
            "0, NVIDIA RTX 4090, 63, 221.5, 450.0, 84, 10240, 24576, 58\n"
            "1, NVIDIA RTX A6000, 41, 80.0, 300.0, 12, 512, 49152, 30\n"
        )
        process_stdout = "4242, 0, python, 2048\n"

        def fake_run(args, **kwargs):
            if "--query-gpu=index,name,temperature.gpu,power.draw,power.limit,utilization.gpu,memory.used,memory.total,fan.speed" in args:
                return SimpleNamespace(returncode=0, stdout=gpu_stdout)
            if "--query-compute-apps=pid,gpu_index,process_name,used_memory" in args:
                return SimpleNamespace(returncode=0, stdout=process_stdout)
            raise AssertionError(f"unexpected command: {args}")

        with patch("gpumon.gpu_collector.subprocess.run", side_effect=fake_run):
            with patch.object(
                collector,
                "_get_process_info",
                return_value={"user": "alice", "uid": "1001", "cmdline": "python train.py"},
            ):
                data = collector._collect_nvidia_smi()

        self.assertLessEqual(data["timestamp"], int(time.time() * 1000))
        self.assertEqual(len(data["gpus"]), 2)
        self.assertEqual(data["gpus"][0]["name"], "NVIDIA RTX 4090")
        self.assertEqual(data["gpus"][0]["temperature"], 63)
        self.assertEqual(data["gpus"][0]["memoryTotal"], 24576)
        self.assertEqual(data["gpus"][0]["processes"][0]["pid"], 4242)
        self.assertEqual(data["gpus"][0]["processes"][0]["user"], "alice")
        self.assertEqual(data["gpus"][0]["processes"][0]["uid"], "1001")
        self.assertEqual(data["gpus"][1]["processes"], [])

    def test_collect_nvidia_smi_returns_empty_data_on_command_failure(self):
        collector = self._collector_without_init()

        with patch(
            "gpumon.gpu_collector.subprocess.run",
            return_value=SimpleNamespace(returncode=1, stdout=""),
        ):
            data = collector._collect_nvidia_smi()

        self.assertEqual(data["gpus"], [])


if __name__ == "__main__":
    unittest.main()
