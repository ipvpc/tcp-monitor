# TCP Monitor

A small Docker stack for watching the latency of hosts, ports, and URLs. Add a target, and the monitor keeps every check so you can search any window of history.

## What it measures

- `db.internal:5432` or `tcp://db.internal:5432` — time to complete a TCP connection
- `https://example.com/health` — time until HTTP response headers, including DNS, connect, and TLS

Checks run on the interval you set (5 seconds to 24 hours). Failures are stored too, with the error or HTTP status.

## Run

```powershell
copy .env.example .env
docker compose up --build
```

On this computer, open http://127.0.0.1:8080.

## Remote clients

The site listens on every network interface, port 8080. From another machine, open `http://<this-computer-address>:8080`. Postgres and the API stay on the Docker network; only this port is published.

Set a login in `.env` before other machines can reach the port. Anyone who can open the site can add targets, and checks connect to whatever address you enter.

```
AUTH_USER=monitor
AUTH_PASSWORD=choose-a-password
```

Restart the site after changing them: `docker compose up -d --build web`. The browser asks for that user and password, and the same login covers the API. Leave both values empty only when the port is not reachable from other machines.

If another computer cannot connect, allow inbound TCP 8080. In an Administrator PowerShell window:

```powershell
New-NetFirewallRule -DisplayName "TCP Monitor" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

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
| `WEB_BIND` / `WEB_PORT` | `0.0.0.0` / `8080` | Address and port published on this computer. |
| `AUTH_USER` / `AUTH_PASSWORD` | empty | Login required when both are set. |

History is stored in `./data/postgres` and survives restarts. To wipe it, stop the stack and delete that folder:

```powershell
docker compose down
Remove-Item -Recurse -Force .\data\postgres
```

## Tests

```powershell
cd api
python -m pip install -r requirements-dev.txt
python -m pytest
```
