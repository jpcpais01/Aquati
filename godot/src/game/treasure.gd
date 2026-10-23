class_name Treasure
extends RefCounted
## What the sea gives up: sixty kinds of plunder in five rarities, from casks
## of rum to the Crown of the Drowned King. Salvage pays out no gold on the
## spot: its goods ride home in the ship's hold and are only worth something
## once a trading port's market buys them. The web game's treasure.ts; the
## goods' little portraits are baked from its lootArt.ts (art/plunder.json).

const RARITY_NAME := ["Common", "Uncommon", "Rare", "Epic", "Legendary"]
const RARITY_COLOR := [Color("#e3d9c2"), Color("#7fe08e"), Color("#6cc8ff"), Color("#c48bff"), Color("#ffb52e")]

## Each good: id, name, rarity (0 common .. 4 legendary), what the market
## files it under, its fair price (gold), the room it takes in the hold, how
## a porter carries it ashore, and a line about it.
const GOODS := [
	["rum", "Cask of Rum", 0, "spirits", 30, 2, "barrel", "Dark, sweet and strong enough to strip paint."],
	["pennies", "Copper Pennies", 0, "coin", 14, 1, "sack", "A pouch of green-edged coppers."],
	["tobacco", "Tobacco Leaf", 0, "provisions", 22, 1, "sack", "Cured golden leaf, tied in fat bundles."],
	["coffee", "Coffee Beans", 0, "provisions", 20, 1, "sack", "Roasted beans that smell of a far shore."],
	["calico", "Bolt of Calico", 0, "cloth", 18, 1, "crate", "Cheerful printed cotton, by the yard."],
	["sugar", "Sugar Loaves", 0, "provisions", 16, 1, "crate", "Hard white cones wrapped in blue paper."],
	["cheese", "Wheel of Cheese", 0, "provisions", 15, 1, "crate", "A whole wheel. Somebody will miss it."],
	["conch", "Pink Conch Shell", 0, "relics", 12, 1, "crate", "Hold it to your ear and hear the reef."],
	["silver", "Pieces of Eight", 1, "coin", 70, 1, "casket", "Silver reales, cut and stamped with a cross."],
	["spices", "Chest of Spices", 1, "provisions", 85, 1, "crate", "Cinnamon, clove and nutmeg in neat little drawers."],
	["wine", "Vintage Claret", 1, "spirits", 90, 2, "crate", "Wax-sealed bottles packed in straw."],
	["silk", "Bolt of Silk", 1, "cloth", 95, 1, "crate", "Shimmers teal one way and violet the other."],
	["scrimshaw", "Scrimshaw Tusk", 1, "art", 75, 1, "casket", "A whaling ship etched by a patient hand."],
	["sextant", "Brass Sextant", 1, "relics", 110, 1, "casket", "Still true to a hair. Navigators pay well."],
	["indigo", "Indigo Dye", 1, "cloth", 60, 1, "sack", "Cakes of the deepest blue money can buy."],
	["doubloons", "Gold Doubloons", 2, "coin", 220, 1, "casket", "Heavy Spanish gold, warm in the hand."],
	["pearls", "Pearl Strand", 2, "jewellery", 260, 1, "casket", "Forty matched pearls on a silk cord."],
	["emeralds", "Raw Emeralds", 2, "gems", 300, 1, "casket", "Green fire straight out of the rock."],
	["dagger", "Jewelled Dagger", 2, "relics", 240, 1, "casket", "Too pretty to stab anyone with. Probably."],
	["portrait", "Portrait of a Duchess", 2, "art", 320, 2, "painting", "She looks unimpressed with your table manners."],
	["saffron", "Jar of Saffron", 2, "provisions", 180, 1, "casket", "Worth more than its weight in gold."],
	["ruby", "Sultan's Ruby", 3, "gems", 650, 1, "casket", "Big as a quail egg and red as a sunset."],
	["tiara", "Sapphire Tiara", 3, "jewellery", 720, 1, "casket", "Made for a princess who never got it."],
	["chalice", "Golden Chalice", 3, "relics", 560, 1, "idol", "Choose wisely. This one is the real one."],
	["seascape", "Storm over Tortuga", 3, "art", 880, 2, "painting", "An old master caught the squall just so."],
	["astrolabe", "Gilded Astrolabe", 3, "relics", 600, 1, "casket", "Maps the stars of a sky long gone."],
	["crown", "Crown of the Drowned King", 4, "jewellery", 2400, 1, "casket", "Still wet. Still waiting for its king."],
	["idol", "Golden Idol", 4, "relics", 2000, 2, "idol", "Solid gold, and very much cursed. Probably."],
	["krakenPearl", "Kraken's Pearl", 4, "gems", 3200, 1, "casket", "It hums when the sea is angry."],
	["mask", "Mask of El Dorado", 4, "relics", 2800, 1, "idol", "The sun itself, beaten into a face."],
	["hardtack", "Ship's Biscuit", 0, "provisions", 10, 1, "crate", "Hard enough to break a tooth. Knock out the weevils first."],
	["oranges", "Crate of Oranges", 0, "provisions", 19, 1, "crate", "Sunshine in a crate, and no scurvy aboard this month."],
	["saltfish", "Salted Cod", 0, "provisions", 13, 1, "crate", "Stiff as a board and twice as salty."],
	["coconuts", "Green Coconuts", 0, "provisions", 11, 1, "sack", "Sweet water inside, if you have a cutlass handy."],
	["rope", "Coil of Hemp Rope", 0, "cloth", 17, 1, "crate", "Forty fathoms of good tarred line. Every bosun wants it."],
	["cider", "Jug of Cider", 0, "spirits", 21, 1, "barrel", "Cloudy, sharp and pressed from orchard apples a world away."],
	["cowries", "Cowrie Shells", 0, "coin", 15, 1, "sack", "Glossy little shells that buy a meal on half the coasts out there."],
	["tankard", "Pewter Tankard", 0, "relics", 16, 1, "crate", "Dented from a hundred tavern brawls. Holds a full pint still."],
	["tea", "Lacquered Tea Caddy", 1, "provisions", 80, 1, "crate", "Smoky black leaf in a red tin painted with cranes."],
	["cacao", "Cacao Pods", 1, "provisions", 65, 1, "sack", "Grind the beans with sugar and you have something divine."],
	["brandy", "Decanter of Brandy", 1, "spirits", 105, 1, "crate", "Cut crystal and old amber fire. Pour it slowly."],
	["lace", "Corália Lace", 1, "cloth", 92, 1, "crate", "Bobbin lace so fine the nuns of Sainte-Corália went blind making it."],
	["spyglass", "Brass Spyglass", 1, "relics", 120, 1, "casket", "Spots a sail before she spots you."],
	["coral", "Red Coral Branch", 1, "gems", 100, 1, "casket", "Blood-red coral from the deep reefs, polished to a gleam."],
	["pipe", "Meerschaum Pipe", 1, "art", 85, 1, "casket", "Its bowl is carved as a bearded old sea captain. He disapproves."],
	["reserve", "Ronvliet Reserve, 1702", 2, "spirits", 210, 1, "crate", "The distillery's finest year, dusty and wax-sealed. Drink it and weep."],
	["ingots", "Silver Ingots", 2, "coin", 250, 2, "casket", "Stamped bars from the mint at Aguadouro. Heavy as sin."],
	["jade", "Jade Dragon", 2, "art", 290, 1, "idol", "A coiled dragon carved from a single green stone."],
	["cameo", "Cameo Brooch", 2, "jewellery", 235, 1, "casket", "A lady in ivory profile on sardonyx, ringed with seed pearls."],
	["musicBox", "Gilded Music Box", 2, "art", 260, 1, "casket", "Wind it and a tiny ship sails round, playing a sailor's waltz."],
	["chronometer", "Marine Chronometer", 2, "relics", 340, 1, "casket", "Keeps true time at sea, so you always know your longitude."],
	["diamond", "Heart of Aguadouro", 3, "gems", 820, 1, "casket", "A blue-white diamond the bankers swore was never stolen."],
	["globe", "Celestial Globe", 3, "relics", 640, 2, "idol", "Every star and constellation in gold on a sphere of night."],
	["helm", "Conquistador's Helm", 3, "relics", 580, 2, "idol", "A crested steel morion with gold filigree, and a dent with a story."],
	["egg", "Jewelled Egg", 3, "jewellery", 760, 1, "casket", "Open it and a little golden swan unfolds its wings."],
	["carpet", "Sultan's Silk Carpet", 3, "cloth", 620, 2, "crate", "Ten thousand knots to the hand. They say it once flew."],
	["trident", "Trident of the Deep", 4, "relics", 3000, 2, "idol", "Raise it and the waves bow. Or so the drowned sailors said."],
	["bottleShip", "Golden Galleon in a Bottle", 4, "art", 2600, 1, "casket", "A perfect galleon of solid gold. Some say she was full size once."],
	["sceptre", "Sceptre of Sainte-Corália", 4, "jewellery", 2500, 1, "casket", "The lost sceptre of the island queens, with a sapphire the size of a fist."],
	["sunstone", "Sunstone of the Lost Fleet", 4, "gems", 3100, 1, "casket", "It finds the sun through the thickest storm. The fleet that lost it never came home."],
	["krakenInk", "Vial of Kraken Ink", 3, "relics", 950, 1, "casket", "Black as the deep. At night it writes by itself."],
	["krakenBeak", "Beak of the Kraken", 4, "relics", 3800, 2, "idol", "Sharp enough to bite through a keel. It has."],
]
## Trophies no chest or wreck ever rolls: you have to slay the Kraken for them.
const TROPHIES := ["krakenInk", "krakenBeak"]
## How much a hull of each class can carry, in units of room.
const HOLD_ROOM := {"sloop": 10, "brig": 16, "galleon": 26}

static var _index := {}
static var _by_rarity: Array[PackedStringArray] = []


static func _build() -> void:
	if not _index.is_empty():
		return
	for r in 5:
		_by_rarity.append(PackedStringArray())
	for i in GOODS.size():
		var g: Array = GOODS[i]
		_index[g[0]] = i
		if not TROPHIES.has(g[0]):
			_by_rarity[int(g[2])].append(g[0])


static func good(id: String) -> Array:
	_build()
	return GOODS[_index[id]]


static func name_of(id: String) -> String:
	return good(id)[1]


static func rarity_of(id: String) -> int:
	return good(id)[2]


static func price_of(id: String) -> int:
	return good(id)[4]


static func size_of(id: String) -> int:
	return good(id)[5]


## One good of rarity r, the cheaper ones a little more often.
static func roll_good(r: int) -> String:
	_build()
	var pool := _by_rarity[clampi(r, 0, 4)]
	var sum := 0.0
	for id in pool:
		sum += 1.0 / sqrt(price_of(id))
	var x := randf() * sum
	for id in pool:
		x -= 1.0 / sqrt(price_of(id))
		if x <= 0.0:
			return id
	return pool[pool.size() - 1]


## What a floating barrel or chest holds. Its tier (0 barrel .. 4 legendary
## chest) is its best good's rarity; the rest are a mixed lot a step or two below.
static func roll_contents(tier: int) -> PackedStringArray:
	var out := PackedStringArray([roll_good(tier)])
	var extra: int = [1 if randf() < 0.3 else 0, 1, 1 + (1 if randf() < 0.5 else 0), 2, 2 + (1 if randf() < 0.5 else 0)][clampi(tier, 0, 4)]
	for i in extra:
		var drop := 1 if randf() < 0.6 else 2
		out.append(roll_good(maxi(0, tier - drop)))
	return out


## The ship's hold: limited room, so the finest goods push the humble ones overboard.
class Hold:
	extends RefCounted

	signal changed

	var capacity := 10
	var _stacks := {}

	func _init(cap: int = 10) -> void:
		capacity = cap

	func used() -> int:
		var u := 0
		for id: String in _stacks:
			u += Treasure.size_of(id) * int(_stacks[id])
		return u

	func count() -> int:
		var c := 0
		for n: int in _stacks.values():
			c += n
		return c

	## Fair value of everything aboard.
	func worth() -> int:
		var w := 0
		for id: String in _stacks:
			w += Treasure.price_of(id) * int(_stacks[id])
		return w

	func has(id: String) -> int:
		return _stacks.get(id, 0)

	## The stacks aboard, finest first: [[id, n], ...].
	func list() -> Array:
		var out := []
		for id: String in _stacks:
			out.append([id, _stacks[id]])
		out.sort_custom(func(a: Array, b: Array) -> bool:
			var pa := Treasure.price_of(a[0])
			var pb := Treasure.price_of(b[0])
			return pa > pb or (pa == pb and str(a[0]) < str(b[0])))
		return out

	## Stows goods, best first; if the hold is full the cheapest cargo for
	## its room goes over the side to make way. Returns {kept, left, tossed}.
	func stow(goods: PackedStringArray, notify: bool = true) -> Dictionary:
		var kept := PackedStringArray()
		var left := PackedStringArray()
		var tossed := PackedStringArray()
		var sorted := Array(goods)
		sorted.sort_custom(func(a: String, b: String) -> bool: return _density(a) > _density(b))
		for id: String in sorted:
			var room := Treasure.size_of(id)
			var dens := _density(id)
			while used() + room > capacity:
				var worst := ""
				var wd := INF
				for sid: String in _stacks:
					var d := _density(sid)
					if d < wd:
						wd = d
						worst = sid
				if worst == "" or wd >= dens:
					break
				take(worst, 1, false)
				tossed.append(worst)
			if used() + room > capacity:
				left.append(id)
				continue
			_stacks[id] = int(_stacks.get(id, 0)) + 1
			kept.append(id)
		if notify:
			changed.emit()
		return {"kept": kept, "left": left, "tossed": tossed}

	## Whether stowing these would keep at least one (tossing cheaper cargo if need be).
	func would_keep(goods: PackedStringArray) -> bool:
		var trial := Hold.new(capacity)
		trial._stacks = _stacks.duplicate()
		return not trial.stow(goods, false).kept.is_empty()

	func take(id: String, n: int, notify: bool = true) -> int:
		var have: int = _stacks.get(id, 0)
		var k := mini(have, n)
		if have - k <= 0:
			_stacks.erase(id)
		else:
			_stacks[id] = have - k
		if notify:
			changed.emit()
		return k

	func clear() -> void:
		_stacks.clear()
		changed.emit()

	static func _density(id: String) -> float:
		return float(Treasure.price_of(id)) / Treasure.size_of(id)
