/**
 * The volunteer's cold chain and operation zone fields, shared by the volunteer request and
 * the profile editor: the base point on the map, with the coverage radius drawn around it.
 */
import type { Coordenada } from "@/api/types";
import { LocationPicker } from "@/components/findfood/map";

import { Choices, Copy, Field, FormMessage } from "./ui";

const REFRIGERATION = ["Sí, dispone", "No dispone"];
/** What the API stores when the request leaves the field empty (`radio_cobertura_km = 10`). */
const DEFAULT_COVERAGE_KM = 10;

/**
 * The radius the map draws: the API only offers donations inside it (hard filter). None
 * while the typed value is out of range, so the map never shows a radius it would reject.
 */
export function coverageKm(typed: string): number | undefined {
  if (!typed.trim()) return DEFAULT_COVERAGE_KM;
  const km = Number(typed.replace(",", "."));
  return Number.isFinite(km) && km >= 1 && km <= 100 ? km : undefined;
}

/** "Cadena de frío" as a yes/no choice. */
export function ColdChainChoice({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <>
      <Copy weight="medium" style={{ fontSize: 12 }}>
        Cadena de frío
      </Copy>
      <Choices
        values={REFRIGERATION}
        selected={value ? 0 : 1}
        onChange={(index) => onChange(index === 0)}
      />
    </>
  );
}

/** The props `useZodForm().field()` returns for a text field. */
type TextFieldProps = {
  value: string;
  error: string | undefined;
  onChangeText: (text: string) => void;
  onBlur: () => void;
};

/** The base point picker, its error and the coverage radius field. */
export function OperationZoneFields({
  location,
  onLocationChange,
  locationError,
  radius,
}: {
  location: Coordenada | null;
  onLocationChange: (point: Coordenada) => void;
  locationError: string | undefined;
  radius: TextFieldProps;
}) {
  return (
    <>
      <Copy tone="secondary">Mueve el mapa hasta el punto desde el que sueles salir.</Copy>
      <LocationPicker
        value={location}
        onChange={(point) => onLocationChange(point)}
        coverageKm={coverageKm(radius.value)}
      />
      <FormMessage message={locationError} />
      <Field
        label="Radio de cobertura (km)"
        {...radius}
        placeholder="10"
        keyboardType="decimal-pad"
      />
    </>
  );
}
