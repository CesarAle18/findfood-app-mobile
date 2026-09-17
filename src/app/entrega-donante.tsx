import { Redirect } from "expo-router";
/** Compatibilidad con enlaces de la versión anterior. */
export default function LegacyDelivery() {
  return <Redirect href="/detalle-donacion" />;
}
