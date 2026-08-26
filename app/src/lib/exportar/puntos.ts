// Exportar la grilla completa de puntos de muestreo a GPX/KML — para
// llevarla a un GPS de mano o cargarla en apps de agricultura de precisión
// antes de ir al campo (a diferencia de manchones.ts, que exporta el
// polígono de aplicación calculado, esto es la lista de estaciones tal
// cual, una a una).

import { xyALatLon, type LatLon, type XY } from "@/lib/geo/geometria";
import { guardarYCompartirTexto, sanitizarNombreArchivo } from "./archivo";
import { escapeXml } from "./xml";

const GPX_HEADER =
  '<gpx version="1.1" creator="Monitoreo de plagas" ' +
  'xmlns="http://www.topografix.com/GPX/1/1" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">';

export interface PuntoGrillaExport {
  id: string; // "línea.punto", ej "1.4"
  x: number;
  y: number;
}

export function construirGPXPuntos(puntos: PuntoGrillaExport[], origen: LatLon): string {
  const wpts = puntos
    .map((p) => {
      const { lat, lon } = xyALatLon(origen, p);
      return `  <wpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"><name>${escapeXml(p.id)}</name></wpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${GPX_HEADER}\n${wpts}\n</gpx>`;
}

export function construirKMLPuntos(puntos: PuntoGrillaExport[], origen: LatLon): string {
  const placemarks = puntos
    .map((p) => {
      const { lat, lon } = xyALatLon(origen, p);
      return `  <Placemark>\n    <name>${escapeXml(p.id)}</name>\n    <Point><coordinates>${lon.toFixed(7)},${lat.toFixed(7)},0</coordinates></Point>\n  </Placemark>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n${placemarks}\n</Document>\n</kml>`;
}

export async function exportarPuntos(
  puntos: PuntoGrillaExport[],
  origen: LatLon,
  formato: "gpx" | "kml",
  nombreArchivo: string
): Promise<void> {
  const nombre = sanitizarNombreArchivo(nombreArchivo);
  if (formato === "gpx") {
    await guardarYCompartirTexto(`${nombre}.gpx`, construirGPXPuntos(puntos, origen), "application/gpx+xml");
  } else {
    await guardarYCompartirTexto(`${nombre}.kml`, construirKMLPuntos(puntos, origen), "application/vnd.google-earth.kml+xml");
  }
}
