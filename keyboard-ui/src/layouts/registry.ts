import {LayoutDef} from './types';
import enGB from './en-GB.json';
import hiIN from './hi-IN.json';
import esES from './es-ES.json';
import frFR from './fr-FR.json';
import deDE from './de-DE.json';
import ptBR from './pt-BR.json';
import itIT from './it-IT.json';
import ruRU from './ru-RU.json';

export interface LanguagePack {
  code: string;
  // The short label on the toolbar's language key.
  label: string;
  // English name, and the name in its own script.
  name: string;
  nativeName: string;
  layout: LayoutDef;
}

// Every language the keyboard ships. Order is the order of the picker.
export const LANGUAGE_PACKS: LanguagePack[] = [
  {code: 'en-GB', label: 'EN', name: 'English', nativeName: 'English', layout: enGB as LayoutDef},
  {code: 'hi-IN', label: 'हि', name: 'Hindi', nativeName: 'हिन्दी', layout: hiIN as LayoutDef},
  {code: 'es-ES', label: 'ES', name: 'Spanish', nativeName: 'Español', layout: esES as LayoutDef},
  {code: 'fr-FR', label: 'FR', name: 'French', nativeName: 'Français', layout: frFR as LayoutDef},
  {code: 'de-DE', label: 'DE', name: 'German', nativeName: 'Deutsch', layout: deDE as LayoutDef},
  {code: 'pt-BR', label: 'PT', name: 'Portuguese', nativeName: 'Português', layout: ptBR as LayoutDef},
  {code: 'it-IT', label: 'IT', name: 'Italian', nativeName: 'Italiano', layout: itIT as LayoutDef},
  {code: 'ru-RU', label: 'RU', name: 'Russian', nativeName: 'Русский', layout: ruRU as LayoutDef},
];

export const LAYOUTS: Record<string, LayoutDef> = Object.fromEntries(LANGUAGE_PACKS.map(p => [p.code, p.layout]));
