#!/usr/bin/env python3
"""Offline IPA filler using CMU Pronouncing Dictionary (ARPABET → IPA)"""
import re, sys, os

CMUDICT = os.path.expanduser('~/cmudict.txt')
BANKFILE = os.path.expanduser('~/IFLL-Web/src/lib/wordbank.js')

# ARPABET to IPA mapping (with stress markers stripped)
ARPABET_TO_IPA = {
    'AA': 'ɑː', 'AE': 'æ',  'AH': 'ʌ',  'AO': 'ɔː', 'AW': 'aʊ',
    'AY': 'aɪ', 'B':  'b',  'CH': 'tʃ', 'D':  'd',  'DH': 'ð',
    'EH': 'ɛ',  'ER': 'ɜːr','EY': 'eɪ', 'F':  'f',  'G':  'ɡ',
    'HH': 'h',  'IH': 'ɪ',  'IY': 'iː', 'JH': 'dʒ','K':  'k',
    'L':  'l',  'M':  'm',  'N':  'n',  'NG': 'ŋ',  'OW': 'oʊ',
    'OY': 'ɔɪ', 'P':  'p',  'R':  'r',  'S':  's',  'SH': 'ʃ',
    'T':  't',  'TH': 'θ',  'UH': 'ʊ',  'UW': 'uː', 'V':  'v',
    'W':  'w',  'Y':  'j',  'Z':  'z',  'ZH': 'ʒ',
}

def arpabet_to_ipa(arpabet_str):
    """Convert ARPABET phonemes to IPA, stripping stress numbers."""
    symbols = []
    for token in arpabet_str.split():
        # Remove stress markers (0,1,2 at end)
        clean = re.sub(r'[0-2]$', '', token)
        ipa = ARPABET_TO_IPA.get(clean)
        if ipa:
            symbols.append(ipa)
        else:
            symbols.append(clean)  # unknown — keep as is
    return '/' + ''.join(symbols) + '/'

# 1. Load CMU dict
print('Loading CMU Pronouncing Dictionary...')
cmu = {}
with open(CMUDICT, 'r', encoding='latin-1') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith(';;;'):
            continue
        # Format: WORD  P R AH0 N AH0 N S IY0 EY1 SH AH0 N
        parts = line.split(None, 1)
        if len(parts) < 2:
            continue
        word = parts[0].lower().strip('()0123456789')
        if word not in cmu:
            cmu[word] = parts[1]

print(f'  Loaded {len(cmu)} pronunciations')

# 2. Read wordbank.js
print('Reading wordbank.js...')
with open(BANKFILE, 'r', encoding='utf-8') as f:
    text = f.read()

# Count entries with/without IPA
entries_missing = []
entries_have = 0
total = 0

# Find all entry objects
entry_pattern = re.compile(r'\{[^{}]*\bzh:\s*\'([^\']+)\'.*?\ben:\s*\'([^\']+)\'.*?\}', re.DOTALL)
for m in entry_pattern.finditer(text):
    total += 1
    zh = m.group(1)
    en = m.group(2)
    entry_text = m.group(0)
    if 'ipa:' in entry_text:
        entries_have += 1
    else:
        entries_missing.append((m.start(), m.end(), en, entry_text))

print(f'  Total entries: {total}')
print(f'  Already have IPA: {entries_have}')
print(f'  Missing IPA: {len(entries_missing)}')

# 3. Look up IPA and build replacements
print('Looking up pronunciations...')
to_replace = []
found = 0
not_found = 0
for start, end, en, entry_text in entries_missing:
    en_lower = en.lower()
    ipa_str = arpabet_to_ipa(cmu.get(en_lower, ''))
    if cmu.get(en_lower):
        found += 1
    else:
        not_found += 1
        continue
    # Insert ipa before the closing } or before the last field
    # Strategy: find the last property and add ipa before it
    # Better: insert after 'en:' field
    ipa_line = f"  ipa: '{ipa_str}',\n    "
    # Find position to insert (after en: value)
    en_match = re.search(r"\ben:\s*'[^']*'\s*,", entry_text)
    if en_match:
        insert_pos = en_match.end()
        new_entry = entry_text[:insert_pos] + '\n    ' + f"ipa: '{ipa_str}'," + entry_text[insert_pos:].rstrip()
        to_replace.append((start, end, new_entry))

print(f'  Found in CMU: {found}')
print(f'  Not found: {not_found}')

# 4. Apply replacements (from end to start to preserve positions)
print('Updating wordbank.js...')
to_replace.sort(key=lambda x: x[0], reverse=True)
for start, end, new_entry in to_replace:
    text = text[:start] + new_entry + text[end:]

# 5. Verify and write
with open(BANKFILE, 'w', encoding='utf-8') as f:
    f.write(text)

print(f'✅ Added IPA to {len(to_replace)} entries')
print(f'  {len(entries_missing) - len(to_replace)} entries still missing IPA (not in CMU dict)')
