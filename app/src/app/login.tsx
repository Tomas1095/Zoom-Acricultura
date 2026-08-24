import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";

type Modo = "ingresar" | "unirse";

/** Login real (email + contraseña vía Supabase Auth) y alta con código de
 * invitación — reemplaza el selector de usuarios de prueba del prototipo. */
export default function LoginScreen() {
  const { session, usuario, refrescarUsuario } = useAuth();
  const [modo, setModo] = useState<Modo>("ingresar");
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);

  // Ya hay sesión + perfil resuelto (p. ej. volviste de canjear el código) → afuera.
  if (session && usuario) return <Redirect href="/(app)" />;

  async function ingresar() {
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: mail.trim().toLowerCase(), password });
    setCargando(false);
    if (error) Alert.alert("No se pudo ingresar", error.message);
  }

  async function unirseConCodigo() {
    if (!nombre.trim() || !mail.trim() || !password || !codigo.trim()) {
      Alert.alert("Faltan datos", "Completá nombre, mail, contraseña y código de invitación.");
      return;
    }
    setCargando(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email: mail.trim().toLowerCase(),
      password,
    });
    if (signUpError) {
      setCargando(false);
      Alert.alert("No se pudo crear la cuenta", signUpError.message);
      return;
    }
    // Con la sesión ya activa (signUp deja logueado si la confirmación de mail
    // está desactivada en el proyecto), canjeamos el código atómicamente.
    const { error: rpcError } = await supabase.rpc("usar_invitacion", {
      p_codigo: codigo.trim().toUpperCase(),
      p_nombre: nombre.trim(),
    });
    if (rpcError) {
      setCargando(false);
      Alert.alert("Código inválido", "Revisá el código de invitación con quien te lo dio.");
      return;
    }
    await refrescarUsuario();
    setCargando(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.titulo}>Zoom Agricultura</Text>
      <Text style={styles.subtitulo}>Monitoreo de plagas de suelo</Text>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, modo === "ingresar" && styles.tabActivo]} onPress={() => setModo("ingresar")}>
          <Text style={[styles.tabTexto, modo === "ingresar" && styles.tabTextoActivo]}>Ingresar</Text>
        </Pressable>
        <Pressable style={[styles.tab, modo === "unirse" && styles.tabActivo]} onPress={() => setModo("unirse")}>
          <Text style={[styles.tabTexto, modo === "unirse" && styles.tabTextoActivo]}>Unirme con código</Text>
        </Pressable>
      </View>

      {modo === "unirse" && (
        <TextInput
          style={styles.input}
          placeholder="Tu nombre"
          placeholderTextColor={colors.textMuted}
          value={nombre}
          onChangeText={setNombre}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Mail"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={mail}
        onChangeText={setMail}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {modo === "unirse" && (
        <TextInput
          style={styles.input}
          placeholder="Código de invitación (EQUIPO-XXXXXX)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          value={codigo}
          onChangeText={setCodigo}
        />
      )}

      <Pressable
        style={[styles.boton, cargando && styles.botonDeshabilitado]}
        disabled={cargando}
        onPress={modo === "ingresar" ? ingresar : unirseConCodigo}
      >
        <Text style={styles.botonTexto}>{cargando ? "Un momento…" : modo === "ingresar" ? "Ingresar" : "Unirme"}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 24, gap: 12 },
  titulo: { fontSize: 26, fontWeight: "800", color: colors.primaryDark, textAlign: "center" },
  subtitulo: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginBottom: 24 },
  tabs: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 10, padding: 4, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabActivo: { backgroundColor: colors.primary },
  tabTexto: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  tabTextoActivo: { color: colors.surface },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  boton: {
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonTexto: { color: colors.surface, fontWeight: "700", fontSize: 15 },
});
