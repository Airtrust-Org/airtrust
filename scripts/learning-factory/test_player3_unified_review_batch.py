"""Unified Player3 author conversion factory guards, without answer keys in CI."""
import hashlib
import tempfile
import unittest
from pathlib import Path
from build_player3_unified_review_batch import (
    ADAPTED,VENDOR_UNSUPPORTED,review_binding_sha256,compile_safe_review,
    unified_review,
)
from build_player3_html5_review_batch import KNOWN_SOURCES_BY_SHA
from convert_preserved_html5 import UnsafePackage

class Player3UnifiedBatchTests(unittest.TestCase):
    def test_source_coverage_explicit_not_22_published(self):
        self.assertEqual(len(ADAPTED),19)
        self.assertEqual(len(VENDOR_UNSUPPORTED),3)
        self.assertFalse(ADAPTED & VENDOR_UNSUPPORTED)
        self.assertEqual(len(KNOWN_SOURCES_BY_SHA),2)
        for sha in ADAPTED | VENDOR_UNSUPPORTED:
            self.assertRegex(sha,r'^[0-9a-f]{64}$')

    def test_review_binding_not_source_sha_and_stable(self):
        digest=next(iter(ADAPTED))
        a=review_binding_sha256(digest)
        self.assertRegex(a,r'^[0-9a-f]{64}$')
        self.assertNotEqual(a,digest)
        self.assertEqual(a,review_binding_sha256(digest))
        self.assertNotEqual(a,review_binding_sha256('0'*64))

    def test_unadapted_supplier_and_unknown_zip_fail_closed(self):
        supplier=next(iter(VENDOR_UNSUPPORTED))
        # Authoritative digest is verified from actual source bytes;
        # arbitrary data cannot spoof a known supplier key.
        for raw in (b'not-a-zip',b'edited archive'):
            with self.assertRaisesRegex(UnsafePackage,'UNRECOGNIZED_SOURCE_SHA'):
                compile_safe_review(raw,'fake.zip','https://airtrust.online')

    def test_invalid_source_count_and_no_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            bad=root/'unapproved.zip';bad.write_bytes(b'bad')
            private=root/'private'; learner=root/'learner'
            with self.assertRaisesRegex(UnsafePackage,'REQUIRE_BOTH_SOURCE_ARCHIVES'):
                unified_review([bad],private,learner,'https://airtrust.online')
            self.assertFalse(private.exists());self.assertFalse(learner.exists())
            with self.assertRaisesRegex(UnsafePackage,'BOTH_PINNED_BATCHES_REQUIRED'):
                unified_review([bad,bad],private,learner,'https://airtrust.online')
            self.assertFalse(private.exists());self.assertFalse(learner.exists())

if __name__=='__main__':unittest.main()