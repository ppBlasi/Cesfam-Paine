import { z } from "zod";

export const createReservaInputSchema = z.object({
  id_paciente: z.number().int().positive(),
  id_disponibilidad: z.number().int().positive(),
  fecha_reserva: z.string().min(1),
  id_estado_reserva: z.number().int().positive(),
});
