-- CreateTable
CREATE TABLE "public"."programa" (
    "id_programa" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "programa_pkey" PRIMARY KEY ("id_programa")
);

-- CreateTable
CREATE TABLE "public"."servicio" (
    "id_servicio" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "id_programa" INTEGER NOT NULL,

    CONSTRAINT "servicio_pkey" PRIMARY KEY ("id_servicio")
);

-- AddForeignKey
ALTER TABLE "public"."servicio" ADD CONSTRAINT "servicio_id_programa_fkey" FOREIGN KEY ("id_programa") REFERENCES "public"."programa"("id_programa") ON DELETE RESTRICT ON UPDATE CASCADE;
