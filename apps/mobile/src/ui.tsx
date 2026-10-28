import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
export const green = "#234d3b",
  muted = "#768078",
  ink = "#233d32";
export function Button({
  title,
  onPress,
  quiet = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        quiet && s.quiet,
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[s.buttonText, quiet && { color: green }]}>{title}</Text>
    </Pressable>
  );
}
export function Chip({
  title,
  active = false,
  onPress,
}: {
  title: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.chip, active && s.chipActive]}
    >
      <Text style={[s.chipText, active && { color: "#fff" }]}>{title}</Text>
    </Pressable>
  );
}
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.eyebrow}>{children}</Text>;
}
export function Avatar({
  initials,
  small = false,
}: {
  initials: string;
  small?: boolean;
}) {
  return (
    <View style={[s.avatar, small && { width: 34, height: 34 }]}>
      <Text style={s.avatarText}>{initials}</Text>
    </View>
  );
}
export function date(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8f8f2" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    padding: 30,
  },
  topbar: {
    height: 88,
    backgroundColor: "#fcfcf7",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e8df",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { fontSize: 25, fontWeight: "800", color: ink, letterSpacing: -1 },
  nav: { flexDirection: "row", height: "100%", gap: 32 },
  navItem: {
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    paddingHorizontal: 4,
  },
  navActive: { borderBottomColor: green },
  navText: { fontSize: 14, color: muted, fontWeight: "600" },
  demoPill: {
    fontSize: 10,
    color: green,
    backgroundColor: "#edf0e4",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  content: {
    maxWidth: 1440,
    width: "100%",
    alignSelf: "center",
    paddingTop: 36,
    paddingBottom: 24,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.9,
    color: "#71806c",
    marginBottom: 10,
  },
  title: {
    fontSize: 31,
    lineHeight: 43,
    fontWeight: "700",
    color: ink,
    letterSpacing: -1.1,
  },
  subtitle: {
    color: muted,
    fontSize: 14,
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 700,
  },
  edition: {
    fontSize: 9,
    lineHeight: 19,
    letterSpacing: 1.5,
    color: muted,
    textAlign: "right",
  },
  hero: { borderRadius: 20, overflow: "hidden", marginBottom: 28 },
  heroPanel: {
    height: "100%",
    padding: 30,
    backgroundColor: "rgba(24,54,42,0.94)",
    justifyContent: "center",
  },
  heroEyebrow: {
    fontSize: 9,
    color: "#c4d0ae",
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 13,
  },
  heroTitle: {
    color: "#f8f4e4",
    fontWeight: "600",
    letterSpacing: -1.1,
    lineHeight: 43,
  },
  heroCopy: { color: "#cbd4c7", fontSize: 13, lineHeight: 20, marginTop: 12 },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginTop: 23,
  },
  heroButtonText: { fontSize: 12, fontWeight: "700", color: "#f9f8ed" },
  artCredit: { position: "absolute", right: 16, bottom: 13 },
  artCreditText: { fontSize: 7, color: "#e2e8d6", letterSpacing: 1.2 },
  searchRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 30,
    alignItems: "center",
  },
  searchBox: {
    flex: 1,
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#dfe5d8",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
  },
  searchInput: { flex: 1, fontSize: 13, color: ink, height: "100%" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: ink,
    letterSpacing: -0.6,
    lineHeight: 29,
  },
  body: { fontSize: 14, color: "#5d6c61", lineHeight: 23 },
  bodySmall: { fontSize: 12, color: muted, lineHeight: 20 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dde3d7",
    backgroundColor: "#fcfcf8",
  },
  chipActive: { backgroundColor: green, borderColor: green },
  chipText: { fontSize: 11, fontWeight: "600", color: "#61705f" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  trailCard: {
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e7dc",
    overflow: "hidden",
    marginBottom: 2,
  },
  cardArt: { height: 186 },
  difficulty: {
    position: "absolute",
    top: 13,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#f4f4e8",
  },
  tagText: { fontSize: 10, fontWeight: "600", color: green },
  cardBody: { padding: 19 },
  location: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1.15,
    color: "#819079",
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: "600",
    color: ink,
    letterSpacing: -0.6,
    marginTop: 8,
    marginBottom: 6,
  },
  cardFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eff0e8",
  },
  communityBanner: {
    marginTop: 32,
    borderRadius: 16,
    backgroundColor: "#ecf0e3",
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 20,
  },
  button: {
    paddingHorizontal: 19,
    paddingVertical: 13,
    borderRadius: 9,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  quiet: { backgroundColor: "#e8edde", borderWidth: 1, borderColor: "#d4dfca" },
  empty: { alignItems: "center", padding: 45, gap: 15 },
  footer: {
    paddingTop: 36,
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: "#e0e5d9",
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  footerNote: { fontSize: 10, color: "#909a8e" },
  bottomNav: {
    height: 66,
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: "#e0e5d9",
    backgroundColor: "#fcfcf7",
  },
  bottomItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e9ddc7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "700", color: "#796a4d" },
  person: { fontSize: 14, fontWeight: "600", color: ink },
  postCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e6d9",
    borderRadius: 16,
    overflow: "hidden",
  },
  condition: {
    fontSize: 10,
    color: green,
    backgroundColor: "#eff2e5",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 15,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    marginRight: 12,
  },
  feedLayout: { flexDirection: "row", gap: 28, maxWidth: 1100 },
  aside: {
    width: 270,
    backgroundColor: "#edf0e5",
    padding: 24,
    borderRadius: 16,
    alignSelf: "flex-start",
    gap: 14,
  },
  divider: { height: 1, backgroundColor: "#d9dfd0", marginVertical: 6 },
  tripCard: {
    borderWidth: 1,
    borderColor: "#dfe5d8",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  profileLayout: { flexDirection: "row", flexWrap: "wrap", gap: 24 },
  profileCard: {
    minWidth: 280,
    padding: 28,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfe5d8",
    alignItems: "center",
    gap: 16,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 22,
    width: "100%",
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e7ebdf",
  },
  statValue: {
    fontSize: 30,
    fontWeight: "600",
    color: green,
    letterSpacing: -1,
  },
  panel: {
    minWidth: 280,
    padding: 25,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfe5d8",
    backgroundColor: "#fff",
    gap: 15,
  },
  badge: {
    fontSize: 11,
    color: green,
    backgroundColor: "#eef0df",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12,32,23,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modal: {
    backgroundColor: "#fcfcf7",
    width: "100%",
    maxWidth: 660,
    maxHeight: "94%",
    borderRadius: 20,
    overflow: "hidden",
  },
  modalBody: { padding: 24, gap: 18 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d7dfcf",
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: ink,
  },
  error: {
    backgroundColor: "#f8e6df",
    padding: 14,
    flexDirection: "row",
    gap: 12,
  },
  notice: {
    backgroundColor: "#e3eddd",
    paddingVertical: 10,
    paddingHorizontal: 24,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  comment: {
    padding: 16,
    backgroundColor: "#edf0e7",
    borderRadius: 10,
    gap: 6,
  },
});
