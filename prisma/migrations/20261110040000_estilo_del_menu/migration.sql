-- CreateEnum
CREATE TYPE "MenuStyle" AS ENUM ('NOCTURNO', 'MANTEL', 'MOSTRADOR');

-- AlterTable
ALTER TABLE "business" ADD COLUMN     "menu_style" "MenuStyle" NOT NULL DEFAULT 'MANTEL';

