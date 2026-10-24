## Shores O' Fortune for Android: a loading screen, and steady sails

The twenty-second build opens the way the web game does, and clears the
last of the flicker off your ships.

- **A loading screen.** The game now opens on a ship off the pink shore
  of Las Brumas, drifting slowly closer under the crest's turning rose,
  the gilt name, a line of advice that changes every few seconds and a
  bar filling aqua to gold. The world is built a small piece at a time
  behind it, so it keeps moving the whole way, and it stays up until
  every shader has been drawn once and the frames run smooth. Then it
  fades away and the harbour rises in, with no stutter as it starts.
- **Steady sails and hulls.** The pale blocks that flickered over sails,
  flags and hulls came from the sun's shadow map on surfaces it only
  grazes. Canvas and bunting now take no sun shadow at all (they still
  cast theirs on the deck and the sea), and wherever the sun only grazes
  a surface its light now fades out smoothly instead of flickering.
- **No more white specks** on varnished hulls: the sharpest glints of
  sun on the varnish are kept within what a phone's graphics can hold.
