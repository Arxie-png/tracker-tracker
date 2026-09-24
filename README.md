# Ad Request Watcher

Privacy-first Chrome Manifest V3 prototype for discovering ad-server requests.

## Current behavior

- Observes HTTP(S) requests from tabs using `webRequest`.
- Stores only matching requests: the registrable domain, request type, initiator, tab ID, classification, and timestamp.
- Keeps the latest 1,000 records in `chrome.storage.local`.
- Compares domains with the bundled seed list in `known-ad-servers.js`.
- Also shows possible ad servers when the hostname contains common ad, tracking, pixel, or marketing terms.
- Possible domains can be added to a persistent custom list from the popup.
- The known-server panel exports an Adblock-compatible `||domain^` filter list for importing into another blocker.
- Displays an Ad requests chart for pages generating the most known or possible ad requests.
- Displays that activity as a pie chart by default; right-click the chart to switch to the bar view.
- Displays cookie changes grouped by domain in a separate pie chart.
- Right-click the Cookies chart to hide the graph and show cookie URLs; right-click again to restore the graph.
- Ad requests and Cookies use the same section layout and right-click interaction pattern.
- The Cookies pie chart includes a website/domain color key with counts.
- Locally records tracker-like requests and cookie changes; no activity data is transmitted.
- Shows recent activity in the extension popup.

No captured data is transmitted anywhere.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this directory.

The prototype requires broad host access because request observation is its core function. Chrome will display that permission during installation.
