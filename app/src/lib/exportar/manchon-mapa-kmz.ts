// "Exportar Manchón + Mapa" — a pedido del usuario: un KMZ con el mapa de
// densidad (las celdas de Voronoi, cada una como su propio polígono
// coloreado — igual a como las exportaba desde ArcGIS) Y el polígono del
// manchón juntos, para abrir en Google Earth y ahí retocar el manchón a
// mano con mouse en vez de con el dedo en el celular — mucho más preciso
// en campos grandes. A diferencia de "Exportar Manchón" (ver
// manchones.ts), esto NO es una imagen pegada: son polígonos KML de
// verdad, así que se ve exactamente igual acercando o alejando el zoom.

import JSZip from "jszip";
import type { CeldaDensidad } from "@/lib/geo/densidad";
import { xyALatLon, type LatLon, type XY } from "@/lib/geo/geometria";
import { guardarYCompartirBinario, sanitizarNombreArchivo } from "./archivo";
import { manchonesValidos } from "./manchones";
import { escapeXml } from "./xml";

/** KML pide el color como AABBGGRR (alfa, azul, verde, rojo) en hex — al
 * revés del "#RRGGBB" que usa el resto de la app (ver lib/geo/densidad.ts,
 * NIVEL_COLORES). */
function colorKml(hexRRGGBB: string, alfaHex = "ff"): string {
  const limpio = hexRRGGBB.replace("#", "");
  const r = limpio.slice(0, 2);
  const g = limpio.slice(2, 4);
  const b = limpio.slice(4, 6);
  return `${alfaHex}${b}${g}${r}`;
}

function poligonoKml(vertices: XY[], origen: LatLon): string {
  const cerrado = [...vertices, vertices[0]];
  return cerrado
    .map((v) => {
      const { lat, lon } = xyALatLon(origen, v);
      return `${lon.toFixed(7)},${lat.toFixed(7)},0`;
    })
    .join(" ");
}

export function construirKMLManchonYMapa(
  manchones: XY[][],
  celdas: CeldaDensidad[],
  nivelColores: readonly string[],
  nombreLote: string,
  origen: LatLon,
  prefijo: string
): string {
  // Densidad primero, manchón después — en KML/Google Earth los Placemark
  // se dibujan en orden de documento, así que el manchón queda ARRIBA de
  // las celdas de color (es lo que hay que ver y retocar), no tapado por
  // ellas.
  const celdasKml = celdas
    .map(
      (c) =>
        `    <Placemark>\n      <Style><PolyStyle><color>${colorKml(nivelColores[c.nivel])}</color><outline>0</outline></PolyStyle></Style>\n      <Polygon><outerBoundaryIs><LinearRing><coordinates>${poligonoKml(c.poligono, origen)}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>\n`
    )
    .join("");

  const manchonKml = manchonesValidos(manchones)
    .map(
      (m, i) =>
        `    <Placemark>\n      <name>${escapeXml(`${prefijo} ${i + 1} - ${nombreLote || "Lote"}`)}</name>\n      <Style><PolyStyle><color>7d3fa07b</color></PolyStyle></Style>\n      <Polygon><outerBoundaryIs><LinearRing><coordinates>${poligonoKml(m, origen)}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>\n`
    )
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n` +
    `  <name>${escapeXml(`${prefijo} + Mapa - ${nombreLote || "Lote"}`)}</name>\n` +
    `  <Folder>\n    <name>Densidad</name>\n${celdasKml}  </Folder>\n` +
    `  <Folder>\n    <name>Manchón</name>\n${manchonKml}  </Folder>\n` +
    `</Document>\n</kml>`
  );
}

export async function exportarKMZManchonYMapa(
  manchones: XY[][],
  celdas: CeldaDensidad[],
  nivelColores: readonly string[],
  nombreLote: string,
  origen: LatLon,
  nombreArchivo: string,
  prefijo: string
): Promise<void> {
  const kml = construirKMLManchonYMapa(manchones, celdas, nivelColores, nombreLote, origen, prefijo);
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const kmz = await zip.generateAsync({ type: "uint8array" });
  await guardarYCompartirBinario(`${sanitizarNombreArchivo(nombreArchivo)}.kmz`, kmz, "application/vnd.google-earth.kmz");
}
