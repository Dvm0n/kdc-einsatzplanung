-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEAMLEAD', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FULLTIME', 'PARTTIME', 'MINIJOB');

-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('AVAILABLE', 'PREFERRED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'PEER_ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('CHANGE_TIME', 'DAY_OFF', 'SWAP');

-- CreateEnum
CREATE TYPE "AbsenceKind" AS ENUM ('VACATION', 'OFF', 'SICK', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inviteToken" TEXT,
    "inviteExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "contractType" "ContractType" NOT NULL DEFAULT 'PARTTIME',
    "weeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "maxHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "skills" "Skill"[] DEFAULT ARRAY['INBOUND', 'OUTBOUND']::"Skill"[],
    "startDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "serviceLevelTarget" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "serviceLevelSeconds" INTEGER NOT NULL DEFAULT 20,
    "maxOccupancy" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "shrinkage" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "forecastWeeks" INTEGER NOT NULL DEFAULT 8,
    "wishDeadlineWeekday" INTEGER NOT NULL DEFAULT 3,
    "wishDeadlineHour" INTEGER NOT NULL DEFAULT 12,
    "federalState" TEXT NOT NULL DEFAULT 'NW',
    "breakAfter6hMinutes" INTEGER NOT NULL DEFAULT 30,
    "breakAfter9hMinutes" INTEGER NOT NULL DEFAULT 45,
    "minRestHours" INTEGER NOT NULL DEFAULT 11,
    "maxHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHours" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "ServiceHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT true,
    "startMin" INTEGER,
    "endMin" INTEGER,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isPhoneTime" BOOLEAN NOT NULL DEFAULT false,
    "isWorkTime" BOOLEAN NOT NULL DEFAULT true,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleWeek" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "WeekStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSegment" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "ShiftSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekday" INTEGER,
    "date" DATE,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "kind" "AvailabilityKind" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbsenceRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "AbsenceKind" NOT NULL DEFAULT 'VACATION',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "adminComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "requesterId" TEXT NOT NULL,
    "shiftId" TEXT,
    "swapPartnerId" TEXT,
    "proposedDate" DATE,
    "proposedStart" INTEGER,
    "proposedEnd" INTEGER,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "adminComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallHistory" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "offered" INTEGER NOT NULL,
    "handled" INTEGER,
    "ahtSeconds" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CallHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastAdjustment" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "note" TEXT,

    CONSTRAINT "ForecastAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundTarget" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OutboundTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityType_key_key" ON "ActivityType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleWeek_weekStart_key" ON "ScheduleWeek"("weekStart");

-- CreateIndex
CREATE INDEX "Shift_employeeId_date_idx" ON "Shift"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Shift_date_idx" ON "Shift"("date");

-- CreateIndex
CREATE INDEX "Availability_employeeId_idx" ON "Availability"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CallHistory_date_startMin_key" ON "CallHistory"("date", "startMin");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastAdjustment_date_key" ON "ForecastAdjustment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundTarget_weekStart_key" ON "OutboundTarget"("weekStart");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "ScheduleWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSegment" ADD CONSTRAINT "ShiftSegment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSegment" ADD CONSTRAINT "ShiftSegment_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceRequest" ADD CONSTRAINT "AbsenceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_swapPartnerId_fkey" FOREIGN KEY ("swapPartnerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallHistory" ADD CONSTRAINT "CallHistory_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
