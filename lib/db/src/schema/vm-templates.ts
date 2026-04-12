import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const vmTemplatesTable = pgTable("vm_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("qemu"),
  cores: integer("cores"),
  sockets: integer("sockets"),
  memory: integer("memory"),
  diskSize: integer("disk_size"),
  ostype: text("ostype"),
  bridge: text("bridge").default("vmbr0"),
  vlan: integer("vlan"),
  balloon: integer("balloon"),
  storage: text("storage"),
  iso: text("iso"),
  template: text("template"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVmTemplateSchema = createInsertSchema(vmTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVmTemplate = z.infer<typeof insertVmTemplateSchema>;
export type VmTemplate = typeof vmTemplatesTable.$inferSelect;
