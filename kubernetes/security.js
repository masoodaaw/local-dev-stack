'use strict';

function isSameOriginMutation(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host || request.headers['content-type'] !== 'application/json') return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host === host && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isLabPod(name) {
  return typeof name === 'string' && /^(gateway|loadbalancer|cdn|ui|api|database|traffic)-/.test(name);
}

module.exports = { isSameOriginMutation, isLabPod };
