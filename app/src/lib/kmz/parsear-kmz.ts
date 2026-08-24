import { File } from "expo-file-system";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import type { LatLon } from "@/lib/geo/geometria";

/** Busca recursivamente cualquier nodo `coordinates` dentro del árbol KML ya
 * parseado. No asumimos una estructura fija (Document > Folder > Placemark
 * > Polygon > outerBoundaryIs > LinearRing > coordinates) porque distintos
 * programas (Google Earth, QGIS, etc.) anidan distinto — juntamos todos los
 * candidatos y nos quedamos con el que tiene más vértices, que en la
 * práctica es el perímetro del lote (los demás suelen ser puntos sueltos o
 * líneas cortas). */
function buscarCoordenadas(nodo: unknown, resultados: string[] = []): string[] {
  if (nodo == null || typeof nodo !== "object") return resultados;
  const obj = nodo as Record<string, unknown>;
  if (typeof obj.coordinates === "string") resultados.push(obj.coordinates);
  for (const valor of Object.values(obj)) {
    if (Array.isArray(valor)) valor.forEach((v) => buscarCoordenadas(v, resultados));
    else if (typeof valor === "object") buscarCoordenadas(valor, resultados);
  }
  return resultados;
}

function parsearTuplasCoordenadas(texto: string): LatLon[] {
  return texto
    .trim()
    .split(/\s+/)
    .map((tupla) => {
      const [lon, lat] = tupla.split(",").map(Number);
      return { lat, lon };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** Abre el selector de archivos del sistema para elegir un .kmz/.kml. Devuelve
 * null si la persona cancela. */
export async function elegirArchivoKmz(): Promise<File | null> {
  try {
    // El tipo declarado de pickFileAsync en esta versión de expo-file-system
    // confunde su propia clase File con el File global del navegador —
    // el cast de acá esquiva ese bug de tipado, no cambia el comportamiento.
    const resultado = (await File.pickFileAsync(undefined, "*/*")) as unknown as File | File[] | null;
    if (!resultado) return null;
    return Array.isArray(resultado) ? (resultado[0] ?? null) : resultado;
  } catch {
    // Al cancelar el selector, algunos dispositivos rechazan la promesa en
    // vez de devolver null — lo tratamos igual, no es un error real.
    return null;
  }
}

/** Descomprime el KMZ (o lee el KML directo si no viene zipeado) y devuelve
 * el perímetro del lote como lista de {lat, lon} en orden. */
export async function extraerPerimetroDeArchivo(archivo: File): Promise<LatLon[]> {
  const esKmz = archivo.name.toLowerCase().endsWith(".kmz");
  let xml: string;

  if (esKmz) {
    const base64 = await archivo.base64();
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const nombreKml = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".kml"));
    if (!nombreKml) {
      throw new Error("El archivo no parece un KMZ válido: no tiene ningún .kml adentro.");
    }
    xml = await zip.files[nombreKml].async("string");
  } else {
    xml = await archivo.text();
  }

  const arbol = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const candidatos = buscarCoordenadas(arbol)
    .map(parsearTuplasCoordenadas)
    .filter((c) => c.length >= 3);

  if (candidatos.length === 0) {
    throw new Error("No se encontró ningún polígono dentro del archivo.");
  }
  candidatos.sort((a, b) => b.length - a.length);
  return candidatos[0];
}
