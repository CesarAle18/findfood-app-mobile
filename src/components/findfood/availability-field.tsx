import type { FranjaDto } from "@/api/types";
import { END_OF_DAY, MAX_FRANJAS, WEEK_DAYS, dayLabel } from "@/domain/mappers/franjas";

import {
  Animated,
  LayoutAnimationConfig,
  Pressing,
  enterItem,
  exitItem,
  itemLayout,
} from "./motion";
import { Copy, FormMessage, Section, SelectField, Stack } from "./ui";

/** Every half hour; an end can also be `23:59` (a window never crosses midnight). */
const times = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);
const startOptions = times.map((value) => ({ label: value, value }));
const endTimes = [...times.slice(1), END_OF_DAY];
const dayOptions = WEEK_DAYS.map(({ dia, label }) => ({ label, value: String(dia) }));

/** A new window: the first day without one (Monday when all have one), 08:00–18:00. */
function nextFranja(value: readonly FranjaDto[]): FranjaDto {
  const free = WEEK_DAYS.find(({ dia }) => !value.some((f) => f.dia_semana === dia));
  return { dia_semana: free?.dia ?? 1, hora_inicio: "08:00", hora_fin: "18:00" };
}

/** Moving the start past the end pushes the end to the next option. */
function withPatch(franja: FranjaDto, patch: Partial<FranjaDto>): FranjaDto {
  const next = { ...franja, ...patch };
  if (patch.hora_inicio !== undefined && next.hora_fin <= next.hora_inicio) {
    next.hora_fin = endTimes.find((time) => time > next.hora_inicio) ?? END_OF_DAY;
  }
  return next;
}

/**
 * Weekly windows, controlled: `value` is what `PUT /voluntario/disponibilidad` sends
 * (`dia_semana` 0 = Sunday, `HH:mm`). A day can hold several windows; `error` explains the
 * first broken rule (see `validateFranjas`).
 */
export function AvailabilityField({
  value,
  onChange,
  error,
  title = "Disponibilidad *",
}: {
  value: readonly FranjaDto[];
  onChange: (value: FranjaDto[]) => void;
  error?: string;
  title?: string;
}) {
  const update = (index: number, patch: Partial<FranjaDto>) =>
    onChange(value.map((franja, i) => (i === index ? withPatch(franja, patch) : franja)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  return (
    <Section title={title}>
      <Copy tone="secondary">
        Elige los días y horarios en los que puedes recoger donaciones. Puedes añadir varias
        franjas al mismo día.
      </Copy>
      {value.length === 0 ? <Copy tone="secondary">Sin franjas registradas.</Copy> : null}
      <LayoutAnimationConfig skipEntering>
        {value.map((franja, index) => {
          const day = dayLabel(franja.dia_semana);
          return (
            <Animated.View
              // Windows have no id; the position is their identity while editing.
              key={index}
              entering={enterItem}
              exiting={exitItem}
              layout={itemLayout}
            >
              <Stack gap={12}>
                <SelectField
                  label={`Franja ${index + 1}`}
                  value={String(franja.dia_semana)}
                  onChange={(dia) => update(index, { dia_semana: Number(dia) })}
                  options={dayOptions}
                />
                <SelectField
                  label={`Desde · ${day}`}
                  value={franja.hora_inicio}
                  onChange={(hora_inicio) => update(index, { hora_inicio })}
                  options={startOptions}
                />
                <SelectField
                  label={`Hasta · ${day}`}
                  value={franja.hora_fin}
                  onChange={(hora_fin) => update(index, { hora_fin })}
                  options={endTimes
                    .filter((time) => time > franja.hora_inicio)
                    .map((time) => ({ label: time, value: time }))}
                />
                <Pressing
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar franja ${index + 1} (${day})`}
                  onPress={() => remove(index)}
                  scale={1}
                  surface={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Copy tone="primary">Quitar franja</Copy>
                </Pressing>
              </Stack>
            </Animated.View>
          );
        })}
      </LayoutAnimationConfig>
      {value.length < MAX_FRANJAS ? (
        <Pressing
          accessibilityRole="button"
          onPress={() => onChange([...value, nextFranja(value)])}
          scale={1}
          surface={{ minHeight: 48, justifyContent: "center" }}
        >
          <Copy tone="primary" weight="bold">
            Añadir franja
          </Copy>
        </Pressing>
      ) : null}
      <FormMessage message={error} />
    </Section>
  );
}
