-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "location_label" TEXT,
ADD COLUMN     "location_lat" DOUBLE PRECISION,
ADD COLUMN     "location_lon" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "location_label" TEXT,
ADD COLUMN     "location_lat" DOUBLE PRECISION,
ADD COLUMN     "location_lon" DOUBLE PRECISION;
