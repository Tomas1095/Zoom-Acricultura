import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import * as db from "@/lib/db/lotes";
import { fetchUsuarios } from "@/lib/db/equipo";
import { etiquetaRol } from "@/lib/roles";
import { useAuth } from "@/lib/auth-context";
import type { Lote, Usuario } from "@/types/domain";
import { colors } from "@/theme/colors";

interface AccesoModalProps {
  lote: Lote;
  onCerrar: () => void;
}

/** Quién ve/carga este lote — lo administra el jefe/encargado. Portado de
 * "toggleAcceso" del prototipo. */
export function AccesoModal({ lote, onCerrar }: AccesoModalProps) {
  const { usuario: yo } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!yo) return;
    (async () => {
      try {
        const [todosLosUsuarios, accesos] = await Promise.all([fetchUsuarios(yo.comunidadId), db.fetchAccesos(lote.id)]);
        setUsuarios(todosLosUsuarios.filter((u) => u.rol === "monitoreador" && u.activo));
        setSeleccionados(new Set(accesos));
      } catch (e: any) {
        Alert.alert("No se pudo cargar el acceso", e.message ?? String(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [lote.id, yo]);

  async function toggle(usuarioId: string) {
    const tenia = seleccionados.has(usuarioId);
    // optimista: se ve al toque, se revierte si falla
    setSeleccionados((prev) => {
      const next = new Set(prev);
      tenia ? next.delete(usuarioId) : next.add(usuarioId);
      return next;
    });
    try {
      if (tenia) await db.revocarAcceso(lote.id, usuarioId);
      else await db.otorgarAcceso(lote.id, usuarioId);
    } catch (e: any) {
      setSeleccionados((prev) => {
        const next = new Set(prev);
        tenia ? next.add(usuarioId) : next.delete(usuarioId);
        return next;
      });
      Alert.alert("No se pudo actualizar el acceso", e.message ?? String(e));
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Acceso a "{lote.nombre}"</Text>
          <Text style={styles.subtitulo}>Quién puede ver y cargar datos de este lote</Text>

          {cargando ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : usuarios.length === 0 ? (
            <Text style={styles.vacio}>No hay Monitoreadores en el equipo todavía.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              {usuarios.map((u) => {
                const activo = seleccionados.has(u.id);
                return (
                  <Pressable key={u.id} style={styles.fila} onPress={() => toggle(u.id)}>
                    <View style={[styles.dot, { backgroundColor: u.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nombre}>{u.nombre}</Text>
                      <Text style={styles.rol}>{etiquetaRol(u.rol)}</Text>
                    </View>
                    <View style={[styles.check, activo && styles.checkActivo]}>
                      {activo && <Check size={13} color={colors.surface} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable style={styles.cerrarBtn} onPress={onCerrar}>
            <Text style={styles.cerrarTexto}>Listo</Text>
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
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nombre: { fontSize: 14, fontWeight: "600", color: colors.text },
  rol: { fontSize: 11, color: colors.textMuted },
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
  cerrarBtn: { marginTop: 14, backgroundColor: colors.background, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cerrarTexto: { color: colors.text, fontWeight: "700" },
});
