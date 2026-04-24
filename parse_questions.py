import re
import json
from pypinyin import pinyin, Style
import jieba.analyse

def generate_ruby_pinyin(text):
    result = ""
    for char in text:
        if '\u4e00' <= char <= '\u9fff':
            py = pinyin(char, style=Style.TONE)[0][0]
            result += f"<ruby>{char}<rt>{py}</rt></ruby>"
        else:
            result += char
    return result

def highlight_keywords(text):
    # Extract top 3 keywords based on TF-IDF
    keywords = jieba.analyse.extract_tags(text, topK=3)
    highlighted = text
    for kw in keywords:
        highlighted = highlighted.replace(kw, f"<mark class='keyword'>{kw}</mark>")
    return highlighted

def parse_markdown():
    with open("alt question bank sources/question bank extracted with AI 3.md", "r", encoding="utf-8") as f:
        content = f.read()

    questions = []
    blocks = re.split(r'\n(?=\d+\.\s)', content)
    
    for block in blocks:
        block = block.strip()
        match = re.match(r'^(\d+)\.\s*(.*)', block, re.DOTALL)
        if not match:
            continue
            
        q_id = match.group(1)
        body = match.group(2)
        
        lines = [line.strip() for line in body.split('\n') if line.strip()]
        
        chinese = []
        english = []
        options = {}
        answer = ""
        
        parsing_state = "question"
        last_opt_key = None
        
        for line in lines:
            if line.startswith("答案:"):
                answer = line.replace("答案:", "").strip()
                parsing_state = "done"
            elif line.startswith("正确答案:"):
                answer = line.replace("正确答案:", "").strip()
                parsing_state = "done"
            elif re.match(r'^[A-D]\.', line):
                parsing_state = "options"
                opt_key = line[0]
                opt_val = line[2:].strip()
                
                idx1 = opt_val.find('(')
                idx2 = opt_val.find('（')
                idxs = [i for i in (idx1, idx2) if i != -1]
                if idxs:
                    split_idx = min(idxs)
                    hanzi = opt_val[:split_idx].strip()
                    hint = opt_val[split_idx:].strip()
                else:
                    hanzi = opt_val
                    hint = ""
                
                options[opt_key] = {"raw": opt_val, "hanzi": hanzi, "hint": hint}
                last_opt_key = opt_key
            elif parsing_state == "options":
                if last_opt_key and last_opt_key in options:
                    options[last_opt_key]["hint"] += " " + line.strip()
                    options[last_opt_key]["hint"] = options[last_opt_key]["hint"].strip()
            elif parsing_state == "question":
                cn_count = sum(1 for c in line if '\u4e00' <= c <= '\u9fff')
                en_count = sum(1 for c in line if 'a' <= c.lower() <= 'z')
                if cn_count > 0 and cn_count >= en_count / 3:
                    chinese.append(line)
                else:
                    english.append(line)
                    
        cn_text = "\n".join(chinese)
        
        # Enrich data
        cn_pinyin = generate_ruby_pinyin(cn_text)
        cn_keywords = highlight_keywords(cn_text)
        
        # Options enrichment
        enriched_options = {}
        for k, v in options.items():
            hanzi = v["hanzi"]
            enriched_options[k] = {
                "raw": v["raw"],
                "hanzi": hanzi,
                "hint": v["hint"],
                "pinyin": generate_ruby_pinyin(hanzi)
            }

        questions.append({
            "id": int(q_id),
            "chinese": cn_text,
            "chinese_pinyin": cn_pinyin,
            "chinese_keywords": cn_keywords,
            "english": "\n".join(english),
            "options": enriched_options,
            "answer": answer
        })
        
    with open("questions_data.js", "w", encoding="utf-8") as f:
        f.write("const questionsData = ")
        json.dump(questions, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f"Parsed and enriched {len(questions)} questions.")

if __name__ == "__main__":
    parse_markdown()
