import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vmTemplatesTable, usersTable } from "@workspace/db";
import { requireAdmin, requireOperatorOrAdmin, getSessionUser } from "../middleware/auth";

const router: IRouter = Router();

router.get("/vm-templates", requireOperatorOrAdmin, async (_req, res): Promise<void> => {
  const templates = await db
    .select({
      id: vmTemplatesTable.id,
      name: vmTemplatesTable.name,
      description: vmTemplatesTable.description,
      type: vmTemplatesTable.type,
      cores: vmTemplatesTable.cores,
      sockets: vmTemplatesTable.sockets,
      memory: vmTemplatesTable.memory,
      diskSize: vmTemplatesTable.diskSize,
      ostype: vmTemplatesTable.ostype,
      bridge: vmTemplatesTable.bridge,
      vlan: vmTemplatesTable.vlan,
      balloon: vmTemplatesTable.balloon,
      storage: vmTemplatesTable.storage,
      iso: vmTemplatesTable.iso,
      template: vmTemplatesTable.template,
      createdBy: vmTemplatesTable.createdBy,
      createdAt: vmTemplatesTable.createdAt,
      updatedAt: vmTemplatesTable.updatedAt,
      createdByUsername: usersTable.username,
    })
    .from(vmTemplatesTable)
    .leftJoin(usersTable, eq(vmTemplatesTable.createdBy, usersTable.id))
    .orderBy(vmTemplatesTable.name);

  res.json(templates.map(t => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  })));
});

router.get("/vm-templates/:id", requireOperatorOrAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid template id" }); return; }

  const [tmpl] = await db
    .select({
      id: vmTemplatesTable.id,
      name: vmTemplatesTable.name,
      description: vmTemplatesTable.description,
      type: vmTemplatesTable.type,
      cores: vmTemplatesTable.cores,
      sockets: vmTemplatesTable.sockets,
      memory: vmTemplatesTable.memory,
      diskSize: vmTemplatesTable.diskSize,
      ostype: vmTemplatesTable.ostype,
      bridge: vmTemplatesTable.bridge,
      vlan: vmTemplatesTable.vlan,
      balloon: vmTemplatesTable.balloon,
      storage: vmTemplatesTable.storage,
      iso: vmTemplatesTable.iso,
      template: vmTemplatesTable.template,
      createdBy: vmTemplatesTable.createdBy,
      createdAt: vmTemplatesTable.createdAt,
      updatedAt: vmTemplatesTable.updatedAt,
      createdByUsername: usersTable.username,
    })
    .from(vmTemplatesTable)
    .leftJoin(usersTable, eq(vmTemplatesTable.createdBy, usersTable.id))
    .where(eq(vmTemplatesTable.id, id));

  if (!tmpl) { res.status(404).json({ error: "Template not found" }); return; }

  res.json({
    ...tmpl,
    createdAt: tmpl.createdAt.toISOString(),
    updatedAt: tmpl.updatedAt.toISOString(),
  });
});

router.post("/vm-templates", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, type, cores, sockets, memory, diskSize, ostype, bridge, vlan, balloon, storage, iso, template } = req.body;

  if (!name || !type) {
    res.status(400).json({ error: "Name and type are required" });
    return;
  }

  const sessionUser = getSessionUser(req);

  const [tmpl] = await db.insert(vmTemplatesTable).values({
    name,
    description: description ?? null,
    type,
    cores: cores ?? null,
    sockets: sockets ?? null,
    memory: memory ?? null,
    diskSize: diskSize ?? null,
    ostype: ostype ?? null,
    bridge: bridge ?? "vmbr0",
    vlan: vlan ?? null,
    balloon: balloon ?? null,
    storage: storage ?? null,
    iso: iso ?? null,
    template: template ?? null,
    createdBy: sessionUser?.userId ?? null,
  }).returning();

  res.status(201).json({
    ...tmpl,
    createdAt: tmpl.createdAt.toISOString(),
    updatedAt: tmpl.updatedAt.toISOString(),
  });
});

router.patch("/vm-templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid template id" }); return; }

  const { name, description, type, cores, sockets, memory, diskSize, ostype, bridge, vlan, balloon, storage, iso, template } = req.body;

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (type !== undefined) update.type = type;
  if (cores !== undefined) update.cores = cores;
  if (sockets !== undefined) update.sockets = sockets;
  if (memory !== undefined) update.memory = memory;
  if (diskSize !== undefined) update.diskSize = diskSize;
  if (ostype !== undefined) update.ostype = ostype;
  if (bridge !== undefined) update.bridge = bridge;
  if (vlan !== undefined) update.vlan = vlan;
  if (balloon !== undefined) update.balloon = balloon;
  if (storage !== undefined) update.storage = storage;
  if (iso !== undefined) update.iso = iso;
  if (template !== undefined) update.template = template;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [tmpl] = await db.update(vmTemplatesTable).set(update).where(eq(vmTemplatesTable.id, id)).returning();
  if (!tmpl) { res.status(404).json({ error: "Template not found" }); return; }

  res.json({
    ...tmpl,
    createdAt: tmpl.createdAt.toISOString(),
    updatedAt: tmpl.updatedAt.toISOString(),
  });
});

router.delete("/vm-templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid template id" }); return; }

  const [tmpl] = await db.delete(vmTemplatesTable).where(eq(vmTemplatesTable.id, id)).returning();
  if (!tmpl) { res.status(404).json({ error: "Template not found" }); return; }

  res.sendStatus(204);
});

export default router;
