from pathlib import Path

p = Path('src/react-app/pages/frms/__tests__/FrmsCheckinFadiga.test.tsx')
text = p.read_text()

old_import = "import { useEffect, type ReactNode } from 'react';"
new_import = "import { useEffect, useRef, type ReactNode } from 'react';"
if text.count(old_import) != 1:
    raise SystemExit(f'import anchor count={text.count(old_import)}')
text = text.replace(old_import, new_import, 1)

old = """  default: ({ onComplete }: { onComplete: (result: unknown) => void }) => {
    useEffect(() => {
      onComplete({
"""
new = """  default: ({ onComplete }: { onComplete: (result: unknown) => void }) => {
    const completedRef = useRef(false);
    useEffect(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete({
"""
if text.count(old) != 1:
    raise SystemExit(f'mock anchor count={text.count(old)}')
text = text.replace(old, new, 1)
p.write_text(text)
