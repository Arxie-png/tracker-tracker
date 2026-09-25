import { knownAdServers } from "./known-ad-servers.js";

const REQUESTS_KEY = "capturedRequests";
const CUSTOM_SERVERS_KEY = "customAdServers";
const requestsElement = document.querySelector("#requests");
const summaryElement = document.querySelector("#summary");
const knownPanel = document.querySelector("#known-panel");
const knownServersElement = document.querySelector("#known-servers");
const chartElement = document.querySelector("#site-chart");
const cookieChartElement = document.querySelector("#cookie-chart");
const adSection = document.querySelector("#ad-section");
const cookieSection = document.querySelector("#cookie-section");
const requestsList = document.querySelector("#requests");

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatCount(value) {
  if (value < 1000) return String(value);
  const units = ["k", "m", "b", "t"];
  let scaled = value;
  let unitIndex = -1;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
  return `${formatted.replace(/\.0$/, "")}${units[unitIndex]}`;
}

let customServers = new Set();
let chartMode = "pie";
let cookieListVisible = false;

function isKnownDomain(domain) {
  return knownAdServers.has(domain) || customServers.has(domain);
}

function displayHostname(hostname) {
  return hostname.replace(/^www\./i, "");
}

function renderCookiePie(requests) {
  const counts = new Map();
  for (const request of requests) {
    if (request.classification !== "cookie") continue;
    counts.set(request.domain, (counts.get(request.domain) || 0) + 1);
  }
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  cookieChartElement.replaceChildren();
  if (!domains.length) {
    cookieChartElement.textContent = "No cookie activity yet.";
    return;
  }

  if (cookieListVisible) {
    const list = document.createElement("ul");
    list.className = "cookie-url-list";
    for (const [domain, count] of domains) {
      const item = document.createElement("li");
      item.textContent = `${domain} (${formatCount(count)})`;
      item.title = domain;
      list.append(item);
    }
    cookieChartElement.append(list);
    return;
  }

  const total = domains.reduce((sum, [, count]) => sum + count, 0);
  let start = 0;
  const segments = [];
  domains.forEach(([, count], index) => {
    const end = start + (count / total) * 360;
    segments.push(`var(--cookie-chart-${index}) ${start}deg ${end}deg`);
    start = end;
  });
  const pie = document.createElement("div");
  pie.className = "pie-chart cookie-pie";
  pie.style.background = `conic-gradient(${segments.join(", ")})`;
  cookieChartElement.append(pie);

  const legend = document.createElement("div");
  legend.className = "pie-legend cookie-legend";
  domains.forEach(([domain, count], index) => {
    const row = document.createElement("div");
    row.className = "legend-row cookie-legend-row";
    const color = document.createElement("span");
    color.className = `legend-color cookie-legend-${index}`;
    const label = document.createElement("span");
    label.textContent = domain;
    label.title = domain;
    const value = document.createElement("b");
    value.textContent = formatCount(count);
    row.append(value, color, label);
    legend.append(row);
  });
  cookieChartElement.append(legend);
}

function renderSiteChart(requests) {
  const counts = new Map();
  for (const request of requests) {
    if (request.classification !== "known-ad-server" &&
        request.classification !== "possible-ad-server") continue;
    let site = "(unknown page)";
    if (request.initiator) {
      try {
        site = displayHostname(new URL(request.initiator).hostname || request.initiator);
      } catch {
        site = displayHostname(request.initiator);
      }
    }
    counts.set(site, (counts.get(site) || 0) + 1);
  }
  const sites = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  chartElement.replaceChildren();
  if (!sites.length) {
    chartElement.textContent = "No ad requests to chart yet.";
    return;
  }

  if (chartMode === "pie") {
    const total = sites.reduce((sum, [, count]) => sum + count, 0);
    let start = 0;
    const segments = [];
    for (const [, count] of sites) {
      const end = start + (count / total) * 360;
      segments.push(`var(--chart-${segments.length}) ${start}deg ${end}deg`);
      start = end;
    }
    const pie = document.createElement("div");
    pie.className = "pie-chart";
    pie.style.background = `conic-gradient(${segments.join(", ")})`;
    chartElement.append(pie);
    const legend = document.createElement("div");
    legend.className = "pie-legend";
    sites.forEach(([site, count], index) => {
      const row = document.createElement("div");
      row.className = "legend-row";
      const color = document.createElement("span");
      color.className = `legend-color legend-${index}`;
      const label = document.createElement("span");
      label.textContent = site;
      const value = document.createElement("b");
      value.textContent = formatCount(count);
      row.append(value, color, label);
      legend.append(row);
    });
    chartElement.append(legend);
    return;
  }

  const max = sites[0][1];
  for (const [site, count] of sites) {
    const row = document.createElement("div");
    row.className = "chart-row";
    const label = document.createElement("span");
    label.textContent = site;
    const bar = document.createElement("span");
    bar.className = "chart-bar";
    bar.style.width = `${Math.max(4, (count / max) * 100)}%`;
    bar.title = `${count} ad requests`;
    const value = document.createElement("b");
    value.textContent = formatCount(count);
    row.append(label, bar, value);
    chartElement.append(row);
  }

}

async function reloadCharts() {
  const stored = await chrome.storage.local.get(REQUESTS_KEY);
  const requests = Array.isArray(stored[REQUESTS_KEY]) ? stored[REQUESTS_KEY] : [];
  renderSiteChart(requests);
  renderCookiePie(requests);
}

adSection.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  chartMode = chartMode === "pie" ? "bars" : "pie";
  reloadCharts().catch((error) => console.error("Failed to refresh charts", error));
});

cookieSection.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  cookieListVisible = !cookieListVisible;
  reloadCharts().catch((error) => console.error("Failed to refresh charts", error));
});

function render(requests) {
  const relevantRequests = requests.filter(
    (request) =>
      request.classification === "known-ad-server" ||
      request.classification === "possible-ad-server" ||
      request.classification === "tracker" ||
      request.classification === "cookie"
  );
  const knownCount = requests.filter(
    (request) =>
      request.classification === "known-ad-server" || isKnownDomain(request.domain)
  ).length;
  const possibleCount = relevantRequests.filter(
    (request) => request.classification === "possible-ad-server"
  ).length;
  const trackerCount = relevantRequests.filter((request) => request.classification === "tracker").length;
  const cookieCount = relevantRequests.filter((request) => request.classification === "cookie").length;
  const metricValues = [
    relevantRequests.length,
    knownCount,
    cookieCount,
    trackerCount
  ];
  summaryElement.querySelectorAll("b").forEach((element, index) => {
    element.textContent = formatCount(metricValues[index]);
  });
  requestsElement.replaceChildren();
  renderSiteChart(relevantRequests);
  renderCookiePie(relevantRequests);

  if (relevantRequests.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No ad, tracker, or cookie activity yet.";
    requestsElement.append(empty);
    return;
  }

  for (const request of relevantRequests.slice(0, 75)) {
    const item = document.createElement("li");
    const domain = document.createElement("div");
    const isKnown =
      request.classification === "known-ad-server" || isKnownDomain(request.domain);
    const isTracker = request.classification === "tracker";
    const isCookie = request.classification === "cookie";
    domain.className = isKnown ? "domain known" : isTracker ? "domain tracker" : isCookie ? "domain cookie" : "domain possible";
    const domainName = document.createElement("span");
    domainName.className = "domain-name";
    domainName.textContent = request.domain;
    domain.append(domainName);
    const metadata = document.createElement("div");
    metadata.className = "metadata";
    metadata.textContent = `${request.type}${request.removed ? " removed" : ""} · ${formatTime(request.timestamp)}${
      request.initiator ? ` · from ${request.initiator}` : ""
    }`;
    if (!isKnown && !isTracker && !isCookie) {
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = "POSSIBLE";
      domain.append(label);
      const addButton = document.createElement("button");
      addButton.className = "add-button";
      addButton.type = "button";
      addButton.textContent = "Add";
      addButton.title = "Add this domain to your custom ad-server list";
      addButton.addEventListener("click", () => addCustomServer(request.domain));
      domain.append(addButton);
    }

    item.append(domain, metadata);
    requestsElement.append(item);
  }
}

function renderKnownServers() {
  knownServersElement.replaceChildren();
  for (const domain of [...new Set([...knownAdServers, ...customServers])].sort()) {
    const item = document.createElement("li");
    item.textContent = domain;
    knownServersElement.append(item);
  }
}

async function addCustomServer(domain) {
  customServers.add(domain);
  await chrome.storage.local.set({ [CUSTOM_SERVERS_KEY]: [...customServers].sort() });
  renderKnownServers();
  const stored = await chrome.storage.local.get(REQUESTS_KEY);
  render(Array.isArray(stored[REQUESTS_KEY]) ? stored[REQUESTS_KEY] : []);
}

async function loadRequests() {
  const stored = await chrome.storage.local.get(REQUESTS_KEY);
  render(Array.isArray(stored[REQUESTS_KEY]) ? stored[REQUESTS_KEY] : []);
}

document.querySelector("#clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ [REQUESTS_KEY]: [] });
  render([]);
});

document.querySelector("#recent-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const icon = button.querySelector("span:last-child");
  const isCollapsed = requestsList.hidden;
  requestsList.hidden = !isCollapsed;
  button.setAttribute("aria-expanded", String(isCollapsed));
  icon.textContent = isCollapsed ? "−" : "+";
});

document.querySelector("#known-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const isHidden = knownPanel.hidden;
  knownPanel.hidden = !isHidden;
  button.setAttribute("aria-expanded", String(isHidden));
});

document.querySelector("#export-servers").addEventListener("click", async () => {
  const domains = [...new Set([...knownAdServers, ...customServers])].sort();
  const filterList = `${domains.map((domain) => `||${domain}^`).join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([filterList], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ad-request-watcher-filter.txt";
  link.click();
  URL.revokeObjectURL(url);
});

async function initialize() {
  const stored = await chrome.storage.local.get([CUSTOM_SERVERS_KEY, REQUESTS_KEY]);
  customServers = new Set(stored[CUSTOM_SERVERS_KEY] || []);
  renderKnownServers();
  render(Array.isArray(stored[REQUESTS_KEY]) ? stored[REQUESTS_KEY] : []);
}

initialize();
