-- AlterTable
ALTER TABLE "NotificationChannel" ADD COLUMN     "serviceTypes" JSONB NOT NULL DEFAULT '[]';
