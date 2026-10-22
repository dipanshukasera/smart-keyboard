import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useKeyboardStore} from '../store';
import {LANGUAGE_PACKS} from '../layouts/registry';
import {PanelSheet} from './PanelSheet';

/**
 * The language packs: pick one and the keys (and the symbols panel's digits)
 * change to that language's layout.
 */
export function LanguagePackPanel() {
  const {theme, activeLocale, setActiveLocale, setActivePanel} = useKeyboardStore();

  return (
    <PanelSheet title="Languages">
      {LANGUAGE_PACKS.map(pack => {
        const selected = pack.code === activeLocale;
        return (
          <TouchableOpacity
            key={pack.code}
            style={[styles.row, {borderColor: theme.keyText + '22'}]}
            onPress={() => {
              setActiveLocale(pack.code);
              setActivePanel('keyboard');
            }}>
            <View style={[styles.badge, {backgroundColor: selected ? theme.accent : theme.keyBackground}]}>
              <Text style={{color: selected ? '#FFFFFF' : theme.keyText, fontSize: 12, fontWeight: '700'}}>{pack.label}</Text>
            </View>
            <View style={styles.names}>
              <Text style={{color: theme.keyText, fontSize: 16}}>{pack.nativeName}</Text>
              {pack.nativeName !== pack.name && <Text style={{color: theme.keyText + '99', fontSize: 12}}>{pack.name}</Text>}
            </View>
            {selected && <Icon name="check" size={20} color={theme.accent} />}
          </TouchableOpacity>
        );
      })}
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: {
    flex: 1,
    marginLeft: 12,
  },
});
