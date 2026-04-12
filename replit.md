# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Project: Proxmox Management Portal

A full-stack portal for managing multiple Proxmox clusters, tenants, users, and VM access control. Think OpenStack/vSphere but purpose-built for Proxmox.

### Features
- **Authentication**: Session-based login/logout with password hashing (crypto.scrypt), auto-seeds default admin on first run
- **RBAC**: Role-based access control — admins see everything; operators/viewers only see VMs granted via user_vm_access or tenant_vm_access. Admin-only routes (cluster CRUD, tenants, users, access control) return 403 for non-admins. Operators can access cluster read/resource endpoints and create VMs. Server-side enforcement: operators' tenantId is forced from session (cannot assign to other tenants), and cluster access is validated against `tenant_cluster_access`. Session revalidates role/tenant from DB on every request.
- **Multi-cluster**: Register multiple Proxmox cluster endpoints
- **Tenants**: Organizational units with user and VM assignment
- **Users**: Roles (admin/operator/viewer), tenant membership, per-user VM access
- **VMs**: Cross-cluster VM list, start/stop/reboot actions, filtering
- **Create VM**: Full creation form for QEMU VMs and LXC containers with ISO/template selection, network bridge picker, storage pool, CPU/memory/disk config, VLAN tags, and auto-start option. Route: `/vms/create`, accessible to admin and operator roles. Operators see only their tenant's allowed clusters; tenant is auto-assigned. Admins see all clusters and a tenant selector dropdown.
- **VM Console**: VNC console viewer via noVNC (WebSocket proxy to Proxmox VNC)
- **Real Proxmox Integration**: Sync VMs, send start/stop/reboot commands to actual Proxmox API. Auto-sync runs every 5 minutes (configurable via `CLUSTER_SYNC_INTERVAL_MS` env var) to keep VM data (status, CPU, memory, disk, IP) up to date. Initial sync fires 10s after server startup. Module: `cluster-auto-sync.ts`
- **Node Status**: Per-cluster expandable node panels showing real-time CPU, RAM, disk, swap, IO delay, KSM, load avg, kernel version, PVE version, boot mode, uptime — fetched live from Proxmox API
- **Access Control**: Grant/revoke tenant-VM and user-VM access
- **Dashboard**: Stats, running/stopped counts, recent activity feed, infrastructure health panel. Non-admin users get a "My VMs Health" panel showing each assigned VM with health dot, status badge, specs (vCPU/RAM/Disk), cluster name, IP address, and clickable links to VM details. Includes attention banner for stopped/paused VMs and running/stopped/other summary strip.
- **Health Monitoring**: Real-time health indicators across dashboard (infrastructure overview with expandable cluster/node details), clusters page (per-node health badge), and VMs page (health dot next to status). Health computed from CPU/RAM/disk thresholds. Non-admin VM health uses status-based computation (running=healthy, paused=warning, stopped=offline). Utility: `lib/health.ts`
- **Email Notifications (SendGrid)**: Sends email alerts to admin users on VM actions (start/stop/reboot), VM creation, user creation, access changes (grant/revoke), and health alerts. Daily health digest scheduler runs on configurable interval. Docker-portable: uses `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` env vars, falls back to Replit connector when available. Notification settings page at `/notifications` (admin only).
- **User Invites**: Admin sends invite by email → user receives link → creates own username/password. 7-day token expiry. Invite dialog on Users page. DB table: `invite_tokens`.
- **Password Reset**: "Forgot your password?" on login → enter email → receive reset link (1h expiry) → set new password. DB table: `password_reset_tokens`. Public routes, no auth required.
- **Tenant Resource Quotas**: Per-VM limits (max CPUs, memory, disk per VM) and total tenant limits (total CPUs, memory, disk, max VM count). Quotas enforced on VM creation (both `/api/vms` and `/api/clusters/:id/create-vm`). Quota management UI on tenant detail page with usage bars and editable limits. DB columns on `tenants` table: `max_vms`, `max_cpus_total`, `max_memory_mb_total`, `max_disk_gb_total`, `max_cpus_per_vm`, `max_memory_mb_per_vm`, `max_disk_gb_per_vm`.
- **Tenant Cluster Access**: Controls which clusters a tenant can create VMs on. DB table: `tenant_cluster_access`. Managed from tenant detail page with add/remove. Enforced during VM creation — if a tenant doesn't have access to the target cluster, creation is blocked. Create-VM page has tenant selector dropdown.
- **Infrastructure Requests**: Users submit firewall rule or proxy host change requests via a form. Admins review and approve/deny with notes. Supports request type (firewall/proxy_host), priority (normal/urgent), protocol, direction, source network, domain, SSL, forward port, and description. Auto-fills requester info and tenant. DB table: `infrastructure_requests`. Route: `/requests`, accessible to all authenticated users. Admin sees all requests; non-admins see only their own.
- **VM Templates**: Reusable VM configuration templates for quick deployment. CRUD operations (create, edit, duplicate, delete) on template cards at `/vm-templates`. Templates store name, description, type (qemu/lxc), cores, sockets, memory, diskSize, ostype, bridge, vlan, balloon, storage, iso, template, and createdBy. "Use Template" button on each card navigates to `/vms/create?templateId=<id>`, where the Create VM page fetches the template and pre-fills all form fields with a banner indicating the applied template. DB table: `vm_templates`. API routes: `vm-templates.ts`. Admin/operator access.
- **VM Snapshots**: Create, list, restore, and delete Proxmox snapshots from the VM detail page. Snapshots panel at bottom of `/vms/:id` shows all snapshots sorted by time with name, description, timestamp, and RAM-state badge. Admins/operators can create snapshots (name+description+optional VM state), rollback to any snapshot, or delete snapshots — with confirmation dialogs. API routes: `GET/POST /vms/:id/snapshots`, `POST /vms/:id/snapshots/:snapname/rollback`, `DELETE /vms/:id/snapshots/:snapname`. Proxmox client functions: `listSnapshots`, `createSnapshot`, `deleteSnapshot`, `rollbackSnapshot`. Snapshot name validation: 1-40 chars, alphanumeric/hyphens/underscores. All actions logged to activity table. Error states shown with retry button.

### Proxmox Integration Details
- `proxmox-client.ts`: Handles auth (ticket API), node discovery, VM sync, VM actions, and VNC ticket generation
- Uses `Content-Length` header (not chunked TE) for compatibility with Proxmox API
- Self-signed cert support via `rejectUnauthorized: false`
- `vnc-proxy.ts`: WebSocket proxy that bridges browser noVNC client to Proxmox VNC WebSocket
- Console uses a standalone `vnc.html` page loading noVNC from CDN (`esm.sh/@novnc/novnc@1.4.0`) — avoids bundler compatibility issues
- Token-based session management for VNC connections (120s TTL)
- VNC auth: Proxmox `vncTicket` is passed to noVNC as the VNC password for the RFB auth challenge
- WebSocket subprotocol `binary` negotiated for proper noVNC communication
- Client message buffering: messages queued until Proxmox WS connection is ready

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS v4, light/dark mode toggle (persists to localStorage), fully mobile-responsive (hamburger menu, slide-out sidebar, overflow-safe layouts)
- **Color palette**: `#53561F` (olive), `#182D0C` (forest), `#E6CAA7` (sand), `#1C1B31` (navy) — defined as Tailwind tokens `olive`, `forest`, `sand`, `navy` in index.css. Dark mode: pure black background. Light mode: warm off-white. Sidebar stays dark forest green in both modes. Theme toggle in header bar (sun/moon icon). Provider: `ThemeProvider` in `hooks/use-theme.tsx`.
- **Routing**: wouter
- **WebSocket**: ws (for VNC proxy)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## DB Schema (lib/db/src/schema/)
- `clusters` — Proxmox cluster connections (host, port, credentials, realm)
- `tenants` — Organizations
- `users` — Portal users with roles
- `vms` — VM records synced from clusters (vmId, node, type, status, specs)
- `tenant_vm_access` — Tenant-VM access grants
- `user_vm_access` — User-VM access grants
- `activity` — Audit/activity log
- `invite_tokens` — Pending user invitations (token, email, role, tenant, expiry)
- `password_reset_tokens` — Password reset requests (token, userId, expiry)

## API Routes (artifacts/api-server/src/routes/)
- `/clusters` — CRUD + sync from Proxmox
- `/tenants` — CRUD + summary
- `/users` — CRUD
- `/vms` — CRUD + actions (start/stop/reboot via Proxmox API) + console (VNC ticket)
- `/access/tenant-vms` — Grant/revoke
- `/access/user-vms` — Grant/revoke
- `/dashboard/stats` — Aggregated stats
- `/dashboard/activity` — Recent events
- `/dashboard/health` — Live infrastructure health (admin only, fetches node statuses from all clusters)
- `/vnc` — WebSocket proxy endpoint for VNC connections
- `/notifications/status` — Email config status (admin only)
- `/notifications/test` — Send test email (admin only)
- `/notifications/digest` — Trigger health digest manually (admin only)
- `/invites` — CRUD invite tokens (admin only)
- `/auth/invite/:token` — Validate + accept invite (public)
- `/auth/forgot-password` — Request password reset (public)
- `/auth/reset-password/:token` — Validate + reset password (public)

## Frontend Pages (artifacts/proxmox-portal/src/pages/)
- `dashboard.tsx` — Overview stats and activity
- `clusters.tsx` / `cluster-detail.tsx` — Cluster management + sync
- `tenants.tsx` / `tenant-detail.tsx` — Tenant management
- `users.tsx` / `user-detail.tsx` — User management
- `vms.tsx` / `vm-detail.tsx` — VM list and detail with actions
- `vm-console.tsx` — VNC console page (embed or new tab)
- `access.tsx` — Access control management
- `notifications.tsx` — Email notification settings and testing (admin only)
- `accept-invite.tsx` — Public invite acceptance page (set username/password)
- `reset-password.tsx` — Public password reset page
- `forgot-password.tsx` — Forgot password form (email entry)

## Docker Deployment

ProxHub can be deployed to any Ubuntu server via Docker.

### Files
- `Dockerfile` — Multi-stage build (deps → build → production). Non-root `proxhub` user. Runs on port 3000.
- `docker-compose.yml` — App + PostgreSQL 16 with health checks, env var passthrough.
- `docker-entrypoint.sh` — Runs `drizzle-kit push --force` to sync DB schema, then starts the Node server.
- `deploy.sh` — Full Ubuntu deployment script: installs Docker, Git, sets up `/opt/proxhub`, auto-generates secrets, builds and starts containers.
- `.env.example` — All configurable environment variables with documentation.
- `.dockerignore` — Keeps node_modules, .git, secrets out of build context.

### Production Architecture
- API server serves the built frontend static files (SPA) in production mode
- SPA fallback excludes `/api/*` routes so API 404s return proper JSON
- Session cookie `secure` flag controlled by `COOKIE_SECURE` env var (set `true` when behind HTTPS/TLS)
- `trust proxy` enabled in production for proper IP/protocol detection behind reverse proxy
- DB schema auto-synced on container start via drizzle-kit push
- Default admin user `admin`/`admin` seeded on first boot (no admin exists)

### Quick Deploy
```bash
scp -r ./* root@your-server:/opt/proxhub/
ssh root@your-server 'cd /opt/proxhub && bash deploy.sh'
```

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
