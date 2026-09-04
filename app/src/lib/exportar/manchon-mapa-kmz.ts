// "Exportar Manchón + Mapa" — a pedido del usuario: un KMZ con el mapa de
// densidad (las celdas de Voronoi, cada una como su propio polígono de
// verdad — igual a como las exportaba desde ArcGIS) Y el polígono del
// manchón juntos, para abrir en Google Earth y ahí retocar el manchón a
// mano con mouse en vez de con el dedo en el celular — mucho más preciso
// en campos grandes. A diferencia de "Exportar Manchón" (ver
// manchones.ts), esto NO es una imagen pegada: son polígonos KML de
// verdad, así que se ve exactamente igual acercando o alejando el zoom.
// El manchón nunca lleva relleno — solo el borde verde, para no tapar la
// foto satelital de fondo mientras se lo retoca. Las celdas de densidad sí
// llevan relleno de color, pero SOLO donde hay dato cargado — las que
// todavía no tienen dato quedan vacías (ver el comentario de
// construirKMLManchonYMapa para el detalle completo).

import JSZip from "jszip";
import type { CeldaDensidad } from "@/lib/geo/densidad";
import { xyALatLon, type LatLon, type XY } from "@/lib/geo/geometria";
import { colors } from "@/theme/colors";
import { guardarYCompartirBinario, sanitizarNombreArchivo } from "./archivo";
import { manchonesValidos } from "./manchones";
import { colorKml, escapeXml } from "./xml";

function poligonoKml(vertices: XY[], origen: LatLon): string {
  const cerrado = [...vertices, vertices[0]];
  return cerrado
    .map((v) => {
      const { lat, lon } = xyALatLon(origen, v);
      return `${lon.toFixed(7)},${lat.toFixed(7)},0`;
    })
    .join(" ");
}

// Blanco fijo para el borde de cada celda (antes usaba el color del nivel)
// — a pedido del usuario, para que el cuadriculado contraste contra el
// verde del manchón en vez de mimetizarse con celdas de su mismo color.
const BORDE_CELDA_KML = colorKml("#FFFFFF");

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
  //
  // El cuadriculado (el borde de cada celda) se ve SIEMPRE, tenga o no
  // tenga densidad cargada — en blanco, para contrastar contra el manchón
  // verde. El relleno de color, en cambio, es a pedido del usuario "tal
  // cual es el mapa": las celdas CON dato cargado (`c.cargado`) llevan el
  // mismo color sólido que en la pantalla de Resultados/Manchoneo; las que
  // todavía no tienen dato quedan sin relleno, para que ahí se vea la
  // foto satelital de fondo de Google Earth (útil para saber qué falta
  // recorrer).
  const celdasKml = celdas
    .map((c) => {
      const relleno = c.cargado ? `<color>${colorKml(nivelColores[c.nivel])}</color><fill>1</fill>` : `<fill>0</fill>`;
      return `    <Placemark>\n      <Style><LineStyle><color>${BORDE_CELDA_KML}</color><width>1.5</width></LineStyle><PolyStyle>${relleno}<outline>1</outline></PolyStyle></Style>\n      <Polygon><outerBoundaryIs><LinearRing><coordinates>${poligonoKml(c.poligono, origen)}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>\n`;
    })
    .join("");

  const manchonKml = manchonesValidos(manchones)
    .map(
      (m, i) =>
        `    <Placemark>\n      <name>${escapeXml(`${prefijo} ${i + 1} - ${nombreLote || "Lote"}`)}</name>\n      <Style><LineStyle><color>${colorKml(colors.primary)}</color><width>3</width></LineStyle><PolyStyle><fill>0</fill><outline>1</outline></PolyStyle></Style>\n      <Polygon><outerBoundaryIs><LinearRing><coordinates>${poligonoKml(m, origen)}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>\n`
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
