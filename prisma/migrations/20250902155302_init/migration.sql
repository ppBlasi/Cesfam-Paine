-- CreateTable
CREATE TABLE "public"."area_examen" (
    "id_area_examen" SERIAL NOT NULL,
    "nombre_area" TEXT NOT NULL,

    CONSTRAINT "area_examen_pkey" PRIMARY KEY ("id_area_examen")
);

-- CreateTable
CREATE TABLE "public"."Examen" (
    "id_examen" SERIAL NOT NULL,
    "nombre_examen" TEXT NOT NULL,
    "id_area_examen" INTEGER NOT NULL,

    CONSTRAINT "Examen_pkey" PRIMARY KEY ("id_examen")
);

-- CreateTable
CREATE TABLE "public"."DetalleExamen" (
    "id_detalle_examen" SERIAL NOT NULL,
    "detalle" TEXT NOT NULL,
    "id_ficha_paciente" INTEGER NOT NULL,
    "id_examen" INTEGER NOT NULL,

    CONSTRAINT "DetalleExamen_pkey" PRIMARY KEY ("id_detalle_examen")
);

-- CreateTable
CREATE TABLE "public"."DetalleConsulta" (
    "id_detalle_consulta" SERIAL NOT NULL,
    "resumen_consulta" TEXT NOT NULL,
    "id_reserva" INTEGER NOT NULL,
    "id_estado_reserva" INTEGER NOT NULL,
    "id_ficha_paciente" INTEGER NOT NULL,

    CONSTRAINT "DetalleConsulta_pkey" PRIMARY KEY ("id_detalle_consulta")
);

-- CreateTable
CREATE TABLE "public"."FichaPaciente" (
    "id_ficha_paciente" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "FichaPaciente_pkey" PRIMARY KEY ("id_ficha_paciente")
);

-- CreateTable
CREATE TABLE "public"."Patologia" (
    "id_patologia" SERIAL NOT NULL,
    "nombre_patologia" TEXT NOT NULL,
    "id_ficha_paciente" INTEGER NOT NULL,

    CONSTRAINT "Patologia_pkey" PRIMARY KEY ("id_patologia")
);

-- CreateTable
CREATE TABLE "public"."CategoriaMedicamento" (
    "id_categoria_medicamento" SERIAL NOT NULL,
    "nombre_categoria" TEXT NOT NULL,

    CONSTRAINT "CategoriaMedicamento_pkey" PRIMARY KEY ("id_categoria_medicamento")
);

-- CreateTable
CREATE TABLE "public"."Medicamento" (
    "id_medicamento" SERIAL NOT NULL,
    "nombre_medicamento" TEXT NOT NULL,
    "id_ficha_paciente" INTEGER NOT NULL,
    "id_categoria_medicamento" INTEGER NOT NULL,

    CONSTRAINT "Medicamento_pkey" PRIMARY KEY ("id_medicamento")
);

-- CreateTable
CREATE TABLE "public"."EstadoReserva" (
    "id_estado_reserva" SERIAL NOT NULL,
    "nombre_estado" TEXT NOT NULL,

    CONSTRAINT "EstadoReserva_pkey" PRIMARY KEY ("id_estado_reserva")
);

-- CreateTable
CREATE TABLE "public"."Reserva" (
    "id_reserva" SERIAL NOT NULL,
    "fecha_reserva" TEXT NOT NULL,
    "id_estado_reserva" INTEGER NOT NULL,
    "id_fecha_hora" INTEGER NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id_reserva")
);

-- CreateTable
CREATE TABLE "public"."FechaHora" (
    "id_fecha_hora" SERIAL NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FechaHora_pkey" PRIMARY KEY ("id_fecha_hora")
);

-- CreateTable
CREATE TABLE "public"."Paciente" (
    "id_paciente" SERIAL NOT NULL,
    "primer_nombre_paciente" TEXT NOT NULL,
    "segundo_nombre_paciente" TEXT,
    "apellido_p_paciente" TEXT NOT NULL,
    "apellido_m_paciente" TEXT NOT NULL,
    "rut_paciente" TEXT NOT NULL,
    "celular_paciente" TEXT NOT NULL,
    "correo_paciente" TEXT NOT NULL,
    "id_reserva" INTEGER,
    "id_fecha_hora" INTEGER,
    "id_empresa" INTEGER,
    "id_urgencia" INTEGER,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("id_paciente")
);

-- CreateTable
CREATE TABLE "public"."Trabajador" (
    "id_trabajador" SERIAL NOT NULL,
    "primer_nombre_trabajador" TEXT NOT NULL,
    "segundo_nombre_trabajador" TEXT,
    "apellido_p_trabajador" TEXT NOT NULL,
    "apellido_m_trabajador" TEXT NOT NULL,
    "rut_trabajador" TEXT NOT NULL,
    "celular_trabajador" TEXT NOT NULL,
    "correo_trabajador" TEXT NOT NULL,
    "direccion_trabajador" TEXT NOT NULL,
    "estado_trabajador" TEXT NOT NULL,
    "id_empresa" INTEGER,
    "id_especialidad" INTEGER,

    CONSTRAINT "Trabajador_pkey" PRIMARY KEY ("id_trabajador")
);

-- CreateTable
CREATE TABLE "public"."Especialidad" (
    "id_especialidad" SERIAL NOT NULL,
    "nombre_especialidad" TEXT NOT NULL,

    CONSTRAINT "Especialidad_pkey" PRIMARY KEY ("id_especialidad")
);

-- CreateTable
CREATE TABLE "public"."Empresa" (
    "id_empresa" SERIAL NOT NULL,
    "nombre_empresa" TEXT NOT NULL,
    "direccion_empresa" TEXT NOT NULL,
    "numero_empresa" TEXT NOT NULL,
    "correo_empresa" TEXT NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id_empresa")
);

-- CreateTable
CREATE TABLE "public"."Urgencia" (
    "id_urgencia" SERIAL NOT NULL,
    "descripcion_urgencia" TEXT NOT NULL,
    "numero_urgencia" INTEGER NOT NULL,

    CONSTRAINT "Urgencia_pkey" PRIMARY KEY ("id_urgencia")
);

-- CreateIndex
CREATE UNIQUE INDEX "DetalleConsulta_id_reserva_key" ON "public"."DetalleConsulta"("id_reserva");

-- AddForeignKey
ALTER TABLE "public"."Examen" ADD CONSTRAINT "Examen_id_area_examen_fkey" FOREIGN KEY ("id_area_examen") REFERENCES "public"."area_examen"("id_area_examen") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DetalleExamen" ADD CONSTRAINT "DetalleExamen_id_ficha_paciente_fkey" FOREIGN KEY ("id_ficha_paciente") REFERENCES "public"."FichaPaciente"("id_ficha_paciente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DetalleExamen" ADD CONSTRAINT "DetalleExamen_id_examen_fkey" FOREIGN KEY ("id_examen") REFERENCES "public"."Examen"("id_examen") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DetalleConsulta" ADD CONSTRAINT "DetalleConsulta_id_reserva_fkey" FOREIGN KEY ("id_reserva") REFERENCES "public"."Reserva"("id_reserva") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DetalleConsulta" ADD CONSTRAINT "DetalleConsulta_id_estado_reserva_fkey" FOREIGN KEY ("id_estado_reserva") REFERENCES "public"."EstadoReserva"("id_estado_reserva") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DetalleConsulta" ADD CONSTRAINT "DetalleConsulta_id_ficha_paciente_fkey" FOREIGN KEY ("id_ficha_paciente") REFERENCES "public"."FichaPaciente"("id_ficha_paciente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Patologia" ADD CONSTRAINT "Patologia_id_ficha_paciente_fkey" FOREIGN KEY ("id_ficha_paciente") REFERENCES "public"."FichaPaciente"("id_ficha_paciente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Medicamento" ADD CONSTRAINT "Medicamento_id_ficha_paciente_fkey" FOREIGN KEY ("id_ficha_paciente") REFERENCES "public"."FichaPaciente"("id_ficha_paciente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Medicamento" ADD CONSTRAINT "Medicamento_id_categoria_medicamento_fkey" FOREIGN KEY ("id_categoria_medicamento") REFERENCES "public"."CategoriaMedicamento"("id_categoria_medicamento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reserva" ADD CONSTRAINT "Reserva_id_estado_reserva_fkey" FOREIGN KEY ("id_estado_reserva") REFERENCES "public"."EstadoReserva"("id_estado_reserva") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reserva" ADD CONSTRAINT "Reserva_id_fecha_hora_fkey" FOREIGN KEY ("id_fecha_hora") REFERENCES "public"."FechaHora"("id_fecha_hora") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Paciente" ADD CONSTRAINT "Paciente_id_reserva_fkey" FOREIGN KEY ("id_reserva") REFERENCES "public"."Reserva"("id_reserva") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Paciente" ADD CONSTRAINT "Paciente_id_fecha_hora_fkey" FOREIGN KEY ("id_fecha_hora") REFERENCES "public"."FechaHora"("id_fecha_hora") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Paciente" ADD CONSTRAINT "Paciente_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "public"."Empresa"("id_empresa") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Paciente" ADD CONSTRAINT "Paciente_id_urgencia_fkey" FOREIGN KEY ("id_urgencia") REFERENCES "public"."Urgencia"("id_urgencia") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trabajador" ADD CONSTRAINT "Trabajador_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "public"."Empresa"("id_empresa") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trabajador" ADD CONSTRAINT "Trabajador_id_especialidad_fkey" FOREIGN KEY ("id_especialidad") REFERENCES "public"."Especialidad"("id_especialidad") ON DELETE SET NULL ON UPDATE CASCADE;
