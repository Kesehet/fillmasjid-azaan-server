# FillMasjid Azaan Relay — Scalability Plan

## 1) Current architecture constraints

From the current `server.js`:

- A single Node.js process keeps all live broadcasts in in-memory state (`Broadcasts` object).
- Every listener creates a server-side `RTCPeerConnection` (`wrtc`), so the relay process handles all media fan-out itself.
- There is no shared signaling/state layer across instances.
- The server is pinned to a single TLS endpoint and static TURN config.

This design works for small deployments but has hard limits for mass scale (CPU, memory, and single-process fault domain).

---

## 2) Target architecture (mass-scale)

Use a **control-plane + media-plane** split:

1. **Signaling/API layer (stateless Node.js)**
   - Handles room creation, auth, offer/answer exchange, metrics API.
   - Scales horizontally behind load balancer.
   - Uses Redis/Postgres for shared state.

2. **Media SFU layer (purpose-built WebRTC server)**
   - Replace Node `wrtc` fan-out with an SFU (LiveKit, mediasoup, Janus, Jitsi Videobridge, Pion-based SFU).
   - One broadcaster sends one upstream audio track.
   - SFU forwards to thousands of listeners efficiently.

3. **TURN/STUN edge layer**
   - Deploy multiple coturn nodes in regions.
   - Use short-lived credentials (REST API) instead of static usernames.

4. **Global ingress**
   - Geo-DNS / anycast / cloud load balancing routes users to nearest region.
   - Region-local SFU clusters reduce latency.

5. **Observability + autoscaling**
   - Metrics for concurrent listeners, packet loss, jitter, CPU, memory, and egress bitrate.
   - HPA/autoscaling based on media-node load and listener count.

---

## 3) Scaling strategy by phases

### Phase 0: Stabilize current single-node relay (immediate)

- Add health endpoints (`/healthz`, `/readyz`).
- Add structured logging with broadcast IDs.
- Add rate limits and basic auth validation (prevent abuse).
- Add cleanup TTL for stale consumers/broadcasts.
- Add metrics (Prometheus): active broadcasts, active listeners, peer failures.

### Phase 1: Stateless signaling + shared state

- Move signaling metadata to Redis:
  - `broadcast:<id>:owner`
  - `broadcast:<id>:listeners`
  - heartbeat timestamps.
- Keep Node instances stateless so multiple replicas can serve requests.
- Add sticky sessions only if absolutely needed during migration.

### Phase 2: Introduce SFU for media fan-out

- Keep Node as signaling/auth facade.
- Delegate media transport to SFU cluster.
- Model = **1 speaker (imam) → N passive listeners**.
- Force audio-only profiles for listeners to reduce cost:
  - mono
  - low/medium bitrate ladders
  - Opus tuned for speech

### Phase 3: Multi-region + resilience

- Active-active regional deployment.
- Region-scoped rooms (listeners join nearest region).
- Optional regional failover for broadcaster.
- Durable control data in managed DB + Redis replication.

---

## 4) Key design choices for Azaan use case

Azaan is ideal for optimization because it is one-to-many and speech-focused:

- **Audio-only mode** by default.
- **Single publisher policy** per broadcast room.
- **Listener receive-only role** (no upstream media/candidates beyond necessity).
- **Aggressive silence detection / DTX** to reduce bandwidth.
- **Opus speech settings** (e.g., 16–24 kbps baseline, tune by network quality).
- **Fallback stream** (HLS/LL-HLS internet radio style) when WebRTC fails on constrained networks.

---

## 5) Capacity model (rule of thumb)

For each active broadcast:

- Broadcaster uplink to SFU: ~24 kbps + overhead.
- SFU downlink total: `listeners × (20–32 kbps + overhead)`.

Example rough sizing:

- 10,000 listeners at ~28 kbps payload ≈ 280 Mbps payload + protocol overhead.
- Plan for 1.4–2x headroom to handle bursts, retransmissions, and variance.

So target at least ~500 Mbps+ egress capacity for that single large event, spread across nodes/regions.

---

## 6) Security and abuse controls

- JWT-based room tokens with role claims (`broadcaster`, `listener`).
- Short token TTL and nonce to prevent replay.
- TURN credentials minted per session (ephemeral).
- Rate limiting by IP/user/masjid ID.
- WAF + bot protection on signaling endpoints.
- Audit logs for broadcast start/stop, token issuance, and moderator actions.

---

## 7) Reliability checklist

- Graceful drain on deploy (no hard drop of active rooms).
- Circuit breakers and timeouts for Redis/DB dependencies.
- Chaos tests: kill media node during live Azaan and verify recovery behavior.
- SLOs:
  - 99.95% signaling API availability
  - >99% listener join success
  - P95 join time < 2s
  - low packet-loss/jitter thresholds.

---

## 8) Suggested implementation stack

- **Node.js API**: Express/Fastify + TypeScript.
- **SFU**: LiveKit (fastest path operationally) or mediasoup (more custom control).
- **State/cache**: Redis.
- **Persistent store**: Postgres.
- **Infra**: Kubernetes (regional clusters), managed LB, autoscaling.
- **Monitoring**: Prometheus + Grafana + Loki + OpenTelemetry.

---

## 9) 30/60/90-day execution plan

### First 30 days
- Instrument current server (metrics/logging/health).
- Add auth tokens + rate limiting.
- Introduce Redis-backed room metadata.
- Run controlled load tests (1k/5k listener targets).

### 60 days
- Deploy SFU in one region.
- Migrate a subset of traffic (canary).
- Add dashboards + alerting + autoscaling policies.
- Implement WebRTC→HLS fallback path.

### 90 days
- Multi-region rollout.
- Failover drills and chaos testing.
- Cost/performance optimization by codec profile and routing.
- Formal SLO reporting and on-call runbooks.

---


## 10) Testing scripts and validation pipeline

To test this end-to-end properly, add a dedicated `scripts/testing/` folder and wire these into `package.json` scripts.

### A) API smoke tests (signaling health)

- `scripts/testing/smoke-health.sh`
  - Validate `/healthz`, `/readyz`, and expected HTTP codes.
- `scripts/testing/smoke-broadcast.sh`
  - Simulate broadcast creation request.
- `scripts/testing/smoke-consumer.sh`
  - Simulate consumer join flow and response schema checks.

Suggested commands:

- `npm run test:smoke`
- `npm run test:smoke:broadcast`
- `npm run test:smoke:consumer`

### B) Load tests (listener scale)

Use k6/Artillery to validate signaling and join behavior under load:

- `scripts/testing/load-signaling.k6.js`
  - Ramp from 100 → 1,000 → 5,000 virtual listener joins.
  - Track p95/p99 latency, error rate, and join success.
- `scripts/testing/load-auth.k6.js`
  - Token issuance and auth path stress tests.

Suggested commands:

- `npm run test:load:1k`
- `npm run test:load:5k`

### C) Media quality tests (WebRTC/SFU)

- `scripts/testing/media-probe.js`
  - Join as listener, capture RTCP stats (jitter, packet loss, RTT, bitrate).
- `scripts/testing/media-soak.js`
  - 60–120 minute soak for stability and memory leak detection.

Success gates:

- Join success > 99%
- P95 join time < 2 seconds
- Packet loss < 2% for good networks
- No unbounded memory growth during soak

Suggested commands:

- `npm run test:media:probe`
- `npm run test:media:soak`

### D) Resilience/chaos tests

- `scripts/testing/chaos-node-drain.sh`
  - Drain one SFU node and verify listeners reconnect or migrate.
- `scripts/testing/chaos-redis-failure.sh`
  - Simulate Redis blip and verify graceful degradation.

Suggested commands:

- `npm run test:chaos:drain`
- `npm run test:chaos:redis`

### E) CI/CD test stages

Run these stages on every merge to `main`:

1. **Lint + unit** (`npm run lint && npm test`)
2. **Smoke** (`npm run test:smoke`)
3. **Load (nightly)** (`npm run test:load:1k`, scheduled)
4. **Soak + chaos (weekly)** (`npm run test:media:soak` + chaos scripts)

Release gate rule:

- Block production rollout if smoke fails, join success drops below SLO, or media quality regressions exceed threshold.

---

## 11) Practical next step for this repository

Given this repository currently relays media directly in Node, the most impactful next step is:

1. Keep existing endpoints (`/broadcast`, `/consumer`) as compatibility facade.
2. Replace direct `wrtc` peer fan-out logic with SFU session creation/join APIs.
3. Move `Broadcasts` state to Redis.
4. Add metrics and health probes before production scale testing.

This gives incremental migration without breaking client flows while removing the core scalability bottleneck.
