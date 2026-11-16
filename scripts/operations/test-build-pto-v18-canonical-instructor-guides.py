#!/usr/bin/env python3
"""Adversarial and end-to-end PTO instructor mirror contract tests."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "canonical_guides", ROOT / "build-pto-v18-canonical-instructor-guides.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CanonicalGuidesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.aircraft, cls.functional, cls.notechs = module._checked_source()

    def test_renders_82_aircraft_and_6_functional_guides(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest = module.build(Path(folder))
            self.assertEqual(manifest["guides"], 88)
            self.assertEqual(manifest["positions"], 1584)
            self.assertEqual(len(manifest["entries"]), 88)
            self.assertEqual(len(list(Path(folder).glob("*.html"))), 88)
            self.assertEqual({e["aeronave"] for e in manifest["entries"]},
                             {"AW139", "S76", "FUNCIONAL"})
            self.assertEqual(sum(e["posicoes"] for e in manifest["entries"]), 1584)
            for entry in manifest["entries"]:
                content = (Path(folder) / entry["arquivo"]).read_text(encoding="utf-8")
                self.assertEqual(content.count('data-pos="'), 18)
                self.assertEqual(content.count('data-notechs-code="'), 15)
                self.assertIn(module.SOURCE_SHA, content)
                self.assertNotIn("PENDING_SOURCE_REVIEW", content)
                self.assertNotIn("Sem fonte legada", content)
                self.assertNotIn("PENDENTE_DE_VALIDACAO_TECNICA", content)

    def test_all_aircraft_items_exactly_present_in_order(self):
        for session in self.aircraft:
            output = module.render_guide(session, self.notechs, functional=False)
            previous = -1
            for item in session["itens"]:
                token = f'data-pos="{item["ordem"]}"'
                i = output.index(token)
                self.assertGreater(i, previous)
                previous = i
                self.assertIn(item["codigo"], output[i:i + 650])
                self.assertIn(
                    __import__("html").escape(item["nome"], quote=True),
                    output[i:i + 900],
                )
            self.assertIn("1–9: perna 1", output)
            self.assertIn("10–18: perna 2", output)
            self.assertIn("Durante o Check não há instrução nem coaching", output)
            self.assertIn("a avaliação deverá ser interrompida", output)

    def test_functional_does_not_fabricate_pf_assignment(self):
        for session in self.functional:
            output = module.render_guide(session, self.notechs, functional=True)
            self.assertEqual(output.count('data-pos="'), 18)
            self.assertIn("não possui atribuição PF A/B", output)
            self.assertNotIn("1–9: perna 1", output)

    def test_html_injection_is_escaped(self):
        session = {**self.aircraft[0],
                   "itens": [{**x, "nome": "<script>alert(1)</script>"} if i == 0 else x
                             for i, x in enumerate(self.aircraft[0]["itens"])]}
        output = module.render_guide(session, self.notechs)
        self.assertNotIn("<script>", output)
        self.assertIn("&lt;script&gt;", output)

    def test_missing_item_rejected(self):
        session = {**self.aircraft[0], "itens": self.aircraft[0]["itens"][:-1]}
        with self.assertRaisesRegex(ValueError, "PTO_EXPECTED_18_ITEMS"):
            module.render_guide(session, self.notechs)

    def test_item_out_of_order_rejected(self):
        session = {**self.aircraft[0],
                   "itens": list(reversed(self.aircraft[0]["itens"]))}
        with self.assertRaisesRegex(ValueError, "PTO_ITEM_ORDER_MISMATCH"):
            module.render_guide(session, self.notechs)

    def test_duplicate_notechs_rejected(self):
        with self.assertRaisesRegex(ValueError, "PTO_EXPECTED_15_NOTECHS"):
            module.render_guide(self.aircraft[0], self.notechs[:-1] + [self.notechs[0]])


if __name__ == "__main__":
    unittest.main()
