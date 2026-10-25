class_name EnemyBars
extends Control
## A slim red bar over every enemy ship in view, riding just above her
## tallest truck so it never sits on her hull, draining as she's hurt, with
## the marks of what special shot has done to her beside it (the web game's
## #bars). Bars are pooled: one per ship on screen.

const W := 64.0 * HudStyle.PX
const H := 6.0 * HudStyle.PX
## Above her trucks (m), then up the screen (units).
const ABOVE := 4.5
const LIFT := 18.0 * HudStyle.PX

var _bars := {}
var _free: Array[HullBar] = []


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)


func show_ships(ships: Array[Ship], player: Ship, cam: Camera3D) -> void:
	var seen := {}
	var vp := get_viewport_rect().size
	for s in ships:
		if s == player or not s.alive or s.removed or s.prize or s.lashed or (player != null and s.team == player.team):
			continue
		var top := 0.0
		for m: Dictionary in s.cls.masts:
			top = maxf(top, float(m.height))
		var p := Vector3(s.pos.x, s.position.y + top + ABOVE, s.pos.z)
		if cam.is_position_behind(p):
			continue
		var at := cam.unproject_position(p)
		if at.x < -vp.x * 0.05 or at.x > vp.x * 1.05 or at.y < -vp.y * 0.05 or at.y > vp.y * 1.05:
			continue
		seen[s] = true
		var bar: HullBar = _bars.get(s)
		if bar == null:
			bar = _free.pop_back() if not _free.is_empty() else null
			if bar == null:
				bar = HullBar.new(true)
				bar.size = Vector2(W, H)
				add_child(bar)
			bar.visible = true
			bar.set_frac(s.hp / s.max_hp, true)
			_bars[s] = bar
		bar.set_frac(s.hp / s.max_hp)
		bar.show_marks(s.afire > 0.0, s.torn > 0.0, s.crew_hit > 0.0)
		bar.position = Vector2(at.x - W * 0.5, at.y - LIFT)
	# (untyped: a ship that has just left the sea may already be freed)
	for s in _bars.keys():
		if not seen.has(s):
			var bar: HullBar = _bars[s]
			bar.visible = false
			_free.append(bar)
			_bars.erase(s)
