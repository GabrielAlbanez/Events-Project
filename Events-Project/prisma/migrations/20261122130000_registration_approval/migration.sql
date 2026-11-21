-- Additive: organizer approval for registrations. New enum values and one column with a safe default
-- (requiresApproval = false), so existing events and registrations behave exactly as before.
-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'PENDING';
ALTER TYPE "RegistrationStatus" ADD VALUE 'APPROVED';
ALTER TYPE "RegistrationStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
