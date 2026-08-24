import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, MapPin } from "lucide-react-native";

import * as db from "@/lib/db/lotes";
import { formatearHectareas } from "@/lib/format";
import type { Establecimiento, Lote } from "@/types/domain";
import { colors } from "@/theme/colors";

/** Lista plana de lotes con acceso — lo que ve un Monitoreador. Portado de
 * MisLotesView del prototipo. Nada de crear/editar/borrar acá: eso es solo
 * de administradores (ver ArbolLotes). */
export function MisLotes() {
  const [cargando, setCargando] = useState(true);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([]);

  const refrescar = useCallback(async () => {
    const arbol = await db.fetchArbol();
    setLotes(arbol.lotes);
    setEstablecimientos(arbol.establecimientos);
    setCargando(false);
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Lotes asignados — tocá uno para empezar</Text>
      {lotes.length === 0 ? (
        <Text style={styles.vacio}>No tenés lotes asignados por ahora.</Text>
      ) : (
        lotes.map((l) => {
          const establecimiento = establecimientos.find((e) => e.id === l.establecimientoId);
          return (
            <Pressable key={l.id} style={styles.card} onPress={() => router.push(`/(app)/lote/${l.id}`)}>
              <Text style={styles.establecimiento}>{establecimiento?.nombre ?? ""}</Text>
              <Text style={styles.nombre}>{l.nombre}</Text>
              <Text style={styles.cultivo}>{l.cultivo}</Text>
              <View style={styles.pill}>
                {l.tieneGrilla ? (
                  <>
                    <CheckCircle2 size={12} color={colors.primary} />
                    <Text style={styles.pillTextoOk}>{formatearHectareas(l.hectareas)} ha</Text>
                  </>
                ) : (
                  <>
                    <MapPin size={12} color={colors.warning} />
                    <Text style={styles.pillTextoAviso}>Sin grilla todavía — avisá a tu Encargado</Text>
                  </>
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 10 },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  vacio: { color: colors.textMuted, textAlign: "center", marginTop: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  establecimiento: { fontSize: 11, fontWeight: "700", color: colors.accentGold, textTransform: "uppercase" },
  nombre: { fontSize: 17, fontWeight: "700", color: colors.text, marginTop: 2 },
  cultivo: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  pillTextoOk: { fontSize: 12, color: colors.primaryDark, fontWeight: "600" },
  pillTextoAviso: { fontSize: 12, color: colors.warning, fontWeight: "600" },
});
