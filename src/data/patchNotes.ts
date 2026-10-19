// Player-facing patch notes. Newest group first; groups are by hour (UTC),
// at most five entries per group.

export interface PatchEntry {
  title: string;
  notes: string[];
}

export interface PatchGroup {
  hour: string; // ISO hour, e.g. 2026-10-19T06:00Z
  entries: PatchEntry[];
}

export const PATCH_NOTES: PatchGroup[] = [
  {
    // the 14:00 group below is full (five entries), so this hour continues here
    hour: '2026-10-19T14:00Z',
    entries: [
      {
        title: 'Save your own ship designs',
        notes: [
          'The Shipwright\'s Presets tab has a new Your designs shelf. Tap Save this design to keep the flag, sails, hull and ship\'s name you are wearing, and tap a saved design any time to put it straight back on your ship.',
          'Keep up to twelve. Saving another design for the same ship numbers it for you (Sea Biscuit II), and the × on a card deletes it after a second tap, so nothing goes by accident. Your designs stay saved on this device between visits.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T14:00Z',
    entries: [
      {
        title: 'A brand new look for every screen, and a HUD that fits your phone',
        notes: [
          'On phones the sailing HUD is far smaller and tidier: a slim ship card with your hull bar, gold, kills and isles; a neater minimap with the wind and the time in a strip underneath; and pause and captain\'s view buttons that sit beside the map instead of on top of your guns. The speed readout now sits low in the middle, out from under your thumb.',
          'Everything is built from frosted ocean glass with crisp modern type, and whatever you point at or select lights up with a soft white glow. Ship names, isles and the Aquati crest keep their old-world lettering.',
          'The pause menu is new: a clean list down the left with your voyage stats beside it and a tip from the crew. Use the arrow keys to move through it, jump straight to the sea chart, and Return to harbour now asks for a second press so you never lose a voyage by accident.',
          'A new Settings screen lets you turn the sound and the harbour music on or off, hide the frame counter, choose a Compact, Standard or Large HUD, and tone the camera shake down to Gentle or Off. Graphics has a button of its own on the home screen and in the pause menu.',
          'The home screen, sea chart, patch notes, controls, shipwreck screen, Graphics card and the Shipwright all share the new style, and every one of them is laid out for landscape phones, portrait phones, tablets and desktops, clear of notches and rounded corners. The HUD also no longer blurs the sea behind it, which saves a little work on every frame.',
        ],
      },
      {
        title: 'Quieter gunnery marks',
        notes: [
          'The big painted arcs, the spinning reticle and the range lines are gone. Aiming works exactly the same, but it now stays out of the way of the sea and the fight.',
          'In a fight, a few short ticks on the water by your hull mark the edges of each broadside. They fill outward while the crews reload and warm to gold once the guns are run out.',
          'When a foe sits off a loaded beam, a soft gold glint circles her waterline: that is your moment to fire. Your gun buttons warm too, without the pulsing.',
        ],
      },
      {
        title: 'Finer ships and a livelier crew',
        notes: [
          'Hulls now have real planking you can see in the light: raised strakes, seams, butt joints and treenails, with weathering streaks down the sides. The decks show knots and sun-bleached patches, and the sails have double-stitched seams, reef points, corner patches and the odd sewn-on repair.',
          'Every ship gets a proper stern: a hung rudder with iron straps, gilded quarter pieces at the corners and a gold moulding along the rail. At the bow, a gilded mermaid figurehead leads the way, with carved trailboards, scrolled head rails, hawse holes and an anchor cable.',
          'Masts are now built in sections, lower mast, topmast and topgallant, with caps and iron bands. Yards carry footropes and blocks, the bowsprit has its martingale and jib-boom footropes, and gun crews have breeching ropes and racks of shot between the guns.',
          'The decks are fitted out: lattice gratings, a turned ship\'s wheel, a binnacle, a skylight, a ship\'s bell in its belfry, pin rails and fife rails hung with coils of rope, and a galley stovepipe trailing a wisp of smoke on the wind.',
          'The crew have faces now, with eyes that blink, brows, noses and smiles, plus beards, moustaches, ponytails, eyepatches, earrings, vests, kerchiefs, belts, pistols, boots and the odd peg leg. Your captain wears a long coat with epaulettes and a plumed hat, with a parrot on the shoulder that flaps and looks about.',
          'Off duty, sailors puff on clay pipes, sip from mugs, and on a bigger crew someone strikes up a fiddle while a few shipmates dance a jig.',
        ],
      },
      {
        title: 'Smooth battles: no more hitches',
        notes: [
          'Fixed the stutter when cannonballs hit, masts snapped or a ship went down, which mostly struck in your first fights and faded the longer you played. The game now does all of that warm-up while it loads: every effect, wreck piece and ship paint scheme is drawn once behind the loading screen, so nothing has to be prepared mid-battle.',
          'Snapping a mast or breaking a hull in two is about five times faster, and when a ship loses several spars at once they now come down over a few frames instead of all landing in one.',
          'New pirate ships are built quietly in the background a little at a time, so a ship or a whole flotilla sailing over the horizon no longer causes a hitch, and a replacement waits until the wreck you just sank has settled.',
          'The automatic resolution adjustment no longer overreacts to one slow moment in a battle. It used to drop the resolution right after a big explosion, which caused another hitch, and then step it back up while you were still fighting.',
          'The "ship sunk" and island banners no longer blur the sea behind them as they slide in, which used to make the frame jump on some devices, and the game\'s fonts now load up front.',
        ],
      },
      {
        title: 'Ray-traced light and a Graphics menu',
        notes: [
          'The sea is now a mirror: hulls, sails, masts and island cliffs reflect in the water, rippling and breaking up with the waves. Calm water right beside your hull shows it best.',
          'Light is ray traced across the scene. Shadows fall crisp wherever things touch (crew on the deck, guns on their carriages, rocks on the sand), creases, coves and the deck under the bulwarks sink into soft shade, and sunlight bounces colour onto nearby surfaces.',
          'Shadows are now soft the way real sunlight makes them: sharp at the foot of a mast or palm, softening the further they fall.',
          'New Graphics menu, in the harbour and in the pause menu. Pick Auto, Low, Medium, High or Ultra, or tune each effect yourself: reflections, contact shadows, ambient occlusion, bounce light, shadow detail, soft shadows, resolution, anti-aliasing, bloom and tilt-shift. Every change shows live on the sea behind the menu, with a frame-rate readout, and your choice is remembered.',
          'Auto stays the default: it picks a level for your device, trades resolution for a steady frame, and if that is still not enough it gently turns effects down.',
        ],
      },
    ],
  },
  {
    // the 13:00 group below is full (five entries), so this hour continues here
    hour: '2026-10-19T13:00Z',
    entries: [
      {
        title: 'Aiming you can read at a glance',
        notes: [
          'Your guns now show exactly where they can fire: two arcs painted on the sea off either beam, rising and falling with the swell. They fill outward in teal while the crews reload and turn gold the moment the guns are run out, with a knock from the gun deck and a glint on that side\'s button.',
          'Bring a foe into a gold arc and the guns lock on: chevrons stream toward her, a reticle snaps square around her hull, a gold line marks the range and a pip shows where the shot will land. If she is just outside, the edge you need to turn across glows.',
          'Your gunners now allow for your own ship\'s speed as well as the enemy\'s, so broadsides in a running fight no longer sail past the bow, and they can train a little further fore and aft.',
          'With a mouse, point into either side to see that arc, and click to fire it: at the foe in it, or wherever you point. On touch, the side the Fire button will shoot is outlined, and Fire glows when a foe is locked and loaded.',
        ],
      },
      {
        title: 'The Shipwright: make your ship your own',
        notes: [
          'Press Shipwright on the home screen and row over to Puerto Marea, a little pirate harbour where your ship ties up at the quay while you restyle her.',
          'Design your own flag: pick a shape (square, swallowtail, tattered or burgee), a field colour, one of ten patterns and one of sixteen emblems, from skulls and krakens to parrots and crowns, with crossed bones, swords or a laurel behind it. You can even paint on the flag with your own brush.',
          'Colour your sails and give them stripes, a band, a border or a cross, with your emblem on the mainsail if you like. Repaint the hull too: topsides, planking, waterline, bottom, wale and the gold trim.',
          'Every change shows up on the ship as you make it, and the camera swings to the flag, the sails or the hull as you switch tabs. Drag to look around and scroll or pinch to zoom.',
          'Short on ideas? Try one of eight famous colour schemes, roll the dice for a surprise, and name your ship. Your design is saved and flies at sea on every voyage.',
          'The harbour is busy: pirates roll barrels and haul crates, a fisherman waits for a bite, a musician squeezes an accordion while a sailor dances, two old salts clink mugs, a painter touches up your hull from a rowboat, and someone is snoring in a hammock.',
        ],
      },
      {
        title: 'Rolling gun smoke and shot streaks',
        notes: [
          'Gun smoke is now a soft, rolling cloud that is lit by the sun: bright on top, shadowed underneath, and glowing at its thin edges when you look toward the light. It turns gold at sunset, cool and dim under the moon, and sinks into the haze in mist and rain.',
          'Every broadside throws three layers of smoke: a fast jet out of the gunport, a slow bank that hangs by the hull, and dark powder wisps flung from the flash. All of it drifts away on the wind and slowly frays apart, and rain knocks it down sooner.',
          'Cannonballs now leave a short bright streak behind them, so you can follow every shot across the water. It glows a little hotter at night, and the shot trails a thin wake of powder smoke that curls off on the breeze.',
        ],
      },
      {
        title: "Captain's view: walk your own deck",
        notes: [
          "Press V (or tap the new eye button) and the camera swoops down out of the sky into your captain's eyes. Press it again to soar back up.",
          'Walk the deck with WASD or the left stick, hold Shift to run, and look around with the mouse or by dragging the right side of the screen. You ride every roll and pitch of the hull, your boots knock on the planks, and the crew, guns, masts and barrels all get in your way.',
          'Climb the new companion stairs up to the quarterdeck and forecastle. Walk up to the wheel and press F (or tap Take the helm): your helmsman steps aside, and the ship answers to you. Arrow keys sail and steer from anywhere on deck, and when you let go of the wheel she holds her course.',
          'Turn to face a beam and click (or tap Fire) to loose that broadside. Raise the spyglass with Z, a right click or the touch button to pick out an enemy crew at the far side of a battle.',
          'From the deck you finally see the horizon: an open sky with drifting clouds that cast the very shadows you see sliding over the sea, a blazing sun, stars and the moon at night, and water that runs all the way out to a hazy horizon. Step back into your view later and you pick up exactly where your captain is standing.',
        ],
      },
      {
        title: 'A quieter wheel',
        notes: [
          'Once you take the helm in the captain\'s view, the "Leave the helm" prompt shrinks to a small tag just above the helm console, so it no longer sits in the middle of your view.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T13:00Z',
    entries: [
      {
        title: 'Hulls collide: ramming and running aground',
        notes: [
          'Ships now properly bump into each other, shaped like their hulls: a glancing blow slides along her side and swings both bows, while a bow driven square into a beam stops dead. Heavy ships hold their ground and light ones get shoved aside and spun.',
          'Ramming hurts. A hit lands with a deep timber crunch, splinters, a burst of spray and a jolt of the camera, and staves in planking based on how fast you closed. Your bow takes the blow far better than the side you hit, so a galleon at full sail can break a sloop in half. Two ships grinding slowly past each other creak and squeeze up foam instead.',
          'Running aground now sounds like it too, with the keel grinding on rock and water thrown up along the shore.',
        ],
      },
      {
        title: 'Battles framed like a duel',
        notes: [
          'When you trade broadsides with another ship, the camera now glides to the middle of the two of you and pulls back just enough to keep both hulls in view, so you can always see your foe, her guns and where your shot is falling. When the fight ends it eases back to follow your ship again.',
        ],
      },
      {
        title: 'Masts hauled back up',
        notes: [
          'Once your crew has patched the hull, lost masts and the bowsprit no longer just pop back into place. Each one grows out of its splintered stump and is hauled back up in turn, from bow to stern, swinging up off the rail, rocking just past upright and settling into place with a solid knock, a puff of sawdust and a glint running up the new timber.',
          'No more lookout left standing on thin air: nobody is posted up the masts any more, so a falling mast no longer leaves a sailor floating where the top used to be.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T13:00Z',
    entries: [
      {
        title: 'Busier seas: pirate flotillas',
        notes: [
          'Far more pirates now roam the archipelago, up to eleven around you at once as your tally of sinkings grows, and fresh sails appear on the horizon much sooner after you weigh anchor.',
          'Pirates also sail in flotillas now: a brigantine or galleon flagship with two or three escorts keeping station on her quarters in a loose vee. When any ship in the pack sights you, the whole flotilla comes about to hunt you together.',
          'Pirates you leave far astern are swapped for new ones nearer your course, so the waters around you never go quiet.',
        ],
      },
      {
        title: 'Day and night, wind and weather',
        notes: [
          'The sun now rises, arcs across the sky and sets over a full day of about 20 minutes. Mornings and evenings linger in gold and rose, the blue hour fades into night, and then the moon takes over, laying a silver path across the sea while stars glitter in the water. Lanterns and stern windows glow in the dark.',
          'On dark nights churned water glows with bioluminescence: your wake, the surf on the reefs and the breaking crests all shimmer blue-green.',
          'The weather now lives and changes on its own: clear days, fair skies with drifting cloud shadows, grey overcast, morning sea mist, rain and full storms. It all blends smoothly. The clouds gather first, then the rain arrives, and the sea takes longest of all to build and to settle again.',
          'Rain slants with the wind, pocks the sea with rings and splashes, and leaves decks, sails and rocks dark and glistening until they slowly dry.',
          'Storms bring forked lightning striking the sea and lighting up the sky, thunder that rolls in late from far away, a howling wind, towering swells that toss your ship about, whitecaps, wind-torn spray and long streaks of spume. The wind follows the weather too, so you sail faster in a blow and slower in the mist. A new badge beside the minimap shows the time and the weather.',
        ],
      },
      {
        title: 'Your whole ship on the home screen',
        notes: [
          'The home screen camera now frames your entire ship, from keel to the top of the tallest mast and out to the tip of the bowsprit, on any screen size. It fits snugly to the ship\'s real shape, so she sits big and centred in the open water beside the menu, and the camera glides in or out as you switch between the sloop, brigantine and galleon.',
        ],
      },
      {
        title: 'A captain\'s HUD',
        notes: [
          'The in-game HUD now matches the new menus. Your ship panel shows a little silhouette of your vessel, a planked hull bar that leaves a pale trail when you take a hit (and shakes the panel), and gold, sunk and isles counters that pop when they go up.',
          'The minimap wears a brass compass bezel with a gold north pointer, and the wind gauge is a matching brass dial.',
          'Port guns, sails and speed, and starboard guns now sit together in one helm console. Each broadside has a cannon dial that fills while reloading and glows gold when it is ready to fire. Your sail setting shows as three little sails.',
          'On phones the fire controls are rebuilt: a big gold Fire button with port and starboard buttons either side, each ringed with its own reload meter. The steering stick has a brass helm ring and a gold knob.',
          'Pirate health bars and island toasts have been restyled to match.',
        ],
      },
      {
        title: 'Natural cannonball impacts, calmer seas',
        notes: [
          'Balls striking a hull now land with a heavy oak thunk, the crack of planks giving way and a burst of snapping splinters, then chunks clattering onto the deck. The odd ringing, xylophone-like tones are gone.',
          'Shots into the sea hit with a hard slap and a deep underwater whump, the column of water hisses up and then showers back down in a long patter of spray. No more chirpy bubbles.',
          'Shots into beaches thud dully and scatter sand, and the debris raining down after a ship explodes sounds like real splinters and wreckage.',
          'The background wind and surf are much quieter now, so the sea sets the mood without drowning out the guns and music.',
        ],
      },
    ],
  },
  {
    // the 12:00 group below is full (five entries), so this hour continues here
    hour: '2026-10-19T12:00Z',
    entries: [
      {
        title: 'Crisp, gorgeous islands',
        notes: [
          'The islands were looking a little soft and blurry. Every patch of ground is now painted pixel by pixel, so beaches, meadows, cliffs and reefs stay sharp and clean however close you sail, and the soft blur along the top and bottom of the screen is now only a faint whisper at the very edges.',
          'Look closer and the ground has real texture: wind-combed ripples in the sand and shallows, clumpy turf with a darker lip where it meets the beach, wildflowers dotting sunny clearings, mossy grey rock, banded sandstone canyons on the rocky isles and dark basalt on the volcano.',
          'Under the water, seagrass meadows sway in dark patches and rounded coral heads in pink, peach, violet and gold crowd the reef shelves around the islands.',
          'Monte Aquati is awake: glowing lava seeps through the cracked crust of its crater and pulses gently beneath the smoke.',
          'New life on the islands: tufts of grass that bend in the gusts, flowering hibiscus shrubs, sea stars in the surf, bleached driftwood on the sand, and boulders that match each island\'s own stone.',
        ],
      },
      {
        title: 'Battle damage you can see, and wrecks that stay',
        notes: [
          'Every cannonball now punches a real, jagged hole through the planking. Look through it into the dark hold, with splintered boards bristling from the edges and embers glowing red before they cool to soot.',
          'Hulls blacken with scorch as a fight goes on, sails tear into ragged, burnt-edged rags, and a flooding ship rides lower and lists toward her holes. Smoke curls out of the breaches.',
          'Masts crack, topple over the side and splash into the sea, and a bowsprit can snap clean off. High shots tear through canvas, and losing a mast costs you speed until your crew re-rigs.',
          'Planks, barrels and crates blast off into the water, bob on the swell and drift with the wind. Your hull shoulders the floating wreckage aside. Heal up and your crew boards the holes over with fresh planks.',
          'Sunk ships no longer vanish. They break in two or roll onto their side and settle as smouldering wrecks, sterns jutting from the waves, for three minutes before slipping under.',
        ],
      },
      {
        title: 'The harbour has a song',
        notes: [
          'The home screen now plays "Sunset Archipelago", our own harbour theme. It drifts in with your first tap or key press, loops while you choose your ship, and fades away as you set sail so the sea and the cannons take over. Come back to port and it starts again.',
          'The sound button turns it off along with everything else, and it hushes whenever you switch away from the game.',
        ],
      },
      {
        title: 'All hands on deck: living crews',
        notes: [
          'Every ship now carries a crew you can watch at work: a captain in a tricorn and long coat, a helmsman at the wheel, gun crews, deck hands and a lookout up in the fighting top. Your sailors wear striped shirts and straw hats, pirates go in bandanas and beards, and no two look alike.',
          'They follow what the ship is doing. The helmsman hauls the wheel over as you turn, and hands run to the rails to heave on the lines whenever you trim the canvas or the yards swing across on a tack.',
          'When an enemy closes, the crew beats to quarters. Gunners race to the guns on the side facing the foe, put the glowing match to each gun as it fires, leap clear of the recoil, then sponge, load, ram and run the gun out again, all in time with your real reload. Powder boys shuttle cartridges from the hatch, and the captain draws his cutlass and points the broadside home.',
          'In quiet water they swab the decks, coil rope, lean on the rail, sit on the barrels and swap stories. Everyone ducks when a ball strikes, cheers when an enemy goes down, and fights fires with buckets when the ship is badly hurt.',
          'When a ship founders, her crew leap over the side and swim for it, the lookout dives from the top, and the captain salutes as he goes down with her.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T12:00Z',
    entries: [
      {
        title: 'A harbour worth leaving from: new menus',
        notes: [
          'The home screen has been rebuilt around your ship. Pick a vessel from a sleek dock on the side, each shown as its own little silhouette drawn from the real hull and rigging, while your chosen ship sails in clear view beside it.',
          'Every ship now shows its guns, hull and reload at a glance, with stat pips that glow from teal to gold. Use the arrow keys or 1, 2, 3 to switch ships and Enter to set sail.',
          'A new refresh button on the home screen fetches the latest version of Aquati and reloads, so installed players can grab updates right away. A gold dot on Patch notes tells you when something new has landed.',
          'Pausing now shows your voyage so far (time at sea, gold, ships sunk and isles charted) with sound, notes and controls right there. Sinking gets a proper farewell: your ship slips under the waves with a final tally.',
          'Patch notes read like a ship\'s log, the controls card is grouped into sailing, gunnery and navigation (with a touch-only version on phones), and Esc or tapping outside closes any card.',
        ],
      },
      {
        title: 'Wakes with a wilder edge',
        notes: [
          'Ship wakes no longer look ruler-straight. The wake arms now wander, kink and fray as they spread, and they fade in and out in patches.',
          'Churned water behind a hull is choppy instead of glassy, and the foam drifts in slow eddies and breaks white only here and there. The bow surges as she pitches, so no two wakes look the same.',
        ],
      },
      {
        title: 'No more black square after a sinking',
        notes: [
          'Sinking a ship could leave a huge pitch-black square floating on the water in front of the wreck. It was the glowing halo around the treasure it dropped, which broke on some graphics cards. Treasure halos and beacons now glow properly everywhere, and the image pipeline now filters out any bad pixel before it can spread into a dark block.',
        ],
      },
      {
        title: 'Cannons that really thunder',
        notes: [
          'Every gun has been recast in sound. A broadside now opens with a sharp supersonic crack, then a deep chest-thumping boom and a roaring fireball, with burning powder sputtering as it fades. Sloops bark, galleons rumble.',
          'Shots roll across the archipelago: the blast echoes back off distant islands and cliffs, so a broadside thunders and grumbles on for seconds after the last gun.',
          'Sound now travels at its real speed. Watch a pirate fire far off and you will see the flash first and hear the boom a heartbeat later, dulled and softened by the distance.',
          'On your own deck you hear the gun carriages slam back on their trucks and the breeching ropes snap taut, and the sea and wind dip for a moment under the roar.',
          'New impacts too: splintering, groaning timbers when a ball smashes a hull, a deep thoomp and falling spray when one plunges into the sea, dull thuds on beaches, enemy shot tearing past your ears, and ships going up with a magazine blast and raining wreckage.',
        ],
      },
      {
        title: 'Frame rate counter',
        notes: ['A tiny FPS counter now sits at the top of the screen, refreshed twice a second.'],
      },
    ],
  },
  {
    // the next 12:00 group is full (five entries), so this hour continues in a second group
    hour: '2026-10-19T12:00Z',
    entries: [
      {
        title: 'The sea chart no longer stops the world',
        notes: [
          'Opening the big chart no longer pauses the game. Your ship keeps sailing, pirates keep hunting and everything moves live on the chart, so you can plot a course on the fly. On a keyboard you can keep steering and firing while it is open.',
        ],
      },
      {
        title: 'Treasure rarities: common, rare, epic, legendary',
        notes: [
          'Chests now come in four rarities. Common chests are weathered wood and iron, Rare ones sea-blue lacquer and silver, Epic ones royal violet with gold and an amethyst, and Legendary chests are gilded, lid thrown open on a glowing hoard of coins and jewels.',
          'Finer chests shine a beam of coloured light into the sky and cast a glowing ring on the water, so you can spot a prize from across the bay. They are also plotted in their colours on the minimap and sea chart.',
          'Scooping one up sets off a burst of coins and coloured sparks with a rising chime, bigger for every rarity. Epic and Legendary finds get a banner, a heavier haul of gold and a bigger hull patch.',
          'Tougher prey drops better treasure: brigs beat sloops, and every sunk galleon is guaranteed at least a Rare chest.',
        ],
      },
      {
        title: 'A truly open sea',
        notes: [
          'The pale green blotches that dotted the water in a repeating grid are gone. The swell is now built from eight wave trains instead of five, so it rolls like real open ocean and never settles into a visible pattern.',
          'Richer colour: deep water drifts between dark sapphire and bright cobalt from one stretch to the next, swell faces catch the sun, and the shallows glow turquoise as before.',
          'Finer, livelier ripples layered at many scales, with long glassy wind slicks running downwind and a twinkling sun glitter that widens where the water is rough.',
          'Gusts now darken and ruffle the sea into matte, sparkling cat\'s paws instead of pale patches, and they whip up the odd whitecap as they pass. Whitecaps elsewhere break only here and there, like a real breezy day.',
        ],
      },
      {
        title: 'A lower, more cinematic view',
        notes: ['The sailing camera now sits a little lower and looks across the sea at a gentler angle, so ships, waves and islands read with more depth.'],
      },
      {
        title: 'Wakes that ripple and roll',
        notes: [
          'Every hull now carves real waves: a curling bow wave, the classic V of wake arms fanning out behind, and gentle rolling swell in between. The waves move, catch the sunlight and fade as they spread.',
          'The wake is a living simulation. Waves slow down in the shallows, bend around islands and die on the beach, and crossing another ship\'s wake looks just as it should.',
          'Richer foam: a churning white wash off the stern, foam sheets peeling off both bows and along the hull, and a fan of spray when you put the helm hard over. Old foam breaks up into delicate lace as it fades.',
          'Bow spray flies off the bows at speed, with bigger bursts when she buries her nose in a swell. Cannonball splashes now send rings of ripples across the water.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T12:00Z',
    entries: [
      {
        title: 'Cannons fire on mobile',
        notes: [
          'The Fire, Port and Starboard buttons on touch screens now actually fire your broadsides, instantly on contact, with a little buzz on phones that support it.',
          'Touch controls now appear the moment you touch the screen, even on devices that didn\'t announce themselves as touch, and mouse clicks fire again on touchscreen laptops.',
        ],
      },
      {
        title: 'Shipwrights\' overhaul: rounder, richer ships',
        notes: [
          'Every hull has been reshaped with a fuller, softer bow, a rounder belly and castles that sweep gracefully up out of the deck line, finished with a chunky rounded wale, a keel and stem, and a thicker gilded rail.',
          'Guns now sit on little red truck carriages on deck and run out through framed gunports with their lids swung open. The barrels are properly turned, with knobs, rings and a flared muzzle.',
          'Masts gained iron bands, rounded fighting tops with railings, crosstrees, channels with deadeyes and climbable ratlines. Yards taper to rounded tips, and the bowsprit carries a jib-boom.',
          'The Brigantine and Galleon have curved, bulging sterns with railed stern galleries and glowing quarter-gallery bay windows; the Galleon also carries a ship\'s boat on skids amidships.',
          'Gilded figureheads and head rails, catheads with hanging anchors, turned barrels, coiled lines, a spoked wheel, a capstan with its bars and new glass lanterns finish the decks.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T12:00Z',
    entries: [
      {
        title: 'Airier wind wisps',
        notes: [
          'The white wind wisps are now long, fine threads of air that streak past twice as fast, with lazier, sweeping curves and wider loops. There are more of them inside a gust.',
        ],
      },
      {
        title: 'Unroll the sea chart',
        notes: [
          'Tap or click the minimap, or press M, to open a full chart of the whole archipelago. Drag to pan, scroll or pinch to zoom, and tap the ring button to centre on your ship.',
          'Discovered isles are named on the chart, uncharted ones are marked with a "?", and salvage, nearby pirates and the wind are all plotted. The world holds still while you plan your course.',
        ],
      },
      {
        title: 'Wind you can see: real gusts',
        notes: [
          'Gusts now roll across the sea as dark, shimmering patches of ruffled water racing downwind, just like real cat\'s paws on a breezy day.',
          'Palms and trees lean with the breeze and get shoved over as a gust sweeps across the island, leaves shivering, then spring back once it passes.',
          'Little white wisps of air ride inside the strongest gusts, curling and sometimes looping before they fade away.',
          'Catch a gust and your sails puff out harder for a small burst of speed. The wind sound and the compass arrow swell as it blows through.',
        ],
      },
      {
        title: 'Stronger loot magnet',
        notes: [
          'Floating crates and barrels now get pulled toward your ship from twice as far away, gliding in faster the closer they get.',
        ],
      },
      {
        title: 'Sails that swing, not snap',
        notes: [
          'When you tack or gybe, the yards and booms now swing across with real weight, overshooting a touch before settling, instead of flipping sides instantly.',
          'The canvas spills its wind and goes slack as it crosses over, then fills out again on the new side. Bigger ships swing their rigs more slowly.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T05:00Z',
    entries: [
      {
        title: 'Aquati sets sail: the first playable voyage',
        notes: [
          'Choose your ship: the nimble Sloop, the balanced Brigantine or the mighty three-masted Galleon. Each has its own speed, handling, armour, hull strength and broadside.',
          'A hand-crafted feeling archipelago: a smoking hero volcano, turquoise lagoon atolls, ochre sandstone cliffs and lush jungle isles, all generated fresh with beaches, reefs and coral.',
          'Living ocean: rolling swell your ship actually rides, crystal-clear shallows with dancing caustics, sun glitter, cloud shadows, surf lines on every shore and foaming wakes behind every hull.',
          'Broadside combat: ripple-firing cannons with smoke, muzzle flashes, splashes and flying splinters. Pirate captains hunt you, circle for a broadside and flee when their hull is in tatters.',
          'Explore and plunder: discover every island for a bounty, salvage barrels and treasure chests from sunken foes to fill your coffers and patch your hull. Plays on desktop and phones, and installs as an app.',
        ],
      },
    ],
  },
];
