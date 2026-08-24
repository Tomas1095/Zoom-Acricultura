import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

const LOGO_VERDE = "#344D40";
const LOGO_CREMA = "#DAD8CC";
const LOGO_NARANJA = "#DB945D";

function ZoomLogoIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="26.5" stroke={color} strokeWidth="11" fill="none" />
      <Line x1="50" y1="23.5" x2="50" y2="6" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <Line x1="50" y1="76.5" x2="50" y2="94" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <Line x1="23.5" y1="50" x2="6" y2="50" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <Line x1="76.5" y1="50" x2="94" y2="50" stroke={color} strokeWidth="11" strokeLinecap="round" />
      <Path
        d="M 61.74 13.86 L 64.44 14.85 L 67.05 16.04 L 69.57 17.43 L 71.98 19.00 L 74.26 20.75 L 76.40 22.67 L 78.39 24.74 L 80.21 26.95 L 81.87 29.30 L 83.34 31.77 L 84.62 34.34 L 85.71 37.00"
        stroke={LOGO_NARANJA}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M 15.02 35.15 L 16.19 32.65 L 17.54 30.24 L 19.06 27.93 L 20.75 25.74 L 22.59 23.68 L 24.57 21.76 L 26.69 19.99 L 28.93 18.37 L 31.29 16.93 L 33.74 15.65 L 36.28 14.56 L 38.89 13.66"
        stroke={LOGO_NARANJA}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M 29.30 81.87 L 27.26 80.45 L 25.32 78.90 L 23.48 77.22 L 21.76 75.43 L 20.16 73.53 L 18.68 71.52 L 17.34 69.43 L 16.14 67.25 L 15.09 65.00 L 14.18 62.68 L 13.43 60.31 L 12.83 57.90"
        stroke={LOGO_NARANJA}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface ZoomLogoProps {
  variant?: "light" | "dark";
  iconSize?: number;
  wordSize?: number;
  showSub?: boolean;
}

/** Portado de ZoomLogo/ZoomLogoIcon del prototipo. */
export function ZoomLogo({ variant = "dark", iconSize = 24, wordSize = 17, showSub = true }: ZoomLogoProps) {
  const color = variant === "light" ? LOGO_CREMA : LOGO_VERDE;
  return (
    <View style={[styles.fila, { gap: Math.max(6, iconSize * 0.22) }]}>
      <ZoomLogoIcon color={color} size={iconSize} />
      <View style={styles.columna}>
        <Text style={[styles.zoom, { fontSize: wordSize, color }]}>ZOOM</Text>
        {showSub && (
          <Text style={[styles.agricultura, { fontSize: Math.max(7, wordSize * 0.24), color }]}>AGRICULTURA</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center" },
  columna: { alignItems: "center" },
  zoom: { fontWeight: "900", letterSpacing: -0.5 },
  agricultura: { fontWeight: "700", letterSpacing: 0.6, marginTop: 1 },
});
