# Validation prototype

Scope fixed by `../docs/08-validation-plan.md` section 3. Plain HTML, CSS and JavaScript; no build step, no dependencies, no network calls, no analytics. All records stay in the browser's localStorage on the test device.

## Live demo

https://pnrappsptyltd.github.io/tray-of-ten-demo/ (GitHub Pages, public repo `pnrappsptyltd/tray-of-ten-demo`). Republish after changes with `scripts/publish-demo.sh`.

## Run it locally
Open `index.html` from any static server (speech and pointer capture need a served page, not `file://` in some browsers), for example:

```bash
python3 -m http.server 8765 --directory prototype
```

Then open http://localhost:8765/ on the tablet (same Wi-Fi: use the computer's IP instead of localhost).

## Pages
- `index.html` — the game. One shift = five orders in a fixed sequence: see, see, peek, peek, closed door. Ends with a neutral "Open again / Stop for today" choice.
- `index.html#results` — tester view: every shift, order-level metrics, replay choices, form answers; copy as JSON; clear.
- `teacher.html` — one-page teacher/parent note with curriculum codes and the two validation questions (stored locally).
- `printable.html` — two-page A4 printable (tray, cupcake counters, order cards, oven door). Open `printable.html?url=https://pnrappsptyltd.github.io/tray-of-ten-demo/` to embed a QR code, then print to PDF. `fill-the-tray-of-ten.pdf` was generated with the live demo link embedded as a QR code; regenerate after changes with:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=4000 --print-to-pdf="$PWD/prototype/fill-the-tray-of-ten.pdf" "file://$PWD/prototype/printable.html?url=https://pnrappsptyltd.github.io/tray-of-ten-demo/"
```

## What is recorded per order
stage, starting count, first answer and whether it was correct (hidden-tray stages), attempts, time to first action, total time, whether the hint pulse appeared (see stage, 8 s idle), whether there was no action within 10 s (hidden stages), whether the child needed the door opened to count on.

## Not in this prototype, on purpose
Store purchase, parental gate, accounts, art beyond Direction B shapes, bonds to 5 or 20, split-order mechanic, customers with names, recorded voice (browser TTS is used).
