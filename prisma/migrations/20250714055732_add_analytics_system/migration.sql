-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('MAINTENANCE', 'REPAIR', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpensePayer" AS ENUM ('COMPANY', 'DRIVER');

-- CreateEnum
CREATE TYPE "AnalyticsType" AS ENUM ('DAILY_REVENUE', 'MONTHLY_REVENUE', 'VEHICLE_UTILIZATION', 'DRIVER_KPI', 'FLEET_EFFICIENCY', 'EXPENSE_SUMMARY');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "actualDuration" INTEGER,
ADD COLUMN     "expectedRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "utilizationRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "averageRating" DOUBLE PRECISION DEFAULT 5.0,
ADD COLUMN     "lastActivityDate" TIMESTAMP(3),
ADD COLUMN     "totalContracts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "lastMaintenanceDate" TIMESTAMP(3),
ADD COLUMN     "purchaseDate" TIMESTAMP(3),
ADD COLUMN     "purchasePrice" DOUBLE PRECISION,
ADD COLUMN     "totalMileage" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ExpenseType" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "vehicleId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidBy" "ExpensePayer" NOT NULL DEFAULT 'COMPANY',

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "metricType" "AnalyticsType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "entityId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_companyId_metricType_date_entityId_key" ON "analytics"("companyId", "metricType", "date", "entityId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics" ADD CONSTRAINT "analytics_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
