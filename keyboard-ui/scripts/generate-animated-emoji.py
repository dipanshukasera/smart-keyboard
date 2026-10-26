#!/usr/bin/env python3
"""
Builds src/data/animatedEmoji.json - the emojis that have an animated version
in Google's Noto Emoji Animation set (CC BY 4.0) - by asking Google's font
server which of the keyboard's emojis it has one for:

    python3 scripts/generate-animated-emoji.py

Each entry is [emoji, code]; the animation lives at
https://fonts.gstatic.com/s/e/notoemoji/latest/<code>/512.gif (and 512.webp,
128.png for a still). Order follows emojiData.json, so the grid reads like
the normal emoji panel.
"""
import concurrent.futures as cf
import json
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src', 'data')


def codes(emoji, strip):
    return '_'.join('%x' % ord(c) for c in emoji if not (strip and ord(c) == 0xFE0F))


def find(emoji):
    for strip in (False, True):
        code = codes(emoji, strip)
        url = 'https://fonts.gstatic.com/s/e/notoemoji/latest/%s/512.webp' % code
        try:
            if urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=15).status == 200:
                return [emoji, code]
        except Exception:
            pass
    return None


with open(os.path.join(SRC, 'emojiData.json'), encoding='utf-8') as f:
    groups = json.load(f)
bases = [e if isinstance(e, str) else e[0] for g in groups for e in g['emojis']]
with cf.ThreadPoolExecutor(32) as pool:
    found = [r for r in pool.map(find, bases) if r]
with open(os.path.join(SRC, 'animatedEmoji.json'), 'w', encoding='utf-8') as f:
    json.dump(found, f, ensure_ascii=False, separators=(',', ':'))
print(len(found), 'animated emojis of', len(bases))
