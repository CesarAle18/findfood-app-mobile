import { colors } from "@/design/tokens";
import { todayInBogota } from "@/domain/mappers/dates";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Icon } from "./icon";
import { Animated, Pressing, dialogEnter, useActiveStyle } from "./motion";
import { Copy, Row } from "./ui";

export function calendarDays(year: number, month: number) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  return [
    ...Array(offset).fill(null),
    ...Array.from(
      { length: new Date(year, month + 1, 0).getDate() },
      (_, i) => i + 1,
    ),
  ] as (number | null)[];
}
const pad = (n: number) => String(n).padStart(2, "0");
/** `YYYYMMDD` of a `DD/MM/AAAA` date, to compare days. */
const dayKey = (date: string) => {
  const [day, month, year] = date.split("/").map(Number);
  return year * 10000 + month * 100 + day;
};
/** The first day of the month of a `DD/MM/AAAA` date. */
const monthOf = (date: string) => {
  const [, month, year] = date.split("/").map(Number);
  return new Date(year, month - 1, 1);
};
/** Today (Bogotá) as `DD/MM/AAAA`, and the first day of its month. */
function today() {
  const date = todayInBogota(Date.now());
  return { date, month: monthOf(date) };
}
/** Earliest year offered: the date parser rejects earlier ones (`MIN_YEAR` in `@/domain/mappers/dates`). */
const MIN_YEAR = 1900;
/** Years offered after the current one when no `maxDate` bounds the list. */
const YEARS_AHEAD = 10;
const YEAR_COLUMNS = 4;
const ROW_HEIGHT = 48;
const months = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
/** Selectores locales compartidos por Android, iOS y la vista web. */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = "date",
  error,
  disablePast = false,
  maxDate,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode?: "date" | "time";
  /** Validation message, shown below the field and announced with it. */
  error?: string;
  /** Date mode: days before today (Bogotá) cannot be picked. */
  disablePast?: boolean;
  /** Date mode, `DD/MM/AAAA`: later days cannot be picked; an empty value opens on its month. */
  maxDate?: string;
  /** Help shown below the field (when there is no error) and announced with it. */
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(today);
  const [month, setMonth] = useState(now.month);
  const [choosingYear, setChoosingYear] = useState(false);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const openBorder = useActiveStyle(open, { border: true });
  const action = {
    minHeight: 48,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  };
  const firstMonth = disablePast ? now.month : null;
  const lastMonth = maxDate ? monthOf(maxDate) : null;
  const atFirstMonth = firstMonth !== null && month <= firstMonth;
  const atLastMonth = lastMonth !== null && month >= lastMonth;
  const title = `${months[month.getMonth()]} ${month.getFullYear()}`;
  const firstYear = firstMonth ? firstMonth.getFullYear() : MIN_YEAR;
  const lastYear = lastMonth
    ? lastMonth.getFullYear()
    : Math.max(now.month.getFullYear() + YEARS_AHEAD, month.getFullYear());
  const years = Array.from(
    { length: Math.max(lastYear - firstYear + 1, 0) },
    (_, i) => firstYear + i,
  );
  // Two rows above the shown year, so it lands in view when the list opens.
  const yearRow = Math.floor(
    (Math.min(Math.max(month.getFullYear(), firstYear), lastYear) - firstYear) /
      YEAR_COLUMNS,
  );
  function show() {
    const current = today();
    setNow(current);
    const parts = value.split("/").map(Number);
    setMonth(
      parts.length === 3
        ? new Date(parts[2], parts[1] - 1, 1)
        : maxDate
          ? monthOf(maxDate)
          : current.month,
    );
    setChoosingYear(false);
    const time = value.split(":").map(Number);
    setHour(time[0] || 0);
    setMinute(time[1] || 0);
    setOpen(true);
  }
  /** Shows `year` on the same month, kept within `disablePast` and `maxDate`. */
  function pickYear(year: number) {
    let next = new Date(year, month.getMonth(), 1);
    if (firstMonth && next < firstMonth) next = firstMonth;
    if (lastMonth && next > lastMonth) next = lastMonth;
    setMonth(next);
    setChoosingYear(false);
  }
  return (
    <View style={{ flex: 1, gap: 9 }}>
      <Copy weight="bold" style={{ fontSize: 11 }}>
        {label}
      </Copy>
      <Pressing
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || "Seleccionar"}`}
        accessibilityHint={error || hint}
        onPress={show}
        surface={[
          {
            ...action,
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            backgroundColor: colors.surface,
          },
          openBorder,
        ]}
      >
        <Copy style={{ flex: 1 }}>
          {value || (mode === "date" ? "DD/MM/AAAA" : "HH:MM")}
        </Copy>
        <Icon name={mode === "date" ? "calendar" : "clock"} size={18} />
      </Pressing>
      {error ? (
        <View accessibilityLiveRegion="polite">
          <Copy style={{ fontSize: 11, lineHeight: 16, color: colors.danger }}>
            {error}
          </Copy>
        </View>
      ) : hint ? (
        <Copy tone="secondary" style={{ fontSize: 11, lineHeight: 16 }}>
          {hint}
        </Copy>
      ) : null}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 16,
            backgroundColor: "#00000055",
          }}
        >
          <Animated.View
            accessibilityViewIsModal
            entering={dialogEnter}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 14,
              padding: 12,
              maxHeight: "90%",
              width: "100%",
              maxWidth: 420,
              alignSelf: "center",
              gap: 12,
            }}
          >
            <Copy weight="bold">{label}</Copy>
            {mode === "date" && choosingYear ? (
              <>
                <Copy tone="secondary">Elige el año</Copy>
                <ScrollView
                  style={{ height: ROW_HEIGHT * 5.5 }}
                  contentOffset={{
                    x: 0,
                    y: Math.max(yearRow - 2, 0) * ROW_HEIGHT,
                  }}
                >
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {years.map((year) => {
                      const selected = year === month.getFullYear();
                      return (
                        <Pressable
                          key={year}
                          accessibilityRole="button"
                          accessibilityLabel={String(year)}
                          accessibilityState={{ selected }}
                          onPress={() => pickYear(year)}
                          style={{
                            ...action,
                            height: ROW_HEIGHT,
                            width: `${100 / YEAR_COLUMNS}%`,
                            borderRadius: 8,
                            backgroundColor: selected
                              ? colors.soft
                              : colors.surface,
                          }}
                        >
                          <Copy
                            tone={selected ? "primary" : "default"}
                            weight={selected ? "bold" : undefined}
                          >
                            {year}
                          </Copy>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            ) : mode === "date" ? (
              <ScrollView>
                <Row>
                  <Pressing
                    accessibilityRole="button"
                    accessibilityLabel="Mes anterior"
                    accessibilityState={{ disabled: atFirstMonth }}
                    disabled={atFirstMonth}
                    surface={{
                      ...action,
                      width: 48,
                      opacity: atFirstMonth ? 0.3 : 1,
                    }}
                    onPress={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() - 1, 1),
                      )
                    }
                  >
                    <Icon name="back" />
                  </Pressing>
                  <Pressing
                    accessibilityRole="button"
                    accessibilityLabel={`Elegir año, ${title}`}
                    onPress={() => setChoosingYear(true)}
                    style={{ flex: 1 }}
                    surface={{ ...action, borderRadius: 8 }}
                  >
                    <Copy tone="primary" weight="semibold">
                      {title}
                    </Copy>
                  </Pressing>
                  <Pressing
                    accessibilityRole="button"
                    accessibilityLabel="Mes siguiente"
                    accessibilityState={{ disabled: atLastMonth }}
                    disabled={atLastMonth}
                    surface={{
                      ...action,
                      width: 48,
                      opacity: atLastMonth ? 0.3 : 1,
                    }}
                    onPress={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() + 1, 1),
                      )
                    }
                  >
                    <Icon name="arrow" />
                  </Pressing>
                </Row>
                <View style={{ flexDirection: "row" }}>
                  {["L", "M", "X", "J", "V", "S", "D"].map((day) => (
                    <Copy
                      key={day}
                      style={{
                        width: "14.2857%",
                        textAlign: "center",
                        paddingVertical: 10,
                      }}
                    >
                      {day}
                    </Copy>
                  ))}
                </View>
                {/* La rejilla de días y las columnas de hora quedan sin animación de pulsación: son decenas de celdas y un valor animado por celda no se justifica en gama media. */}
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {calendarDays(month.getFullYear(), month.getMonth()).map(
                    (day, i) => {
                      const date = `${pad(day || 1)}/${pad(month.getMonth() + 1)}/${month.getFullYear()}`;
                      const isToday = date === now.date;
                      const outOfRange =
                        (disablePast && dayKey(date) < dayKey(now.date)) ||
                        (maxDate !== undefined &&
                          dayKey(date) > dayKey(maxDate));
                      const selected = value === date;
                      return day === null ? (
                        <View key={i} style={{ width: "14.2857%" }} />
                      ) : (
                        <Pressable
                          key={i}
                          accessibilityRole="button"
                          accessibilityLabel={isToday ? `${date}, hoy` : date}
                          accessibilityState={{
                            selected,
                            disabled: outOfRange,
                          }}
                          disabled={outOfRange}
                          onPress={() => {
                            onChange(date);
                            setOpen(false);
                          }}
                          style={{
                            ...action,
                            width: "14.2857%",
                            borderRadius: 8,
                            borderWidth: isToday ? 1 : 0,
                            borderColor: colors.primary,
                            opacity: outOfRange ? 0.3 : 1,
                            backgroundColor: selected
                              ? colors.soft
                              : colors.surface,
                          }}
                        >
                          <Copy
                            tone={selected || isToday ? "primary" : "default"}
                            weight={isToday ? "bold" : undefined}
                          >
                            {day}
                          </Copy>
                        </Pressable>
                      );
                    },
                  )}
                </View>
              </ScrollView>
            ) : (
              <>
                <Copy tone="secondary">
                  Selecciona hora y minutos (24 horas)
                </Copy>
                <Row>
                  {[
                    { title: "Hora", count: 24, selected: hour, set: setHour },
                    {
                      title: "Minutos",
                      count: 60,
                      selected: minute,
                      set: setMinute,
                    },
                  ].map((column) => (
                    <View key={column.title} style={{ flex: 1, gap: 8 }}>
                      <Copy weight="semibold">{column.title}</Copy>
                      <ScrollView
                        style={{ height: 220 }}
                        contentOffset={{ x: 0, y: column.selected * 48 }}
                      >
                        {Array.from({ length: column.count }, (_, n) => (
                          <Pressable
                            key={n}
                            accessibilityRole="radio"
                            accessibilityLabel={`${column.title}: ${pad(n)}`}
                            accessibilityState={{
                              checked: column.selected === n,
                            }}
                            onPress={() => column.set(n)}
                            style={{
                              ...action,
                              backgroundColor:
                                column.selected === n
                                  ? colors.soft
                                  : colors.surface,
                            }}
                          >
                            <Copy>{pad(n)}</Copy>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ))}
                </Row>
                <Pressing
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(`${pad(hour)}:${pad(minute)}`);
                    setOpen(false);
                  }}
                  surface={{
                    ...action,
                    backgroundColor: colors.soft,
                    borderRadius: 10,
                  }}
                >
                  <Copy tone="primary" weight="bold">
                    Confirmar {pad(hour)}:{pad(minute)}
                  </Copy>
                </Pressing>
              </>
            )}
            <Pressing
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              scale={1}
              surface={action}
            >
              <Copy tone="primary">Cancelar</Copy>
            </Pressing>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
