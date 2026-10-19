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
    hour: '2026-10-19T12:00Z',
    entries: [
      {
        title: 'Unroll the sea chart',
        notes: [
          'Tap or click the minimap, or press M, to open a full chart of the whole archipelago. Drag to pan, scroll or pinch to zoom, and tap the ring button to centre on your ship.',
          'Discovered isles are named on the chart, uncharted ones are marked with a "?", and salvage, nearby pirates and the wind are all plotted. The world holds still while you plan your course.',
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
