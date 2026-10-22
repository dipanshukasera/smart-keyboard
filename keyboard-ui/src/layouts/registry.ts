import {LayoutDef} from './types';
import enGB from './en-GB.json';
import hiIN from './hi-IN.json';
import esES from './es-ES.json';
import frFR from './fr-FR.json';
import deDE from './de-DE.json';
import ptBR from './pt-BR.json';
import itIT from './it-IT.json';
import ruRU from './ru-RU.json';
import afZA from './af-ZA.json';
import sqAL from './sq-AL.json';
import arSA from './ar-SA.json';
import bnIN from './bn-IN.json';
import bgBG from './bg-BG.json';
import caES from './ca-ES.json';
import hrHR from './hr-HR.json';
import csCZ from './cs-CZ.json';
import daDK from './da-DK.json';
import nlNL from './nl-NL.json';
import etEE from './et-EE.json';
import filPH from './fil-PH.json';
import fiFI from './fi-FI.json';
import kaGE from './ka-GE.json';
import elGR from './el-GR.json';
import guIN from './gu-IN.json';
import heIL from './he-IL.json';
import huHU from './hu-HU.json';
import isIS from './is-IS.json';
import idID from './id-ID.json';
import knIN from './kn-IN.json';
import lvLV from './lv-LV.json';
import ltLT from './lt-LT.json';
import msMY from './ms-MY.json';
import mlIN from './ml-IN.json';
import mrIN from './mr-IN.json';
import neNP from './ne-NP.json';
import nbNO from './nb-NO.json';
import faIR from './fa-IR.json';
import plPL from './pl-PL.json';
import paIN from './pa-IN.json';
import roRO from './ro-RO.json';
import srRS from './sr-RS.json';
import skSK from './sk-SK.json';
import slSI from './sl-SI.json';
import swKE from './sw-KE.json';
import svSE from './sv-SE.json';
import taIN from './ta-IN.json';
import teIN from './te-IN.json';
import thTH from './th-TH.json';
import trTR from './tr-TR.json';
import ukUA from './uk-UA.json';
import urPK from './ur-PK.json';
import viVN from './vi-VN.json';

export interface LanguagePack {
  code: string;
  // Short badge shown in the picker.
  label: string;
  // English name, and the name in its own script.
  name: string;
  nativeName: string;
  layout: LayoutDef;
}

// Every language the keyboard ships: the first eight in a fixed order, the
// rest alphabetical by English name.
export const LANGUAGE_PACKS: LanguagePack[] = [
  {code: 'en-GB', label: 'EN', name: 'English', nativeName: 'English', layout: enGB as LayoutDef},
  {code: 'hi-IN', label: 'हि', name: 'Hindi', nativeName: 'हिन्दी', layout: hiIN as LayoutDef},
  {code: 'es-ES', label: 'ES', name: 'Spanish', nativeName: 'Español', layout: esES as LayoutDef},
  {code: 'fr-FR', label: 'FR', name: 'French', nativeName: 'Français', layout: frFR as LayoutDef},
  {code: 'de-DE', label: 'DE', name: 'German', nativeName: 'Deutsch', layout: deDE as LayoutDef},
  {code: 'pt-BR', label: 'PT', name: 'Portuguese', nativeName: 'Português', layout: ptBR as LayoutDef},
  {code: 'it-IT', label: 'IT', name: 'Italian', nativeName: 'Italiano', layout: itIT as LayoutDef},
  {code: 'ru-RU', label: 'RU', name: 'Russian', nativeName: 'Русский', layout: ruRU as LayoutDef},
  {code: 'af-ZA', label: 'AF', name: 'Afrikaans', nativeName: 'Afrikaans', layout: afZA as LayoutDef},
  {code: 'sq-AL', label: 'SQ', name: 'Albanian', nativeName: 'Shqip', layout: sqAL as LayoutDef},
  {code: 'ar-SA', label: 'AR', name: 'Arabic', nativeName: 'العربية', layout: arSA as LayoutDef},
  {code: 'bn-IN', label: 'BN', name: 'Bengali', nativeName: 'বাংলা', layout: bnIN as LayoutDef},
  {code: 'bg-BG', label: 'BG', name: 'Bulgarian', nativeName: 'Български', layout: bgBG as LayoutDef},
  {code: 'ca-ES', label: 'CA', name: 'Catalan', nativeName: 'Català', layout: caES as LayoutDef},
  {code: 'hr-HR', label: 'HR', name: 'Croatian', nativeName: 'Hrvatski', layout: hrHR as LayoutDef},
  {code: 'cs-CZ', label: 'CS', name: 'Czech', nativeName: 'Čeština', layout: csCZ as LayoutDef},
  {code: 'da-DK', label: 'DA', name: 'Danish', nativeName: 'Dansk', layout: daDK as LayoutDef},
  {code: 'nl-NL', label: 'NL', name: 'Dutch', nativeName: 'Nederlands', layout: nlNL as LayoutDef},
  {code: 'et-EE', label: 'ET', name: 'Estonian', nativeName: 'Eesti', layout: etEE as LayoutDef},
  {code: 'fil-PH', label: 'FIL', name: 'Filipino', nativeName: 'Filipino', layout: filPH as LayoutDef},
  {code: 'fi-FI', label: 'FI', name: 'Finnish', nativeName: 'Suomi', layout: fiFI as LayoutDef},
  {code: 'ka-GE', label: 'KA', name: 'Georgian', nativeName: 'ქართული', layout: kaGE as LayoutDef},
  {code: 'el-GR', label: 'EL', name: 'Greek', nativeName: 'Ελληνικά', layout: elGR as LayoutDef},
  {code: 'gu-IN', label: 'GU', name: 'Gujarati', nativeName: 'ગુજરાતી', layout: guIN as LayoutDef},
  {code: 'he-IL', label: 'HE', name: 'Hebrew', nativeName: 'עברית', layout: heIL as LayoutDef},
  {code: 'hu-HU', label: 'HU', name: 'Hungarian', nativeName: 'Magyar', layout: huHU as LayoutDef},
  {code: 'is-IS', label: 'IS', name: 'Icelandic', nativeName: 'Íslenska', layout: isIS as LayoutDef},
  {code: 'id-ID', label: 'ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia', layout: idID as LayoutDef},
  {code: 'kn-IN', label: 'KN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', layout: knIN as LayoutDef},
  {code: 'lv-LV', label: 'LV', name: 'Latvian', nativeName: 'Latviešu', layout: lvLV as LayoutDef},
  {code: 'lt-LT', label: 'LT', name: 'Lithuanian', nativeName: 'Lietuvių', layout: ltLT as LayoutDef},
  {code: 'ms-MY', label: 'MS', name: 'Malay', nativeName: 'Bahasa Melayu', layout: msMY as LayoutDef},
  {code: 'ml-IN', label: 'ML', name: 'Malayalam', nativeName: 'മലയാളം', layout: mlIN as LayoutDef},
  {code: 'mr-IN', label: 'MR', name: 'Marathi', nativeName: 'मराठी', layout: mrIN as LayoutDef},
  {code: 'ne-NP', label: 'NE', name: 'Nepali', nativeName: 'नेपाली', layout: neNP as LayoutDef},
  {code: 'nb-NO', label: 'NB', name: 'Norwegian', nativeName: 'Norsk', layout: nbNO as LayoutDef},
  {code: 'fa-IR', label: 'FA', name: 'Persian', nativeName: 'فارسی', layout: faIR as LayoutDef},
  {code: 'pl-PL', label: 'PL', name: 'Polish', nativeName: 'Polski', layout: plPL as LayoutDef},
  {code: 'pa-IN', label: 'PA', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', layout: paIN as LayoutDef},
  {code: 'ro-RO', label: 'RO', name: 'Romanian', nativeName: 'Română', layout: roRO as LayoutDef},
  {code: 'sr-RS', label: 'SR', name: 'Serbian', nativeName: 'Српски', layout: srRS as LayoutDef},
  {code: 'sk-SK', label: 'SK', name: 'Slovak', nativeName: 'Slovenčina', layout: skSK as LayoutDef},
  {code: 'sl-SI', label: 'SL', name: 'Slovenian', nativeName: 'Slovenščina', layout: slSI as LayoutDef},
  {code: 'sw-KE', label: 'SW', name: 'Swahili', nativeName: 'Kiswahili', layout: swKE as LayoutDef},
  {code: 'sv-SE', label: 'SV', name: 'Swedish', nativeName: 'Svenska', layout: svSE as LayoutDef},
  {code: 'ta-IN', label: 'TA', name: 'Tamil', nativeName: 'தமிழ்', layout: taIN as LayoutDef},
  {code: 'te-IN', label: 'TE', name: 'Telugu', nativeName: 'తెలుగు', layout: teIN as LayoutDef},
  {code: 'th-TH', label: 'TH', name: 'Thai', nativeName: 'ไทย', layout: thTH as LayoutDef},
  {code: 'tr-TR', label: 'TR', name: 'Turkish', nativeName: 'Türkçe', layout: trTR as LayoutDef},
  {code: 'uk-UA', label: 'UK', name: 'Ukrainian', nativeName: 'Українська', layout: ukUA as LayoutDef},
  {code: 'ur-PK', label: 'UR', name: 'Urdu', nativeName: 'اردو', layout: urPK as LayoutDef},
  {code: 'vi-VN', label: 'VI', name: 'Vietnamese', nativeName: 'Tiếng Việt', layout: viVN as LayoutDef},
];

export const LAYOUTS: Record<string, LayoutDef> = Object.fromEntries(LANGUAGE_PACKS.map(p => [p.code, p.layout]));
