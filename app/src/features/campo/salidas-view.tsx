import { StyleSheet, Text, View } from "react-native";
import { FileText, MapPinned, Share2 } from "lucide-react-native";

import { colors } from "@/theme/colors";

/** Pestaña "Salidas" — portada de `SalidasView` del prototipo (informe
 * técnico con recomendación de cebo, zona de aplicación/manchoneo, y
 * exportación PDF/GPX/KML). Todavía no está portada la lógica real —
 * placeholder mientras se construye. */
export function SalidasView() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Todavía no está lista</Text>
      <Text style={styles.texto}>Acá va a ir, portado del prototipo:</Text>

      <View style={styles.item}>
        <FileText size={16} color={colors.primaryDark} />
        <Text style={styles.itemTexto}>Informe técnico con recomendación de cebo, exportable a PDF</Text>
      </View>
      <View style={styles.item}>
        <MapPinned size={16} color={colors.primaryDark} />
        <Text style={styles.itemTexto}>Zona de aplicación (manchoneo) sobre el mapa del lote</Text>
      </View>
      <View style={styles.item}>
        <Share2 size={16} color={colors.primaryDark} />
        <Text style={styles.itemTexto}>Exportar y compartir (PDF / GPX / KML)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 10 },
  titulo: { fontSize: 15, fontWeight: "800", color: colors.text },
  texto: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  itemTexto: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
});
