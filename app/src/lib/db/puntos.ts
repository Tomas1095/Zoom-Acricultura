import { supabase } from "@/lib/supabase";
import { inferirOrigenDesdePuntos, type LatLon } from "@/lib/geo/geometria";
import type { Carga, Punto } from "@/types/domain";

function filaAPunto(f: any): Punto {
  return { id: f.id, loteId: f.lote_id, linea: f.linea, puntoNum: f.punto_num, lat: f.lat, lon: f.lon, x: f.x, y: f.y };
}

function filaACarga(f: any): Carga {
  return {
    id: f.id,
    puntoId: f.punto_id,
    campana: f.campana,
    bicho: f.bicho,
    babosa: f.babosa,
    huevoBabosas: f.huevo_babosas,
    gusanoArroz: f.gusano_arroz,
    isocaCortadora: f.isoca_cortadora,
    gusanoBlanco: f.gusano_blanco,
    humedad: f.humedad,
    observaciones: f.observaciones,
    fotos: f.fotos ?? [],
    cargado: f.cargado,
    confirmado: f.confirmado,
    cargadoPorId: f.cargado_por_id,
    conflictoConId: f.conflicto_con_id,
    sincronizado: true, // si vino del server, está sincronizada por definición
    updatedAt: f.updated_at,
  };
}

export async function fetchPuntosDeLote(loteId: string): Promise<Punto[]> {
  const { data, error } = await supabase.from("puntos").select("*").eq("lote_id", loteId).order("linea").order("punto_num");
  if (error) throw error;
  return (data ?? []).map(filaAPunto);
}

/** Un solo punto puntual, por línea+número dentro del lote — para la
 * pantalla de un punto (ver punto/[puntoId].tsx), que antes pedía TODOS
 * los puntos del lote (fetchPuntosDeLote entero) solo para buscar ahí
 * adentro este único punto. Reportado por el usuario: con lotes grandes
 * (cientos de puntos) esto se sentía lento en cada toque de un punto —
 * mismo tipo de desperdicio que ya se había arreglado para entrar a un
 * lote (ver fetchLoteConEstablecimiento en db/lotes.ts). */
export async function fetchPunto(loteId: string, linea: number, puntoNum: number): Promise<Punto | null> {
  const { data, error } = await supabase
    .from("puntos")
    .select("*")
    .eq("lote_id", loteId)
    .eq("linea", linea)
    .eq("punto_num", puntoNum)
    .maybeSingle();
  if (error) throw error;
  return data ? filaAPunto(data) : null;
}

/** Centro real del lote, para "Cómo llegar" desde la lista principal —
 * mismo cálculo que usa la vista de campo (ver inferirOrigenDesdePuntos). */
export async function fetchCentroDeLote(loteId: string): Promise<LatLon | null> {
  const puntos = await fetchPuntosDeLote(loteId);
  if (puntos.length === 0) return null;
  return inferirOrigenDesdePuntos(puntos);
}

/** Trae las cargas de la campaña vigente del lote, como mapa punto_id ->
 * Carga, para pintar el estado de cada estación en el mapa.
 *
 * Recibe los IDs de los puntos (no el loteId) a propósito — antes hacía
 * `cargas` join `puntos` filtrando por `puntos.lote_id`, y esa combinación
 * (join + política de seguridad evaluada por fila sobre la tabla unida) es
 * bastante más cara para Postgres que un simple `punto_id = any(...)`, que
 * además usa de lleno el índice que ya existe en `cargas (punto_id,
 * campana)`. Confirmado en el campo: con varias personas entrando al MISMO
 * lote a la vez (algo normal en el trabajo real, no un caso raro — todo un
 * equipo mira o carga sobre el mismo lote junto), esta consulta seguía
 * cayendo en 57014 (timeout de Postgres) incluso después de subir el plan
 * de Supabase. Quien llama ya tiene los puntos del lote (los pidió aparte,
 * ver fetchPuntosDeLote) así que no hace falta volver a pedirlos ni
 * cruzar tablas para esto. */
export async function fetchCargasDeLote(puntoIds: string[], campana: string): Promise<Map<string, Carga>> {
  const mapa = new Map<string, Carga>();
  if (puntoIds.length === 0) return mapa;
  const { data, error } = await supabase.from("cargas").select("*").eq("campana", campana).in("punto_id", puntoIds);
  if (error) throw error;
  (data ?? []).forEach((f: any) => mapa.set(f.punto_id, filaACarga(f)));
  return mapa;
}

/** Campañas con datos cargados de este lote (para el selector de historial
 * en Resultados — ver ResultadosView). No hay una tabla de campañas aparte:
 * se sacan directo de qué valores distintos de `campana` tienen las cargas
 * ya guardadas. Puede no incluir la campaña actual si todavía no se cargó
 * ningún punto — quien llame esto debería sumarla igual, para que el
 * selector siempre muestre la vigente.
 *
 * Recibe los IDs de los puntos, mismo motivo que fetchCargasDeLote más
 * arriba: evita el join contra `puntos` (acá encima sin filtrar por
 * campaña, así que barre TODA la historia de cargas del lote — más caro
 * todavía) a favor de un filtro directo por punto_id, que sí usa el
 * índice existente. */
export async function fetchCampanasDeLote(puntoIds: string[]): Promise<string[]> {
  if (puntoIds.length === 0) return [];
  const { data, error } = await supabase.from("cargas").select("campana").in("punto_id", puntoIds);
  if (error) throw error;
  const set = new Set<string>((data ?? []).map((f: any) => f.campana as string));
  return Array.from(set).sort().reverse(); // más reciente primero (formato "25/26" ordena bien como texto)
}
