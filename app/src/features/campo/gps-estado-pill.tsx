import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { LocateFixed } from "lucide-react-native";

import type { EstadoGps } from "./usar-gps";
import { colors } from "@/theme/colors";

const TEXTOS: Record<EstadoGps, string> = {
  buscando: "Buscando GPS…",
  activo: "GPS activo",
  "no-disponible": "GPS no disponible",
};

export function GpsEstadoPill({ estado }: { estado: EstadoGps }) {
  const color = estado === "activo" ? colors.primary : estado === "no-disponible" ? colors.danger : colors.warning;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      {estado === "buscando" ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <LocateFixed size={13} color={color} />
      )}
      <Text style={[styles.texto, { color }]}>{TEXTOS[estado]}</Text>
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
});
