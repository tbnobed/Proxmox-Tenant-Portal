# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Project: Proxmox Management Portal

A full-stack portal for managing multiple Proxmox clusters, tenants, users, and VM access control. Think OpenStack/vSphere but purpose-built for Proxmox.

### Features
- **Authentication**: Session-based login/logout with password hashing (crypto.scrypt), auto-seeds default admin on first run
- **RBAC**: Role-based access control — admins see everything; operators/viewers only see VMs granted via user_vm_access or tenant_vm_access. Admin-only routes (clusters, tenants, users, access control) return 403 for non-admins. Session revalidates role/tenant from DB on every request.
- **Multi-cluster**: Register multiple Proxmox cluster endpoints
- **Tenants**: Organizational units with user and VM assignment
- **Users**: Roles (admin/operator/viewer), tenant membership, per-user VM access
- **VMs**: Cross-cluster VM list, start/stop/reboot actions, filtering
- **Create VM**: Full creation form for QEMU VMs and LXC containers with ISO/template selection, network bridge picker, storage pool, CPU/memory/disk config, VLAN tags, and auto-start option. Route: `/vms/create`, admin-only.
- **VM Console**: VNC console viewer via noVNC (WebSocket proxy to Proxmox VNC)
- **Real Proxmox Integration**: Sync VMs, send start/stop/reboot commands to actual Proxmox API
- **Node Status**: Per-cluster expandable node panels showing real-time CPU, RAM, disk, swap, IO delay, KSM, load avg, kernel version, PVE version, boot mode, uptime — fetched live from Proxmox API
- **Access Control**: Grant/revoke tenant-VM and user-VM access
- **Dashboard**: Stats, running/stopped counts, recent activity feed, infrastructure health panel
- **Health Monitoring**: Real-time health indicators across dashboard (infrastructure overview with expandable cluster/node details), clusters page (per-node health badge), and VMs page (health dot next to status). Health computed from CPU/RAM/disk thresholds. Utility: `lib/health.ts`
- **Email Notifications (SendGrid)**: Sends email alerts to admin users on VM actions (start/stop/reboot), VM creation, user creation, access changes (grant/revoke), and health alerts. Daily health digest scheduler runs on configurable interval. Docker-portable: uses `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` env vars, falls back to Replit connector when available. Notification settings page at `/notifications` (admin only).
- **User Invites**: Admin sends invite by email → user receives link → creates own username/password. 7-day token expiry. Invite dialog on Users page. DB table: `invite_tokens`.
- **Password Reset**: "Forgot your password?" on login → enter email → receive reset link (1h expiry) → set new password. DB table: `password_reset_tokens`. Public routes, no auth required.

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
- **Frontend**: React + Vite + TailwindCSS v4 (dark mode, black background)
- **Color palette**: `#53561F` (olive), `#182D0C` (forest), `#E6CAA7` (sand), `#1C1B31` (navy) — defined as Tailwind tokens `olive`, `forest`, `sand`, `navy` in index.css. Background is pure black. No other accent colors (no blue/green/purple/cyan/yellow/orange).
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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
