#!/bin/sh
set -eu

if [ -n "${AUTH_USER:-}" ] || [ -n "${AUTH_PASSWORD:-}" ]; then
  if [ -z "${AUTH_USER:-}" ] || [ -z "${AUTH_PASSWORD:-}" ]; then
    echo "tcp-monitor: set both AUTH_USER and AUTH_PASSWORD, or leave both empty." >&2
    exit 1
  fi
  case "$AUTH_USER" in
    *:*)
      echo "tcp-monitor: AUTH_USER cannot contain ':'." >&2
      exit 1
      ;;
  esac
  htpasswd -bcB /etc/nginx/htpasswd "$AUTH_USER" "$AUTH_PASSWORD" >/dev/null
  chmod 644 /etc/nginx/htpasswd
  printf '%s\n' 'auth_basic "TCP Monitor";' 'auth_basic_user_file /etc/nginx/htpasswd;' > /etc/nginx/auth.conf
else
  printf '%s\n' '# authentication disabled' > /etc/nginx/auth.conf
fi

exec /docker-entrypoint.sh "$@"
