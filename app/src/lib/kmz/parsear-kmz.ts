import { File } from "expo-file-system";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import type { LatLon } from "@/lib/geo/geometria";

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

/** Saca el anillo exterior de un nodo `<Polygon>` ya parseado —
 * `outerBoundaryIs > LinearRing > coordinates`. Ignora agujeros
 * (`innerBoundaryIs`), igual que la versión anterior de este parser: ningún
 * lote real usado hasta ahora tuvo un agujero adentro, y sumar soporte para
 * eso sin un caso real para probarlo es más riesgo que beneficio. */
function anilloExteriorDePoligono(poligono: unknown): LatLon[] | null {
  if (poligono == null || typeof poligono !== "object") return null;
  const coords = (poligono as any)?.outerBoundaryIs?.LinearRing?.coordinates;
  if (typeof coords !== "string") return null;
  const puntos = parsearTuplasCoordenadas(coords);
  return puntos.length >= 3 ? puntos : null;
}

/** Busca recursivamente todos los `<Polygon>` del árbol KML ya parseado —
 * a diferencia de la versión anterior (que juntaba CUALQUIER nodo
 * `coordinates` del archivo entero y se quedaba con el de más vértices),
 * esto apunta específicamente al tag `Polygon`, así que no confunde el
 * perímetro real con otra geometría suelta que pueda traer el archivo
 * (una marca, un ícono, un `gx:Track`, etc.).
 *
 * Soporta que un mismo `Placemark` agrupe varios lotes no contiguos en un
 * único `<MultiGeometry>` con varios `<Polygon>` adentro (caso real: un
 * "campo" compuesto por lotes separados entre sí) — cada `Polygon`
 * encontrado, esté suelto o dentro de un `MultiGeometry`, es una "pieza"
 * de terreno independiente. `fast-xml-parser` devuelve un objeto si hay un
 * solo `Polygon` bajo el mismo padre, o un array si hay varios — se
 * normalizan los dos casos acá. */
function buscarPoligonos(nodo: unknown, resultados: LatLon[][] = []): LatLon[][] {
  if (nodo == null || typeof nodo !== "object") return resultados;
  const obj = nodo as Record<string, unknown>;
  if ("Polygon" in obj) {
    const candidatos = Array.isArray(obj.Polygon) ? obj.Polygon : [obj.Polygon];
    for (const candidato of candidatos) {
      const anillo = anilloExteriorDePoligono(candidato);
      if (anillo) resultados.push(anillo);
    }
  }
  for (const valor of Object.values(obj)) {
    if (Array.isArray(valor)) valor.forEach((v) => buscarPoligonos(v, resultados));
    else if (typeof valor === "object") buscarPoligonos(valor, resultados);
  }
  return resultados;
}

/** Abre el selector de archivos del sistema para elegir un .kmz/.kml. Devuelve
 * null si la persona cancela. */
export async function elegirArchivoKmz(): Promise<File | null> {
  try {
    // El tipo declarado de pickFileAsync en esta versión de expo-file-system
    // confunde su propia clase File con el File global del navegador —
    // el cast de acá esquiva ese bug de tipado, no cambia el comportamiento.
    // Ojo: NO pasar un mimeType tipo "*/*" acá — en iOS eso puede hacer que
    // justo los tipos "raros" como .kmz (sin UTI muy estándar) queden
    // bloqueados en el selector en vez de mostrarse. Sin filtro (undefined)
    // el picker nativo permite cualquier archivo.
    const resultado = (await File.pickFileAsync()) as unknown as File | File[] | null;
    if (!resultado) return null;
    return Array.isArray(resultado) ? (resultado[0] ?? null) : resultado;
  } catch {
    // Al cancelar el selector, algunos dispositivos rechazan la promesa en
    // vez de devolver null — lo tratamos igual, no es un error real.
    return null;
  }
}

/** Descomprime el KMZ (o lee el KML directo si no viene zipeado) y devuelve
 * el perímetro del campo/lote como una o más "piezas" — lista de vértices
 * {lat, lon} en orden, una por cada `<Polygon>` real encontrado. Casi
 * siempre es una sola pieza; puede haber varias si el campo está compuesto
 * por lotes no contiguos agrupados en un `<MultiGeometry>` (ver
 * `buscarPoligonos`). Nunca cae en silencio a datos de ejemplo: si algo
 * sale mal, tira un error con mensaje claro para que se muestre en
 * pantalla (ver subir-kmz.tsx). */
export async function extraerPerimetroDeArchivo(archivo: File): Promise<LatLon[][]> {
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
  const piezas = buscarPoligonos(arbol);

  if (piezas.length === 0) {
    throw new Error("No se encontró ningún polígono dentro del archivo.");
  }
  return piezas;
}
