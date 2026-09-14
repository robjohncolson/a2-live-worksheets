(function(window){
  window.AP_STATS_STUDY_GUIDE_USERNAMES = window.AP_STATS_STUDY_GUIDE_USERNAMES || [];
  window.AP_STATS_STUDY_GUIDE_USER_SOURCE = window.AP_STATS_STUDY_GUIDE_USER_SOURCE || {
    url: 'https://lrsl-driller-production.up.railway.app/api/users'
  };
  // No bundled credentials: diagnostic progress stays local without A2 config.
  window.AP_STATS_STUDY_GUIDE_SUPABASE =
    (window.A2_CONFIG && window.A2_CONFIG.STUDY_GUIDE_SYNC) || null;
})(typeof window !== 'undefined' ? window : globalThis);
