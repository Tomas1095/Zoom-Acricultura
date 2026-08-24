import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import * as db from "@/lib/db/lotes";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";

/** Stub de la pantalla de lote — acá van a ir las pestañas Campo/Densidad
 * (vista general, modo trabajo, mapa de densidad) cuando se porteen. */
export default function LoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);

  useEffect(() => {
    db.fetchArbol().then((arbol) => {
      setLote(arbol.lotes.find((l) => l.id === id) ?? null);
      setCargando(false);
    });
  }, [id]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!lote) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.aviso}>No se encontró el lote.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.nombre}>{lote.nombre}</Text>
      <Text style={styles.cultivo}>{lote.cultivo}</Text>
      <Text style={styles.aviso}>
        {lote.tieneGrilla
          ? "Acá van a ir la vista de campo (GPS, grilla) y el mapa de densidad — próximos pasos de la migración."
          : "Este lote todavía no tiene grilla generada. Subí el KMZ para generarla (función en construcción)."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 6 },
  nombre: { fontSize: 22, fontWeight: "800", color: colors.text },
  cultivo: { fontSize: 14, color: colors.textMuted },
  aviso: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 16 },
});
