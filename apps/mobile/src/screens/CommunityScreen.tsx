import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Post, State } from '@trektribe/core';
import { apiUrl } from '../data';
import { Icon, MountainArt } from '../Art';
import { Avatar, Button, Label, date, muted, s } from '../ui';
import type { Act } from './types';

type Props = {
  state: State;
  wide: boolean;
  busy: boolean;
  act: Act;
  onForum: () => void;
  onCompose: () => void;
  onComments: (post: Post) => void;
  blockAuthor: (id: string) => Promise<void>;
};
export function CommunityScreen({
  state,
  wide,
  busy,
  act,
  onForum,
  onCompose,
  onComments,
  blockAuthor,
}: Props) {
  return (
    <>
      {!!apiUrl && (
        <Button title="Community discussions" quiet onPress={() => onForum()} />
      )}
      <View style={[s.rowBetween, { marginBottom: 24 }]}>
        <Text style={s.sectionTitle}>Trail journal</Text>
        <Button title="+ Share a story" onPress={() => onCompose()} />
      </View>
      <View style={s.feedLayout}>
        <View style={{ flex: 1, gap: 20 }}>
          {state.posts.map((post) => {
            const trek = state.treks.find((t) => t.id === post.trekId)!;
            return (
              <View style={s.postCard} key={post.id}>
                <View style={[s.row, { padding: 22 }]}>
                  <Avatar initials={post.initials} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.person}>{post.author}</Text>
                    {!!apiUrl && post.userId !== state.profile.id && (
                      <Button
                        title="Block author"
                        quiet
                        disabled={busy}
                        onPress={() => blockAuthor(post.userId)}
                      />
                    )}
                    <Text style={s.bodySmall}>
                      {trek.title} · {date(post.createdAt)}
                    </Text>
                  </View>
                  <Text style={s.condition}>{post.condition}</Text>
                </View>
                <View style={{ height: wide ? 270 : 190 }}>
                  <MountainArt color={trek.color} />
                </View>
                <View style={{ padding: 22, gap: 16 }}>
                  <Text style={s.body}>{post.content}</Text>
                  <Text style={s.bodySmall}>
                    Observed {date(post.observedAt)} · {"★".repeat(post.rating)}{" "}
                    · Sample trail artwork
                  </Text>
                  <View style={s.row}>
                    <Pressable
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`${post.likedBy.includes(state.profile.id) ? "Unlike" : "Like"} post by ${post.author}`}
                      onPress={() =>
                        act({
                          type: "like",
                          postId: post.id,
                          liked: !post.likedBy.includes(state.profile.id),
                        })
                      }
                      style={s.action}
                    >
                      <Icon
                        name="heart"
                        color={
                          post.likedBy.includes(state.profile.id)
                            ? "#b45b40"
                            : muted
                        }
                        size={21}
                      />
                      <Text style={s.bodySmall}>
                        {post.likedBy.length} likes
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onComments(post)}
                      style={s.action}
                    >
                      <Icon name="comment" size={21} />
                      <Text style={s.bodySmall}>
                        {
                          state.comments.filter((c) => c.postId === post.id)
                            .length
                        }{" "}
                        comments
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        {wide && (
          <View style={s.aside}>
            <Label>LEAVE IT BETTER</Label>
            <Text style={s.sectionTitle}>Good trail karma.</Text>
            <Text style={s.body}>
              Share what you learned. Date your trail conditions. Respect local
              communities. And always bring your litter home.
            </Text>
            <View style={s.divider} />
            <Text style={s.bodySmall}>
              This demo uses sample stories and illustrations. Your new text
              reports are saved on this device, or in the connected demo API.
            </Text>
          </View>
        )}
      </View>
    </>
  );
}
