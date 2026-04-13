# Project: Proxmox Management Portal

## Overview

A full-stack portal for managing multiple Proxmox clusters, tenants, users, and VM access control. This project aims to provide a centralized, OpenStack/vSphere-like management experience specifically tailored for Proxmox environments.

Key capabilities include:
- **Comprehensive Proxmox Integration**: Seamlessly syncs VM data, node status, and executes VM actions (start/stop/reboot, snapshot management, ISO ejection) directly with Proxmox APIs.
- **Robust Access Control**: Implements Role-Based Access Control (RBAC) with admin, operator, and viewer roles, tenant isolation, and granular user/tenant-based VM access.
- **Multi-cluster Management**: Supports registration and management of multiple Proxmox clusters from a single interface.
- **Tenant & User Management**: Features organizational units (tenants), user roles, user invitations, and password reset functionalities.
- **VM Lifecycle Management**: Offers VM listing, detailed views, creation forms for QEMU/LXC, bulk actions, and integrated VNC console access.
- **Resource Governance**: Provides tenant-level resource quotas for VMs, CPU, memory, and disk.
- **Operational Efficiency**: Includes infrastructure request workflows, VM templating, and email notifications for critical events and health digests.
- **Monitoring & Dashboarding**: Displays real-time node status, aggregated statistics, activity logs, and health indicators across the infrastructure.

The project is a pnpm workspace monorepo built with TypeScript, designed for scalability and maintainability.

## User Preferences

No specific user preferences were provided in the original document.

## System Architecture

The Proxmox Management Portal is a monorepo application using pnpm workspaces.

### UI/UX Decisions
- The frontend is built with React, Vite, and TailwindCSS v4, ensuring a fully mobile-responsive design with a hamburger menu and slide-out sidebar.
- It supports light and dark modes, with the theme preference persisting in localStorage.
- The color palette utilizes specific shades: `#53561F` (olive), `#182D0C` (forest), `#E6CAA7` (sand), and `#1C1B31` (navy), defined as Tailwind tokens. The sidebar maintains a dark forest green appearance across themes.

### Technical Implementations
- **Monorepo**: Structured as a pnpm workspace with separate packages for different functionalities (e.g., API server, DB, frontend).
- **Authentication**: Session-based with `crypto.scrypt` for password hashing. Seeds a default admin on first run.
- **Authorization (RBAC)**: Role-based (admin, operator, viewer) with server-side enforcement. Access to resources and actions is strictly controlled based on user roles, tenant membership, and explicit access grants (`user_vm_access`, `tenant_vm_access`, `tenant_cluster_access`). Session revalidates role/tenant on every request.
- **Proxmox Integration**: Handled by `proxmox-client.ts` for API interactions (auth, VM sync, actions, VNC tickets) and `vnc-proxy.ts` for WebSocket bridging. Compatibility with Proxmox API includes `Content-Length` header usage and `rejectUnauthorized: false` for self-signed certificates.
- **VNC Console**: Utilizes `noVNC` loaded from a CDN within a standalone `vnc.html` page, with token-based session management and Proxmox `vncTicket` for authentication.
- **VM Sync**: An auto-sync mechanism runs every 5 minutes (configurable) to keep VM data updated, with an initial sync 10 seconds after server startup.
- **Health Monitoring**: Computes health based on CPU/RAM/disk thresholds for nodes and status for VMs, displayed across various dashboards and lists.
- **Email Notifications**: Integrates with SendGrid for various alerts and daily health digests, configurable via environment variables and supporting a notification settings page for admins.
- **VM Creation**: Supports both QEMU VMs and LXC containers, with comprehensive configuration options and enforcement of tenant resource quotas and cluster access.
- **VM Templating**: Allows creation, management, and application of reusable VM configuration templates to pre-fill the VM creation form.
- **Bulk VM Actions**: Enables selecting multiple VMs and performing contextual Start/Stop/Reboot actions with sequential execution and progress indication.
- **VM Console Clipboard**: Paste text from your desktop clipboard into the VM console. "Paste" button reads clipboard and types text as keystrokes. "Paste Panel" opens a side panel for pasting longer text manually. Keyboard shortcut: Ctrl+Shift+V. Characters sent via `rfb.sendKey()` for universal compatibility.
- **VM Media Management**: Provides functionality to eject mounted ISOs from QEMU VMs via the VM detail page.
- **VM Snapshots**: Offers create, list, restore, and delete functionalities for Proxmox snapshots directly from the VM detail page, with logging to the activity table.
- **User Activity**: Tracks `lastLoginAt` on the `users` table and maintains a detailed `user_sessions` history with login/logout times, IP, and user agent.
- **WebSocket Live Updates**: Real-time VM status updates via WebSocket (`/api/ws`). Session-authenticated WebSocket connections with RBAC-filtered data. VM list page shows green "Live" indicator when connected. Status changes from actions (start/stop/reboot) and cluster auto-sync are broadcast instantly. Per-VM metric polling (CPU, memory, network, disk I/O) every 10 seconds for subscribed VMs.
- **Resource Monitoring Graphs**: Recharts-based live charts on VM detail pages showing CPU usage, memory, network I/O, and disk I/O. Historical data from Proxmox RRD API (`/api/vms/:id/rrddata`) with timeframe selector (1H/24H/7D/30D). Live metric points from WebSocket stream appended to charts in real-time during "1H" view.
- **Two-Factor Authentication (2FA)**: TOTP-based 2FA using authenticator apps. Setup with QR code scan or manual key entry. Login flow challenges for 6-digit code when 2FA is enabled. Secrets encrypted at rest (AES-256-CBC with SESSION_SECRET). Disable requires password confirmation. Security settings page at `/security`. Admins can view 2FA status on user list (green badge) and user detail pages, and can disable 2FA for any user via the Edit User dialog (e.g., if a user loses their authenticator). Admins can also **require 2FA** for specific users via the "Require 2FA on next login" checkbox — users with this requirement are prompted with a mandatory QR code setup flow during their next login and cannot access the portal until they complete it.

### Feature Specifications
- **Multi-cluster**: Register multiple Proxmox endpoints.
- **Tenants**: Support organizational units.
- **Users**: Admin, operator, viewer roles, tenant membership, user-specific VM access.
- **VMs**: Cross-cluster listing, start/stop/reboot, full creation form (QEMU/LXC), VNC console.
- **Node Status**: Live CPU, RAM, disk, swap, IO delay, load avg from Proxmox.
- **Access Control**: Granular `tenant_vm_access` and `user_vm_access`.
- **Dashboard**: Stats, activity, infrastructure health, "My VMs Health" for non-admins.
- **User Invites**: Admin-sent email invites with token expiry for self-registration.
- **Password Reset**: Public "Forgot Password" flow with email links and token expiry.
- **Tenant Resource Quotas**: Per-VM and total tenant limits on CPU, memory, disk, and max VMs, enforced during VM creation.
- **Tenant Cluster Access**: Controls which clusters a tenant can create VMs on, enforced during VM creation.
- **Infrastructure Requests**: Users submit requests (firewall, proxy host) for admin review and approval.

### System Design Choices
- **API Framework**: Express 5.
- **Database**: PostgreSQL with Drizzle ORM for schema management and interaction.
- **Validation**: Zod for schema validation.
- **API Codegen**: Orval is used to generate API hooks and Zod schemas from an OpenAPI specification.
- **Build Tool**: esbuild for bundling.
- **Frontend Routing**: wouter.
- **WebSocket**: `ws` library for VNC proxy.
- **Production Architecture**: The API server serves the built frontend static files (SPA), with SPA fallback configured to exclude API routes. Session cookies are secured based on `COOKIE_SECURE` env var, and `trust proxy` is enabled. DB schema is auto-synced on container start.

## External Dependencies

- **Database**: PostgreSQL (containerized via `docker-compose.yml`)
- **Email Service**: SendGrid (API key and sender email configured via environment variables)
- **VNC Client Library**: noVNC (loaded from `esm.sh/@novnc/novnc@1.4.0` CDN)
- **Proxmox API**: Direct integration with Proxmox VE API (via `proxmox-client.ts`)
- **Docker**: For deployment and containerization (`Dockerfile`, `docker-compose.yml`)
- **Git**: Used in deployment scripts.