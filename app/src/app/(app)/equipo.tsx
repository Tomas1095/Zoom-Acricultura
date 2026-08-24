import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth-context";
import { puedeGestionarEquipo } from "@/lib/roles";
import { EquipoScreen } from "@/features/equipo/equipo-screen";

export default function EquipoRoute() {
  const { usuario } = useAuth();
  if (!usuario || !puedeGestionarEquipo(usuario.rol)) return <Redirect href="/(app)" />;
  return <EquipoScreen />;
}
