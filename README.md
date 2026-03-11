# Wache Webapp

Stock list web app built from the WeSell-style prototype: browse inventory, filter by manufacturer, model, capacity, color, condition, carrier, and price, and add items to cart.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
npm run preview
```

## Stack

- **React 18** + **Vite 5**
- Mock product data (100 items); filters, sort, pagination, and cart count are wired in the UI.

## Features

- **Header**: Wache logo, My Account / Help / Sign Out, cart count
- **Sidebar**: Text filter + Manufacturer, Model, Capacity, Color, Condition, Carrier, Price range
- **Stock list**: “Add new request”, items-per-page, sort (Date Added, Price, Name), product cards with image, specs, quantity, Add to Cart, View Details, Add to Watchlist
- **Pagination**: First / Previous / page numbers / Next / Last
- **Footer**: Copyright, Terms, Privacy, Contact
