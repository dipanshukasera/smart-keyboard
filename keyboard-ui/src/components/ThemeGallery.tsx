import React, {useState} from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useShallow} from 'zustand/react/shallow';
import {useKeyboardStore} from '../store';
import type {KeyboardTheme} from '../themes/themeTypes';
import {lightTheme, darkTheme} from '../themes/default';
import {
  COLOR_THEMES,
  DARK_GRADIENTS,
  DYNAMIC_COLOR_THEME,
  GalleryItem,
  LANDSCAPES,
  LIGHT_GRADIENTS,
  SYSTEM_AUTO_THEME,
  galleryImageUrl,
  galleryThumbUrl,
} from '../themes/gallery';
import {themeFromImage} from '../themes/imageTheme';
import {BackgroundImage} from '../native-bridge/BackgroundImage';

const FIRST_SCREEN = 9;

// One theme tile: the keyboard's colours in miniature (a key and the accent
// dot over the panel), with a tick when it's the one in use.
function ThemeTile({
  label,
  selected,
  accentRing,
  onPress,
  onLongPress,
  children,
}: {
  label?: string;
  selected: boolean;
  accentRing: string;
  onPress: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const textColor = useKeyboardStore(state => state.theme.keyText);
  return (
    <View style={styles.cell}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[styles.tile, {borderColor: selected ? accentRing : '#CFD8DC'}, selected && styles.tileSelected]}>
        {children}
        {selected && (
          <View style={styles.tick}>
            <Icon name="check" size={34} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>
      {label ? (
        <Text style={[styles.label, {color: textColor + 'CC'}]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

// The miniature keyboard drawn inside a colour tile.
function MiniKeys({keyColor, accent}: {keyColor: string; accent: string}) {
  return (
    <>
      <View style={[styles.miniKey, {backgroundColor: keyColor}]} />
      <View style={[styles.miniDot, {backgroundColor: accent}]} />
    </>
  );
}

function Section({title, children, footer}: {title: string; children: React.ReactNode; footer?: React.ReactNode}) {
  const textColor = useKeyboardStore(state => state.theme.keyText);
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, {color: textColor}]}>{title}</Text>
      <View style={styles.grid}>{children}</View>
      {footer}
    </View>
  );
}

function ShowMore({expanded, onPress}: {expanded: boolean; onPress: () => void}) {
  const textColor = useKeyboardStore(state => state.theme.keyText);
  return (
    <TouchableOpacity style={styles.showMore} onPress={onPress}>
      <Text style={{color: textColor + 'AA', fontSize: 13}}>{expanded ? 'Show less' : 'Show more'}</Text>
    </TouchableOpacity>
  );
}

interface Props {
  onCreate: () => void;
  onPickPhoto: () => void;
  picking: boolean;
  pickError: string | null;
}

/**
 * The Themes screen's theme list, as sections: My themes, the defaults that
 * follow the phone, colours, and downloadable landscapes and gradients.
 */
export function ThemeGallery({onCreate, onPickPhoto, picking, pickError}: Props) {
  const {theme, setTheme, customThemes, deleteCustomTheme, galleryThemes, saveGalleryTheme} = useKeyboardStore(
    useShallow(state => ({
      theme: state.theme,
      setTheme: state.setTheme,
      customThemes: state.customThemes,
      deleteCustomTheme: state.deleteCustomTheme,
      galleryThemes: state.galleryThemes,
      saveGalleryTheme: state.saveGalleryTheme,
    })),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded(prev => ({...prev, [key]: !prev[key]}));
  const ring = theme.accent;

  const solidTile = (preset: KeyboardTheme, label: string) => (
    <ThemeTile key={preset.id} label={label} selected={theme.id === preset.id} accentRing={ring} onPress={() => setTheme(preset)}>
      <View style={[StyleSheet.absoluteFill, {backgroundColor: preset.panelBackground}]} />
      <MiniKeys keyColor={preset.keyBackground} accent={preset.accent} />
    </ThemeTile>
  );

  // A gallery picture: tap downloads it (once), then applies it.
  const pictureTile = (item: GalleryItem) => {
    const themeId = `gallery-${item.id}`;
    const saved = galleryThemes[item.id];
    const busy = downloading === item.id;
    const choose = async () => {
      if (busy) return;
      if (saved) {
        setTheme(saved);
        return;
      }
      setDownloadError(null);
      setDownloading(item.id);
      try {
        const picked = await BackgroundImage.download(galleryImageUrl(item));
        const base = themeFromImage(picked);
        const made: KeyboardTheme = {
          ...base,
          id: themeId,
          name: item.name,
          backgroundZoom: 1,
          backgroundOffsetX: 0,
          backgroundOffsetY: 0,
          backgroundAspect: picked.aspect ?? 4 / 3,
        };
        saveGalleryTheme(item.id, made);
        setTheme(made);
      } catch {
        setDownloadError("Couldn't download that one - check your connection");
      } finally {
        setDownloading(null);
      }
    };
    return (
      <ThemeTile key={item.id} label={undefined} selected={theme.id === themeId} accentRing={ring} onPress={choose}>
        <Image source={{uri: saved?.backgroundImage ?? galleryThumbUrl(item)}} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} />
        {!saved && (
          <View style={styles.downloadBadge}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="file-download" size={34} color="#FFFFFF" />}
          </View>
        )}
      </ThemeTile>
    );
  };

  const pictureSection = (key: string, title: string, items: GalleryItem[]) => (
    <Section
      title={title}
      footer={items.length > FIRST_SCREEN ? <ShowMore expanded={!!expanded[key]} onPress={() => toggle(key)} /> : undefined}>
      {(expanded[key] ? items : items.slice(0, FIRST_SCREEN)).map(pictureTile)}
    </Section>
  );

  const colors = expanded.colors ? COLOR_THEMES : COLOR_THEMES.slice(0, FIRST_SCREEN);

  return (
    <View>
      <Section title="My themes">
        <ThemeTile selected={false} accentRing={ring} onPress={onCreate}>
          <Icon name="add" size={42} color="#B0BEC5" />
        </ThemeTile>
        <ThemeTile selected={false} accentRing={ring} onPress={onPickPhoto}>
          {picking ? <ActivityIndicator color={theme.accent} /> : <Icon name="add-photo-alternate" size={34} color="#B0BEC5" />}
        </ThemeTile>
        {customThemes.map(custom => (
          <ThemeTile
            key={custom.id}
            label={custom.backgroundImage ? undefined : custom.name}
            selected={theme.id === custom.id}
            accentRing={ring}
            onPress={() => setTheme(custom)}
            onLongPress={() => deleteCustomTheme(custom.id)}>
            {custom.backgroundImage ? (
              <Image source={{uri: custom.backgroundImage}} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, {backgroundColor: custom.panelBackground}]} />
            )}
            <MiniKeys keyColor={custom.keyBackground} accent={custom.accent} />
          </ThemeTile>
        ))}
      </Section>
      {pickError && <Text style={[styles.error, {color: theme.accent}]}>{pickError}</Text>}
      {customThemes.length > 0 && <Text style={[styles.hint, {color: theme.keyText + '77'}]}>Long-press one of your themes to delete it</Text>}

      <Section title="Default">
        <ThemeTile
          label="Dynamic Color"
          selected={theme.auto === 'dynamic'}
          accentRing={ring}
          onPress={() => setTheme(DYNAMIC_COLOR_THEME)}>
          <View style={[StyleSheet.absoluteFill, {backgroundColor: '#CFCFD0'}]} />
          <MiniKeys keyColor="#9DB2C0" accent="#5BAEDC" />
        </ThemeTile>
        <ThemeTile label="System Auto" selected={theme.auto === 'system'} accentRing={ring} onPress={() => setTheme(SYSTEM_AUTO_THEME)}>
          <View style={[StyleSheet.absoluteFill, {backgroundColor: lightTheme.panelBackground}]} />
          <View style={[styles.halfDark, {backgroundColor: '#202020'}]} />
          <MiniKeys keyColor="#FFFFFFB0" accent="#AECBFA" />
        </ThemeTile>
        {solidTile({...lightTheme, id: 'light', panelBackground: '#EFF3FA'}, 'Default')}
        {solidTile(darkTheme, 'Default Dark')}
      </Section>

      <Section
        title="Colors"
        footer={COLOR_THEMES.length > FIRST_SCREEN ? <ShowMore expanded={!!expanded.colors} onPress={() => toggle('colors')} /> : undefined}>
        {colors.map(preset => solidTile(preset, ''))}
      </Section>

      {pictureSection('landscapes', 'Landscapes', LANDSCAPES)}
      {pictureSection('light', 'Light gradient', LIGHT_GRADIENTS)}
      {pictureSection('dark', 'Dark gradient', DARK_GRADIENTS)}
      {downloadError && <Text style={[styles.error, {color: theme.accent}]}>{downloadError}</Text>}
      <Text style={[styles.hint, {color: theme.keyText + '66'}]}>
        Landscape photos: public domain (CC0), from Wikimedia Commons.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 8,
    marginLeft: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  cell: {
    width: '33.333%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  tile: {
    aspectRatio: 1.42,
    borderRadius: 16,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    borderWidth: 4,
  },
  tick: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  miniKey: {
    position: 'absolute',
    left: '30%',
    right: '24%',
    bottom: 10,
    height: 10,
    borderRadius: 3,
  },
  miniDot: {
    position: 'absolute',
    right: '8%',
    bottom: 7,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  halfDark: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
  },
  downloadBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMore: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  error: {
    fontSize: 12,
    marginBottom: 8,
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
});
