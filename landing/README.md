# Shores O’ Fortune · landing page

A standalone static page for the game: no build step, no dependencies. Every image is a real in-game render.

## Deploy on Vercel

1. In Vercel, **Add New › Project** and import this repository again (a second project, separate from the game).
2. Set **Root Directory** to `landing`. Framework preset: **Other**. Leave the build command empty.
3. Deploy. Add your own domain under **Settings › Domains** if you like.

For link previews on social media, change the two `og:image` / `twitter:image` tags in `index.html` to the full address, e.g. `https://your-domain/og.jpg`.

## Where the buttons go

The two lines at the top of `main.js`:

- `PLAY_URL`: the live game (`https://aquati.vercel.app`).
- `REPO`: the GitHub repository. The page asks GitHub for the newest release that has an `.apk` attached and links **Download for Android** straight to it, with its version and size. Until a release with an APK exists, the button says *Coming soon* and opens the releases page.

## Files

- `index.html`, `style.css`, `main.js`: the page.
- `img/`: WebP renders in a few sizes each (`hero`, ships, sky, adventures, postcards, device screens).
- `fonts/`: Cinzel and Inter, self-hosted.
- `og.jpg`: the 1200 × 630 link-preview image.
