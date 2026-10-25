class_name ShipEvents
extends RefCounted
## The event ships: special ships, not of the line, each a kind of her own
## (any size, any shape, her own colours and a power of her own), that sail
## in for a season of the year. While an event is on its ships join the
## harbour's picker, in a tab that glows in the event's colours; pick one
## while it's on and she's yours to keep, in the picker for good after the
## season ends (Progress.claimed).
##
## Each event: its name, the ships it brings, the days it runs (month, day;
## both inclusive, the same days every year), and its colours: the tab's
## glow, a second glow, and the ink its words are set in.

const EVENTS := {
	# All Hallows' Eve: the Hollow Jack sails out of the mist
	"hallowtide": {
		"name": "Hallowtide", "ships": ["revenant"], "from": [10, 17], "to": [11, 8],
		"glow": Color("#ff8a1e"), "glow2": Color("#8dffc4"), "ink": Color("#ffc27a"),
	},
}
const MONTHS: Array[String] = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

## Every event on (1) or off (0) whatever the date, or the calendar's say
## (-1): the --events flag and the checks.
static var force := -1


## The event a ship sails in for ({} for a ship of the line), with its id.
static func event_of(cls_id: String) -> Dictionary:
	for id: String in EVENTS:
		if (EVENTS[id].ships as Array).has(cls_id):
			var e: Dictionary = EVENTS[id].duplicate()
			e.id = id
			return e
	return {}


## Whether an event is on at a moment (unix seconds; -1 now).
static func is_on(id: String, unix := -1) -> bool:
	if force >= 0:
		return force == 1
	if not EVENTS.has(id):
		return false
	var e: Dictionary = EVENTS[id]
	var d := _date(unix)
	var md := int(d.month) * 100 + int(d.day)
	var a := int(e.from[0]) * 100 + int(e.from[1])
	var b := int(e.to[0]) * 100 + int(e.to[1])
	return (md >= a and md <= b) if a <= b else (md >= a or md <= b)


## Whether a ship's event is on, so she can be picked (and claimed).
static func ship_on(cls_id: String, unix := -1) -> bool:
	var e := event_of(cls_id)
	return not e.is_empty() and is_on(str(e.id), unix)


## The last day of an event's season, as "8 Nov".
static func last_day(id: String) -> String:
	var e: Dictionary = EVENTS.get(id, {})
	if e.is_empty():
		return ""
	return "%d %s" % [int(e.to[1]), MONTHS[int(e.to[0])]]


## Every event ship, in the events' order.
static func all_ships() -> Array[String]:
	var out: Array[String] = []
	for id: String in EVENTS:
		for s: String in EVENTS[id].ships:
			out.append(s)
	return out


## The liveries the event ships always wear (their flags and marks are drawn
## with everyone else's at load: Outfitter.start).
static func liveries() -> Array[String]:
	var out: Array[String] = []
	for s in all_ships():
		var l := ShipClass.named(s).livery
		if l != "" and not out.has(l):
			out.append(l)
	return out


static func _date(unix: int) -> Dictionary:
	if unix < 0:
		return Time.get_date_dict_from_system()
	return Time.get_date_dict_from_unix_time(unix)
