<p align="center">
  <img src="logo.png" alt="Peek Logo" width="120" />
</p>

# Peek Selection Popup

Peek is a lightweight browser extension that shows a Safari-style tooltip popup when you select short text on a webpage.

The popup is designed to be fast, minimal, and useful:
- Shows selected text
- Combines Wikipedia context and dictionary meanings
- Handles ambiguous terms with disambiguation candidates
- Includes clickable source links
- Supports quick copy

## Highlights

- Trigger rules:
  - Double-click text, or select short text (1-3 words)
  - Ignores empty selections and long paragraph-like selections
- Popup behavior:
  - Anchors near selected text
  - Repositions to stay on-screen
  - Dismisses on outside click, scroll, or Escape
- Data behavior:
  - UI appears first, data is fetched asynchronously
  - Merges Wikipedia + dictionary insights into one view
  - Includes multiple dictionary meanings when available
  - Includes links to source pages
- Performance behavior:
  - Reuses one popup DOM node
  - Debounced selection trigger handling
  - Race-safe updates for rapid selection changes

## Install (Load Unpacked)

1. Open Chrome or Edge and go to Extensions.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder:
   - /home/heathknowles/Peek
5. Reload your active tab.

## Usage

1. Select a word or short phrase on any webpage.
2. Peek popup appears near the selection.
3. Read the combined insight.
4. Open source links directly from the popup.
5. Use Copy to copy selected text.

## Project Structure

- manifest.json
  - Extension metadata and content script registration
- logo.png
  - Extension icon used in toolbar and extension list
- content/
  - peek-state.js: runtime state model
  - peek-selection.js: selection parsing and positioning logic
  - peek-services.js: Wikipedia and dictionary fetch/combine logic
  - peek-ui.js: popup UI creation/rendering/styling
  - content.js: orchestration, events, and interaction flow

## Data Sources

- Wikipedia
  - REST page summary endpoint
  - Search API fallback for disambiguation handling
- Free Dictionary API
  - https://api.dictionaryapi.dev/api/v2/entries/en/<word>

## Troubleshooting

If popup does not appear:
1. Reload the extension from Extensions.
2. Refresh the webpage.
3. Select normal text content on the page (not always inside input fields).
4. Check the page console and verify:
   - window.__peek exists
   - window.__peek.status is ready

If icon does not update:
1. Confirm logo.png is present in the project root.
2. Reload the extension.
3. Pin and unpin extension once if toolbar cache lags.

## Roadmap Ideas

- Optional compact/comfortable popup density toggle
- Optional enable/disable Wikipedia or dictionary source
- Better handling for iframe-heavy pages
- User settings page for behavior tuning

## License

No license file is currently included in this repository.
Add a LICENSE file if you plan to distribute this publicly.
