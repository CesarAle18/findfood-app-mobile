/**
 * react-native-maps on iOS and Android. The map components import it from here so that web
 * resolves `maps.web.tsx` instead: the library only ships native views and fails on import
 * there. Both files keep the `.tsx` extension: Metro tries each extension in turn and the
 * platform suffix only within it, so a `maps.ts` would win over `maps.web.tsx` on web.
 */
export { default as MapView, Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
export type { MapViewProps } from "react-native-maps";
