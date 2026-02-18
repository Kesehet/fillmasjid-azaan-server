# TODO — Single-VM Production Deployment Plan (FillMasjid Azaan Server)

This checklist turns the scaling/security plan into an actionable production rollout for **one VM running everything** (app, reverse proxy, TURN, monitoring agents, backups, and ops tooling).

> Scope assumption: a single Linux VM (Ubuntu 22.04 LTS) hosting the current Node.js WebRTC relay architecture, hardened for production and observability.

---

## 0) Deployment goals and constraints

- [ ] Keep existing client API contract (`/broadcast`, `/consumer`) stable.
- [ ] Add production-safe operations without introducing multi-node complexity yet.
- [ ] Ensure recovery from process crash, VM reboot, TLS renewal, and disk pressure.
- [ ] Add security controls for internet-exposed signaling + TURN.
- [ ] Add basic analytics endpoint (`/status`) for operational visibility.
- [ ] Design all steps so they can later map to multi-node/SFU architecture.

---

## 1) VM baseline and capacity planning

### 1.1 Choose VM size and OS
- [ ] Select Ubuntu 22.04 LTS image.
- [ ] Start with at least:
  - [ ] 4 vCPU
  - [ ] 8 GB RAM
  - [ ] 120+ GB SSD
  - [ ] 1 static public IPv4
- [ ] Reserve headroom target:
  - [ ] Keep average CPU below 60%
  - [ ] Keep memory below 70%
  - [ ] Keep disk usage below 75%

### 1.2 DNS and hostnames
- [ ] Create/confirm DNS records:
  - [ ] `azaan.fillmasjid.in` → VM public IP (signaling/API)
  - [ ] `turn.fillmasjid.in` → VM public IP (TURN)
- [ ] Set low TTL during rollout (e.g., 300 seconds), increase later.

### 1.3 System packages
- [ ] Update and patch base OS:
  - [ ] `apt update && apt upgrade -y`
  - [ ] enable unattended security updates
- [ ] Install required packages:
  - [ ] `nginx`
  - [ ] `certbot` + `python3-certbot-nginx`
  - [ ] `coturn`
  - [ ] `ufw`
  - [ ] `fail2ban`
  - [ ] `htop`, `jq`, `curl`, `git`
  - [ ] `prometheus-node-exporter`

---

## 2) Network, firewall, and open ports

## 2.1 Cloud security group / provider firewall
- [ ] Allow inbound TCP 22 from admin IPs only (no 0.0.0.0/0).
- [ ] Allow inbound TCP 80 (for ACME + HTTP redirect).
- [ ] Allow inbound TCP 443 (HTTPS signaling/API).
- [ ] Allow inbound UDP 3478 (TURN).
- [ ] Allow inbound TCP 3478 (TURN fallback).
- [ ] Allow inbound UDP 49152-65535 (TURN relay range, can narrow if required).
- [ ] Deny all other inbound traffic.

## 2.2 UFW local firewall policy
- [ ] Set defaults:
  - [ ] `ufw default deny incoming`
  - [ ] `ufw default allow outgoing`
- [ ] Allow only required ports (same as above).
- [ ] Enable UFW and verify rules persist reboot.

## 2.3 Service port map (single VM)
- [ ] Node app internal port: `127.0.0.1:3000` (not public).
- [ ] Nginx public TLS: `0.0.0.0:443`.
- [ ] Nginx HTTP redirect: `0.0.0.0:80`.
- [ ] coturn listener: `0.0.0.0:3478` (UDP/TCP).
- [ ] node_exporter: `127.0.0.1:9100` or restricted allowlist.
- [ ] Optional PM2 web UI: **disabled publicly**.

---

## 3) Runtime and process management (PM2)

## 3.1 Node runtime
- [ ] Install Node.js LTS (20.x).
- [ ] Pin exact version and document in `.nvmrc` or ops docs.
- [ ] Run app as dedicated non-root user (`fillmasjid`).

## 3.2 PM2 setup
- [ ] Install PM2 globally.
- [ ] Create `ecosystem.config.js` with:
  - [ ] `name: "azaan-server"`
  - [ ] `script: "server.js"`
  - [ ] `instances: 1` (single process due in-memory broadcast map)
  - [ ] `exec_mode: "fork"`
  - [ ] `autorestart: true`
  - [ ] `max_memory_restart: "1G"` (tune after load tests)
  - [ ] `env` variables (no secrets hardcoded)
- [ ] Configure PM2 startup at boot (`pm2 startup`, `pm2 save`).
- [ ] Add log rotation (`pm2 install pm2-logrotate`) with size + retention policy.

## 3.3 Graceful restart runbook
- [ ] Define maintenance steps for restart windows.
- [ ] Note expected user impact (single-node means restart drops active sessions).
- [ ] Add “broadcast paused” operational procedure.

---

## 4) Reverse proxy and TLS

## 4.1 Nginx
- [ ] Terminate TLS at Nginx.
- [ ] Proxy pass to Node at `127.0.0.1:3000`.
- [ ] Forward required headers (`X-Forwarded-For`, `X-Forwarded-Proto`).
- [ ] Set request size and timeout limits.
- [ ] Enable gzip for JSON responses.

## 4.2 HTTPS hardening
- [ ] Redirect all HTTP → HTTPS.
- [ ] Enable TLS 1.2/1.3 only.
- [ ] Strong ciphers and session resumption.
- [ ] Add HSTS (after validating certificate stability).
- [ ] Run SSL config check (e.g., SSL Labs target grade A).

## 4.3 Certificate operations
- [ ] Obtain Let’s Encrypt cert with certbot.
- [ ] Enable auto-renew timer.
- [ ] Add post-renew hook to reload Nginx.
- [ ] Verify renewal in staging mode before production.

---

## 5) TURN/STUN (coturn) production setup

## 5.1 coturn config
- [ ] Use long-term auth with rotating credentials (not static `any/any`).
- [ ] Set realm (e.g., `turn.fillmasjid.in`).
- [ ] Configure external/public IP and relay IP correctly.
- [ ] Define relay port range explicitly (e.g., 49152-65535).
- [ ] Enable fingerprints and secure defaults.

## 5.2 TURN security
- [ ] Disable open relay behavior.
- [ ] Restrict peers if possible for expected media flow.
- [ ] Set bandwidth/quota protections.
- [ ] Enable coturn logs and monitor auth failures.

## 5.3 Availability checks
- [ ] Add TURN connectivity test script (UDP and TCP relay).
- [ ] Verify mobile and constrained networks can connect.

---

## 6) Application hardening and API safeguards

## 6.1 Security middleware
- [ ] Add `helmet` for standard HTTP security headers.
- [ ] Tighten CORS origin list (prod and staging only).
- [ ] Add JSON/body size limits.
- [ ] Add request schema validation for `/broadcast` and `/consumer`.

## 6.2 Authentication and authorization
- [ ] Introduce JWT for broadcaster/listener roles.
- [ ] Require broadcaster token to create broadcast.
- [ ] Validate `masjidId` claims in token.
- [ ] Short token TTL + clock-skew handling.

## 6.3 Rate limiting and abuse controls
- [ ] Add per-IP rate limiting on signaling endpoints.
- [ ] Add stricter limits on `/broadcast` creation attempts.
- [ ] Add temporary ban logic for repeated malformed SDP submissions.
- [ ] Log suspicious activity with source IP and user-agent.

## 6.4 Lifecycle and cleanup
- [ ] Add stale broadcast TTL cleanup.
- [ ] Add stale consumer cleanup on disconnect timeout.
- [ ] Track last-seen heartbeat per broadcast.

---

## 7) New operational analytics endpoint (`/status`)

## 7.1 Endpoint scope
- [ ] Add `GET /status` returning JSON (no HTML UI needed).
- [ ] Keep response lightweight for frequent polling.

## 7.2 Proposed response fields
- [ ] `timestamp`
- [ ] `uptimeSeconds`
- [ ] `activeBroadcastCount`
- [ ] `activeBroadcasts` array with:
  - [ ] `masjidId` / `connectionID`
  - [ ] `startedAt`
  - [ ] `listenerCount`
  - [ ] `adminConnectionState`
- [ ] `totalConnectedListeners`
- [ ] `process` object (`rss`, `heapUsed`, `eventLoopLagMs`)

## 7.3 Access control
- [ ] Restrict `/status` with admin token or allowlisted IP.
- [ ] Redact sensitive details (no SDP, no TURN credentials).
- [ ] Return deterministic schema for monitoring integrations.

## 7.4 Optional split
- [ ] `/healthz` → liveness only (`200 ok`).
- [ ] `/readyz` → dependency readiness.
- [ ] `/status` → richer authenticated analytics.

---

## 8) Monitoring and alerting stack (single VM)

## 8.1 Metrics collection
- [ ] App-level Prometheus metrics endpoint (`/metrics`) with:
  - [ ] active broadcasts
  - [ ] active listeners
  - [ ] join attempts/success/failure
  - [ ] average offer/answer latency
  - [ ] peer disconnect reasons
- [ ] System metrics via `node_exporter`.

## 8.2 Monitoring service choices
- [ ] Use PM2 for process supervision/restarts.
- [ ] Use Prometheus for metrics scraping.
- [ ] Use Grafana dashboards for visualization.
- [ ] Use Loki/Promtail or filebeat for logs (optional but recommended).

## 8.3 Alerts (minimum)
- [ ] CPU > 80% for 10 minutes.
- [ ] RAM > 85% for 10 minutes.
- [ ] Disk usage > 80%.
- [ ] PM2 process restart count spikes.
- [ ] `/readyz` non-200 for 2+ minutes.
- [ ] listener join failure ratio > 5% over 5 minutes.

## 8.4 Notification channels
- [ ] Configure alerts to Telegram/Slack/email.
- [ ] Define on-call contact and escalation matrix.

---

## 9) Logging, auditability, and retention

## 9.1 Structured logs
- [ ] Move to JSON logs.
- [ ] Include correlation fields:
  - [ ] `requestId`
  - [ ] `masjidId`
  - [ ] `connectionID`
  - [ ] endpoint name
  - [ ] latency and status code

## 9.2 Audit events
- [ ] Log broadcast start/stop with actor identity.
- [ ] Log token issuance (without sensitive payloads).
- [ ] Log admin access to `/status`.

## 9.3 Retention policy
- [ ] Keep hot logs locally for 7–14 days.
- [ ] Archive compressed logs to object storage for 30–90 days.
- [ ] Set max disk quota for logs to prevent VM exhaustion.

---

## 10) Secrets and configuration management

- [ ] Remove hardcoded TURN credentials from source code.
- [ ] Store secrets in environment variables or secret manager.
- [ ] Keep `.env` out of git; maintain `.env.example` template.
- [ ] Rotate all credentials before production go-live:
  - [ ] TURN secrets
  - [ ] JWT signing keys
  - [ ] SSH keys
- [ ] Add periodic secret rotation calendar (e.g., every 90 days).

---

## 11) Backup and disaster recovery

## 11.1 What to back up
- [ ] Nginx config
- [ ] coturn config
- [ ] PM2 ecosystem + deployment scripts
- [ ] TLS cert metadata (not private keys in insecure locations)
- [ ] app release artifacts and rollback package

## 11.2 Backup schedule
- [ ] Daily config backup snapshot.
- [ ] Weekly full VM snapshot.
- [ ] Keep 4 weekly and 3 monthly restore points.

## 11.3 Restore drill
- [ ] Test full restore to a fresh VM.
- [ ] Measure RTO (target < 60 minutes).
- [ ] Validate DNS cutover and certificate recovery steps.

---

## 12) CI/CD and deployment workflow

## 12.1 Branch/release policy
- [ ] Protect `main` with required checks.
- [ ] Use tagged releases (e.g., `v1.0.0`).

## 12.2 Pre-deploy checks
- [ ] Lint and unit tests must pass.
- [ ] Smoke test endpoints in staging.
- [ ] Run quick load sanity test before production deploy.

## 12.3 Deployment steps (single VM)
- [ ] `git pull` or artifact fetch.
- [ ] `npm ci --omit=dev`.
- [ ] config validation.
- [ ] PM2 reload with health check gate.
- [ ] automatic rollback if health check fails.

## 12.4 Rollback plan
- [ ] Keep previous release directory available.
- [ ] One-command rollback + PM2 restart.
- [ ] Post-rollback incident note template.

---

## 13) Performance and scale validation on one VM

## 13.1 Baseline load tests
- [ ] Simulate incremental listener load (100, 500, 1k).
- [ ] Record CPU, RAM, egress bandwidth, and join latency.
- [ ] Identify max stable listeners with 30% headroom.

## 13.2 Soak tests
- [ ] Run 60–120 minute steady-state tests.
- [ ] Watch for memory leak trends.
- [ ] Ensure no unbounded PM2 restarts.

## 13.3 Exit criteria for “single VM limit reached”
- [ ] CPU saturation during peak azaan events.
- [ ] join success drops below 99%.
- [ ] unacceptable jitter/packet loss.
- [ ] repeated emergency restarts required.
- [ ] If any threshold breached, trigger SFU/multi-node migration plan.

---

## 14) Security hardening checklist (go-live gate)

- [ ] SSH password login disabled.
- [ ] Root SSH login disabled.
- [ ] Key-based SSH only + restricted admin IPs.
- [ ] fail2ban active for SSH and Nginx abuse patterns.
- [ ] Regular OS patch cycle scheduled.
- [ ] Dependency audit (`npm audit`) triaged.
- [ ] TLS private keys readable only by privileged user.
- [ ] Verify no sensitive files committed in repository.

---

## 15) SLOs and production readiness criteria

## 15.1 Initial SLO targets (single VM)
- [ ] Signaling availability: 99.9% monthly.
- [ ] Listener join success: >99%.
- [ ] P95 join time: <2 seconds.
- [ ] Critical incident MTTR: <30 minutes.

## 15.2 Readiness gate (must all be true)
- [ ] Security checklist complete.
- [ ] Monitoring + alerting verified.
- [ ] Backup restore drill completed.
- [ ] Load + soak tests documented.
- [ ] On-call runbook approved.

---

## 16) Operational runbooks to write before launch

- [ ] “Broadcast fails to start” runbook.
- [ ] “High CPU during live azaan” runbook.
- [ ] “TURN connectivity degradation” runbook.
- [ ] “TLS certificate expiry emergency” runbook.
- [ ] “VM disk full” runbook.
- [ ] “Safe reboot / maintenance mode” runbook.

---

## 17) Immediate execution order (next 2 weeks)

## Week 1
- [ ] Harden VM + firewall + SSH.
- [ ] Install Nginx, TLS, PM2, coturn.
- [ ] Move Node app to internal port and proxy through Nginx.
- [ ] Add `/healthz`, `/readyz`, `/status` endpoints.
- [ ] Add basic auth/rate-limit protections.

## Week 2
- [ ] Add metrics + dashboards + alerts.
- [ ] Perform load + soak tests and tune PM2 memory limits.
- [ ] Complete backup/restore drill.
- [ ] Final go-live checklist and rollback rehearsal.

---

## 18) Post-go-live review

- [ ] 24-hour stability review.
- [ ] 7-day incident and performance review.
- [ ] Cost review (bandwidth, VM utilization).
- [ ] Decision point: remain single VM or start SFU migration phase.


---

## Init script automation tasks

- [x] System update and upgrade are automated in `init.sh`.
- [x] Base tools (`git`, `curl`, `jq`, `htop`) are installed in `init.sh`.
- [x] Node.js 20.x setup via NodeSource APT repo is automated in `init.sh`.
- [x] Core infra packages are installed in `init.sh`:
  - [x] `nginx`
  - [x] `certbot`
  - [x] `python3-certbot-nginx`
  - [x] `coturn`
  - [x] `ufw`
  - [x] `fail2ban`
  - [x] `prometheus-node-exporter`
  - [x] `unattended-upgrades`
- [x] UFW baseline policy and required ingress ports are configured in `init.sh`.
- [x] Repository clone/update logic is implemented in `init.sh`.
- [x] Project dependencies are installed (`npm ci` or fallback `npm install`) in `init.sh`.
- [x] PM2 and `pm2-logrotate` are installed/configured in `init.sh`.
- [x] Required services are enabled at boot and started in `init.sh`.
- [x] Post-upgrade service restarts are handled safely in `init.sh`.
- [x] Script-wide error handling is implemented using `set -Eeuo pipefail` + `trap`.
