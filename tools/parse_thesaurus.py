#!/usr/bin/env python3
"""
IFLL Word Bank Builder — parses Obsidian thesaurus pages into Chinese→English pairs.
Usage: cat page.txt | python3 parse_thesaurus.py >> wordbank_output.txt
"""
import sys, re, json

def parse_thesaurus_text(text):
    """Parse Obsidian thesaurus text into Chinese→English word pairs."""
    pairs = []
    
    # Extract the topic title
    topic_match = re.search(r'☀\s*(.+?)[：:]', text)
    topic = topic_match.group(1).strip() if topic_match else 'uncategorized'
    
    # Split into word entries (each starts with a lowercase English word line)
    # Pattern: english_word [ˈfɒnɛtɪk]
    #          part_of_speech definition: examples / chinese translation
    lines = text.split('\n')
    
    current_en = None
    current_phonetic = None
    current_defs = []
    current_zh_list = set()
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Skip sidebar/navigation lines (Chinese-only lines that are page structure)
        if re.match(r'^[\u4e00-\u9fff\s\d]+$', line) and len(line) < 50:
            if not line.startswith('☀') and '：' not in line and ':' not in line:
                continue
        
        # Skip the structure lines
        if line.startswith('INTERACTIVE') or line.startswith('Powered by') or line.startswith('基础汉英'):
            continue
        if line in ['英语词义分类数据库（大学版）', '英语词根词缀分类数据库']:
            continue
        if re.match(r'^\d{2}\s', line) and not re.search(r'[a-z]', line):
            # Purely Chinese lines with leading numbers - only include if they have English
            continue
            
        # Check if this line starts a new word entry (English word followed by phonetic)
        en_word_match = re.match(r"^([a-zA-Z][a-zA-Z\s\-']+?)\s*\[([^\]]+)\]", line)
        if en_word_match:
            # Save previous entry
            if current_en and current_zh_list:
                pairs.append({
                    'en': current_en,
                    'zh': list(current_zh_list),
                    'def': ' | '.join(current_defs[:3]) if current_defs else '',
                    'topic': topic
                })
            
            current_en = en_word_match.group(1).strip()
            current_phonetic = en_word_match.group(2)
            current_defs = []
            current_zh_list = set()
            continue
        
        # Check if this is a word line without phonetic (like "powerhouse [ˈpaʊəhaʊs]")
        en_word_match2 = re.match(r"^([a-zA-Z][a-zA-Z\s\-']+?)\s*\[", line)
        if en_word_match2:
            if current_en and current_zh_list:
                pairs.append({
                    'en': current_en,
                    'zh': list(current_zh_list),
                    'def': ' | '.join(current_defs[:3]) if current_defs else '',
                    'topic': topic
                })
            current_en = en_word_match2.group(1).strip()
            current_phonetic = None
            current_defs = []
            current_zh_list = set()
            continue
        
        # Extract Chinese words from definitions
        # Pattern: Chinese text (like "n. 国家") contains Chinese chars
        # Look for Chinese phrases that are translations/definitions
        chinese_parts = re.findall(r'[\u4e00-\u9fff]+[，。、]?', line)
        # Also look for Chinese in the format "的XX": "XX的XX"
        
        # Find "--- 的XX" patterns (word definitions end with 的 + noun)
        # Find "---，---" patterns
        
        # For definition lines, extract Chinese keywords
        if '：' in line or ':' in line:
            parts = re.split(r'[：:]', line, 1)
            if len(parts) > 1:
                # Extract meaningful Chinese words from the definition
                zh_text = parts[1]
                # Find quoted or notable Chinese terms
                zh_terms = re.findall(r'[\u4e00-\u9fff]{2,}(?:[/／][\u4e00-\u9fff]{2,})*', zh_text)
                for t in zh_terms:
                    # Split multi-term entries
                    for single in t.split('/'):
                        single = single.strip()
                        if len(single) >= 2 and len(single) <= 8:
                            current_zh_list.add(single)
                
                # Also get Chinese from the definition type part
                zh_type = parts[0]
                zh_keywords = re.findall(r'[\u4e00-\u9fff]{2,}', zh_type)
                for kw in zh_keywords:
                    if len(kw) >= 2 and kw not in ['动词', '名词', '形容词', '副词', '介词', '连词']:
                        current_zh_list.add(kw)
            
            current_defs.append(line)
        elif re.search(r'[\u4e00-\u9fff]', line):
            current_defs.append(line)
            # Extract Chinese words
            zh_terms = re.findall(r'[\u4e00-\u9fff]{2,}', line)
            for t in zh_terms:
                if len(t) >= 2 and len(t) <= 8:
                    current_zh_list.add(t)
    
    # Save last entry
    if current_en and current_zh_list:
        pairs.append({
            'en': current_en,
            'zh': list(current_zh_list),
            'def': ' | '.join(current_defs[:3]) if current_defs else '',
            'topic': topic
        })
    
    return pairs


def pairs_to_wordbank(pairs, level='cet6'):
    """Convert parsed pairs to IFLL word bank entries."""
    entries = []
    seen_en = set()
    
    for p in pairs:
        en = p['en'].lower().strip()
        if en in seen_en:
            continue
        seen_en.add(en)
        
        for zh in p['zh']:
            if len(zh) >= 2:
                # Create brief definition from the context
                brief_def = p['def']
                if len(brief_def) > 80:
                    brief_def = brief_def[:80] + '...'
                
                entries.append({
                    'zh': zh,
                    'en': en,
                    'def': brief_def,
                    'level': level,
                    'cat': p.get('topic', 'general')[:20]
                })
    
    return entries


if __name__ == '__main__':
    text = sys.stdin.read()
    pairs = parse_thesaurus_text(text)
    entries = pairs_to_wordbank(pairs)
    
    # Print as JS entries
    for e in entries:
        zh = e['zh']
        en = e['en']
        level = e['level']
        cat = e['cat']
        if e['def']:
            d = e['def'].replace("'", "\\'")
            print(f"  {{ zh: '{zh}', en: '{en}', def: '{d}', level: '{level}', cat: '{cat}' }},")
        else:
            print(f"  {{ zh: '{zh}', en: '{en}', level: '{level}', cat: '{cat}' }},")
    
    topic = pairs[0]['topic'] if pairs else 'none'
    print(f"// Parsed {len(entries)} word pairs from topic: {topic}", file=sys.stderr)
