-- Create availability table for worker schedules
CREATE TABLE "disponibilidad_trabajador" (
  "id_disponibilidad" SERIAL PRIMARY KEY,
  "id_trabajador" INTEGER NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'disponible',
  CONSTRAINT "disponibilidad_trabajador_id_trabajador_fkey"
    FOREIGN KEY ("id_trabajador") REFERENCES "trabajador" ("id_trabajador")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Avoid duplicated slots per worker/date-time
CREATE UNIQUE INDEX "trabajador_fecha_unica"
  ON "disponibilidad_trabajador" ("id_trabajador", "fecha");
