# MediaBox

A Vue 3 + [Quasar](https://quasar.dev) web application for viewing and managing
media files (photos, videos, live streams, tachograph files) from
[flespi](https://flespi.io) IoT / telematics devices.

MediaBox connects to the flespi platform over its REST API and MQTT WebSockets,
so device media, upload notifications and command results update in real time.

## Features

- 📂 **Media explorer** per device — browse photos and videos in grid or list view
- 🎬 **Player** — video.js-based playback, including HLS and MPEG-TS live streams
- 🟢 **Live stream wall** — watch multiple device cameras at once
- 🗓 **Timeline** — visual per-camera timeline of recorded media
- 🎛 **Device commands** — request photos/videos, start streams, playback, tachograph downloads
- ⬆️ **Uploads** — push media files with metadata to a device
- 🔗 **Share / embed** — generate links and embeddable players for a media file
- 🔄 **Real-time updates** over MQTT (uploads, connections, command queue)

## Requirements

- Node.js `^18`, `^16`, or `^14.19`
- npm `>= 6.13.4` (or Yarn `>= 1.21.1`)
- A [flespi](https://flespi.io) account and an access token

## Install

```bash
npm install
# or
yarn
```

## Development

```bash
npm run dev
```

The dev server runs over **HTTPS at https://localhost:7060** with hot reload.

### Authentication

MediaBox needs a flespi token to talk to the platform. You can provide one by:

- appending it as a query param on any route:
  `https://localhost:7060/#/?token=YOUR_FLESPI_TOKEN`, or
- letting the app store it in `SessionStorage` after login.

See [Query parameters](#query-parameters) for details.

The region (e.g. `flespi.io` vs `flespi.me`) is detected automatically via
`/auth/regions`.

## Query parameters

The app uses hash-based routing, so a query string is read from **after** the
`#` (e.g. `…/#/device/123?token=…`), not before it.

| Param | Required | Description |
|-------|----------|-------------|
| `token` | No | flespi access token, applied on any route. When present it is stored in `SessionStorage` and reused on later visits, so it only needs to be passed once. Examples: `https://localhost:7060/#/?token=<token>` or `…/#/uuid/<uuid>?token=<token>`. The `FlespiToken ` prefix is optional — a bare token works too. |

For path parameters (`:deviceid`, `:uuid`) see [Routes](#routes) below.

## Build

```bash
npm run build      # production build to dist/spa
```

Built files are meant to be served over an HTTP server — opening `index.html`
over `file://` will not work.

## Lint

```bash
npm run lint
```

## Routes

| Route | Description |
|-------|-------------|
| `/` | Device selection |
| `/device/:deviceid` | Media explorer for a device (`:deviceid` — flespi device id) |
| `/uuid/:uuid` | Standalone player for a single media file (`:uuid` — media file UUID) |

## Architecture

- **Vue 3** (Options API) + **Quasar 2** (Vite), dark mode enabled
- **Pinia** stores: `auth` (token / connection / region), `media` (device files,
  MQTT subscriptions, timeline), `appearance` (theme color)
- **flespi-io-js** provides the REST client (`$connector.http`) and MQTT client
  (`$connector.socket`), wired up in `src/boot/flespi-io.js`
- **video.js** for playback; **mpegts.js** for MPEG-TS live streams

Media files are served from `https://media.flespi.io/{uuid}` (region-specific);
append `?preview=jpeg` for thumbnails.

Command forms are rendered via [FormBox](https://formbox.flespi.io).

## License

[MIT](./LICENSE) © Gurtam (flespi)
