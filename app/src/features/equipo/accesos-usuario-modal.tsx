import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, MapPin } from "lucide-react-native";

import * as db from "@/lib/db/lotes";
import type { LoteConAcceso } from "@/lib/db/lotes";
import type { Usuario } from "@/types/domain";
import { colors } from "@/theme/colors";

interface AccesosUsuarioModalProps {
  usuario: Usuario;
  onCerrar: () => void;
}

/** El sentido inverso de AccesoModal (lote → gente): acá se ve UNA persona
 * y TODOS los lotes a los que tiene acceso, para poder sacárselo sin tener
 * que acordarse a mano en cuáles había entrado — pedido explícito del
 * usuario, dar de alta el acceso ya se hacía lote por lote, pero para
 * sacarlo al final del día no había forma de verlo junto desde la persona.
 * Quitar es siempre a propósito: lote por lote (tildando de a uno) o todos
 * juntos ("Seleccionar todos"), con cartel de confirmar antes de ejecutar
 * — nunca se saca nada con un solo toque de pedo. */
export function AccesosUsuarioModal({ usuario, onCerrar }: AccesosUsuarioModalProps) {
  const [cargando, setCargando] = useState(true);
  const [lotes, setLotes] = useState<LoteConAcceso[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [quitando, setQuitando] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      const l = await db.fetchLotesDeUsuario(usuario.id);
      setLotes(l);
      setSeleccionados(new Set());
    } catch (e: any) {
      Alert.alert("No se pudo cargar los accesos", e.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }, [usuario.id]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  function toggle(loteId: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      next.has(loteId) ? next.delete(loteId) : next.add(loteId);
      return next;
    });
  }

  function toggleTodos() {
    setSeleccionados((prev) => (prev.size === lotes.length ? new Set() : new Set(lotes.map((l) => l.lote.id))));
  }

  function confirmarQuitar() {
    const cantidad = seleccionados.size;
    if (cantidad === 0) return;
    Alert.alert(
      "Quitar acceso",
      `¿Le sacamos el acceso a ${usuario.nombre} de ${cantidad === 1 ? "este lote" : `estos ${cantidad} lotes`}? Va a dejar de verlo${cantidad === 1 ? "" : "s"} en la app.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Quitar", style: "destructive", onPress: quitarSeleccionados },
      ]
    );
  }

  async function quitarSeleccionados() {
    const idsAQuitar = Array.from(seleccionados);
    setQuitando(true);
    try {
      await Promise.all(idsAQuitar.map((loteId) => db.revocarAcceso(loteId, usuario.id)));
      setLotes((prev) => prev.filter((l) => !seleccionados.has(l.lote.id)));
      setSeleccionados(new Set());
    } catch (e: any) {
      Alert.alert("No se pudo quitar el acceso", e.message ?? String(e));
      await refrescar(); // por si algunos sí se sacaron y otros no, que quede reflejado bien
    } finally {
      setQuitando(false);
    }
  }

  const todosSeleccionados = lotes.length > 0 && seleccionados.size === lotes.length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Accesos de {usuario.nombre}</Text>
          <Text style={styles.subtitulo}>Lotes a los que tiene acceso hoy</Text>

          {cargando ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : lotes.length === 0 ? (
            <Text style={styles.vacio}>No tiene acceso a ningún lote por ahora.</Text>
          ) : (
            <>
              <Pressable style={styles.filaTodos} onPress={toggleTodos} disabled={quitando}>
                <View style={[styles.check, todosSeleccionados && styles.checkActivo]}>
                  {todosSeleccionados && <Check size={13} color={colors.surface} />}
                </View>
                <Text style={styles.todosTexto}>Seleccionar todos</Text>
              </Pressable>

              <ScrollView style={{ maxHeight: 280 }}>
                {lotes.map(({ lote, establecimientoNombre }) => {
                  const activo = seleccionados.has(lote.id);
                  return (
                    <Pressable
                      key={lote.id}
                      style={styles.fila}
                      onPress={() => toggle(lote.id)}
                      disabled={quitando}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nombre}>{lote.nombre}</Text>
                        {establecimientoNombre && <Text style={styles.establecimiento}>{establecimientoNombre}</Text>}
                      </View>
                      <View style={[styles.check, activo && styles.checkActivo]}>
                        {activo && <Check size={13} color={colors.surface} />}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                style={[styles.quitarBtn, (seleccionados.size === 0 || quitando) && styles.quitarBtnDeshabilitado]}
                onPress={confirmarQuitar}
                disabled={seleccionados.size === 0 || quitando}
              >
                <MapPin size={14} color={colors.surface} />
                <Text style={styles.quitarTexto}>
                  {quitando ? "Quitando…" : `Quitar acceso (${seleccionados.size} seleccionado${seleccionados.size === 1 ? "" : "s"})`}
                </Text>
              </Pressable>
            </>
          )}

          <Pressable style={styles.cerrarBtn} onPress={onCerrar} disabled={quitando}>
            <Text style={styles.cerrarTexto}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(27,46,31,0.45)", justifyContent: "flex-end" },
  card: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, gap: 4 },
  titulo: { fontSize: 16, fontWeight: "700", color: colors.text },
  subtitulo: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  vacio: { color: colors.textMuted, textAlign: "center", paddingVertical: 20 },
  filaTodos: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 4,
  },
  todosTexto: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nombre: { fontSize: 14, fontWeight: "600", color: colors.text },
  establecimiento: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  quitarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  quitarBtnDeshabilitado: { opacity: 0.4 },
  quitarTexto: { color: colors.surface, fontWeight: "700", fontSize: 13.5 },
  cerrarBtn: { marginTop: 10, backgroundColor: colors.background, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cerrarTexto: { color: colors.text, fontWeight: "700" },
});
