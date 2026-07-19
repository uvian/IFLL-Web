import json, re, urllib.request, urllib.error, urllib.parse, time, os

FILE = os.path.expanduser('~/IFLL-Web/src/lib/wordbank.js')

with open(FILE, 'r', encoding='utf-8') as f:
    text = f.read()

# Extract WORD_BANK array
match = re.search(r'const WORD_BANK = \[([\s\S]*?)\];\s*\n\s*\n/\* Build', text)
if not match:
    print('ERROR: could not find WORD_BANK array')
    exit(1)

entries_text = match.group(1)

# Parse entries
# Simple approach: find each object {...}
entries = []
starts = []
for m in re.finditer(r'\{\s*zh:\s*\'([^\']*)\'', entries_text):
    starts.append(m.start())

print(f'Found {len(starts)} entries')

# For each entry, find its full object text and check if it has ipa
entry_objects = []
idx = 0
for s in starts:
    obj_text = entries_text[s:]
    # Find the matching closing brace
    depth = 0
    end = -1
    for i, ch in enumerate(obj_text):
        if ch == '{': depth += 1
        elif ch == '}': 
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end < 0:
        print(f'  ERROR parsing entry at offset {s}')
        continue
    full = obj_text[:end]
    # Extract zh
    zm = re.search(r"zh:\s*'([^']*)'", full)
    zh = zm.group(1) if zm else '?'
    # Check if ipa exists
    has_ipa = "'ipa'" in full or '"ipa"' in full
    # Extract en
    em = re.search(r"en:\s*'([^']*)'", full)
    en = em.group(1) if em else None
    entry_objects.append((s, end, zh, en, has_ipa, full))
    idx = s + end

# Process entries without ipa
api_url = 'https://api.dictionaryapi.dev/api/v2/entries/en/{}'
headers = {'User-Agent': 'IFLL/1.0'}
updated = 0
skipped = 0

for i, (s, length, zh, en, has_ipa, full) in enumerate(entry_objects):
    if has_ipa or not en:
        skipped += 1
        continue
    
    # Fetch IPA from Free Dictionary API
    url = api_url.format(urllib.parse.quote(en))
    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=5)
        data = json.loads(resp.read())
        ipa = None
        if data and len(data) > 0:
            for meaning in data[0].get('phonetics', []):
                ipa = meaning.get('text') or ipa
        if ipa:
            # Insert ipa field after the last field in the entry
            new_full = full.rstrip()[:-1] + f", ipa: '{ipa}'" + '},'
            entries_text = entries_text[:s] + new_full + entries_text[s + length:]
            updated += 1
            if updated % 50 == 0:
                print(f'  Progress: {updated} IPA entries added...')
        else:
            skipped += 1
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, Exception) as e:
        skipped += 1
    
    time.sleep(0.3)  # Rate limit

print(f'Done: {updated} IPA entries added, {skipped} skipped/not found')

# Write back
new_text = text[:match.start()] + 'const WORD_BANK = [' + entries_text + '];\n\n/* Build' + text[match.end():]

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(new_text)

print(f'Written to {FILE}')
