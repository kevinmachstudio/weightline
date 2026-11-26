# Weightline

Weightline compares a portfolio's current values and allocation with a hypothetical gain or loss scenario.

- Enter the unit price in **Price** and the position value in **Holdings ($)**. Only the holdings amounts contribute to portfolio totals and current weights. Edit the current reference total to scale those holdings amounts together.
- Enter a signed percentage in **Gain / loss %**. Zero leaves the position at its current value and −100% reduces its future value to zero.
- **Future holdings** multiplies each position by one plus its gain or loss, rounded to cents. **Future %** divides each projected holding by the sum of those future holdings. The allocation chart can show either the current or the future mix.

Amounts are in USD. Data is stored on the device in the app or browser. A setup link with a `#start=` fragment can initialize the seven starter prices on a fresh browser. The fragment contains comma-separated prices, stays in the browser, and is removed from the address bar when the app opens. Saved prices and holdings carry over from previous versions.

## Install on a phone

- On iPhone or iPad, use Safari’s Share menu, choose **Add to Home Screen**, and enable **Open as Web App** if shown.
- On Android, use **Install app** in Weightline or Chrome’s **Add to Home screen** menu.
- Open the installed app once while online to prepare it for offline use. **Portfolio backup** lets you download your saved portfolio and restore it in the installed app if it has separate storage.

## Run locally

Serve the `dist` directory over HTTP. The project has no package dependencies or build step.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

## Deploy

GitHub Pages uses the included Actions workflow to publish `dist` on changes to the app. In Netlify, use `dist` as the publish directory. For a linked Netlify site, run `netlify deploy --prod`.
