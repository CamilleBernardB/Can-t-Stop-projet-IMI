# Can-t-Stop-projet-IMI
# Paris Location Game

A location-based treasure hunt that runs in your phone's browser.

You walk through Paris. When you reach a landmark, a task appears. You solve it to unlock the next hint. The hints lead you to the next landmark.

## Features

- **Live map.** Your position is shown on an OpenStreetMap map. A smoothing filter keeps the marker from jumping.
- **GPS filtering.** Fixes with an accuracy worse than 50 m are ignored.
- **Landmark triggers.** A task button appears when you are inside a landmark's radius. The distance is computed with the haversine formula.
- **Four task types.**
  - `showMessage`: shows a message.
  - `askPuzzle`: a text riddle with an expected answer.
  - `askWordle`: a Wordle-style word game with six tries.
  - `askFifteen`: a 15-puzzle (sliding tiles) built from an image.
- **Hint history.** A "Past hints" panel lists the hints you have unlocked.
- **Installable PWA.** You can add the app to your home screen. It uses a service worker (Workbox).
- **Debug mode.** You can fake your GPS position to test the game at your desk.

## Tech stack

- React 18 and TypeScript
- Vite 5
- MapLibre GL JS for the map
- `vite-plugin-pwa` for the service worker and manifest

## Getting started

You need Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the local URL that Vite prints. Your browser will ask for permission to use your location.

To test on a phone on the same network:

```bash
npm run dev -- --host
```

Browsers only allow GPS on HTTPS pages (or on `localhost`). For a phone on your network, create a local certificate and run:

```bash
# Needs certs/dev-key.pem and certs/dev-cert.pem in the project root
VITE_DEV_HTTPS=true npm run dev -- --host
```

### Debug GPS

To fake your position, start the app with:

```bash
VITE_DEBUG_GPS=true npm run dev
```

A "Debug location" checkbox appears. Tick it, enter a latitude and longitude, and press Apply. A "Landmarks" button also appears. It lists the landmarks within 1 km and shows their markers on the map.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_DEBUG_GPS` | Set to `true` to enable the debug location panel. |
| `VITE_DEV_HTTPS` | Set to `true` to serve the dev server over HTTPS. |
| `VITE_TILE_URL` | Optional. A custom raster tile URL. The default is the OpenStreetMap tile server. |

## Build and deploy

```bash
npm run build     # type-checks, then builds into docs/
npm run preview   # serves the production build locally
```

The build goes to `docs/`, so the app can be served with GitHub Pages. The base path is set to `/map-webapp/` in `vite.config.ts`. Change it if you rename the repository.

## Project structure

```text
src/
  App.tsx                 Game logic, HUD and task modals
  components/MapView.tsx  Map, player marker and debug landmark markers
  services/
    geolocation.ts        GPS watcher with accuracy filtering
    smoothing.ts          Time-based position smoothing
  apps/registry.ts        Maps each task type to a handler
  data/landmarks.json     The landmarks, tasks and hints
  types/                  TypeScript types for landmarks and tasks
public/hint/              Images used by the tasks
docs/                     Production build (GitHub Pages)
```

## Creating your own game

All the content is in `src/data/landmarks.json`. Each landmark looks like this:

```json
{
  "id": "eiffel-tower",
  "name": "Eiffel Tower",
  "lat": 48.85837,
  "lng": 2.294481,
  "radiusMeters": 100,
  "task": {
    "app": "askPuzzle",
    "title": "Math Riddle",
    "payload": { "question": "What is 7 multiplied by 6?", "answer": "42" },
    "hint": { "type": "text", "value": "The hint shown after the puzzle is solved" }
  }
}
```

The `payload` depends on the task type. `askPuzzle` takes a question and an answer. `askWordle` takes the secret word as a string. `askFifteen` takes an image path as a string.

The landmarks are played in the order of the file. The `hint` can be text or an image (`{ "type": "image", "value": "hint/photo.jpg" }`). Put images in `public/hint/`.

## Current limitations

- The `photoPrompt`, `triviaCard` and `audioPing` task types are placeholders. They are registered but not implemented yet.
- Game progress is kept in memory. It is lost when you reload the page.
- The default map center is San Francisco until the first GPS fix arrives.

## My contribution

<!-- TODO: say in 2-3 lines what you built yourself, e.g. the GPS smoothing, the Wordle task, the PWA setup. -->

## License

<!-- TODO: add a license (for example MIT), or remove this section. -->
