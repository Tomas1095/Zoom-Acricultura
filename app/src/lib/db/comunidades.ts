// Comunidades (multi-tenant) — ver supabase/schema.sql para el porqué y las
// reglas de alta. Portado de la idea del prototipo (NOMBRE_COMUNIDAD en
// reference/prototipo-app.jsx), ahora de verdad soportando más de una.

import { supabase } from "@/lib/supabase";
import type { Comunidad } from "@/types/domain";
import { filaAComunidad } from "./mappers";

/** Pide crear una comunidad nueva — NO es inmediato: queda "pendiente"
 * hasta que el administrador de la plataforma la aprueba (a pedido
 * explícito del usuario, para que nadie arranque una comunidad "así porque
 * sí"). Quien la pide ya queda como Socio Fundador de esa comunidad, pero
 * sin poder hacer nada hasta la aprobación — ver app/comunidad-pendiente.tsx. */
export async function solicitarComunidad(nombreComunidad: string, nombrePersona: string): Promise<void> {
  const { error } = await supabase.rpc("solicitar_comunidad", {
    p_nombre_comunidad: nombreComunidad.trim(),
    p_nombre_persona: nombrePersona.trim(),
  });
  if (error) throw error;
}

/** Una solicitud de comunidad, con el nombre/mail de quien la pidió ya
 * resueltos (útil para la pantalla de revisión) — RLS solo deja ver esto a
 * quien administra la plataforma (ver adminPlataforma en Usuario). */
export interface ComunidadPendiente extends Comunidad {
  creadorNombre: string | null;
  creadorMail: string | null;
}

export async function fetchComunidadesPendientes(): Promise<ComunidadPendiente[]> {
  const { data, error } = await supabase.from("comunidades").select("*").eq("estado", "pendiente").order("created_at");
  if (error) throw error;
  const comunidades = (data ?? []).map(filaAComunidad);

  const ids = comunidades.map((c) => c.creadaPorId).filter((id): id is string => !!id);
  const porId = new Map<string, { nombre: string; mail: string }>();
  if (ids.length > 0) {
    const { data: usuarios, error: usuariosError } = await supabase.from("usuarios").select("id,nombre,mail").in("id", ids);
    if (usuariosError) throw usuariosError;
    for (const u of usuarios ?? []) porId.set(u.id, { nombre: u.nombre, mail: u.mail });
  }

  return comunidades.map((c) => ({
    ...c,
    creadorNombre: c.creadaPorId ? (porId.get(c.creadaPorId)?.nombre ?? null) : null,
    creadorMail: c.creadaPorId ? (porId.get(c.creadaPorId)?.mail ?? null) : null,
  }));
}

/** Cuántas solicitudes hay esperando — para el aviso en "Mis lotes" (ver
 * (app)/index.tsx), sin traer todos los datos solo para mostrar un número. */
export async function contarComunidadesPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from("comunidades")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  if (error) throw error;
  return count ?? 0;
}

export async function revisarComunidad(comunidadId: string, aprobar: boolean): Promise<void> {
  const { error } = await supabase.rpc("revisar_comunidad", { p_comunidad_id: comunidadId, p_aprobar: aprobar });
  if (error) throw error;
}
