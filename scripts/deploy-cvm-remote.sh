#!/usr/bin/env bash
set -euo pipefail

cd "$HOME"

remote_dir="$HOME/ai-comic-workbench"
release="${RELEASE_PATH:-$HOME/ai-comic-workbench-release.tar.gz}"
next_dir="$HOME/ai-comic-workbench-next"
env_backup="$HOME/ai-comic-workbench.env.cvm.backup"
lock_file="$HOME/ai-comic-workbench.deploy.lock"

exec 9>"$lock_file"
flock 9

compose() {
  docker compose --project-directory "$remote_dir" --env-file "$remote_dir/.env.cvm" -f "$remote_dir/docker-compose.cvm.yml" "$@"
}

if [ -f "$remote_dir/.env.cvm" ]; then
  cp "$remote_dir/.env.cvm" "$env_backup"
fi

rm -rf "$next_dir"
mkdir -p "$next_dir"
tar -xzf "$release" -C "$next_dir"

if [ -d "$remote_dir" ]; then
  rm -rf "$remote_dir" || sudo rm -rf "$remote_dir"
fi
mv "$next_dir" "$remote_dir"
cd "$remote_dir"

if [ -f "$env_backup" ]; then
  cp "$env_backup" .env.cvm
elif [ -f .env.cvm.example ]; then
  cp .env.cvm.example .env.cvm
else
  echo ".env.cvm is missing and .env.cvm.example was not found" >&2
  exit 1
fi

set_env() {
  local key="$1"
  local value="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  if [ -f .env.cvm ]; then
    grep -v "^$key=" .env.cvm > "$tmp_file" || true
  fi
  printf '%s=%s\n' "$key" "$value" >> "$tmp_file"
  mv "$tmp_file" .env.cvm
}

primary_domain="${CVM_PRIMARY_DOMAIN:-}"
alternate_domain="${CVM_ALTERNATE_DOMAIN:-}"
if [ -n "$primary_domain" ] && [ -z "$alternate_domain" ]; then
  alternate_domain="www.${primary_domain}"
fi
if [ -n "$primary_domain" ]; then
  set_env WEB_ORIGIN "https://$primary_domain"
fi

cd "$HOME"
compose up -d --build --remove-orphans
compose ps

for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8787/api/health; then
    echo
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    echo "API health check failed after $attempt attempts" >&2
    compose logs --tail=120 api web >&2
    exit 1
  fi

  sleep 2
done

if [ -f "$remote_dir/scripts/configure-cvm-tls.sh" ]; then
  chmod +x "$remote_dir/scripts/configure-cvm-tls.sh"
  CVM_PRIMARY_DOMAIN="$primary_domain" \
    CVM_ALTERNATE_DOMAIN="$alternate_domain" \
    "$remote_dir/scripts/configure-cvm-tls.sh"
fi

echo "deploy-ok"
rm -f "$release"
case "$0" in
  "$HOME"/deploy-cvm-remote.sh|"$HOME"/deploy-cvm-remote-*.sh) rm -f "$0" ;;
esac
