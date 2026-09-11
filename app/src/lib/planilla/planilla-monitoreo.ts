// Planilla de monitoreo en Excel — a pedido del usuario: mientras la app
// todavía no se podía usar a campo, los datos se seguían tomando en papel
// y pasando a mano a un Excel. Esto permite bajar una planilla YA con
// todos los puntos del lote listados (para completarla en la compu) y
// volver a subirla para que la app cargue cada dato en su punto
// correspondiente, dejándolo cerrado (confirmado, en verde) igual que si
// se hubiera cargado a mano desde el celular en modo trabajo.
//
// El formato de la planilla es el que ya usaba el usuario en sus propias
// planillas de papel (columna "Punto" con el id "línea.punto", después
// BB/BAB en número y 4 columnas de plagas en SI/NO). Se lee por NOMBRE de
// columna, no por posición fija — tolera que el usuario reordene columnas,
// dejando por ejemplo la columna A vacía como en su plantilla original
// (Excel a veces la omite al leer, a veces no), y que haya una fila
// (título, vacía) antes del encabezado real.

import { File } from "expo-file-system";
import * as XLSX from "xlsx";

import { guardarYCompartirBinario, sanitizarNombreArchivo } from "@/lib/exportar/archivo";

// La librería xlsx usa `type: "array"`/`"buffer"` para leer y escribir en
// Node/browser, pero eso depende de cosas que no existen en React
// Native/Hermes (el global `Buffer` de Node, entre otras) — ahí se queda
// colgada sin tirar error. La propia guía de SheetJS para React Native
// recomienda usar siempre `type: "base64"`, así que se escribe/lee en
// base64 y acá se pasa a bytes a mano para no tocar
// `guardarYCompartirBinario` (que ya funciona bien para el shapefile).
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ADecoded(base64: string): Uint8Array {
  const limpio = base64.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of limpio) {
    const valor = BASE64_CHARS.indexOf(char);
    if (valor === -1) continue;
    buffer = (buffer << 6) | valor;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

const COLUMNA_PUNTO = "Punto";

// Cada entrada: el texto EXACTO de la columna en la planilla, a qué campo
// de `cargas` corresponde, y cómo interpretar lo que haya en esa celda.
// "numero" son las dos primeras columnas a completar (bicho bolita/babosa,
// contados cada 1/4 m²); "si_no" son las 4 columnas de plagas puntuales —
// a pedido del usuario: "en las dos primeras columnas se puedan poner
// números, y en las siguientes solo SI o NO".
const COLUMNAS_DATO = [
  { header: "BB (1/4 m2)", campo: "bicho", tipo: "numero" },
  { header: "BAB (1/4 m2)", campo: "babosa", tipo: "numero" },
  { header: "Huevos Babosa", campo: "huevoBabosas", tipo: "si_no" },
  { header: "Gusano Arroz", campo: "gusanoArroz", tipo: "si_no" },
  { header: "Isoca Cortadora", campo: "isocaCortadora", tipo: "si_no" },
  { header: "Gusano Blanco", campo: "gusanoBlanco", tipo: "si_no" },
] as const;

export interface FilaPlanilla {
  puntoId: string;
  bicho: number;
  babosa: number;
  huevoBabosas: boolean;
  gusanoArroz: boolean;
  isocaCortadora: boolean;
  gusanoBlanco: boolean;
}

export interface ResultadoPlanilla {
  filas: FilaPlanilla[];
  /** Filas que no se pudieron procesar (punto inexistente en el lote, un
   * número mal escrito, etc.) — no cortan el import entero, solo esa fila
   * puntual, y se le muestran a la persona al final para que sepa qué
   * revisar a mano. */
  errores: string[];
  /** IDs de puntos del lote cuya fila vino en blanco en ESTA planilla — a
   * pedido del usuario, la planilla que se sube manda para el lote
   * entero: un punto sin datos acá tiene que quedar sin datos en la app,
   * aunque antes hubiera tenido una carga (de una planilla previa o
   * hecha a mano). No incluye puntos con una fila con ALGÚN dato pero mal
   * escrito (esos quedan en `errores` y su carga previa, si tenía, se
   * respeta — un typo no tiene por qué borrar un dato real). Quien llama
   * a `parsearPlanillaExcel` es responsable de borrar la carga de estos
   * puntos (ver `eliminarCargas` en lib/db/cargas.ts). */
  puntosSinDato: string[];
}

/** Arma la planilla en blanco para un lote — una fila por punto, en el
 * mismo orden en que se recorre la grilla (línea y, dentro de cada línea,
 * número de punto), lista para bajar, completar en la compu y volver a
 * subir. */
function construirPlantilla(puntos: Array<{ linea: number; puntoNum: number }>): Uint8Array {
  const ordenados = [...puntos].sort((a, b) => a.linea - b.linea || a.puntoNum - b.puntoNum);
  const encabezado = [COLUMNA_PUNTO, ...COLUMNAS_DATO.map((c) => c.header)];
  const filas = ordenados.map((p) => [`${p.linea}.${p.puntoNum}`, ...COLUMNAS_DATO.map(() => null)]);
  const hoja = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Planilla");
  const base64 = XLSX.write(libro, { type: "base64", bookType: "xlsx" }) as string;
  return base64ADecoded(base64);
}

export async function exportarPlantillaExcel(puntos: Array<{ linea: number; puntoNum: number }>, nombreLote: string): Promise<void> {
  const nombre = sanitizarNombreArchivo(`Planilla ${nombreLote}`);
  const bytes = construirPlantilla(puntos);
  await guardarYCompartirBinario(
    `${nombre}.xlsx`,
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/** Abre el selector de archivos del sistema para elegir la planilla ya
 * completada — mismo criterio que elegirArchivoKmz (ver
 * lib/kmz/parsear-kmz.ts): sin mimeType, para no arriesgarse a que el
 * picker nativo bloquee justo el tipo de archivo que hace falta. */
export async function elegirArchivoExcel(): Promise<File | null> {
  try {
    const resultado = (await File.pickFileAsync()) as unknown as File | File[] | null;
    if (!resultado) return null;
    return Array.isArray(resultado) ? (resultado[0] ?? null) : resultado;
  } catch {
    // Al cancelar el selector, algunos dispositivos rechazan la promesa en
    // vez de devolver null — se trata igual, no es un error real.
    return null;
  }
}

function normalizarSiNo(valor: unknown): boolean {
  if (valor == null) return false;
  const texto = String(valor).trim().toUpperCase();
  return texto.startsWith("S"); // "SI", "SÍ", "S" — cualquier variante que empiece con S
}

/** `NaN` de vuelta es la señal de "esto no se pudo leer como número" —
 * distinto de 0 (que es un valor real y válido, "no encontré nada"). */
function normalizarNumero(valor: unknown): number {
  if (valor == null || valor === "") return 0;
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

/** Lee la planilla ya completada y la deja lista para cargar — matchea
 * cada fila contra los puntos REALES del lote (por "línea.número", no por
 * posición: la persona puede haber reordenado filas al completarla) y
 * junta errores en vez de cortar todo el import por una sola fila con
 * problemas — mejor cargar 44 de 45 puntos y avisar cuál faltó, que no
 * cargar ninguno por un solo error de tipeo. */
export async function parsearPlanillaExcel(
  archivo: File,
  puntosDelLote: Array<{ id: string; linea: number; puntoNum: number }>
): Promise<ResultadoPlanilla> {
  const base64 = await archivo.base64();
  const libro = XLSX.read(base64, { type: "base64" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja con datos.");

  const filasCrudas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: null });

  // Busca la fila de encabezados (la que tiene "Punto" en alguna celda) en
  // vez de asumir que es la primera fila — tolera una fila vacía o un
  // título arriba, como en la plantilla original del usuario.
  const indiceEncabezado = filasCrudas.findIndex((fila) =>
    fila.some((celda) => String(celda ?? "").trim().toLowerCase() === COLUMNA_PUNTO.toLowerCase())
  );
  if (indiceEncabezado === -1) {
    throw new Error(`No se encontró la columna "${COLUMNA_PUNTO}" en el archivo — ¿es la planilla correcta?`);
  }
  const encabezados = filasCrudas[indiceEncabezado].map((c) => String(c ?? "").trim().toLowerCase());
  const columnaPunto = encabezados.indexOf(COLUMNA_PUNTO.toLowerCase());
  const columnasDato = COLUMNAS_DATO.map((c) => ({ ...c, indice: encabezados.indexOf(c.header.toLowerCase()) }));

  const puntosPorId = new Map(puntosDelLote.map((p) => [`${p.linea}.${p.puntoNum}`, p]));

  const filas: FilaPlanilla[] = [];
  const errores: string[] = [];
  // Arranca con TODOS los puntos del lote — a pedido del usuario, la
  // planilla que se sube manda para el lote entero: un punto se saca de
  // acá recién cuando su fila trae algún dato (se haya podido cargar o
  // no, ver más abajo), nunca antes. Así, un punto que ni siquiera tiene
  // fila en la planilla (alguien borró esa fila a mano) también queda
  // sin datos, igual que uno con la fila en blanco.
  const puntosSinDato = new Set(puntosDelLote.map((p) => p.id));

  for (let i = indiceEncabezado + 1; i < filasCrudas.length; i++) {
    const fila = filasCrudas[i];
    const puntoTexto = String(fila[columnaPunto] ?? "").trim();
    if (!puntoTexto) continue; // fila vacía al final de la planilla — se ignora en silencio

    const punto = puntosPorId.get(puntoTexto);
    if (!punto) {
      errores.push(`Fila ${i + 1}: el punto "${puntoTexto}" no existe en este lote — se omitió.`);
      continue;
    }

    // La plantilla trae la columna "Punto" YA completa para el lote entero
    // (ver construirPlantilla) — así que `puntoTexto` nunca viene vacío,
    // se haya tocado esa fila o no. Sin este chequeo, un punto que la
    // persona todavía no monitoreó (todas las columnas de dato en blanco)
    // se cargaba igual con 0/NO en todo y quedaba confirmado — a un punto
    // de una carga real que da 0 en todo. Se salta en silencio (no es un
    // error, es sencillamente un punto que falta completar todavía) — y
    // se deja en `puntosSinDato`.
    const crudos = columnasDato.map((col) => (col.indice === -1 ? null : fila[col.indice]));
    const sinCompletar = crudos.every((v) => v == null || String(v).trim() === "");
    if (sinCompletar) continue;

    // Tiene ALGÚN dato — se saca de `puntosSinDato` acá, antes de validar
    // los números, para no borrar una carga previa real solo porque esta
    // fila tiene un typo (ese caso queda en `errores`, con la carga
    // vieja — si la tenía — intacta).
    puntosSinDato.delete(punto.id);

    const valores: Partial<Record<(typeof COLUMNAS_DATO)[number]["campo"], number | boolean>> = {};
    let filaValida = true;
    for (let c = 0; c < columnasDato.length; c++) {
      const col = columnasDato[c];
      const crudo = crudos[c];
      if (col.tipo === "numero") {
        const n = normalizarNumero(crudo);
        if (Number.isNaN(n)) {
          errores.push(`Fila ${i + 1} (punto ${puntoTexto}): "${col.header}" no es un número válido — se omitió esta fila.`);
          filaValida = false;
          break;
        }
        valores[col.campo] = n;
      } else {
        valores[col.campo] = normalizarSiNo(crudo);
      }
    }
    if (!filaValida) continue;

    filas.push({
      puntoId: punto.id,
      bicho: (valores.bicho as number) ?? 0,
      babosa: (valores.babosa as number) ?? 0,
      huevoBabosas: (valores.huevoBabosas as boolean) ?? false,
      gusanoArroz: (valores.gusanoArroz as boolean) ?? false,
      isocaCortadora: (valores.isocaCortadora as boolean) ?? false,
      gusanoBlanco: (valores.gusanoBlanco as boolean) ?? false,
    });
  }

  return { filas, errores, puntosSinDato: Array.from(puntosSinDato) };
}
