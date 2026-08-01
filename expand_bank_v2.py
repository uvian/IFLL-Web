#!/usr/bin/env python3
"""IFLL — Word bank expander v2 (data-source driven)

Merges CET4 / CET6 / 考研 word lists (KyleBing/english-vocabulary, EN→CN)
into the IFLL bank (CN→EN direction):

  1. For each English word, take the FIRST sense from its definition
     (dictionary convention = most common usage) as the Chinese headword.
  2. Filter: Chinese headword must be 2-6 hanzi, no punctuation, not already
     in the bank; English side must be pure letters (allow spaces for phrases).
  3. IPA generated offline from local CMU dict (~/cmudict.txt).
  4. Level precedence: cet4 > cet6 > graduate (first list wins for dup en/zh).
  5. Append new entries, rebuild WORD_BANK_MAP.

Usage: python3 expand_bank_v2.py
"""

import json
import os
import re
import sys
import urllib.request

ROOT = os.path.expanduser('~/IFLL-Web')
BANK = os.path.join(ROOT, 'src/lib/wordbank.js')
CMU = os.path.expanduser('~/cmudict.txt')

LISTS = [
    ('cet4', 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/3%20%E5%9B%9B%E7%BA%A7-%E4%B9%B1%E5%BA%8F.txt'),
    ('cet6', 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/4%20%E5%85%AD%E7%BA%A7-%E4%B9%B1%E5%BA%8F.txt'),
    ('graduate', 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/5%20%E8%80%83%E7%A0%94-%E4%B9%B1%E5%BA%8F.txt'),
]

# ── CMU ARPABET → IPA ──
ARPABET_TO_IPA = {
    'AA': 'ɑː', 'AE': 'æ',  'AH': 'ʌ',  'AO': 'ɔː', 'AW': 'aʊ',
    'AY': 'aɪ', 'B':  'b',  'CH': 'tʃ', 'D':  'd',  'DH': 'ð',
    'EH': 'ɛ',  'ER': 'ɜːr', 'EY': 'eɪ', 'F':  'f',  'G':  'ɡ',
    'HH': 'h',  'IH': 'ɪ',  'IY': 'iː', 'JH': 'dʒ', 'K':  'k',
    'L':  'l',  'M':  'm',  'N':  'n',  'NG': 'ŋ',  'OW': 'oʊ',
    'OY': 'ɔɪ', 'P':  'p',  'R':  'r',  'S':  's',  'SH': 'ʃ',
    'T':  't',  'TH': 'θ',  'UH': 'ʊ',  'UW': 'uː', 'V':  'v',
    'W':  'w',  'Y':  'j',  'Z':  'z',  'ZH': 'ʒ',
}

def arpabet_to_ipa(s):
    out = []
    for tok in s.split():
        clean = re.sub(r'[0-2]$', '', tok)
        out.append(ARPABET_TO_IPA.get(clean, clean))
    return '/' + ''.join(out) + '/'

def load_cmu():
    cmu = {}
    with open(CMU, 'r', encoding='latin-1') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(';;;'):
                continue
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            word = parts[0].lower().strip('()0123456789')
            if word not in cmu:
                cmu[word] = parts[1]
    return cmu

# ── Parse existing bank ──
with open(BANK, 'r', encoding='utf-8') as f:
    text = f.read()

match = re.search(r'const WORD_BANK = \[([\s\S]*?)\];\s*\n\s*\n/\* Build', text)
if not match:
    print('ERROR: cannot find WORD_BANK')
    sys.exit(1)
entries_text = match.group(1)

existing_zh = set(re.findall(r"zh:\s*'([^']+)'", entries_text))
existing_en = set(re.findall(r"en:\s*'([^']+)'", entries_text))
print(f'Existing: {len(existing_zh)} entries')

# ── Load word lists ──
def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')

def parse_definition(defn):
    """Return the most common Chinese sense from a def like
    'n. 反抗；造反，起义 v. 起义；反抗' → '反抗'.
    Dictionary convention: first sense = most common. Strip POS tags,
    take the text before the first ；or ，.
    Returns None for function words (prep/conj/pron/art/num) — replacing
    介词/连词 would fracture sentences (they're the glue)."""
    if not defn:
        return None
    senses = re.split(r'[；;]', defn)
    for s in senses:
        s = s.strip()
        s = re.sub(r'^(n|v|vt|vi|adj|a|adv|conj|prep|pron|num|art|int|aux|abbr)\.[\.]?\s*', '', s)
        s = s.strip()
        if not s:
            continue
        first = re.split(r'[,，]', s)[0].strip()
        first = first.strip('。. ')
        if 2 <= len(re.findall(r'[\u4e00-\u9fff]', first)) <= 6 and re.fullmatch(r'[\u4e00-\u9fff]{2,6}', first):
            if first.startswith('在') or first in ('和', '与', '或', '以及', '并且', '而且', '但是', '因为', '所以', '如果', '虽然', '尽管', '除非', '只要', '当', '关于', '对于', '为了'):
                return None
            return first
    return None

# ── Collect candidates (en, zh, level) ──
candidates = {}   # zh -> {en, level}
for level, url in LISTS:
    print(f'Fetching {level} list...')
    raw = fetch(url)
    for line in raw.splitlines():
        line = line.strip()
        if not line or '\t' not in line:
            continue
        en, defn = line.split('\t', 1)
        en = en.strip().lower()
        if not re.fullmatch(r"[a-z]+(?: [a-z]+){0,3}", en):
            continue  # skip weird tokens
        zh = parse_definition(defn)
        if not zh:
            continue
        if zh in existing_zh:
            continue
        # first list wins (cet4 > cet6 > graduate)
        if zh not in candidates:
            candidates[zh] = {'en': en, 'level': level}

# Level-quota cap: CET4 first (most common on real pages), then CET6, then
# graduate — each level gets its own budget so kaoyan vocab actually lands.
# ~2000 new entries: 3677 → ~5677 (5000+ target, all exam bands covered).
LEVEL_ORDER = {'cet4': 0, 'cet6': 1, 'graduate': 2}
QUOTA = {'cet4': int(os.environ.get('IFLL_MAX_CET4', '800')),
         'cet6': int(os.environ.get('IFLL_MAX_CET6', '700')),
         'graduate': int(os.environ.get('IFLL_MAX_GRAD', '500'))}
by_level = {'cet4': [], 'cet6': [], 'graduate': []}
for zh, info in candidates.items():
    by_level.setdefault(info['level'], []).append((zh, info))
candidates = {}
for lvl in LEVEL_ORDER:
    picked = sorted(by_level.get(lvl, []), key=lambda kv: kv[0])[:QUOTA.get(lvl, 0)]
    for zh, info in picked:
        candidates[zh] = info
print(f'Candidates (quota cet4={QUOTA["cet4"]} cet6={QUOTA["cet6"]} graduate={QUOTA["graduate"]}): {len(candidates)}')

# ── IPA via CMU ──
print('Loading CMU dict...')
cmu = load_cmu()
print(f'  CMU: {len(cmu)} words')

# ── Build new entries ──
# pos guess: no reliable signal from word list; default noun, refine common suffixes
POS_SUFFIX = {
    'tion': ('noun', '名词'), 'sion': ('noun', '名词'), 'ment': ('noun', '名词'),
    'ness': ('noun', '名词'), 'ity': ('noun', '名词'), 'ance': ('noun', '名词'),
    'ence': ('noun', '名词'), 'er': ('noun', '名词'), 'or': ('noun', '名词'),
    'ist': ('noun', '名词'), 'ism': ('noun', '名词'),
    'ful': ('adjective', '形容词'), 'ous': ('adjective', '形容词'),
    'ive': ('adjective', '形容词'), 'able': ('adjective', '形容词'),
    'ible': ('adjective', '形容词'), 'al': ('adjective', '形容词'),
    'ly': ('adverb', '副词'),
    'ize': ('verb', '动词'), 'ise': ('verb', '动词'), 'ate': ('verb', '动词'),
    'ify': ('verb', '动词'), 'en': ('verb', '动词'),
}

def guess_pos(en):
    for suf, (pos, pos_cn) in POS_SUFFIX.items():
        if en.endswith(suf):
            return pos, pos_cn
    return ('noun', '名词')

CAT_MAP = {'cet4': 'cet4', 'cet6': 'cet6', 'graduate': 'graduate'}

new_entries = []
for zh, info in sorted(candidates.items()):
    en = info['en']
    level = info['level']
    pos, pos_cn = guess_pos(en)
    ipa = arpabet_to_ipa(cmu[en]) if en in cmu else ''
    ipa_part = f", ipa: '{ipa}'" if ipa else ''
    new_entries.append(
        f"  {{ zh: '{zh}', en: '{en}', def: '{en}', level: '{level}', "
        f"cat: '{level}', pos: '{pos}', pos_cn: '{pos_cn}'{ipa_part} }}"
    )

print(f'New entries to add: {len(new_entries)}')
with_ipa = sum(1 for e in new_entries if "ipa: '" in e and "ipa: ''" not in e)
print(f'With IPA: {with_ipa}')

# ── Append ──
block = ',\n'.join(new_entries)
entries_text = entries_text.rstrip()
if entries_text.endswith(','):
    entries_text += '\n' + block
else:
    entries_text += ',\n' + block

new_text = text[:match.start()] + 'const WORD_BANK = [' + entries_text + '];\n\n/* Build' + text[match.end():]

with open(BANK, 'w', encoding='utf-8') as f:
    f.write(new_text)

final_count = len(set(re.findall(r"zh:\s*'([^']+)'", new_text)))
print(f'FINAL entry count: {final_count}')

# ── Validate ──
rc = os.system(f'node --check {BANK} 2>&1')
print('✅ syntax OK' if rc == 0 else '❌ syntax error!')
