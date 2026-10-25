class_name Tidings
## What comes aboard in writing (the web game's game/tidings.ts): the
## letters found in bottles and the news the carrier gull brings. Only the words live here, as {title, body
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


# ------------------------------------------------------------------ the carrier gull

## Prize money for clearing the sea lanes, sent by the Crown's agent in port.
static func prize_news(kills: int, gold: int, port: String) -> Dictionary:
	return {
		"title": "Prize money, Captain!",
		"body": [
			"The merchants of %s have heard of the %d pirate %s you sent to the bottom. The sea lanes are safer for it, and they would like you to have this purse of %s gold." % [port, kills, "ship" if kills == 1 else "ships", MenuKit.num(gold)],
			["Do try not to spend it all in one tavern.", "The fishwives have taken to toasting your name. It is very loud.", "The harbourmaster says to keep it up."].pick_random(),
		],
		"sign": "The Crown’s prize agent at %s" % port,
	}


## The Brethren have put a named captain (Bounty.CAPTAINS) on your trail.
static func bounty_news(c: Dictionary, gold: int) -> Dictionary:
	return {
		"title": "Wanted: dead or sunk!",
		"body": [
			"The Brethren have sent %s after you, in the %s. The Crown will pay %s gold to whoever sends her to the bottom." % [c.epithet, c.ship, MenuKit.num(gold)],
			"%s Keep a weather eye open." % c.trait,
		],
		"sign": "A friend in the Governor’s office",
	}


## A rumour of salvage washed up off an island: there's a pin on the chart for it.
static func rumour_news(isle: String, port: String) -> Dictionary:
	return {
		"title": "A word in your ear,",
		"body": [
			"Fishermen out of %s swear they saw a chest wash up in the shallows off %s. They were too frightened of the cutthroats to go and fetch it." % [port, isle],
			"I have marked the spot on your chart. A share for the gull would be appreciated.",
		],
		"sign": "Old Nan at the fish market",
	}


## A feast in port tonight: the harbourmaster's invitation.
static func feast_news(towns: Array, feast: String, line: String, full: bool) -> Dictionary:
	var where := "every port in the isles" if towns.size() > 2 else " and ".join(PackedStringArray(towns))
	return {
		"title": "%s tonight!" % feast if full else "%s at %s tonight!" % [feast, where],
		"body": [
			"%s." % line,
			["Lanterns at dusk, a band on the quay and fireworks over the harbour after dark. Captains welcome; cannons stay outside.",
				"Come in by nightfall, Captain: there will be dancing on the quay, lantern boats on the water and rockets over the harbour.",
				"The taverns are rolling out the barrels already. Moor up before the lanterns are lit and the first drink is on the house."].pick_random(),
		],
		"sign": "The harbourmasters of the isles" if full else "The harbourmaster of %s" % towns[0],
	}
