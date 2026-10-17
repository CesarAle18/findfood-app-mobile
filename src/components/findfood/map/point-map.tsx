import { useMemo } from "react";

import type { Coordenada } from "@/api/types";
import { regionForPoints, toLatLng } from "@/domain/mappers/geo";

import { FindFoodMap } from "./find-food-map";
import { Marker } from "./maps";

/** A static preview of one point (the pickup), for detail screens. */
export function PointMap({
  point,
  title,
  height = 200,
}: {
  point: Coordenada;
  title: string;
  height?: number;
}) {
  const { lat, lng } = point;
  const coordinate = useMemo(() => toLatLng({ lat, lng }), [lat, lng]);
  const region = useMemo(() => regionForPoints([coordinate]), [coordinate]);
  return (
    <FindFoodMap
      testID="point-map"
      height={height}
      interactive={false}
      liteMode
      region={region}
      accessibilityLabel={`Mapa: ${title}`}
    >
      <Marker coordinate={coordinate} title={title} />
    </FindFoodMap>
  );
}
