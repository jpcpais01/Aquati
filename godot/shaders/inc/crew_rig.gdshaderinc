// Written by tools/crew/bake_crew.mjs from the web game's sculpt
// (src/ships/crewModel.ts): the joint pivots and the face's anchors (after
// the head's toy scale) the crew shader bends the sailor about, and the part
// and palette slot ids the mesh carries. Don't edit by hand: bake again.

const vec3 CREW_SPINE = vec3(0.0000, 0.9800, 0.0000);
const vec3 CREW_NECK = vec3(0.0000, 1.4800, 0.0000);
const float CREW_SH_X = 0.2150;
const float CREW_SH_Y = 1.4000;
const float CREW_EL_Y = 1.1250;
const float CREW_HIP_X = 0.0900;
const float CREW_HIP_Y = 0.8800;
const float CREW_KNEE_Y = 0.5000;
const float CREW_HX = 0.2250;
const float CREW_KN_Y = 0.8320;
const float CREW_FM_Y = 0.8060;
const vec3 CREW_PARROT = vec3(0.2042, 1.4700, -0.0200);
const vec3 CREW_EYE = vec3(0.0447, 1.7061, 0.1103);
const vec3 CREW_MOUTH = vec3(0.0000, 1.6306, 0.1288);
const vec3 CREW_NOSE = vec3(0.0000, 1.6822, 0.1410);
const vec3 CREW_EAR = vec3(0.1349, 1.6884, -0.0204);
const float CREW_CHIN_Y = 1.5590;
const vec3 CREW_JAW = vec3(0.0000, 1.6676, -0.0550);
const float CREW_AO_MAX = 1.2500;

const int PART_NONE = 0;
const int PART_TORSO = 1;
const int PART_ARM = 2;
const int PART_LEG = 3;
const int PART_BANDANA = 4;
const int PART_KNIT = 5;
const int PART_NOSE = 6;
const int PART_EAR = 7;
const int PART_FACE = 8;
const int PART_BEARD = 9;
const int PART_STRAW = 10;
const int PART_MOUTH = 11;
const int PART_TEETH = 12;
const int PART_WING = 13;
const int PART_PARROT_HEAD = 14;
const int PART_PARROT = 15;
const int PART_HAIR = 16;
const int PART_IRIS = 17;
const int PART_SOLE = 18;

const int TINT_SKIN = 0;
const int TINT_SHIRT = 1;
const int TINT_SLEEVE = 2;
const int TINT_FOREARM = 3;
const int TINT_TROUSERS = 4;
const int TINT_SHIN = 5;
const int TINT_BOOTS = 6;
const int TINT_SASH = 7;
const int TINT_HAT = 8;
const int TINT_HAIR = 9;
const int TINT_COAT = 10;
const int TINT_TRIM = 11;
const int TINT_WOOD = 12;
const int TINT_METAL = 13;
const int TINT_GLOW = 14;
const int TINT_CLOTH = 15;
const int TINT_STRIPE = 16;
const int TINT_DARK = 17;
const int TINT_WHITE = 18;
const int TINT_PUPIL = 19;
const int TINT_PARROT = 20;
const int TINT_WING = 21;
const int TINT_BEAK = 22;
const int TINT_VEST = 23;
const int TINT_PLUME = 24;
const int TINT_LEATHER = 25;
const int TINT_MOUTH = 26;
const int TINT_TONGUE = 27;
const int TINT_SHINE = 28;
const int TINT_GHOST = 29;
