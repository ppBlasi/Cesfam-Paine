import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Calendar from "../../components/Calendar.vue";

const mockVDatePicker = {
  name: "VDatePicker",
  template: "<div data-test='v-date-picker'></div>",
};

describe("Calendar.vue (agenda recepción)", () => {
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
    const wrapper = mount(Calendar, {
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

  it("muestra mensaje de error si no hay RUT de paciente", async () => {
    const wrapper = await mountComponent({
      props: {
        patientRut: "",
        patientName: "Paciente Prueba",
      },
    });

    expect(wrapper.text()).toContain("No encontramos al paciente. No es posible reservar.");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("carga la agenda y muestra el calendario y horarios disponibles", async () => {
    const availabilityResponse = {
      specialties: ["Kinesiología"],
      selectedSpecialty: "Kinesiología",
      days: [
        {
          date: "2025-02-01",
          slots: [
            {
              time: "15:00",
              available: 3,
              entries: [
                {
                  disponibilidadId: 10,
                  doctorName: "Kinesiólogo A",
                  specialty: "Kinesiología",
                  timestamp: "2025-02-01T15:00:00",
                },
              ],
            },
          ],
        },
      ],
      existingBooking: null,
      range: { from: "2025-02-01", to: "2025-02-10" },
    };

    (global.fetch as any) = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => availabilityResponse,
      });

    const wrapper = await mountComponent({
      props: {
        patientRut: "11.111.111-1",
        patientName: "Juan Recepción",
      },
    });

    expect(wrapper.find("[data-test='v-date-picker']").exists()).toBe(true);
    const slotButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("15:00"));
    expect(slotButton).toBeTruthy();
  });

  it("permite seleccionar un horario y ver profesionales disponibles", async () => {
    const availabilityResponse = {
      specialties: ["Medicina General"],
      selectedSpecialty: "Medicina General",
      days: [
        {
          date: "2025-03-01",
          slots: [
            {
              time: "09:30",
              available: 2,
              entries: [
                {
                  disponibilidadId: 20,
                  doctorName: "Dr. Recepción",
                  specialty: "Medicina General",
                  timestamp: "2025-03-01T09:30:00",
                },
              ],
            },
          ],
        },
      ],
      existingBooking: null,
      range: { from: "2025-03-01", to: "2025-03-10" },
    };

    (global.fetch as any) = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => availabilityResponse,
      });

    const wrapper = await mountComponent({
      props: {
        patientRut: "22.222.222-2",
        patientName: "Paciente Recepción",
      },
    });

    const slotButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("09:30"));
    expect(slotButton).toBeTruthy();

    await slotButton!.trigger("click");
    await flushPromises();

    const cards = wrapper.findAll("article");
    expect(cards.length).toBe(1);
    expect(cards[0].text()).toContain("Dr. Recepción");
  });

  it("envía POST /api/recepcion/asignar al confirmar una asignación de hora", async () => {
    const availabilityResponse = {
      specialties: ["Medicina General"],
      selectedSpecialty: "Medicina General",
      days: [
        {
          date: "2025-04-01",
          slots: [
            {
              time: "11:30",
              available: 1,
              entries: [
                {
                  disponibilidadId: 30,
                  doctorName: "Dra. Agenda",
                  specialty: "Medicina General",
                  timestamp: "2025-04-01T11:30:00",
                },
              ],
            },
          ],
        },
      ],
      existingBooking: null,
      range: { from: "2025-04-01", to: "2025-04-10" },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => availabilityResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Hora asignada correctamente." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => availabilityResponse,
      });

    (global.fetch as any) = fetchMock;

    const wrapper = await mountComponent({
      props: {
        patientRut: "33.333.333-3",
        patientName: "Paciente Recepción",
      },
    });

    const slotButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("11:30"));
    expect(slotButton).toBeTruthy();

    await slotButton!.trigger("click");
    await flushPromises();

    const doctorButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Asignar hora"));
    expect(doctorButton).toBeTruthy();

    await doctorButton!.trigger("click"); 
    await flushPromises();

    const confirmButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Si"));
    expect(confirmButton).toBeTruthy();

    await confirmButton!.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/recepcion/asignar");

    expect(wrapper.text()).toContain("Hora asignada correctamente.");
  });

  it("muestra mensaje de error cuando el backend responde con error al cargar agenda", async () => {
    (global.fetch as any) = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: "No pudimos cargar las horas disponibles." }),
      });

    const wrapper = await mountComponent({
      props: {
        patientRut: "44.444.444-4",
        patientName: "Paciente Recepción",
      },
    });

    expect(wrapper.text()).toContain("No pudimos cargar las horas disponibles.");
  });
});
