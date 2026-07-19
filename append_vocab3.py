#!/usr/bin/env python3
"""Append third small batch to push past 3500."""

import re

WORKBANK_PATH = '/home/hermes/IFLL-Web/src/lib/wordbank.js'

with open(WORKBANK_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

existing = set(re.findall(r"zh:\s*'([^']*)'", content))
print(f"Current: {len(existing)}")

BATCH3 = [
    # More CET-6 and graduate-level vocab
    ('升华', 'sublimate', 'to elevate or purify', 'cet6', 'abstract', 'verb', '动词'),
    ('深化', 'deepen', 'to make more profound', 'cet4', 'verb', 'verb', '动词'),
    ('辐射', 'radiate', 'to emit rays or waves', 'cet4', 'verb', 'verb', '动词'),
    ('渗透', 'permeate', 'to spread through every part', 'cet4', 'verb', 'verb', '动词',
     'Water permeates the soil.', '水**渗透**进土壤。'),
    ('凝聚', 'coalesce', 'to come together as one', 'cet6', 'verb', 'verb', '动词'),
    ('瓦解', 'disintegrate', 'to break into fragments', 'cet6', 'verb', 'verb', '动词'),
    ('颠覆', 'subvert', 'to undermine established system', 'cet6', 'verb', 'verb', '动词'),
    ('篡改', 'falsify', 'to alter fraudulently', 'cet6', 'verb', 'verb', '动词'),
    ('演变', 'evolve', 'to develop gradually', 'cet4', 'verb', 'verb', '动词',
     'Species evolve over time.', '物种随着时间**演变**。'),
    ('退化', 'degenerate', 'to decline in quality', 'cet6', 'verb', 'verb', '动词'),
    ('恶化', 'deteriorate', 'to become worse', 'cet4', 'verb', 'verb', '动词'),
    ('优化', 'optimize', 'to make the best use of', 'cet4', 'verb', 'verb', '动词'),
    ('量化', 'quantify', 'to measure or express as a quantity', 'cet6', 'verb', 'verb', '动词'),
    ('细化', 'refine', 'to make more detailed', 'cet4', 'verb', 'verb', '动词'),
    ('泛化', 'generalize', 'to make more general', 'cet6', 'verb', 'verb', '动词'),
    ('异化', 'alienate', 'to make hostile or indifferent', 'cet6', 'verb', 'verb', '动词'),
    ('同化', 'assimilate', 'to absorb and integrate', 'cet6', 'verb', 'verb', '动词'),
    ('融合', 'integrate', 'to combine into a whole', 'cet4', 'verb', 'verb', '动词',
     'The cultures integrate over time.', '文化随着时间**融合**。'),
    ('化合', 'combine', 'to unite chemically', 'cet4', 'verb', 'verb', '动词'),
    ('分解', 'decompose', 'to break down into parts', 'cet4', 'verb', 'verb', '动词'),
    ('蒸馏', 'distill', 'to purify by heating and cooling', 'cet6', 'verb', 'verb', '动词'),
    ('沉淀', 'precipitate', 'to separate out from solution', 'cet6', 'verb', 'verb', '动词'),
    ('结晶', 'crystallize', 'to form into crystals', 'cet6', 'verb', 'verb', '动词'),
    ('冗余', 'redundant', 'not needed or superfluous', 'cet6', 'adj', 'adjective', '形容词'),
    ('繁琐', 'tedious', 'too detailed and tiresome', 'cet6', 'adj', 'adjective', '形容词'),
    ('细腻', 'delicate', 'fine in texture or detail', 'cet4', 'adj', 'adjective', '形容词'),
    ('粗糙', 'rough', 'having an uneven surface', 'cet4', 'adj', 'adjective', '形容词',
     'The surface is rough to touch.', '表面摸起来很**粗糙**。'),
    ('光滑', 'smooth', 'having an even surface', 'cet4', 'adj', 'adjective', '形容词'),
    ('平坦', 'flat', 'level and even', 'cet4', 'adj', 'adjective', '形容词'),
    ('陡峭', 'steep', 'having a sharp incline', 'cet4', 'adj', 'adjective', '形容词'),
    ('肥沃', 'fertile', 'rich in nutrients for plant growth', 'cet4', 'adj', 'adjective', '形容词'),
    ('贫瘠', 'barren', 'too poor to produce vegetation', 'cet6', 'adj', 'adjective', '形容词'),
    ('茂盛', 'lush', 'growing thickly and healthily', 'cet4', 'adj', 'adjective', '形容词'),
    ('枯萎', 'wilt', 'to become limp or drooping', 'cet4', 'verb', 'verb', '动词'),
    ('萌芽', 'sprout', 'to start to grow', 'cet4', 'verb', 'verb', '动词',
     'Seeds sprout in spring.', '种子在春天**萌芽**。'),
    ('绽放', 'bloom', 'to open into flower', 'cet4', 'verb', 'verb', '动词'),
    ('凋谢', 'wither', 'to dry up and die', 'cet4', 'verb', 'verb', '动词'),
    ('栖息', 'perch', 'to rest on a branch', 'cet4', 'verb', 'verb', '动词'),
    ('迁徙', 'migrate', 'to move from one region to another', 'cet4', 'verb', 'verb', '动词',
     'Birds migrate south in winter.', '鸟类冬天向南方**迁徙**。'),
    ('繁衍', 'multiply', 'to increase in number by reproduction', 'cet6', 'verb', 'verb', '动词'),
    ('进化', 'evolution', 'the gradual development of species', 'cet4', 'nature', 'noun', '名词',
     'Evolution explains how species change.', '**进化**解释了物种如何变化。'),
    ('遗传', 'heredity', 'the passing of traits from parents', 'cet4', 'nature', 'noun', '名词'),
    ('变异', 'mutation', 'a change in genetic material', 'cet6', 'nature', 'noun', '名词'),
    ('感染', 'infect', 'to transmit a disease to', 'cet4', 'verb', 'verb', '动词'),
    ('免疫', 'immune', 'resistant to a disease', 'cet4', 'adj', 'adjective', '形容词',
     'Your body builds immune defenses.', '你的身体会建立**免疫**防御。'),
    ('抗体', 'antibody', 'a protein that fights infection', 'cet6', 'nature', 'noun', '名词'),
    ('疫苗', 'vaccine', 'a substance to stimulate immunity', 'cet4', 'nature', 'noun', '名词'),
    ('诊断', 'diagnose', 'to identify a medical condition', 'cet4', 'verb', 'verb', '动词'),
    ('治疗', 'treat', 'to give medical care', 'cet4', 'verb', 'verb', '动词',
     'The doctor will treat the patient.', '医生会**治疗**病人。'),
    ('康复', 'recover', 'to return to good health', 'cet4', 'verb', 'verb', '动词'),
    ('预防', 'prevent', 'to stop from happening', 'cet4', 'verb', 'verb', '动词',
     'Vaccination prevents disease.', '接种疫苗**预防**疾病。'),
    ('锻炼', 'exercise', 'to engage in physical activity', 'daily', 'verb', 'verb', '动词'),
    ('营养', 'nutrition', 'the process of providing essential food', 'cet4', 'abstract', 'noun', '名词'),
    ('维生素', 'vitamin', 'essential organic compounds for health', 'cet4', 'daily', 'noun', '名词'),
    ('蛋白质', 'protein', 'an essential organic compound', 'cet4', 'nature', 'noun', '名词'),
    ('碳水化合物', 'carbohydrate', 'an energy-providing nutrient', 'cet4', 'nature', 'noun', '名词'),
    ('纤维', 'fiber', 'a thread-like substance in food', 'cet4', 'nature', 'noun', '名词'),
    ('矿物质', 'mineral', 'natural inorganic substances', 'cet4', 'nature', 'noun', '名词'),
    ('热量', 'calorie', 'a unit of energy in food', 'cet4', 'abstract', 'noun', '名词'),
    ('脂肪', 'fat', 'a natural oily substance', 'cet4', 'nature', 'noun', '名词'),
    ('消化', 'digest', 'to break down food in the body', 'cet4', 'verb', 'verb', '动词',
     'The body digests food in the stomach.', '身体在胃里**消化**食物。'),
    ('吸收', 'absorb', 'to take in a substance', 'cet4', 'verb', 'verb', '动词'),
    ('排泄', 'excrete', 'to eliminate waste from the body', 'cet6', 'verb', 'verb', '动词'),
    ('呼吸', 'breathe', 'to take air into the lungs', 'daily', 'verb', 'verb', '动词',
     'Breathe deeply and relax.', '深呼吸并放松。'),
    ('循环', 'circulate', 'to move through a system and return', 'cet4', 'verb', 'verb', '动词'),
    ('脉搏', 'pulse', 'the rhythmic expansion of arteries', 'cet4', 'daily', 'noun', '名词'),
    ('血压', 'blood pressure', 'the pressure of blood in the body', 'cet4', 'daily', 'noun', '名词'),
    ('骨骼', 'skeleton', 'the framework of bones in the body', 'cet4', 'daily', 'noun', '名词'),
    ('肌肉', 'muscle', 'a body tissue that can contract', 'cet4', 'daily', 'noun', '名词'),
    ('神经', 'nerve', 'a fiber that carries signals', 'cet4', 'daily', 'noun', '名词'),
    ('细胞', 'cell', 'the basic unit of living organisms', 'cet4', 'nature', 'noun', '名词',
     'Every living thing is made of cells.', '每个生命体都由**细胞**组成。'),
    ('组织', 'tissue', 'a group of similar cells', 'cet4', 'nature', 'noun', '名词'),
    ('器官', 'organ', 'a part of the body with a specific function', 'cet4', 'nature', 'noun', '名词'),
]

total_added = 0
skipped = 0
new_js = []

for e in BATCH3:
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

print(f"Third batch: added {total_added}, skipped {skipped} (already existed)")

# Insert before "];"
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
