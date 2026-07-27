// Minimal SCORM 1.2 API stub for the test fixture.
// This runs *inside* the main launch iframe (not the #scorm-frame).
// The real AirTrust launch page provides the full API.
// This file exists only for standalone testing of the fixture outside AirTrust.
(function() {
  'use strict';

  var cmi = {
    location: '',
    suspend_data: '',
    lesson_status: 'incomplete',
    lesson_location: '',
    score: { raw: '', min: '', max: '' },
    core: {
      lesson_status: 'incomplete',
      lesson_location: '',
      score: { raw: '', min: '', max: '' }
    }
  };

  var lastError = '0';
  var lastErrorString = 'No error';

  window.API = {
    LMSInitialize: function() { return 'true'; },
    LMSFinish: function() { return 'true'; },
    LMSGetValue: function(key) {
      if (key === 'cmi.core.lesson_status') return cmi.core.lesson_status;
      if (key === 'cmi.core.lesson_location') return cmi.core.lesson_location;
      if (key === 'cmi.core.score.raw') return cmi.core.score.raw;
      if (key === 'cmi.suspend_data') return cmi.suspend_data;
      if (key === 'cmi.location') return cmi.location;
      return '';
    },
    LMSSetValue: function(key, value) {
      if (key === 'cmi.core.lesson_status') cmi.core.lesson_status = value;
      else if (key === 'cmi.core.lesson_location') cmi.core.lesson_location = value;
      else if (key === 'cmi.core.score.raw') cmi.core.score.raw = value;
      else if (key === 'cmi.suspend_data') cmi.suspend_data = value;
      else if (key === 'cmi.location') cmi.location = value;
      return 'true';
    },
    LMSCommit: function() {
      // In real AirTrust, this sends a postMessage to the parent.
      // For standalone fixture testing, it's a no-op.
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'lms:progress',
          matriculaId: '__FIXTURE__',
          location: cmi.core.lesson_location || cmi.location,
          progresso_pct: cmi.core.score.raw || null
        }, '*');
      }
      return 'true';
    },
    LMSGetLastError: function() { return lastError; },
    LMSGetErrorString: function() { return lastErrorString; },
    LMSGetDiagnostic: function() { return ''; }
  };

  // Fire SCORM 1.2 discovery: some content uses this pattern
  if (window.parent && window.parent !== window) {
    window.parent.API = window.API;
  }
})();
