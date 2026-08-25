import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Lote } from "@/types/domain";
import { colors } from "@/theme/colors";
import { VistaGeneral } from "./vista-general";
import { ResultadosView } from "./resultados-view";
import { SalidasView } from "./salidas-view";

type Tab = "grilla" | "resultados" | "salidas";

const TABS: Array<{ id: Tab; etiqueta: string }> = [
  { id: "grilla", etiqueta: "Grilla" },
  { id: "resultados", etiqueta: "Resultados" },
  { id: "salidas", etiqueta: "Salidas" },
];

/** Portado de las pestañas Grilla/Resultados/Salidas del prototipo — solo
 * las ven los roles que pueden administrar lotes (ver LoteScreen, que
 * muestra `VistaGeneral` directo, sin pestañas, para el Monitoreador). */
export function LoteTabs({ lote }: { lote: Lote }) {
  const [tab, setTab] = useState<Tab>("grilla");

  return (
    <View style={styles.container}>
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tabBoton, tab === t.id && styles.tabBotonActivo]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabTexto, tab === t.id && styles.tabTextoActivo]}>{t.etiqueta}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.contenido}>
        {tab === "grilla" && <VistaGeneral lote={lote} />}
        {tab === "resultados" && <ResultadosView lote={lote} />}
        {tab === "salidas" && <SalidasView />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
    margin: 16,
    marginBottom: 0,
  },
  tabBoton: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  tabBotonActivo: { backgroundColor: colors.primaryConfirm },
  tabTexto: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabTextoActivo: { color: colors.surface },
  contenido: { flex: 1 },
});
