# engine/devserver.py
from __future__ import annotations
import asyncio
import signal
import socket
import subprocess
import time
from pathlib import Path

from . import progress as p


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("localhost", port)) == 0


async def start_dev_server(cmd: str, port: int, cwd: Path, timeout: int = 60) -> subprocess.Popen:
    p.info("dev-server", f"Starting: {cmd} (port {port})")

    if _port_open(port):
        p.info("dev-server", f"Port {port} already in use — assuming server is running")
        return None

    proc = subprocess.Popen(
        cmd, shell=True, cwd=cwd,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        preexec_fn=lambda: signal.signal(signal.SIGINT, signal.SIG_IGN),
    )

    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if _port_open(port):
            p.success("dev-server", f"Server ready on port {port} ({time.monotonic() - start:.0f}s)")
            return proc
        if proc.poll() is not None:
            p.error("dev-server", f"Server exited with code {proc.returncode}")
            return None
        await asyncio.sleep(1)

    p.error("dev-server", f"Server did not start within {timeout}s")
    proc.terminate()
    return None


def stop_dev_server(proc: subprocess.Popen | None):
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    p.info("dev-server", "Server stopped")
