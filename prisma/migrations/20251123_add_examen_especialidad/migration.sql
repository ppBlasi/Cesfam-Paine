-- Tabla de examenes por especialidad
CREATE TABLE "examen_especialidad" (
  "id_examen_especialidad" SERIAL PRIMARY KEY,
  "nombre_examen" TEXT NOT NULL,
  "id_especialidad" INTEGER NOT NULL REFERENCES "Especialidad"("id_especialidad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "especialidad_examen_unico" UNIQUE ("id_especialidad", "nombre_examen")
);
