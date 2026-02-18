# FillMasjid Azaan Server — VM Sizing & Placement (Educated Guess)

> This is a **starting estimate** for planning and discussion. Actual sizing should be validated with load tests (concurrent broadcasters, listeners per broadcast, bitrate, TURN relay usage, and regional traffic split).

## Assumptions (for these estimates)

- Workload is primarily **audio-only Azaan streaming** (one-to-many).
- Node API/signaling is lightweight compared to media forwarding and TURN relay.
- TURN usage can spike bandwidth and CPU when many clients cannot connect directly.
- Leave ~30–40% headroom for traffic spikes and failover.

---

## 1 VM options (all-in-one deployment)

Everything runs on one VM:
- API/Signaling (`server.js`)
- Media relay/SFU process (or current relay logic)
- TURN/STUN
- Reverse proxy + TLS termination
- Monitoring agent/log shipper

| Option | VM Size (RAM / vCPU) | Suggested Components on VM | Educated Capacity Guess | How many concurrent users can connect at once (rough) | Notes |
|---|---:|---|---|---:|---|
| 1A | 1 GB / 2 vCPU | API + tiny TURN + proxy | Dev/test or very small pilot (tens to low hundreds of listeners) | 50–150 | High risk of CPU/RAM bottlenecks during peaks |
| 1B | 2 GB / 2 vCPU | API + TURN + relay + proxy | Small production start (low hundreds) | 150–300 | Limited burst tolerance |
| 1C | 4 GB / 4 vCPU | API + TURN + relay + metrics | Small-to-medium (few hundred concurrent listeners) | 300–600 | Good low-cost baseline |
| 1D | 8 GB / 4 vCPU | API + TURN + relay + metrics | Medium load (several hundred, maybe ~1k if optimized audio-only) | 600–1,000 | Watch network egress ceiling |
| 1E | 16 GB / 8 vCPU | Same all-in-one stack | Medium/high single-region load | 1,000–2,000 | Better headroom, still single point of failure |
| 1F | 32 GB / 16 vCPU | Same all-in-one stack | Higher concurrency burst handling | 2,000–4,000 | Operational risk remains: one host failure = outage |

---

## 2 VM options (basic separation)

### Split pattern A (recommended first step)
- **VM-1 (App VM):** API/Signaling + reverse proxy + monitoring
- **VM-2 (Media VM):** TURN + media relay/SFU

| Option | VM-1 (App) | VM-2 (Media/TURN) | Educated Capacity Guess | How many concurrent users can connect at once (rough) | Notes |
|---|---:|---:|---|---:|---|
| 2A | 2 GB / 2 vCPU | 4 GB / 4 vCPU | Better than 1-VM 4/4 setup; suitable early production | 500–900 | Isolates media spikes from API stability |
| 2B | 4 GB / 2 vCPU | 8 GB / 4 vCPU | Mid-scale single-region | 900–1,500 | Good cost/performance step-up |
| 2C | 4 GB / 4 vCPU | 16 GB / 8 vCPU | Medium/high with safer headroom | 1,500–2,500 | TURN/media still a single failure domain |
| 2D | 8 GB / 4 vCPU | 32 GB / 16 vCPU | High single-region burst | 2,500–4,000 | Useful before moving to 3+ VM topology |

### Split pattern B (HA-light)
- **VM-1:** App + relay
- **VM-2:** App + relay (behind LB)
- TURN may still be centralized or external managed service.

This improves availability for app/media processes but requires shared state (e.g., Redis) and careful routing.

---

## 3 VM options (balanced production pattern)

Suggested role split:
- **VM-1:** API/Signaling + reverse proxy
- **VM-2:** Media relay/SFU node A
- **VM-3:** TURN/STUN dedicated

| Option | VM-1 App | VM-2 Media | VM-3 TURN | Educated Capacity Guess | How many concurrent users can connect at once (rough) | Notes |
|---|---:|---:|---:|---|---:|---|
| 3A | 4 GB / 2 vCPU | 8 GB / 4 vCPU | 4 GB / 2 vCPU | Medium production with cleaner isolation | 1,200–2,000 | Better troubleshooting and scaling by role |
| 3B | 4 GB / 4 vCPU | 16 GB / 8 vCPU | 8 GB / 4 vCPU | Medium/high stable operations | 2,000–3,500 | Strong baseline for serious traffic |
| 3C | 8 GB / 4 vCPU | 32 GB / 16 vCPU | 16 GB / 8 vCPU | High single-region target | 3,500–6,000 | Costly but gives robust headroom |

---

## 4+ VM options (recommended for reliability and growth)

Example 4-VM topology:
- **VM-1:** API/Signaling A
- **VM-2:** API/Signaling B (active-active)
- **VM-3:** Media relay/SFU
- **VM-4:** TURN/STUN

Example 5-VM topology:
- 2× API VMs, 2× Media VMs, 1× TURN VM

Example 6-VM topology:
- 2× API VMs, 2× Media VMs, 2× TURN VMs (or region split)

| Topology | Typical Starting Sizes | How many concurrent users can connect at once (rough) | Main Benefit | Watch-outs |
|---|---|---:|---|---|
| 4 VM | API: 4 GB/2 vCPU each; Media: 16 GB/8 vCPU; TURN: 8 GB/4 vCPU | 2,500–4,000 | Basic HA for API + role isolation | Media and TURN still each single-instance |
| 5 VM | API: 4 GB/2 vCPU ×2; Media: 16 GB/8 vCPU ×2; TURN: 8 GB/4 vCPU | 4,000–7,000 | Better scale + media redundancy | Need load balancing and shared signaling state |
| 6 VM | API: 4–8 GB/4 vCPU ×2; Media: 16–32 GB/8–16 vCPU ×2; TURN: 8–16 GB/4–8 vCPU ×2 | 7,000–12,000+ | Strong resilience + capacity growth | Higher ops complexity and observability needs |

---

## Practical recommendation (where to start)

1. Start with **2B** if budget-sensitive production (good first split).
2. Move to **3B** when usage is growing and reliability matters more.
3. Move to **5 VM** when you need media redundancy and safer peak handling.

## What to measure before finalizing

- Peak concurrent listeners per broadcast
- Number of simultaneous broadcasts
- Average/peak bitrate and packet loss
- Percentage of sessions requiring TURN relay
- CPU, memory, and network egress per role
- Join success rate and join latency p95/p99

These metrics will convert this estimate into a precise sizing model.
