import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { FranjaDto } from "@/api/types";
import { groupFranjas, type AvailabilityBlock } from "@/domain/mappers/availability-summary";
import { bogotaWeekdayAndTime } from "@/domain/mappers/dates";

import { Card, Copy } from "./ui";

const NO_HOURS = "Sin horario";

/**
 * The weekly availability in a few rows (`Lun – Mié  08:00 – 18:00`): the days on the left,
 * every window of those days on the right. The row holding today (Bogotá) reads in the
 * primary color; days without a schedule read muted, today included.
 *
 * @param now Epoch milliseconds, only to find today's row.
 */
export function AvailabilitySchedule({
  franjas,
  now,
}: {
  franjas: readonly FranjaDto[];
  now: number;
}) {
  const blocks = useMemo(() => groupFranjas(franjas), [franjas]);
  const today = bogotaWeekdayAndTime(now).dia;
  return (
    <Card soft>
      {blocks.length === 0 ? (
        <Copy>Sin horario registrado</Copy>
      ) : (
        blocks.map((block) => (
          <ScheduleRow key={block.label} block={block} isToday={block.days.includes(today)} />
        ))
      )}
    </Card>
  );
}

function ScheduleRow({ block, isToday }: { block: AvailabilityBlock; isToday: boolean }) {
  const hoursTone = block.empty ? "secondary" : isToday ? "primary" : "default";
  const hours = block.empty ? NO_HOURS : block.ranges.join(", ");
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${block.label}: ${hours}${isToday ? ", hoy" : ""}`}
    >
      <Copy weight="semibold" tone={isToday ? "primary" : "default"}>
        {block.label}
      </Copy>
      <View style={styles.ranges}>
        {block.empty ? (
          <Copy tone={hoursTone}>{NO_HOURS}</Copy>
        ) : (
          block.ranges.map((range) => (
            <Copy key={range} tone={hoursTone} weight={isToday ? "medium" : "regular"}>
              {range}
            </Copy>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  ranges: { alignItems: "flex-end", gap: 2 },
});
