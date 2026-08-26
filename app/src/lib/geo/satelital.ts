// Imagen satelital de fondo para el mapa de densidad. Usa el servicio de
// mapas estáticos de Bing Maps ("Aerial", sin etiquetas) en vez del
// World_Imagery gratuito de Esri que se usaba antes: probamos con datos
// reales que Esri devuelve buena imagen pero mal georreferenciada en zonas
// rurales de Argentina (el polígono del lote no coincidía con la foto,
// aunque el recorte pedido era matemáticamente correcto — confirmado
// ubicando el origen real del lote en Google Maps). Bing pide directo el
// recorte en lat/lon geográficas (no hace falta reproyectar a Web
// Mercator nosotros, lo resuelve el servicio) y en la práctica viene mejor
// alineado.
//
// A diferencia de Esri, esto SÍ necesita una API key (gratuita, sin
// tarjeta para el tier básico) — ver EXPO_PUBLIC_BING_MAPS_KEY en
// .env.example. Sin la key configurada, `construirUrlSatelital` devuelve
// `null` y el mapa de densidad se ve igual que sin foto de fondo (fondo
// claro liso) — no rompe nada.

import { xyALatLon, type LatLon } from "./geometria";

/** Arma la URL de la imagen satelital calculando el recorte exacto que hace
 * falta para que encaje pixel a pixel con lo que se dibuja encima (mismo
 * `origen`, `minX`/`minY`/`escala`/tamaño que usa el resto del mapa).
 * `null` si no hay `EXPO_PUBLIC_BING_MAPS_KEY` configurada. */
export function construirUrlSatelital(
  origen: LatLon,
  minX: number,
  minY: number,
  escala: number,
  w: number,
  h: number,
  padIzqPx: number,
  padArribaPx: number
): string | null {
  const key = process.env.EXPO_PUBLIC_BING_MAPS_KEY;
  if (!key) return null;

  const nw = xyALatLon(origen, { x: minX - padIzqPx / escala, y: minY - padArribaPx / escala });
  const se = xyALatLon(origen, { x: minX + (w - padIzqPx) / escala, y: minY + (h - padArribaPx) / escala });
  // mapArea: "sur,oeste,norte,este" en grados — NO es la esquina de la
  // imagen en sí (Bing reproyecta y ajusta el recorte real puertas adentro),
  // solo el área geográfica que tiene que quedar visible dentro del recuadro.
  const mapArea = `${se.lat},${nw.lon},${nw.lat},${se.lon}`;
  return (
    "https://dev.virtualearth.net/REST/v1/Imagery/Map/Aerial" +
    `?mapArea=${mapArea}&mapSize=${Math.max(1, Math.round(w))},${Math.max(1, Math.round(h))}` +
    `&format=png&key=${encodeURIComponent(key)}`
  );
}
