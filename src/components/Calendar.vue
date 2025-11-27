<template>
  <div class="rounded-3xl bg-[#200934] p-6 text-white shadow-2xl">
    <header class="space-y-1 border-b border-white/10 pb-4">
      <p class="text-xs uppercase tracking-[0.35em] text-white/70">Agenda recepción</p>
      <h3 class="text-2xl font-semibold">Reserva para {{ patientName || "el paciente" }}</h3>
      <p class="text-sm text-white/70">Calendario con la misma estructura de "Reserva tu hora". Selecciona fecha, horario y confirma.</p>
    </header>

    <div class="mt-4 flex flex-col gap-2">
      <label class="text-sm font-semibold text-white" for="specialty">Especialidad</label>
      <select
        id="specialty"
        v-model="selectedSpecialty"
        class="w-full max-w-md rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm outline-none transition hover:border-white/40 focus:border-white focus:ring-2 focus:ring-white/40"
      >
        <option v-for="opt in specialtyOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
      <p class="text-xs text-white/70">Elige la especialidad del agendamiento.</p>
    </div>

    <div v-if="error" class="mt-4 rounded-2xl bg-rose-600/40 p-4 text-sm">
      {{ error }}
    </div>

    <div v-else class="mt-6 space-y-6">
      <div
        v-if="specialtyChanging"
        class="rounded-2xl bg-white/10 p-5 text-sm text-white/80"
      >
        Actualizando horarios segun la especialidad...
      </div>
      <div v-else class="flex flex-col gap-6 lg:flex-row">
        <div class="rounded-2xl bg-white/10 p-4 shadow-inner lg:max-w-sm">
          <VDatePicker
            v-model="selectedDate"
            mode="date"
            :min-date="minDate"
            :max-date="maxDate"
            :disabled-dates="disabledDates"
            :attributes="dateAttributes"
            color="violet"
            title-position="left"
          />
        </div>

        <div class="flex-1 rounded-2xl bg-white/10 p-5">
          <h3 class="text-lg font-semibold text-white">
            Horarios para
            <span class="block text-base font-normal text-white/80 md:inline">{{ formattedSelectedDate }}</span>
          </h3>

          <p v-if="loadingSlots" class="mt-4 text-sm text-white/70">Cargando horarios...</p>
          <p
            v-else-if="hasExistingBooking"
            class="mt-4 rounded-2xl bg-amber-200/20 px-4 py-3 text-sm font-semibold  text-[#200934]"
          >
            {{ existingBookingMessage }}
          </p>
          <p v-else-if="slots.length === 0" class="mt-4 text-sm text-white/70">
            No hay horarios disponibles para esta fecha. Selecciona otra.
          </p>
          
          <div v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              v-for="slot in slots"
              :key="slot.id"
              type="button"
              :disabled="hasExistingBooking"
              @click="selectSlot(slot)"
              :class="slotButtonClass(slot)"
            >
              <span class="text-xl font-semibold">{{ slot.time }}</span>
              <span class="mt-1 block text-xs text-white/80">{{ slot.doctor }}</span>
              <span class="block text-[11px] text-white/60">{{ slot.specialty }}</span>
            </button>
          </div>
        </div>
      </div>

      <transition name="fade">
        <div
          v-if="selectedSlot"
          class="rounded-2xl bg-white p-6 text-[#200934] shadow-lg"
        >
          <h4 class="text-lg font-semibold">Confirmar reserva</h4>
          <p class="text-sm text-[#200934]/70">
            Fecha: <span class="font-semibold text-[#200934]">{{ formattedSelectedDate }}</span> · Hora:
            <span class="font-semibold text-[#200934]">{{ selectedSlot.time }}</span>
          </p>
          <p class="text-sm text-[#200934]/70">
            Profesional: <span class="font-semibold text-[#200934]">{{ selectedSlot.doctor }}</span> ({{ selectedSlot.specialty }})
          </p>
          <label class="mt-3 block text-sm font-semibold text-[#200934]">
            Nota (opcional)
            <textarea
              v-model="note"
              maxlength="240"
              rows="3"
              class="mt-1 w-full rounded-2xl border border-[#200934]/15 px-3 py-2 text-sm text-[#200934] outline-none transition focus:border-[#200934] focus:ring-2 focus:ring-[#200934]/30"
              placeholder="Motivo de la reserva u observaciones"
            ></textarea>
          </label>
          <div class="mt-4 flex flex-wrap justify-end gap-3 text-sm font-semibold">
            <button
              type="button"
              class="rounded-2xl px-4 py-2 text-[#200934] transition hover:bg-[#f4f1fb]"
              @click="clearSelection"
            >
              Cambiar hora
            </button>
            <button
              type="button"
              class="rounded-2xl bg-[#321355] px-4 py-2 text-white transition hover:bg-[#200934] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#321355] disabled:cursor-not-allowed disabled:bg-[#b4a6c9]"
              :disabled="reserving || hasExistingBooking"
              @click="openConfirm"
            >
              {{ reserving ? "Asignando..." : "Asignar hora" }}
            </button>
          </div>
          <p v-if="successMessage" class="mt-3 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {{ successMessage }}
          </p>
          <p v-if="errorMessage" class="mt-2 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
            {{ errorMessage }}
          </p>
        </div>
      </transition>
    </div>
  </div>

  <transition name="fade">
    <div
      v-if="showConfirm && selectedSlot"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div class="w-full max-w-md rounded-3xl bg-white p-6 text-[#200934] shadow-2xl">
        <h4 class="text-lg font-semibold">Confirmar asignacion</h4>
        <p class="mt-2 text-sm text-[#200934]/80">
          Asignar hora {{ selectedSlot.time }} el {{ formattedSelectedDate }} con {{ selectedSlot.doctor }}.
        </p>
        <div class="mt-5 flex flex-wrap justify-end gap-3 text-sm font-semibold">
          <button
            type="button"
            class="rounded-2xl px-4 py-2 text-[#200934] transition hover:bg-[#f4f1fb]"
            @click="closeConfirm"
          >
            No
          </button>
          <button
            type="button"
            class="rounded-2xl bg-[#321355] px-4 py-2 text-white transition hover:bg-[#200934] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#321355]"
            :disabled="reserving"
            @click="reserve"
          >
            {{ reserving ? "Asignando..." : "Si" }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  patientRut: { type: String, required: true },
  patientName: { type: String, default: "" },
  reservedSlots: { type: Array, default: () => [] },
  allowedSpecialties: { type: Array, default: () => ["Medicina General"] },
});

const selectedDate = ref(null);
const slots = ref([]);
const selectedSlot = ref(null);
const note = ref("");
const loadingSlots = ref(false);
const reserving = ref(false);
const error = ref("");
const errorMessage = ref("");
const successMessage = ref("");
const localReserved = ref(Array.isArray(props.reservedSlots) ? props.reservedSlots : []);
const selectedSpecialty = ref(props.allowedSpecialties[0] ?? "Medicina General");
const specialtyChanging = ref(false);
const hasInitializedSpecialty = ref(false);
const showConfirm = ref(false);
let fetchToken = 0;
const availableDateKeys = ref(new Set());

const today = new Date();
today.setHours(0, 0, 0, 0);
const minDate = today;
const maxDate = new Date(today);
maxDate.setDate(maxDate.getDate() + 30);

const specialtyOptions = computed(() => {
  const options = Array.isArray(props.allowedSpecialties) && props.allowedSpecialties.length > 0
    ? props.allowedSpecialties
    : ["Medicina General"];
  const unique = Array.from(new Set(options));
  return ["Medicina General", ...unique.filter((opt) => opt !== "Medicina General")];
});

const formatDateKey = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
};

const disabledDates = computed(() => {
  const disabled = [];
  const start = new Date(minDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(maxDate);
  end.setHours(0, 0, 0, 0);

  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = cursor.toISOString().split("T")[0];
    if (!availableDateKeys.value.has(key)) {
      disabled.push(new Date(cursor));
    }
  }

  return disabled;
});

const dateAttributes = computed(() => {
  if (!selectedDate.value) return [];
  const selected = new Date(selectedDate.value);
  selected.setHours(0, 0, 0, 0);
  return [
    {
      key: "selected",
      dates: selected,
      highlight: { class: "calendar-selected-day" },
    },
  ];
});

const formattedSelectedDate = computed(() => {
  if (!selectedDate.value) return "--";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "full" }).format(selectedDate.value);
});

const formatDateTime = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
};

const fetchAvailableDates = async () => {
  specialtyChanging.value = true;
  loadingSlots.value = true;
  selectedSlot.value = null;
  slots.value = [];
  error.value = "";
  errorMessage.value = "";
  successMessage.value = "";
  availableDateKeys.value = new Set();
  selectedDate.value = null;

  try {
    const params = new URLSearchParams();
    params.set("specialty", selectedSpecialty.value || "Medicina General");
    params.set("from", formatDateKey(minDate));
    params.set("to", formatDateKey(maxDate));

    const response = await fetch(`/api/recepcion/fechas-disponibles?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error ?? "No pudimos obtener las fechas disponibles.");
    }

    const dates = Array.isArray(data.dates) ? data.dates : [];
    availableDateKeys.value = new Set(dates);

    if (dates.length > 0) {
      selectedDate.value = new Date(`${dates[0]}T00:00:00`);
    } else {
      loadingSlots.value = false;
      specialtyChanging.value = false;
    }
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : "Error al cargar fechas disponibles.";
    loadingSlots.value = false;
    specialtyChanging.value = false;
  }
};

const fetchSlots = async (date) => {
  if (!date) return;
  const currentToken = ++fetchToken;
  loadingSlots.value = true;
  slots.value = [];
  selectedSlot.value = null;
  slots.value = [];
  selectedSlot.value = null;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const key = formatDateKey(date);
    const params = new URLSearchParams();
    params.set("date", key);
    if (selectedSpecialty.value) params.set("specialty", selectedSpecialty.value);
    const response = await fetch(`/api/recepcion/disponibles?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error ?? "No pudimos obtener los horarios.");
    }
    slots.value = Array.isArray(data.slots) ? data.slots : [];
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : "Error al cargar horarios.";
  } finally {
    if (currentToken === fetchToken) {
      loadingSlots.value = false;
      specialtyChanging.value = false;
    }
  }
};

const selectSlot = (slot) => {
  selectedSlot.value = slot;
  note.value = "";
  successMessage.value = "";
  errorMessage.value = "";
  showConfirm.value = false;
};

const clearSelection = () => {
  selectedSlot.value = null;
  note.value = "";
  showConfirm.value = false;
};

const reserve = async () => {
  if (!selectedSlot.value || reserving.value) return;
  reserving.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const response = await fetch("/api/recepcion/asignar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rut: props.patientRut,
        disponibilidadId: selectedSlot.value.id,
        nota: note.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error ?? "No pudimos asignar la hora.");
    }
    successMessage.value = data.message ?? "Hora asignada correctamente.";
    const dateObj = new Date(selectedDate.value);
    const [hours, minutes] = (selectedSlot.value.time || "").split(":");
    if (!Number.isNaN(Number(hours))) {
      dateObj.setHours(Number(hours), Number(minutes) || 0, 0, 0);
    }
    localReserved.value = [
      ...localReserved.value,
      {
        id: selectedSlot.value.id,
        fecha: dateObj,
        doctor: selectedSlot.value.doctor,
        specialty: selectedSlot.value.specialty,
      },
    ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    clearSelection();
    showConfirm.value = false;
    await fetchSlots(selectedDate.value);
  } catch (err) {
    console.error(err);
    errorMessage.value = err instanceof Error ? err.message : "Error inesperado al asignar.";
  } finally {
    reserving.value = false;
  }
};

const slotButtonClass = (slot) => {
  const base =
    "w-full rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/40";
  const isSelected = selectedSlot.value && selectedSlot.value.id === slot.id;
  return isSelected
    ? [base, "border-white bg-white text-[#200934]"]
    : [base, "border-white/20 bg-white/10 hover:bg-white hover:text-[#200934]"];
};

const existingBooking = computed(() => {
  const specialty = selectedSpecialty.value?.toLowerCase() || "";
  const now = new Date();
  return localReserved.value
    .map((slot) => ({
      ...slot,
      specialtyLower: (slot.specialty || "").toLowerCase(),
    }))
    .find((slot) => slot.specialtyLower === specialty && new Date(slot.fecha) >= now);
});

const existingBookingMessage = computed(() => {
  if (!existingBooking.value) return "";
  const dateText = formatDateTime(existingBooking.value.fecha);
  return `No puede reservar 2 horas para una misma especialidad. El paciente tiene una hora reservada (${dateText}).`;
});

const hasExistingBooking = computed(() => Boolean(existingBooking.value));

const openConfirm = () => {
  if (!selectedSlot.value || hasExistingBooking.value) return;
  showConfirm.value = true;
};

const closeConfirm = () => {
  showConfirm.value = false;
};

watch(
  () => selectedDate.value,
  (date) => {
    if (date) fetchSlots(date);
  },
  { immediate: true }
);

watch(
  () => selectedSpecialty.value,
  () => {
    if (hasInitializedSpecialty.value) {
      specialtyChanging.value = true;
    } else {
      hasInitializedSpecialty.value = true;
    }
    fetchAvailableDates();
  },
  { immediate: true }
);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.calendar-selected-day {
  background-color: #ffffff !important;
  color: #200934 !important;
  border-radius: 12px;
}

select option {
  color: #200934;
  background-color: #ffffff;
}
</style>
