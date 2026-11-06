#!/usr/bin/env python3
"""Generate two synthetic three-slide PPTX decks for staging QA.

Regeneration requires python-pptx. The generated fixtures are committed so
the GitHub workflow does not install Python packages.
"""
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent
for edition in ("a", "b"):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    prs.core_properties.author = "AirTrust QA synthetic"
    prs.core_properties.subject = "Disposable PPTX qualification acceptance"
    for number in range(1, 4):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(11), Inches(3))
        text = box.text_frame
        text.text = f"AirTrust QA PPTX {edition.upper()} — slide {number} de 3"
        for paragraph in text.paragraphs:
            for run in paragraph.runs:
                run.font.size = Pt(32)
    prs.save(ROOT / f"qa-pptx-3-slides-{edition}.pptx")
