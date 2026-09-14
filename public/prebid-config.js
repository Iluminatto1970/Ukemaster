// public/prebid-config.js
window.pbjs = window.pbjs || {};
window.pbjs.que = window.pbjs.que || [];

window.pbjs.que.push(function() {
  window.pbjs.setConfig({
    bidderTimeout: 1000,
    priceGranularity: 'medium'
  });
});

console.log('Prebid.js configurado.');
