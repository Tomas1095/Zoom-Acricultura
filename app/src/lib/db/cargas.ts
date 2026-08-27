import { supabase } from "@/lib/supabase";
import type { Carga } from "@/types/domain";

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
    sincronizado: true,
    updatedAt: f.updated_at,
  };
}

export async function fetchCarga(puntoId: string, campana: string): Promise<Carga | null> {
  const { data, error } = await supabase
    .from("cargas")
    .select("*")
    .eq("punto_id", puntoId)
    .eq("campana", campana)
    .maybeSingle();
  if (error) throw error;
  return data ? filaACarga(data) : null;
}

export interface CamposCarga {
  bicho: number;
  babosa: number;
  huevoBabosas: boolean;
  gusanoArroz: boolean;
  isocaCortadora: boolean;
  gusanoBlanco: boolean;
  observaciones: string;
}

/** Guarda todos los campos de una sola vez y confirma el punto — portado
 * del botón único "Confirmar y cerrar punto"/"Guardar cambios" del
 * prototipo. A diferencia de ahí (donde cada tecla escribía directo al
 * estado en memoria), acá se junta todo en un solo guardado: escribir a
 * la base en cada tecla sería lento e innecesario con red real de por
 * medio — fotos sí se suben al toque (ver lib/storage/fotos.ts), porque
 * son acciones puntuales, no texto que se sigue editando. */
export async function guardarYConfirmarCarga(
  puntoId: string,
  campana: string,
  campos: CamposCarga,
  cargadoPorId: string
): Promise<void> {
  const { error } = await supabase.from("cargas").upsert(
    {
      punto_id: puntoId,
      campana,
      bicho: campos.bicho,
      babosa: campos.babosa,
      huevo_babosas: campos.huevoBabosas,
      gusano_arroz: campos.gusanoArroz,
      isoca_cortadora: campos.isocaCortadora,
      gusano_blanco: campos.gusanoBlanco,
      observaciones: campos.observaciones,
      cargado: true,
      confirmado: true,
      cargado_por_id: cargadoPorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "punto_id,campana", ignoreDuplicates: false }
  );
  if (error) throw error;
}

/** Reabre un punto ya confirmado para poder editarlo — portado de
 * `reabrirPunto`. Deja `cargado_por_id` como estaba (no cambia de dueño
 * solo por reabrirlo). */
export async function reabrirCarga(puntoId: string, campana: string): Promise<void> {
  const { error } = await supabase
    .from("cargas")
    .update({ confirmado: false })
    .eq("punto_id", puntoId)
    .eq("campana", campana);
  if (error) throw error;
}

export async function agregarFotoACarga(
  puntoId: string,
  campana: string,
  path: string,
  cargadoPorId: string
): Promise<void> {
  const existente = await fetchCarga(puntoId, campana);
  const fotos = [...(existente?.fotos ?? []), path];
  const { error } = await supabase.from("cargas").upsert(
    {
      punto_id: puntoId,
      campana,
      fotos,
      cargado: true,
      cargado_por_id: existente?.cargadoPorId ?? cargadoPorId,
      // sin esto el upsert pisaría bicho/babosa/etc con los defaults de la
      // tabla si la fila no existía todavía
      ...(existente
        ? {}
        : {
            bicho: 0,
            babosa: 0,
            huevo_babosas: false,
            gusano_arroz: false,
            isoca_cortadora: false,
            gusano_blanco: false,
            observaciones: "",
          }),
    },
    { onConflict: "punto_id,campana" }
  );
  if (error) throw error;
}

export async function quitarFotoDeCarga(puntoId: string, campana: string, path: string): Promise<void> {
  const existente = await fetchCarga(puntoId, campana);
  if (!existente) return;
  const fotos = existente.fotos.filter((f) => f !== path);
  const { error } = await supabase.from("cargas").update({ fotos }).eq("punto_id", puntoId).eq("campana", campana);
  if (error) throw error;
}

/** Un punto que dos personas cargaron sin señal, cuyo cambio más nuevo
 * quedó en espera en vez de pisar al que ya estaba confirmado — ver
 * `guardarCargaDetectandoConflicto` y supabase/migrations/0004_conflictos_de_carga.sql.
 * Incluye línea/punto_num del punto (vía el join) para mostrar el cartel
 * sin una consulta aparte. */
export interface CargaEnConflicto {
  id: string;
  cargaActivaId: string;
  puntoId: string;
  campana: string;
  bicho: number;
  babosa: number;
  huevoBabosas: boolean;
  gusanoArroz: boolean;
  isocaCortadora: boolean;
  gusanoBlanco: boolean;
  observaciones: string;
  cargadoPorId: string | null;
  creadoEn: string;
  linea: number;
  puntoNum: number;
}

function filaAConflicto(f: any): CargaEnConflicto {
  return {
    id: f.id,
    cargaActivaId: f.carga_activa_id,
    puntoId: f.punto_id,
    campana: f.campana,
    bicho: f.bicho,
    babosa: f.babosa,
    huevoBabosas: f.huevo_babosas,
    gusanoArroz: f.gusano_arroz,
    isocaCortadora: f.isoca_cortadora,
    gusanoBlanco: f.gusano_blanco,
    observaciones: f.observaciones,
    cargadoPorId: f.cargado_por_id,
    creadoEn: f.creado_en,
    linea: f.puntos.linea,
    puntoNum: f.puntos.punto_num,
  };
}

async function guardarConflictoDeCarga(
  cargaActivaId: string,
  puntoId: string,
  campana: string,
  campos: CamposCarga,
  cargadoPorId: string
): Promise<void> {
  const { error } = await supabase.from("cargas_en_conflicto").insert({
    carga_activa_id: cargaActivaId,
    punto_id: puntoId,
    campana,
    bicho: campos.bicho,
    babosa: campos.babosa,
    huevo_babosas: campos.huevoBabosas,
    gusano_arroz: campos.gusanoArroz,
    isoca_cortadora: campos.isocaCortadora,
    gusano_blanco: campos.gusanoBlanco,
    observaciones: campos.observaciones,
    cargado_por_id: cargadoPorId,
  });
  if (error) throw error;
}

/** Conflictos sin resolver de todo el lote — para el cartel que ven Socio
 * Fundador/Gerente al entrar (ver ConflictosBanner). */
export async function fetchConflictosDeLote(loteId: string): Promise<CargaEnConflicto[]> {
  const { data, error } = await supabase
    .from("cargas_en_conflicto")
    .select("*, puntos!inner(lote_id, linea, punto_num)")
    .eq("puntos.lote_id", loteId)
    .order("creado_en");
  if (error) throw error;
  return (data ?? []).map(filaAConflicto);
}

/** El Socio Gerente/Fundador decide: `quedarseConNueva` reemplaza la carga
 * activa por la versión en conflicto, o si es `false` la descarta y deja
 * la que ya estaba — la función en el server (`resolver_conflicto_carga`)
 * lo hace atómico y vuelve a chequear el permiso ahí, no solo acá. */
export async function resolverConflictoCarga(conflictoId: string, quedarseConNueva: boolean): Promise<void> {
  const { error } = await supabase.rpc("resolver_conflicto_carga", {
    p_conflicto_id: conflictoId,
    p_quedarse_con_nueva: quedarseConNueva,
  });
  if (error) throw error;
}

/** Guarda un cambio de la cola de sincronización, pero sin pisar en
 * silencio una carga que otra persona ya confirmó — si el punto ya está
 * confirmado por OTRO usuario, el cambio nuevo queda en
 * `cargas_en_conflicto` en vez de sobreescribir (ver migración 0004). Solo
 * hace falta este chequeo acá, al sincronizar la cola offline: es el único
 * momento en que puede haber dos versiones de un mismo punto compitiendo —
 * dos celulares que cargaron el mismo punto sin señal y sincronizan
 * después. El guardado en vivo (con señal, sin cola de por medio) sigue
 * usando `guardarYConfirmarCarga` directo. */
export async function guardarCargaDetectandoConflicto(
  puntoId: string,
  campana: string,
  campos: CamposCarga,
  cargadoPorId: string
): Promise<{ conflicto: boolean }> {
  const existente = await fetchCarga(puntoId, campana);
  if (existente?.confirmado && existente.cargadoPorId && existente.cargadoPorId !== cargadoPorId) {
    await guardarConflictoDeCarga(existente.id, puntoId, campana, campos, cargadoPorId);
    return { conflicto: true };
  }
  await guardarYConfirmarCarga(puntoId, campana, campos, cargadoPorId);
  return { conflicto: false };
}
