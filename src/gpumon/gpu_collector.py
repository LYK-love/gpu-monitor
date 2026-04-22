"""
GPU data collector using pynvml (nvidia-ml-py).
Falls back to parsing nvidia-smi command output if pynvml is not available.
"""

import subprocess
import time
import os
import shutil
from typing import Dict, Any


class GPUCollector:
    """Collects GPU metrics from NVIDIA GPUs."""

    def __init__(self):
        self.nvml = None
        self.handle_count = 0
        self.source = "unavailable"
        self.unavailable_reason = ""
        self._try_pynvml()

    def _try_pynvml(self):
        """Try to initialize pynvml for direct API access."""
        try:
            import pynvml
            pynvml.nvmlInit()
            self.nvml = pynvml
            self.handle_count = pynvml.nvmlDeviceGetCount()
            self.source = "nvml"
            print(f"[GPU] pynvml initialized — {self.handle_count} GPU(s) detected")
        except Exception as e:
            print(f"[GPU] pynvml not available ({e}), falling back to nvidia-smi")
            self.nvml = None
            if shutil.which("nvidia-smi") is None:
                self.source = "unavailable"
                self.unavailable_reason = "nvidia-smi not found"
                print("[GPU] nvidia-smi not found; real GPU data is unavailable")
                return
            try:
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=count", "--format=csv,noheader"],
                    capture_output=True, text=True, timeout=5
                )
                self.handle_count = int(result.stdout.strip())
                self.source = "nvidia-smi"
            except Exception as smi_error:
                self.handle_count = 0
                self.source = "unavailable"
                self.unavailable_reason = f"nvidia-smi detection failed: {smi_error}"
                print(f"[GPU] {self.unavailable_reason}")

    def collect(self) -> Dict[str, Any]:
        """Collect current GPU data."""
        if self.nvml:
            return self._collect_pynvml()
        if self.source == "unavailable":
            return self._empty_snapshot()
        else:
            return self._collect_nvidia_smi()

    def _empty_snapshot(self) -> Dict[str, Any]:
        """Return a valid snapshot when no real GPU backend is available."""
        return {
            "timestamp": int(time.time() * 1000),
            "gpus": [],
            "source": self.source,
            "error": self.unavailable_reason,
        }

    def _collect_pynvml(self) -> Dict[str, Any]:
        """Collect using pynvml API."""
        gpus = []
        for i in range(self.handle_count):
            try:
                handle = self.nvml.nvmlDeviceGetHandleByIndex(i)

                # Name
                name = self.nvml.nvmlDeviceGetName(handle)
                if isinstance(name, bytes):
                    name = name.decode('utf-8')

                # Temperature
                temp = self.nvml.nvmlDeviceGetTemperature(
                    handle, self.nvml.NVML_TEMPERATURE_GPU
                )

                # Power
                power_draw = self.nvml.nvmlDeviceGetPowerUsage(handle) / 1000.0
                try:
                    power_limit = self.nvml.nvmlDeviceGetEnforcedPowerLimit(handle) / 1000.0
                except:
                    power_limit = power_draw * 1.5

                # Utilization
                util = self.nvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = util.gpu

                # Memory
                mem_info = self.nvml.nvmlDeviceGetMemoryInfo(handle)
                mem_used = mem_info.used // (1024 * 1024)  # MB
                mem_total = mem_info.total // (1024 * 1024)  # MB

                # Fan speed
                try:
                    fan_speed = self.nvml.nvmlDeviceGetFanSpeed(handle)
                except:
                    fan_speed = 0

                # Processes
                processes = []
                try:
                    procs = self.nvml.nvmlDeviceGetComputeRunningProcesses(handle)
                    for proc in procs:
                        pid = proc.pid
                        mem = proc.usedGpuMemory // (1024 * 1024) if hasattr(proc, 'usedGpuMemory') else 0
                        # Get process info
                        proc_info = self._get_process_info(pid)
                        processes.append({
                            "pid": pid,
                            "type": "C",
                            "name": proc_info.get("name", "Unknown"),
                            "gpuId": i,
                            "memoryUsage": mem,
                            "user": proc_info.get("user", "unknown"),
                            "uid": proc_info.get("uid", "unknown"),
                            "cmdLine": proc_info.get("cmdline", ""),
                        })
                except Exception as e:
                    pass

                try:
                    procs = self.nvml.nvmlDeviceGetGraphicsRunningProcesses(handle)
                    for proc in procs:
                        pid = proc.pid
                        mem = proc.usedGpuMemory // (1024 * 1024) if hasattr(proc, 'usedGpuMemory') else 0
                        proc_info = self._get_process_info(pid)
                        processes.append({
                            "pid": pid,
                            "type": "G",
                            "name": proc_info.get("name", "Unknown"),
                            "gpuId": i,
                            "memoryUsage": mem,
                            "user": proc_info.get("user", "unknown"),
                            "uid": proc_info.get("uid", "unknown"),
                            "cmdLine": proc_info.get("cmdline", ""),
                        })
                except:
                    pass

                gpus.append({
                    "id": i,
                    "name": name,
                    "temperature": int(temp),
                    "powerDraw": round(power_draw, 1),
                    "powerLimit": round(power_limit, 1),
                    "fanSpeed": int(fan_speed),
                    "utilization": int(gpu_util),
                    "memoryUsed": int(mem_used),
                    "memoryTotal": int(mem_total),
                    "processes": processes,
                })
            except Exception as e:
                print(f"[GPU] Error reading GPU {i}: {e}")

        return {"timestamp": int(time.time() * 1000), "gpus": gpus, "source": self.source}

    def _get_process_info(self, pid: int) -> Dict[str, str]:
        """Get process name, user, and command line by PID."""
        info = {"name": "Unknown", "user": "unknown", "uid": "unknown", "cmdline": ""}
        try:
            # Get process name and cmdline from /proc
            cmdline_path = f"/proc/{pid}/cmdline"
            if os.path.exists(cmdline_path):
                with open(cmdline_path, 'r') as f:
                    cmdline = f.read().replace('\x00', ' ').strip()
                    info["cmdline"] = cmdline
                    info["name"] = os.path.basename(cmdline.split()[0]) if cmdline else "Unknown"

            # Get user
            status_path = f"/proc/{pid}/status"
            if os.path.exists(status_path):
                with open(status_path, 'r') as f:
                    for line in f:
                        if line.startswith("Uid:"):
                            uid = int(line.split()[1])
                            info["uid"] = str(uid)
                            import pwd
                            try:
                                info["user"] = pwd.getpwuid(uid).pw_name
                            except:
                                info["user"] = str(uid)
                            break
        except:
            pass
        return info

    def _collect_nvidia_smi(self) -> Dict[str, Any]:
        """Collect by parsing nvidia-smi command output."""
        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=index,name,temperature.gpu,power.draw,power.limit,utilization.gpu,memory.used,memory.total,fan.speed",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0:
                error = getattr(result, "stderr", "").strip()
                return {
                    "timestamp": int(time.time() * 1000),
                    "gpus": [],
                    "source": self.source,
                    "error": error,
                }

            gpus = []
            for line in result.stdout.strip().split('\n'):
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 9:
                    idx = int(parts[0])
                    gpus.append({
                        "id": idx,
                        "name": parts[1],
                        "temperature": int(float(parts[2])),
                        "powerDraw": round(float(parts[3]), 1),
                        "powerLimit": round(float(parts[4]), 1),
                        "utilization": int(float(parts[5])),
                        "memoryUsed": int(float(parts[6])),
                        "memoryTotal": int(float(parts[7])),
                        "fanSpeed": int(float(parts[8])) if parts[8] else 0,
                        "processes": [],
                    })

            # Get processes
            proc_result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-compute-apps=pid,gpu_index,process_name,used_memory",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True, text=True, timeout=10
            )
            if proc_result.returncode == 0:
                for line in proc_result.stdout.strip().split('\n'):
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 4:
                        pid = int(parts[0])
                        gpu_idx = int(parts[1])
                        name = parts[2]
                        mem = int(float(parts[3]))
                        proc_info = self._get_process_info(pid)
                        for gpu in gpus:
                            if gpu["id"] == gpu_idx:
                                gpu["processes"].append({
                                    "pid": pid,
                                    "type": "C",
                                    "name": name,
                                    "gpuId": gpu_idx,
                                    "memoryUsage": mem,
                                    "user": proc_info.get("user", "unknown"),
                                    "uid": proc_info.get("uid", "unknown"),
                                    "cmdLine": proc_info.get("cmdline", name),
                                })

            return {"timestamp": int(time.time() * 1000), "gpus": gpus, "source": self.source}
        except Exception as e:
            self.source = "unavailable"
            self.unavailable_reason = f"nvidia-smi error: {e}"
            print(f"[GPU] {self.unavailable_reason}")
            return self._empty_snapshot()

    def close(self):
        """Cleanup."""
        if self.nvml:
            try:
                self.nvml.nvmlShutdown()
            except:
                pass
