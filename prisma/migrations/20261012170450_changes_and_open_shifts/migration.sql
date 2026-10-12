-- CreateEnum
CREATE TYPE "OpenShiftStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ScheduleWeek" ADD COLUMN     "publishedSnapshot" JSONB;

-- CreateTable
CREATE TABLE "OpenShift" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "segments" JSONB NOT NULL,
    "note" TEXT,
    "status" "OpenShiftStatus" NOT NULL DEFAULT 'OPEN',
    "sourceShiftId" TEXT,
    "offeredById" TEXT,
    "filledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "OpenShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenShiftBid" (
    "id" TEXT NOT NULL,
    "openShiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpenShiftBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpenShift_date_status_idx" ON "OpenShift"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpenShiftBid_openShiftId_employeeId_key" ON "OpenShiftBid"("openShiftId", "employeeId");

-- AddForeignKey
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_offeredById_fkey" FOREIGN KEY ("offeredById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_filledById_fkey" FOREIGN KEY ("filledById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenShiftBid" ADD CONSTRAINT "OpenShiftBid_openShiftId_fkey" FOREIGN KEY ("openShiftId") REFERENCES "OpenShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenShiftBid" ADD CONSTRAINT "OpenShiftBid_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
