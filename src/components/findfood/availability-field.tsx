import { useState } from "react";
import {
  Animated,
  LayoutAnimationConfig,
  Pressing,
  enterItem,
  exitItem,
  itemLayout,
} from "./motion";
import { Copy, Section, SelectField, Stack } from "./ui";

const days = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const times = Array.from(
  { length: 48 },
  (_, i) =>
    `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);
const options = (values: string[]) =>
  values.map((value) => ({ label: value, value }));
type Slot = { id: number; day: string; start: string; end: string };
export function AvailabilityField({
  onChange,
}: {
  onChange: (value: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([
    { id: 1, day: "Lunes", start: "08:00", end: "18:00" },
  ]);
  function commit(next: Slot[]) {
    setSlots(next);
    onChange(next.map((s) => `${s.day} · ${s.start}–${s.end}`).join("; "));
  }
  function update(id: number, patch: Partial<Slot>) {
    commit(
      slots.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (next.end <= next.start)
          next.end = times[times.indexOf(next.start) + 1];
        return next;
      }),
    );
  }
  return (
    <Section title="Disponibilidad *">
      <Copy tone="secondary">
        Selecciona un día y su horario. Puedes añadir varios días.
      </Copy>
      <LayoutAnimationConfig skipEntering>
        {slots.map((slot, index) => (
          <Animated.View
            key={slot.id}
            entering={enterItem}
            exiting={exitItem}
            layout={itemLayout}
          >
            <Stack gap={12}>
              <SelectField
                label={`Día ${index + 1}`}
                value={slot.day}
                onChange={(day) => update(slot.id, { day })}
                options={options(
                  days.filter(
                    (day) =>
                      day === slot.day || !slots.some((s) => s.day === day),
                  ),
                )}
              />
              <SelectField
                label={`Desde · ${slot.day}`}
                value={slot.start}
                onChange={(start) => update(slot.id, { start })}
                options={options(times.slice(0, -1))}
              />
              <SelectField
                label={`Hasta · ${slot.day}`}
                value={slot.end}
                onChange={(end) => update(slot.id, { end })}
                options={options(times.filter((time) => time > slot.start))}
              />
              {slots.length > 1 && (
                <Pressing
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${slot.day}`}
                  onPress={() => commit(slots.filter((s) => s.id !== slot.id))}
                  scale={1}
                  surface={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Copy tone="primary">Quitar día</Copy>
                </Pressing>
              )}
            </Stack>
          </Animated.View>
        ))}
      </LayoutAnimationConfig>
      {slots.length < 7 && (
        <Pressing
          accessibilityRole="button"
          onPress={() =>
            commit([
              ...slots,
              {
                id: Math.max(...slots.map((s) => s.id)) + 1,
                day: days.find((day) => !slots.some((s) => s.day === day))!,
                start: "08:00",
                end: "18:00",
              },
            ])
          }
          scale={1}
          surface={{ minHeight: 48, justifyContent: "center" }}
        >
          <Copy tone="primary" weight="bold">
            Añadir día
          </Copy>
        </Pressing>
      )}
    </Section>
  );
}
