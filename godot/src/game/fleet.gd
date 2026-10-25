class_name Fleet
extends RefCounted
## Your own fleet (the web's fleet.ts): up to two escorts that sail in
## formation on your quarters, take your orders and fight at your side. A
## pirate you board can strike and sign on instead of being sent off for
## prize money, and the harbour masters at the trading ports have ships (and
## captains) for hire. The roster is kept between voyages (Progress.fleet);
## the ships themselves are built fresh each voyage from it (EscortAI sails them).
##
## A roster entry: {id, cls, name, master, origin ("prize" or "hired"),
## livery (a prize keeps the paint she was taken in; a hired ship wears
## yours), hp (0..1, carried from voyage to voyage until a port mends it),
## kills, joined (seconds since 1970: the roster's order)}.

## Escorts you can have at once.
const MAX := 2
const ORDERS := ["follow", "attack", "hold"]
const ORDER_INFO := {
	"follow": {"name": "Form on me", "short": "Follow", "line": "Keep station on the flagship and guard her", "ack": ["Forming on you!", "Aye, falling in!", "On your quarter, Captain!"]},
	"attack": {"name": "Attack my target", "short": "Attack", "line": "Break formation and engage the enemy", "ack": ["Engaging!", "Run out the guns!", "Aye, at them!"]},
	"hold": {"name": "Hold position", "short": "Hold", "line": "Heave to and guard these waters", "ack": ["Heaving to!", "Holding here, Captain!", "Aye, we hold!"]},
}
## What a harbour master asks to sign a ship and her crew on (from your purse).
const HIRE_PRICE := {"sloop": 2500, "brig": 6000, "galleon": 14000}
const CLASSES := ["sloop", "brig", "galleon"]

const SHIP_NAMES := [
	"Swift Tern", "Merry Dolphin", "Faithful", "Dauntless", "Saucy Sue", "Sea Lark", "Valiant", "Bonny Kate", "Albatross",
	"Lucky Star", "Steadfast", "Morning Glory", "Silver Heron", "Good Hope", "Wanderer", "Brave Margaret", "Kingfisher", "Gallant",
]
const MASTERS := [
	["Anne Corbett", "Never yet lost a ship"],
	["Jonah Reed", "Knows every reef by heart"],
	["Mira Holt", "Fastest gun crews in the isles"],
	["Silas Crane", "Old salt, steady in a blow"],
	["Isabel Vane", "Holds a grudge against the Brethren"],
	["Tobias Fenn", "Sailed with the Crown for twenty years"],
	["Grace O'Malley", "Fights like a cornered cat"],
	["Elias Marsh", "Calm as a millpond under fire"],
	["Rosa Quint", "Will follow you into any storm"],
	["Barnaby Hale", "Laughs loudest when the shot flies"],
	["Henrietta Moss", "A gunner's daughter, born on the deck"],
	["Ned Larkin", "Young, keen and very lucky"],
]


static func fresh() -> Dictionary:
	return {"ships": [], "lost": 0, "order": "follow"}


## A roster entry made whole, or {} if it can't be.
static func clean_rec(v: Variant) -> Dictionary:
	if not v is Dictionary:
		return {}
	var o: Dictionary = v
	if not o.get("id") is String or not CLASSES.has(o.get("cls")) or not o.get("name") is String:
		return {}
	var prize := str(o.get("origin", "")) == "prize"
	var livery := str(o.get("livery", ""))
	if not prize or not Livery.DEFS.has(livery) or livery == "player" or livery == Shipyard.GHOST:
		livery = Shipyard.MINE if not prize else Shipyard.LIVERIES[0]
	var num := func(x: Variant, d: float) -> float: return float(x) if (x is float or x is int) and is_finite(float(x)) else d
	return {
		"id": str(o.id).left(64),
		"cls": str(o.cls),
		"name": str(o.name).left(40),
		"master": str(o.get("master", "")).left(40),
		"origin": "prize" if prize else "hired",
		"livery": livery,
		"hp": clampf(num.call(o.get("hp"), 1.0), 0.05, 1.0),
		"kills": maxi(0, int(num.call(o.get("kills"), 0.0))),
		"joined": num.call(o.get("joined"), 0.0),
	}


## A saved fleet tidied (anything malformed dropped, never more than MAX, oldest hand first).
static func sanitize(v: Variant) -> Dictionary:
	var out := fresh()
	if not v is Dictionary:
		return out
	var d: Dictionary = v
	var seen := {}
	if d.get("ships") is Array:
		for e: Variant in d.ships:
			var r := clean_rec(e)
			if not r.is_empty() and not seen.has(r.id):
				seen[r.id] = true
				out.ships.append(r)
	out.ships.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a.joined) < float(b.joined))
	out.ships = out.ships.slice(0, MAX)
	out.lost = maxi(0, int(float(d.get("lost", 0))) if (d.get("lost") is float or d.get("lost") is int) else 0)
	out.order = str(d.get("order")) if ORDERS.has(d.get("order")) else "follow"
	return out


## Two ships a harbour master has to offer today, the same all day at the
## same port (as the web's: the same seeds give the same ships).
static func hire_offers(port_seed: int, day := -1) -> Array[Dictionary]:
	if day < 0:
		day = Parts.day_number()
	var rnd := Mulberry32.new((port_seed * 7919 + day * 104729) & 0xFFFFFFFF)
	var second := "brig" if rnd.next() < 0.68 else "galleon"
	var out: Array[Dictionary] = []
	var used := {}
	var hands := {}
	for cls: String in ["sloop", second]:
		var ni := int(rnd.next() * SHIP_NAMES.size())
		while used.has(ni):
			ni = (ni + 1) % SHIP_NAMES.size()
		used[ni] = true
		var mi := int(rnd.next() * MASTERS.size())
		while hands.has(mi):
			mi = (mi + 1) % MASTERS.size()
		hands[mi] = true
		var m: Array = MASTERS[mi]
		out.append({"id": "hire-%d-%d-%s" % [day, port_seed, cls], "cls": cls, "name": SHIP_NAMES[ni], "master": m[0], "trait": m[1], "price": HIRE_PRICE[cls]})
	return out


## A prize crew's master, picked from her own (now loyal) hands.
static func prize_master() -> String:
	return "%s %s" % [["Black", "One-Eyed", "Red", "Long", "Mad", "Lucky", "Silent", "Salty"].pick_random(), ["Tom", "Meg", "Jack", "Bess", "Finn", "Nell", "Will", "Moll"].pick_random()]


## Where escort `i` of `n` keeps station off a flagship `flag_length` long:
## astern on her quarters, wide enough apart that neither masks the other's
## broadside. x to port, y astern (m).
static func station(i: int, n: int, flag_length: float, length: float) -> Vector2:
	var L := (flag_length + length) * 0.5
	var side := 1.0 if n == 1 or i == 0 else -1.0
	return Vector2(side * (L + 16.0), L * 1.35 + 12.0)
