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
import { solicitarComunidad } from "@/lib/db/comunidades";
import { ZoomLogo } from "@/components/zoom-logo";
import { colors } from "@/theme/colors";

type Modo = "ingresar" | "unirse" | "crear-comunidad" | "recuperar-pedir" | "recuperar-confirmar";

const TITULOS: Record<Modo, string> = {
  ingresar: "Iniciar sesión",
  unirse: "Unirme al equipo",
  "crear-comunidad": "Crear una comunidad nueva",
  "recuperar-pedir": "Recuperar contraseña",
  "recuperar-confirmar": "Elegir nueva contraseña",
};

/** Login real (email + contraseña vía Supabase Auth), alta con código de
 * invitación, y recuperar contraseña — reemplaza el selector de usuarios
 * de prueba del prototipo. El header (logo, "MONITOREO DE PLAGAS", título)
 * sí está calcado del prototipo (mismos colores, mismo ícono de fondo
 * tenue).
 *
 * Recuperar contraseña es por CÓDIGO (por mail), no por link —
 * a propósito: un link de recuperación necesitaría deep linking (abrir la
 * app desde el mail), y en Expo Go la URL cambia cada vez que arrancás
 * `expo start` (más todavía con `--tunnel`) — no hay forma de que Supabase
 * sepa de antemano a qué URL mandar a la persona. El código evita todo
 * eso: la persona lo escribe a mano en la app, como un segundo factor,
 * sin depender de ningún link ni esquema de URL. */
export default function LoginScreen() {
  const { session, usuario, comunidad, refrescarUsuario } = useAuth();
  const insets = useSafeAreaInsets();
  const [modo, setModo] = useState<Modo>("ingresar");
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nombreComunidad, setNombreComunidad] = useState("");
  const [codigoRecuperacion, setCodigoRecuperacion] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [cargando, setCargando] = useState(false);

  // Ya hay sesión + perfil resuelto (p. ej. volviste de canjear el código,
  // o recién cambiaste tu contraseña) → afuera. Salvo que la comunidad
  // todavía esté pendiente de aprobación (recién pedida una nueva, ver
  // crearComunidad) — ahí a la pantalla de espera, no a la app.
  if (session && usuario) {
    // Falla "cerrado": hace falta una comunidad conocida y activa.
    if (!comunidad || comunidad.estado !== "activa") return <Redirect href="/comunidad-pendiente" />;
    return <Redirect href="/(app)" />;
  }

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
    const mailNormalizado = mail.trim().toLowerCase();
    const { error: signUpError } = await supabase.auth.signUp({
      email: mailNormalizado,
      password,
    });
    if (signUpError) {
      // La fila de `usuarios` recién se crea más abajo, al canjear el
      // código (ver usar_invitacion en schema.sql) — NO al hacer signUp.
      // Entonces si alguien ya intentó unirse antes y el canje falló
      // después (código mal escrito, vencido, etc.), le queda una cuenta
      // de Supabase Auth creada pero sin ningún usuario/comunidad — un
      // reintento con el mismo mail choca acá con "already registered" y,
      // sin esto, la persona queda trabada para siempre (ni puede volver a
      // unirse, ni "Iniciar sesión" la lleva a ningún lado, porque tampoco
      // tiene un usuario todavía). Antes de rendirnos, probamos iniciar
      // sesión con lo que acaba de escribir — si es realmente un reintento
      // (mismo mail Y contraseña), sigue de largo y canjea el código como
      // si el signUp de arriba hubiera funcionado.
      if (signUpError.message.toLowerCase().includes("already registered")) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: mailNormalizado,
          password,
        });
        if (signInError) {
          setCargando(false);
          Alert.alert(
            "Ya existe una cuenta con ese mail",
            "Si ya te habías unido antes, iniciá sesión en vez de unirte con código de nuevo (o restablecé tu contraseña si no la recordás)."
          );
          return;
        }
      } else {
        setCargando(false);
        Alert.alert("No se pudo crear la cuenta", signUpError.message);
        return;
      }
    }
    // Con la sesión ya activa (signUp la deja logueada si la confirmación de
    // mail está desactivada en el proyecto — o signInWithPassword, arriba,
    // en el caso de un reintento), canjeamos el código atómicamente.
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

  /** A diferencia de "unirse con código", esto NO deja entrar de una — la
   * comunidad nace "pendiente" y hay que esperar a que el administrador de
   * la plataforma la apruebe (a pedido explícito del usuario, ver
   * lib/db/comunidades.ts). Quien la pide ya queda con la cuenta creada
   * (Socio Fundador de esa comunidad), pero refrescarUsuario() la manda a
   * la pantalla de espera, no adentro — ver el chequeo de arriba. */
  async function crearComunidad() {
    if (!nombre.trim() || !mail.trim() || !password || !nombreComunidad.trim()) {
      Alert.alert("Faltan datos", "Completá tu nombre, el nombre de la comunidad, mail y contraseña.");
      return;
    }
    setCargando(true);
    const mailNormalizado = mail.trim().toLowerCase();
    const { error: signUpError } = await supabase.auth.signUp({
      email: mailNormalizado,
      password,
    });
    if (signUpError) {
      // Mismo caso que en unirseConCodigo (ver el comentario ahí): la fila
      // de `usuarios` recién se crea al pedir la comunidad, no en el
      // signUp — un reintento con el mismo mail choca acá con "already
      // registered" si el primer intento falló después del signUp.
      if (signUpError.message.toLowerCase().includes("already registered")) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: mailNormalizado,
          password,
        });
        if (signInError) {
          setCargando(false);
          Alert.alert(
            "Ya existe una cuenta con ese mail",
            "Si ya habías pedido una comunidad antes, iniciá sesión en vez de volver a pedirla (o restablecé tu contraseña si no la recordás)."
          );
          return;
        }
      } else {
        setCargando(false);
        Alert.alert("No se pudo crear la cuenta", signUpError.message);
        return;
      }
    }
    try {
      await solicitarComunidad(nombreComunidad, nombre);
    } catch (e: any) {
      setCargando(false);
      Alert.alert("No se pudo enviar la solicitud", e.message ?? String(e));
      return;
    }
    await refrescarUsuario();
    setCargando(false);
  }

  /** Paso 1 de "olvidé mi contraseña": pide el mail y dispara el código —
   * el mismo mail de "restablecer contraseña" de Supabase, que además del
   * link (que acá no usamos) trae un código — la cantidad de dígitos la
   * decide Supabase, la app no le pone un largo fijo. */
  async function enviarCodigoRecuperacion() {
    if (!mail.trim()) {
      Alert.alert("Falta el mail", "Escribí el mail con el que te registraste.");
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(mail.trim().toLowerCase());
    setCargando(false);
    if (error) {
      Alert.alert("No se pudo enviar el código", error.message);
      return;
    }
    setModo("recuperar-confirmar");
  }

  /** Paso 2: canjea el código (deja una sesión de recuperación activa) y
   * de una vez pisa la contraseña vieja por la nueva. */
  async function confirmarNuevaClave() {
    if (!codigoRecuperacion.trim() || !nuevaClave) {
      Alert.alert("Faltan datos", "Completá el código que te llegó por mail y la contraseña nueva.");
      return;
    }
    setCargando(true);
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: mail.trim().toLowerCase(),
      token: codigoRecuperacion.trim(),
      type: "recovery",
    });
    if (otpError) {
      setCargando(false);
      Alert.alert("Código inválido", "Revisá el código que te llegó por mail — vence a los pocos minutos.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: nuevaClave });
    setCargando(false);
    if (updateError) {
      Alert.alert("No se pudo cambiar la contraseña", updateError.message);
      return;
    }
    // Ya queda logueada con la sesión que abrió verifyOtp — el chequeo de
    // arriba (session && usuario) la manda derecho adentro apenas
    // useAuth resuelva el perfil.
    await refrescarUsuario();
  }

  function volverAIngresar() {
    setModo("ingresar");
    setPassword("");
    setCodigo("");
    setNombreComunidad("");
    setCodigoRecuperacion("");
    setNuevaClave("");
  }

  const accion =
    modo === "ingresar"
      ? ingresar
      : modo === "unirse"
        ? unirseConCodigo
        : modo === "crear-comunidad"
          ? crearComunidad
          : modo === "recuperar-pedir"
            ? enviarCodigoRecuperacion
            : confirmarNuevaClave;

  const textoBoton =
    modo === "ingresar"
      ? "Ingresar"
      : modo === "unirse"
        ? "Unirme"
        : modo === "crear-comunidad"
          ? "Enviar solicitud"
          : modo === "recuperar-pedir"
            ? "Enviarme un código"
            : "Cambiar contraseña";

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
            <Text style={styles.titulo}>{TITULOS[modo]}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.form}>
              {(modo === "unirse" || modo === "crear-comunidad") && (
                <TextInput
                  style={styles.input}
                  placeholder="Tu nombre"
                  placeholderTextColor={colors.textMuted}
                  value={nombre}
                  onChangeText={setNombre}
                />
              )}

              {modo === "crear-comunidad" && (
                <TextInput
                  style={styles.input}
                  placeholder="Nombre de la comunidad (tu empresa)"
                  placeholderTextColor={colors.textMuted}
                  value={nombreComunidad}
                  onChangeText={setNombreComunidad}
                />
              )}

              {modo !== "recuperar-confirmar" && (
                <TextInput
                  style={styles.input}
                  placeholder="Mail"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={mail}
                  onChangeText={setMail}
                />
              )}
              {modo === "recuperar-confirmar" && (
                <Text style={styles.mailConfirmado}>Código enviado a {mail.trim()}</Text>
              )}

              {(modo === "ingresar" || modo === "unirse" || modo === "crear-comunidad") && (
                <TextInput
                  style={styles.input}
                  placeholder="Contraseña"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              )}

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

              {modo === "recuperar-confirmar" && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Código que te llegó por mail"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={codigoRecuperacion}
                    onChangeText={setCodigoRecuperacion}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Contraseña nueva"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    value={nuevaClave}
                    onChangeText={setNuevaClave}
                  />
                </>
              )}

              <Pressable
                style={[styles.botonConfirmar, cargando && styles.deshabilitado]}
                disabled={cargando}
                onPress={accion}
              >
                <Text style={styles.botonConfirmarTexto}>{cargando ? "Un momento…" : textoBoton}</Text>
              </Pressable>
            </View>

            {modo === "ingresar" && (
              <>
                <Pressable style={styles.botonUnirse} onPress={() => setModo("unirse")}>
                  <Text style={styles.botonUnirseTexto}>¿Sos nuevo? Unirte con un código de invitación</Text>
                </Pressable>
                <Pressable style={styles.volverLink} onPress={() => setModo("crear-comunidad")}>
                  <Text style={styles.volverLinkTexto}>¿Querés armar tu propia comunidad? (requiere aprobación)</Text>
                </Pressable>
                <Pressable style={styles.volverLink} onPress={() => setModo("recuperar-pedir")}>
                  <Text style={styles.volverLinkTexto}>¿Olvidaste tu contraseña?</Text>
                </Pressable>
              </>
            )}
            {modo === "recuperar-confirmar" && (
              <Pressable style={styles.volverLink} onPress={() => setModo("recuperar-pedir")}>
                <Text style={styles.volverLinkTexto}>¿No te llegó? Pedir otro código</Text>
              </Pressable>
            )}
            {modo !== "ingresar" && (
              <Pressable style={styles.volverLink} onPress={volverAIngresar}>
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
  mailConfirmado: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
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
