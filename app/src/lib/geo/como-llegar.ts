import type { LatLon } from "./geometria";

/** Abre Google Maps pidiéndole la ruta calculada de verdad, desde donde esté
 * parada la persona en el momento que toca el botón, hasta el centro real
 * del lote — portado de `urlComoLlegar` del prototipo. En la app nativa no
 * hace falta el `<a href>` real que pedía Safari para archivos locales (ver
 * reference/CONTEXTO.md, líos técnicos #2): `Linking.openURL` alcanza. */
export function urlComoLlegar(destino: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lon}&travelmode=driving`;
}
