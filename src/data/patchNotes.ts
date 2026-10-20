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
    hour: '2026-10-20T12:00Z',
    entries: [
      {
        title: 'A smaller, tidier HUD that keeps the sea in view',
        notes: [
          'Fort alerts, warnings like "opens fire!" and the "Go ashore" button were far too big and sat right over the middle of the screen. They are now slim pills: the fort\'s name, guns and garrison fit on one short strip at the top, alerts stack neatly under it, and the "Go ashore" button sits low, just above your speed, out of your ship\'s way.',
          'The ship card in the top left is slimmer, with smaller type, and your gold, hold and tallies sit in neater chips beneath it.',
          'The minimap is a fifth smaller, and the pause, captain\'s view and photo buttons are now a small row tucked under the wind and clock instead of a column beside the map.',
          'The game is fullscreen, so the HUD no longer leaves a wide gap for the notch and system bars. Instead everything keeps a clean, even 3% margin from every edge of the screen.',
        ],
      },
      {
        title: 'The port market fits on every phone, and the loading compass spins true',
        notes: [
          'On phones, especially held sideways, the trading port panel no longer runs off the bottom of the screen. Everything between the port\'s name and Cast off now scrolls as one smooth list, so the Chandlery, the Shipwright and the Harbour master are always a swipe away.',
          'Your gold and the port\'s name stay pinned at the top and Cast off stays pinned at the bottom, and each section\'s heading sticks to the top while you scroll through it. A soft fade at the bottom tells you there is more below.',
          'On short screens the panel is more compact, and on phones held upright it can now use a little more of the screen.',
          'The compass rose on the loading screen and the menus now turns on its own centre instead of swinging around off to one side.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-20T11:00Z',
    entries: [
      {
        title: 'New touch controls: a sail lever and a helm that only steers',
        notes: [
          'On phones and tablets your speed now has its own sail lever in the bottom left corner, with four notches: Stop, Slow, Half and Full. Slide the brass knob or just tap a notch. It clicks into each one as you pass it (with a little buzz on phones that support it), and it stays where you leave it, just like W and S on a keyboard. Stop takes in all canvas, so at last you can bring her to a dead halt to line up a broadside, wait at a reef pass or sit off a fort.',
          'The knob is a tiny square-rigger whose sail drops as you set more canvas, and the gold in its rail fills as your crew actually sets or takes in the sail, so you can see her gathering way.',
          'The steering stick no longer touches your speed. Put your thumb anywhere on the left half and drag toward where you want the bow to point: the ring shows a white mark for where she points now and a gold arc for the turn still to come. Let go and she holds her course. You can still turn slowly with the sails at Stop.',
          'In the captain\'s view the stick at the wheel now only steers too, and the lever trims the sails.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-20T10:00Z',
    entries: [
      {
        title: 'Sea hazards: maelstroms that drag you down and coral reefs that tear your hull',
        notes: [
          'Three great maelstroms now turn in the open sea: La Garganta, El Remolino Negro and the Ojo de Caribdis. The water winds round in white spiral arms that turn faster the nearer they come to the eye, the surface sinks into a funnel you can see your ship heel down into, and a black throat waits at its heart. They swell and slacken over time, and grow wilder and wider in a storm, so watch for them roaring in the distance.',
          'Sail into one and the current takes you: it sweeps you round, swings your bow and draws you inward. Out at the rim you can sail clear with full sail and a course out. Further in, the strain starts to work your hull, and near the throat it tears at her. Anything floating, cargo and wreckage included, is drawn round and swallowed.',
          'Four coral reefs now lie just under the surface: the long Arrecife del Diablo barrier with its narrow passes, La Herradura horseshoe with a sandy lagoon inside, and the scattered heads of Los Dientes and the Bajo de las Ánimas. You can see them glowing turquoise through the water, with the swell breaking white over their crests. Whether you clear them depends on how deep your ship sits: a sloop can slip over coral that will rip the bottom out of a galleon.',
          'Run onto a reef and you grind to a halt with a crunch of timber, losing hull with every bite, worse the faster you hit. A pill at the top of the screen warns you before you get there: "Shoal water ahead", with how much water is over the coral against how much your ship draws, a ship\'s bell, and an arrow pointing to deep water. Inside a maelstrom it shows how tight its grip is and the way out. Both are marked on the minimap and the sea chart.',
          'Pirates steer around maelstroms and reefs, but one that is chasing you hard will follow you across the coral or too close to the funnel. Lure her in and if the sea finishes her you get the bounty and the kill. Being sunk by either now has its own line on the farewell screen.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-20T08:00Z',
    entries: [
      {
        title: 'Island forts: silence their guns, storm the gate and fly your flag',
        notes: [
          'Three Spanish-built stone forts now stand on the islands, held by the Brethren: Castillo San Felipe, Fuerte Santa Bárbara and Castillo del Morro. Each has corner bastions with sentry boxes, a barracks, a powder magazine, a flagstaff with the black flag and four bronze guns on its ramparts. They show on the minimap and the sea chart.',
          'Sail within range and the shore batteries open up on you. They lead their shots, traverse to follow you and hit hard, so keep moving. Aim at the guns themselves (your gunnery marks lock on to them) and each one you smash goes quiet and smokes. A bar at the top of the screen shows the fort\'s name, which guns still stand and what to do next.',
          'With its guns silenced you can land on its beach. Climb the ramp to the gate and the garrison of five, led by a tough Commandant, sallies out to meet you. Cut them down and the gates are open: their pay chest holds gold, shot and ship gear, and you run your own flag up the staff.',
          'A fort that flies your flag is yours for good. Its guns fire on any pirate that comes near you, it pays tribute in gold every hour (sail by to collect it, up to eight hours\' worth), restocks your shot, and its anchorage slowly mends your hull and your escorts\' while you lie under its guns.',
          'Your forts are saved with your progress and synced between devices. Sinking under a fort\'s guns now gets its own line on the farewell screen.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-20T06:00Z',
    entries: [
      {
        title: 'Your own fleet: up to two escorts that sail and fight at your side',
        notes: [
          'Board a pirate and win her deck, and the prize card now has a third choice: Sign her into your fleet (key 3). Her crew sign the articles, your flag runs up her mast, and she falls in on your quarter with one of her own hands at the helm. She keeps the paint she was taken in but flies your colours, from then on and every voyage after.',
          'Harbour masters at the trading ports now have two ships for hire each day, each with a named captain and a line about them. A sloop is 2,500 gold and a brig or galleon costs more, paid from your purse. A hired ship wears your own paint and hull skin. The harbour master is also where you pay a ship off (click twice to be sure) and see every escort\'s hull and tally.',
          'Escorts keep station astern on your quarters, one to each side, matching your course and speed and closing up when they fall behind. Press G, or tap the signal buttons under your ship\'s panel, to run up an order. Form on me: they guard you and turn on anyone who comes for you. Attack my target: they break formation and go for whatever your guns last hit (crossed swords mark her). Hold position: they heave to where they are and fight from there. Each escort calls back her answer over her deck.',
          'They fight with real broadsides, can be holed, set ablaze and sunk, and the pirates will turn on them. Every ship they sink pays you the bounty and infamy, and counts as your kill. Your shot passes straight through your own ships, so you can fire past them freely. A badly holed escort falls back under your guns, and they patch up slowly when the shooting stops. Paying for repairs at a port mends their hulls along with yours.',
          'Your fleet panel shows each escort\'s name, what she is doing and her hull. They show as aqua ships on the minimap and the sea chart (with their names), ride at anchor beside your ship in the harbour and off the quay when you dock, and your fleet is saved with your progress and synced between devices. Lose one and she is gone for good, so look after them.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-20T04:00Z',
    entries: [
      {
        title: 'Boarding actions: grapple a crippled pirate and take her deck',
        notes: [
          'Shoot a pirate down below 40% of her hull and close in, and a new prompt pulses up: Board her. Press F (or tap it) and your crew whirl grappling hooks over their heads and let fly. The lines arc across, the iron bites into her rail, and the ropes come taut as both ships glide to a stop and her hull is hauled in against yours with a boom of grinding timbers and spray squeezed up between them.',
          'Then it is over the side. Your captain and hands perch on the rail and swing across one after another on lines from the rigging, roaring as they go, while her crew wait on her deck with blades drawn. The camera swoops down to the deck with them.',
          'The fight is the same cutlass and pistol combat as ashore, but on her rolling deck: everyone heaves, pitches and rolls with the ship, and fights round her masts, guns and hatches. Her captain is a tougher opponent, and a named bounty hunter fights you herself. Back up against your own rail and press F to cut the lines and fall back if it goes badly; if the captain goes down, the hands drag you back aboard.',
          'Cut down her captain and most of her men and the rest throw down their blades and drop to their knees with their hands up. Her colours come down the halyard, her strongbox is yours (gold, plunder for the hold, fresh shot, maybe a ship part or a scrap of treasure map), and a hunter\'s bounty is paid on the spot.',
          'Then you decide her fate. Take her as a prize and your own flag runs up her mast while a prize crew sails her off to port for a purse of prize money. Or scuttle her: a slow match in her magazine, she blows up alongside, her crew leap into the sea and her cargo floats up for salvage, with her bounty and infamy as if you had sunk her.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-20T03:00Z',
    entries: [
      {
        title: 'Treasure maps, digging, and a crew that moves like people',
        notes: [
          'Sea chests and cutthroat camps now hold torn pieces of treasure maps. Find all three pieces and the map comes together, showing an island and a red X. Press T, or tap the map chip by your gold, to unroll it. The X also appears on your sea chart and minimap.',
          'Sail to that island, go ashore and look for two crossed driftwood sticks and a little cairn of stones. Stand on the spot and press F to dig. The captain takes up a spade, two hands join in, and sand flies until you hear a spade knock on wood. Then the chest rises out of the hole and the lid swings open: a big haul of gold, plunder for the hold and fresh shot. After that a new map can start.',
          'Walking and running are completely new. Feet strike heel first, knees give as they take the weight, hips sway and turn with each step while the shoulders turn the other way, and arms swing a beat behind. Runners lean into turns and into speeding up, and leave the ground between strides. Standing about, people shift their weight from foot to foot and breathe.',
          'Cutlass attacks are completely new as well. Every cut winds up with the body coiled and the weight back, whips through to the blow, carries on past it and settles back on guard, with a real step in behind the blade. A pale streak of light follows the edge through each swing.',
          'Your hands now walk as a loose group instead of a tidy formation. Each keeps his own pace, drifts about, sets off a moment after you do, stops a few steps later, now and then pauses to look at something and jogs to catch up, chats with his mate as they go, and sometimes swaps sides.',
        ],
      },
      {
        title: 'Ship parts: from Common to Mythic',
        notes: [
          'Your ships can now be refitted with upgrade parts in four slots: hull plating, sails, guns and a figurehead. Each part changes how your ship looks and gives real bonuses to hull, armour, speed, turning, reload, damage, range or luck.',
          'Every slot has five rarities. Common and Rare parts are sturdy fittings of the age, like oak strakes, iron strapping, storm canvas, bronze guns and a carved lion. Epic parts get bold, with bronze shields along the rail, batwing sails, wide-mouthed bombards and a kraken on the bow.',
          'Legendary and Mythic parts go beyond the ordinary. Legendary brings gold dragon scales, phoenix sails and dragon-head cannons with glowing eyes. Mythic brings obsidian plating veined with light and floating wards, star-filled aether sails with turning crystal crowns, starfire guns ringed in light, and a seraph figurehead with a halo.',
          'Parts drop from treasure chests, cutthroat camps and sunk pirates (some pirates sail with parts of their own). You also get a bonus part with every ten-pull in the Treasure Vault, and each port sells three different parts a day for vault gold. A duplicate part pays out gold instead.',
          'Fit parts in the Shipwright\'s new Refit tab. Each slot shows its rarity track and the stat bars show exactly what a part adds. The camera swings to the part you pick, and a new gun test-fires. Your parts are saved to the cloud along with the rest of your progress.',
        ],
      },
      {
        title: 'Ghost ships',
        notes: [
          'Something else sails these waters now. Ghost ships are rare phantom pirates, half see-through and glowing a cold green, with rotting holes drifting across their planks and sails. You are most likely to meet one at night, in thick mist or in a storm, and she rises out of the haze rather than sailing over the horizon.',
          'Ghost ships fire wraith shot: glowing green balls that pass straight through armour and fill your crew with dread, slowing their work for a few seconds. Your own shot sometimes passes clean through a ghost without touching her.',
          'Phantoms ignore the wind, never run, cannot be set alight or have their crews raked, and sail straight through other ships.',
          'Sink one and she dissolves back into the mist, leaving a doubled cursed bounty, extra loot and a little luck. Her ghostly crew fade with her.',
        ],
      },
      {
        title: 'Real clouds on the horizon',
        notes: [
          'Look out from the deck and the sky is now full of proper cumulus: flat grey bases all at the same height, heaped up into rounded, sunlit cauliflower tops. They replace the scatter of tiny white flecks that used to cover the sky.',
          'Clouds now gather the way they do over real tropical seas. Some parts of the sky fill with clusters of clouds and others stay wide open and blue. Clear days bring a few small heaps, fair days more, and a cloudy sky fills with big rolling banks. Rain and storms close it into a heavy grey ceiling with darker rolls in it.',
          'They are lit by the real sun and moon. Sides that face the sun are bright white, the far sides and bellies sink into soft blue-grey shade, and when you look toward the sun the thin edges glow silver. At sunset they turn gold and rose, and at night they show up as dim silvery heaps against the stars.',
          'Every cloud is the same one that casts its shadow on the sea, and they all drift with the wind. The far ones fade into the haze at the horizon.',
          'The midday sky is a deeper blue above the horizon haze, the glare around the sun is tighter, and the far sea now meets the sky in a crisp, slightly darker line instead of blending into one milky band.',
        ],
      },
      {
        title: 'The Kraken rises',
        notes: [
          'Something lives beneath the storms. Out in deep, open water, far from any harbour, a storm may now bring the Kraken. It is rare: a storm gives it one chance at most, and it never comes twice in quick succession.',
          'You get a warning. The sea goes dark and starts to boil, a deep heartbeat sounds below the waves, and a huge shape passes under your keel. A few seconds later its arms burst out of the water all around you.',
          'Each arm rears up before it strikes. A glowing mark appears on the water where it will land and a warning shows over the arm, so turn hard to get out from under it. If an arm catches you, it wraps around the hull and holds the ship still while it squeezes. Fire into that arm or put on full sail to break free.',
          'Your guns lock onto its arms the same way they lock onto ships. Chain shot cuts through arms, shells do the most damage to the head, and grape and fire shot work too. Sever its arms and it brings its head up out of the water. That is your chance: a hit to its great gold eye does more than double damage.',
          'The fight has three stages. Wound it badly and it sprays ink and goes into a fury. Near the end the sea turns into a maelstrom that drags your ship toward it. Pirates want no part of any of this and flee as soon as it appears, and no harbour will let you dock while it hunts you. Kill it for a 1,500 gold bounty, the Kraken Ink ship skin, and a hoard that floats up from the deep, including two trophies you can only get from the Kraken: the legendary Beak of the Kraken and the Vial of Kraken Ink. It has its own battle music and its own sounds, and if it drags you under, your farewell screen will say so.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-20T02:00Z',
    entries: [
      {
        title: 'Bounties, infamy and the Brethren\'s hunters',
        notes: [
          'Every pirate you sink now makes you more hated among the Brethren of the Coast. A wanted meter of five skulls sits under your purse, and each new skull sends one of the Brethren\'s named captains to hunt you down.',
          'There are ten of them, from Calico Ned in his chain-shot sloop to Blackheart Vane in a molten galleon with a fleet at his back. Each sails under their own sails, flag and Treasure Vault finish, loads their own favourite shot, and has a tougher hull, harder-hitting and faster guns, and a sharper aim than any ordinary crew. They come from over the horizon and never give up the chase. A horn and war drums tell you one is on the way, and an arrow at the edge of the screen and a pulsing ring on the minimap and sea chart show where.',
          'Sink one for a big Crown bounty, a hold full of their plunder and their poster stamped SUNK on the new Wanted Board. Open it from the skull button in the harbour or the pause menu.',
          'Your lifetime infamy rises from Unknown to Legend of the Black Water, and every rank makes the Crown pay 5% more on every bounty. The hotter your wanted level, the more ordinary pirates are worth too. Your infamy and posters are saved to your account.',
          'A hunter on your tail stops you docking or rowing ashore until you deal with them. Ships sunk outright by a direct shell hit now pay their bounty and drop their loot, which they sometimes didn\'t before.',
        ],
      },
      {
        title: 'Full screen, sideways, at the first tap',
        notes: [
          'On phones and tablets, your first tap now takes the game full screen and turns it to landscape, so the whole sea fills your screen.',
          'Installed to your home screen, the game now always opens in landscape. (iPhone Safari does not allow websites to do this, so turn your phone sideways there.)',
        ],
      },
      {
        title: 'Pirate ports that sound the part',
        notes: [
          'Coins now sound like real gold: every doubloon rings with a heavy, warm chink, bounces on the counter and sometimes spins down on its rim before it lies flat.',
          'Selling sounds different depending on the sum. A small sale is counted out coin by coin, a fair one lands as a leather purse thumped on the counter and poured out, and a fortune gets a second purse, a squeezebox flourish and the whole quay cheering.',
          'Coming alongside, your hull bumps the fenders, the mooring lines creak tight and someone on the quay strikes up a jaunty tune on a concertina. Casting off, the bosun pipes all hands and the crew gives a shout.',
          'While you are tied up, the port has its own soundscape: water slapping among the pilings, the hubbub of haggling sailors, creaking ropes and timbers, gulls, and a shipwright hammering across the yard.',
          'Paying the chandler counts out your gold, then you hear the carpenters mallet your hull back together or the round shot thunk into its crate. The market buttons knock on the oak counter.',
        ],
      },
      {
        title: 'Waypoints: pillars of light',
        notes: [
          'Tap or click anywhere on the sea chart to drop a waypoint, and tap a pin again to lift it. You can keep up to five at once, each in its own colour, and they stay on your chart between voyages.',
          'Every waypoint rises out of the sea as a thin pillar of light you can see from far away, with motes drifting up the beam, a slow pulse climbing it and rings of light rippling out across the water at its foot. A new pin falls from the sky with a bright streak and a splash of light.',
          'The minimap shows your pins, and pins out of range sit on its rim pointing the way with how far you have to sail. A small tag at the foot of each pillar shows the distance too, and slides to the edge of the screen when the pin is out of view.',
          'Sail into a waypoint (or walk into it ashore) and it flares and dissolves with a chime.',
        ],
      },
      {
        title: 'Go ashore with your crew',
        notes: [
          'Sail close to a beach and a "Go ashore" button appears. Press F or tap it, and your ship drops anchor while the captain rows in with four hands in the ship\'s boat.',
          'On land you walk the captain yourself with WASD or the stick, and Shift runs. Your hands follow in a loose wedge, splash through the shallows behind you and sit down on the sand for a rest when you stop to look around.',
          'Many islands now have a cutthroat camp: a fire with a pot on the spit, log benches, a tent, barrels and a black flag. Walk too close and they grab their blades and come running with a war cry.',
          'Fight with your cutlass using Space, a click or the Strike button. Chain three cuts and the last is a lunge. Your pistol, on Q or the Pistol button, fires one heavy ball and then takes a while to reload. Your hands each pick a cutthroat to fight and run to help anyone who goes for you.',
          'Knock out the whole camp and its flag comes down. Open their chest for gold, plunder for your hold and fresh shot. If the captain falls, the hands drag you back to the boat, and you drop a little gold on the way. Walk back to the boat and press F to row out to your ship.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T21:00Z',
    entries: [
      {
        title: 'Smooth sinkings, no more stutter',
        notes: [
          'Sinking a ship no longer makes the game hitch. When a mast or bowsprit snapped off a wreck, the game used to rebuild and resend the entire ship to your graphics card, several megabytes each time and several times per sinking. Now only the broken spar is cut free and the rest of the hull stays exactly where it is, so the break takes a fraction of the time and creates almost no garbage for the browser to clean up later.',
          'Fresh pirate ships now load onto your graphics card a little at a time while they wait in the shipyard, so a new sail on the horizon no longer causes a stutter when she first comes into view.',
          'Pirate ships are also built in smaller pieces behind the scenes, so the shipyard never takes a noticeable bite out of a frame.',
        ],
      },
      {
        title: 'Finer ships and livelier crews',
        notes: [
          'Zoom in close and the rigging is now real laid rope with a little sag, tarred black for the standing rigging and pale hemp for the running lines. Shrouds are set up with deadeyes and lanyards, masts are bound with rope wooldings, and new clewlines, halyards and futtock shrouds lead down to the rails.',
          'Guns sit on proper stepped carriages with four wheels, iron tyres and a wedge under the breech, with rammers and sponges racked along the rail between them. Bronze swivel guns are mounted on the rails fore and aft.',
          'The decks have more life: entry steps on the side, leather fire buckets and a sea chest by the quarterdeck, and a ship\'s cat curled up on the bow crate.',
          'Crew are better built, with fuller chests, shoulders and calves and narrower waists. Their clothes now fold and crease: shirts blouse over the sash, sleeves wrinkle at the elbow, trousers crease behind the knee and captains\' coats hang in pleats.',
          'All the extra detail only appears on ships close to the camera, so a full battle runs as smoothly as before.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T20:00Z',
    entries: [
      {
        title: 'Captain accounts and cloud saves',
        notes: [
          'You can now sign in with Google or an email and password. Tap the captain badge at the top of the harbour screen.',
          'Once you sign in, your gold, Treasure Vault finds, equipped skins and effects, ship livery, saved designs, records and favourite ship are kept in the cloud. They follow you to any phone, tablet or computer you sign in on.',
          'Your first sign-in brings everything you earned as a guest along with it. Progress from several devices adds up: gold earned on your phone and gold spent on your laptop both count.',
          'The game still saves on your device first, so it plays the same offline. Anything you earn while offline is saved to the cloud once you reconnect.',
          'You can still play as a guest without signing in. Your progress then stays on that device, as before.',
        ],
      },
      {
        title: 'Little clouds over the islands',
        notes: [
          'Zoom all the way out and you now rise above a layer of small, soft cumulus clouds drifting low over the sea. They are lit by the real sun and sky, so they are brilliant white at noon, gold and rose at sunset, silver under the moon and a heavy grey in a storm.',
          'They come and go. Some stretches of sea stay clear while others fill with a field of puffs, clear days bring only a few, cloudy ones bring plenty, and the islands breed their own little clouds over their slopes. Each cloud forms from the middle out and frays away at the edges as it drifts downwind.',
          'Every cloud casts a soft shadow that slides across the water, the beaches and your ship, so even zoomed in you can watch the shadows of the clouds above sweep past.',
          'A cloud passing over your own ship turns see-through around it, so you never lose sight of her in a fight.',
        ],
      },
      {
        title: 'Clean tracer trails',
        notes: [
          'The Golden Comet, Ghostlight, Rainbow Ribbon and Starfall tracers, and fire shot, no longer leave a string of glowing smoke blobs behind the ball. Every tracer now draws one smooth, unbroken trace, with only fine sparks shedding off it, and the Vault and Shipwright previews show it the same way.',
        ],
      },
      {
        title: 'Roomier ship card',
        notes: [
          'The ship card in the top left is wider, so longer ship names fit without being cut off. Gold, hold, crew and isles now sit together on one row beneath it.',
        ],
      },
      {
        title: 'Smooth seas when the wind comes round',
        notes: [
          'When the wind veered or backed, the ripples on the sea and the bright sheen rolling over island meadows could suddenly race sideways, faster the longer you had been sailing. Now they keep drifting gently downwind and simply ease onto the new heading as the wind swings, and the long wind streaks on the water turn about your ship instead of sliding across the whole sea.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T19:00Z',
    entries: [
      {
        title: 'A gift of 10,000 gold',
        notes: ['Every captain gets a one-time gift of 10,000 gold. It lands in your purse the next time you set sail. Spend it in the Treasure Vault or wherever you please.'],
      },
      {
        title: 'Life on the reefs',
        notes: [
          'The shallows around every island now teem with fish. Shoals of blue tangs, yellow tangs, clownfish, striped sergeant majors and pink-striped wrasse wander the turquoise flats, and each island has a great glittering bait ball of silversides.',
          'They swim like real fish. Tails beat, bodies curl into their turns, and schools flow along the reef, keeping to the shallows. When your hull glides over them they part around the bow, and a cannonball landing nearby makes the whole school flash apart before it drifts back together. Broadsides send them darting too.',
          'Bigger creatures cruise alone: mottled groupers and parrotfish along the bottom, spotted eagle rays gliding over the sand on slow wingbeats, and sea turtles that paddle about and now and then rise to the surface for a breath.',
          'Sail close and zoom in to see them best. They sit under the water properly, tinted by its depth and lit by the dancing sun caustics, and the big ones cast shadows on the seabed.',
        ],
      },
      {
        title: 'No more stripes on sails and underwater',
        notes: [
          'Fixed the faint horizontal lines that could streak across sails, island slopes and the whole screen while following a sinking ship underwater. The fine contact shadows were misreading which way some surfaces faced on alternate rows of pixels; they now read every surface correctly and keep their crisp shadows under crew, guns and rigging.',
        ],
      },
      {
        title: 'A bow wave made of water, not smoke',
        notes: [
          'The puffy white blobs at the front of every ship are gone. Now a curling sheet of white water climbs the stem, rolls over into a lip and peels back along both bows, growing taller the faster you sail.',
          'The whitewater streams aft along the hull and opens into lace as it runs out onto the sea, leaving fine ribbons of foam that peel away on either side.',
          'Bow spray is now fine, quick droplets flung off the crest that fall back into the sea, with bigger bursts when the bow digs into a swell.',
          'All wake foam now uses the same realistic bubble web as the breaking surf, so it opens into holes, thins to threads and breaks into flecks as it fades.',
        ],
      },
      {
        title: 'Menus that fit your phone, with your ship front and centre',
        notes: [
          'On a phone held sideways the home screen now gives the stage to your ship. The title and the system buttons sit in a slim row along the top, the ship\'s name, numbers and bars stand on the sea down the left, and the ship picker and Set Sail, Shipwright and Vault share the bottom row. Nothing is cut off any more.',
          'Held upright, the title shrinks to the top, the ship fills the middle and a slimmer card along the bottom holds the picker, the numbers and one row of buttons.',
          'The pause menu fits short screens without scrolling: the list runs down the left, and the title, your ship and the voyage so far sit on the right.',
          'Every menu, from Settings and Controls to Graphics and the Patch Notes, now scales its text and spacing to your screen, so small phones get a tighter layout and big screens keep the roomy one.',
          'The version and build number now appear next to the Patch Notes title instead of in the button row.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T18:00Z',
    entries: [
      {
        title: 'The wind changes',
        notes: [
          'The wind no longer blows the same way forever. Every few minutes it veers or backs, and a change in the weather can bring it right round. A storm can swing it halfway across the compass.',
          'Each shift comes round gradually over half a minute or so. Your sails, flags, smoke, the palms and grass, the gusts, the clouds and the HUD arrow all turn with it. The swell follows more slowly, the way real seas do.',
          'A course that was a fast broad reach may soon be close-hauled, so watch the wind arrow. A small notice tells you when the wind veers or backs and where it now blows from.',
        ],
      },
      {
        title: 'No more slowdown in long battles',
        notes: [
          'Long sessions used to get slower and slower until the game stuttered, sound included. The cause was every ship you sank: each wreck stayed afloat for over three minutes, still a whole ship to draw and simulate, so a good fight left a growing graveyard around you.',
          'Now only the three most recent wrecks linger near you. Older ones, and any you sail far away from, founder and slip under by the stern instead. Memory use and frame times stay level however long you play.',
          'Sound is capped at a sensible number of effects at once, so the biggest broadsides no longer crackle on slower devices.',
        ],
      },
      {
        title: 'A whole new Treasure Vault',
        notes: [
          'The vault now happens out on the water. A gilded sea chest bursts up beside your ship and bobs on the swell, ready to open.',
          'Opening it is a show: the chest trembles and leaks light through its seams, shifting colour as the rarity inside climbs. Then the lid flies open in a pillar of light and god rays, with a shockwave across the sea and fireworks for epic and legendary finds.',
          'Your cards fly out of the chest\'s mouth. They have holographic foil that follows your finger, tilt in 3D, and wear rarity frames; legendaries get a turning golden border. Skin cards show the full pattern, and cannon effect cards fire their shot on a loop.',
          'Tap any card to try it on for real. Skins dress your actual ship while the camera circles it, and trails and muzzle blasts fire real broadsides so you see exactly what you get. Equip from there, or flick through your haul with the arrows.',
          'The collection works the same way, so you can preview pieces you have not found yet.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T18:00Z',
    entries: [
      {
        title: 'Scenic loading screen',
        notes: [
          'While the archipelago loads you now look out over a real moment from the game, slowly drifting behind the wordmark, instead of a plain blue backdrop. More scenes will join the rotation soon.',
        ],
      },
      {
        title: 'Plunder and trading ports',
        notes: [
          'Chests and barrels no longer spill plain gold. They hold real plunder: 30 kinds of goods across five rarities, from casks of rum, coffee and cheese up through silk, pearls, emeralds, old paintings and a sultan\'s ruby, to legendary finds like the Crown of the Drowned King and the Kraken\'s Pearl.',
          'Everything you haul aboard goes into your ship\'s hold. A sloop carries 10 lots, a brig 16 and a galleon 26. When it is full, cheaper cargo goes over the side to make room for finer goods. Tap the crate beside your gold to see what is aboard. If she sinks, the hold goes down with her.',
          'To turn plunder into gold, sail to one of four trading ports around the archipelago: Port Cinnabar, Goldwater, Saint Coral and Rumbelow. They are marked on the minimap and the chart. Come alongside the quay and press F (or tap the prompt) to dock.',
          'Each market has its own tastes. The bankers of Goldwater pay best for gems and gold, Saint Coral collects art and relics, and Rumbelow is thirsty for rum. Prices drift a little over time. Sell lot by lot or the whole hold at once, then pay for repairs and fresh special shot before you cast off.',
          'The ports are alive. Townsfolk wave as you sail in, the harbourmaster rings the bell, and porters run up the gangplank to carry your goods ashore while the quay cheers a big sale. Merchants cry their wares, a fiddler plays, children run about and a fisherman tends his line.',
        ],
      },
      {
        title: 'Surf that really breaks on the beach',
        notes: [
          'Waves now roll in to every island, line up along the coast, swing into the bays and stand up as the water gets shallow, glowing turquoise through their thin faces before they spill over into whitewater.',
          'Each breaker runs on up the sand as a thin, glassy sheet with a foaming front, stops, and drains back, leaving dark, glistening wet sand that dries out before the next one arrives. Some waves reach further than others, and bigger sets come through now and then.',
          'Foam looks like real sea foam: a web of bubbles around dark holes that slowly opens up, thins to threads and pops away, instead of white sheets and polka dots. Ship wakes, whitecaps and the foam around hulls use it too.',
          'Storms throw much bigger surf with several lines of breakers, sheltered atoll lagoons only see small ripples lapping in, and at night the breaking surf glows with bioluminescence.',
        ],
      },
      {
        title: 'Health bars ride above the sails',
        notes: [
          'Enemy health bars and their fire, torn sail and crew icons now float just above the tallest mast instead of over the middle of the ship, so you can always see the hull you are aiming at.',
        ],
      },
      {
        title: 'Calmer seas: fewer pirates',
        notes: [
          'About 60% fewer pirates now roam around you: two to start, rising to at most four as you sink more, and new sails take noticeably longer to appear on the horizon.',
          'Pirate flotillas are rarer and smaller, usually a flagship with one or two escorts, so there is more time to explore between fights.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T18:00Z',
    entries: [
      {
        title: 'Photo mode',
        notes: [
          'Press P, tap the new camera button by the minimap, or pick Photo mode from the pause menu. The voyage freezes mid-moment, every bit of HUD steps aside and the camera is yours.',
          'Orbit round any point or switch to Fly and roam the frozen scene: drag to turn, right drag or two fingers to pan, wheel or pinch to zoom, WASD with Q and E to move. Set the field of view, roll the horizon, and frame the shot in 16:9, 3:2, square, portrait or widescreen cinema, with a rule of thirds grid.',
          'Retime the day with a slider from dawn to moonlight, swap in any weather, and add real depth of field: double-tap or double-click anything to pull it into focus and let the rest melt away. Exposure, eight film looks from Vivid and Golden to Noir and Old chart, vignette and grain finish it off.',
          'One tap on the scene hides the controls. The shutter saves a PNG at your screen\'s full resolution, or opens the share sheet on your phone. Leave and the sky and the voyage pick up exactly where they were.',
        ],
      },
      {
        title: 'Down with the ship',
        notes: [
          'When your ship sinks in open water the camera no longer stops at the surface. It dives under with her, and you watch her go down from below: her dark hull against the bright window of the sky, the waves rippling overhead, sunbeams slanting through the water and a stream of air bubbles and broken timbers pouring out of her.',
          'Her fires hiss out as she goes under. She heels over as she sinks, settles onto the seabed on her side in a slow cloud of sand, and the light fades as the deep closes in before the farewell screen appears. Sink on a shallow reef and the water still closes over you as before.',
        ],
      },
      {
        title: 'Real seagulls',
        notes: [
          'The gulls are reborn as proper herring gulls: a rounded body and head, a hooked yellow beak with its red spot, grey backs, long wings with black tips and white spots, a fanned tail and pink webbed feet.',
          'They fly like gulls now. They glide and wheel on the wind with a few lazy wingbeats, bank into their turns, rock in the gusts and beat hard to climb, flaring their wings and spreading their tails to land.',
          'They have a life of their own. Gulls trail passing ships and circle the masts, land on mast caps, fighting tops and the jib-boom, loaf on the shore rocks, bob on the swell, and throw their heads back to call. Fire your guns and they burst off in a screaming cloud.',
        ],
      },
      {
        title: 'Choose the time of day',
        notes: [
          'Tap the clock beside the minimap to cycle Auto, Dawn, Noon, Golden hour, Dusk and Night. The sun sweeps across the sky to your chosen hour and stays there.',
          'Auto lets the day run again, and your choice is remembered next time you sail. Tap the weather icon to change the weather as before.',
        ],
      },
      {
        title: 'Even lighter on your machine',
        notes: [
          'A second big performance pass, again without changing how the game looks. A typical view out at sea now draws well under half a million triangles, down from over a million.',
          'Sailors are only drawn with the hats, coats, beards and tools they actually wear, and crews out of sight are skipped. Only the patch of sea in front of the camera is drawn, palms and trees cast their shadows from lighter stand-ins, and water reflections do their tracing on a quarter-size picture of the scene.',
        ],
      },
    ],
  },
  {
    // the 17:00 group below is full (five entries), so this hour continues here
    hour: '2026-10-19T17:00Z',
    entries: [
      {
        title: 'Unbroken cannon trails',
        notes: [
          'A cannonball no longer leaves a dotted line of separate puffs behind it. Every shot now draws one continuous thread of smoke along its whole flight, smooth at any frame rate.',
          'The thread starts thin right behind the ball, then swells, twists and frays as it ages, drifts off on the wind and fades from the far end. Glowing vault trails and fire and fused shells keep a hot glow along the fresh part of the line, with their sparks, embers and stars still scattering around it.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T17:00Z',
    entries: [
      {
        title: 'No more sea of white foam',
        notes: [
          'Fixed a bug where a huge solid sheet of white foam could spread across the sea around your ship, often after a sinking, and never clear. The wake simulation now shrugs off any bad value instead of letting it grow, so wakes, splashes and wrecks leave only the foam they should.',
        ],
      },
      {
        title: 'Smoother sailing, same view',
        notes: [
          'A big performance pass with nothing taken away from how the game looks. Out at sea the game now draws around a third of the triangles it used to, so frame rates climb noticeably, most of all on high resolution screens.',
          'Island trees, palms, shrubs and flowers are now hidden one by one when they are out of view, instead of a whole island at a time. Plants off screen still cast their shadows into view, so nothing about the light changes.',
          'Ocean reflections of ships and islands are traced at half resolution and then rippled at full detail, and water hidden behind hulls and islands is no longer shaded at all. The sea looks the same and costs far less.',
          'The sky lighting, which refreshes a few times a second as the day turns, now takes a quarter of the work.',
          'The frame profiler is much cheaper to keep open, so the numbers it shows are closer to the real thing.',
        ],
      },
      {
        title: 'Shadows that sweep with the sun',
        notes: [
          'As the day passes, shadows now glide smoothly round with the sun instead of creeping along in tiny steps, from long morning shadows to short noon ones and back out at dusk.',
          'They stay perfectly still and crisp while you sail, zoom and pan, so the extra smoothness costs no shimmer.',
        ],
      },
      {
        title: 'Refresh always brings the newest build',
        notes: [
          'A normal refresh could load an older copy of the game saved on your device, sometimes from before the rename. The game now always fetches the latest version when you are online, and only falls back to the saved copy when you are offline.',
          'Already installed? Open the game once more and it switches over by itself.',
        ],
      },
      {
        title: 'No more shimmering in motion',
        notes: [
          'Shadows no longer crawl and sparkle while you sail or pan the camera. The soft edges of every shadow are now fixed to the world instead of the screen, so islands, decks and sails stay calm and solid in motion, most of all when zoomed out.',
          'Hillsides, cliffs and billowing sails no longer catch blotchy patches of their own shadow, so slopes read cleanly in the sun.',
          'Sails lost the pale little repair patches and a fine weave pattern that could show up as stray light dashes and horizontal lines.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T16:20Z',
    entries: [
      {
        title: 'Five kinds of shot',
        notes: [
          'Your guns can now load five kinds of shot. Round shot is the reliable all-rounder and never runs out. Explosive shells burst on impact and hurt everything close by, even on a near miss. Fire shot sets a ship ablaze so she burns on, though rain beats the flames down. Chain shot scythes through the rigging, shredding sails and slowing her to a crawl. Grape shot sprays the deck at close range and cuts down gun crews so they reload slowly.',
          'Each has its own look and sound in flight and on impact: fizzing fuses, red-hot iron trailing flame, two half-balls cartwheeling on their chain, a hail of musket balls.',
          'On PC the Port and Starboard pills are gone. In their place is a rack of shot: press 1 to 5 (or R to cycle, or click) to load. The loaded shot sits in a ring whose left half fills as your port guns reload and right half as the starboard ones do. Q and E still fire each side.',
          'On phones, tap the new shot button above Fire and pick from the fan.',
          'Special shot is carried in short supply. Salvage, chests and every newly charted isle restock the magazine, and pirates load some nasty shot of their own now and then. Burning, shredded or short-handed ships show it on their health bar.',
        ],
      },
      {
        title: 'Your helmsman makes way',
        notes: [
          "When you take the wheel in the captain's view, your helmsman no longer hovers at your elbow blocking the view. He heads down the companion stairs to the main deck and pitches in with the other hands, then climbs back up and takes the wheel again once you let go.",
        ],
      },
      {
        title: 'A whole new crew',
        notes: [
          'Every sailor has been rebuilt from scratch: smooth sculpted bodies with real shoulders, waists and calves, hands with fingers and thumbs, and proper faces with noses, ears, lidded eyes in a dozen colours, eyebrows and mouths.',
          'Faces come alive: crewmates blink, glance about, smile, frown in battle, bellow orders, chatter with their mates, grin through a jig, cheer with mouths wide open and look plain terrified when the ship goes down. Hands clench round rammers, ropes and tankards, and fall open in a panic.',
          'Far more variety in dress: striped, rolled or short sleeves, bare legs, stockings or long trousers, bare feet, boots, garters, vests, belts, kerchiefs, earrings, beards, moustaches, ponytails, long hair and bald pates, under tricorns, spotted bandanas, knit caps and straw hats. Captains wear lapelled coats with epaulettes, cuffs and a lace jabot, with a parrot on the shoulder.',
          'Cheering sailors now throw their arms up in a V, and a captain going down with the ship gives a proper salute.',
          'The pirates of Puerto Marea in the Shipwright harbour got the same makeover, from the accordion player to the lookout with a spyglass.',
          'Crewmates far from the camera use a lighter version of the model, so the extra detail costs little.',
        ],
      },
      {
        title: 'Version number on the menu',
        notes: [
          'The game version and build now sit right next to the patch notes button, so you can tell at a glance which update you are playing.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T16:00Z',
    entries: [
      {
        title: 'Aquati is now Shores of Fortune',
        notes: [
          'The game has a new name: Shores of Fortune. Same sea, same ships, same saves, just a name worthy of the treasure out there.',
          'The home screen and loading screen carry a new gilded wordmark that catches a slow glint of sunlight, and the app shows as "Fortune" under its home-screen icon.',
          'The volcano in the north now goes by Monte Fortuna.',
        ],
      },
      {
        title: 'Steady shadows from up high',
        notes: [
          'Zoomed far out, islands, decks and sails no longer shimmer or flicker. Sun shadows now hold perfectly still as you sail, zoom and fight, and only creep along gently as the sun crosses the sky.',
          'Distant shorelines, hulls and rigging stay crisp and solid at any zoom, with no more flickering where two surfaces meet.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T16:00Z',
    entries: [
      {
        title: 'A frame profiler behind the FPS counter',
        notes: [
          'Tap the FPS counter at the top of the screen (or press F3) to open a live profiler. It shows how many milliseconds each part of the game takes on the CPU, from pirate AI and ship physics to particles, wind and the HUD, sorted busiest first.',
          'On browsers that support GPU timers it also times every render pass on the graphics card: shadow maps, the world, ray-traced lighting, water and reflections, bloom and the final grade.',
          'A scrolling frame-time graph, a CPU-bound or GPU-bound verdict, draw calls, triangles, shader programs, render resolution and quality round it out. Closed, it costs nothing.',
        ],
      },
      {
        title: 'Smoke that looks like smoke',
        notes: [
          'Gun smoke, wreck smoke and the volcano plume no longer look like round puffs. Each cloud is torn and swirled from the inside, dense and billowing as it leaves the gun, then fraying into thin curling strands as it thins out.',
          'Smoke now stretches and shears along the way it moves: a broadside throws long streaming jets, and the drifting bank smears out downwind, so a stiff breeze drags it into ragged streamers.',
        ],
      },
      {
        title: 'Hull hits with real weight',
        notes: [
          'Cannonballs now strike a ship like a blow against a great oak structure. The whole hull booms like a vast wooden drum, the crack is heavier and splits deeper, and the planking rips apart in a longer, thicker tear.',
          'After every hit the frames and timbers give a slow, deep creak as the hull flexes under the impact, and heavy chunks thud onto the deck.',
        ],
      },
      {
        title: 'Hull hits that splinter and boom',
        notes: [
          'A cannonball striking a ship now sounds like heavy oak giving way, not a dull thump: a sharp crack, the crackling rip of planking tearing through, a hollow boom from inside the hull and a shower of splinters.',
          'Bigger hits sometimes leave the frames groaning under the strain, and broken chunks clatter onto the deck with hollow wooden knocks.',
        ],
      },
      {
        title: 'Choose your weather',
        notes: [
          'Tap the little weather badge by the clock to cycle the skies: Auto, Clear, Fair, Cloudy, Mist, Rain and Storm.',
          'The new weather rolls in over a few seconds, clouds, rain, swell and all, and your pick is remembered next time you sail. Auto lets the weather change on its own again.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T15:00Z',
    entries: [
      {
        title: 'The Treasure Vault: rare ship skins and new cannon effects',
        notes: [
          'A new Treasure Vault sits beside the Shipwright on the home screen. Spend the gold you win at sea to open its chest, one at a time or ten at once, and watch it shake and glow brighter the rarer the haul inside. Then flip your cards. Your first chest every day is free.',
          'There are 18 ship skins to find, painted across your hull, upper walls and sails: stripes, harlequin, tiger, tartan, marble, kintsugi gold seams, royal damask and more. The five Legendary skins are alive. Molten Core flows with glowing lava, Aurora Borealis ripples green and violet, Starlit Voyage twinkles, Ghostfire flickers with spectral flame and Living Tide rolls with sea foam. They glow brightest at night.',
          'Your cannons have two new things to customise. Muzzle blasts change the burst when a gun fires, from a sea-salt mist and a smoke ring up to a roaring dragon breath and a thunderclap that rocks the water. Shot trails change what follows the ball, from frost and embers up to a comet, a rainbow and a wake of falling stars.',
          'Common, Rare, Epic and Legendary each have their own colour. A Legendary is certain within 50 opens, and the odds keep rising after 35. Every ten-chest open holds at least an Epic, and anything you already own pays back gold. The vault favours things you haven\'t found yet.',
          'The Shipwright has new Skins and Guns tabs. They show every item, including the ones you haven\'t found yet as a live preview, and Test fire lets you see your blast and trail from the dock. Your collection is saved on this device.',
        ],
      },
      {
        title: 'Real skies: sunlight, clouds and distance',
        notes: [
          'The sky is now painted the way real air scatters light: a deep blue overhead that pales to a bright band along the horizon, a blazing sun disc with a soft glowing halo, and fine cirrus streaks on fair days.',
          'Clouds are heaped, billowing cumulus with sunlit edges, blue-grey bellies and a silver rim toward the sun. Cloudy days break into big banks with blue gaps and patches of sunshine racing across the sea, and every shadow on the water belongs to a cloud you can see overhead.',
          'The sea mirrors the clouds above it and deepens to a rich blue toward the horizon instead of turning milky.',
          'Far islands and ships now sink into the colour of the air in front of them, warm toward the sun and cool blue away from it, while mountain peaks stay crisp above the sea haze.',
          'Stronger sunlight against softer, bluer shade and a touch more contrast give islands, hulls and sails more shape, from the deck and from above.',
        ],
      },
      {
        title: 'Volume sliders',
        notes: [
          'Settings now has Master, Music, Effects and Ambience volume sliders, so you can turn the harbour theme down without losing the cannons, or quiet the surf and wind for a cleaner battle mix.',
          'Changes are heard live as you drag and are remembered next time you sail.',
        ],
      },
      {
        title: 'Lusher, more beautiful islands',
        notes: [
          'Every island has been replanted. Coconut palms now grow in proper groves with bare stretches of beach between them, with serrated fronds, ringed trunks, the odd dried frond hanging down, coconuts in the crown and more lying in the sand.',
          'New trees: rounded rain trees, tall jungle giants, scarlet flame trees and pink or lilac blossom trees standing alone in the meadows, and island pines on the high ridges and rocky isles. Their crowns now look soft and full, and the sun glows through the leaves.',
          'The forests have an understorey of banana plants and ferns, the meadows are dotted with hibiscus in four colours, red and gold croton and patches of daisies, buttercups, pinks and periwinkles, and sea oats grow along the top of the beaches.',
          'The ground has changed too. Under the trees there is a mossy forest floor with fallen leaves, the high ridges of the green isles turn golden, and you can see gusts roll across the meadows as bright waves in the grass. Shells now wash up along the tideline.',
          'Islands far from the camera use simpler trees, and the smallest plants fade out with distance, so the extra detail costs little.',
        ],
      },
      {
        title: 'A new app icon',
        notes: [
          'Aquati has a brand new icon: a three-masted galleon under full sail, gun ports glinting and stern lanterns lit, cutting a bow wave across a turquoise lagoon with a palm-crowned isle and the golden sun behind her.',
          'It looks sharp everywhere, from your home screen and app drawer (including Android\'s round and squircle shapes) to iPhone home screens and the little browser tab icon. If you installed Aquati already, your phone may take a day or a reinstall to pick it up.',
        ],
      },
    ],
  },
  {
    hour: '2026-10-19T14:00Z',
    entries: [
      {
        title: 'Lost to the Depths: a proper farewell when your ship goes down',
        notes: [
          'The killing blow now lands in slow motion. The colour drains from the sea, the edges of the screen flush red, black bars slide in and your ship\'s name and who sank her appear like the end of a film. Press Space or tap to skip ahead.',
          'The camera leaves the battle and circles low around your ship as she founders. Her timbers groan, she goes down by the stern with her bow lifting, and a last burst of air boils up as she slips under. Then the camera follows her down: the sound closes in, the light turns green-blue and sun shafts sway through the water.',
          'The new farewell screen tells the story of the voyage. It has an epitaph for where and how she was lost, a parting line that fits how you played, and the full tally rolling in: time at sea, gold, ships sunk, isles charted, your accuracy, damage dealt, treasure and the sea miles you sailed.',
          'Every voyage now earns renown, which ranks you from Bilge Rat all the way to Legend of the Archipelago, with a ring showing how close you are to the next rank. Your best voyage is remembered on this device, and any stat that beats it gets a gold New best tag.',
          'A ship\'s log lists the moments that mattered: isles charted, prizes sunk and rare chests opened, ending with how she was lost. Sail again (Enter) puts you straight back at sea in the same ship, and Choose a new ship (Esc) takes you to the harbour. Running aground or being rammed to the bottom now ends the voyage properly too, where before it could leave you stuck.',
        ],
      },
      {
        title: 'Aiming without the clutter',
        notes: [
          'All aiming marks are gone from the sea. Out of a fight, nothing is drawn at all.',
          'In a fight, the only sign is warm lantern light that gathers and shimmers on the water around an enemy when she sits off one of your loaded broadsides. When you see it, fire. It fades the moment you do and returns when the guns are run out again.',
        ],
      },
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
