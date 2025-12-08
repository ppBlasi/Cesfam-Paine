// tests/components/ReserveScheduler.test.ts
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ReserveScheduler from "../../components/ReserveScheduler.vue";

const mockVDatePicker = {
  name: "VDatePicker",
  template: "<div data-test='v-date-picker'></div>",
};

describe("ReserveScheduler.vue", () => {
  let originalFetch: any;
  let originalLocation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    originalLocation = window.location;

    global.fetch = vi.fn();

    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.location = originalLocation;
  });

  const mountComponent = async (options: any = {}) => {
    const wrapper = mount(ReserveScheduler, {
      global: {
        components: {
          VDatePicker: mockVDatePicker,
        },
      },
      ...options,
    });
    await flushPromises();
    return wrapper;
  };

  it("muestra mensaje de error si no hay nombre de paciente", async () => {
    (global.fetch as any) = vi.fn(); // no debería llamarse

    const wrapper = await mountComponent({
      props: {
      },
    });

    expect(wrapper.text()).toContain(
      "No encontramos tu ficha de paciente. No es posible reservar en linea."
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("carga disponibilidad y muestra botones de horarios", async () => {
    const availabilityResponse = {
      specialties: ["Medicina General"],
      selectedSpecialty: "Medicina General",
      days: [
        {
          date: "2025-01-01",
          slots: [
            {
              time: "09:00",
              available: 2,
              entries: [
                {
                  disponibilidadId: 1,
                  doctorName: "Dr. Pérez",
                  specialty: "Medicina General",
                  timestamp: "2025-01-01T09:00:00",
                },
              ],
            },
          ],
        },
      ],
      existingBooking: null,
      range: { from: "2025-01-01", to: "2025-01-10" },
    };

    (global.fetch as any) = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => availabilityResponse,
      });

    const wrapper = await mountComponent({
      props: {
        patientName: "Juan Pérez",
      },
    });

    expect(wrapper.find("[data-test='v-date-picker']").exists()).toBe(true);
    const slotButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("09:00"));
    expect(slotButton).toBeTruthy();
  });

  it("muestra mensaje de reserva existente e impide seleccionar nuevo horario cuando ya hay booking", async () => {
    const existingBookingResponse = {
      specialties: ["Medicina General"],
      selectedSpecialty: "Medicina General",
      days: [
        {
          date: "2025-01-01",
          slots: [
            {
              time: "10:00",
              available: 1,
              entries: [
                {
                  disponibilidadId: 2,
                  doctorName: "Dr. House",
                  specialty: "Medicina General",
                  timestamp: "2025-01-01T10:00:00",
                },
              ],
            },
          ],
        },
      ],
      existingBooking: {
        disponibilidadId: 99,
        fecha: "2025-01-01T08:00:00",
        doctor: "Dr. House",
        specialty: "Medicina General",
      },
      range: { from: "2025-01-01", to: "2025-01-10" },
    };

    (global.fetch as any) = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => existingBookingResponse,
      });

    const wrapper = await mountComponent({
      props: {
        patientName: "Juan Pérez",
      },
    });

    expect(wrapper.text()).toContain(
      "No puede reservar 2 horas para una misma especialidad."
    );

    const slotButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("10:00"));
    expect(slotButton).toBeUndefined();

    expect(wrapper.findAll("article").length).toBe(0);
  });

  it("permite seleccionar un horario y listar profesionales disponibles", async () => {
    const availabilityResponse = {
      specialties: ["Medicina General"],
      selectedSpecialty: "Medicina General",
      days: [
        {
          date: "2025-01-01",
          slots: [
            {
              time: "11:00",
              available: 1,
              entries: [
                {
                  disponibilidadId: 3,
                  doctorName: "Dra. Soto",
                  specialty: "Medicina General",
                  timestamp: "2025-01-01T11:00:00",
                },
              ],
            },
          ],
        },
      ],
      existingBooking: null,
      range: { from: "2025-01-01", to: "2025-01-10" },
    };

    (global.fetch as any) = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => availabilityResponse,
      });

    const wrapper = await mountComponent({
      props: {
        patientName: "Juan Pérez",
      },
    });

    const slotButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("11:00"));
    expect(slotButton).toBeTruthy();

    await slotButton!.trigger("click");
    await flushPromises();

    const cards = wrapper.findAll("article");
    expect(cards.length).toBe(1);
    expect(cards[0].text()).toContain("Dra. Soto");
  });

  it("realiza POST /api/reservas al confirmar una reserva y muestra mensaje de éxito", async () => {
    const availabilityResponse = {
      specialties: ["Medicina General"],
      selectedSpecialty: "Medicina General",
      days: [
        {
          date: "2025-01-01",
          slots: [
            {
              time: "12:00",
              available: 1,
              entries: [
                {
                  disponibilidadId: 5,
                  doctorName: "Dr. López",
                  specialty: "Medicina General",
                  timestamp: "2025-01-01T12:00:00",
                },
              ],
            },
          ],
        },
      ],
      existingBooking: null,
      range: { from: "2025-01-01", to: "2025-01-10" },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => availabilityResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Tu hora ha sido reservada." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => availabilityResponse,
      });

    (global.fetch as any) = fetchMock;

    const wrapper = await mountComponent({
      props: {
        patientName: "Juan Pérez",
      },
    });

    const slotButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("12:00"));
    expect(slotButton).toBeTruthy();

    await slotButton!.trigger("click");
    await flushPromises();

    const doctorButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Reservar"));
    expect(doctorButton).toBeTruthy();

    await doctorButton!.trigger("click"); // abre modal
    await flushPromises();

    const confirmButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Si, reservar"));
    expect(confirmButton).toBeTruthy();

    await confirmButton!.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/reservas");

    expect(wrapper.text()).toContain("Tu hora ha sido reservada.");
  });
});
