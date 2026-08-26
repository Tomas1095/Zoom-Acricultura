// Imagen satelital de fondo para el mapa de densidad — portado tal cual de
// `construirUrlSatelital`/`lonLatAWebMercator` del prototipo. Usa el
// servicio público "World Imagery" de Esri (server.arcgisonline.com):
// gratuito, sin cuenta ni API key — es el mismo que ya venía probado y
// funcionando en el prototipo. Si en algún momento el volumen de uso real
// lo justifica, se puede evaluar pasar a un plan pago con más garantías de
// disponibilidad, pero no hace falta para arrancar.

import { xyALatLon, type LatLon, type XY } from "./geometria";

const RADIO_TIERRA_M = 6378137; // WGS84

/** Lon/lat (grados) -> Web Mercator (metros) — la proyección que usa
 * internamente el servicio de Esri (y casi todo servicio de mapas web,
 * incluido Google Maps). Pedir la imagen directo en Web Mercator evita que
 * el servidor tenga que reproyectar (lo que distorsionaría la forma del
 * recorte, no sería una simple rotación). */
function lonLatAWebMercator(lon: number, lat: number): XY {
  const x = (RADIO_TIERRA_M * lon * Math.PI) / 180;
  const y = RADIO_TIERRA_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { x, y };
}

/** Arma la URL de la imagen satelital calculando el recorte exacto que
 * hace falta para que encaje pixel a pixel con lo que se dibuja encima
 * (mismo `origen`, `minX`/`minY`/`escala`/tamaño que usa el resto del
 * mapa). */
export function construirUrlSatelital(
  origen: LatLon,
  minX: number,
  minY: number,
  escala: number,
  w: number,
  h: number,
  padIzqPx: number,
  padArribaPx: number
): string {
  const nw = xyALatLon(origen, { x: minX - padIzqPx / escala, y: minY - padArribaPx / escala });
  const se = xyALatLon(origen, { x: minX + (w - padIzqPx) / escala, y: minY + (h - padArribaPx) / escala });
  const nwM = lonLatAWebMercator(nw.lon, nw.lat);
  const seM = lonLatAWebMercator(se.lon, se.lat);
  const bbox = `${nwM.x},${seM.y},${seM.x},${nwM.y}`;
  return (
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
    `?bbox=${bbox}&bboxSR=102100&imageSR=102100&size=${Math.max(1, Math.round(w))},${Math.max(1, Math.round(h))}&format=png32&f=image`
  );
}
