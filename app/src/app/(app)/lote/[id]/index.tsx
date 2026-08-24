import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { puedeAdministrarLotes } from "@/lib/roles";
import * as db from "@/lib/db/lotes";
import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { SubirKmz } from "@/features/lotes/subir-kmz";
import { VistaGeneral } from "@/features/campo/vista-general";

export default function LoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { usuario } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [lote, setLote] = useState<Lote | null>(null);

  const refrescar = useCallback(async () => {
    const arbol = await db.fetchArbol();
    setLote(arbol.lotes.find((l) => l.id === id) ?? null);
    setCargando(false);
  }, [id]);

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

  if (!lote) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.aviso}>No se encontró el lote.</Text>
      </View>
    );
  }

  if (lote.tieneGrilla) return <VistaGeneral lote={lote} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.nombre}>{lote.nombre}</Text>
      <Text style={styles.cultivo}>{lote.cultivo}</Text>

      {usuario && puedeAdministrarLotes(usuario.rol) ? (
        <SubirKmz loteId={lote.id} onListo={refrescar} />
      ) : (
        <Text style={styles.aviso}>
          Este lote todavía no tiene grilla generada. Avisale a tu Encargado o Socio Gerente para que
          suba el KMZ.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  container: { flexGrow: 1, backgroundColor: colors.background, padding: 20, gap: 4 },
  nombre: { fontSize: 22, fontWeight: "800", color: colors.text },
  cultivo: { fontSize: 14, color: colors.textMuted },
  aviso: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 12 },
});
