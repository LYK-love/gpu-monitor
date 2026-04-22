"""
GPU Monitor TUI using blessed.
An htop-style terminal interface for real-time GPU monitoring.
"""

import sys
import time
import threading
from collections.abc import Sequence
from typing import List, Dict, Any, Optional
from blessed import Terminal
from .gpu_collector import GPUCollector


class GPUMonitorTUI:
    """Terminal User Interface for GPU monitoring."""

    def __init__(self):
        self.term = Terminal()
        self.collector = GPUCollector()
        self.data: Dict[str, Any] = {"gpus": []}
        self.running = False
        self.selected_gpu = 0
        self.sort_by = "memory"  # memory, pid, name
        self.sort_desc = True
        self.scroll_offset = 0
        self.max_scroll = 0

    def _color_for_temp(self, temp: int) -> str:
        if temp > 75:
            return self.term.red
        elif temp > 50:
            return self.term.yellow
        return self.term.cyan

    def _color_for_util(self, util: int) -> str:
        if util > 85:
            return self.term.red
        elif util > 60:
            return self.term.yellow
        return self.term.cyan

    def _bar(self, width: int, percent: int, color: str) -> str:
        """Draw a progress bar."""
        filled = int(width * percent / 100)
        empty = width - filled
        bar = "█" * filled + "░" * empty
        return f"{color}{bar}{self.term.normal}"

    def _draw_header(self, y: int) -> int:
        """Draw the top header bar."""
        header = f" GPU MONITOR {self.term.cyan}▸{self.term.normal} {len(self.data['gpus'])} GPU(s) detected "
        status = " LIVE " if self.data['gpus'] else " WAITING "

        print(self.term.move_xy(0, y) + self.term.on_darkslategray + self.term.bold + header + self.term.normal, end="")
        # Right-aligned status
        status_x = self.term.width - len(status) - 2
        status_color = self.term.on_green + self.term.black if self.data['gpus'] else self.term.on_yellow + self.term.black
        print(self.term.move_xy(status_x, y) + status_color + status + self.term.normal, end="")
        return y + 1

    def _draw_gpu_card(self, y: int, gpu: Dict[str, Any], is_selected: bool) -> int:
        """Draw a single GPU overview card."""
        w = self.term.width - 2
        border = "╔" + "═" * w + "╗" if not is_selected else "┏" + "━" * w + "┓"

        if is_selected:
            print(self.term.move_xy(0, y) + self.term.cyan + border + self.term.normal, end="")
        else:
            print(self.term.move_xy(0, y) + self.term.bold + self.term.white + border + self.term.normal, end="")
        y += 1

        # GPU name and ID
        name_line = f"║ GPU {gpu['id']}: {gpu['name'][:50]}"
        temp_color = self._color_for_temp(gpu['temperature'])
        util_color = self._color_for_util(gpu['utilization'])
        metrics = f" {temp_color}{gpu['temperature']}°C{self.term.normal} │ {util_color}{gpu['utilization']}%{self.term.normal} "

        padding = w - len(name_line) - len(metrics) + 2  # +2 for escape codes approx
        padding = max(1, padding)
        line = name_line + " " * padding + metrics + "║"
        print(self.term.move_xy(0, y) + line, end="")
        y += 1

        # Temperature bar
        temp_bar = self._bar(min(30, w - 20), min(100, int(gpu['temperature'] / 100 * 100)), temp_color)
        temp_line = f"║  Temp: {temp_bar} {temp_color}{gpu['temperature']}°C / 100°C{self.term.normal}"
        padding = w - len(f"  Temp: {'█' * 30} {gpu['temperature']}°C / 100°C") + 2
        padding = max(1, padding)
        line = temp_line + " " * padding + "║"
        print(self.term.move_xy(0, y) + line, end="")
        y += 1

        # Utilization bar
        util_bar = self._bar(min(30, w - 20), gpu['utilization'], util_color)
        util_line = f"║  Util: {util_bar} {util_color}{gpu['utilization']}%{self.term.normal}"
        padding = w - len(f"  Util: {'█' * 30} {gpu['utilization']}%") + 2
        padding = max(1, padding)
        line = util_line + " " * padding + "║"
        print(self.term.move_xy(0, y) + line, end="")
        y += 1

        # Memory bar
        mem_pct = int(gpu['memoryUsed'] / gpu['memoryTotal'] * 100) if gpu['memoryTotal'] > 0 else 0
        mem_color = self.term.magenta if mem_pct < 80 else self.term.yellow if mem_pct < 95 else self.term.red
        mem_bar = self._bar(min(30, w - 20), mem_pct, mem_color)
        mem_line = f"║  VRAM: {mem_bar} {mem_color}{(gpu['memoryUsed']/1024):.1f} / {(gpu['memoryTotal']/1024):.0f} GB{self.term.normal}"
        padding = w - len(f"  VRAM: {'█' * 30} {(gpu['memoryUsed']/1024):.1f} / {(gpu['memoryTotal']/1024):.0f} GB") + 2
        padding = max(1, padding)
        line = mem_line + " " * padding + "║"
        print(self.term.move_xy(0, y) + line, end="")
        y += 1

        # Power and fan
        power_pct = int(gpu['powerDraw'] / gpu['powerLimit'] * 100) if gpu['powerLimit'] > 0 else 0
        power_color = self.term.yellow if power_pct > 80 else self.term.white
        info_line = f"║  Power: {power_color}{gpu['powerDraw']:.0f}W / {gpu['powerLimit']:.0f}W ({power_pct}%){self.term.normal}  │  Fan: {self.term.cyan}{gpu['fanSpeed']}%{self.term.normal}  │  Processes: {len(gpu['processes'])}"
        padding = w - len(f"  Power: {gpu['powerDraw']:.0f}W / {gpu['powerLimit']:.0f}W ({power_pct}%)  │  Fan: {gpu['fanSpeed']}%  │  Processes: {len(gpu['processes'])}") + 2
        padding = max(1, padding)
        line = info_line + " " * padding + "║"
        print(self.term.move_xy(0, y) + line, end="")
        y += 1

        # Bottom border
        bottom = "╚" + "═" * w + "╝" if not is_selected else "┗" + "━" * w + "┛"
        if is_selected:
            print(self.term.move_xy(0, y) + self.term.cyan + bottom + self.term.normal, end="")
        else:
            print(self.term.move_xy(0, y) + self.term.bold + self.term.white + bottom + self.term.normal, end="")
        return y + 1

    def _draw_process_table(self, y: int) -> int:
        """Draw the process table."""
        gpus = self.data.get("gpus", [])
        if not gpus or self.selected_gpu >= len(gpus):
            return y

        gpu = gpus[self.selected_gpu]
        processes = gpu.get("processes", [])

        # Sort processes
        if self.sort_by == "memory":
            processes = sorted(processes, key=lambda p: p["memoryUsage"], reverse=self.sort_desc)
        elif self.sort_by == "pid":
            processes = sorted(processes, key=lambda p: p["pid"], reverse=self.sort_desc)
        elif self.sort_by == "name":
            processes = sorted(processes, key=lambda p: p["name"], reverse=self.sort_desc)

        w = self.term.width - 2
        table_title = f"  PROCESSES ON GPU {self.selected_gpu} ({len(processes)} total) — Sort: {self.sort_by} "
        if len(table_title) > w:
            table_title = table_title[:w]

        print(self.term.move_xy(0, y) + self.term.bold + self.term.on_darkslategray + table_title + " " * (w - len(table_title) + 2) + self.term.normal, end="")
        y += 1

        # Column headers
        col_w = min(16, max(10, (w - 30) // 3))
        headers = f"  {'PID':>8}  │ {'Type':^4} │ {'GPU':>3} │ {'User':^{col_w}} │ {'Process':^{col_w*2}} │ {'VRAM':>10}"
        print(self.term.move_xy(0, y) + self.term.bold + self.term.white + headers + self.term.normal, end="")
        y += 1
        print(self.term.move_xy(0, y) + "─" * min(self.term.width, len(headers) + 10), end="")
        y += 1

        # Process rows
        available_rows = self.term.height - y - 2
        if available_rows < 3:
            print(self.term.move_xy(0, y) + self.term.yellow + "  (Terminal too small to show processes)" + self.term.normal, end="")
            return y + 1

        self.max_scroll = max(0, len(processes) - available_rows)
        self.scroll_offset = min(self.scroll_offset, self.max_scroll)

        visible = processes[self.scroll_offset : self.scroll_offset + available_rows]

        for i, proc in enumerate(visible):
            bg = self.term.on_darkslategray if i % 2 == 0 else ""
            mem_str = f"{proc['memoryUsage']/1024:.1f} GB" if proc['memoryUsage'] >= 1024 else f"{proc['memoryUsage']} MB"
            mem_color = self.term.red if proc['memoryUsage'] > 4096 else self.term.yellow if proc['memoryUsage'] > 1024 else self.term.cyan
            type_color = self.term.cyan if proc['type'] == 'C' else self.term.magenta
            name = proc['name'][:col_w*2-2] if len(proc['name']) > col_w*2-2 else proc['name']
            user = proc['user'][:col_w-1] if len(proc['user']) > col_w-1 else proc['user']

            row = f"  {proc['pid']:>8}  │ {type_color}{proc['type']:^4}{self.term.normal} │ {proc['gpuId']:>3} │ {user:^{col_w}} │ {name:<{col_w*2}} │ {mem_color}{mem_str:>10}{self.term.normal}"
            if len(row) > self.term.width:
                row = row[:self.term.width-1]
            print(self.term.move_xy(0, y) + bg + row + self.term.normal, end="")
            y += 1

        if not processes:
            print(self.term.move_xy(0, y) + self.term.yellow + "  No active processes" + self.term.normal, end="")
            y += 1

        return y

    def _draw_help(self, y: int) -> int:
        """Draw the help/status bar at the bottom."""
        help_text = " q:Quit │ 0-9:Select GPU │ m:Sort Mem │ p:Sort PID │ n:Sort Name │ ↑↓:Scroll "
        if y < self.term.height:
            bg = self.term.on_darkslategray
            padding = self.term.width - len(help_text)
            line = help_text + " " * max(0, padding)
            print(self.term.move_xy(0, self.term.height - 1) + bg + line[:self.term.width] + self.term.normal, end="")
        return y

    def _draw(self):
        """Main draw loop — render the entire UI."""
        print(self.term.clear, end="")

        y = 0
        y = self._draw_header(y)
        y += 1  # spacing

        # Draw GPU cards
        gpus = self.data.get("gpus", [])
        for i, gpu in enumerate(gpus):
            if y + 7 < self.term.height - 5:
                y = self._draw_gpu_card(y, gpu, i == self.selected_gpu)
                y += 1  # spacing between cards

        # Draw process table
        if gpus:
            y += 1
            y = self._draw_process_table(y)

        self._draw_help(y)
        sys.stdout.flush()

    def _collector_thread(self):
        """Background thread collecting GPU data."""
        while self.running:
            try:
                self.data = self.collector.collect()
            except Exception as e:
                print(f"[TUI] Collector error: {e}")
            time.sleep(1.0)

    def _input_handler(self):
        """Handle keyboard input."""
        with self.term.cbreak():
            while self.running:
                key = self.term.inkey(timeout=0.5)
                if not key:
                    continue

                if key.lower() == 'q':
                    self.running = False
                    break
                elif key.isdigit():
                    idx = int(key)
                    gpus = self.data.get("gpus", [])
                    if idx < len(gpus):
                        self.selected_gpu = idx
                elif key.name == "KEY_UP":
                    self.scroll_offset = max(0, self.scroll_offset - 1)
                elif key.name == "KEY_DOWN":
                    self.scroll_offset = min(self.max_scroll, self.scroll_offset + 1)
                elif key.name == "KEY_LEFT":
                    self.selected_gpu = max(0, self.selected_gpu - 1)
                elif key.name == "KEY_RIGHT":
                    gpus = self.data.get("gpus", [])
                    self.selected_gpu = min(len(gpus) - 1, self.selected_gpu + 1)
                elif key.lower() == 'm':
                    if self.sort_by == "memory":
                        self.sort_desc = not self.sort_desc
                    else:
                        self.sort_by = "memory"
                        self.sort_desc = True
                elif key.lower() == 'p':
                    if self.sort_by == "pid":
                        self.sort_desc = not self.sort_desc
                    else:
                        self.sort_by = "pid"
                        self.sort_desc = False
                elif key.lower() == 'n':
                    if self.sort_by == "name":
                        self.sort_desc = not self.sort_desc
                    else:
                        self.sort_by = "name"
                        self.sort_desc = False

    def run(self):
        """Run the TUI."""
        self.running = True

        # Start collector thread
        collector = threading.Thread(target=self._collector_thread, daemon=True)
        collector.start()

        # Start input handler thread
        input_thread = threading.Thread(target=self._input_handler, daemon=True)
        input_thread.start()

        print(self.term.clear + self.term.hide_cursor, end="")

        try:
            while self.running:
                self._draw()
                time.sleep(0.2)
        except KeyboardInterrupt:
            pass
        finally:
            self.running = False
            self.collector.close()
            print(self.term.normal + self.term.show_cursor + self.term.clear, end="")
            print("GPU Monitor TUI exited.")


def main(argv: Sequence[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="GPU Monitor TUI")
    parser.parse_args(argv)

    tui = GPUMonitorTUI()
    tui.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
