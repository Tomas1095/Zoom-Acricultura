// Paleta portada del prototipo (prototipo-app.jsx). Nombres semánticos en vez de
// hex sueltos, para que los componentes no repitan los mismos strings de color.
export const colors = {
  background: "#F3F7F2",
  surface: "#FFFFFF",

  text: "#1B2E1F",
  textMuted: "#6B5D2E",

  border: "#EDE0B8",
  borderStrong: "#D9C078",

  primary: "#1B8A4A",
  primaryDark: "#155C35",
  primaryConfirm: "#2F6B3E", // botón de confirmar carga en el prototipo

  accentGold: "#A9752E",
  accentGoldMuted: "#8A7B4F",

  warning: "#D9631F",
  warningBg: "#F2D9A0",

  danger: "#B71C1C",
  dangerBg: "#FDECEC",

  info: "#1E6FEB",

  successBg: "#E4F0E7",

  // Fondo del mapa en modo trabajo (pantalla completa) — mismo verde oscuro
  // que el prototipo, distinto del `background` claro de las vistas
  // normales. Sin este fondo oscuro los colores pensados para pantalla
  // completa (etiquetas color hueso, perímetro claro) casi no se ven.
  mapaOscuro: "#2F3B26",
} as const;

export type ColorToken = keyof typeof colors;
