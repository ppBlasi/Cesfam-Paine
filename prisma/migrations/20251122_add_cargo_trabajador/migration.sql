-- Cargo enum y columna para trabajadores
CREATE TYPE "CargoTrabajador" AS ENUM ('ADMIN', 'RECEPCION', 'MEDICO');

ALTER TABLE "Trabajador"
ADD COLUMN "cargo" "CargoTrabajador" NOT NULL DEFAULT 'RECEPCION';
