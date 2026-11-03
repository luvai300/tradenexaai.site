# TradeNexaAI — tradenexaai.site

A Deriv options trading workspace prepared for **GitHub → Vercel** deployment. The public OAuth App ID is **34Qe611c7mms83D7TD4GM**.

## Deploy on Vercel

1. Import **luvai300/tradenexaai.site** into Vercel. Select **Other** if asked for a framework; leave the root directory at the repository root. `vercel.json` supplies the build command (`npm run build`) and output directory (`public`). Use Node.js 22.
2. Add **DERIV_SESSION_SECRET** in Vercel's environment variables, using a cryptographically random value with at least 32 characters. Generate one locally with `npm run setup:secret`. Do not commit the value or share it in chat. Set it for each deployment environment you intend to use.
3. **DERIV_APP_ID** defaults to `34Qe611c7mms83D7TD4GM`. An environment override is supported. **PUBLIC_SITE_URL** defaults to `https://tradenexaai.site`; set it to the primary site origin when different. Automatically supplied Vercel deployment/production/branch hostnames are also accepted by the server.
4. Deploy, then add **tradenexaai.site** in Vercel's domain settings. Configure the DNS records Vercel gives you. Earlier ChatGPT Sites/Cloudflare DNS records do not point at Vercel.
5. In the Deriv developer dashboard, use an **OAuth** app with the **trade** scope. Register this exact redirect URI:

   `https://tradenexaai.site/auth/deriv/callback`

   To test login on a Vercel-assigned hostname before DNS is ready, register that hostname's exact `/auth/deriv/callback` URL too. The server's Connection settings screen displays the URI it will use.
6. Configure the desired **3% markup in Deriv's app settings**. A percentage displayed on this website does not activate provider-side commission.
7. Connect a Deriv **demo** account and verify quotes, contract purchase, settlement and account switching before using real funds. No financial transactions were executed by the automated tests.

After import, pushes to Vercel's production branch (normally `main`) trigger deployments. Future requested changes can be made from this chat and pushed through the connected GitHub account. GitHub is the source of truth for this Vercel version.

## Included features

- Deriv OAuth Authorization Code + PKCE, with server-side token exchange
- AES-GCM encrypted Secure/HttpOnly/SameSite cookies; tokens never enter browser storage
- Account ownership checks, demo/real mode switching, one-time authenticated WebSocket URLs
- Live public tick charts and multi-market ticker
- Manual trade quotes, quote expiry, explicit confirmation and open-contract tracking
- Bounded reconnection, session expiry handling and provider-supported contract durations
- Digit frequency analysis, arithmetic risk calculator and free contract presets
- JSON strategy import/export and browser-session automation with fixed stakes, per-purchase cost caps, maximum trade count and settled P/L limits

No bot guarantees profit. Bots stop after a connection loss and do not silently restart. Closing the page stops new purchases but does not cancel existing Deriv contracts.

## Repository structure

- `public/`: complete frontend; no bundler or paid API required for public market data
- `src/server.mjs`: Deriv OAuth, encrypted sessions and REST account/OTP operations
- `src/handler.mjs`: Vercel Web Standard request adapter
- `api/`: seven small Vercel Node.js functions
- `vercel.json`: API/auth routing and response headers
- `tests/`: mocked auth, account routing, quote, automation, reconnection and risk tests

The browser connects directly to Deriv's WebSocket servers. Vercel runs short HTTP requests for login, accounts and connection setup; it does not host a persistent WebSocket server.

## Local work

Requires Node.js 22+. There are no production dependencies.

```sh
npm install
npm run build
npm test
npm run dev
```

For local overrides, copy `.env.example` to `.env.local` and set `PUBLIC_SITE_URL=http://localhost:3000`. The development server generates a temporary in-memory session key if no key is configured. A registered localhost callback is needed to test OAuth locally. Production secrets must be set in Vercel.

## Provenance and limits

This is the full source of the custom TradeNexaAI terminal developed in this conversation. The original `deriv-com/deriv-app` checkout was inspected as a reference; this deployable terminal uses Deriv's current API independently and does not require the archived React monorepo. It does not include Statefx proprietary source, premium bots, copy trading or an AI prediction service. Its visual style follows the public reference, while all included interface and server code are available here.

The previous ChatGPT-hosted preview is a separate deployment. No DNS or Deriv app settings are changed by uploading this repository. Actual authenticated trade execution, commission credits, domain routing and Vercel production behavior must be verified after deployment and user authorization.
