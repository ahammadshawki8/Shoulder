"""Run an A2A server on a background thread of the current process.

`shoulder.a2a.demo` gives every sibling their own process, which is the honest
shape for the negotiation. The leak demo and the tests want the opposite: one
server they can start, talk to over real HTTP and the real A2A protocol, inspect,
and stop, without juggling subprocesses.
"""

from __future__ import annotations

import socket
import threading
import time

import uvicorn
from strands.multiagent.a2a import A2AServer


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class BackgroundServer:
    """Context manager: serve an A2AServer until the block exits."""

    def __init__(self, server: A2AServer, host: str, port: int) -> None:
        config = uvicorn.Config(
            server.to_starlette_app(), host=host, port=port, log_level="error"
        )
        self._uvicorn = uvicorn.Server(config)
        self._thread = threading.Thread(target=self._uvicorn.run, daemon=True)
        self.url = f"http://{host}:{port}"

    def __enter__(self) -> "BackgroundServer":
        self._thread.start()
        deadline = time.time() + 20
        while not self._uvicorn.started:
            if time.time() > deadline or not self._thread.is_alive():
                raise RuntimeError(f"A2A server at {self.url} did not start")
            time.sleep(0.05)
        return self

    def __exit__(self, *exc) -> None:
        self._uvicorn.should_exit = True
        self._thread.join(timeout=10)
