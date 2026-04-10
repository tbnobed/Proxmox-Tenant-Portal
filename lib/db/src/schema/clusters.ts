import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clustersTable = pgTable("clusters", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(8006),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  realm: text("realm").notNull().default("pam"),
  status: text("status").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClusterSchema = createInsertSchema(clustersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCluster = z.infer<typeof insertClusterSchema>;
export type Cluster = typeof clustersTable.$inferSelect;
