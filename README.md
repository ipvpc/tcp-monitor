# TCP Monitor

A small Docker stack for watching the latency of hosts, ports, and URLs. Add a target, and the monitor keeps every check so you can search any window of history.

## What it measures

- `db.internal:5432` or `tcp://db.internal:5432` — time to complete a TCP connection
- `https://example.com/health` — time until HTTP response headers, including DNS, connect, and TLS

Checks run on the interval you set (5 seconds to 24 hours). Failures are stored too, with the error or HTTP status.

## Run

```powershell
docker compose up --build
```

Open http://127.0.0.1:8080

The site is bound to localhost and has no login. To publish it on a network, set `WEB_BIND=0.0.0.0` only on a trusted network.

## Search history

The buttons above the page (`15m` through `30d`) choose a window. **Custom** takes an exact start and end. On a target, drag across the chart to narrow that window, or click a point to list just those checks. The history table can also be filtered to up or down results and searched by error text or status code. Browser Back returns to the previous window.

## Targets on this computer

Checks run inside the API container. `localhost` there is the container, not your PC. Use `host.docker.internal` to reach a service on the host, for example `host.docker.internal:3000`.

## Configuration

Copy `.env.example` to `.env` to override the defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `tcpmon` | Database password. The API URL-encodes it. |
| `RETENTION_DAYS` | `90` | Delete checks older than this. `0` keeps them. |
| `PROBE_CONCURRENCY` | `10` | How many checks run at once. |
| `WEB_BIND` / `WEB_PORT` | `127.0.0.1` / `8080` | Where the site is published. |

History is stored in the `pgdata` volume and survives restarts. To wipe it:

```powershell
docker compose down -v
```

## Tests

```powershell
cd api
python -m pip install -r requirements-dev.txt
python -m pytest
```
