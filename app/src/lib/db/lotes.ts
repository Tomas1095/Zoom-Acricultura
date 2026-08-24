import { supabase } from "@/lib/supabase";
import type { Cliente, Establecimiento, Lote } from "@/types/domain";
import { filaACliente, filaAEstablecimiento, filaALote } from "./mappers";

export interface Arbol {
  clientes: Cliente[];
  establecimientos: Establecimiento[];
  lotes: Lote[];
}

/** Trae todo el árbol accesible para el usuario actual — RLS hace el
 * filtrado: un administrador ve todo, un Monitoreador solo lo que cuelga de
 * sus lotes asignados (ver supabase/schema.sql). */
export async function fetchArbol(): Promise<Arbol> {
  const [c, e, l] = await Promise.all([
    supabase.from("clientes").select("*").order("nombre"),
    supabase.from("establecimientos").select("*").order("nombre"),
    supabase.from("lotes").select("*").order("nombre"),
  ]);
  if (c.error) throw c.error;
  if (e.error) throw e.error;
  if (l.error) throw l.error;
  return {
    clientes: (c.data ?? []).map(filaACliente),
    establecimientos: (e.data ?? []).map(filaAEstablecimiento),
    lotes: (l.data ?? []).map(filaALote),
  };
}

export async function crearCliente(nombre: string): Promise<Cliente> {
  const { data, error } = await supabase.from("clientes").insert({ nombre }).select().single();
  if (error) throw error;
  return filaACliente(data);
}

export async function editarCliente(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from("clientes").update({ nombre }).eq("id", id);
  if (error) throw error;
}

export async function eliminarCliente(id: string): Promise<void> {
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw error;
}

export async function crearEstablecimiento(clienteId: string, nombre: string): Promise<Establecimiento> {
  const { data, error } = await supabase
    .from("establecimientos")
    .insert({ cliente_id: clienteId, nombre })
    .select()
    .single();
  if (error) throw error;
  return filaAEstablecimiento(data);
}

export async function eliminarEstablecimiento(id: string): Promise<void> {
  const { error } = await supabase.from("establecimientos").delete().eq("id", id);
  if (error) throw error;
}

export async function crearLote(establecimientoId: string, nombre: string, cultivo: string): Promise<Lote> {
  const { data, error } = await supabase
    .from("lotes")
    .insert({ establecimiento_id: establecimientoId, nombre, cultivo: cultivo || "Sin especificar" })
    .select()
    .single();
  if (error) throw error;
  return filaALote(data);
}

export async function editarLote(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from("lotes").update({ nombre }).eq("id", id);
  if (error) throw error;
}

export async function eliminarLote(id: string): Promise<void> {
  const { error } = await supabase.from("lotes").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAccesos(loteId: string): Promise<string[]> {
  const { data, error } = await supabase.from("accesos").select("usuario_id").eq("lote_id", loteId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.usuario_id as string);
}

export async function otorgarAcceso(loteId: string, usuarioId: string): Promise<void> {
  const { error } = await supabase.from("accesos").insert({ lote_id: loteId, usuario_id: usuarioId });
  if (error) throw error;
}

export async function revocarAcceso(loteId: string, usuarioId: string): Promise<void> {
  const { error } = await supabase.from("accesos").delete().eq("lote_id", loteId).eq("usuario_id", usuarioId);
  if (error) throw error;
}
