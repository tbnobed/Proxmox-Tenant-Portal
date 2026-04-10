# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Project: Proxmox Management Portal

A full-stack portal for managing multiple Proxmox clusters, tenants, users, and VM access control. Think OpenStack/vSphere but purpose-built for Proxmox.

### Features
- **Multi-cluster**: Register multiple Proxmox cluster endpoints
- **Tenants**: Organizational units with user and VM assignment
- **Users**: Roles (admin/operator/viewer), tenant membership, per-user VM access
- **VMs**: Cross-cluster VM list, start/stop/reboot actions, filtering
- **VM Console**: VNC console viewer via noVNC (WebSocket proxy to Proxmox VNC)
- **Real Proxmox Integration**: Sync VMs, send start/stop/reboot commands to actual Proxmox API
- **Access Control**: Grant/revoke tenant-VM and user-VM access
- **Dashboard**: Stats, running/stopped counts, recent activity feed

### Proxmox Integration Details
- `proxmox-client.ts`: Handles auth (ticket API), node discovery, VM sync, VM actions, and VNC ticket generation
- Uses `Content-Length` header (not chunked TE) for compatibility with Proxmox API
- Self-signed cert support via `rejectUnauthorized: false`
- `vnc-proxy.ts`: WebSocket proxy that bridges browser noVNC client to Proxmox VNC WebSocket
- Console uses a standalone `vnc.html` page loading noVNC from CDN (avoids bundler compatibility issues)
- Token-based session management for VNC connections (120s TTL)

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
- **Frontend**: React + Vite + TailwindCSS v4 (dark mode first)
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

## API Routes (artifacts/api-server/src/routes/)
- `/clusters` — CRUD + sync from Proxmox
- `/tenants` — CRUD + summary
- `/users` — CRUD
- `/vms` — CRUD + actions (start/stop/reboot via Proxmox API) + console (VNC ticket)
- `/access/tenant-vms` — Grant/revoke
- `/access/user-vms` — Grant/revoke
- `/dashboard/stats` — Aggregated stats
- `/dashboard/activity` — Recent events
- `/vnc` — WebSocket proxy endpoint for VNC connections

## Frontend Pages (artifacts/proxmox-portal/src/pages/)
- `dashboard.tsx` — Overview stats and activity
- `clusters.tsx` / `cluster-detail.tsx` — Cluster management + sync
- `tenants.tsx` / `tenant-detail.tsx` — Tenant management
- `users.tsx` / `user-detail.tsx` — User management
- `vms.tsx` / `vm-detail.tsx` — VM list and detail with actions
- `vm-console.tsx` — VNC console page (embed or new tab)
- `access.tsx` — Access control management

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
