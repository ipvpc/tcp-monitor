"""Turn a host:port or URL into a stored endpoint."""

import ipaddress
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlsplit

Kind = Literal["tcp", "http", "https"]


class AddressError(ValueError):
    """The address cannot be monitored."""


@dataclass(frozen=True)
class Endpoint:
    kind: Kind
    host: str
    port: int
    path: str

    @property
    def display(self) -> str:
        host = f"[{self.host}]" if ":" in self.host else self.host
        if self.kind == "tcp":
            return f"{host}:{self.port}"
        path = self.path or "/"
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{self.kind}://{host}:{self.port}{path}"


def parse_address(raw: str) -> Endpoint:
    """Parse `db.internal:5432`, `tcp://db:5432`, or an http(s) URL."""

    value = raw.strip()
    if not value or any(ord(char) < 32 for char in value):
        raise AddressError("Enter a host and port, or an http(s) URL.")
    if "://" in value:
        return _parse_url(value)
    return _parse_host_port(value)


def _parse_url(value: str) -> Endpoint:
    parts = urlsplit(value)
    scheme = parts.scheme.lower()
    if scheme not in ("tcp", "http", "https"):
        raise AddressError("Use http://, https://, tcp://, or a host:port address.")
    if parts.username or parts.password:
        raise AddressError("Remove the username and password from the URL before saving it.")
    try:
        hostname = parts.hostname
        port = parts.port
    except ValueError as exc:
        raise AddressError("Port must be between 1 and 65535.") from exc
    if not hostname:
        raise AddressError("URL is missing a host.")
    default_port = {"tcp": None, "http": 80, "https": 443}[scheme]
    if port is None:
        if default_port is None:
            raise AddressError("Enter a host and port, such as db.internal:5432.")
        port = default_port
    host = _normalize_host(hostname)
    _validate_port(port)
    if scheme == "tcp":
        if parts.path not in ("", "/") or parts.query:
            raise AddressError("TCP targets cannot include a path.")
        return Endpoint("tcp", host, port, "")
    path = parts.path or "/"
    if parts.query:
        path = f"{path}?{parts.query}"
    if len(path) > 2048:
        raise AddressError("URL path is too long.")
    return Endpoint(scheme, host, port, path)


def _parse_host_port(value: str) -> Endpoint:
    if "://" in value or "/" in value:
        raise AddressError("Use http:// or https:// for a URL, or host:port for TCP.")
    host, port = _split_host_port(value)
    return Endpoint("tcp", _normalize_host(host), port, "")


def _split_host_port(value: str) -> tuple[str, int]:
    if value.startswith("["):
        host, separator, rest = value[1:].partition("]")
        if separator != "]" or not rest.startswith(":"):
            raise AddressError("Wrap IPv6 addresses in brackets, such as [::1]:5432.")
        return host, _parse_port(rest[1:])
    if value.count(":") > 1:
        raise AddressError("Wrap IPv6 addresses in brackets, such as [2001:db8::1]:443.")
    if ":" not in value:
        raise AddressError("Enter a host and port, such as db.internal:5432.")
    host, port_text = value.rsplit(":", 1)
    return host, _parse_port(port_text)


def _parse_port(value: str) -> int:
    if not value.isdigit():
        raise AddressError("Port must be between 1 and 65535.")
    return _validate_port(int(value))


def _validate_port(port: int) -> int:
    if port < 1 or port > 65535:
        raise AddressError("Port must be between 1 and 65535.")
    return port


def _normalize_host(host: str) -> str:
    text = host.strip()
    if not text or any(char.isspace() for char in text):
        raise AddressError("Host name is not valid.")
    try:
        return ipaddress.ip_address(text).compressed
    except ValueError:
        pass
    name = text.rstrip(".").lower()
    if not name or len(name) > 253 or any(not label or len(label) > 63 for label in name.split(".")):
        raise AddressError("Host name is not valid.")
    try:
        encoded = name.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise AddressError("Host name is not valid.") from exc
    if len(encoded) > 253:
        raise AddressError("Host name is not valid.")
    return encoded
