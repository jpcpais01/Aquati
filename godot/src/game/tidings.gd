class_name Tidings
## What comes aboard in writing (the web game's game/tidings.ts): the
## letters found in bottles. Only the words live here, as {title, body
## (paragraphs), sign}; the game pays out what they promise.

const CASTAWAYS := ["Josiah Penhallow, late of the Merry Wren", "Old Bess Tamsin, bosun", "Capt. Amaro Quintela", "Wm. Hobb, ship’s cook", "A. de Vries, purser of the Zeemeeuw", "Tom Ruddle, who should have stayed a farmer"]


## A torn third of a treasure map, rolled up in the bottle with a note. `piece` is 1, 2 or 3.
static func map_letter(piece: int) -> Dictionary:
	var lines := [
		["I tore my map in three and sent each piece off on the tide, that no one villain should have the whole of it.",
			"If you are honest, find the others. If you are not, find them anyway, and drink to me when you dig."],
		["The gold is buried where the X is. The X is on the map. The map is in three bottles. I was drunk when I thought of this.",
			"Here is one third of it. Good luck to you."],
		["Becalmed nine days. The water is gone and the parrot is looking at me strangely.",
			"I leave my fortune to whoever pulls this from the sea. Mind, it is only a piece of it."],
		["They took the ship but they did not take the map. I chewed it to pieces rather than give it up. Well, to three pieces.",
			"This is one of them. Forgive the tooth marks."],
	]
	var body: Array = (lines.pick_random() as Array).duplicate()
	body.append("The last piece! The map is whole." if piece >= 3 else "That makes %d of 3." % piece)
	return {
		"title": ["To whoever finds this,", "Friend, if you be a friend,", "To the finder, with my blessing,"].pick_random(),
		"body": body,
		"sign": CASTAWAYS.pick_random(),
	}


## A named captain's taunt (Bounty.CAPTAINS), sent ahead of them on the current.
static func rival_letter(c: Dictionary, ship: String) -> Dictionary:
	return {
		"title": "To the captain of the %s," % ship,
		"body": [
			"“%s”" % c.taunt,
			["I have heard all about you. The Brethren talk of little else in the taverns. Enjoy it while it lasts.",
				"I sent this bottle ahead so you would know my name before you see my sails.",
				"Keep looking over your shoulder. One day the sails you see there will be mine."].pick_random(),
			"P.S. %s" % c.trait,
		],
		"sign": "%s, called %s · the %s" % [c.name, c.epithet, c.ship],
	}


## Somebody's lost letter: no map in it, but something of worth. The words,
## the gold it is good for and its seal ("red" or "gold").
static func lost_letter(port: String, isle: String) -> Dictionary:
	var kinds := [
		{"title": "Pay the bearer on sight,",
			"body": ["The sum of two hundred and fifty gold crowns, drawn on the counting house at %s. This note is good at any port of the isles." % port, "Lost overboard off the Esperanza. If found, kindly return. (Nobody ever does.)"],
			"sign": "Banco de Fortuna, by their clerk", "gold": 250, "seal": "gold"},
		{"title": "My dearest Rosalind,",
			"body": ["Every wave that passes under the keel takes me a little further from you, and every one that comes back brings me a little nearer. Wait for me at the quay.", "I have put a coin in with this for luck. If a stranger reads it, keep the coin, and be kind to someone today."],
			"sign": "Ever yours, Edmund", "gold": 60, "seal": "red"},
		{"title": "Grog, the proper way:",
			"body": ["One of rum, four of water, the juice of half a lime, a spoon of dark sugar and a pinch of cinnamon if the purser is not looking. Stir with a belaying pin.", "Tested on the whole crew of the Gilded Gull, off %s, with great success and some singing." % isle],
			"sign": "Cook “Smoky” Abernathy", "gold": 40, "seal": "red"},
		{"title": "Notice to all mariners,",
			"body": ["A purse of gold is owed to any honest captain who sails these waters clear of cutthroats. This bottle is the purse. Spend it at %s and think kindly of the Harbour Board." % port],
			"sign": "The Harbour Board of %s" % port, "gold": 180, "seal": "gold"},
		{"title": "Day 41.",
			"body": ["Still on this rock off %s. I have named the crabs. Bartholomew is my favourite. He does not know it." % isle, "I found these coins in the sand. They are no good to me. Perhaps they will be to you."],
			"sign": "A castaway (now rescued, I hope)", "gold": 120, "seal": "red"},
	]
	return kinds.pick_random()
