import type { NamedCaptain } from './bounty';
import type { LetterView } from '../ui/letter';

// What comes aboard in writing: the letters found in bottles and the news the
// carrier gull brings. Only the words live here; game.ts pays out what they
// promise.

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

type Words = Pick<LetterView, 'title' | 'body' | 'sign'>;

// ------------------------------------------------------------------ bottles

const CASTAWAYS = ['Josiah Penhallow, late of the Merry Wren', 'Old Bess Tamsin, bosun', 'Capt. Amaro Quintela', 'Wm. Hobb, ship’s cook', 'A. de Vries, purser of the Zeemeeuw', 'Tom Ruddle, who should have stayed a farmer'];

/** A torn third of a treasure map, rolled up in the bottle with a note. `piece` is 1, 2 or 3. */
export function mapLetter(piece: number): Words {
  const lines = [
    [
      'I tore my map in three and sent each piece off on the tide, that no one villain should have the whole of it.',
      'If you are honest, find the others. If you are not, find them anyway, and drink to me when you dig.',
    ],
    [
      'The gold is buried where the X is. The X is on the map. The map is in three bottles. I was drunk when I thought of this.',
      'Here is one third of it. Good luck to you.',
    ],
    [
      'Becalmed nine days. The water is gone and the parrot is looking at me strangely.',
      'I leave my fortune to whoever pulls this from the sea. Mind, it is only a piece of it.',
    ],
    [
      'They took the ship but they did not take the map. I chewed it to pieces rather than give it up. Well, to three pieces.',
      'This is one of them. Forgive the tooth marks.',
    ],
  ];
  const tail = piece >= 3 ? 'The last piece! The map is whole.' : `That makes ${piece} of 3.`;
  return {
    title: pick(['To whoever finds this,', 'Friend, if you be a friend,', 'To the finder, with my blessing,']),
    body: [...pick(lines), tail],
    sign: pick(CASTAWAYS),
  };
}

/** A named captain's taunt, sent ahead of them on the current. */
export function rivalLetter(c: NamedCaptain, ship: string): Words {
  return {
    title: `To the captain of the ${ship},`,
    body: [
      `“${c.taunt}”`,
      pick([
        'I have heard all about you. The Brethren talk of little else in the taverns. Enjoy it while it lasts.',
        'I sent this bottle ahead so you would know my name before you see my sails.',
        'Keep looking over your shoulder. One day the sails you see there will be mine.',
      ]),
      `P.S. ${c.trait}`,
    ],
    sign: `${c.name}, called ${c.epithet} · the ${c.ship}`,
  };
}

/** Somebody's lost letter: no map in it, but something of worth. Returns the words and the gold it is good for. */
export function lostLetter(port: string, isle: string): { words: Words; gold: number; seal: LetterView['seal'] } {
  const kinds: (() => { words: Words; gold: number; seal: LetterView['seal'] })[] = [
    () => ({
      words: {
        title: 'Pay the bearer on sight,',
        body: [`The sum of two hundred and fifty gold crowns, drawn on the counting house at ${port}. This note is good at any port of the isles.`, 'Lost overboard off the Esperanza. If found, kindly return. (Nobody ever does.)'],
        sign: 'Banco de Fortuna, by their clerk',
      },
      gold: 250,
      seal: 'gold',
    }),
    () => ({
      words: {
        title: 'My dearest Rosalind,',
        body: ['Every wave that passes under the keel takes me a little further from you, and every one that comes back brings me a little nearer. Wait for me at the quay.', 'I have put a coin in with this for luck. If a stranger reads it, keep the coin, and be kind to someone today.'],
        sign: 'Ever yours, Edmund',
      },
      gold: 60,
      seal: 'red',
    }),
    () => ({
      words: {
        title: 'Grog, the proper way:',
        body: ['One of rum, four of water, the juice of half a lime, a spoon of dark sugar and a pinch of cinnamon if the purser is not looking. Stir with a belaying pin.', `Tested on the whole crew of the Gilded Gull, off ${isle}, with great success and some singing.`],
        sign: 'Cook “Smoky” Abernathy',
      },
      gold: 40,
      seal: 'red',
    }),
    () => ({
      words: {
        title: 'Notice to all mariners,',
        body: [`A purse of gold is owed to any honest captain who sails these waters clear of cutthroats. This bottle is the purse. Spend it at ${port} and think kindly of the Harbour Board.`],
        sign: `The Harbour Board of ${port}`,
      },
      gold: 180,
      seal: 'gold',
    }),
    () => ({
      words: {
        title: 'Day 41.',
        body: [`Still on this rock off ${isle}. I have named the crabs. Bartholomew is my favourite. He does not know it.`, 'I found these coins in the sand. They are no good to me. Perhaps they will be to you.'],
        sign: 'A castaway (now rescued, I hope)',
      },
      gold: 120,
      seal: 'red',
    }),
  ];
  return pick(kinds)();
}

// ------------------------------------------------------------------ the carrier gull

/** Prize money for clearing the sea lanes, sent by the Crown's agent in port. */
export function prizeNews(kills: number, gold: number, port: string): Words {
  return {
    title: 'Prize money, Captain!',
    body: [
      `The merchants of ${port} have heard of the ${kills} pirate ${kills === 1 ? 'ship' : 'ships'} you sent to the bottom. The sea lanes are safer for it, and they would like you to have this purse of ${fmt(gold)} gold.`,
      pick(['Do try not to spend it all in one tavern.', 'The fishwives have taken to toasting your name. It is very loud.', 'The harbourmaster says to keep it up.']),
    ],
    sign: `The Crown’s prize agent at ${port}`,
  };
}

/** The Brethren have put a named captain on your trail. */
export function bountyNews(c: NamedCaptain, gold: number): Words {
  return {
    title: 'Wanted: dead or sunk!',
    body: [
      `The Brethren have sent ${c.epithet} after you, in the ${c.ship}. The Crown will pay ${fmt(gold)} gold to whoever sends her to the bottom.`,
      `${c.trait} Keep a weather eye open.`,
    ],
    sign: 'A friend in the Governor’s office',
  };
}

/** A rumour of salvage washed up off an island: there's a pin on the chart for it. */
export function rumourNews(isle: string, port: string): Words {
  return {
    title: 'A word in your ear,',
    body: [
      `Fishermen out of ${port} swear they saw a chest wash up in the shallows off ${isle}. They were too frightened of the cutthroats to go and fetch it.`,
      'I have marked the spot on your chart. A share for the gull would be appreciated.',
    ],
    sign: 'Old Nan at the fish market',
  };
}

/** A feast in port tonight: the harbourmaster's invitation. */
export function feastNews(towns: string[], feast: string, line: string, full: boolean): Words {
  const where = towns.length > 2 ? 'every port in the isles' : towns.join(' and ');
  return {
    title: full ? `${feast} tonight!` : `${feast} at ${where} tonight!`,
    body: [
      `${line}.`,
      pick([
        'Lanterns at dusk, a band on the quay and fireworks over the harbour after dark. Captains welcome; cannons stay outside.',
        'Come in by nightfall, Captain: there will be dancing on the quay, lantern boats on the water and rockets over the harbour.',
        'The taverns are rolling out the barrels already. Moor up before the lanterns are lit and the first drink is on the house.',
      ]),
    ],
    sign: full ? 'The harbourmasters of the isles' : `The harbourmaster of ${towns[0]}`,
  };
}

// ------------------------------------------------------------------ survivors

/** What the rescued hands have to say for themselves once they're aboard. */
export function survivorThanks(from: string, n: number): string {
  return n === 1
    ? pick([`The ${from}’s cabin boy, dripping and grinning. He swears he was never really a pirate.`, `A gunner off the ${from}. She says your gun crews need work, and she means to fix that.`])
    : pick([`${n} of the ${from}’s crew, soaked and grateful. They’ll haul and fight for you now.`, `${n} hands off the ${from}. They say your ship is a sight better than their old one.`]);
}
