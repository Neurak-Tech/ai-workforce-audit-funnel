/**
 * AI Hive WhatsApp API — Tracking Library
 * Domain: connect.theaihive.space/whatsapp-api
 * Pixel ID: 4491975310948346
 *
 * Events: ViewContent, CompleteRegistration, InitiateCheckout, Purchase
 * Each event fires as BOTH a browser pixel call AND a server-side CAPI call
 * sharing the same event_id for deduplication.
 *
 * DEBUG MODE: Set ?debug=1 in the URL to see console logs.
 */

(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  var CONFIG = {
    PIXEL_ID: '4491975310948346',
    CAPI_ENDPOINT: '/api/track', // Serverless function endpoint for CAPI proxy
    DOMAIN: 'connect.theaihive.space',
    PAGE_PATH: '/whatsapp-api',
    CURRENCY: 'INR',
    DEBUG: /[?&]debug=1/.test(window.location.search),
    PLANS: {
      monthly:  { name: 'Monthly',  value: 472  },
      quarterly:{ name: '3 Months', value: 1345 },
      biannual: { name: '6 Months', value: 2549 },
      yearly:   { name: '1 Year',   value: 4814 },
    },
  };

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  function log() {
    if (CONFIG.DEBUG) {
      console.log.apply(console, ['[AIHive Tracking]'].concat([].slice.call(arguments)));
    }
  }

  function warn() {
    if (CONFIG.DEBUG) {
      console.warn.apply(console, ['[AIHive Tracking]'].concat([].slice.call(arguments)));
    }
  }

  /**
   * Generate a unique event_id for browser/CAPI deduplication.
   */
  function generateEventId() {
    var timestamp = Math.floor(Date.now() / 1000);
    var random = Math.random().toString(36).substring(2, 10);
    return 'evt_' + timestamp + '_' + random;
  }

  /**
   * SHA-256 hash a string (for PII hashing per Meta CAPI requirements).
   * Email: lowercase + trim before hashing.
   * Phone: E.164 digits only (strip +, spaces, dashes) before hashing.
   */
  function sha256Hash(value) {
    if (!value) return Promise.resolve(null);
    var normalized;
    if (value.indexOf('@') !== -1) {
      // Email: lowercase + trim
      normalized = value.toLowerCase().trim();
    } else {
      // Phone: digits only
      normalized = value.replace(/[^0-9]/g, '');
    }
    if (!normalized) return Promise.resolve(null);
    var encoder = new TextEncoder();
    var data = encoder.encode(normalized);
    return crypto.subtle.digest('SHA-256', data).then(function (hashBuffer) {
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function getUrlParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getUserPseudoId() {
    var pseudoId = localStorage.getItem('aihive_user_pseudo_id');
    if (!pseudoId) {
      pseudoId = 'usr_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('aihive_user_pseudo_id', pseudoId);
    }
    return pseudoId;
  }

  function getFacebookIds() {
    var fbc = getCookie('_fbc');
    if (!fbc) {
      var fbclid = getUrlParam('fbclid');
      if (fbclid) {
        fbc = 'fb.1.' + Date.now() + '.' + fbclid;
        document.cookie = '_fbc=' + fbc + '; domain=.' + CONFIG.DOMAIN + '; path=/; max-age=90d';
      }
    }
    var fbp = getCookie('_fbp') || null;
    return { fbc: fbc, fbp: fbp };
  }

  function getPageUrl() {
    return window.location.origin + window.location.pathname;
  }

  // ============================================================
  // DATA LAYER
  // ============================================================

  window.dataLayer = window.dataLayer || [];

  // ============================================================
  // CAPI — SERVER-SIDE EVENT SENDER (via serverless proxy)
  // ============================================================

  /**
   * Send an event to Meta Conversions API via the serverless proxy.
   * The proxy reads CAPI_ACCESS_TOKEN from environment variables.
   */
  function sendCAPIEvent(eventName, customData, eventId, userData) {
    var payload = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: getPageUrl(),
      custom_data: customData,
      user_data: userData || {},
    };

    fetch(CONFIG.CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) {
        warn('CAPI ' + eventName + ' failed:', res.status);
      } else {
        log('CAPI ' + eventName + ' sent:', eventId);
      }
    }).catch(function (err) {
      warn('CAPI ' + eventName + ' error:', err);
    });
  }

  // ============================================================
  // EVENT: VIEWCONTENT
  // Trigger: Page load of /whatsapp-api
  // ============================================================

  function trackViewContent() {
    var eventId = generateEventId();
    var { fbc, fbp } = getFacebookIds();

    // Browser pixel event via dataLayer (GTM consumes this)
    window.dataLayer.push({
      event: 'ViewContent',
      event_id: eventId,
      content_type: 'product',
      content_name: 'WhatsApp API',
      content_ids: ['whatsapp-api'],
      currency: CONFIG.CURRENCY,
    });

    // CAPI event
    sendCAPIEvent('ViewContent', {
      content_type: 'product',
      content_name: 'WhatsApp API',
      content_ids: ['whatsapp-api'],
      currency: CONFIG.CURRENCY,
    }, eventId, {
      fbc: fbc,
      fbp: fbp,
      client_user_agent: navigator.userAgent,
    });

    log('ViewContent fired:', eventId);
  }

  // ============================================================
  // EVENT: COMPLETEREGISTRATION
  // Trigger: User completes signup/registration form
  // NOTE: This happens on theaihive.io — call from that domain's
  // registration success handler. Included here for completeness.
  // ============================================================

  function trackCompleteRegistration(params) {
    params = params || {};
    var eventId = generateEventId();
    var email = params.email || null;
    var phone = params.phone || null;
    var plan = params.plan || null;
    var method = params.method || null;

    // Hash PII for CAPI
    Promise.all([
      email ? sha256Hash(email) : Promise.resolve(null),
      phone ? sha256Hash(phone) : Promise.resolve(null),
    ]).then(function (hashes) {
      var hashedEmail = hashes[0];
      var hashedPhone = hashes[1];
      var { fbc, fbp } = getFacebookIds();

      // Browser pixel event
      window.dataLayer.push({
        event: 'CompleteRegistration',
        event_id: eventId,
        content_name: 'Account Registration',
        currency: CONFIG.CURRENCY,
        value: 0,
        plan: plan,
        method: method,
      });

      // CAPI event
      sendCAPIEvent('CompleteRegistration', {
        content_name: 'Account Registration',
        status: 'completed',
        currency: CONFIG.CURRENCY,
        value: 0,
      }, eventId, {
        em: hashedEmail,
        ph: hashedPhone,
        fbc: fbc,
        fbp: fbp,
        client_user_agent: navigator.userAgent,
      });

      log('CompleteRegistration fired:', eventId);
    });
  }

  // ============================================================
  // EVENT: INITIATECHECKOUT
  // Trigger: User clicks "Buy Now" / CTA button on this page
  // ============================================================

  function trackInitiateCheckout(params) {
    params = params || {};
    var eventId = generateEventId();
    var plan = params.plan || 'monthly';
    var planData = CONFIG.PLANS[plan] || CONFIG.PLANS.monthly;
    var email = params.email || null;
    var phone = params.phone || null;

    // Hash PII for CAPI
    Promise.all([
      email ? sha256Hash(email) : Promise.resolve(null),
      phone ? sha256Hash(phone) : Promise.resolve(null),
    ]).then(function (hashes) {
      var hashedEmail = hashes[0];
      var hashedPhone = hashes[1];
      var { fbc, fbp } = getFacebookIds();

      // Browser pixel event
      window.dataLayer.push({
        event: 'InitiateCheckout',
        event_id: eventId,
        content_type: 'product',
        content_name: planData.name + ' Plan',
        content_ids: [plan],
        currency: CONFIG.CURRENCY,
        value: planData.value,
        plan: plan,
      });

      // CAPI event
      sendCAPIEvent('InitiateCheckout', {
        content_type: 'product',
        content_name: planData.name + ' Plan',
        content_ids: [plan],
        value: planData.value,
        currency: CONFIG.CURRENCY,
      }, eventId, {
        em: hashedEmail,
        ph: hashedPhone,
        fbc: fbc,
        fbp: fbp,
        client_user_agent: navigator.userAgent,
      });

      log('InitiateCheckout fired:', eventId, 'plan:', plan, 'value:', planData.value);
    });
  }

  // ============================================================
  // EVENT: PURCHASE
  // Trigger: Payment success on theaihive.io
  // NOTE: This happens on theaihive.io — call from that domain's
  // payment success handler. Included here for completeness.
  // ============================================================

  function trackPurchase(params) {
    params = params || {};
    var eventId = generateEventId();
    var plan = params.plan || 'monthly';
    var planData = CONFIG.PLANS[plan] || CONFIG.PLANS.monthly;
    var purchaseValue = params.value || planData.value;
    var orderId = params.order_id || null;
    var email = params.email || null;
    var phone = params.phone || null;

    // Hash PII for CAPI
    Promise.all([
      email ? sha256Hash(email) : Promise.resolve(null),
      phone ? sha256Hash(phone) : Promise.resolve(null),
    ]).then(function (hashes) {
      var hashedEmail = hashes[0];
      var hashedPhone = hashes[1];
      var { fbc, fbp } = getFacebookIds();

      // Browser pixel event
      window.dataLayer.push({
        event: 'Purchase',
        event_id: eventId,
        content_type: 'product',
        content_name: planData.name + ' Plan',
        content_ids: [plan],
        currency: CONFIG.CURRENCY,
        value: purchaseValue,
        order_id: orderId,
        plan: plan,
      });

      // CAPI event
      sendCAPIEvent('Purchase', {
        content_type: 'product',
        content_name: planData.name + ' Plan',
        content_ids: [plan],
        value: purchaseValue,
        currency: CONFIG.CURRENCY,
        order_id: orderId,
      }, eventId, {
        em: hashedEmail,
        ph: hashedPhone,
        fbc: fbc,
        fbp: fbp,
        client_user_agent: navigator.userAgent,
      });

      log('Purchase fired:', eventId, 'plan:', plan, 'value:', purchaseValue);
    });
  }

  // ============================================================
  // AUTO-TRIGGER: ViewContent on page load
  // ============================================================

  if (window.location.pathname === CONFIG.PAGE_PATH || window.location.pathname === '/whatsapp-api/index.html') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', trackViewContent);
    } else {
      trackViewContent();
    }
  }

  // ============================================================
  // EXPORTS
  // ============================================================

  window.AIHiveTracking = {
    trackViewContent: trackViewContent,
    trackCompleteRegistration: trackCompleteRegistration,
    trackInitiateCheckout: trackInitiateCheckout,
    trackPurchase: trackPurchase,
    generateEventId: generateEventId,
    sha256Hash: sha256Hash,
    getConfig: function () { return Object.assign({}, CONFIG); },
  };

  log('Tracking library loaded. Debug mode:', CONFIG.DEBUG ? 'ON' : 'OFF');
  log('ViewContent will fire on page load.');
})();
