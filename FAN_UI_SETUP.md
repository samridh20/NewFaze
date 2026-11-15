# FaZe Odyssey fan UI

Local branch: `codex/fan-experience`. Changes have not been pushed to GitHub.

## Run the fan website

Node.js 22 or newer is required. From the repository root:

```sh
npm install
npm run dev --workspace odyssey-web
```

Open http://localhost:3001.

If npm cannot write to your system cache, use `npm install --cache .local/npm-cache` instead. If macOS reports `EMFILE` watcher errors, run `WATCHPACK_POLLING=true npm run dev --workspace odyssey-web`.

The fan UI is usable without the Python stack: campaign pages show explicit preview states, illustrative gallery entries cannot receive votes, and entry drafts stay in the browser. No backend data is fabricated.

## Routes

| Page | Route | Behavior |
| --- | --- | --- |
| Homecoming | `/` | Season introduction, chapter strip, current campaign, latest published release |
| The Drop | `/drop` | Featured campaign plus upcoming campaign formats |
| Archive | `/archive` | Selectable 2011, 2022 and 2026 chapters; official video links; route to the current campaign |
| Recreate the Shot | `/drop/homecoming-week1` | Original video, newcomer tutorial, recreation gallery, live voting when connected, local entry draft |
| Published Final Cut | `/final-cut/homecoming-week1-final-cut` | Published video sequence, real tally, creator credits, existing labeled simulation comparison |

## Connect the existing backend

The existing client defaults remain:

- Odyssey public API: `http://localhost:8001`
- Demo auth API: `http://localhost:8003`

To point at different services, create **`apps/odyssey-web/.env.local`**:

```dotenv
NEXT_PUBLIC_ODYSSEY_URL=http://localhost:8001
NEXT_PUBLIC_AUTH_URL=http://localhost:8003
```

Restart the fan website after changing these variables. The backend must allow requests from the fan website's origin. These are public service URLs, not secret keys.

If the full stack is already set up, run its existing `make dev` command instead of starting a second copy of the web app. For a fresh full-stack installation, the repository provides `make setup`, `make db-install`, `make db-up`, `make migrate`, `make seed`, and `make dev`; those commands install and run the larger Python/database/AI system and were not executed for this UI update. **`make seed` resets demo data**; don't run it against data you need to keep. No AI-provider setup is required to review the fan UI alone.

## Add your media

The central manifest is **`apps/odyssey-web/lib/content.ts`**. Put approved files in **`apps/odyssey-web/public/media/`**, then reference them as `/media/filename.mp4` or `/media/filename.jpg`.

- `hero.poster`: Homecoming background. Its current image is a crop from your supplied concept mockup.
- `reference.poster`, `reference.src`, `reference.youtube`: original shot poster, optional hosted MP4/HLS, and YouTube fallback. A reference returned by the campaign API takes priority.
- `tutorial.poster`, `tutorial.youtube`: official tutorial thumbnail and click-to-play video.
- `community.poster`, `community.youtube`: community montage on the Archive page.
- `rooftop.poster`, `nightshift.poster`, `antwerp.poster`: illustrative campaign artwork. Replace these with approved imagery when available.
- Live gallery playback comes from the API's `finalists[].playback_url`. Replace seeded media using the existing backend media pipeline; changing a placeholder poster does not change that playback URL.

Do not put a YouTube watch URL in `src`; use the `youtube` ID field. `src` takes a directly playable MP4/WebM/HLS URL.

The provisional header marks are cropped from the supplied mockups. Replace `mark-dark.png` and `mark-light.png` with approved brand assets when available. Display and mono fonts are bundled locally, with their OFL licenses, so builds do not require Google Fonts access.

## What works and what still needs backend work

**Implemented:** separate navigation/routes, responsive mobile menu, Archive chapter switching, inline YouTube playback, MP4/HLS playback, gallery previous/next, existing authenticated vote API with pending/error/closed states, entry share links, existing campaign state stream, real publication/tally/credits rendering, local form validation and draft persistence, local uploaded-file preview.

**Entry form limitation:** the public API currently has no submission/upload endpoint. The form saves draft text and links locally and explicitly says it has not submitted anything. File bytes are not saved to localStorage or sent anywhere. Users must reselect a file after refreshing. Drafts do not enter the public gallery.

**Upcoming formats:** Call the Play and Editor Relay are marked as upcoming, not represented as completed experiences.

**Live verification:** the Python API, voting database transactions, publication workflow, Mux and AI services were not started or verified in this checkout. Their existing contracts remain in place. Frontend browser verification covered the disconnected preview and local-draft behavior.

## Review checklist

1. Navigate using Homecoming / The Drop / Archive; confirm the active tab and browser URL change.
2. In Archive, select all three years; check that year, artwork, text and action update together.
3. Open Recreate the Shot. Use the tutorial and community anchor links, then previous/next in the gallery.
4. Expand Post your recreation. Try a file preview or clip URL, enter a handle, confirm ownership, and save the draft. Refresh and reopen; text fields should persist.
5. At phone width, open the hamburger menu and move to another page. Check the stacked gallery and form.
6. With existing APIs running and the seeded ballot open, sign in as demo fan and vote. Refresh: the current vote should load from the API. Close and publish using the existing staff tools, then open the Final Cut.
7. Change the API URL to an unavailable service: there should be a visible preview/error state rather than an endless loading screen or a fabricated successful vote.

## Checks

```sh
npm run typecheck --workspace odyssey-web
npm run build --workspace odyssey-web
```

Staff-facing app files and backend services were not changed.
