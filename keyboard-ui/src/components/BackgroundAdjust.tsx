import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {KeyboardTheme} from '../themes/themeTypes';
import {backgroundFrame, clampFraming, fitZoom} from '../themes/imageTheme';

// A keyboard's height is roughly this fraction of its width: the preview box
// is drawn in that proportion, so what's framed here is what ends up behind
// the real keys.
const KEYBOARD_HEIGHT_OVER_WIDTH = 0.78;
const ZOOM_STEP = 1.15;

interface Props {
  // The photo theme being made (or re-framed): its colours, photo and, if
  // it was framed before, that framing.
  theme: KeyboardTheme;
  onApply: (theme: KeyboardTheme) => void;
  onCancel: () => void;
}

const SAMPLE_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * Shown after picking a photo for the keyboard (and from "Adjust photo"):
 * the user moves it with one finger, zooms with two or the +/- buttons,
 * and sees it behind sample keys in the theme's colours - then Apply makes
 * it the theme, Cancel throws it away. Fit shows the whole photo; Fill
 * covers the keyboard with it.
 */
export function BackgroundAdjust({theme, onApply, onCancel}: Props) {
  const {width: windowWidth} = useWindowDimensions();
  const boxWidth = Math.min(Math.round(windowWidth * 0.6), 260);
  const boxHeight = Math.round(boxWidth * KEYBOARD_HEIGHT_OVER_WIDTH);
  const uri = theme.backgroundImage as string;

  const [aspect, setAspect] = useState<number | null>(theme.backgroundAspect ?? null);
  const [framing, setFraming] = useState({
    zoom: theme.backgroundZoom ?? 1,
    offsetX: theme.backgroundOffsetX ?? 0,
    offsetY: theme.backgroundOffsetY ?? 0,
  });
  const framingRef = useRef(framing);
  framingRef.current = framing;

  // The photo's proportions, from the saved copy (already turned the right
  // way up) - needed to know how it sits in the box.
  React.useEffect(() => {
    if (aspect) return;
    Image.getSize(
      uri,
      (width, height) => setAspect(width / height),
      () => setAspect(1),
    );
  }, [uri, aspect]);

  const update = (zoom: number, offsetX: number, offsetY: number) => {
    if (!aspect) return;
    setFraming(clampFraming(boxWidth, boxHeight, aspect, zoom, offsetX, offsetY));
  };

  // --- Touch: one finger moves the photo, two zoom it --------------------
  // What the fingers were doing at the last event: their centre, how far
  // apart they were, and how many.
  const lastRef = useRef<{x: number; y: number; distance: number; count: number} | null>(null);
  const read = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length === 0) return null;
    const [a, b] = [touches[0], touches[1]];
    return b
      ? {
          x: (a.pageX + b.pageX) / 2,
          y: (a.pageY + b.pageY) / 2,
          distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
          count: 2,
        }
      : {x: a.pageX, y: a.pageY, distance: 0, count: 1};
  };
  const onTouchStart = (event: GestureResponderEvent) => {
    lastRef.current = read(event);
  };
  const onTouchMove = (event: GestureResponderEvent) => {
    const now = read(event);
    const before = lastRef.current;
    lastRef.current = now;
    // A finger landing or lifting mid-gesture changes the centre abruptly -
    // start from there rather than jumping the photo.
    if (!now || !before || now.count !== before.count) return;
    const current = framingRef.current;
    const zoom = now.count === 2 && before.distance > 0 ? current.zoom * (now.distance / before.distance) : current.zoom;
    update(zoom, current.offsetX + (now.x - before.x) / boxWidth, current.offsetY + (now.y - before.y) / boxHeight);
  };
  const onTouchEnd = (event: GestureResponderEvent) => {
    lastRef.current = read(event);
  };

  const zoomBy = (factor: number) => update(framing.zoom * factor, framing.offsetX, framing.offsetY);
  const fit = () => aspect && update(fitZoom(boxWidth, boxHeight, aspect), 0, 0);
  const fill = () => update(1, 0, 0);

  const apply = () => {
    if (!aspect) return;
    onApply({
      ...theme,
      backgroundZoom: framing.zoom,
      backgroundOffsetX: framing.offsetX,
      backgroundOffsetY: framing.offsetY,
      backgroundAspect: aspect,
    });
  };

  const frame = aspect ? backgroundFrame(boxWidth, boxHeight, aspect, framing.zoom, framing.offsetX, framing.offsetY) : null;
  const chipBackground = theme.keyBackground.slice(0, 7);
  const chipText = theme.keyText;

  return (
    <View style={[styles.container, {backgroundColor: theme.backgroundBase ?? theme.panelBackground}]}>
      <Text style={[styles.title, {color: chipText}]}>Adjust photo</Text>
      <View style={styles.body}>
        <View
          style={[styles.box, {width: boxWidth, height: boxHeight, backgroundColor: theme.backgroundBase}]}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}>
          <Image source={{uri}} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={18} fadeDuration={0} />
          {frame ? (
            <Image
              source={{uri}}
              style={{position: 'absolute', left: frame.left, top: frame.top, width: frame.width, height: frame.height}}
              fadeDuration={0}
            />
          ) : (
            <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.accent} />
          )}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: theme.backgroundScrim}]} />
          {/* Sample keys in the theme's colours, so the photo is judged with
              the keyboard on top of it. */}
          <View pointerEvents="none" style={styles.sampleKeys}>
            {SAMPLE_ROWS.map(letters => (
              <View key={letters} style={styles.sampleRow}>
                {[...letters].map(letter => (
                  <View key={letter} style={[styles.sampleKey, {backgroundColor: theme.keyBackground}]}>
                    <Text style={{color: theme.keyText, fontSize: 9}}>{letter}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.sampleRow}>
              <View style={[styles.sampleKey, {flex: 4, backgroundColor: theme.keyBackground}]} />
              <View style={[styles.sampleKey, {flex: 1.5, backgroundColor: theme.accent}]} />
            </View>
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <TouchableOpacity style={[styles.chip, {backgroundColor: chipBackground}]} onPress={fit}>
              <Text style={{color: chipText, fontSize: 12}}>Fit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, {backgroundColor: chipBackground}]} onPress={fill}>
              <Text style={{color: chipText, fontSize: 12}}>Fill</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.controlRow}>
            <TouchableOpacity style={[styles.chip, {backgroundColor: chipBackground}]} onPress={() => zoomBy(1 / ZOOM_STEP)}>
              <Icon name="remove" size={18} color={chipText} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, {backgroundColor: chipBackground}]} onPress={() => zoomBy(ZOOM_STEP)}>
              <Icon name="add" size={18} color={chipText} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, {color: chipText + 'AA'}]}>Drag to move, pinch or +/- to zoom</Text>
        </View>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.button, {backgroundColor: chipBackground}]} onPress={onCancel}>
          <Text style={{color: chipText, fontWeight: '600'}}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, {backgroundColor: theme.accent, opacity: aspect ? 1 : 0.5}]}
          disabled={!aspect}
          onPress={apply}>
          <Text style={styles.applyText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    flexDirection: 'row',
  },
  box: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  sampleKeys: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 6,
  },
  sampleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 2,
  },
  sampleKey: {
    flex: 1,
    height: 16,
    marginHorizontal: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  controlRow: {
    flexDirection: 'row',
  },
  chip: {
    flex: 1,
    height: 36,
    marginRight: 6,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  button: {
    minWidth: 96,
    height: 40,
    marginLeft: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
