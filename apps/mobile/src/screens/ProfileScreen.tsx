import React from 'react';
import { Text, View } from 'react-native';
import type { State } from '@trektribe/core';
import { apiUrl } from '../data';
import { Icon } from '../Art';
import { Avatar, Button, Label, s } from '../ui';

type Props = {
  state: State;
  saved: string[];
  onBlocks: () => void;
  onEdit: () => void;
  onSavedTrails: () => void;
};
export function ProfileScreen({
  state,
  saved,
  onBlocks,
  onEdit,
  onSavedTrails,
}: Props) {
  return (
    <View style={s.profileLayout}>
      <View style={[s.profileCard, { flex: 1 }]}>
        {!!apiUrl && (
          <Button title="Blocked people" quiet onPress={() => onBlocks()} />
        )}
        <Button title="Edit profile" quiet onPress={() => onEdit()} />
        <Avatar initials={state.profile.initials} />
        <Text style={s.title}>{state.profile.name}</Text>
        <Text style={s.bodySmall}>
          @{state.profile.username} · {state.profile.level}
        </Text>
        <Text style={[s.body, { maxWidth: 500, textAlign: "center" }]}>
          {state.profile.bio}
        </Text>
        <View style={s.stats}>
          <View>
            <Text style={s.statValue}>{state.profile.completed}</Text>
            <Text style={s.bodySmall}>sample treks</Text>
          </View>
          <View>
            <Text style={s.statValue}>{state.profile.distanceKm}</Text>
            <Text style={s.bodySmall}>sample km</Text>
          </View>
          <View>
            <Text style={s.statValue}>{saved.length}</Text>
            <Text style={s.bodySmall}>saved trails</Text>
          </View>
        </View>
        <Button
          title="Explore saved trails"
          quiet
          onPress={() => onSavedTrails()}
        />
      </View>
      <View style={{ flex: 1, gap: 20 }}>
        <View style={s.panel}>
          <Label>PACKED & READY</Label>
          <Text style={s.sectionTitle}>The gear list</Text>
          {state.profile.gear.map((g) => (
            <View style={s.row} key={g}>
              <Icon name="check" size={18} />
              <Text style={s.body}>{g}</Text>
            </View>
          ))}
        </View>
        <View style={s.panel}>
          <Label>LITTLE MILESTONES</Label>
          <Text style={s.sectionTitle}>Trail badges</Text>
          <View style={[s.row, { flexWrap: "wrap" }]}>
            {state.profile.badges.map((b) => (
              <Text key={b} style={s.badge}>
                {b}
              </Text>
            ))}
          </View>
          <Text style={s.bodySmall}>
            Your profile and gear list are editable. Badges and activity totals
            are sample values in demo mode.
          </Text>
        </View>
      </View>
    </View>
  );
}
