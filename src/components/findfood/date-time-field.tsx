import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Copy, Row } from "./ui";
import { colors } from "@/design/tokens";
import { Icon } from "./icon";

export function calendarDays(year: number, month: number) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  return [...Array(offset).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1)] as (number | null)[];
}
const pad = (n: number) => String(n).padStart(2, "0");
const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Selectores locales compartidos por Android, iOS y la vista web. */
export function DateTimeField({ label, value, onChange, mode = "date" }: {
  label: string; value: string; onChange: (value: string) => void; mode?: "date" | "time";
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const action = { minHeight: 48, justifyContent: "center" as const, alignItems: "center" as const };
  function show() {
    const parts = value.split("/").map(Number);
    setMonth(parts.length === 3 ? new Date(parts[2], parts[1] - 1, 1) : new Date());
    const time = value.split(":").map(Number);
    setHour(time[0] || 0); setMinute(time[1] || 0); setOpen(true);
  }
  return <View style={{ flex: 1, gap: 9 }}>
    <Copy weight="bold" style={{ fontSize: 11 }}>{label}</Copy>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || "Seleccionar"}`} onPress={show} style={{ ...action, flexDirection: "row", gap: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface }}>
      <Copy style={{ flex: 1 }}>{value || (mode === "date" ? "DD/MM/AAAA" : "HH:MM")}</Copy><Icon name={mode === "date" ? "calendar" : "clock"} size={18} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: "center", padding: 16, backgroundColor: "#00000055" }}>
        <View accessibilityViewIsModal style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12, maxHeight: "90%", width: "100%", maxWidth: 420, alignSelf: "center", gap: 12 }}>
          <Copy weight="bold">{label}</Copy>
          {mode === "date" ? <ScrollView>
            <Row>
              <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" style={{ ...action, width: 48 }} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="back" /></Pressable>
              <Copy weight="semibold" style={{ flex: 1, textAlign: "center" }}>{months[month.getMonth()]} {month.getFullYear()}</Copy>
              <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" style={{ ...action, width: 48 }} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="arrow" /></Pressable>
            </Row>
            <View style={{ flexDirection: "row" }}>{["L", "M", "X", "J", "V", "S", "D"].map(day => <Copy key={day} style={{ width: "14.2857%", textAlign: "center", paddingVertical: 10 }}>{day}</Copy>)}</View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{calendarDays(month.getFullYear(), month.getMonth()).map((day, i) => {
              const date = `${pad(day || 1)}/${pad(month.getMonth() + 1)}/${month.getFullYear()}`;
              return day === null ? <View key={i} style={{ width: "14.2857%" }} /> : <Pressable key={i} accessibilityRole="button" accessibilityLabel={date} accessibilityState={{ selected: value === date }} onPress={() => { onChange(date); setOpen(false); }} style={{ ...action, width: "14.2857%", borderRadius: 8, backgroundColor: value === date ? colors.soft : colors.surface }}><Copy tone={value === date ? "primary" : "default"}>{day}</Copy></Pressable>;
            })}</View>
          </ScrollView> : <>
            <Copy tone="secondary">Selecciona hora y minutos (24 horas)</Copy>
            <Row>
              {[{ title: "Hora", count: 24, selected: hour, set: setHour }, { title: "Minutos", count: 60, selected: minute, set: setMinute }].map(column => <View key={column.title} style={{ flex: 1, gap: 8 }}>
                <Copy weight="semibold">{column.title}</Copy>
                <ScrollView style={{ height: 220 }} contentOffset={{ x: 0, y: column.selected * 48 }}>{Array.from({ length: column.count }, (_, n) => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${column.title}: ${pad(n)}`} accessibilityState={{ checked: column.selected === n }} onPress={() => column.set(n)} style={{ ...action, backgroundColor: column.selected === n ? colors.soft : colors.surface }}><Copy>{pad(n)}</Copy></Pressable>)}</ScrollView>
              </View>)}
            </Row>
            <Pressable accessibilityRole="button" onPress={() => { onChange(`${pad(hour)}:${pad(minute)}`); setOpen(false); }} style={{ ...action, backgroundColor: colors.soft, borderRadius: 10 }}><Copy tone="primary" weight="bold">Confirmar {pad(hour)}:{pad(minute)}</Copy></Pressable>
          </>}
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={action}><Copy tone="primary">Cancelar</Copy></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}
