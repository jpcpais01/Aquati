# Shores of Fortune · mobile ads

Ready-to-upload 9:16 ads for TikTok, Instagram Reels and Stories, YouTube Shorts and Snapchat.
Every frame is real in-game footage, rendered by the game itself at 1080 × 1920. Nothing is painted over or mocked up.

Click a **Download** link to save the full-resolution file.

| | | | |
|:-:|:-:|:-:|:-:|
| <img src="shores-of-fortune-ad-1-sail-into-paradise.png" width="200" alt="Sail into paradise"> | <img src="shores-of-fortune-ad-2-choose-your-ship.png" width="200" alt="Choose your ship"> | <img src="shores-of-fortune-ad-3-the-deep-is-waking.png" width="200" alt="The deep is waking"> | <img src="shores-of-fortune-video-ad-preview.gif" width="200" alt="Video ad preview"> |
| **1 · Sail into paradise** | **2 · Choose your ship** | **3 · The deep is waking** | **4 · Video ad (24 s)** |
| [Download PNG](https://github.com/jpcpais01/Aquati/raw/main/marketing/ads/shores-of-fortune-ad-1-sail-into-paradise.png) | [Download PNG](https://github.com/jpcpais01/Aquati/raw/main/marketing/ads/shores-of-fortune-ad-2-choose-your-ship.png) | [Download PNG](https://github.com/jpcpais01/Aquati/raw/main/marketing/ads/shores-of-fortune-ad-3-the-deep-is-waking.png) | [Download MP4](https://github.com/jpcpais01/Aquati/raw/main/marketing/ads/shores-of-fortune-video-ad.mp4) |

**Bonus:** <img src="shores-of-fortune-ad-bonus-fire-at-will.png" width="110" align="top" alt="Fire at will"> **Fire at will!**, a fourth image ad built around a galleon's broadside. [Download PNG](https://github.com/jpcpais01/Aquati/raw/main/marketing/ads/shores-of-fortune-ad-bonus-fire-at-will.png)

## What each ad sells

| Ad | Hook | Shows |
|---|---|---|
| 1 · Sail into paradise | Explore | A brigantine running past the Cayo Sol atoll at mid-afternoon: turquoise shallows, palms and the bow wave. |
| 2 · Choose your ship | Variety | The sloop, brigantine and galleon sailing in echelon. Each is tagged with its real gun count and its speed, armour and firepower from the game's ship stats. |
| 3 · The deep is waking | Danger | The kraken surfacing in a storm, with its arms rising around your ship. |
| Bonus · Fire at will! | Combat | A galleon's broadside tearing into a dismasted pirate brig off Rumbelow's quay, and the five kinds of shot. |
| 4 · Video ad | All of it | Your ship and your sea, then broadside battles, choose your ship and beware the deep, ending on the logo and the call to action. |

## The video ad

- 1080 × 1920, 30 fps, H.264 + AAC, 24.5 seconds. Small enough for every platform's upload limit.
- **Sound:** the game's own soundtrack (*Sunset Archipelago*), mixed with the game's synthesized cannon, timber and splash effects. Each cannon is timed to its muzzle flash on screen.
- The text is designed to work with the sound off, since most feeds autoplay muted.
- There is a 1.5-second end card with the logo and **Play free now**, for platforms that freeze on the last frame.

## Copy used

- Call to action: *Play free now* / *Take the helm* / *Face the deep* / *Join the battle*.
- Footer: *No download · Phone, tablet & PC · In your browser*. It is accurate because the game is an installable web app.
- No reviews, ratings or download counts are claimed. Add the game's link in the ad platform's link field.

## Editing or re-making them

`source/` holds the layouts as plain HTML and CSS: the game's wordmark, Cinzel and Inter, and frosted-glass chips. It also has the raw in-game captures behind them. To change a headline, edit the HTML, open it in Chrome at a 1080 × 1920 viewport and take a screenshot. `source/overlay.html` is the video's animated text layer. Its `render(t)` function draws any moment of the timeline.
