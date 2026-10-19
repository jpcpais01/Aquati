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
    // the next 12:00 group is full (five entries), so this hour continues in a second group
    hour: '2026-10-19T12:00Z',
    entries: [
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
