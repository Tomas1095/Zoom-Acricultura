import { supabase } from "@/lib/supabase";
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

/** Trae las cargas de la campaña vigente del lote, como mapa punto_id ->
 * Carga, para pintar el estado de cada estación en el mapa. */
export async function fetchCargasDeLote(loteId: string, campana: string): Promise<Map<string, Carga>> {
  const { data, error } = await supabase
    .from("cargas")
    .select("*, puntos!inner(lote_id)")
    .eq("campana", campana)
    .eq("puntos.lote_id", loteId);
  if (error) throw error;
  const mapa = new Map<string, Carga>();
  (data ?? []).forEach((f: any) => mapa.set(f.punto_id, filaACarga(f)));
  return mapa;
}
