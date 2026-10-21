# TapTalk

A simple picture talker (AAC) for a child who doesn't speak, built as a web app you can install on an iPad. Its pictures are child-friendly [ARASAAC](https://arasaac.org) pictograms, with [Mulberry Symbols](https://mulberrysymbols.org) available too. It works offline once installed.

## What the child sees

- **Page column** down the left, always visible: **Back**, then Food, Drinks, Play, Feelings, People and Places (edit mode: × to take a page out, + Add to put any page in).
- **Home board** (5 × 5): 18 core words (I, want, more, help, stop, you, go, like, don't like, all done, eat, drink, play, toilet, hurt, yes, no, wait) plus Chat, Actions, Describe, Body, Animals and Colours. Grid size is adjustable (buttons per row, rows on screen); bigger pages scroll.
- **Places** opens 8 place pages: School, Home, Park, Shops, Doctor, Car & bus, Bedtime and Bath time. Each has the words you need there. On these pages, choosing a word keeps the page open so you can build a sentence, and **back** goes up one level.
- **Play → Fun** has favourite things to do: Mr Tumble, Singing Hands, CBeebies, iPad, YouTube, Peppa Pig, Bluey, songs, soft play, bike ride and more. ARASAAC has no pictures of TV characters, so these use stand-in pictures (a clown for Mr Tumble, for example). Use *Paste photo* to put your child's real favourites on them.
- Tapping a button says the word and adds it to the sentence bar at the top. Tapping the bar says the whole sentence. ⌫ removes the last word and ✕ clears the bar.
- After choosing a word from a page, it goes back to Home, so core words are always one tap away.
- Colours show the word type (Fitzgerald key): yellow is people, green is actions, blue is describing, orange is things, pink is social, red is no/stop and purple is questions. Pages are grey, with a folder tab.
- Child-proofing: pinch-zoom, text selection and long-press menus are blocked. Hidden buttons leave a blank gap so nothing moves around.

## Grown-up settings

**Press and hold the small circle (top right) for 1.5 seconds** to start editing buttons. Tap **⚙ Settings** in the purple editing bar for everything else. From there you can:

- **Edit buttons and pages**: tap any button to change its word, what it says, its colour or picture. You can search all 3,400+ Mulberry symbols and about 13,000 child-friendly [ARASAAC](https://arasaac.org) pictograms (ARASAAC search needs internet; a picture you choose is saved on the iPad, so it works offline afterwards), or use a photo: take one, pick one from the photo library, or **paste** one. To use a photo from **Google Photos**, open it, tap *Share → Copy*, then tap *Paste photo* in TapTalk. There is also an optional **From Google Photos** button that opens Google Photos directly; it needs a one-time setup, see [GOOGLE_PHOTOS_SETUP.md](GOOGLE_PHOTOS_SETUP.md). **Choose picture** also searches **photos** from around the web (via [Openverse](https://openverse.org)), and its **Google Images ↗** button opens Google so you can copy any picture and paste it straight back (⌘V / Ctrl+V works anywhere in the button editor). New photos open in a **picture editor**: drag to move, pinch or slide to zoom, rotate, fill the square or show the whole picture, and pick a shape (square, rounded, circle) and background. **Edit picture** reopens it later from the original photo. You can also hide, move or delete buttons, and add new buttons and pages. There are no "are you sure?" pop-ups: after any change, an **Undo** bar appears for a few seconds, and deleted buttons can be put back later from **⚙ Settings → Backup & help → Recently deleted**. Editing switches itself off after 3 minutes untouched, so Robyn can't change anything if the iPad is handed back mid-edit.
- Change the number of buttons per row, turn word labels on or off, and set "ignore repeated taps".
- Change the **skin colour** used in the pictures. ARASAAC pictures are re-drawn by the ARASAAC server, so the first change needs internet; after that they're kept for offline use.
- Choose the voice, speed and pitch. On iPad, you can add better voices in *Settings → Accessibility → Spoken Content → Voices* (Enhanced/Premium voices sound the most natural).
- **Share the board between devices**: edit on a computer and press *Send to tablet*; school can edit on Robyn's iPad and their changes are sent when they tap *Done*. Changes are merged, so both are kept. See [SYNC_SETUP.md](SYNC_SETUP.md).
- **Save a backup** (buttons, photos and settings in one file, sent through the share sheet) and **load** it on another device.

## Putting it on the iPad

The iPad has to load the app over **HTTPS** once. After that it works offline.

1. Host this folder on any static web host, for example GitHub Pages, Netlify or Cloudflare Pages. No build step is needed.
2. On the iPad, open the URL in **Safari**, tap **Share**, then **Add to Home Screen**.
3. Open TapTalk from the home screen icon. It runs full-screen.

Tip: turn on **Guided Access** (*Settings → Accessibility → Guided Access*, then triple-click the side or top button inside TapTalk). It keeps the child in the app.

Note: the home screen app has its own storage, separate from Safari. Make your edits inside the installed app, and use *Save backup* now and then.

## Running it locally

```bash
python3 -m http.server 8642
```

Then open http://localhost:8642.

## Changing the starting board or app files

The starting vocabulary is in `js/board.js`. After changing it, or any app file, run:

```bash
node tools/build-precache.mjs
```

This updates `precache.js`, the list of files saved for offline use. An installed iPad picks up the new version the next time the app is opened while online. It may take one extra relaunch.

## Files

- `index.html`, `css/styles.css`, `js/app.js`: the app
- `js/board.js`: the starting vocabulary
- `js/photos.js`: caregiver photos, stored in IndexedDB
- `js/cropper.js`: the picture editor (crop, zoom, rotate, shape)
- `js/sync.js`: shares the board between devices through a private GitHub repo
- `js/merge.js`: merges two copies of the board (newest change per button wins, deletions kept)
- `js/migrate.js`: swaps Mulberry pictures on older saved boards for their ARASAAC versions
- `sw.js`, `precache.js`, `manifest.webmanifest`, `icons/`: offline support and install
- `symbols/arasaac/`: the ARASAAC pictograms used by the starting board (PNG)
- `symbols/mulberry/`: the full Mulberry Symbols set (SVG)
- `symbols/custom/`: six extra symbols Mulberry doesn't have (I, you, stop, please, thank you, again)
- `symbols/index.json`: the search index for the picture picker (ARASAAC is searched online through its free API)

## Licence and credits

Symbols: **Mulberry Symbols** © Steve Lee, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (see `symbols/mulberry/LICENSE.txt`). The custom symbols in `symbols/custom/` are shared under the same licence.

ARASAAC pictograms are the property of the Government of Aragón and were created by Sergio Palao for [ARASAAC](https://arasaac.org), which shares them under [CC BY-NC-SA](https://creativecommons.org/licenses/by-nc-sa/4.0/) (non-commercial use).
