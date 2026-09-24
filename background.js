import { knownAdServers } from "./known-ad-servers.js";

const MAX_REQUESTS = 1000;
const REQUESTS_KEY = "capturedRequests";
const CUSTOM_SERVERS_KEY = "customAdServers";
const TRACKER_PATTERN =
  /(^|[.-])(track|tracking|tracker|pixel|beacon|fingerprint|analytics)([.-]|$)/i;
const customAdServers = new Set();
let writeQueue = Promise.resolve();

function registrableDomain(hostname) {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  return labels.length > 2 ? labels.slice(-2).join(".") : labels.join(".");
}

function classify(hostname) {
  const domain = registrableDomain(hostname);
  if (knownAdServers.has(domain) || customAdServers.has(domain)) return "known-ad-server";

  const adServerPattern =
    /(^|[.-])(ad|ads|advert|advertising|banner|click|marketing|promo|sponsor|track|tracking|tracker|pixel)([.-]|$)/i;
  if (adServerPattern.test(hostname)) return "possible-ad-server";
  return TRACKER_PATTERN.test(hostname) ? "tracker" : "unmatched";
}

async function persistRequest(details) {
  if (!details.url || details.tabId < 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }

  const classification = classify(url.hostname);
  if (classification === "unmatched") return;

  const entry = {
    id: `${details.requestId}-${Date.now()}`,
    timestamp: Date.now(),
    domain: registrableDomain(url.hostname),
    type: details.type,
    initiator: details.initiator || null,
    tabId: details.tabId,
    classification
  };

  const stored = await chrome.storage.local.get(REQUESTS_KEY);
  const requests = Array.isArray(stored[REQUESTS_KEY]) ? stored[REQUESTS_KEY] : [];
  requests.unshift(entry);
  await chrome.storage.local.set({
    [REQUESTS_KEY]: requests.slice(0, MAX_REQUESTS)
  });
}

async function persistCookieChange(changeInfo) {
  let url;
  try {
    url = new URL(changeInfo.cookie.domain.startsWith(".")
      ? `https://${changeInfo.cookie.domain.slice(1)}`
      : `https://${changeInfo.cookie.domain}`);
  } catch {
    return;
  }

  const entry = {
    id: `cookie-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    domain: registrableDomain(url.hostname),
    type: "cookie",
    initiator: null,
    tabId: -1,
    classification: "cookie",
    removed: changeInfo.removed
  };
  const stored = await chrome.storage.local.get(REQUESTS_KEY);
  const requests = Array.isArray(stored[REQUESTS_KEY]) ? stored[REQUESTS_KEY] : [];
  requests.unshift(entry);
  await chrome.storage.local.set({ [REQUESTS_KEY]: requests.slice(0, MAX_REQUESTS) });
}

function recordRequest(details) {
  writeQueue = writeQueue
    .then(() => persistRequest(details))
    .catch((error) => console.error("Failed to record request", error));
  return writeQueue;
}

chrome.webRequest.onBeforeRequest.addListener(
  recordRequest,
  { urls: ["http://*/*", "https://*/*"] }
);

chrome.cookies.onChanged.addListener((changeInfo) => {
  writeQueue = writeQueue
    .then(() => persistCookieChange(changeInfo))
    .catch((error) => console.error("Failed to record cookie change", error));
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    "knownAdServers",
    CUSTOM_SERVERS_KEY,
    REQUESTS_KEY
  ]);
  if (Array.isArray(stored[CUSTOM_SERVERS_KEY])) {
    customAdServers.clear();
    stored[CUSTOM_SERVERS_KEY].forEach((domain) => customAdServers.add(domain));
  }
  if (!stored.knownAdServers) {
    await chrome.storage.local.set({
      knownAdServers: [...knownAdServers],
      [CUSTOM_SERVERS_KEY]: [],
      [REQUESTS_KEY]: []
    });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[CUSTOM_SERVERS_KEY]) return;
  customAdServers.clear();
  for (const domain of changes[CUSTOM_SERVERS_KEY].newValue || []) {
    customAdServers.add(domain);
  }
});

chrome.storage.local.get(CUSTOM_SERVERS_KEY).then((stored) => {
  for (const domain of stored[CUSTOM_SERVERS_KEY] || []) {
    customAdServers.add(domain);
  }
});
