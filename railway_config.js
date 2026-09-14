// A2 Railway URL: replace the placeholder after creating the service.
window.USE_RAILWAY = true;
window.RAILWAY_SERVER_URL = (window.A2_CONFIG && (window.A2_CONFIG.RAILWAY_SERVER_URL || window.A2_CONFIG.ROSTER_SERVICE_URL))
  || window.RAILWAY_SERVER_URL
  || 'https://a2-live-worksheets-production.up.railway.app';
