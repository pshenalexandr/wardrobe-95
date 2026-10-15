# WARDROBE.EXE

Virtual fitting room, Windows 95 edition. One static `index.html`, no build, no server.

1. Drop a photo of a person (full body works best).
2. Drop one or more outfits / costumes.
3. Press **► TRY IT ON**, enjoy the fake dial-up theatre.
4. Get a closet: every look hangs sideways on a rack. Hover a hanger and it spins around to face you
   (chunky `steps()` animation, voxel-thick slab). Click to open it, right-click to see the back (the original outfit).

## AI

Three calls, not one. Asking "put person A into outfit photo B" in one go makes the model take the
lazy route and paste A's face onto photo B. So:

1. **Prep the model** (once per person, optional): cut out onto a grey backdrop, re-pose to a neutral stance only if they aren't standing already.
2. **Strip the outfit** (per outfit): turn the outfit photo into a ghost-mannequin product shot. Clothes only, no person, no background.
3. **Try on**: clothes image first, person image last, phrased as an *edit of the person photo* that keeps their pose and framing.

## Styles

- **PIXEL LITE / CRUNCHY / CHUNKY**: the try-on photo, downsampled and dithered. LITE keeps faces readable.
- **LEGO 3D VOXEL**: one extra call asks Nano Banana for a flat pixel-art sprite of the dressed person on a green screen.
  `lego.js` cuts it out, shrinks it to a ~64-brick-tall grid and inflates it into 3D: each column gets a thickness
  proportional to its distance from the outline, so the torso is thick and arms and hat brims are thin. Then it puts
  studs on top and hangs the figure on a voxel hanger. Rendered with three.js (loaded from jsDelivr only in this mode) at a deliberate 12 fps.

Switching style re-renders the rack without new API calls. Lego made from an earlier pixel run bricks the photo
directly, so it's less clean than one made with the sprite call.

The viewer (click a hanger) shows every stage: Pixel / Full res / Garment / Model / Source.
The back of each hanger is the stripped garment.


Uses Google's Gemini image model ("Nano Banana", `gemini-2.5-flash-image`, or Nano Banana Pro) straight from the browser.
Paste your key in the page. It is stored in your browser's `localStorage` only and sent only to
`generativelanguage.googleapis.com`. Nothing is stored in this repo.

No key → demo mode: a deliberately bad collage, so you can see the rack without paying anyone.

## Deploy

Live at https://pshenalexandr.github.io/wardrobe-95/ — served from the `gh-pages` branch.
To update: `git push origin main main:gh-pages` (or switch Settings → Pages to `main`).
