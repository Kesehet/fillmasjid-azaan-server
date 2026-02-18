#!/usr/bin/env bash

# Production bootstrap script for FillMasjid Azaan Server VM.
# This script is idempotent and safe to run multiple times.

set -Eeuo pipefail

LOG_FILE="${LOG_FILE:-/var/log/fillmasjid-init.log}"
PROJECT_DIR_DEFAULT="/opt/fillmasjid-azaan-server"
REPO_URL_DEFAULT="https://github.com/Kesehet/fillmasjid-azaan-server.git"
NODE_MAJOR="${NODE_MAJOR:-20}"
ADMIN_SSH_CIDR="${ADMIN_SSH_CIDR:-}"
PROJECT_DIR="${PROJECT_DIR:-$PROJECT_DIR_DEFAULT}"
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
RUN_AS_USER="${RUN_AS_USER:-fillmasjid}"

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

LAST_STEP="initialization"

on_error() {
  local exit_code=$?
  local line_no=${1:-unknown}
  local command=${BASH_COMMAND:-unknown}
  echo "[ERROR] Step failed: ${LAST_STEP}" >&2
  echo "[ERROR] Exit code: ${exit_code}, line: ${line_no}, command: ${command}" >&2
  echo "[ERROR] See full logs: ${LOG_FILE}" >&2
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "[FATAL] Please run as root: sudo bash init.sh"
    exit 1
  fi
}

run_step() {
  local title="$1"
  shift
  LAST_STEP="$title"
  echo "\n==> ${title}"
  "$@"
  echo "[OK] ${title}"
}

maybe_systemctl_enable_now() {
  local svc="$1"
  if systemctl list-unit-files | awk '{print $1}' | grep -qx "$svc"; then
    systemctl enable --now "$svc"
  else
    echo "[WARN] Service not found, skipping: $svc"
  fi
}

restart_if_active_or_exists() {
  local svc="$1"
  if systemctl list-unit-files | awk '{print $1}' | grep -qx "$svc"; then
    systemctl restart "$svc" || echo "[WARN] Could not restart service: $svc"
  else
    echo "[WARN] Service not present, skipping restart: $svc"
  fi
}

ensure_user() {
  local user="$1"
  if id "$user" >/dev/null 2>&1; then
    echo "User already exists: $user"
  else
    adduser --disabled-password --gecos "" "$user"
    usermod -aG sudo "$user" || true
    echo "Created user: $user"
  fi
}

setup_nodejs_repo() {
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/nodesource.gpg ]]; then
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  fi

  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list

  apt-get update
  apt-get install -y nodejs
}

setup_ufw() {
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing

  if [[ -n "$ADMIN_SSH_CIDR" ]]; then
    ufw allow from "$ADMIN_SSH_CIDR" to any port 22 proto tcp
  else
    echo "[WARN] ADMIN_SSH_CIDR not set; allowing SSH from anywhere."
    ufw allow 22/tcp
  fi

  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 3478/udp
  ufw allow 3478/tcp
  ufw allow 49152:65535/udp

  ufw --force enable
  ufw status verbose
}

setup_repo() {
  if [[ -d "$PROJECT_DIR/.git" ]]; then
    git -C "$PROJECT_DIR" fetch --all --prune
    git -C "$PROJECT_DIR" pull --ff-only origin master || git -C "$PROJECT_DIR" pull --ff-only origin main
  else
    git clone "$REPO_URL" "$PROJECT_DIR"
  fi

  chown -R "$RUN_AS_USER:$RUN_AS_USER" "$PROJECT_DIR"
}

install_node_dependencies() {
  if [[ -f "$PROJECT_DIR/package-lock.json" ]]; then
    sudo -u "$RUN_AS_USER" npm --prefix "$PROJECT_DIR" ci
  elif [[ -f "$PROJECT_DIR/package.json" ]]; then
    sudo -u "$RUN_AS_USER" npm --prefix "$PROJECT_DIR" install
  else
    echo "[WARN] No package.json found in $PROJECT_DIR, skipping npm install"
  fi
}

setup_pm2() {
  npm install -g pm2

  sudo -u "$RUN_AS_USER" pm2 install pm2-logrotate || true
  sudo -u "$RUN_AS_USER" pm2 set pm2-logrotate:max_size 10M || true
  sudo -u "$RUN_AS_USER" pm2 set pm2-logrotate:retain 14 || true

  local startup_cmd
  startup_cmd=$(sudo -u "$RUN_AS_USER" pm2 startup systemd -u "$RUN_AS_USER" --hp "/home/$RUN_AS_USER" | grep -E '^sudo ' || true)
  if [[ -n "$startup_cmd" ]]; then
    eval "$startup_cmd"
  fi

  sudo -u "$RUN_AS_USER" pm2 save || true
}

enable_required_services() {
  maybe_systemctl_enable_now nginx.service
  maybe_systemctl_enable_now coturn.service
  maybe_systemctl_enable_now fail2ban.service
  maybe_systemctl_enable_now prometheus-node-exporter.service
}

restart_known_services() {
  restart_if_active_or_exists dbus.service
  restart_if_active_or_exists getty@tty1.service
  restart_if_active_or_exists networkd-dispatcher.service
  restart_if_active_or_exists systemd-logind.service
  restart_if_active_or_exists unattended-upgrades.service

  if id 1000 >/dev/null 2>&1; then
    restart_if_active_or_exists user@1000.service
  else
    echo "[WARN] user@1000.service does not apply on this machine"
  fi
}

main() {
  require_root

  run_step "APT update" apt-get update
  run_step "APT upgrade" apt-get upgrade -y
  run_step "Install base packages" apt-get install -y \
    git curl jq htop ufw fail2ban nginx certbot python3-certbot-nginx \
    coturn unattended-upgrades prometheus-node-exporter

  run_step "Enable unattended security upgrades" dpkg-reconfigure -f noninteractive unattended-upgrades
  run_step "Create runtime user" ensure_user "$RUN_AS_USER"
  run_step "Configure Node.js ${NODE_MAJOR}.x" setup_nodejs_repo
  run_step "Set up UFW firewall" setup_ufw
  run_step "Clone or update repository" setup_repo
  run_step "Install project npm dependencies" install_node_dependencies
  run_step "Install and configure PM2" setup_pm2

  run_step "Enable required services" enable_required_services
  run_step "Restart known post-upgrade services" restart_known_services

  echo "\nBootstrap completed successfully."
  echo "Project directory: $PROJECT_DIR"
  echo "Logs: $LOG_FILE"
}

main "$@"
