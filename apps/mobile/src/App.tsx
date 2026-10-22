import { Avatar, Button, Chip, Label, green, muted, s } from "./ui";
import { ExploreScreen } from "./screens/ExploreScreen";
import { CommunityScreen } from "./screens/CommunityScreen";
import { TripsScreen } from "./screens/TripsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Command, Post, State, Trek } from "@trektribe/core";
import {
  dispatch,
  loadState,
  makeId,
  mode,
  apiUrl,
  createInvitation,
  pinnedRoute,
  setBlock,
} from "./data";
import { Icon, MountainArt, RouteArt } from "./Art";
import { AuthGate } from "./AuthGate";
import { BlockSettings } from "./BlockSettings";
import { Forum } from "./Forum";
import { TripChat } from "./TripChat";
import {
  ProfileEditor,
  TripEditor,
  InvitationSheet,
  RouteEditor,
} from "./Editors";
import { authenticatedMode } from "./session";
import { Slot, usePathname, useRouter } from "expo-router";
import { resolveRoute, tabPaths } from "./navigation";
import {
  useDiscoveryFilters,
  resetDiscoveryFilters,
} from "./discovery-filters";

const tabs = ["Explore", "Community", "Trips", "Profile"] as const;
type Tab = (typeof tabs)[number];
function useRequestId() {
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  const get = (payload: unknown) => {
    const fingerprint = JSON.stringify(payload);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, id: makeId() };
    return pending.current!.id;
  };
  return [
    get,
    () => {
      pending.current = null;
    },
  ] as const;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Slot />
      {authenticatedMode ? (
        <AuthGate>
          {(logout) => (
            <Application
              logout={async () => {
                await logout();
                resetDiscoveryFilters();
              }}
            />
          )}
        </AuthGate>
      ) : (
        <Application />
      )}
    </SafeAreaProvider>
  );
}
function Application({ logout }: { logout?: () => Promise<void> }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [state, setState] = useState<State | null>(null);
  const pathname = usePathname(),
    router = useRouter(),
    route = resolveRoute(pathname);
  const tab = route.tab;
  const { setQuery, setDifficulty, setSavedOnly } = useDiscoveryFilters();
  const [preview, setPreview] = useState<Trek | null>(null),
    [composer, setComposer] = useState(false),
    [comments, setComments] = useState<Post | null>(null);
  const [blockSettings, setBlockSettings] = useState(false);
  const [forum, setForum] = useState(false);
  const [chatTrip, setChatTrip] = useState<string | null>(null);
  const [routeEditor, setRouteEditor] = useState<Trek | boolean>(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState(false),
    [createTrip, setCreateTrip] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () => {
    setError("");
    loadState()
      .then(setState)
      .catch((e) => setError(e.message));
  };
  useEffect(refresh, []);
  useEffect(() => {
    setPreview(null);
    setComposer(false);
    setComments(null);
    setBlockSettings(false);
    setForum(false);
    setChatTrip(null);
    setRouteEditor(false);
    setInvite(null);
    setEditProfile(false);
    setCreateTrip(false);
    setError("");
  }, [pathname]);
  const selected =
    preview ??
    (route.trailId
      ? (state?.treks.find((t) => t.id === route.trailId) ?? null)
      : null);
  function closeTrail() {
    setPreview(null);
    if (route.trailId) router.replace("/");
  }
  function openTrail(trek: Trek) {
    router.push({ pathname: "/trails/[id]", params: { id: trek.id } });
  }
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  async function act(command: Command, message?: string) {
    setBusy(true);
    try {
      setState(await dispatch(command));
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function blockAuthor(id: string) {
    setBusy(true);
    setError("");
    try {
      await setBlock(id, true);
      setComments(null);
      setChatTrip(null);
      setState(await loadState());
      setNotice("Person blocked. Manage blocks in Profile.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function showPinnedRoute(id: string, trek: Trek) {
    setBusy(true);
    pinnedRoute(id)
      .then((r) =>
        setPreview({
          ...trek,
          route: r.coordinates,
          routeVersionId: r.id,
          distanceKm: r.distanceKm,
          elevationM: r.elevationM,
          hasElevation: r.hasElevation,
        }),
      )
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }
  function inviteToTrip(id: string) {
    setBusy(true);
    createInvitation(id)
      .then((v) => setInvite(v.token))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }
  if (!state)
    return (
      <SafeAreaView style={s.loading}>
        <Icon name="mountain" size={48} />
        <Text style={s.title}>TrekTribe</Text>
        {error ? (
          <>
            <Text style={s.body}>{error}</Text>
            <Button title="Try again" onPress={refresh} />
            {logout && (
              <Button
                title="Sign out"
                onPress={() => logout().catch((e) => setError(e.message))}
              />
            )}
          </>
        ) : (
          <ActivityIndicator color={green} />
        )}
      </SafeAreaView>
    );
  if (route.notFound || (route.trailId && !selected))
    return (
      <SafeAreaView style={s.loading}>
        <Text style={s.title}>Page not found</Text>
        <Text style={s.body}>This trail or page is unavailable.</Text>
        <Button title="Back to Explore" onPress={() => router.replace("/")} />
      </SafeAreaView>
    );
  const saved = state.saved[state.profile.id] || [];
  const headerTitle = {
    Explore: "Find your next outside.",
    Community: "Stories from the trail.",
    Trips: "Good trails. Better company.",
    Profile: "Your trail story.",
  }[tab];
  function navigate(next: Tab) {
    router.navigate(tabPaths[next]);
    setError("");
  }
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.topbar, { paddingHorizontal: wide ? 44 : 20 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="TrekTribe home"
          onPress={() => navigate("Explore")}
          style={s.brand}
        >
          <View style={s.logo}>
            <Icon name="mountain" color="#fff" size={26} />
          </View>
          <Text style={s.brandText}>
            TrekTribe<Text style={{ color: "#91a47a" }}>.</Text>
          </Text>
        </Pressable>
        {wide && (
          <View style={s.nav}>
            {tabs.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                onPress={() => navigate(t)}
                style={[s.navItem, tab === t && s.navActive]}
              >
                <Text style={[s.navText, tab === t && { color: green }]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={s.row}>
          <Text style={s.demoPill}>{mode}</Text>
          {logout && (
            <Button
              title="Sign out"
              quiet
              disabled={busy}
              onPress={() => logout().catch((e) => setError(e.message))}
            />
          )}{" "}
          {wide && <Avatar initials={state.profile.initials} small />}
        </View>
      </View>
      {!!error && (
        <View accessibilityRole="alert" style={s.error}>
          <Text style={{ color: "#842f24", flex: 1 }}>{error}</Text>
          <Pressable
            accessibilityLabel="Dismiss error"
            onPress={() => setError("")}
          >
            <Icon name="close" color="#842f24" />
          </Pressable>
        </View>
      )}
      {!!notice && (
        <View accessibilityLiveRegion="polite" style={s.notice}>
          <Icon name="check" size={18} />
          <Text style={s.bodySmall}>{notice}</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingHorizontal: wide ? 44 : 20 },
        ]}
      >
        <View style={s.pageHeader}>
          <View>
            <Label>LESS SCROLLING. MORE SUMMITS.</Label>
            <Text style={[s.title, { fontSize: wide ? 38 : 30 }]}>
              {headerTitle}
            </Text>
            <Text style={s.subtitle}>
              {tab === "Explore"
                ? "Discover a trail, find your people, make a little room for adventure."
                : tab === "Community"
                  ? "Real moments, useful notes, and a shared love for the outdoors."
                  : tab === "Trips"
                    ? "Small groups, shared plans, and a place for everyone."
                    : "Every mile has a memory. Keep yours here."}
            </Text>
          </View>
          {wide && (
            <Text style={s.edition}>
              THE OUTDOOR COLLECTIVE{"\n"}EST. 2026 ↗
            </Text>
          )}
        </View>
        {tab === "Explore" && (
          <ExploreScreen
            state={state}
            wide={wide}
            width={width}
            saved={saved}
            busy={busy}
            act={act}
            openTrail={openTrail}
            onImport={() => setRouteEditor(true)}
            navigate={navigate}
          />
        )}
        {tab === "Community" && (
          <CommunityScreen
            state={state}
            wide={wide}
            busy={busy}
            act={act}
            onForum={() => setForum(true)}
            onCompose={() => setComposer(true)}
            onComments={setComments}
            blockAuthor={blockAuthor}
          />
        )}
        {tab === "Trips" && (
          <TripsScreen
            state={state}
            wide={wide}
            busy={busy}
            act={act}
            onCreate={() => setCreateTrip(true)}
            onInvite={() => setInvite("")}
            onChat={setChatTrip}
            onPinnedRoute={showPinnedRoute}
            onCreateInvitation={inviteToTrip}
          />
        )}
        {tab === "Profile" && (
          <ProfileScreen
            state={state}
            saved={saved}
            onBlocks={() => setBlockSettings(true)}
            onEdit={() => setEditProfile(true)}
            onSavedTrails={() => {
              setSavedOnly(true);
              setQuery("");
              setDifficulty("All");
              navigate("Explore");
            }}
          />
        )}
        <View style={s.footer}>
          <View style={s.row}>
            <Icon name="mountain" size={18} />
            <Text style={s.bodySmall}>Made for the way out.</Text>
          </View>
          <Text style={s.footerNote}>
            Demo data · Illustrative routes, not navigation guidance
          </Text>
        </View>
      </ScrollView>
      {!wide && (
        <View style={s.bottomNav}>
          {tabs.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: t === tab }}
              onPress={() => navigate(t)}
              style={s.bottomItem}
            >
              <Icon
                name={t.toLowerCase()}
                color={tab === t ? green : "#939b94"}
              />
              <Text
                style={{
                  fontSize: 11,
                  color: tab === t ? green : muted,
                  fontWeight: tab === t ? "700" : "400",
                }}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Modal
        visible={!!selected && !routeEditor}
        animationType="slide"
        transparent
        onRequestClose={() => closeTrail()}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modal}>
            <ScrollView>
              {selected && (
                <>
                  <View style={{ height: 220 }}>
                    <MountainArt color={selected.color} />
                  </View>
                  <View style={s.modalBody}>
                    <View style={s.rowBetween}>
                      <Label>{selected.region.toUpperCase()}</Label>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Close trail details"
                        onPress={() => closeTrail()}
                      >
                        <Icon name="close" />
                      </Pressable>
                    </View>
                    <Text style={s.title}>{selected.title}</Text>
                    <Text style={s.body}>{selected.description}</Text>
                    <View style={s.stats}>
                      {[
                        [`${selected.distanceKm} km`, "distance"],
                        [`${selected.elevationM} m`, "ascent"],
                        [selected.difficulty, "difficulty"],
                      ].map(([v, k]) => (
                        <View key={k}>
                          <Text style={[s.statValue, { fontSize: 22 }]}>
                            {v}
                          </Text>
                          <Text style={s.bodySmall}>{k}</Text>
                        </View>
                      ))}
                    </View>
                    <Label>
                      {selected.ownerId
                        ? "IMPORTED ROUTE PREVIEW · NO BASEMAP"
                        : "ROUTE PREVIEW · ILLUSTRATIVE ONLY"}
                    </Label>
                    {selected.hasElevation === false && (
                      <Text style={s.bodySmall}>
                        Elevation data was not available in this GPX file.
                      </Text>
                    )}
                    {!!apiUrl && selected.ownerId === state.profile.id && (
                      <Button
                        title="Replace GPX route"
                        quiet
                        onPress={() => {
                          setRouteEditor(selected);
                        }}
                      />
                    )}
                    <View style={{ height: 250 }}>
                      <RouteArt points={selected.route} />
                    </View>
                    <Text style={s.bodySmall}>
                      Live basemaps, offline downloads, and GPS recording are
                      not connected in this build.
                    </Text>
                    <View style={[s.row, { flexWrap: "wrap" }]}>
                      {selected.highlights.map((h) => (
                        <Text key={h} style={s.badge}>
                          {h}
                        </Text>
                      ))}
                    </View>
                    <Button
                      title={
                        saved.includes(selected.id)
                          ? "Saved to your trails ✓"
                          : "Save this trail"
                      }
                      disabled={busy}
                      onPress={() =>
                        act({
                          type: "save",
                          trekId: selected.id,
                          saved: !saved.includes(selected.id),
                        })
                      }
                    />
                    <Button
                      title="Find a group trek"
                      quiet
                      onPress={() => {
                        setPreview(null);
                        navigate("Trips");
                      }}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Composer
        visible={composer}
        state={state}
        busy={busy}
        onClose={() => setComposer(false)}
        onSubmit={async (cmd) => {
          const ok = await act(cmd, "Your trail story is published.");
          if (ok) setComposer(false);
          return ok;
        }}
      />
      {blockSettings && (
        <BlockSettings
          onClose={() => setBlockSettings(false)}
          onChanged={refresh}
        />
      )}
      {forum && (
        <Forum userId={state.profile.id} onClose={() => setForum(false)} />
      )}
      {chatTrip && (
        <TripChat
          userId={state.profile.id}
          tripId={chatTrip}
          onClose={() => setChatTrip(null)}
        />
      )}
      {!!routeEditor && (
        <RouteEditor
          trek={typeof routeEditor === "object" ? routeEditor : undefined}
          onClose={() => setRouteEditor(false)}
          onImported={refresh}
        />
      )}
      {invite !== null && (
        <InvitationSheet
          token={invite || undefined}
          onClose={() => setInvite(null)}
          onAccepted={refresh}
        />
      )}
      {editProfile && (
        <ProfileEditor
          profile={state.profile}
          busy={busy}
          onClose={() => setEditProfile(false)}
          onSubmit={(cmd) => act(cmd, "Profile updated.")}
        />
      )}
      {createTrip && (
        <TripEditor
          treks={state.treks}
          busy={busy}
          onClose={() => setCreateTrip(false)}
          onSubmit={(cmd) => act(cmd, "Outing created.")}
        />
      )}
      <Comments
        post={comments}
        state={state}
        busy={busy}
        onClose={() => setComments(null)}
        onSubmit={(cmd) => act(cmd)}
      />
    </SafeAreaView>
  );
}

function Composer({
  visible,
  state,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  state: State;
  busy: boolean;
  onClose: () => void;
  onSubmit: (c: Command) => Promise<boolean>;
}) {
  const [requestId, resetRequestId] = useRequestId();
  const [content, setContent] = useState(""),
    [trekId, setTrekId] = useState(state.treks[0]?.id || ""),
    [rating, setRating] = useState(5),
    [condition, setCondition] = useState("Clear"),
    [observed, setObserved] = useState(new Date().toISOString().slice(0, 10)),
    [formError, setFormError] = useState("");
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View style={s.modal}>
          <ScrollView contentContainerStyle={s.modalBody}>
            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>Share a trail story</Text>
              <Pressable
                accessibilityLabel="Close story editor"
                onPress={onClose}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <Text style={s.bodySmall}>
              Text reports are ready to try. Photo and video uploads will arrive
              with cloud storage integration.
            </Text>
            <Label>YOUR TRAIL</Label>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              {state.treks.map((t) => (
                <Chip
                  key={t.id}
                  title={t.title}
                  active={trekId === t.id}
                  onPress={() => setTrekId(t.id)}
                />
              ))}
            </View>
            <Label>THE STORY</Label>
            <TextInput
              accessibilityLabel="Your trail story"
              multiline
              value={content}
              maxLength={5000}
              onChangeText={setContent}
              placeholder="What should the next trekker know?"
              style={[s.input, { height: 140, textAlignVertical: "top" }]}
            />
            <Label>RATING</Label>
            <Text style={s.bodySmall}>
              Each report contributes one rating to the trail average, including
              reports from repeat visits.
            </Text>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip
                  key={n}
                  title={`${n} ★`}
                  active={rating === n}
                  onPress={() => setRating(n)}
                />
              ))}
            </View>
            <Label>CONDITIONS</Label>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              {["Clear", "Muddy", "Snow", "Blocked", "Unknown"].map((c) => (
                <Chip
                  key={c}
                  title={c}
                  active={condition === c}
                  onPress={() => setCondition(c)}
                />
              ))}
            </View>
            <Label>OBSERVED ON (YYYY-MM-DD)</Label>
            <TextInput
              accessibilityLabel="Observation date"
              value={observed}
              onChangeText={setObserved}
              style={s.input}
            />
            {!!formError && (
              <Text accessibilityRole="alert" style={{ color: "#a04230" }}>
                {formError}
              </Text>
            )}
            <Button
              title={busy ? "Publishing…" : "Publish story"}
              disabled={busy || !content.trim()}
              onPress={async () => {
                const ok = await onSubmit({
                  type: "post",
                  id: requestId({
                    trekId,
                    content,
                    rating,
                    condition,
                    observed,
                  }),
                  trekId,
                  content,
                  rating,
                  condition,
                  observedAt: observed,
                });
                if (ok) {
                  resetRequestId();
                  setContent("");
                  setFormError("");
                } else
                  setFormError(
                    "Could not publish. Check your date and connection, then try again.",
                  );
              }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function Comments({
  post,
  state,
  busy,
  onClose,
  onSubmit,
}: {
  post: Post | null;
  state: State;
  busy: boolean;
  onClose: () => void;
  onSubmit: (c: Command) => Promise<boolean>;
}) {
  const [requestId, resetRequestId] = useRequestId();
  const [body, setBody] = useState(""),
    [failed, setFailed] = useState(false);
  return (
    <Modal
      visible={!!post}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View style={s.modal}>
          <ScrollView contentContainerStyle={s.modalBody}>
            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>Around the campfire</Text>
              <Pressable accessibilityLabel="Close comments" onPress={onClose}>
                <Icon name="close" />
              </Pressable>
            </View>
            {state.comments
              .filter((c) => c.postId === post?.id)
              .map((c) => (
                <View key={c.id} style={s.comment}>
                  <Text style={s.person}>{c.author}</Text>
                  <Text style={s.body}>{c.body}</Text>
                </View>
              ))}
            {!state.comments.some((c) => c.postId === post?.id) && (
              <Text style={s.body}>
                Be the first to share a thought or ask a question.
              </Text>
            )}
            <TextInput
              accessibilityLabel="Write a comment"
              placeholder="Keep the conversation kind…"
              value={body}
              onChangeText={setBody}
              maxLength={1000}
              multiline
              style={[s.input, { minHeight: 85 }]}
            />
            {failed && (
              <Text style={{ color: "#a04230" }}>
                Could not send. Please try again.
              </Text>
            )}
            <Button
              title="Post comment"
              disabled={busy || !body.trim()}
              onPress={async () => {
                if (post) {
                  const ok = await onSubmit({
                    type: "comment",
                    id: requestId({ postId: post.id, body }),
                    postId: post.id,
                    body,
                  });
                  setFailed(!ok);
                  if (ok) {
                    resetRequestId();
                    setBody("");
                  }
                }
              }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
