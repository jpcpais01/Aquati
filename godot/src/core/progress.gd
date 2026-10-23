extends Node
## What the game keeps between voyages: the ship you sail, the waters you set
## out in, the view you sailed with, your purse, the archipelagos you've
## charted and your records. Autoloaded as `Progress`.
##
## It lives in user://progress.json, written whole to a fresh file and swapped
## in, so a crash or a dead battery mid-write can never leave it half-written.
## A change is kept a moment and written with whatever follows it, and at
## once when the game goes to the background or closes.

## Gold came in or went out of the purse.
signal purse_changed(gold: int)

const PATH := "user://progress.json"
const VERSION := 1
## The farewell card kept its records here before they moved in (phase 3).
const OLD_RECORDS := "user://records.json"
## Seconds a change waits to be written, gathering whatever follows it.
const SETTLE := 2.0
const SHIPS: Array[String] = ["sloop", "brig", "galleon"]
const SEAS: Array[String] = ["home", "brumas"]

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
## Your bests over every voyage, and how many you've sailed.
var records := {"voyages": 0, "renown": 0, "gold": 0, "kills": 0, "isles": 0, "time": 0.0}

## Where it's kept (tools/check.gd keeps a scratch copy elsewhere).
var path := PATH

var _wait := -1.0


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
		"records": records,
	}
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("progress: can't write %s (%s)" % [tmp, error_string(FileAccess.get_open_error())])
		return
	f.store_string(JSON.stringify(data, "\t"))
	f.close()
	var err := DirAccess.rename_absolute(tmp, path)
	if err != OK:
		push_warning("progress: can't swap in %s (%s)" % [path, error_string(err)])


func _load() -> void:
	# the fresh copy survives a crash between its writing and the swap
	var d: Variant = _read(path)
	if not d is Dictionary:
		d = _read(path + ".tmp")
	if d is Dictionary:
		_adopt(d)
	elif FileAccess.file_exists(OLD_RECORDS):
		var old: Variant = _read(OLD_RECORDS)
		if old is Dictionary:
			_adopt({"records": old})
			save()


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
	var r: Variant = d.get("records")
	if r is Dictionary:
		for k: String in records:
			if (r as Dictionary).has(k):
				records[k] = maxf(0.0, float(r[k])) if k == "time" else maxi(0, int(r[k]))
