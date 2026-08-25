import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Bug, Check } from "lucide-react-native";

import { colors } from "@/theme/colors";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/** Portado de NumberField del prototipo — con un botón "Visto" agregado
 * para cerrar el teclado numérico con una confirmación visual explícita
 * (pedido en la prueba de campo: sin esto no quedaba claro cuándo un
 * conteo ya estaba "cargado" para pasar al siguiente). */
export function NumberField({ label, value, onChange, disabled }: NumberFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [visto, setVisto] = useState(false);

  return (
    <View style={styles.fila}>
      <View style={styles.etiquetaFila}>
        <Bug size={14} color={colors.textMuted} />
        <Text style={styles.etiqueta}>{label}</Text>
      </View>
      <View style={styles.numeroYVisto}>
        <TextInput
          ref={inputRef}
          style={[styles.input, disabled && styles.inputDeshabilitado]}
          keyboardType="number-pad"
          editable={!disabled}
          value={String(value)}
          selectTextOnFocus
          onFocus={() => setVisto(false)}
          onChangeText={(t) => {
            const n = parseInt(t, 10);
            onChange(Number.isFinite(n) && n >= 0 ? n : 0);
          }}
        />
        {!disabled && (
          <Pressable
            style={[styles.botonVisto, visto && styles.botonVistoActivo]}
            onPress={() => {
              inputRef.current?.blur();
              setVisto(true);
            }}
          >
            <Check size={16} color={visto ? colors.surface : colors.primary} />
          </Pressable>
        )}
      </View>
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
  numeroYVisto: { flexDirection: "row", alignItems: "center", gap: 8 },
  botonVisto: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  botonVistoActivo: { backgroundColor: colors.primary },
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
