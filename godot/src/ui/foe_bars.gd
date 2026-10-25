class_name FoeBars
extends Control
## Ashore, a slim bar over each cutthroat you've hurt (the web's .foe-bar):
## a touch narrower than a ship's, draining red; a camp's captain gets a
## wider one in gold with his name under it. Pooled, one per foe on screen.

const W := 46.0 * HudStyle.PX
const W_BOSS := 64.0 * HudStyle.PX
const H := 5.0 * HudStyle.PX
const BOSS_GOLD := [Color("#c2701d"), Color("#ffd27a")]

var _bars := {}
var _free: Array[_Bar] = []


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


## The foes to show (hurt and on their feet), seen through `cam`.
func show_foes(foes: Array[ShoreWalker], cam: Camera3D) -> void:
	var seen := {}
	var vp := get_viewport_rect().size
	for f in foes:
		if f.is_down() or f.hp >= f.max_hp:
			continue
		var p := Vector3(f.x, f.y + 2.25 * f.height, f.z)
		if cam.is_position_behind(p):
			continue
		var at := cam.unproject_position(p)
		if at.x < -vp.x * 0.05 or at.x > vp.x * 1.05 or at.y < -vp.y * 0.05 or at.y > vp.y * 1.05:
			continue
		seen[f.id] = true
		var bar: _Bar = _bars.get(f.id)
		var boss := f.max_hp > 100.0
		if bar == null:
			bar = _free.pop_back() if not _free.is_empty() else null
			if bar == null:
				bar = _Bar.new()
				add_child(bar)
			bar.dress(boss, f.title if f.title != "" else ("Captain of the camp" if boss else ""))
			bar.visible = true
			bar.bar.set_frac(f.hp / f.max_hp, true)
			_bars[f.id] = bar
		bar.bar.set_frac(f.hp / f.max_hp)
		bar.position = Vector2(roundf(at.x - bar.bar.size.x * 0.5), roundf(at.y))
	for id: int in _bars.keys():
		if not seen.has(id):
			var bar: _Bar = _bars[id]
			bar.visible = false
			_free.append(bar)
			_bars.erase(id)


func clear() -> void:
	show_foes([] as Array[ShoreWalker], null)


class _Bar:
	extends Control

	var bar: HullBar
	var _label: Label

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		bar = HullBar.new(true)
		add_child(bar)
		_label = HudStyle.label("", "inter", 700, roundi(9.0 * HudStyle.PX), Color("#ffe1a0"), 1)
		_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		add_child(_label)

	func dress(boss: bool, text: String) -> void:
		var w := W_BOSS if boss else W
		bar.size = Vector2(w, H)
		bar.tint(BOSS_GOLD if boss else HullBar.RED, false)
		_label.text = text
		_label.visible = text != ""
		var ls := _label.get_minimum_size()
		_label.size = Vector2(maxf(ls.x, w), ls.y)
		_label.position = Vector2((w - _label.size.x) * 0.5, H + 1.0 * HudStyle.PX)
