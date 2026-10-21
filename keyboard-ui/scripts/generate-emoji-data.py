#!/usr/bin/env python3
"""
Builds src/data/emojiData.json - every emoji the keyboard offers - from
Unicode's emoji-test.txt:

    curl -o emoji-test.txt https://unicode.org/Public/emoji/latest/emoji-test.txt
    python3 scripts/generate-emoji-data.py emoji-test.txt

Only fully-qualified emojis are kept (the form keyboards should insert),
grouped like Unicode's own groups. Skin-tone (and the like) variants are
folded under their base emoji. Each entry of a group is either a plain
string, or a list [base, variant, variant, ...] for an emoji with variants.
Which of these a phone can actually draw is decided on the phone (see
EmojiSupportModule), so a new Unicode version can be added here without
worrying about older Android versions.
"""
import json
import re
import sys

# Unicode group -> (our category id, MaterialIcons tab icon). The ids and
# icons match the panel's long-standing tabs.
GROUPS = {
    'Smileys & Emotion': ('smileys', 'mood'),
    'People & Body': ('people', 'emoji-people'),
    'Animals & Nature': ('nature', 'pets'),
    'Food & Drink': ('food', 'restaurant'),
    'Travel & Places': ('travel', 'directions-car'),
    'Activities': ('activities', 'sports-soccer'),
    'Objects': ('objects', 'lightbulb'),
    'Symbols': ('symbols', 'favorite'),
    'Flags': ('flags', 'flag'),
}

SKIN_TONES = {chr(c) for c in range(0x1F3FB, 0x1F400)}


def strip_variation(text):
    # Variation selectors and tone modifiers don't change which emoji it is.
    return ''.join(ch for ch in text if ch not in SKIN_TONES and ch != '️')


def main(path):
    categories = {}
    order = []
    group = None
    line_re = re.compile(r'^([0-9A-F ]+?)\s*;\s*([a-z-]+)\s*#\s*(\S+)\s+E(\d+\.\d+)\s')
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('# group:'):
                group = line.split(':', 1)[1].strip()
                continue
            m = line_re.match(line)
            if not m or group not in GROUPS or m.group(2) != 'fully-qualified':
                continue
            emoji = ''.join(chr(int(cp, 16)) for cp in m.group(1).split())
            cat_id = GROUPS[group][0]
            if cat_id not in categories:
                categories[cat_id] = {'id': cat_id, 'icon': GROUPS[group][1], 'entries': [], 'index': {}}
                order.append(cat_id)
            cat = categories[cat_id]
            has_tone = any(ch in SKIN_TONES for ch in emoji)
            key = strip_variation(emoji)
            if has_tone and key in cat['index']:
                entry = cat['entries'][cat['index'][key]]
                if isinstance(entry, str):
                    entry = [entry]
                    cat['entries'][cat['index'][key]] = entry
                entry.append(emoji)
            elif not has_tone:
                cat['index'].setdefault(key, len(cat['entries']))
                cat['entries'].append(emoji)
            # A toned emoji whose base isn't in the list is left out: the
            # base is always listed first in Unicode's file.

    out = [{'id': c, 'icon': categories[c]['icon'], 'emojis': categories[c]['entries']} for c in order]
    total = sum(len(g['emojis']) for g in out)
    variants = sum(len(e) - 1 for g in out for e in g['emojis'] if isinstance(e, list))
    with open('src/data/emojiData.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} categories, {total} emojis (+{variants} skin-tone variants)')


if __name__ == '__main__':
    main(sys.argv[1])
