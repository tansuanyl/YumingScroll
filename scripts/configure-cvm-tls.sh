#!/usr/bin/env bash
set -euo pipefail

primary_domain="${CVM_PRIMARY_DOMAIN:-}"
alternate_domain="${CVM_ALTERNATE_DOMAIN:-}"
web_upstream="${CVM_WEB_UPSTREAM:-http://127.0.0.1:5173}"
api_upstream="${CVM_API_UPSTREAM:-http://127.0.0.1:8787}"
site_name="${CVM_NGINX_SITE_NAME:-ai-comic-workbench}"
challenge_root="${CVM_ACME_CHALLENGE_ROOT:-/var/www/letsencrypt}"
nginx_available="/etc/nginx/sites-available/${site_name}.conf"
nginx_enabled="/etc/nginx/sites-enabled/000-${site_name}.conf"
legacy_nginx_enabled="/etc/nginx/sites-enabled/${site_name}.conf"
cert_live_dir="/etc/letsencrypt/live/${primary_domain}"

if [ -z "$primary_domain" ]; then
  echo "CVM_PRIMARY_DOMAIN is empty; skipping TLS configuration"
  exit 0
fi

domains=("$primary_domain")
if [ -n "$alternate_domain" ] && [ "$alternate_domain" != "$primary_domain" ]; then
  domains+=("$alternate_domain")
fi

domain_args=()
server_names=""
for domain in "${domains[@]}"; do
  domain_args+=("-d" "$domain")
  server_names="${server_names}${server_names:+ }${domain}"
done

conflict_pattern="127\\.0\\.0\\.1:5173|127\\.0\\.0\\.1:8787"
for domain in "${domains[@]}"; do
  escaped_domain="$(printf '%s' "$domain" | sed 's/[][\\.^$*+?{}()|]/\\&/g')"
  conflict_pattern="${conflict_pattern}|${escaped_domain}"
done

reload_nginx() {
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl reload nginx
  else
    sudo service nginx reload
  fi
}

start_nginx() {
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable --now nginx
  else
    sudo service nginx start
  fi
}

write_http_config() {
  sudo tee "$nginx_available" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${server_names};

    client_max_body_size 200m;

    location ^~ /.well-known/acme-challenge/ {
        root ${challenge_root};
        default_type "text/plain";
    }

    location /api/ {
        proxy_pass ${api_upstream};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }

    location / {
        proxy_pass ${web_upstream};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
}
EOF
}

write_https_config() {
  sudo tee "$nginx_available" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${server_names};

    location ^~ /.well-known/acme-challenge/ {
        root ${challenge_root};
        default_type "text/plain";
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${server_names};

    ssl_certificate ${cert_live_dir}/fullchain.pem;
    ssl_certificate_key ${cert_live_dir}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "upgrade-insecure-requests" always;
    add_header X-Content-Type-Options "nosniff" always;

    client_max_body_size 200m;

    location /api/ {
        proxy_pass ${api_upstream};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }

    location / {
        proxy_pass ${web_upstream};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }
}
EOF
}

cert_matches_domains() {
  sudo test -f "${cert_live_dir}/fullchain.pem" || return 1
  sudo openssl x509 -in "${cert_live_dir}/fullchain.pem" -noout -checkend 2592000 >/dev/null || return 1

  local cert_text
  cert_text="$(sudo openssl x509 -in "${cert_live_dir}/fullchain.pem" -noout -text)"
  for domain in "${domains[@]}"; do
    grep -q "DNS:${domain}" <<<"$cert_text" || return 1
  done
}

disable_conflicting_nginx_configs() {
  local stamp
  stamp="$(date +%Y%m%d%H%M%S)"

  for dir in /etc/nginx/conf.d /etc/nginx/sites-enabled; do
    [ -d "$dir" ] || continue

    while IFS= read -r path; do
      [ "$path" = "$nginx_enabled" ] && continue
      [ "$path" = "$legacy_nginx_enabled" ] && continue
      [ "$(readlink -f "$path" 2>/dev/null || true)" = "$nginx_available" ] && continue

      if sudo grep -Eq "$conflict_pattern" "$path" 2>/dev/null; then
        echo "Disabling conflicting nginx config: $path"
        sudo mv "$path" "${path}.disabled-by-yumingscroll-${stamp}"
      fi
    done < <(sudo find "$dir" -maxdepth 1 \( -type f -o -type l \) -name '*.conf' -print)
  done
}

echo "Configuring TLS for ${server_names}"

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot
sudo mkdir -p "$challenge_root"
sudo rm -f "$legacy_nginx_enabled"
sudo ln -sf "$nginx_available" "$nginx_enabled"
disable_conflicting_nginx_configs

write_http_config
sudo nginx -t
start_nginx
reload_nginx

if ! cert_matches_domains; then
  certbot_args=(
    certonly
    --webroot
    -w "$challenge_root"
    --cert-name "$primary_domain"
    --key-type ecdsa
    --agree-tos
    --non-interactive
    --expand
    --keep-until-expiring
    --deploy-hook "systemctl reload nginx || service nginx reload"
    "${domain_args[@]}"
  )

  if [ -n "${LETSENCRYPT_EMAIL:-${ACME_EMAIL:-}}" ]; then
    certbot_args+=(--email "${LETSENCRYPT_EMAIL:-${ACME_EMAIL:-}}")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi

  sudo certbot "${certbot_args[@]}"
fi

write_https_config
sudo nginx -t
reload_nginx

if ! curl -fsS --resolve "${primary_domain}:443:127.0.0.1" "https://${primary_domain}/api/health" >/dev/null; then
  echo "Local TLS health check failed; retrying through public DNS for ${primary_domain}"
  curl -fsS "https://${primary_domain}/api/health" >/dev/null
fi
sudo openssl x509 -in "${cert_live_dir}/fullchain.pem" -noout -subject -issuer -dates

echo "tls-ok"
