import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Bug } from "lucide-react-native";

import { colors } from "@/theme/colors";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/** Portado de NumberField del prototipo. El cierre del teclado numérico
 * (que no tiene tecla de "Listo" propia) lo resuelve la pantalla que
 * contiene este campo con una barra flotante propia — ver comentario en
 * punto/[puntoId].tsx sobre por qué no es un InputAccessoryView. */
export function NumberField({ label, value, onChange, disabled }: NumberFieldProps) {
  return (
    <View style={styles.fila}>
      <View style={styles.etiquetaFila}>
        <Bug size={14} color={colors.textMuted} />
        <Text style={styles.etiqueta}>{label}</Text>
      </View>
      <TextInput
        style={[styles.input, disabled && styles.inputDeshabilitado]}
        keyboardType="number-pad"
        editable={!disabled}
        value={String(value)}
        selectTextOnFocus
        onChangeText={(t) => {
          const n = parseInt(t, 10);
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
      />
    </View>
  );
}

interface YesNoFieldProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

/** Portado de YesNoField del prototipo. */
export function YesNoField({ label, value, onChange, disabled }: YesNoFieldProps) {
  return (
    <View style={styles.fila}>
      <Text style={styles.etiqueta}>{label}</Text>
      <View style={styles.grupoSiNo}>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(false)}
          style={[styles.botonSiNo, value === false && styles.botonSiNoActivoNo, disabled && styles.botonDeshabilitado]}
        >
          <Text style={[styles.botonSiNoTexto, value === false && styles.botonSiNoTextoActivo]}>No</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(true)}
          style={[styles.botonSiNo, value === true && styles.botonSiNoActivoSi, disabled && styles.botonDeshabilitado]}
        >
          <Text style={[styles.botonSiNoTexto, value === true && styles.botonSiNoTextoActivo]}>Sí</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  etiquetaFila: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  etiqueta: { fontSize: 14, color: colors.text, flex: 1 },
  input: {
    width: 60,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  inputDeshabilitado: { backgroundColor: colors.background, color: colors.textMuted },
  grupoSiNo: { flexDirection: "row", gap: 6 },
  botonSiNo: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  botonSiNoActivoNo: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  botonSiNoActivoSi: { backgroundColor: colors.successBg, borderColor: colors.primary },
  botonDeshabilitado: { opacity: 0.5 },
  botonSiNoTexto: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  botonSiNoTextoActivo: { color: colors.text, fontWeight: "700" },
});
