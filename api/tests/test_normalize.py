import pytest

from tcpmon.normalize import AddressError, parse_address


def test_host_port_is_tcp():
    endpoint = parse_address("  db.internal:5432 ")
    assert endpoint.kind == "tcp"
    assert endpoint.host == "db.internal"
    assert endpoint.port == 5432
    assert endpoint.path == ""
    assert endpoint.display == "db.internal:5432"


def test_tcp_scheme_and_url():
    endpoint = parse_address("tcp://cache.internal:6379")
    assert endpoint.kind == "tcp"
    assert endpoint.display == "cache.internal:6379"

    https = parse_address("HTTPS://Example.COM/Health")
    assert https.kind == "https"
    assert https.host == "example.com"
    assert https.port == 443
    assert https.path == "/Health"
    assert https.display == "https://example.com:443/Health"


def test_http_query_and_default_path():
    endpoint = parse_address("http://example.com:8080/a?b=1#section")
    assert endpoint.port == 8080
    assert endpoint.path == "/a?b=1"
    assert endpoint.display == "http://example.com:8080/a?b=1"

    root = parse_address("https://example.com")
    assert root.path == "/"
    assert root.display == "https://example.com:443/"


def test_ipv6():
    tcp = parse_address("[::1]:5432")
    assert tcp.host == "::1"
    assert tcp.port == 5432
    assert tcp.display == "[::1]:5432"

    https = parse_address("https://[2001:db8::1]/health")
    assert https.host == "2001:db8::1"
    assert https.port == 443
    assert https.display == "https://[2001:db8::1]:443/health"


def test_idna_host():
    endpoint = parse_address("https://bücher.example/health")
    assert endpoint.host == "xn--bcher-kva.example"
    assert endpoint.path == "/health"


def test_rejects_bad_addresses():
    bad = [
        "",
        "example.com",
        "example.com:0",
        "example.com:65536",
        "2001:db8::1",
        "ftp://example.com",
        "http://user:secret@example.com/health",
        "tcp://db.internal:5432/status",
        "http://",
    ]
    for value in bad:
        with pytest.raises(AddressError):
            parse_address(value)
