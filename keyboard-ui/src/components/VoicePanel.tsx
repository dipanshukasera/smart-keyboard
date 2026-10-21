import React, {useEffect, useRef, useState} from 'react';
import {Animated, DeviceEventEmitter, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';
import {useKeyboardStore} from '../store';
import {InputConnection} from '../native-bridge/InputConnection';
import {VoiceEvent, VoiceInput} from '../native-bridge/VoiceInput';
import {useKeyFeedback} from '../hooks/useKeyFeedback';

type Status = 'starting' | 'listening' | 'idle' | 'needsPermission' | 'unavailable';

const ERROR_MESSAGES: Record<string, string> = {
  no_speech: 'Didn’t catch that - tap the mic to try again',
  network: 'Voice typing needs an internet connection',
  language: 'Voice typing isn’t available for this language',
  busy: 'The microphone is busy - tap the mic to try again',
  other: 'Voice typing stopped - tap the mic to try again',
};

// Language names for the "Speak now" line.
const LANGUAGE_NAMES: Record<string, string> = {
  'en-GB': 'English',
  'hi-IN': 'Hindi',
  'es-ES': 'Spanish',
};

/**
 * Voice typing (toolbar mic / All tools). Starts listening as soon as it
 * opens, in the keyboard's current language: the words appear here as
 * they're recognised and go into the text field when the user stops
 * talking (VoiceInputModule types them, with spacing and capitals). Tap
 * the mic to stop early or to talk again.
 */
export function VoicePanel() {
  const {theme, activeLocale, keyboardSizeScale, setActivePanel} = useKeyboardStore(
    useShallow(state => ({
      theme: state.theme,
      activeLocale: state.activeLocale,
      keyboardSizeScale: state.keyboardSizeScale,
      setActivePanel: state.setActivePanel,
    })),
  );
  const [status, setStatus] = useState<Status>('starting');
  const [partial, setPartial] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const level = useRef(new Animated.Value(0)).current;
  const fireKeyFeedback = useKeyFeedback();

  // `askForMic`: on opening, go straight to the permission prompt if
  // needed - tapping the mic was already the user asking to talk.
  const start = async (askForMic = false) => {
    setMessage(null);
    setPartial('');
    if (!(await VoiceInput.isAvailable())) {
      setStatus('unavailable');
      return;
    }
    if (!(await VoiceInput.hasPermission())) {
      setStatus('needsPermission');
      if (askForMic) VoiceInput.requestPermission();
      return;
    }
    setStatus('starting');
    VoiceInput.start(activeLocale);
  };

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('onVoiceEvent', (event: VoiceEvent) => {
      switch (event.type) {
        case 'ready':
          setStatus('listening');
          return;
        case 'level':
          Animated.timing(level, {toValue: event.level, duration: 100, useNativeDriver: true}).start();
          return;
        case 'partial':
          setPartial(event.text);
          return;
        case 'result':
          // Already typed into the field natively.
          setPartial('');
          setMessage(event.text ? 'Tap the mic to keep talking' : ERROR_MESSAGES.no_speech);
          return;
        case 'error':
          if (event.code === 'permission') {
            setStatus('needsPermission');
          } else {
            setMessage(ERROR_MESSAGES[event.code] ?? ERROR_MESSAGES.other);
          }
          return;
        case 'end':
          level.setValue(0);
          setStatus(current => (current === 'needsPermission' ? current : 'idle'));
          return;
      }
    });
    start(true);
    return () => {
      subscription.remove();
      VoiceInput.cancel();
    };
    // Starts once per opening, in the language active at the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMicPress = () => {
    fireKeyFeedback();
    if (status === 'listening' || status === 'starting') {
      VoiceInput.stop();
    } else if (status === 'needsPermission') {
      // The prompt opens over the app; when it's answered, App reopens
      // this panel (see its onVoiceEvent listener).
      VoiceInput.requestPermission();
    } else if (status !== 'unavailable') {
      start();
    }
  };

  const listening = status === 'listening' || status === 'starting';
  const ringScale = level.interpolate({inputRange: [0, 1], outputRange: [1, 1.6]});
  const languageName = LANGUAGE_NAMES[activeLocale] ?? activeLocale;

  let headline: string;
  if (status === 'unavailable') {
    headline = 'Voice typing needs a speech service - install or update the Google app';
  } else if (status === 'needsPermission') {
    headline = 'Allow microphone access to type with your voice';
  } else if (partial) {
    headline = partial;
  } else if (listening) {
    headline = status === 'starting' ? 'Starting…' : `Speak now · ${languageName}`;
  } else {
    headline = message ?? 'Tap the mic to talk';
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.panelBackground, minHeight: 250 * keyboardSizeScale}]}>
      <Text
        style={[styles.headline, {color: partial ? theme.keyText : theme.keyText + 'AA'}]}
        numberOfLines={3}>
        {headline}
      </Text>

      <View style={styles.micArea}>
        {listening && (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, {backgroundColor: theme.accent + '33', transform: [{scale: ringScale}]}]}
          />
        )}
        <TouchableOpacity
          style={[styles.mic, {backgroundColor: listening ? theme.accent : theme.keyBackground}]}
          onPress={onMicPress}
          disabled={status === 'unavailable'}>
          <Icon
            name={status === 'needsPermission' ? 'mic-off' : listening ? 'stop' : 'mic'}
            size={34}
            color={listening ? '#FFFFFF' : theme.keyText}
          />
        </TouchableOpacity>
        {status === 'needsPermission' && (
          <TouchableOpacity style={[styles.allow, {backgroundColor: theme.accent}]} onPress={onMicPress}>
            <Text style={styles.allowText}>Allow microphone</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.sideKey, {backgroundColor: theme.keyBackground}]}
          onPress={() => setActivePanel('keyboard')}>
          <Text style={{color: theme.keyText, fontWeight: '600'}}>ABC</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sideKey, {backgroundColor: theme.keyBackground}]}
          onPress={() => {
            fireKeyFeedback();
            InputConnection.deleteBackward(1);
          }}>
          <Icon name="backspace" size={20} color={theme.keyText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    justifyContent: 'space-between',
  },
  headline: {
    fontSize: 18,
    textAlign: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
  },
  micArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  ring: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  mic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allow: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  allowText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sideKey: {
    width: 76,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
