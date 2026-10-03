# Script guard tests

`guard-package-references-scorm-source-maps.test.mjs` uses a disposable local Git repository to verify that the package-reference guard accepts SCORM packages without source maps and rejects tracked `.map` assets or manifest references to them.
