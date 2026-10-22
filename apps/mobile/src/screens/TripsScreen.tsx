import React from 'react';
import { Text, View } from 'react-native';
import type { State, Trek } from '@trektribe/core';
import { apiUrl } from '../data';
import { MountainArt } from '../Art';
import { Button, Label, date, s } from '../ui';
import type { Act } from './types';

type Props = {
  state: State;
  wide: boolean;
  busy: boolean;
  act: Act;
  onCreate: () => void;
  onInvite: () => void;
  onChat: (id: string) => void;
  onPinnedRoute: (id: string, trek: Trek) => void;
  onCreateInvitation: (id: string) => void;
};
export function TripsScreen({
  state,
  wide,
  busy,
  act,
  onCreate,
  onInvite,
  onChat,
  onPinnedRoute,
  onCreateInvitation,
}: Props) {
  return (
    <View style={s.grid}>
      <Button title="Plan an outing" onPress={() => onCreate()} />
      {!!apiUrl && (
        <Button title="Accept invitation" quiet onPress={() => onInvite()} />
      )}
      {state.trips.map((trip) => {
        const trek = state.treks.find((t) => t.id === trip.trekId)!;
        const membership = trip.members.find(
          (m) => m.userId === state.profile.id,
        );
        const count = trip.members.filter(
          (m) => m.status === "accepted",
        ).length;
        return (
          <View
            key={trip.id}
            style={[s.tripCard, { width: wide ? "48.5%" : "100%" }]}
          >
            <View style={{ height: 190 }}>
              <MountainArt color={trek.color} />
            </View>
            <View style={{ padding: 24, gap: 14 }}>
              <Label>
                {date(trip.startsAt)} · {trek.difficulty.toUpperCase()}
              </Label>
              <Text style={s.sectionTitle}>{trip.title}</Text>
              <Text style={s.bodySmall}>
                {trek.title} · Hosted by {trip.organizer}
              </Text>
              <View style={s.rowBetween}>
                <Text style={s.body}>
                  {count} / {trip.maxParticipants} places filled
                </Text>
                <Text style={s.condition}>
                  {trip.maxParticipants - count} spots left
                </Text>
              </View>
              {!!apiUrl && membership?.status === "accepted" && (
                <Button
                  title="Open conversation"
                  quiet
                  onPress={() => onChat(trip.id)}
                />
              )}
              {!!apiUrl && trip.routeVersionId && (
                <Button
                  title="View outing route"
                  quiet
                  onPress={() => onPinnedRoute(trip.id, trek)}
                />
              )}
              {trip.organizerId === state.profile.id &&
                trip.members
                  .filter(
                    (m) =>
                      m.status === "accepted" && m.userId !== trip.organizerId,
                  )
                  .map((m) => (
                    <View key={m.userId} style={s.rowBetween}>
                      <Text style={s.bodySmall}>
                        Trekker ...{m.userId.slice(-4)}
                        {m.role === "cohost" ? " (cohost)" : ""}
                      </Text>
                      <Button
                        title={
                          m.role === "cohost" ? "Remove cohost" : "Make cohost"
                        }
                        quiet
                        disabled={
                          busy ||
                          (m.role !== "cohost" && trip.status === "closed")
                        }
                        onPress={() =>
                          act(
                            {
                              type: "cohost",
                              tripId: trip.id,
                              userId: m.userId,
                              enabled: m.role !== "cohost",
                            },
                            "Cohost role updated.",
                          )
                        }
                      />
                    </View>
                  ))}
              {trip.organizerId !== state.profile.id &&
                membership?.role === "cohost" && (
                  <>
                    <Text style={s.person}>You are a cohost</Text>
                    {trip.members
                      .filter((m) => m.status === "pending")
                      .map((m) => (
                        <View key={m.userId} style={s.rowBetween}>
                          <Text style={s.bodySmall}>
                            Trekker ...{m.userId.slice(-4)} requested to join
                          </Text>
                          <Button
                            title="Approve"
                            quiet
                            disabled={busy || trip.status === "closed"}
                            onPress={() =>
                              act(
                                {
                                  type: "approve",
                                  tripId: trip.id,
                                  userId: m.userId,
                                },
                                "Participant approved.",
                              )
                            }
                          />
                        </View>
                      ))}
                  </>
                )}
              {trip.organizerId === state.profile.id ? (
                <>
                  {!!apiUrl && (
                    <Button
                      title="Create invitation"
                      quiet
                      disabled={busy || trip.status === "closed"}
                      onPress={() => onCreateInvitation(trip.id)}
                    />
                  )}
                  <Button
                    title={
                      trip.status === "closed"
                        ? "Outing cancelled"
                        : "Cancel outing"
                    }
                    quiet
                    disabled={busy || trip.status === "closed"}
                    onPress={() =>
                      act(
                        { type: "cancel-trip", tripId: trip.id },
                        "Outing cancelled.",
                      )
                    }
                  />
                  <Text style={s.person}>You’re organizing this outing</Text>
                  {trip.members
                    .filter((m) => m.status === "pending")
                    .map((m) => (
                      <View key={m.userId} style={s.rowBetween}>
                        <Text style={s.bodySmall}>
                          Trekker …{m.userId.slice(-4)} requested to join
                        </Text>
                        <Button
                          title="Approve"
                          disabled={busy}
                          onPress={() =>
                            act(
                              {
                                type: "approve",
                                tripId: trip.id,
                                userId: m.userId,
                              },
                              "Participant approved.",
                            )
                          }
                          quiet
                        />
                      </View>
                    ))}
                </>
              ) : membership ? (
                <>
                  <Text style={s.person}>
                    {membership.status === "pending"
                      ? "Request sent · awaiting organizer approval"
                      : "You’re on the roster"}
                  </Text>
                  <Button
                    title={
                      membership.status === "pending"
                        ? "Cancel request"
                        : "Leave outing"
                    }
                    quiet
                    disabled={busy}
                    onPress={() =>
                      act(
                        { type: "leave", tripId: trip.id },
                        "Your place request was removed.",
                      )
                    }
                  />
                </>
              ) : (
                <Button
                  title={
                    trip.status === "closed"
                      ? "Outing closed"
                      : count >= trip.maxParticipants
                        ? "Outing full"
                        : "Request to join →"
                  }
                  disabled={
                    busy ||
                    trip.status === "closed" ||
                    count >= trip.maxParticipants
                  }
                  onPress={() =>
                    act(
                      { type: "join", tripId: trip.id },
                      "Join request sent to the organizer.",
                    )
                  }
                />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
