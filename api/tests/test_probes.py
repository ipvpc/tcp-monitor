import asyncio
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from tcpmon.normalize import Endpoint
from tcpmon.probes import friendly_error, probe_endpoint, probe_tcp


def test_friendly_error_messages():
    assert friendly_error(TimeoutError()) == "Timed out"
    assert friendly_error(ConnectionRefusedError()) == "Connection refused"
    assert friendly_error(OSError("getaddrinfo failed")) == "Could not resolve host"


async def test_tcp_success_and_refusal():
    async def handle(_reader, writer):
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    sockets = server.sockets
    assert sockets is not None
    port = sockets[0].getsockname()[1]
    try:
        result = await probe_tcp("127.0.0.1", port, 2000)
    finally:
        server.close()
        await server.wait_closed()
    assert result.ok
    assert result.latency_ms is not None
    assert result.latency_ms >= 0

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    closed_port = sock.getsockname()[1]
    sock.close()
    refused = await probe_tcp("127.0.0.1", closed_port, 1000)
    assert refused.ok is False
    assert refused.latency_ms is None
    assert refused.error


async def test_http_success_and_error_status():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            code = 500 if self.path.startswith("/fail") else 200
            body = b"ok"
            self.send_response(code)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format, *_args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = int(server.server_address[1])
    try:
        ok = await probe_endpoint(Endpoint("http", "127.0.0.1", port, "/health"), 2000)
        bad = await probe_endpoint(Endpoint("http", "127.0.0.1", port, "/fail"), 2000)
    finally:
        server.shutdown()
        server.server_close()

    assert ok.ok
    assert ok.status_code == 200
    assert ok.latency_ms is not None
    assert bad.ok is False
    assert bad.status_code == 500
    assert bad.error == "HTTP 500"
    assert bad.latency_ms is not None
