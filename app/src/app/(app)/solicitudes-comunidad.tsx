import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth-context";
import { SolicitudesComunidadScreen } from "@/features/comunidad/solicitudes-screen";

export default function SolicitudesComunidadRoute() {
  const { usuario } = useAuth();
  if (!usuario || !usuario.adminPlataforma) return <Redirect href="/(app)" />;
  return <SolicitudesComunidadScreen />;
}
