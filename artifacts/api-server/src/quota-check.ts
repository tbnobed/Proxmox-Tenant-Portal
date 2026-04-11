import { db, tenantsTable, vmsTable, tenantClusterAccessTable, tenantVmAccessTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkTenantQuota(
  tenantId: number,
  cpus: number,
  memoryMb: number,
  diskGb: number,
  clusterId?: number
): Promise<QuotaCheckResult> {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) return { allowed: false, reason: "Tenant not found" };

  if (clusterId) {
    const clusterAccess = await db.select().from(tenantClusterAccessTable)
      .where(and(eq(tenantClusterAccessTable.tenantId, tenantId), eq(tenantClusterAccessTable.clusterId, clusterId)));
    if (clusterAccess.length === 0) {
      return { allowed: false, reason: "Tenant does not have access to this cluster" };
    }
  }

  if (tenant.maxCpusPerVm && cpus > tenant.maxCpusPerVm) {
    return { allowed: false, reason: `Exceeds per-VM CPU limit (max ${tenant.maxCpusPerVm} vCPUs)` };
  }
  if (tenant.maxMemoryMbPerVm && memoryMb > tenant.maxMemoryMbPerVm) {
    return { allowed: false, reason: `Exceeds per-VM memory limit (max ${tenant.maxMemoryMbPerVm} MB)` };
  }
  if (tenant.maxDiskGbPerVm && diskGb > tenant.maxDiskGbPerVm) {
    return { allowed: false, reason: `Exceeds per-VM disk limit (max ${tenant.maxDiskGbPerVm} GB)` };
  }

  const directVms = await db.select({
    id: vmsTable.id,
    cpus: vmsTable.cpus,
    memoryMb: vmsTable.memoryMb,
    diskGb: vmsTable.diskGb,
  }).from(vmsTable).where(eq(vmsTable.tenantId, tenantId));

  const accessVmIds = await db.select({ vmId: tenantVmAccessTable.vmId })
    .from(tenantVmAccessTable)
    .where(eq(tenantVmAccessTable.tenantId, tenantId));

  const directVmIds = new Set(directVms.map(v => v.id));
  const extraVmIds = accessVmIds.map(a => a.vmId).filter(vid => !directVmIds.has(vid));

  let accessVms: { cpus: number | null; memoryMb: number | null; diskGb: number | null }[] = [];
  if (extraVmIds.length > 0) {
    accessVms = await db.select({
      cpus: vmsTable.cpus,
      memoryMb: vmsTable.memoryMb,
      diskGb: vmsTable.diskGb,
    }).from(vmsTable).where(inArray(vmsTable.id, extraVmIds));
  }

  const tenantVms = [...directVms, ...accessVms];
  const vmCount = tenantVms.length;
  let usedCpus = 0, usedMem = 0, usedDisk = 0;
  for (const v of tenantVms) {
    usedCpus += v.cpus ?? 0;
    usedMem += v.memoryMb ?? 0;
    usedDisk += v.diskGb ?? 0;
  }

  if (tenant.maxVms && vmCount >= tenant.maxVms) {
    return { allowed: false, reason: `VM limit reached (max ${tenant.maxVms} VMs)` };
  }
  if (tenant.maxCpusTotal && usedCpus + cpus > tenant.maxCpusTotal) {
    return { allowed: false, reason: `Exceeds total CPU quota (used ${usedCpus}/${tenant.maxCpusTotal}, requesting ${cpus})` };
  }
  if (tenant.maxMemoryMbTotal && usedMem + memoryMb > tenant.maxMemoryMbTotal) {
    return { allowed: false, reason: `Exceeds total memory quota (used ${usedMem}/${tenant.maxMemoryMbTotal} MB, requesting ${memoryMb})` };
  }
  if (tenant.maxDiskGbTotal && usedDisk + diskGb > tenant.maxDiskGbTotal) {
    return { allowed: false, reason: `Exceeds total disk quota (used ${usedDisk}/${tenant.maxDiskGbTotal} GB, requesting ${diskGb})` };
  }

  return { allowed: true };
}
