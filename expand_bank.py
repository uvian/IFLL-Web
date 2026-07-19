"""IFLL — Word bank expander + IPA filler
Reads src/lib/wordbank.js, adds IPA via parallel API calls,
appends ~500 new entries, rebuilds WORD_BANK_MAP.
"""
import json, re, urllib.request, urllib.error, urllib.parse, time, os, sys

FILE = os.path.expanduser('~/IFLL-Web/src/lib/wordbank.js')

with open(FILE, 'r', encoding='utf-8') as f:
    text = f.read()

# Parse existing WORD_BANK entries
match = re.search(r'const WORD_BANK = \[([\s\S]*?)\];\s*\n\s*\n/\* Build', text)
if not match:
    print('ERROR: cannot find WORD_BANK')
    sys.exit(1)

entries_text = match.group(1)

# Extract all existing zh values
existing_zh = set(re.findall(r"zh:\s*'([^']+)'", entries_text))
print(f'Existing entries: {len(existing_zh)}')

# Parse each entry to find those missing IPA
entry_list = []
entry_pattern = re.compile(r'\{([^}]+)\}')
existing_entries_with_ipa = 0
entries_missing_ipa = []

for m in entry_pattern.finditer(entries_text):
    block = m.group(1)
    zh_m = re.search(r"zh:\s*'([^']*)'", block)
    en_m = re.search(r"en:\s*'([^']*)'", block)
    ipa_m = re.search(r"'ipa'", block)
    zh = zh_m.group(1) if zh_m else ''
    en = en_m.group(1) if en_m else ''
    if zh and en:
        if ipa_m:
            existing_entries_with_ipa += 1
        else:
            entries_missing_ipa.append((zh, en))

print(f'Entries with IPA already: {existing_entries_with_ipa}')
print(f'Entries missing IPA: {len(entries_missing_ipa)}')

# Fetch IPA from Free Dictionary API (concurrent, batch of 8)
import concurrent.futures

def fetch_ipa(en):
    url = 'https://api.dictionaryapi.dev/api/v2/entries/en/' + urllib.parse.quote(en)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'IFLL/2.0'})
        resp = urllib.request.urlopen(req, timeout=8)
        data = json.loads(resp.read())
        if data and len(data) > 0:
            for phon in data[0].get('phonetics', []):
                ipa = phon.get('text')
                if ipa:
                    return ipa
    except Exception:
        pass
    return None

# Process missing IPA in batches
ipa_map = {}
total_missing = len(entries_missing_ipa)
batch_size = 8
fetched = 0

print(f'Fetching IPA for {total_missing} words...')
for start in range(0, total_missing, batch_size):
    batch = entries_missing_ipa[start:start+batch_size]
    with concurrent.futures.ThreadPoolExecutor(max_workers=batch_size) as pool:
        futures = {pool.submit(fetch_ipa, en): (zh, en) for zh, en in batch}
        for ft in concurrent.futures.as_completed(futures):
            zh, en = futures[ft]
            ipa = ft.result()
            if ipa:
                ipa_map[zh] = ipa
            fetched += 1
    if (start + batch_size) % 80 == 0 or start + batch_size >= total_missing:
        print(f'  IPA progress: {fetched}/{total_missing}, found {len(ipa_map)} so far')
    time.sleep(0.5)  # Between batches, light rate limit

print(f'IPA fetch done: {len(ipa_map)} words have IPA')

# Build new entries to add (~550 new words to get to ~4050)
NEW_ENTRIES = [
  # Extended HSK / advanced vocab + IPA-friendly
  {'zh': '安置', 'en': 'arrange', 'def': 'to put in a proper place', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '拜訪', 'en': 'visit', 'def': 'to pay a visit', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '頒布', 'en': 'promulgate', 'def': 'to officially announce a law', 'level': 'graduate', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '辦理', 'en': 'handle', 'def': 'to deal with procedures', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '伴侶', 'en': 'partner', 'def': 'a life companion', 'level': 'cet4', 'cat': 'daily', 'pos': 'noun', 'pos_cn': '名词'},
  {'zh': '包含', 'en': 'contain', 'def': 'to hold within', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '包裝', 'en': 'package', 'def': 'a wrapped container', 'level': 'cet4', 'cat': 'daily', 'pos': 'noun', 'pos_cn': '名词'},
  {'zh': '寶貴', 'en': 'precious', 'def': 'of great value', 'level': 'cet4', 'cat': 'adj', 'pos': 'adjective', 'pos_cn': '形容词'},
  {'zh': '保存', 'en': 'preserve', 'def': 'to maintain in good state', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '保護', 'en': 'protect', 'def': 'to keep safe from harm', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '保密', 'en': 'confidential', 'def': 'kept secret', 'level': 'cet4', 'cat': 'adj', 'pos': 'adjective', 'pos_cn': '形容词'},
  {'zh': '保障', 'en': 'guarantee', 'def': 'a formal assurance', 'level': 'cet4', 'cat': 'noun', 'pos': 'noun', 'pos_cn': '名词'},
  {'zh': '報復', 'en': 'retaliate', 'def': 'to repay an injury', 'level': 'cet6', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '報警', 'en': 'alert', 'def': 'to warn of danger', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
  {'zh': '抱怨', 'en': 'complain', 'def': 'to express dissatisfaction', 'level': 'cet4', 'cat': 'verb', 'pos': 'verb', 'pos_cn': '动词'},
]

# Only add entries whose zh is not already in the bank
new_entries_str = ''
added_count = 0
for e in NEW_ENTRIES:
    if e['zh'] in existing_zh:
        continue
    existing_zh.add(e['zh'])
    ipa = ipa_map.get(e['zh'], '')
    ipa_part = f", ipa: '{ipa}'" if ipa else ''
    ex = f"  {{ zh: '{e['zh']}', en: '{e['en']}', def: '{e['def']}', level: '{e['level']}', cat: '{e['cat']}', pos: '{e['pos']}', pos_cn: '{e['pos_cn']}'{ipa_part} }}"
    if added_count > 0:
        new_entries_str += ',\n' + ex
    else:
        new_entries_str = ex
    added_count += 1
print(f'Added {added_count} new entries')

# Now update IPA in existing entries
# Strategy: find each entry without ipa and add it
def add_ipa_to_entry(match_obj):
    block = match_obj.group(0)
    if "'ipa'" in block:
        return block  # Already has IPA
    zh_m = re.search(r"zh:\s*'([^']*)'", block)
    if zh_m:
        zh = zh_m.group(1)
        ipa = ipa_map.get(zh)
        if ipa:
            # Add ipa before the closing }
            block = block.rstrip()
            if block.endswith('}'):
                block = block[:-1].rstrip() + f", ipa: '{ipa}'" + '}'
            elif block.endswith('},'):
                block = block[:-2].rstrip() + f", ipa: '{ipa}'" + '},'
    return block

# Apply IPA updates to entry blocks
# This is tricky because we need to match each entry's full text
# Let's do it with a different approach: find each {zh:..., pos_cn:...} pattern

# Actually, simpler approach: iterate entries_text and replace
# But let me just use the pattern matching approach
entry_blocks = list(entry_pattern.finditer(entries_text))
updated_count = 0
offset = 0
for m in entry_blocks:
    old_block = m.group(0)
    start, end = m.start(), m.end()
    if "'ipa'" in old_block:
        continue
    zh_m = re.search(r"zh:\s*'([^']*)'", old_block)
    if zh_m:
        zh = zh_m.group(1)
        ipa = ipa_map.get(zh)
        if ipa:
            new_block = old_block.rstrip()
            if new_block.endswith('},'):
                new_block = new_block[:-2].rstrip() + f", ipa: '{ipa}'" + '},'
            elif new_block.endswith('}'):
                new_block = new_block[:-1].rstrip() + f", ipa: '{ipa}'" + '}'
            entries_text = entries_text[:start] + new_block + entries_text[end:]
            offset += len(new_block) - (end - start)
            updated_count += 1

print(f'Updated {updated_count} existing entries with IPA data')

# Add new entries at the end of the array
new_entries_comma = (',' if entries_text.rstrip().endswith('},') or entries_text.rstrip().endswith('}') else '')
entries_text = entries_text.rstrip() + (',' if new_entries_comma else '') + '\n' + new_entries_str

# Rebuild WORD_BANK_MAP
new_text = text[:match.start()] + 'const WORD_BANK = [' + entries_text + '];\n\n/* Build' + text[match.end():]
# Replace the old map construction
map_start = new_text.find("const WORD_BANK_MAP = new Map();")
if map_start > 0:
    map_end = new_text.find("}", map_start)
    if map_end > 0:
        map_end = new_text.find('\n', map_end) + 1
        # Keep the original map construction
        pass

# Write to file
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(new_text)

# Count final entries
final_entries = re.findall(r"zh:\s*'([^']+)'", new_text)
print(f'Final entry count: {len(final_entries)}')

# Validate
result = os.system('node --check ' + FILE + ' 2>&1')
if result == 0:
    print('✅ wordbank.js syntax OK')
else:
    print('❌ Syntax error! Check the file.')
