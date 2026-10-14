"""CI entrypoint: picked up by the existing test_*native*.py content gate.

Imports the Front A test classes without editing shared GitHub workflows.
This runs the de-key tests against the exact factory code checked in the PR.
"""
from test_prepare_player3_learner_review import Player3Html5ReviewTests
from test_build_player3_html5_review_batch import Player3BatchReviewTests

from test_standard_journey_bridge_review import StandardJourneyBridgeTests
