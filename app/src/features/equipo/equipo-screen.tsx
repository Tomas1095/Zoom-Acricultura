import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { ArrowUpCircle, ArrowDownCircle, Copy, Crown, Trash2, UserPlus } from "lucide-react-native";

import { useAuth } from "@/lib/auth-context";
import * as db from "@/lib/db/equipo";
import { etiquetaRol } from "@/lib/roles";
import type { Usuario } from "@/types/domain";
import { colors } from "@/theme/colors";

/** "Mi equipo" — portado de EquipoView. Solo entran acá socio_fundador y
 * socio_gerente (ver puedeGestionarEquipo en roles.ts / la navegación que
 * arma esta pantalla). */
export function EquipoScreen() {
  const { usuario: yo } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [miembros, setMiembros] = useState<Usuario[]>([]);
  const [codigoRecienGenerado, setCodigoRecienGenerado] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      const usuarios = await db.fetchUsuarios();
      setMiembros(usuarios.filter((u) => u.activo));
    } catch (e: any) {
      Alert.alert("No se pudo cargar el equipo", e.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  async function generarCodigo() {
    if (!yo) return;
    setGenerando(true);
    try {
      const codigo = await db.generarInvitacion(yo.id);
      setCodigoRecienGenerado(codigo);
    } catch (e: any) {
      Alert.alert("No se pudo generar el código", e.message ?? String(e));
    } finally {
      setGenerando(false);
    }
  }

  async function copiarCodigo() {
    if (!codigoRecienGenerado) return;
    await Clipboard.setStringAsync(codigoRecienGenerado);
    Alert.alert("Copiado", "El código se copió al portapapeles.");
  }

  function compartirCodigo() {
    if (!codigoRecienGenerado) return;
    Share.share({
      message: `Te invito a sumarte al equipo de Zoom Agricultura. Usá este código al registrarte: ${codigoRecienGenerado}`,
    });
  }

  async function conManejoDeError(accion: () => Promise<void>) {
    try {
      await accion();
      await refrescar();
    } catch (e: any) {
      Alert.alert("Ocurrió un error", e.message ?? String(e));
    }
  }

  function confirmarQuitar(u: Usuario) {
    Alert.alert("Quitar del equipo", `¿Quitar a ${u.nombre} del equipo?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => conManejoDeError(() => db.eliminarMiembro(u.id)) },
    ]);
  }

  function confirmarAscenso(u: Usuario) {
    Alert.alert("Ascender a Socio Gerente", `¿Ascender a ${u.nombre} a Socio Gerente?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Ascender", onPress: () => conManejoDeError(() => db.cambiarRolUsuario(u.id, "socio_gerente")) },
    ]);
  }

  function confirmarDegradar(u: Usuario) {
    Alert.alert("Degradar a Encargado", `¿Degradar a ${u.nombre} a Encargado?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Degradar", onPress: () => conManejoDeError(() => db.cambiarRolUsuario(u.id, "encargado")) },
    ]);
  }

  function confirmarTransferir(u: Usuario) {
    Alert.alert(
      "Transferir Socio Fundador",
      `${u.nombre} va a pasar a ser el Socio Fundador y vos vas a quedar como Socio Gerente. Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Transferir", style: "destructive", onPress: () => conManejoDeError(() => db.transferirFundador(u.id)) },
      ]
    );
  }

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable style={styles.generarBtn} onPress={generarCodigo} disabled={generando}>
        <UserPlus size={16} color={colors.surface} />
        <Text style={styles.generarTexto}>{generando ? "Generando…" : "Invitar a alguien"}</Text>
      </Pressable>

      {codigoRecienGenerado && (
        <View style={styles.codigoCard}>
          <Text style={styles.codigoLabel}>Código generado — compartilo, sirve una sola vez</Text>
          <Text style={styles.codigo}>{codigoRecienGenerado}</Text>
          <View style={styles.codigoBotones}>
            <Pressable style={styles.codigoBoton} onPress={copiarCodigo}>
              <Copy size={13} color={colors.primaryDark} />
              <Text style={styles.codigoBotonTexto}>Copiar</Text>
            </Pressable>
            <Pressable style={styles.codigoBoton} onPress={compartirCodigo}>
              <Text style={styles.codigoBotonTexto}>Compartir</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.seccionLabel}>Miembros del equipo</Text>
      {miembros.map((u) => {
        const esUnoMismo = u.id === yo?.id;
        return (
          <View key={u.id} style={styles.miembroCard}>
            <View style={[styles.dot, { backgroundColor: u.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.miembroNombre}>
                {u.nombre} {esUnoMismo && "(vos)"}
              </Text>
              <Text style={styles.miembroRol}>{etiquetaRol(u.rol)}</Text>
            </View>

            {!esUnoMismo && u.rol !== "socio_fundador" && (
              <View style={styles.accionesFila}>
                {yo?.rol === "socio_fundador" && u.rol !== "socio_gerente" && (
                  <Pressable style={styles.iconBtn} onPress={() => confirmarAscenso(u)}>
                    <ArrowUpCircle size={18} color={colors.primary} />
                  </Pressable>
                )}
                {yo?.rol === "socio_fundador" && u.rol === "socio_gerente" && (
                  <>
                    <Pressable style={styles.iconBtn} onPress={() => confirmarDegradar(u)}>
                      <ArrowDownCircle size={18} color={colors.warning} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => confirmarTransferir(u)}>
                      <Crown size={17} color={colors.accentGold} />
                    </Pressable>
                  </>
                )}
                {yo?.rol === "socio_gerente" && u.rol !== "socio_gerente" && (
                  <Pressable
                    style={styles.iconBtn}
                    onPress={() =>
                      conManejoDeError(() =>
                        db.cambiarRolUsuario(u.id, u.rol === "encargado" ? "monitoreador" : "encargado")
                      )
                    }
                  >
                    <Text style={styles.cambiarTexto}>
                      {u.rol === "encargado" ? "→ Monitoreador" : "→ Encargado"}
                    </Text>
                  </Pressable>
                )}
                <Pressable style={styles.iconBtn} onPress={() => confirmarQuitar(u)}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centrado: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 10 },
  generarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 13,
  },
  generarTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
  codigoCard: {
    backgroundColor: colors.successBg,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  codigoLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  codigo: { fontSize: 20, fontWeight: "800", color: colors.primaryDark, letterSpacing: 1 },
  codigoBotones: { flexDirection: "row", gap: 10, marginTop: 4 },
  codigoBoton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codigoBotonTexto: { fontSize: 12, fontWeight: "700", color: colors.text },
  seccionLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginTop: 8 },
  miembroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  miembroNombre: { fontSize: 14, fontWeight: "700", color: colors.text },
  miembroRol: { fontSize: 11, color: colors.accentGold, fontWeight: "600", marginTop: 1 },
  accionesFila: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 6 },
  cambiarTexto: { fontSize: 11, fontWeight: "700", color: colors.info },
});
