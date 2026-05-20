import os, re

base = "/Users/filipedaumas/Documents/airtrust v1/src/react-app"
pattern = re.compile(r"localStorage\.getItem\('token'\)")
replacement = "localStorage.getItem('airtrust_token')"

count = 0
for root, dirs, files in os.walk(base):
    for fname in files:
        if not (fname.endswith('.tsx') or fname.endswith('.ts')):
            continue
        fpath = os.path.join(root, fname)
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.split('\n')
        new_lines = []
        changed = False
        for line in lines:
            if "airtrust_token" in line:
                new_lines.append(line)
            elif pattern.search(line):
                new_line = pattern.sub(replacement, line)
                new_lines.append(new_line)
                count += 1
                changed = True
            else:
                new_lines.append(line)
        
        if changed:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write('\n'.join(new_lines))
            print(f"Updated: {fpath.replace(base+'/', '')}")

print(f"\nTotal replacements: {count}")
