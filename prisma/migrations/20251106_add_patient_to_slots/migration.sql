-- Add patient link and notes to availability slots
ALTER TABLE "disponibilidad_trabajador"
ADD COLUMN "id_paciente" INTEGER,
ADD COLUMN "nota" TEXT;

ALTER TABLE "disponibilidad_trabajador"
ADD CONSTRAINT "disponibilidad_trabajador_id_paciente_fkey"
FOREIGN KEY ("id_paciente") REFERENCES "Paciente" ("id_paciente")
ON DELETE SET NULL ON UPDATE CASCADE;
