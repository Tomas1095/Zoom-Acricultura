// Cola de cambios pendientes — cada fila es "algo que la persona hizo en
// la app pero que todavía no llegó al server" (guardar los datos de un
// punto, o subir una foto). Portado de la idea de `CambioPendiente` en
// types/domain.ts, pero separado en dos formas de payload (carga/foto,
// ver abajo) porque son acciones bien distintas: una es un upsert a la
// tabla `cargas`, la otra primero sube un archivo a Storage y recién
// después toca la fila — no tiene sentido forzarlas al mismo shape.

import { getDb } from "./db";
import type { CamposCarga } from "@/lib/db/cargas";

export interface CambioPendienteCarga {
  tipo: "carga";
  puntoId: string;
  campana: string;
  campos: CamposCarga;
  cargadoPorId: string;
}

export interface CambioPendienteFoto {
  tipo: "foto";
  puntoId: string;
  campana: string;
  loteId: string;
  // URI local del archivo (de la cámara o la galería) — se sube recién
  // cuando se procesa la cola. Vive en la carpeta temporal del picker, así
  // que si el sistema operativo la limpia antes de que haya señal (poco
  // común, pero puede pasar) ese cambio puntual se pierde — mismo riesgo
  // que ya existía si la persona cerraba la app antes de que terminara de
  // subir. No se copia a un lugar más permanente para no complicar el
  // alcance de esta primera versión.
  uriLocal: string;
  cargadoPorId: string;
}

export type PayloadCambioPendiente = CambioPendienteCarga | CambioPendienteFoto;

export interface CambioPendienteFila {
  id: string;
  payload: PayloadCambioPendiente;
  creadoEn: string;
  intentos: number;
  ultimoError: string | null;
}

interface FilaCruda {
  id: string;
  tipo: string;
  payload: string;
  creado_en: string;
  intentos: number;
  ultimo_error: string | null;
}

function filaAObjeto(f: FilaCruda): CambioPendienteFila {
  return {
    id: f.id,
    payload: JSON.parse(f.payload),
    creadoEn: f.creado_en,
    intentos: f.intentos,
    ultimoError: f.ultimo_error,
  };
}

/** Encola un cambio que no se pudo mandar al server en el momento — se
 * intenta de nuevo más adelante (ver lib/offline/sincronizar.ts), sin que
 * la persona tenga que volver a escribir nada. */
export function agregarCambioPendiente(payload: PayloadCambioPendiente): string {
  const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  getDb().runSync(
    `INSERT INTO cambios_pendientes (id, tipo, punto_id, campana, payload, creado_en, intentos, ultimo_error)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    id,
    payload.tipo,
    payload.puntoId,
    payload.campana,
    JSON.stringify(payload),
    new Date().toISOString()
  );
  return id;
}

/** En orden de creación — así si dos cambios pendientes tocan el mismo
 * punto (por ej. guardar los datos y después una foto), se reintentan en
 * el mismo orden en que se hicieron. */
export function listarCambiosPendientes(): CambioPendienteFila[] {
  const filas = getDb().getAllSync<FilaCruda>(`SELECT * FROM cambios_pendientes ORDER BY creado_en ASC`);
  return filas.map(filaAObjeto);
}

export function contarCambiosPendientes(): number {
  const fila = getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) as n FROM cambios_pendientes`);
  return fila?.n ?? 0;
}

export function eliminarCambioPendiente(id: string): void {
  getDb().runSync(`DELETE FROM cambios_pendientes WHERE id = ?`, id);
}

export function marcarIntentoFallido(id: string, error: string): void {
  getDb().runSync(`UPDATE cambios_pendientes SET intentos = intentos + 1, ultimo_error = ? WHERE id = ?`, error, id);
}
