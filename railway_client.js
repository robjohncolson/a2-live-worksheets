// Railway Server Integration for Algebra 2 Turbo Mode
  // This replaces direct Supabase calls with Railway server calls
  // Updated to write peer data to IndexedDB peerCache store

  // Configuration
  const RAILWAY_SERVER_URL = window.RAILWAY_SERVER_URL || (window.A2_CONFIG && (window.A2_CONFIG.RAILWAY_SERVER_URL || window.A2_CONFIG.ROSTER_SERVICE_URL)) || 'https://a2-live-worksheets-production.up.railway.app';
  const USE_RAILWAY = window.USE_RAILWAY || false;

  // WebSocket connection
  let ws = null;
  let wsReconnectTimer = null;
  let wsConnected = false;
  let wsPingInterval = null;

  // Initialize Railway connection
  function initializeRailwayConnection() {
      if (!USE_RAILWAY) {
          console.log('Railway server disabled, using direct Supabase');
          return false;
      }

      // Skip if in LAN or offline mode - no point trying Railway
      if (typeof NetworkManager !== 'undefined' && NetworkManager.currentTier !== 'turbo') {
          console.log('🚂 Skipping Railway init - network tier is', NetworkManager.currentTier);
          return false;
      }

      console.log('🚂 Initializing Railway server connection...');

      // Capture original functions if not already captured
      if (typeof window.originalPushAnswer !== 'function' && typeof window.pushAnswerToSupabase === 'function') {
          window.originalPushAnswer = window.pushAnswerToSupabase;
      }
      if (typeof window.originalPullPeerData !== 'function' && typeof window.pullPeerDataFromSupabase === 'function') {
          window.originalPullPeerData = window.pullPeerDataFromSupabase;
      }

      // Test REST API connection
      fetch(`${RAILWAY_SERVER_URL}/health`)
          .then(res => res.json())
          .then(data => {
              console.log('✅ Railway server connected:', data);
              connectWebSocket();
          })
          .catch(error => {
              console.error('❌ Railway server unavailable:', error);
              console.log('Falling back to direct Supabase');
          });

      return true;
  }

  // Guests are retired (2026-06-25): evict any stale cross-app guest flag on load so a
  // device that used guest before this deploy isn't treated as a guest here — no
  // "Working as guest" banner over the sign-in wall, no guest field-prefill in the
  // worksheet's restoreSavedUser/getUsername. The Desk boot clears it too; this covers
  // the worksheets + study guide that load this file.
  try { localStorage.removeItem('a2_guest_active'); } catch (e) {}

  // Stable, persisted "Guest_Fruit_Animal" identity for signed-out students, so
  // their work is tracked under one readable, migratable name (not a random
  // Player####). Generated once per device and kept in localStorage.
  var GUEST_KEY = 'a2_guest_identity';
  var GUEST_FRUITS = ['Cherry','Lemon','Mango','Plum','Kiwi','Peach','Apple','Banana','Coconut','Apricot','Date','Fig','Grape','Melon','Olive','Papaya','Guava','Lime'];
  var GUEST_ANIMALS = ['Tiger','Panda','Fox','Goat','Otter','Hawk','Wolf','Bear','Lynx','Moose','Heron','Bison','Crane','Seal','Newt','Vole','Robin','Koala'];
  function getGuestIdentity() {
      // Validate the cached value (must look like a Guest_ alias) so a corrupted /
      // foreign value can't masquerade as the guest identity — matches the quiz's
      // lib/guest-identity.js and the Desk inline copy.
      try { var ex = localStorage.getItem(GUEST_KEY); if (ex && /^Guest_/i.test(ex)) return ex; } catch (e) {}
      function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
      var id = 'Guest_' + pick(GUEST_FRUITS) + '_' + pick(GUEST_ANIMALS);
      try { localStorage.setItem(GUEST_KEY, id); return id; } catch (e) { return 'Guest_Anon'; }
  }
  window.getGuestIdentity = getGuestIdentity;

  // Cross-app guest indicator (red-team: shared-machine misattribution). When
  // working as a guest (the shared 'a2_guest_active' flag is set and there's
  // no roster session), show a persistent top banner so a DIFFERENT student on a
  // shared device immediately sees they're using someone else's guest alias (the
  // worksheet wall + getUsername otherwise lift silently). Re-checks on sign-in /
  // guest-flag changes from any tab via the storage event. Loaded by every
  // worksheet (not the Desk, which has its own #menu-identity chip).
  function _apGuestActive() {
      return false;   // guests retired (2026-06-25): the guest banner + field-lock never trigger
  }
  function _apHasRoster() {
      try { return !!(window.rosterClient && typeof window.rosterClient.current === 'function' && window.rosterClient.current()); } catch (e) { return false; }
  }
  function _apRenderGuestBanner() {
      var existing = document.getElementById('ap-guest-banner');
      if (!(_apGuestActive() && !_apHasRoster())) {
          if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
          return;
      }
      if (!document.body) return;
      var alias = getGuestIdentity();
      if (existing) {
          var lbl = existing.querySelector('.ap-guest-alias');
          if (lbl) lbl.textContent = alias;
          return;
      }
      var bar = document.createElement('div');
      bar.id = 'ap-guest-banner';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100000;'
          + 'background:#fff3cd;color:#5c4400;border-bottom:1px solid #e0c200;'
          + 'font:12px Geneva,Verdana,sans-serif;padding:5px 12px;text-align:center;';
      var b = document.createElement('b'); b.className = 'ap-guest-alias'; b.textContent = alias;
      var a = document.createElement('a');
      a.href = 'desk.html'; a.textContent = 'Sign in at the Desk';
      a.style.cssText = 'color:#5c4400;font-weight:bold';
      bar.appendChild(document.createTextNode('🧑 Working as guest '));
      bar.appendChild(b);
      bar.appendChild(document.createTextNode(' — not you? '));
      bar.appendChild(a);
      document.body.appendChild(bar);
  }
  window._apRenderGuestBanner = _apRenderGuestBanner;
  // When working as a guest, reflect the alias into the legacy worksheet username
  // field (overriding any stale autofill left by a previous user on this device,
  // e.g. a real "date_tiger") and lock it — for a guest the alias is authoritative.
  function _apReflectGuestField() {
      try {
          var uf = document.getElementById('worksheetUsername');
          if (uf && _apGuestActive() && !_apHasRoster()) {
              var alias = getGuestIdentity();
              if (uf.value !== alias) uf.value = alias;
              uf.readOnly = true; uf.title = 'Working as guest';
          }
      } catch (e) {}
  }
  function _apGuestRefresh() { try { _apRenderGuestBanner(); } catch (e) {} _apReflectGuestField(); }
  function _apInitGuestBanner() {
      _apGuestRefresh();
      // Re-run after the worksheet's own restoreSavedUser()/hydration (which fills
      // the username field from localStorage on load) so the guest alias wins it.
      try { setTimeout(_apGuestRefresh, 300); setTimeout(_apGuestRefresh, 1500); } catch (e) {}
      try {
          window.addEventListener('storage', function (e) {
              if (!e || e.key === null || e.key === 'a2_guest_active'
                  || e.key === 'a2_roster.v1' || e.key === GUEST_KEY) {
                  _apGuestRefresh();
              }
          });
      } catch (e) {}
  }
  if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _apInitGuestBanner);
      else _apInitGuestBanner();
  }

  // Resolve the username to announce for presence / attribute work to. Falls
  // through: explicit globals -> shared rosterClient identity -> stable guest
  // identity. So a signed-out student still appears (tagged Guest_) and their
  // work is tracked under one migratable name.
  // 2026-08-19: the ROSTER identity is the canonical presence name on every
  // surface (it used to come AFTER the typed legacy name here, while the Desk
  // announced the roster name — so one student showed up several times in
  // "Online Now", differently capitalized). The Desk's list also folds
  // case-variants of one identity into a single row.
  function _presenceUsername() {
      try {
          if (window.rosterClient && typeof window.rosterClient.current === 'function') {
              var who = window.rosterClient.current();
              if (who && who.username) return String(who.username).trim();
          }
      } catch (e) {}
      var u = (window.currentUsername || localStorage.getItem('consensusUsername') || '').trim();
      // Guests are retired (2026-06-25): never announce a Guest_ alias (e.g. a stale
      // consensusUsername left by an old guest session) into presence.
      if (u && !/^Guest_/i.test(u)) return u;
      // No getGuestIdentity fallback — a signed-out visitor gets no presence identity,
      // so they never appear as Guest_ to the class.
      return '';
  }

  // Which app surface this page is, so the Desk's "Online Now" list can label
  // WHERE each classmate is (a live worksheet vs the study guide vs ...). This
  // copy is loaded by worksheets, the edgar driller, the MIT worksheets, and the
  // study guide. Derived purely from the URL — no per-page global needed.
  function _presenceSurface() {
      try {
          var file = ((location.pathname || '').toLowerCase().split('/').pop()) || '';
          var m = file.match(/^u(\d+)_lesson([\d.\-]+)_live\.html$/);
          if (m) return { surface: 'worksheet', lesson: 'U' + m[1] + ' L' + m[2] };
          if (file === 'edgar_u6_conceptual_driller_live.html') return { surface: 'edgar', lesson: 'U6 driller' };
          if (/^mit_ocw_/.test(file)) return { surface: 'mit', lesson: 'MIT lecture' };
          if (file === 'study_guide_diagnostic.html') return { surface: 'study-guide', lesson: null };
          if (file === 'desk.html') return { surface: 'desk', lesson: null };
          return { surface: 'other', lesson: null };
      } catch (e) { return { surface: 'other', lesson: null }; }
  }

  // Connect to WebSocket for real-time updates
  function connectWebSocket() {
      if (!USE_RAILWAY) return;

      const wsUrl = RAILWAY_SERVER_URL.replace('https://', 'wss://').replace('http://', 'ws://');

      try {
          ws = new WebSocket(wsUrl);

          ws.onopen = () => {
              console.log('🔌 WebSocket connected to Railway server');
              wsConnected = true;

              // Enable turbo mode when WebSocket connects
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: true }
              }));
              console.log('🏁 Turbo mode enabled via Railway connection');

              // Clear any reconnect timer
              if (wsReconnectTimer) {
                  clearTimeout(wsReconnectTimer);
                  wsReconnectTimer = null;
              }

              // Send ping every 30 seconds to keep connection alive
              if (wsPingInterval) clearInterval(wsPingInterval);
              wsPingInterval = setInterval(() => {
                  if (ws.readyState === WebSocket.OPEN) {
              const username = _presenceUsername();
              // Regular ping for latency
              ws.send(JSON.stringify({ type: 'ping' }));
              // Presence heartbeat
              if (username) {
                ws.send(JSON.stringify({ type: 'heartbeat', username }));
              }
                  }
              }, 30000);

          // Identify with current username as soon as connected
          const username = _presenceUsername();
          if (username && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'identify', username, location: _presenceSurface() }));
          }
          };

          ws.onmessage = (event) => {
              try {
                  const data = JSON.parse(event.data);
                  handleWebSocketMessage(data);
              } catch (error) {
                  console.error('WebSocket message parse error:', error);
              }
          };

          ws.onclose = () => {
              console.log('WebSocket disconnected');
              wsConnected = false;

              // Disable turbo mode when WebSocket disconnects
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: false }
              }));
              console.log('🛑 Turbo mode disabled due to WebSocket disconnect');

              if (wsPingInterval) {
                  clearInterval(wsPingInterval);
                  wsPingInterval = null;
              }

              // Attempt to reconnect after 5 seconds
              wsReconnectTimer = setTimeout(() => {
                  console.log('Attempting WebSocket reconnection...');
                  connectWebSocket();
              }, 5000);
          };

          ws.onerror = (error) => {
              console.error('WebSocket error:', error);
              wsConnected = false;

              // Disable turbo mode when WebSocket errors
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: false }
              }));
              console.log('🛑 Turbo mode disabled due to WebSocket error');
          };

      } catch (error) {
          console.error('Failed to create WebSocket:', error);
          wsConnected = false;
      }
  }

  // Handle incoming WebSocket messages
  function handleWebSocketMessage(data) {
      switch (data.type) {
          case 'connected':
              console.log('✅ WebSocket:', data.message);
              // Also enable turbo mode when receiving connected message
              window.dispatchEvent(new CustomEvent('turboModeChanged', {
                  detail: { enabled: true }
              }));
              break;

      case 'presence_snapshot': {
        // Initialize online set
        window.onlineUsers = new Set(data.users || []);
        // Inform UI/sprite system
        window.dispatchEvent(new CustomEvent('presenceChanged', { detail: { users: Array.from(window.onlineUsers) } }));
        break;
      }

      case 'user_online': {
        if (!window.onlineUsers) window.onlineUsers = new Set();
        window.onlineUsers.add(data.username);
        window.dispatchEvent(new CustomEvent('presenceChanged', { detail: { users: Array.from(window.onlineUsers) } }));
        break;
      }

      case 'user_offline': {
        if (!window.onlineUsers) window.onlineUsers = new Set();
        window.onlineUsers.delete(data.username);
        window.dispatchEvent(new CustomEvent('presenceChanged', { detail: { users: Array.from(window.onlineUsers) } }));
        break;
      }

          case 'answer_submitted':
              if (!data?.username || !data?.question_id || data.answer_value === undefined || data.timestamp === undefined) {
                  console.error('[WebSocket] Invalid or incomplete answer_submitted data received:', data);
                  break;
              }
              console.log(`📨 Received answer for ${data.question_id}, dispatching 'peer:answer' event.`);

              // Write to IDB peerCache for durability
              if (typeof waitForStorage === 'function') {
                  waitForStorage().then(storage => {
                      storage.set('peerCache', [data.username, data.question_id], {
                          peerUsername: data.username,
                          questionId: data.question_id,
                          value: data.answer_value,
                          timestamp: data.timestamp,
                          seenAt: Date.now()
                      }).catch(e => console.warn('Failed to cache peer answer in IDB:', e));
                  }).catch(e => console.warn('Storage not ready for peer answer caching:', e));
              }

              window.dispatchEvent(new CustomEvent('peer:answer', {
                  detail: {
                      username: data.username,
                      question_id: data.question_id,
                      answer_value: data.answer_value,
                      timestamp: data.timestamp
                  }
              }));
              break;

          case 'batch_submitted':
              console.log(`📦 Batch update: ${data.count} answers`);
              // Pull latest data from server
              pullPeerDataFromRailway();
              break;

          case 'realtime_update':
              console.log('🔄 Real-time update:', data.event);
              // Handle Supabase real-time updates relayed through server
              break;

          case 'pong':
              // Keep-alive response
              break;

          default:
              console.log('Unknown WebSocket message type:', data.type);
      }
  }

  // Railway-enhanced answer submission
  async function submitAnswerViaRailway(username, questionId, answerValue, timestamp) {
      // Guests are retired (2026-06-25): no guest attribution. A signed-out submission
      // has no identity to attribute work to, so drop it rather than mint a Guest_ alias.
      if (!username || /^Guest_/i.test(username)) return false;
      const fallbackSubmit = typeof window.originalPushAnswer === 'function'
          ? window.originalPushAnswer
          : null;
      if (!USE_RAILWAY) {
          // Fall back to direct Supabase
          return fallbackSubmit ? fallbackSubmit(username, questionId, answerValue, timestamp) : false;
      }

      try {
          const payload = {
              username,
              question_id: questionId,
              answer_value: answerValue,
              timestamp: timestamp
          };
          console.log(`[Railway] submit ${questionId}: payload ready (${typeof answerValue})`);
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/submit-answer`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (result.success) {
              console.log(`✅ Answer synced via Railway (broadcast to ${result.broadcast} clients)`);
              return true;  // SUCCESS - Don't fall back!
          } else {
              throw new Error(result.error || 'Railway sync failed');
          }
      } catch (error) {
          console.error('Railway submit failed, falling back to direct Supabase:', error);
          // Only fall back if Railway actually failed
          return fallbackSubmit ? fallbackSubmit(username, questionId, answerValue, timestamp) : false;
      }
  }

  // Pull peer data from Railway server
  async function pullPeerDataFromRailway(since = 0) {
      if (!USE_RAILWAY) {
          // Fall back to direct Supabase
          return pullPeerDataFromSupabase();
      }

      try {
          const url = since > 0
              ? `${RAILWAY_SERVER_URL}/api/peer-data?since=${since}`
              : `${RAILWAY_SERVER_URL}/api/peer-data`;

          const response = await fetch(url);
          const result = await response.json();

          console.log(`📥 Pulled ${result.filtered} answers from Railway (${result.cached ? 'cached' : 'fresh'})`);

          // Convert to local storage format
          const peerData = {};
          result.data.forEach(answer => {
              if (!peerData[answer.username]) {
                  peerData[answer.username] = { answers: {} };
              }
              peerData[answer.username].answers[answer.question_id] = {
                  value: answer.answer_value,
                  timestamp: answer.timestamp
              };
          });

          // Update local storage (for backward compatibility)
          let currentUser = null;
          try {
              currentUser = localStorage.getItem('consensusUsername');
          } catch (e) {
              // localStorage may be blocked
          }

          // Also try to get from IDB
          if (!currentUser && typeof waitForStorage === 'function') {
              try {
                  const storage = await waitForStorage();
                  currentUser = await storage.getMeta('username');
              } catch (e) {
                  console.warn('Could not get username from IDB');
              }
          }

          for (const [username, userData] of Object.entries(peerData)) {
              if (username !== currentUser) {
                  // Write to localStorage for backward compatibility
                  try {
                      const key = `answers_${username}`;
                      const existing = JSON.parse(localStorage.getItem(key) || '{}');
                      Object.assign(existing, userData.answers);
                      localStorage.setItem(key, JSON.stringify(existing));
                  } catch (e) {
                      // localStorage may be blocked
                  }

                  // Write to IDB peerCache for durability
                  if (typeof waitForStorage === 'function') {
                      try {
                          const storage = await waitForStorage();
                          for (const [questionId, answer] of Object.entries(userData.answers)) {
                              await storage.set('peerCache', [username, questionId], {
                                  peerUsername: username,
                                  questionId,
                                  value: answer.value,
                                  timestamp: answer.timestamp,
                                  seenAt: Date.now()
                              });
                          }
                      } catch (e) {
                          console.warn('Failed to write peer data to IDB:', e);
                      }
                  }
              }
          }

          // Update timestamp display
          if (typeof updatePeerDataTimestamp === 'function') {
              updatePeerDataTimestamp();
          }

          return peerData;

      } catch (error) {
          console.error('Railway pull failed:', error);
          // Fall back to direct Supabase
          return pullPeerDataFromSupabase();
      }
  }

  // Get question statistics from Railway
  async function getQuestionStats(questionId) {
      if (!USE_RAILWAY) return null;

      try {
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/question-stats/${questionId}`);
          const stats = await response.json();

          console.log(`📊 Stats for ${questionId}:`, stats);
          return stats;

      } catch (error) {
          console.error('Failed to get question stats:', error);
          return null;
      }
  }

  // Batch submit answers via Railway
  async function batchSubmitViaRailway(answers) {
      if (!USE_RAILWAY) {
          // Fall back to direct batch push
          return batchPushAnswersToSupabase(answers);
      }

      try {
          const normalized = answers.map(answer => ({
              username: answer.username,
              question_id: answer.question_id,
              answer_value: answer.answer_value,
              timestamp: typeof answer.timestamp === 'string'
                  ? new Date(answer.timestamp).getTime()
                  : answer.timestamp
          }));
          console.log(`[Railway] batch submit: ${normalized.length} answers`);
          const response = await fetch(`${RAILWAY_SERVER_URL}/api/batch-submit`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ answers: normalized })
          });

          const result = await response.json();

          if (result.success) {
              console.log(`✅ Batch synced ${result.count} answers via Railway`);
              return result.count;
          } else {
              throw new Error(result.error);
          }
      } catch (error) {
          console.error('Railway batch submit failed:', error);
          // Fall back to direct Supabase
          return batchPushAnswersToSupabase(answers);
      }
  }

  // Override existing functions when Railway is enabled
  if (USE_RAILWAY) {
      console.log('🚂 Railway mode enabled - overriding sync functions');

      // NOTE: Original functions are now captured inside initializeRailwayConnection()
      // to avoid race conditions with index.html loading

      // Override with Railway-enhanced versions
      window.pushAnswerToSupabase = submitAnswerViaRailway;
      window.pullPeerDataFromSupabase = () => pullPeerDataFromRailway();

      // Add new Railway-specific functions
      window.getQuestionStats = getQuestionStats;
      window.batchSubmitViaRailway = batchSubmitViaRailway;

      // Initialize on page load
      document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
              initializeRailwayConnection();
          }, 1000); // Give Supabase time to initialize first
      });
  }

  // Export functions for external use
  window.railwayClient = {
      initialize: initializeRailwayConnection,
      connectWebSocket,
      submitAnswer: submitAnswerViaRailway,
      pullPeerData: pullPeerDataFromRailway,
      getStats: getQuestionStats,
      batchSubmit: batchSubmitViaRailway,
      isConnected: () => wsConnected
  };

  console.log('🚂 Railway client loaded. Set USE_RAILWAY=true to enable.');