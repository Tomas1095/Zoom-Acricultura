import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Target } from "lucide-react-native";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { ZoomLogo } from "@/components/zoom-logo";
import { colors } from "@/theme/colors";

type Modo = "ingresar" | "unirse";

/** Login real (email + contraseña vía Supabase Auth) y alta con código de
 * invitación — reemplaza el selector de usuarios de prueba del prototipo.
 * El header (logo, "MONITOREO DE PLAGAS", título) sí está calcado del
 * prototipo (mismos colores, mismo ícono de fondo tenue). */
export default function LoginScreen() {
  const { session, usuario, refrescarUsuario } = useAuth();
  const insets = useSafeAreaInsets();
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
    <View style={styles.pantalla}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, { paddingTop: insets.top + 40 }]}>
            <Target size={190} color="#FFFFFF" strokeWidth={1} style={styles.heroMarcaDeAgua} />
            <View style={styles.heroLogoFila}>
              <ZoomLogo variant="light" iconSize={44} wordSize={32} />
            </View>
            <Text style={styles.eyebrow}>MONITOREO DE PLAGAS</Text>
            <Text style={styles.titulo}>{modo === "ingresar" ? "Iniciar sesión" : "Unirme al equipo"}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.form}>
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
                style={[styles.botonConfirmar, cargando && styles.deshabilitado]}
                disabled={cargando}
                onPress={modo === "ingresar" ? ingresar : unirseConCodigo}
              >
                <Text style={styles.botonConfirmarTexto}>
                  {cargando ? "Un momento…" : modo === "ingresar" ? "Ingresar" : "Unirme"}
                </Text>
              </Pressable>
            </View>

            {modo === "ingresar" ? (
              <Pressable style={styles.botonUnirse} onPress={() => setModo("unirse")}>
                <Text style={styles.botonUnirseTexto}>¿Sos nuevo? Unirte con un código de invitación</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.volverLink} onPress={() => setModo("ingresar")}>
                <Text style={styles.volverLinkTexto}>← Volver</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: "#14231A",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 24,
    overflow: "hidden",
  },
  heroMarcaDeAgua: { position: "absolute", top: -40, right: -50, opacity: 0.08 },
  heroLogoFila: { alignItems: "center", marginBottom: 10 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 0.6,
    color: "#F2A93B",
    fontWeight: "700",
    textAlign: "center",
  },
  titulo: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
    color: "#FFFFFF",
  },
  body: { padding: 24, paddingTop: 28, gap: 14 },
  form: { gap: 10 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  botonConfirmar: {
    backgroundColor: colors.primaryConfirm,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  deshabilitado: { opacity: 0.6 },
  botonConfirmarTexto: { color: colors.surface, fontWeight: "700", fontSize: 14 },
  botonUnirse: {
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderStyle: "dashed",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  botonUnirseTexto: { color: colors.warning, fontWeight: "700", fontSize: 13 },
  volverLink: { alignItems: "center", paddingVertical: 6 },
  volverLinkTexto: { color: colors.accentGoldMuted, fontWeight: "600", fontSize: 13 },
});
