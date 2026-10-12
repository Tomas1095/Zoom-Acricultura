import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { LocateFixed } from "lucide-react-native";

import type { EstadoGps } from "./usar-gps";
import { colors } from "@/theme/colors";

const TEXTOS: Record<EstadoGps, string> = {
  buscando: "Buscando GPS…",
  activo: "GPS activo",
  "no-disponible": "GPS no disponible",
  "servicio-apagado": "Activá la ubicación del celular",
};

interface GpsEstadoPillProps {
  estado: EstadoGps;
  /** Pista de diagnóstico cuando "buscando" tarda sospechosamente (ver
   * AVISO_TARDANZA_MS en usar-gps.ts) — null casi siempre. */
  diagnostico?: string | null;
}

export function GpsEstadoPill({ estado, diagnostico }: GpsEstadoPillProps) {
  const color =
    estado === "activo" ? colors.primary : estado === "no-disponible" || estado === "servicio-apagado" ? colors.danger : colors.warning;
  return (
    <View style={{ alignItems: "flex-end", gap: 3 }}>
      <View style={[styles.pill, { borderColor: color }]}>
        {estado === "buscando" ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <LocateFixed size={13} color={color} />
        )}
        <Text style={[styles.texto, { color }]}>{TEXTOS[estado]}</Text>
      </View>
      {estado === "buscando" && diagnostico && <Text style={styles.diagnostico}>{diagnostico}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  texto: { fontSize: 11, fontWeight: "700" },
  diagnostico: {
    fontSize: 9.5,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 180,
    textAlign: "right",
  },
});
