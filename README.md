# WARDROBE.EXE

Virtual fitting room, Windows 95 edition. One static `index.html`, no build, no server.

1. Drop a photo of a person (full body works best).
2. Drop one or more outfits / costumes.
3. Press **► TRY IT ON**, enjoy the fake dial-up theatre.
4. Get a closet: every look hangs sideways on a rack. Hover a hanger and it spins around to face you
   (chunky `steps()` animation, voxel-thick slab). Click to open it, right-click to see the back (the original outfit).

## AI

Uses Google's Gemini image model ("Nano Banana", `gemini-2.5-flash-image`, or Nano Banana Pro) straight from the browser.
Paste your key in the page. It is stored in your browser's `localStorage` only and sent only to
`generativelanguage.googleapis.com`. Nothing is stored in this repo.

No key → demo mode: a deliberately bad collage, so you can see the rack without paying anyone.

## Deploy

Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
