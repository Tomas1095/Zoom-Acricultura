import { supabase } from "@/lib/supabase";
import type { Invitacion, Usuario } from "@/types/domain";
import { filaAInvitacion, filaAUsuario } from "./mappers";

export async function fetchUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.from("usuarios").select("*").order("nombre");
  if (error) throw error;
  return (data ?? []).map(filaAUsuario);
}

export async function fetchInvitaciones(): Promise<Invitacion[]> {
  const { data, error } = await supabase
    .from("invitaciones")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(filaAInvitacion);
}

function codigoAleatorio(): string {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I, para que no se confundan al dictarlo
  let c = "";
  for (let i = 0; i < 6; i++) c += letras[Math.floor(Math.random() * letras.length)];
  return `EQUIPO-${c}`;
}

/** Genera un código de invitación de un solo uso. Reintenta si por azar
 * choca con uno ya existente (34^6 combinaciones, prácticamente nunca pasa,
 * pero el constraint unique en `codigo` lo garantiza igual). */
export async function generarInvitacion(creadoPorId: string): Promise<string> {
  for (let intento = 0; intento < 3; intento++) {
    const codigo = codigoAleatorio();
    const { error } = await supabase.from("invitaciones").insert({ codigo, creado_por_id: creadoPorId });
    if (!error) return codigo;
    if (error.code !== "23505") throw error; // no es choque de unique -> error real
  }
  throw new Error("No se pudo generar un código de invitación, probá de nuevo.");
}

export async function cambiarRolUsuario(usuarioId: string, nuevoRol: "socio_gerente" | "encargado" | "monitoreador") {
  const { error } = await supabase.rpc("cambiar_rol_usuario", { p_usuario_id: usuarioId, p_nuevo_rol: nuevoRol });
  if (error) throw error;
}

export async function transferirFundador(nuevoFundadorId: string) {
  const { error } = await supabase.rpc("transferir_fundador", { p_nuevo_fundador_id: nuevoFundadorId });
  if (error) throw error;
}

export async function eliminarMiembro(usuarioId: string) {
  const { error } = await supabase.rpc("eliminar_miembro_equipo", { p_usuario_id: usuarioId });
  if (error) throw error;
}
