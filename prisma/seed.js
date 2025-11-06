import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed: iniciando carga basica...');

  const programaSaludMental = await prisma.programa.create({
    data: { nombre: 'Programa de Salud Mental' },
  });

  const programaCardio = await prisma.programa.create({
    data: { nombre: 'Programa Cardiovascular' },
  });

  await prisma.servicio.createMany({
    data: [
      { nombre: 'Atencion Psicologica', id_programa: programaSaludMental.id_programa },
      { nombre: 'Taller de Apoyo Emocional', id_programa: programaSaludMental.id_programa },
      { nombre: 'Control de Hipertension', id_programa: programaCardio.id_programa },
      { nombre: 'Examen de Colesterol', id_programa: programaCardio.id_programa },
    ],
  });

  await prisma.especialidad.createMany({
    data: [
      { nombre_especialidad: 'Medicina General' },
      { nombre_especialidad: 'Pediatria' },
      { nombre_especialidad: 'Ginecologia' },
      { nombre_especialidad: 'Psiquiatria' },
    ],
    skipDuplicates: true,
  });

  const adminEspecialidad =
    (await prisma.especialidad.findFirst({
      where: { nombre_especialidad: 'Administracion' },
    })) ??
    (await prisma.especialidad.create({
      data: { nombre_especialidad: 'Administracion' },
    }));

  await prisma.estadoReserva.createMany({
    data: [
      { nombre_estado: 'Pendiente' },
      { nombre_estado: 'Confirmada' },
      { nombre_estado: 'Cancelada' },
      { nombre_estado: 'Completada' },
    ],
  });

  const laboratorio = await prisma.areaExamen.create({
    data: { nombre_area: 'Laboratorio' },
  });

  const imagenologia = await prisma.areaExamen.create({
    data: { nombre_area: 'Imagenologia' },
  });

  await prisma.examen.createMany({
    data: [
      { nombre_examen: 'Hemograma Completo', id_area_examen: laboratorio.id_area_examen },
      { nombre_examen: 'Examen de Orina', id_area_examen: laboratorio.id_area_examen },
      { nombre_examen: 'Radiografia de Torax', id_area_examen: imagenologia.id_area_examen },
      { nombre_examen: 'Ecografia Abdominal', id_area_examen: imagenologia.id_area_examen },
    ],
  });

  const [demoPassword, adminPassword] = await Promise.all([
    bcrypt.hash('ContrasenaDemo1!', 10),
    bcrypt.hash('AdminDemo1!', 10),
  ]);

  await Promise.all([
    prisma.usuario.upsert({
      where: { rut: '11111111-1' },
      update: { password: demoPassword },
      create: {
        rut: '11111111-1',
        password: demoPassword,
      },
    }),
    prisma.usuario.upsert({
      where: { rut: '22222222-2' },
      update: { password: adminPassword },
      create: {
        rut: '22222222-2',
        password: adminPassword,
      },
    }),
  ]);

  const adminTrabajadorExistente = await prisma.trabajador.findFirst({
    where: { rut_trabajador: '22222222-2' },
  });

  if (adminTrabajadorExistente) {
    await prisma.trabajador.update({
      where: { id_trabajador: adminTrabajadorExistente.id_trabajador },
      data: {
        id_especialidad: adminEspecialidad.id_especialidad,
        primer_nombre_trabajador: 'Administrador',
        segundo_nombre_trabajador: 'Sistema',
        apellido_p_trabajador: 'General',
        apellido_m_trabajador: 'CESFAM',
        celular_trabajador: '+56900000000',
        correo_trabajador: 'admin@cesfam.cl',
        direccion_trabajador: 'Oficina Central',
        estado_trabajador: 'Activo',
      },
    });
  } else {
    await prisma.trabajador.create({
      data: {
        primer_nombre_trabajador: 'Administrador',
        segundo_nombre_trabajador: 'Sistema',
        apellido_p_trabajador: 'General',
        apellido_m_trabajador: 'CESFAM',
        rut_trabajador: '22222222-2',
        celular_trabajador: '+56900000000',
        correo_trabajador: 'admin@cesfam.cl',
        direccion_trabajador: 'Oficina Central',
        estado_trabajador: 'Activo',
        especialidad: {
          connect: { id_especialidad: adminEspecialidad.id_especialidad },
        },
      },
    });
  }

  console.log(
    'Seed: datos insertados correctamente. Usuarios disponibles: 11111111-1 / ContrasenaDemo1!, 22222222-2 / AdminDemo1!',
  );
}

main()
  .catch((e) => {
    console.error('Seed: error al insertar datos', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
