# Weightline

Weightline tracks a portfolio's current values, target allocation, and the dollar difference between the two.

- Enter the unit price in **Price** and the position value in **Holdings ($)**. Only the holdings amounts contribute to portfolio totals and current weights. Edit the current reference total to scale those holdings amounts together.
- The target total follows the current portfolio total by default. Edit the target reference to set a fixed budget that scales the target dollar amounts.
- The target mix follows the holdings amounts until you set a target. Enter either a target dollar amount or a target percentage. Weightline adjusts the other holdings proportionally so the target adds up. **Match current mix** copies the current percentages to the target.
- **To target** shows each target dollar amount minus its current balance. **Allocation drift** measures the share of the portfolio that would need to shift to reach the target mix at the current total.

Amounts are in USD. Data is stored in the current browser profile and site origin. A setup link with a `#start=` fragment can initialize the seven starter prices on a fresh browser. The fragment contains comma-separated prices, stays in the browser, and is removed from the address bar when the app opens. Previously saved current amounts move into **Price** on first load after the update.

## Run locally

Serve the `dist` directory over HTTP. The project has no package dependencies or build step.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

## Deploy

GitHub Pages uses the included Actions workflow to publish `dist` on changes to the app. In Netlify, use `dist` as the publish directory. For a linked Netlify site, run `netlify deploy --prod`.
