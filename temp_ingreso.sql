CREATE TABLE IF NOT EXISTS ingreso_enfermeria (
  id_ingreso SERIAL PRIMARY KEY,
  id_disponibilidad INTEGER NOT NULL UNIQUE REFERENCES disponibilidad_trabajador(id_disponibilidad),
  id_paciente INTEGER NOT NULL REFERENCES paciente(id_paciente),
  altura DOUBLE PRECISION NOT NULL,
  peso DOUBLE PRECISION NOT NULL,
  signos_vitales TEXT NOT NULL,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);
