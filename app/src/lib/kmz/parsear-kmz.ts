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

// Firma de un archivo ZIP real ("PK\x03\x04", el número mágico del
// formato — un .kmz no es más que un .kml comprimido en ZIP) — mirar esto
// permite decidir si hay que descomprimir o no leyendo apenas los
// primeros 4 bytes del archivo, no el archivo entero.
const FIRMA_ZIP = [0x50, 0x4b, 0x03, 0x04];

function empiezaComoZip(primerosBytes: Uint8Array): boolean {
  return FIRMA_ZIP.every((b, i) => primerosBytes[i] === b);
}

/** Descomprime el KMZ (o lee el KML directo si no viene zipeado) y devuelve
 * el perímetro del campo/lote como una o más "piezas" — lista de vértices
 * {lat, lon} en orden, una por cada `<Polygon>` real encontrado. Casi
 * siempre es una sola pieza; puede haber varias si el campo está compuesto
 * por lotes no contiguos agrupados en un `<MultiGeometry>` (ver
 * `buscarPoligonos`). Nunca cae en silencio a datos de ejemplo: si algo
 * sale mal, tira un error con mensaje claro para que se muestre en
 * pantalla (ver subir-kmz.tsx).
 *
 * Si es KMZ (comprimido) o KML plano se decide mirando el CONTENIDO real
 * (¿empieza con la firma de un ZIP?), no la extensión del nombre del
 * archivo — en Android, eligiendo el archivo desde Drive/WhatsApp/Gmail,
 * el selector del sistema no siempre devuelve el nombre con la extensión
 * puesta (bug real reportado por un usuario: un .kmz de verdad, con
 * nombre sin ".kmz" al final, se leía como si fuera texto plano — el ZIP
 * binario interpretado como texto UTF-8 daba una mezcla de símbolos sin
 * sentido, y el parser de XML fallaba con un error indescifrable,
 * "readTagExp returned undefined"). Mirando el contenido en vez del
 * nombre, esto funciona sin importar cómo haya llegado el archivo.
 *
 * OJO con leer el archivo dos veces acá — un primer intento de este mismo
 * arreglo abría el archivo COMPLETO en base64 para "probar" si era un
 * zip, y si no lo era, lo volvía a leer COMPLETO como texto: en un KMZ
 * grande de verdad, en un Android de gama más chica (con un techo de
 * memoria bastante más bajo que un iPhone), eso se quedaba sin memoria a
 * mitad de camino ("OutOfMemoryError", bug real reportado por un
 * usuario). Por eso el chequeo del contenido se hace con una lectura
 * MÍNIMA (los primeros 4 bytes, vía `archivo.open()`), y recién después
 * se hace la ÚNICA lectura completa que hace falta — bytes crudos (no
 * base64, que pesa un 33% más en memoria) si es zip, texto si no. */
export async function extraerPerimetroDeArchivo(archivo: File): Promise<LatLon[][]> {
  const handle = archivo.open();
  let primerosBytes: Uint8Array;
  try {
    primerosBytes = handle.readBytes(FIRMA_ZIP.length);
  } finally {
    handle.close();
  }

  let xml: string;
  if (empiezaComoZip(primerosBytes)) {
    const bytes = await archivo.bytes();
    const zip = await JSZip.loadAsync(bytes);
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
