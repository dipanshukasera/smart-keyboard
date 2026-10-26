import React, {useRef, useState} from 'react';
import {FlatList, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions} from 'react-native';
import {useKeyboardStore} from '../store';
import {GifCommit} from '../native-bridge/GifCommit';
import animatedEmoji from '../data/animatedEmoji.json';

// Google's Noto Emoji Animation (CC BY 4.0): a still for the grid, the
// animation itself for the preview, and a GIF - the format chat apps take
// from a keyboard - for sending.
const BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
const stillUrl = (code: string) => `${BASE}/${code}/128.png`;
const animationUrl = (code: string) => `${BASE}/${code}/512.webp`;
const gifUrl = (code: string) => `${BASE}/${code}/512.gif`;

const COLUMNS = 8;
const ITEMS = animatedEmoji as [string, string][];

/**
 * The emoji panel's "Animated" tab: tap one to send it as an animated GIF
 * (into the chat if the app takes GIFs from a keyboard, else copied so it can
 * be pasted); hold one to watch it move first.
 */
export function AnimatedEmojiGrid() {
  const theme = useKeyboardStore(state => state.theme);
  const {width} = useWindowDimensions();
  const size = Math.floor((width - 8) / COLUMNS);
  const [preview, setPreview] = useState<[string, string] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = (message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  };

  const send = async (code: string) => {
    if (sending) return;
    setSending(code);
    try {
      if (await GifCommit.commitGif(gifUrl(code))) return;
      if (await GifCommit.copyGifToClipboard(gifUrl(code))) {
        showFeedback('This app can’t take GIFs from keyboards - copied: hold the message box and tap Paste');
      } else {
        showFeedback('Couldn’t send it - check your connection');
      }
    } finally {
      setSending(null);
      setPreview(null);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={ITEMS}
        numColumns={COLUMNS}
        keyExtractor={item => item[1]}
        initialNumToRender={30}
        windowSize={5}
        removeClippedSubviews
        getItemLayout={(_data, index) => ({length: size, offset: size * Math.floor(index / COLUMNS), index})}
        renderItem={({item}) => (
          <TouchableOpacity
            style={{width: size, height: size}}
            activeOpacity={0.6}
            onPress={() => send(item[1])}
            onLongPress={() => setPreview(item)}>
            <Image source={{uri: stillUrl(item[1])}} style={styles.still} resizeMode="contain" fadeDuration={0} />
            {sending === item[1] && <View style={[styles.sending, {backgroundColor: theme.panelBackground + 'AA'}]} />}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <Text style={[styles.credit, {color: theme.keyText + '88'}]}>Animated emoji: Noto Emoji Animation by Google, CC BY 4.0</Text>
        }
      />

      {preview && (
        <TouchableOpacity activeOpacity={1} style={[styles.preview, {backgroundColor: theme.panelBackground + 'F2'}]} onPress={() => setPreview(null)}>
          <Image source={{uri: animationUrl(preview[1])}} style={styles.previewImage} resizeMode="contain" />
          <TouchableOpacity style={[styles.sendButton, {backgroundColor: theme.accent}]} onPress={() => send(preview[1])}>
            <Text style={styles.sendText}>{sending ? 'Sending…' : `Send ${preview[0]}`}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {feedback && (
        <View style={[styles.toast, {backgroundColor: theme.keyText}]}>
          <Text style={{color: theme.panelBackground, fontSize: 12}}>{feedback}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  still: {
    flex: 1,
    margin: 4,
  },
  sending: {
    ...StyleSheet.absoluteFillObject,
  },
  credit: {
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 8,
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: 110,
    height: 110,
  },
  sendButton: {
    marginTop: 10,
    paddingHorizontal: 22,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
});
