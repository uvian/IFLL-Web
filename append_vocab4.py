#!/usr/bin/env python3
"""Append final small batch to push past 3500."""

import re

WORKBANK_PATH = '/home/hermes/IFLL-Web/src/lib/wordbank.js'

with open(WORKBANK_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

existing = set(re.findall(r"zh:\s*'([^']*)'", content))
print(f"Current: {len(existing)}")

BATCH4 = [
    # More graduate/advanced vocabulary
    ('宏观', 'macro', 'relating to the whole rather than details', 'graduate', 'abstract', 'adj', 'adjective', '形容词'),
    ('微观', 'micro', 'relating to small-scale details', 'graduate', 'abstract', 'adj', 'adjective', '形容词'),
    ('主观', 'subjective', 'based on personal feelings or opinions', 'graduate', 'abstract', 'adj', 'adjective', '形容词'),
    ('客观', 'objective', 'based on facts rather than opinions', 'graduate', 'abstract', 'adj', 'adjective', '形容词'),
    ('辩证', 'dialectical', 'relating to the logical discussion of ideas', 'graduate', 'abstract', 'adj', 'adjective', '形容词'),
    ('唯物主义', 'materialism', 'the theory that matter is the fundamental substance', 'graduate', 'abstract', 'noun', '名词'),
    ('唯心主义', 'idealism', 'the theory that mind is the fundamental reality', 'graduate', 'abstract', 'noun', '名词'),
    ('形而上学', 'metaphysics', 'the branch of philosophy dealing with reality', 'graduate', 'abstract', 'noun', '名词'),
    ('实证', 'empirical', 'based on observation or experience', 'graduate', 'academic', 'adj', 'adjective', '形容词'),
    ('范式', 'paradigm', 'a typical example or pattern', 'graduate', 'academic', 'noun', '名词',
     'This paradigm shift changed the field.', '这个**范式**转变改变了这个领域。'),
    ('方法论', 'methodology', 'a system of methods used in a study', 'graduate', 'academic', 'noun', '名词'),
    ('本体论', 'ontology', 'the branch of metaphysics dealing with being', 'graduate', 'abstract', 'noun', '名词'),
    ('认识论', 'epistemology', 'the theory of knowledge', 'graduate', 'abstract', 'noun', '名词'),
    ('实证主义', 'positivism', 'a philosophical system based on facts', 'graduate', 'abstract', 'noun', '名词'),
    ('解构', 'deconstruct', 'to analyze by breaking into parts', 'graduate', 'verb', 'verb', '动词'),
    ('重构', 'reconstruct', 'to rebuild or reorganize', 'graduate', 'verb', 'verb', '动词'),
    ('颠覆', 'subvert', 'to overthrow a system or institution', 'graduate', 'verb', 'verb', '动词'),
    ('异化', 'alienation', 'the state of being isolated', 'graduate', 'abstract', 'noun', '名词'),
    ('物化', 'reify', 'to make something abstract into a concrete thing', 'graduate', 'verb', 'verb', '动词'),
    ('意识形态', 'ideology', 'a system of ideas and beliefs', 'graduate', 'abstract', 'noun', '名词',
     'Ideology shapes political views.', '**意识形态**塑造政治观点。'),
    ('霸权', 'hegemony', 'leadership or dominance of one group', 'graduate', 'society', 'noun', '名词'),
    ('批判', 'critique', 'a detailed analysis and assessment', 'graduate', 'verb', 'verb', '动词'),
    ('启蒙', 'enlighten', 'to give intellectual or spiritual light to', 'graduate', 'verb', 'verb', '动词'),
    ('理性', 'rationality', 'the quality of being based on reason', 'graduate', 'abstract', 'noun', '名词'),
    ('感性', 'perceptual', 'based on feelings and emotions', 'graduate', 'abstract', 'adj', 'adjective', '形容词'),
    ('知性', 'understanding', 'the ability to comprehend', 'graduate', 'abstract', 'noun', '名词'),
    ('审美', 'aesthetic', 'concerned with beauty or appreciation of beauty', 'graduate', 'adj', 'adjective', '形容词',
     'Aesthetic taste varies among individuals.', '**审美**品味因人而异。'),
    ('伦理', 'ethics', 'moral principles governing behavior', 'graduate', 'abstract', 'noun', '名词'),
    ('道义', 'moral duty', 'a moral obligation', 'graduate', 'abstract', 'noun', '名词'),
    ('正义', 'justice', 'the quality of being morally right', 'graduate', 'abstract', 'noun', '名词'),
    ('公平', 'fairness', 'the quality of being impartial', 'cet4', 'abstract', 'noun', '名词'),
    ('效率', 'efficiency', 'the ratio of useful output to total input', 'cet4', 'abstract', 'noun', '名词'),
    ('效益', 'benefit', 'a positive outcome or result', 'cet4', 'abstract', 'noun', '名词'),
]

total_added = 0
skipped = 0
new_js = []

for e in BATCH4:
    zh = e[0]
    if zh in existing:
        skipped += 1
        continue
    existing.add(zh)
    total_added += 1
    
    en = e[1]
    defn = e[2][:60]
    level = e[3]
    cat = e[4]
    pos = e[5]
    pos_cn = e[6]
    
    js = f"  {{ zh: '{zh}', en: '{en}', def: '{defn}', level: '{level}', cat: '{cat}', pos: '{pos}', pos_cn: '{pos_cn}'"
    if len(e) > 7 and e[7]:
        example_en = e[7].replace("'", "\\'")
        example_cn = e[8].replace("'", "\\'") if len(e) > 8 else ''
        if '**' not in example_cn and zh in example_cn:
            example_cn = example_cn.replace(zh, f'**{zh}**')
        js += f", example: '{example_en}', example_cn: '{example_cn}'"
    js += " },"
    new_js.append(js)

print(f"Final batch: added {total_added}, skipped {skipped}")

insert_pos = content.rfind("];\n\n/* Build lookup Map */")
if insert_pos < 0:
    insert_pos = content.rfind("];")

new_block = "\n" + "\n".join(new_js) + "\n"
modified = content[:insert_pos] + new_block + content[insert_pos:]

with open(WORKBANK_PATH, 'w', encoding='utf-8') as f:
    f.write(modified)

final_count = len(re.findall(r"\{\s*zh:\s*'", modified))
print(f"Final entry count: {final_count}")
print("Done!")
