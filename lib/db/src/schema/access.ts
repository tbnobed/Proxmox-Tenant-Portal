import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { vmsTable } from "./vms";

export const tenantVmAccessTable = pgTable("tenant_vm_access", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  vmId: integer("vm_id").notNull().references(() => vmsTable.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTenantVmAccessSchema = createInsertSchema(tenantVmAccessTable).omit({ id: true, grantedAt: true });
export type InsertTenantVmAccess = z.infer<typeof insertTenantVmAccessSchema>;
export type TenantVmAccess = typeof tenantVmAccessTable.$inferSelect;

export const userVmAccessTable = pgTable("user_vm_access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  vmId: integer("vm_id").notNull().references(() => vmsTable.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserVmAccessSchema = createInsertSchema(userVmAccessTable).omit({ id: true, grantedAt: true });
export type InsertUserVmAccess = z.infer<typeof insertUserVmAccessSchema>;
export type UserVmAccess = typeof userVmAccessTable.$inferSelect;
