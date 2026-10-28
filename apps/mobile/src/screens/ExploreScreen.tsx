import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchTreks, State, Trek } from '@trektribe/core';
import { apiUrl } from '../data';
import { Icon, MountainArt } from '../Art';
import { Button, Chip, Label, muted, s } from '../ui';
import { useDiscoveryFilters } from '../discovery-filters';
import type { Act, Tab } from './types';

type Props = {
  state: State;
  wide: boolean;
  width: number;
  saved: string[];
  busy: boolean;
  act: Act;
  openTrail: (trek: Trek) => void;
  onImport: () => void;
  navigate: (tab: Tab) => void;
};
export function ExploreScreen({
  state,
  wide,
  width,
  saved,
  busy,
  act,
  openTrail,
  onImport,
  navigate,
}: Props) {
  const {
    query,
    setQuery,
    difficulty,
    setDifficulty,
    savedOnly,
    setSavedOnly,
  } = useDiscoveryFilters();
  const trails = searchTreks(state.treks, query, difficulty).filter(
    (t) => !savedOnly || saved.includes(t.id),
  );
  function TrailCard({ trek, index }: { trek: Trek; index: number }) {
    return (
      <View
        style={[
          s.trailCard,
          { width: wide ? "31.8%" : width > 650 ? "48.5%" : "100%" },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${trek.title}`}
          onPress={() => openTrail(trek)}
        >
          <View style={s.cardArt}>
            <MountainArt color={trek.color} variant={index} />
            <View style={s.difficulty}>
              <Text style={s.tagText}>{trek.difficulty}</Text>
            </View>
          </View>
        </Pressable>
        <View style={s.cardBody}>
          <View style={s.rowBetween}>
            <Text style={s.location}>{trek.region.toUpperCase()}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${saved.includes(trek.id) ? "Unsave" : "Save"} ${trek.title}`}
              disabled={busy}
              onPress={() =>
                act({
                  type: "save",
                  trekId: trek.id,
                  saved: !saved.includes(trek.id),
                })
              }
            >
              <Icon
                name={saved.includes(trek.id) ? "check" : "save"}
                size={20}
              />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openTrail(trek)}>
            <Text style={s.cardTitle}>{trek.title}</Text>
          </Pressable>
          <Text style={s.bodySmall}>
            {trek.distanceKm} km · {trek.duration} · ↑ {trek.elevationM} m
          </Text>
          <View style={[s.rowBetween, s.cardFooter]}>
            <Text style={s.bodySmall}>
              <Text style={{ color: "#b89147" }}>★</Text>{" "}
              {trek.reports ? trek.rating.toFixed(1) : "Not rated"}{" "}
              <Text style={{ color: muted }}>({trek.reports} reports)</Text>
            </Text>
            <Pressable
              accessibilityLabel={`Open ${trek.title}`}
              accessibilityRole="button"
              onPress={() => openTrail(trek)}
            >
              <Icon name="arrow" size={19} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <>
      {!!apiUrl && (
        <Button title="Import GPX trail" quiet onPress={() => onImport()} />
      )}
      <View style={[s.hero, { height: wide ? 300 : 340 }]}>
        <View style={StyleSheet.absoluteFill}>
          <MountainArt color="#799389" />
        </View>
        <View style={[s.heroPanel, { maxWidth: wide ? "49%" : "85%" }]}>
          <Text style={s.heroEyebrow}>TAKE THE SCENIC ROUTE</Text>
          <Text style={[s.heroTitle, { fontSize: wide ? 38 : 32 }]}>
            A little higher.{"\n"}A little closer.
          </Text>
          <Text style={s.heroCopy}>
            Find your next mountain moment{"\n"}in the heart of the Himalayas.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => openTrail(state.treks[0])}
            style={s.heroButton}
          >
            <Text style={s.heroButtonText}>Explore Chandrashila</Text>
            <Icon name="arrow" size={18} color="#f9f8ed" />
          </Pressable>
        </View>
        <View style={s.artCredit}>
          <Text style={s.artCreditText}>ILLUSTRATED LANDSCAPE · DEMO</Text>
        </View>
      </View>
      <View style={[s.searchRow, !wide && { flexWrap: "wrap" }]}>
        <View style={s.searchBox}>
          <Icon name="search" size={20} />
          <TextInput
            accessibilityLabel="Search trails"
            placeholder="Search trails, places, or a little inspiration…"
            placeholderTextColor="#8b948d"
            value={query}
            onChangeText={setQuery}
            style={s.searchInput}
          />
          {!!query && (
            <Pressable
              accessibilityLabel="Clear search"
              onPress={() => setQuery("")}
            >
              <Icon name="close" size={18} />
            </Pressable>
          )}
        </View>
        <Chip
          title={savedOnly ? "✓ Saved trails" : "Saved trails"}
          active={savedOnly}
          onPress={() => setSavedOnly(!savedOnly)}
        />
      </View>
      <View
        style={[s.rowBetween, { marginBottom: 22, flexWrap: "wrap", gap: 12 }]}
      >
        <View>
          <Text style={s.sectionTitle}>A trail for every kind of day</Text>
          <Text style={s.bodySmall}>
            {trails.length} sample trails to get you started
          </Text>
        </View>
        <View style={[s.row, { flexWrap: "wrap" }]}>
          {["All", "Easy", "Moderate", "Hard"].map((d) => (
            <Chip
              key={d}
              title={d === "All" ? "All trails" : d}
              active={difficulty === d}
              onPress={() => setDifficulty(d)}
            />
          ))}
        </View>
      </View>
      <View style={s.grid}>
        {trails.map((t, i) => (
          <TrailCard key={t.id} trek={t} index={i} />
        ))}
      </View>
      {!trails.length && (
        <View style={s.empty}>
          <Icon name="explore" size={36} />
          <Text style={s.sectionTitle}>A different path awaits</Text>
          <Text style={s.body}>Try another search or clear your filters.</Text>
          <Button
            title="Reset filters"
            onPress={() => {
              setQuery("");
              setDifficulty("All");
              setSavedOnly(false);
            }}
            quiet
          />
        </View>
      )}
      <View style={s.communityBanner}>
        <View style={{ flex: 1 }}>
          <Label>FIND YOUR TRIBE</Label>
          <Text style={s.sectionTitle}>
            The best part of a trek? Who you share it with.
          </Text>
          <Text style={s.bodySmall}>
            Meet a small group for your next day outside.
          </Text>
        </View>
        <Button
          title="Find a group →"
          onPress={() => navigate("Trips")}
          quiet
        />
      </View>
    </>
  );
}
