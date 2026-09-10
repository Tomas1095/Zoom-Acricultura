import { useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";

import { useAuth } from "./auth-context";
import { supabase } from "./supabase";

/** Eliminar la cuenta propia — a pedido de Apple (App Review, Guideline
 * 5.1.1(v)): la app permite crear una cuenta (ver login.tsx, signUp), así
 * que también tiene que ofrecer eliminarla desde adentro, no solo cerrar
 * sesión. Un solo hook compartido entre las dos pantallas que necesitan
 * esto — app/(app)/mi-cuenta.tsx (el caso normal) y
 * app/comunidad-pendiente.tsx (alguien que se registró creando una
 * comunidad nueva y se arrepiente mientras espera la aprobación, o le
 * rechazaron la solicitud — ahí también tiene que poder borrarse, y esa
 * pantalla vive AFUERA del grupo (app), sin acceso a mi-cuenta.tsx). */
export function useEliminarCuenta() {
  const { signOut } = useAuth();
  const [eliminando, setEliminando] = useState(false);

  async function eliminarCuenta() {
    setEliminando(true);
    try {
      const { error } = await supabase.rpc("eliminar_mi_cuenta");
      if (error) throw error;
      // El borrado en sí ya se hizo acá arriba — lo de abajo es solo
      // prolijidad (limpiar el estado guardado localmente en AsyncStorage
      // y mandar al login de una, sin esperar a que el próximo pedido a
      // Supabase falle solo para darse cuenta). Con la fila de auth.users
      // ya borrada del lado del servidor, `signOut()` puede llegar a
      // quejarse (la sesión que tenía guardada ya no es válida) — eso NO
      // tiene que mostrarse como "no se pudo eliminar la cuenta": la
      // cuenta YA se eliminó, solo falló el paso de limpieza cosmético.
      try {
        await signOut();
      } catch {
        // no-op — ver comentario de arriba.
      }
      router.replace("/login");
    } catch (e: any) {
      setEliminando(false);
      Alert.alert("No se pudo eliminar la cuenta", e.message ?? String(e));
    }
  }

  function confirmarEliminarCuenta() {
    Alert.alert("Última confirmación", "¿Seguro que querés eliminar tu cuenta? No hay forma de recuperarla después.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, eliminar", style: "destructive", onPress: eliminarCuenta },
    ]);
  }

  // Doble confirmación a propósito — es una acción irreversible, y el
  // primer Alert ya explica bastante texto como para que alguien lo lea
  // de pasada y toque "Eliminar cuenta" sin querer.
  function pedirEliminarCuenta() {
    Alert.alert(
      "¿Eliminar tu cuenta?",
      "Esta acción es PERMANENTE y no se puede deshacer. Vas a perder el acceso a la app con este mail — para volver a entrar necesitarías crear una cuenta nueva. Los lotes y datos cargados junto con tu equipo no se borran (siguen ahí para el resto de tu comunidad), solo se elimina tu usuario.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar cuenta", style: "destructive", onPress: confirmarEliminarCuenta },
      ]
    );
  }

  return { eliminando, pedirEliminarCuenta };
}
