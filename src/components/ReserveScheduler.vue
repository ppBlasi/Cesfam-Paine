<template>
  <div class="rounded-3xl bg-[#200934] p-6 text-white shadow-2xl">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
      <div>
        <p class="text-xs uppercase tracking-[0.35em] text-white/70">Agenda Medicina General</p>
        <h3 class="text-2xl font-semibold">Selecciona tu horario</h3>
      </div>
      <button
        type="button"
        class="rounded-full border border-white/30 px-4 py-1 text-sm font-semibold transition hover:bg-white/10"
        @click="refresh"
        :disabled="loading || refreshing"
      >
        {{ refreshing ? "Actualizando..." : "Actualizar agenda" }}
      </button>
    </div>

    <div v-if="error" class="mt-4 rounded-2xl bg-rose-600/40 p-4 text-sm">
      {{ error }}
    </div>

    <div v-else class="mt-6 space-y-6">
      <div v-if="loading" class="space-y-4">
        <p class="text-sm text-white/80">Cargando horas disponibles...</p>
        <div class="h-8 w-48 animate-pulse rounded-full bg-white/10"></div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="h-72 animate-pulse rounded-3xl bg-white/10"></div>
          <div class="h-72 animate-pulse rounded-3xl bg-white/10"></div>
        </div>
      </div>

      <template v-else>
        <div v-if="days.length === 0" class="rounded-2xl bg-white/10 p-5 text-sm text-white/80">
          En este momento no tenemos horas disponibles con medicina general. Intenta nuevamente mas tarde o visita tu
          CESFAM para recibir asistencia.
        </div>

        <div class="flex flex-col gap-4 rounded-3xl bg-white/5 p-4 shadow-inner">
          <label class="text-sm font-semibold text-white" for="specialty">Especialidad</label>
          <select
            id="specialty"
            class="w-full max-w-lg rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm outline-none transition hover:border-white/40 focus:border-white focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="specialtyLocked"
            v-model="selectedSpecialty"
            @change="handleSpecialtyChange"
          >
            <option v-for="opt in specialtyOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <p class="text-xs text-white/70">Selecciona una especialidad para ver el calendario.</p>
        </div>

        <div v-if="selectedSpecialty" class="flex flex-col gap-6 lg:flex-row">
          <div class="rounded-3xl bg-white/10 p-4 shadow-inner lg:max-w-sm">
            <VDatePicker
              v-model="selectedDate"
              mode="date"
              :disabled-dates="disabledDates"
              :min-date="minDate"
              :max-date="maxDate"
              color="violet"
              title-position="left"
            />
          </div>

          <div class="flex-1 rounded-3xl bg-white/10 p-5">
            <h3 class="text-lg font-semibold text-white">
              Horarios para
              <span class="block text-base font-normal text-white/80 md:inline">{{ formattedSelectedDate }}</span>
            </h3>

            <p
              v-if="hasExistingBooking"
              class="mt-3 rounded-2xl bg-amber-200/20 px-4 py-3 text-xs font-semibold text-amber-100 shadow-inner "
            >
              {{ existingBookingMessage }}
            </p>

            <template v-if="!hasExistingBooking">
              <p v-if="slotsForSelectedDate.length === 0" class="mt-4 text-sm text-white/70">
                No hay horarios disponibles para este dia. Selecciona otra fecha.
              </p>

              <div v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <button
                  v-for="slot in slotsForSelectedDate"
                  :key="slot.time"
                  type="button"
                  @click="selectSlot(slot)"
                  :class="slotButtonClass(slot)"
                  :disabled="hasExistingBooking"
                >
                  <span class="text-xl font-semibold">{{ slot.time }}</span>
                  <span class="mt-1 block text-xs text-white/80">
                    {{ slot.available }} {{ slot.available === 1 ? "agenda" : "agendas" }} disponibles
                  </span>
                </button>
              </div>
            </template>
          </div>
        </div>

        <transition name="fade">
          <div
            v-if="selectedSlot && selectedSlot.entries.length > 0 && (!hasExistingBooking || rescheduleMode)"
            class="rounded-3xl bg-white p-6 text-[#200934]"
          >
            <h4 class="text-lg font-semibold">
              Profesionales disponibles a las {{ selectedSlot.time }}
            </h4>
            <p class="text-sm text-[#200934]/70">
              Selecciona al medico disponible y confirma la reserva. Solo se bloqueara la hora una vez confirmada.
            </p>

            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <article
                v-for="entry in selectedSlot.entries"
                :key="entry.disponibilidadId"
                class="rounded-2xl border border-[#200934]/10 p-4 shadow-sm"
              >
                <p class="text-base font-semibold text-[#200934]">{{ entry.doctorName }}</p>
                <p class="text-sm text-[#200934]/70">{{ entry.specialty }}</p>
                <p class="text-xs text-[#200934]/60">
                  Fecha: {{ new Date(entry.timestamp).toLocaleDateString("es-CL", { dateStyle: "medium" }) }}
                </p>

                <button
                  type="button"
                  class="mt-3 w-full rounded-2xl bg-[#321355] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#200934] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#321355]"
                  :disabled="reserving"
                  @click="askForConfirmation(entry)"
                >
                  {{ reserving ? (rescheduleMode ? "Reagendando..." : "Reservando...") : actionLabel }}
                </button>
              </article>
            </div>

            <p v-if="successMessage" class="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
              {{ successMessage }}
            </p>
          </div>
        </transition>
      </template>

      <transition name="fade">
        <div v-if="showConfirm && pendingEntry" class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p class="text-lg font-semibold text-[#200934]">{{ rescheduleMode ? "¿Confirmar cambio?" : "¿Confirmar reserva?" }}</p>
            <p class="mt-2 text-sm text-[#200934]/80">
              Estas seguro que quieres {{ rescheduleMode ? "cambiar" : "reservar" }} esta hora:
              <strong>{{ formattedSelectedDate }}</strong> a las <strong>{{ selectedSlot?.time }}</strong> con
              <strong>{{ pendingEntry.doctorName }}</strong>.
            </p>
            <div class="mt-4 space-y-2 text-sm text-[#200934]/80">
              <label class="block text-xs font-semibold text-[#200934]">Motivo (opcional)</label>
              <textarea
                v-model="note"
                maxlength="240"
                rows="3"
                class="w-full rounded-2xl border border-[#200934]/15 px-3 py-2 text-sm text-[#200934] outline-none transition focus:border-[#200934] focus:ring-2 focus:ring-[#200934]/30"
                placeholder="Sintomas, observaciones u otra informacion relevante"
              ></textarea>
            </div>
            <div class="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                class="rounded-2xl px-4 py-2 text-sm font-semibold text-[#200934] transition hover:bg-[#f4f1fb]"
                @click="closeConfirm"
              >
                No
              </button>
              <button
                type="button"
                class="rounded-2xl bg-[#321355] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#200934] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#321355]"
                :disabled="reserving"
                @click="rescheduleMode ? reschedule() : reserve()"
              >
                {{ reserving ? (rescheduleMode ? "Reagendando..." : "Reservando...") : rescheduleMode ? "Si, reagendar" : "Si, reservar" }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";

const GENERAL_SPECIALTY = "Medicina General";

const props = defineProps({
  patientName: {
    type: String,
    default: "",
  },
  rescheduleMode: {
    type: Boolean,
    default: false,
  },
  rescheduleAvailabilityId: {
    type: Number,
    default: null,
  },
  rescheduleSpecialty: {
    type: String,
    default: "",
  },
});

const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const successMessage = ref("");
const note = ref("");
const reserving = ref(false);
const specialtyLocked = ref(false);
const existingBooking = ref(null);
const rescheduleMode = computed(() => Boolean(props.rescheduleMode));
const rescheduleAvailabilityId = computed(() =>
  Number.isFinite(props.rescheduleAvailabilityId) ? Number(props.rescheduleAvailabilityId) : null
);
const rescheduleSpecialty = computed(() => props.rescheduleSpecialty || "");

const days = ref([]);
const selectedDate = ref(null);
const selectedSlot = ref(null);
const minDate = ref(null);
const maxDate = ref(null);
const selectedSpecialty = ref(GENERAL_SPECIALTY);
const specialties = ref([]);
const showConfirm = ref(false);
const pendingEntry = ref(null);
const hasManualSpecialtySelection = ref(false);

const fetchAvailability = async () => {
  if (!props.patientName) {
    error.value = "No encontramos tu ficha de paciente. No es posible reservar en linea.";
    loading.value = false;
    return;
  }

  try {
    if (!loading.value) {
      refreshing.value = true;
    }
    error.value = "";
    if (rescheduleSpecialty.value) {
      selectedSpecialty.value = rescheduleSpecialty.value;
    }
    const query = new URLSearchParams();
    const shouldSendSpecialty = hasManualSpecialtySelection.value || Boolean(rescheduleSpecialty.value);
    const specialtyToSend = selectedSpecialty.value || GENERAL_SPECIALTY;
    if (shouldSendSpecialty && specialtyToSend) {
      query.set("specialty", specialtyToSend);
    }

    const queryString = query.toString();
    const response = await fetch(`/api/reservas/disponibles${queryString ? `?${queryString}` : ""}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error ?? "No pudimos cargar las horas disponibles.");
    }
    const data = await response.json();
    const apiSpecialties = Array.isArray(data.specialties) ? data.specialties : [];
    specialties.value = Array.from(new Set([GENERAL_SPECIALTY, ...apiSpecialties]));
    selectedSpecialty.value =
      rescheduleSpecialty.value ||
      data.selectedSpecialty ||
      selectedSpecialty.value ||
      GENERAL_SPECIALTY;
    specialtyLocked.value = Boolean(rescheduleSpecialty.value);
    days.value = Array.isArray(data.days) ? data.days : [];
    existingBooking.value = data.existingBooking ?? null;
    if (existingBooking.value && !rescheduleMode.value) {
      selectedSlot.value = null;
    }
    minDate.value = data.range?.from ? new Date(`${data.range.from}T00:00:00`) : null;
    maxDate.value = data.range?.to ? new Date(`${data.range.to}T00:00:00`) : null;
    if (days.value.length > 0) {
      const firstDate = days.value[0].date;
      selectedDate.value = firstDate ? new Date(`${firstDate}T00:00:00`) : null;
    } else {
      selectedDate.value = null;
      selectedSlot.value = null;
    }
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : "Error desconocido al cargar la agenda.";
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

onMounted(fetchAvailability);

const availableDateKeys = computed(() => new Set(days.value.map((day) => day.date)));

const disabledDates = computed(() => {
  if (!minDate.value || !maxDate.value) {
    return [];
  }

  const disabled = [];
  const start = new Date(minDate.value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(maxDate.value);
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

const selectedDateKey = computed(() => {
  if (!selectedDate.value) return null;
  const copy = new Date(selectedDate.value);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().split("T")[0];
});

const slotsForSelectedDate = computed(() => {
  if (!selectedDateKey.value) return [];
  const day = days.value.find((entry) => entry.date === selectedDateKey.value);
  return day ? day.slots : [];
});

const hasExistingBooking = computed(
  () =>
    Boolean(existingBooking.value) &&
    !(
      rescheduleMode.value &&
      rescheduleAvailabilityId.value &&
      existingBooking.value?.disponibilidadId === rescheduleAvailabilityId.value
    )
);
const existingBookingMessage = computed(() => {
  if (!existingBooking.value) return "";
  const date = new Date(existingBooking.value.fecha);
  const formatted = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
  return `No puede reservar 2 horas para una misma especialidad. Usted tiene una hora reservada (${formatted}).`;
});

const formattedSelectedDate = computed(() => {
  if (!selectedDateKey.value) return "--";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "full" }).format(new Date(`${selectedDateKey.value}T00:00:00`));
});

const specialtyOptions = computed(() => {
  const options = specialties.value.length > 0 ? specialties.value : [GENERAL_SPECIALTY];
  const unique = Array.from(new Set(options));
  return [GENERAL_SPECIALTY, ...unique.filter((opt) => opt !== GENERAL_SPECIALTY)];
});

const selectSlot = (slot) => {
  if (hasExistingBooking.value) return;
  selectedSlot.value = slot;
  note.value = "";
  successMessage.value = "";
};

watch(selectedDateKey, () => {
  selectedSlot.value = null;
  note.value = "";
  successMessage.value = "";
});

const slotButtonClass = (slot) => {
  const base =
    "w-full rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/40";
  if (selectedSlot.value && selectedSlot.value.time === slot.time) {
    return [base, "border-white bg-white text-[#200934]"];
  }
  return [base, "border-white/20 bg-white/10 hover:bg-white hover:text-[#200934]"];
};

const askForConfirmation = (entry) => {
  if (hasExistingBooking.value) return;
  pendingEntry.value = entry;
  showConfirm.value = true;
  successMessage.value = "";
};

const closeConfirm = () => {
  pendingEntry.value = null;
  showConfirm.value = false;
};

const reschedule = async () => {
  if (!pendingEntry.value) return;
  if (reserving.value) return;
  if (!rescheduleMode.value || !rescheduleAvailabilityId.value) return;
  successMessage.value = "";
  reserving.value = true;

  try {
    const response = await fetch("/api/reservas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldAvailabilityId: rescheduleAvailabilityId.value,
        newAvailabilityId: pendingEntry.value.disponibilidadId,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error ?? "No pudimos editar la reserva.");
    }

    successMessage.value = data.message ?? "Reserva actualizada.";
    closeConfirm();
    await fetchAvailability();
    window.location.href = "/perfil";
  } catch (err) {
    console.error(err);
    error.value = err instanceof Error ? err.message : "Ocurrio un problema al editar tu hora.";
  } finally {
    reserving.value = false;
  }
};

const reserve = async () => {
  if (hasExistingBooking.value) return;
  if (!pendingEntry.value) return;
  if (reserving.value) return;
  successMessage.value = "";
  reserving.value = true;

  try {
    const response = await fetch("/api/reservas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disponibilidadId: pendingEntry.value.disponibilidadId,
        nota: note.value,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error ?? "No pudimos confirmar la reserva.");
    }

    successMessage.value = data.message ?? "Tu hora ha sido reservada.";
    closeConfirm();
    await fetchAvailability();
    if (selectedSpecialty.value !== GENERAL_SPECIALTY) {
      specialtyLocked.value = true;
    }
    window.location.href = "/reserva/reserva#reserva-hora";
  } catch (err) {
    console.error(err);
    error.value =
      err instanceof Error ? err.message : "Ocurrio un problema al reservar tu hora. Intenta nuevamente.";
  } finally {
    reserving.value = false;
  }
};

const refresh = async () => {
  loading.value = days.value.length === 0;
  await fetchAvailability();
};

const handleSpecialtyChange = async () => {
  hasManualSpecialtySelection.value = true;
  loading.value = true;
  error.value = "";
  selectedSlot.value = null;
  selectedDate.value = null;
  days.value = [];
  existingBooking.value = null;
  pendingEntry.value = null;
  showConfirm.value = false;
  note.value = "";
  successMessage.value = "";
  await fetchAvailability();
};

const actionLabel = computed(() => (rescheduleMode.value ? "Reagendar" : "Reservar esta hora"));
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

select option {
  color: #200934;
  background-color: #ffffff;
}
</style>
