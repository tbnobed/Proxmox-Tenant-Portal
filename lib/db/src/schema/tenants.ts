import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clustersTable } from "./clusters";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  contactEmail: text("contact_email"),
  status: text("status").notNull().default("active"),
  maxVms: integer("max_vms"),
  maxCpusTotal: integer("max_cpus_total"),
  maxMemoryMbTotal: integer("max_memory_mb_total"),
  maxDiskGbTotal: integer("max_disk_gb_total"),
  maxCpusPerVm: integer("max_cpus_per_vm"),
  maxMemoryMbPerVm: integer("max_memory_mb_per_vm"),
  maxDiskGbPerVm: integer("max_disk_gb_per_vm"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tenantClusterAccessTable = pgTable("tenant_cluster_access", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  clusterId: integer("cluster_id").notNull().references(() => clustersTable.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
