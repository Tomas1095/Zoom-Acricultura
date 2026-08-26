import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Pencil } from "lucide-react-native";

import { colors } from "@/theme/colors";

interface MiRutaControlesProps {
  miRuta: string[];
  rutaConfirmada: boolean;
  modoMarcarRuta: boolean;
  pidiendoEditar: boolean;
  onEmpezarAMarcar: () => void;
  onTerminarDeMarcar: () => void;
  onPedirEditar: () => void;
  onConfirmarEditar: () => void;
  onCancelarEditar: () => void;
}

/** Controles del recorrido personal — portado de `miRutaRow` del
 * prototipo. Solo vive en vista general (marcar/editar no tiene sentido en
 * modo trabajo, que ya lo muestra de solo lectura). */
export function MiRutaControles({
  miRuta,
  rutaConfirmada,
  modoMarcarRuta,
  pidiendoEditar,
  onEmpezarAMarcar,
  onTerminarDeMarcar,
  onPedirEditar,
  onConfirmarEditar,
  onCancelarEditar,
}: MiRutaControlesProps) {
  return (
    <View style={styles.fila}>
      {modoMarcarRuta ? (
        <>
          <View style={[styles.pill, styles.pillActiva]}>
            <Pencil size={12} color={colors.surface} />
            <Text style={styles.pillActivaTexto}>Tocando puntos para marcar…</Text>
          </View>
          <Pressable style={styles.okBtn} onPress={onTerminarDeMarcar}>
            <Check size={15} color={colors.surface} />
          </Pressable>
        </>
      ) : rutaConfirmada && miRuta.length > 0 ? (
        pidiendoEditar ? (
          <View style={styles.confirmFila}>
            <Text style={styles.confirmTexto}>¿Editar recorrido?</Text>
            <Pressable onPress={onConfirmarEditar}>
              <Text style={styles.confirmSi}>Sí</Text>
            </Pressable>
            <Pressable onPress={onCancelarEditar}>
              <Text style={styles.confirmNo}>No</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.pillConfirmada} onPress={onPedirEditar}>
            <Check size={12} color={colors.primaryDark} />
            <Text style={styles.pillConfirmadaTexto}>Recorrido marcado</Text>
          </Pressable>
        )
      ) : (
        <Pressable style={styles.pill} onPress={onEmpezarAMarcar}>
          <Pencil size={12} color={colors.primaryDark} />
          <Text style={styles.pillTexto}>Marcar mi recorrido</Text>
        </Pressable>
      )}
      {miRuta.length > 0 && <Text style={styles.contador}>{miRuta.length} puntos</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillTexto: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  pillActiva: { backgroundColor: colors.info, borderColor: colors.info },
  pillActivaTexto: { fontSize: 12, fontWeight: "700", color: colors.surface },
  okBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryConfirm,
    alignItems: "center",
    justifyContent: "center",
  },
  pillConfirmada: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillConfirmadaTexto: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  confirmFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  confirmTexto: { fontSize: 12, color: colors.text, fontWeight: "600" },
  confirmSi: { fontSize: 12, fontWeight: "800", color: colors.primary },
  confirmNo: { fontSize: 12, fontWeight: "800", color: colors.danger },
  contador: { fontSize: 11, color: colors.textMuted, marginLeft: "auto" },
});
