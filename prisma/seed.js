import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ensureRecord = async (model, where, data = where, idField = 'id') => {
  const existing = await model.findFirst({
    where,
    orderBy: { [idField]: 'asc' },
  });
  if (existing) {
    return existing;
  }
  return model.create({ data });
};

async function main() {
  console.log('Seed: iniciando carga basica...');

  const programaSaludMental = await ensureRecord(
    prisma.programa,
    { nombre: 'Programa de Salud Mental' },
    { nombre: 'Programa de Salud Mental' },
    'id_programa',
  );

  const programaCardio = await ensureRecord(
    prisma.programa,
    { nombre: 'Programa Cardiovascular' },
    { nombre: 'Programa Cardiovascular' },
    'id_programa',
  );

  const serviciosIniciales = [
    { nombre: 'Atencion Psicologica', id_programa: programaSaludMental.id_programa },
    { nombre: 'Taller de Apoyo Emocional', id_programa: programaSaludMental.id_programa },
    { nombre: 'Control de Hipertension', id_programa: programaCardio.id_programa },
    { nombre: 'Examen de Colesterol', id_programa: programaCardio.id_programa },
  ];

  for (const servicio of serviciosIniciales) {
    await ensureRecord(prisma.servicio, { nombre: servicio.nombre, id_programa: servicio.id_programa }, servicio, 'id_servicio');
  }

  const especialidadesBase = ['Medicina General', 'Pediatria', 'Ginecologia', 'Psiquiatria', 'Enfermeria'];
  for (const nombre of especialidadesBase) {
    await ensureRecord(
      prisma.especialidad,
      { nombre_especialidad: nombre },
      { nombre_especialidad: nombre },
      'id_especialidad',
    );
  }

  const adminEspecialidad = await ensureRecord(
    prisma.especialidad,
    {
      nombre_especialidad: 'Administracion',
    },
    { nombre_especialidad: 'Administracion' },
    'id_especialidad',
  );

  const estadosReserva = ['Pendiente', 'Confirmada', 'Cancelada', 'Completada'];
  for (const nombre_estado of estadosReserva) {
    await ensureRecord(
      prisma.estadoReserva,
      { nombre_estado },
      { nombre_estado },
      'id_estado_reserva',
    );
  }

  const laboratorio = await ensureRecord(
    prisma.areaExamen,
    { nombre_area: 'Laboratorio' },
    { nombre_area: 'Laboratorio' },
    'id_area_examen',
  );

  const imagenologia = await ensureRecord(
    prisma.areaExamen,
    { nombre_area: 'Imagenologia' },
    { nombre_area: 'Imagenologia' },
    'id_area_examen',
  );

  const examenesIniciales = [
    { nombre_examen: 'Hemograma Completo', id_area_examen: laboratorio.id_area_examen },
    { nombre_examen: 'Examen de Orina', id_area_examen: laboratorio.id_area_examen },
    { nombre_examen: 'Radiografia de Torax', id_area_examen: imagenologia.id_area_examen },
    { nombre_examen: 'Ecografia Abdominal', id_area_examen: imagenologia.id_area_examen },
  ];

  for (const examen of examenesIniciales) {
    await ensureRecord(
      prisma.examen,
      { nombre_examen: examen.nombre_examen, id_area_examen: examen.id_area_examen },
      examen,
      'id_examen',
    );
  }

  const [demoPassword, adminPassword, nursePassword] = await Promise.all([
    bcrypt.hash('ContrasenaDemo1!', 10),
    bcrypt.hash('AdminDemo1!', 10),
    bcrypt.hash('EnfermeriaDemo1!', 10),
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
    prisma.usuario.upsert({
      where: { rut: '55555555-5' },
      update: { password: nursePassword },
      create: {
        rut: '55555555-5',
        password: nursePassword,
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

  const enfermeriaEspecialidad = await ensureRecord(
    prisma.especialidad,
    { nombre_especialidad: 'Enfermeria' },
    { nombre_especialidad: 'Enfermeria' },
    'id_especialidad',
  );

  const nurseWorker = await prisma.trabajador.findFirst({
    where: { rut_trabajador: '55555555-5' },
  });

  if (nurseWorker) {
    await prisma.trabajador.update({
      where: { id_trabajador: nurseWorker.id_trabajador },
      data: {
        id_especialidad: enfermeriaEspecialidad.id_especialidad,
        primer_nombre_trabajador: 'Enfermera',
        segundo_nombre_trabajador: 'Demo',
        apellido_p_trabajador: 'Equipo',
        apellido_m_trabajador: 'CESFAM',
        celular_trabajador: '+56900000001',
        correo_trabajador: 'enfermeria@cesfam.cl',
        direccion_trabajador: 'Modulo Enfermeria',
        estado_trabajador: 'Activo',
      },
    });
  } else {
    await prisma.trabajador.create({
      data: {
        primer_nombre_trabajador: 'Enfermera',
        segundo_nombre_trabajador: 'Demo',
        apellido_p_trabajador: 'Equipo',
        apellido_m_trabajador: 'CESFAM',
        rut_trabajador: '55555555-5',
        celular_trabajador: '+56900000001',
        correo_trabajador: 'enfermeria@cesfam.cl',
        direccion_trabajador: 'Modulo Enfermeria',
        estado_trabajador: 'Activo',
        especialidad: {
          connect: { id_especialidad: enfermeriaEspecialidad.id_especialidad },
        },
      },
    });
  }

  console.log(
    'Seed: datos insertados correctamente. Usuarios disponibles: 11111111-1 / ContrasenaDemo1!, 22222222-2 / AdminDemo1!, 55555555-5 / EnfermeriaDemo1!',
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
