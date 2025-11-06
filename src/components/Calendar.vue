<template>
  <div class="rounded-3xl bg-[#200934] p-6 text-white shadow-2xl">
    <div class="flex flex-wrap justify-center gap-4 pb-6">
      <button
        type="button"
        @click="setActiveTab('time')"
        :class="tabButtonClass('time')"
      >
        Por hora
      </button>
      <button
        type="button"
        @click="setActiveTab('doctor')"
        :class="tabButtonClass('doctor')"
      >
        Por doctor
      </button>
    </div>

    <transition name="fade" mode="out-in">
      <div v-if="activeTab === 'time'" key="time" class="space-y-6">
        <div class="flex flex-col items-center gap-6 md:flex-row md:items-start">
          <div class="rounded-2xl bg-white/10 p-4 shadow-inner">
            <VDatePicker
              v-model="selectedDate"
              mode="date"
              :disabled-dates="disabledDateRules"
              :min-date="today"
              color="violet"
              title-position="left"
            />
          </div>

          <div class="flex-1 rounded-2xl bg-white/10 p-5">
            <h3 class="text-lg font-semibold text-white">
              Horas disponibles para
              <span class="block text-base font-normal text-white/80 md:inline">{{ formattedSelectedDate }}</span>
            </h3>

            <p v-if="slotsForSelectedDate.length === 0" class="mt-4 text-sm text-white/70">
              No hay bloques disponibles para esta fecha. Selecciona otro día.
            </p>

            <div v-else class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button
                v-for="slot in slotsForSelectedDate"
                :key="slot.time"
                type="button"
                :disabled="slot.status !== 'available'"
                @click="selectSlot(slot)"
                :class="slotButtonClass(slot)"
              >
                <span class="text-base font-semibold">{{ slot.time }}</span>
                <span v-if="slot.status === 'available'" class="mt-1 block text-xs">
                  {{ slot.doctors.length }} profesional(es) disponibles
                </span>
                <span v-else class="mt-1 block text-xs text-white/60">Hora no disponible</span>
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="selectedSlot && selectedSlot.status === 'available'"
          class="rounded-2xl bg-white p-5 text-left text-[#200934]"
        >
          <h4 class="text-lg font-semibold">
            Profesionales disponibles a las {{ selectedSlot.time }}
          </h4>
          <ul class="mt-3 space-y-2 text-sm">
            <li v-for="doctor in selectedSlot.doctors" :key="doctor" class="rounded-xl bg-[#f4f1fb] px-3 py-2">
              {{ doctor }}
            </li>
          </ul>
        </div>
      </div>

      <div v-else key="doctor" class="rounded-2xl bg-white/10 p-6 text-left text-white">
        <h3 class="text-lg font-semibold">Búsqueda por médico</h3>
        <p class="mt-2 text-sm text-white/80">
          Muy pronto podrás elegir directamente a tu profesional de confianza y visualizar su agenda.
        </p>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const activeTab = ref("time");
const selectedDate = ref(null);
const selectedSlot = ref(null);

const today = new Date();
today.setHours(0, 0, 0, 0);

const doctorPool = [
  "Dra. Andrea Zurita - Medicina Familiar",
  "Dr. Felipe Hernandez - Medicina Interna",
  "Dra. Camila Pardo - Pediatria",
  "Dr. Ignacio Salinas - Geriatria",
  "Dra. Fernanda Araya - Nutricion",
  "Dr. Javier Mella - Kinesiologia",
];

const baseHours = ["09:00", "09:30", "10:15", "11:00", "11:45", "15:00", "15:45", "16:30"];

const formatKey = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromKeyToDate = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const ensureDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (typeof value === "string") {
    return fromKeyToDate(value);
  }
  if (typeof value === "number") {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  if (typeof value === "object" && "date" in value) {
    return ensureDate(value.date);
  }
  return null;
};

const pickDoctors = (seed) => {
  const doctors = [];
  for (let i = 0; i < Math.min(2, doctorPool.length); i += 1) {
    doctors.push(doctorPool[(seed + i) % doctorPool.length]);
  }
  return doctors;
};

const generateAvailability = () => {
  const availability = [];
  const cursor = new Date(today);
  let addedDays = 0;

  while (availability.length < 6) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);

    if (cursor.getDay() === 0) {
      continue;
    }

    const key = formatKey(cursor);
    const slots = baseHours.map((time, index) => {
      const isBooked = ((index + addedDays) % 4) === 0;
      return {
        time,
        status: isBooked ? "booked" : "available",
        doctors: isBooked ? [] : pickDoctors(index + addedDays),
      };
    });

    const hasAvailability = slots.some((slot) => slot.status === "available");
    if (!hasAvailability) {
      continue;
    }

    availability.push({ date: key, slots });
    addedDays += 1;
  }

  return availability;
};

const availabilityData = generateAvailability();

const availabilityMap = computed(() => {
  const map = new Map();
  availabilityData.forEach((entry) => {
    map.set(entry.date, entry.slots);
  });
  return map;
});

if (availabilityData.length > 0) {
  selectedDate.value = fromKeyToDate(availabilityData[0].date);
}

const isDateExcluded = (candidate) => {
  const date = ensureDate(candidate);
  if (!date) return true;
  if (date < today) return true;
  if (date.getDay() === 0) return true;
  return !availabilityMap.value.has(formatKey(date));
};

const disabledDateRules = computed(() => [
  {
    predicate: (date) => isDateExcluded(date),
  },
]);

const selectedDateKey = computed(() => {
  const date = ensureDate(selectedDate.value);
  return date ? formatKey(date) : null;
});

const slotsForSelectedDate = computed(() => {
  if (!selectedDateKey.value) return [];
  return availabilityMap.value.get(selectedDateKey.value) ?? [];
});

const formattedSelectedDate = computed(() => {
  const date = ensureDate(selectedDate.value);
  if (!date) return "--";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "full" }).format(date);
});

watch(selectedDateKey, () => {
  selectedSlot.value = null;
});

watch(activeTab, (tab) => {
  if (tab !== "time") {
    selectedSlot.value = null;
  }
});

const selectSlot = (slot) => {
  if (slot.status !== "available") return;
  selectedSlot.value = { ...slot, dateKey: selectedDateKey.value };
};

const isSlotSelected = (slot) => {
  if (!selectedSlot.value) return false;
  return (
    selectedSlot.value.dateKey === selectedDateKey.value &&
    selectedSlot.value.time === slot.time
  );
};

const tabButtonClass = (tab) => [
  "rounded-full px-6 py-2 font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/40",
  activeTab.value === tab
    ? "bg-white text-[#200934]"
    : "bg-[#2c0a71] text-white hover:bg-[#2c0a71]/80",
];

const slotButtonClass = (slot) => {
  const base = "w-full rounded-xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/40";
  if (slot.status !== "available") {
    return [base, "cursor-not-allowed border-white/10 bg-white/5 text-white/50"];
  }
  if (isSlotSelected(slot)) {
    return [base, "border-white bg-white text-[#200934]"];
  }
  return [base, "border-white/20 bg-white/10 hover:bg-white hover:text-[#200934]"];
};

const setActiveTab = (tab) => {
  activeTab.value = tab;
};
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
</style>
