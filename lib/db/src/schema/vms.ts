import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clustersTable } from "./clusters";
import { tenantsTable } from "./tenants";

export const vmsTable = pgTable("vms", {
  id: serial("id").primaryKey(),
  vmId: integer("vm_id").notNull(),
  name: text("name").notNull(),
  node: text("node").notNull(),
  type: text("type").notNull().default("qemu"),
  status: text("status").notNull().default("stopped"),
  cpus: integer("cpus"),
  memoryMb: integer("memory_mb"),
  diskGb: integer("disk_gb"),
  ipAddress: text("ip_address"),
  os: text("os"),
  clusterId: integer("cluster_id").notNull().references(() => clustersTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  tags: text("tags"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVmSchema = createInsertSchema(vmsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVm = z.infer<typeof insertVmSchema>;
export type Vm = typeof vmsTable.$inferSelect;
