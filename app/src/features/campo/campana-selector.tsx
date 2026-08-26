import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { colors } from "@/theme/colors";

interface CampanaSelectorProps {
  /** Todas las campañas con datos de este lote, más reciente primero —
   * siempre incluye `campanaActual` aunque todavía no tenga cargas. */
  campanas: string[];
  campanaActual: string;
  campanaViendo: string;
  onCambiar: (campana: string) => void;
}

/** Selector de campaña — portado del combo "Campaña 25/26 (actual)" del
 * prototipo. Acá vive adentro de Resultados nomás (no en Grilla): mirar
 * hacia atrás campañas archivadas es de solo lectura, tiene sentido en los
 * resultados, no en la grilla de carga. Si solo hay una campaña con datos
 * (lo normal hasta que se acumule historial) se muestra fija, sin flecha de
 * desplegar — no hay nada más para elegir todavía. */
export function CampanaSelector({ campanas, campanaActual, campanaViendo, onCambiar }: CampanaSelectorProps) {
  const [abierto, setAbierto] = useState(false);
  const puedeElegir = campanas.length > 1;
  const viendoActual = campanaViendo === campanaActual;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.pill}
        onPress={() => puedeElegir && setAbierto((v) => !v)}
        disabled={!puedeElegir}
      >
        <Text style={styles.pillTexto}>
          Campaña {campanaViendo}
          {viendoActual ? " (actual)" : ""}
        </Text>
        {puedeElegir && (
          <ChevronDown size={13} color={colors.accentGold} style={abierto ? styles.chevronAbierto : undefined} />
        )}
      </Pressable>

      {abierto && (
        <View style={styles.menu}>
          {campanas.map((c) => (
            <Pressable
              key={c}
              style={styles.menuItem}
              onPress={() => {
                onCambiar(c);
                setAbierto(false);
              }}
            >
              <Text style={styles.menuItemTexto}>
                Campaña {c}
                {c === campanaActual ? " (actual)" : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!viendoActual && (
        <View style={styles.banner}>
          <Text style={styles.bannerTexto}>Estás viendo la campaña {campanaViendo} — solo lectura.</Text>
          <Pressable onPress={() => onCambiar(campanaActual)}>
            <Text style={styles.bannerVolver}>Volver a la actual</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillTexto: { fontSize: 12.5, fontWeight: "700", color: colors.accentGold },
  chevronAbierto: { transform: [{ rotate: "180deg" }] },
  menu: {
    width: "100%",
    maxWidth: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: "hidden",
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItemTexto: { fontSize: 13, color: colors.text, fontWeight: "600" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    backgroundColor: colors.warningBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerTexto: { flex: 1, fontSize: 11.5, color: colors.text },
  bannerVolver: { fontSize: 11.5, fontWeight: "700", color: colors.warning },
});
