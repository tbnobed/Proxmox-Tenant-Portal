import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

export const infrastructureRequestsTable = pgTable("infrastructure_requests", {
  id: serial("id").primaryKey(),
  requestType: text("request_type").notNull(),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("normal"),

  vmName: text("vm_name").notNull(),
  vmIpAddress: text("vm_ip_address").notNull(),
  portNumber: text("port_number").notNull(),
  protocol: text("protocol").notNull().default("tcp"),
  clusterName: text("cluster_name").notNull(),
  clusterIp: text("cluster_ip").notNull(),

  direction: text("direction"),
  sourceNetwork: text("source_network"),

  domainName: text("domain_name"),
  sslOption: text("ssl_option"),
  forwardPort: text("forward_port"),

  description: text("description"),

  requestedById: integer("requested_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  requestedByName: text("requested_by_name").notNull(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  tenantName: text("tenant_name"),

  reviewedById: integer("reviewed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedByName: text("reviewed_by_name"),
  adminNotes: text("admin_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInfrastructureRequestSchema = createInsertSchema(infrastructureRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  reviewedById: true,
  reviewedByName: true,
  adminNotes: true,
  reviewedAt: true,
});

export type InsertInfrastructureRequest = z.infer<typeof insertInfrastructureRequestSchema>;
export type InfrastructureRequest = typeof infrastructureRequestsTable.$inferSelect;
