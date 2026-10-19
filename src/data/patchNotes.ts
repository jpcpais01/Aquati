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
