import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { createHashedPassword } from "./routes/auth";
import { logger } from "./lib/logger";

export async function seedDefaultAdmin() {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);

  if (existing) return;

  const hashedPassword = await createHashedPassword("admin");

  await db.insert(usersTable).values({
    username: "admin",
    email: "admin@proxmox.local",
    fullName: "Administrator",
    role: "admin",
    passwordHash: hashedPassword,
    status: "active",
  });

  logger.info("Seeded default admin user (username: admin, password: admin)");
}
