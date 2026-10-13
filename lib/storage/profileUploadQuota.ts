import { createHash, randomUUID } from "node:crypto";
import { transact } from "@/lib/community/common";
import { UploadError } from "./profileImages";

const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * minuteMs;
export const profileUploadLimits = { minute: 6, day: 30 } as const;

/** Reserve admission before allocating a file; profile and party uploads share a quota. */
export async function admitProfileUpload(userId: string): Promise<void> {
  const identifier = `profile-upload-rate:${createHash("sha256").update(userId).digest("hex")}`;
  await transact(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
    const now = Date.now();
    await tx.verificationToken.deleteMany({ where: { identifier, expires: { lte: new Date(now) } } });
    const daily = await tx.verificationToken.count({ where: { identifier, expires: { gt: new Date(now) } } });
    const recent = await tx.verificationToken.count({ where: { identifier, expires: { gt: new Date(now + dayMs - minuteMs) } } });
    if (daily >= profileUploadLimits.day || recent >= profileUploadLimits.minute) {
      throw new UploadError(429, "Limite de envio de imagens atingido. Aguarde antes de tentar novamente.");
    }
    await tx.verificationToken.create({ data: { identifier, token: `upload-rate:${randomUUID()}`, expires: new Date(now + dayMs) } });
  });
}
