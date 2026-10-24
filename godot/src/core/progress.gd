extends Node
## What the game keeps between voyages: the ship you sail, the waters you set
## out in, the view you sailed with, your purse, the archipelagos you've
## charted, the waypoints on your sea chart and your records, your locker of
## ship parts and each ship's refit, your Treasure Vault (the skins, blasts
## and trails you've won, what she wears and the vault's pity), and her look
## and your saved designs from the Shipwright. Autoloaded as `Progress`.
##
## It lives in user://progress.json, written whole to a fresh file and swapped
## in, so a crash or a dead battery mid-write can never leave it half-written.
## A change is kept a moment and written with whatever follows it, and at
## once when the game goes to the background or closes. The looks (a painted
## flag is a picture) keep a file of their own, user://looks.json, written
## only when they change.

## Gold came in or went out of the purse.
signal purse_changed(gold: int)
## A part came into the locker, or one was fitted or taken off.
signal parts_changed
## Something came into the vault, or she put on something else.
signal vault_changed

const PATH := "user://progress.json"
const LOOKS := "user://looks.json"
const VERSION := 1
## The farewell card kept its records here before they moved in (phase 3).
const OLD_RECORDS := "user://records.json"
## Seconds a change waits to be written, gathering whatever follows it.
const SETTLE := 2.0
const SHIPS: Array[String] = ["sloop", "brig", "galleon"]
const SEAS: Array[String] = ["home", "brumas"]
## Waypoints kept at most (Waypoints.MAX).
const PINS := 5

## The ship you sail (a ShipClass id).
var ship := "sloop"
## The waters a voyage sets out in, and whether you've ever picked them (the
## sea picker says "Last voyage" then, "Start here" before).
var start_sea := "home"
var sea_picked := false
## The camera's zoom and tilt you last sailed with (zoom < 0: none yet).
var view := Vector2(-1.0, 0.0)
## Gold earned over every voyage, to spend in port.
var purse := 0
## Archipelago id → when you first sailed into it (unix seconds).
var charts := {}
## The waypoints on your sea chart, oldest first: [x, z, colour] each (Waypoints).
var pins := []
## Your bests over every voyage, and how many you've sailed.
var records := {"voyages": 0, "renown": 0, "gold": 0, "kills": 0, "isles": 0, "time": 0.0}
## Your ship parts and what each class has bolted on (Parts.fresh): {owned:
## {id: count}, fit: {class: loadout}, unseen: [found, not yet looked at]}.
var parts := Parts.fresh()
## Your Treasure Vault (Cosmetics.fresh): {owned, equip: {skin, blast, trail},
## pity, pulls, daily, unseen}.
var vault := Cosmetics.fresh()
## Her look (ShipLook), and the designs you've saved, newest first: [{id, name, look}].
var look := ShipLook.fresh()
var designs := []

## Where it's kept (tools/check.gd keeps a scratch copy elsewhere).
var path := PATH
var looks_path := LOOKS

var _wait := -1.0
var _looks_dirty := false


func _ready() -> void:
	_load()
	set_process(false)


## Gold into the purse (every coin a voyage earns lands here too).
func earn(gold: int) -> void:
	if gold == 0:
		return
	purse = maxi(0, purse + gold)
	purse_changed.emit(purse)
	touch()


## Gold out of the purse: false (and nothing spent) if it doesn't stretch that far.
func spend(gold: int) -> bool:
	if gold <= 0 or purse < gold:
		return false
	purse -= gold
	purse_changed.emit(purse)
	touch()
	return true


## Whether a part is in the locker.
func owns(id: String) -> bool:
	return parts.owned.has(id)


## How many different parts the locker holds.
func parts_collected() -> int:
	return parts.owned.size()


## What a class has bolted on, slot by slot (a copy).
func loadout(cls_id: String) -> Dictionary:
	return (parts.fit.get(cls_id, {}) as Dictionary).duplicate()


## The part fitted in a slot of a class ("" the standard fit).
func equipped(cls_id: String, slot: String) -> String:
	return str((parts.fit.get(cls_id, {}) as Dictionary).get(slot, ""))


## A part into the locker: {part, fresh, refund}, where a spare's refund is
## gold for the caller to pay into the purse (empty if no such part).
func grant_part(id: String) -> Dictionary:
	var p := Parts.part(id)
	if p.is_empty():
		return {}
	var first: bool = not parts.owned.has(id)
	parts.owned[id] = int(parts.owned.get(id, 0)) + 1
	if first and not parts.unseen.has(id):
		parts.unseen.append(id)
	_parts_touched()
	return {"part": p, "fresh": first, "refund": 0 if first else int(Parts.RARITIES[p.tier].refund)}


## Bolts a part onto a class ("" puts the standard fit back); false if it
## isn't hers to fit.
func equip(cls_id: String, slot: String, id: String) -> bool:
	if not Parts.CLASS_IDS.has(cls_id) or not Parts.SLOTS.has(slot):
		return false
	var fit: Dictionary = parts.fit.get(cls_id, {})
	if id == "":
		if not fit.has(slot):
			return true
		fit.erase(slot)
	else:
		var p := Parts.part(id)
		if p.is_empty() or p.slot != slot or not owns(id):
			return false
		if str(fit.get(slot, "")) == id:
			return true
		fit[slot] = id
	parts.fit[cls_id] = fit
	_parts_touched()
	return true


## The parts found and not yet looked at, looked at now (all of them, or `ids`).
func mark_seen(ids: Array = []) -> void:
	var before: int = parts.unseen.size()
	if ids.is_empty():
		parts.unseen = []
	else:
		parts.unseen = parts.unseen.filter(func(id: String) -> bool: return not ids.has(id))
	if parts.unseen.size() != before:
		_parts_touched()


## Every part into the locker (a debug flag's); true if anything was new.
func grant_all_parts() -> bool:
	var changed := false
	for p in Parts.all():
		if not parts.owned.has(p.id):
			parts.owned[p.id] = 1
			changed = true
	if changed:
		_parts_touched()
	return changed


func _parts_touched() -> void:
	parts_changed.emit()
	touch()


# ------------------------------------------------------------------ the vault


## Whether a vault item (a skin, a blast, a trail) is yours.
func owns_item(id: String) -> bool:
	return (vault.owned as Dictionary).has(id)


## What she wears of a kind ("skin", "blast", "trail"): an item id.
func wearing(kind: String) -> String:
	return str((vault.equip as Dictionary).get(kind, Cosmetics.BASE[kind]))


## She wears an item of yours from now on; false if it isn't yours.
func wear(id: String) -> bool:
	var it := Cosmetics.item(id)
	if it.is_empty() or not owns_item(id):
		return false
	if wearing(it.kind) == id:
		return true
	vault.equip[it.kind] = id
	_vault_touched()
	return true


## The vault's finds of a kind (all kinds if "") looked at now.
func mark_items_seen(kind := "") -> void:
	var before: int = vault.unseen.size()
	vault.unseen = (vault.unseen as Array).filter(func(id: String) -> bool:
		return kind != "" and str(Cosmetics.item(id).get("kind", "")) != kind)
	if vault.unseen.size() != before:
		_vault_touched()


## Whether a kind has finds not yet looked at.
func has_unseen(kind: String) -> bool:
	for id: String in vault.unseen:
		if str(Cosmetics.item(id).get("kind", "")) == kind:
			return true
	return false


## Opens the vault's chest n times (1 or 10), paid from the purse (the day's
## first single is free): each open's {item, fresh, refund}, a duplicate's
## refund paid into the purse; empty if the purse is short.
func pull(n: int, rnd := Callable()) -> Array[Dictionary]:
	var left := Cosmetics.pay(vault, n, purse)
	if left < 0:
		return []
	purse = left
	var out := Cosmetics.open(vault, n, rnd)
	for r in out:
		purse += int(r.refund)
	purse_changed.emit(purse)
	_vault_touched()
	return out


## A trophy from the sea (a vault item won outright): {item, fresh, refund},
## a duplicate's refund paid into the purse.
func award(id: String) -> Dictionary:
	var it := Cosmetics.item(id)
	if it.is_empty():
		return {}
	var r := Cosmetics.gain(vault, it)
	if int(r.refund) > 0:
		earn(int(r.refund))
	_vault_touched()
	return r


## Every vault item yours (a debug flag's); true if anything was new.
func grant_all_items() -> bool:
	var changed := false
	for it in Cosmetics.pool():
		if not owns_item(it.id):
			vault.owned[it.id] = 1
			changed = true
	if changed:
		_vault_touched()
	return changed


func _vault_touched() -> void:
	vault_changed.emit()
	touch()


## Charts an archipelago for good: true the first time.
func chart(id: String) -> bool:
	if charts.has(id):
		return false
	charts[id] = int(Time.get_unix_time_from_system())
	touch()
	return true


func charted(id: String) -> bool:
	return charts.has(id)


func pick_ship(id: String) -> void:
	if SHIPS.has(id) and id != ship:
		ship = id
		touch()


func pick_sea(id: String) -> void:
	if SEAS.has(id) and (id != start_sea or not sea_picked):
		start_sea = id
		sea_picked = true
		touch()


## Keeps the view a voyage is sailed with, for the next.
func keep_view(zoom: float, tilt: float) -> void:
	var v := Vector2(snappedf(zoom, 0.001), snappedf(tilt, 0.001))
	if v != view:
		view = v
		touch()


## The sea chart's waypoints, as Waypoints keeps them.
func keep_pins(list: Array) -> void:
	if list != pins:
		pins = list.duplicate(true)
		touch()


## Her look, as the Shipwright leaves it.
func keep_look(l: Dictionary) -> void:
	if l != look:
		look = l.duplicate(true)
		_looks_dirty = true
		touch()


## Your saved designs, as the Shipwright leaves them.
func keep_designs(list: Array) -> void:
	if list != designs:
		designs = list.duplicate(true).slice(0, ShipLook.MAX_SAVED)
		_looks_dirty = true
		touch()


## Something changed: written a moment from now, with whatever follows it.
func touch() -> void:
	if _wait < 0.0:
		_wait = SETTLE
		set_process(true)


func _process(dt: float) -> void:
	_wait -= dt
	if _wait <= 0.0:
		save()


func _notification(what: int) -> void:
	# the phone may never bring the game back from the background
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		if _wait >= 0.0:
			save()


## Writes it now: to a fresh file first, then swapped in for the old one.
func save() -> void:
	_wait = -1.0
	set_process(false)
	var data := {
		"version": VERSION,
		"ship": ship,
		"start_sea": start_sea,
		"sea_picked": sea_picked,
		"view": [view.x, view.y],
		"purse": purse,
		"charts": charts,
		"pins": pins,
		"records": records,
		"parts": parts,
		"vault": vault,
	}
	_write(path, JSON.stringify(data, "\t"))
	if _looks_dirty:
		_looks_dirty = false
		_write(looks_path, JSON.stringify({"version": VERSION, "look": look, "designs": designs}))


## A file written whole: to a fresh one first, then swapped in for the old.
func _write(file: String, text: String) -> void:
	var tmp := file + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("progress: can't write %s (%s)" % [tmp, error_string(FileAccess.get_open_error())])
		return
	f.store_string(text)
	f.close()
	var err := DirAccess.rename_absolute(tmp, file)
	if err != OK:
		push_warning("progress: can't swap in %s (%s)" % [file, error_string(err)])


func _load() -> void:
	# the fresh copy survives a crash between its writing and the swap
	var d: Variant = _read(path)
	if not d is Dictionary:
		d = _read(path + ".tmp")
	var had_vault := false
	if d is Dictionary:
		had_vault = (d as Dictionary).has("vault")
		_adopt(d)
	elif FileAccess.file_exists(OLD_RECORDS):
		var old: Variant = _read(OLD_RECORDS)
		if old is Dictionary:
			_adopt({"records": old})
			save()
	var l: Variant = _read(looks_path)
	if not l is Dictionary:
		l = _read(looks_path + ".tmp")
	if l is Dictionary:
		look = ShipLook.sanitize((l as Dictionary).get("look"))
		designs = ShipLook.sanitize_designs((l as Dictionary).get("designs"))
	# the vault opens with a purse to try it with (the web's fresh vault), once
	if not had_vault:
		purse += Cosmetics.START_PURSE
		touch()


## A save's contents, or null if it's missing or not whole JSON (quietly:
## a torn file is what the fresh copy is there for).
func _read(file: String) -> Variant:
	if not FileAccess.file_exists(file):
		return null
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(file)) != OK:
		return null
	return json.data


## Takes what a save holds, field by field, ignoring anything malformed.
func _adopt(d: Dictionary) -> void:
	if SHIPS.has(str(d.get("ship", ""))):
		ship = str(d.ship)
	if SEAS.has(str(d.get("start_sea", ""))):
		start_sea = str(d.start_sea)
		sea_picked = bool(d.get("sea_picked", true))
	var v: Variant = d.get("view")
	if v is Array and (v as Array).size() == 2:
		view = Vector2(clampf(float(v[0]), -1.0, 1.0), clampf(float(v[1]), 0.0, 1.0))
	purse = maxi(0, int(d.get("purse", 0)))
	var c: Variant = d.get("charts")
	if c is Dictionary:
		for k: String in c:
			charts[k] = int(c[k])
	var w: Variant = d.get("pins")
	if w is Array:
		pins = []
		for e: Variant in w:
			if e is Array and (e as Array).size() == 3 and _numbers(e) and pins.size() < PINS:
				pins.append([roundi(float(e[0])), roundi(float(e[1])), clampi(int(e[2]), 0, PINS - 1)])
	parts = Parts.sanitize(d.get("parts"))
	vault = Cosmetics.sanitize(d.get("vault"))
	var r: Variant = d.get("records")
	if r is Dictionary:
		for k: String in records:
			if (r as Dictionary).has(k):
				records[k] = maxf(0.0, float(r[k])) if k == "time" else maxi(0, int(r[k]))


## Whether every entry is a finite number (a hand-edited save can hold anything).
static func _numbers(a: Array) -> bool:
	for v: Variant in a:
		if not (v is float or v is int) or not is_finite(float(v)):
			return false
	return true
