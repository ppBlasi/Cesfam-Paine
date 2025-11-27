-- Tabla de medicamentos por especialidad
CREATE TABLE "medicamento_especialidad" (
  "id_medicamento_especialidad" SERIAL PRIMARY KEY,
  "nombre_medicamento" TEXT NOT NULL,
  "id_especialidad" INTEGER NOT NULL REFERENCES "Especialidad"("id_especialidad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "especialidad_medicamento_unico" UNIQUE ("id_especialidad", "nombre_medicamento")
);
