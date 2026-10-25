class_name Updater
extends Node
## Keeps the Android game up to date from inside it. Every merge to main is
## published as a GitHub release (`android-v<VERSION>.<run>`, with the APK
## and godot/RELEASE_NOTES.md as its notes); on launch, and again on coming
## back to the harbour an hour later, this asks GitHub for the releases and
## compares the newest one's run number with the one this build was made by
## (the last part of application/config/version, which CI writes).
##
## A newer build is offered with its notes (UpdateCard). Its APK downloads
## into user://updates (the app's own files, which the engine's FileProvider
## serves), is checked against the SHA-256 GitHub keeps for it, and goes to
## Android's package installer through OS.shell_open, which hands the file
## over as a content:// URI with read access granted. Android asks once to
## allow installs from the game (REQUEST_INSTALL_PACKAGES, in the export
## preset) and then for the tap on Install; every release is signed with the
## same key, so it installs over this one and everything kept stays.
##
## Offline, rate-limited or anything else that goes wrong while checking is
## quiet: there is simply no offer. A download that breaks off says so and
## can be tried again; a finished one survives the game being closed (the
## next launch offers it ready to install), and once a build is installed its
## APK is deleted.
##
## The Windows game (`desktop`) looks for the same releases' .exe instead,
## downloads and checks it the same way, and installs it itself: the running
## .exe is renamed aside (Windows lets a running program be renamed, not
## overwritten), the new one is copied into its place, so shortcuts keep
## working, and started, and this one quits. The renamed old one is deleted
## on the next launch. If the game's folder can't be written to, the new
## build runs from where it was downloaded instead. The saves live in the
## user's own folder, so the new build picks up where this one left off.

## The state changed, or a download moved on.
signal changed
## A newer build than this one was found (each build once a run).
signal found

enum { IDLE, CHECKING, OFFER, DOWNLOADING, VERIFYING, READY, INSTALLING, FAILED, CURRENT }

const API := "https://api.github.com/repos/jpcpais01/Aquati/releases?per_page=30"
const TAG := "android-v"
const DIR := "user://updates"
## Seconds before the harbour asks again.
const RECHECK := 3600.0
## Bytes hashed a frame while checking the download's seal.
const HASH_STEP := 4 << 20

var state := IDLE
## Off unless this is the Android or Windows game (or a run told to pretend).
var enabled := false
## The Windows game: updates its own .exe.
var desktop := false
## This build: its version ("0.19.65") and the run it was made by (65; 0 for
## a build made outside CI).
var installed := ""
var installed_code := 0
## The key this build was signed with: "fallback" (CI's shared test key),
## "release" (the repository's own), or "local" (made by hand). Android
## installs a build over this one only if it was signed with the same key.
var signed_with := "local"
## The newest build: {name, code, tag, title, notes, url, size, sha256, page, published}.
var latest := {}
## The other builds since this one, newest first: their titles, once each.
var between: Array[String] = []
## The last check reached GitHub, and when it ended (s since start; -1 never).
var reached := false
var checked_at := -1.0
## The download: bytes so far, bytes in all, and bytes a second (smoothed).
var got := 0
var total := 0
var rate := 0.0
## What went wrong, for the card.
var error := ""

var _http: HTTPRequest
var _dl: HTTPRequest
var _hash: HashingContext
var _hash_file: FileAccess
var _rate_at := 0
var _rate_got := 0
var _told := -1
## The state a check started from, to go back to if it can't reach GitHub.
var _before := IDLE


func _ready() -> void:
	installed = str(ProjectSettings.get_setting("application/config/version", "0.0.0"))
	installed_code = code_of(installed)
	signed_with = str(ProjectSettings.get_setting("aquati/signing", "local"))
	desktop = OS.has_feature("windows")
	_http = HTTPRequest.new()
	_http.timeout = 15.0
	_http.request_completed.connect(_on_list)
	add_child(_http)
	_dl = HTTPRequest.new()
	_dl.use_threads = true
	_dl.download_chunk_size = 256 * 1024
	_dl.request_completed.connect(_on_download)
	add_child(_dl)
	set_process(false)


## Turned on (the game does on Android): what's left from earlier builds
## goes, and the first check is made.
func start() -> void:
	enabled = true
	tidy()
	check()
	if desktop:
		# the build this one replaced may still be closing: give it a moment
		get_tree().create_timer(6.0).timeout.connect(_drop_old)


## The .exe the last update renamed aside, once nothing runs it any more.
func _drop_old() -> void:
	var old := OS.get_executable_path() + ".old"
	if FileAccess.file_exists(old):
		DirAccess.remove_absolute(old)


## The run a version or a release tag was made by: its last number.
static func code_of(version: String) -> int:
	var v := version.trim_prefix(TAG).strip_edges()
	var last := v.get_slice(".", v.count("."))
	return int(last) if last.is_valid_int() else 0


## The short name of a version: "0.20.67" -> "0.20".
static func short_of(version: String) -> String:
	var parts := version.split(".")
	return ".".join(parts.slice(0, mini(2, parts.size()))) if parts.size() > 2 else version


## Asks GitHub for the releases, unless it's busy (or `force` is off and it
## asked less than RECHECK ago).
func check(force := true) -> void:
	if not enabled or state in [CHECKING, DOWNLOADING, VERIFYING]:
		return
	if not force and checked_at >= 0.0 and _now() - checked_at < RECHECK:
		return
	var err := _http.request(API, _headers(["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"]))
	_before = state
	if err != OK:
		_checked(false)
		return
	state = CHECKING
	changed.emit()


## Back in the harbour: asks again if it's been a while.
func harbour() -> void:
	check(false)


## A newer build is waiting to be downloaded, downloading or ready.
func available() -> bool:
	return state in [OFFER, DOWNLOADING, VERIFYING, READY, INSTALLING, FAILED]


## How far the download has got (0..1).
func progress() -> float:
	if state in [VERIFYING, READY, INSTALLING]:
		return 1.0
	return clampf(float(got) / float(total), 0.0, 1.0) if total > 0 else 0.0


## Seconds the download has left at its pace (-1 not yet known).
func eta() -> float:
	if rate < 1.0 or total <= 0:
		return -1.0
	return maxf(0.0, (total - got) / rate)


func _on_list(result: int, code: int, _h: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		_checked(false)
		return
	var j := JSON.new()
	if j.parse(body.get_string_from_utf8()) != OK or not (j.data is Array):
		_checked(false)
		return
	take(j.data)
	_checked(true)


## The file a build ships as here: the APK, or on Windows the game's .exe.
func asset_ext() -> String:
	return ".exe" if desktop else ".apk"


## Reads GitHub's list of releases: the newest build with this platform's
## file, and the others since this one.
func take(releases: Array) -> void:
	var builds := pick(releases, asset_ext())
	between.clear()
	if builds.is_empty() or int(builds[0].code) <= installed_code:
		latest = {} if builds.is_empty() else builds[0]
		return
	latest = builds[0]
	for b: Dictionary in builds.slice(1):
		var t := str(b.title)
		if int(b.code) > installed_code and t != "" and t != str(latest.title) and not between.has(t):
			between.append(t)


## The builds in a list of releases that carry a file ending in `ext` (the
## APK, or the Windows .exe), newest first.
static func pick(releases: Array, ext := ".apk") -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for r: Variant in releases:
		if not (r is Dictionary):
			continue
		var tag := str(r.get("tag_name", ""))
		if not tag.begins_with(TAG) or bool(r.get("draft", false)) or bool(r.get("prerelease", false)):
			continue
		var c := code_of(tag)
		if c <= 0:
			continue
		var apk := {}
		var assets: Variant = r.get("assets", [])
		if assets is Array:
			for a: Variant in assets:
				if a is Dictionary and str(a.get("name", "")).ends_with(ext) and str(a.get("state", "uploaded")) == "uploaded":
					apk = a
					break
		if apk.is_empty():
			continue
		var notes := notes_of(str(r.get("body", "")))
		var digest := str(apk.get("digest", "")) if apk.get("digest") != null else ""
		out.append({
			"name": tag.trim_prefix(TAG), "code": c, "tag": tag,
			"title": notes[0], "notes": notes[1],
			"url": str(apk.get("browser_download_url", "")),
			"size": int(apk.get("size", 0)),
			"sha256": digest.trim_prefix("sha256:") if digest.begins_with("sha256:") else "",
			"page": str(r.get("html_url", "")),
			"key": key_of(str(r.get("body", ""))),
			"published": str(r.get("published_at", "")),
		})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.code) > int(b.code))
	return out


## The key a release was signed with, from its notes: CI's mark
## (<!-- signed: KEY -->), or for the builds before it, the test key's line.
static func key_of(body: String) -> String:
	var at := body.find("<!-- signed: ")
	if at >= 0:
		var end := body.find(" -->", at)
		if end > at:
			return body.substr(at + 13, end - at - 13).strip_edges()
	return "fallback" if body.contains("shared test key") else "release"


## The newest build was signed with another key than this one, so Android
## won't install it over this (only after this one is uninstalled).
func key_changed() -> bool:
	if desktop or latest.is_empty() or not (signed_with in ["fallback", "release"]):
		return false
	var k := str(latest.get("key", ""))
	return k in ["fallback", "release"] and k != signed_with


## A release's notes as RELEASE_NOTES.md writes them: its title (what
## follows "for Android:" in the heading) and the notes under it, without
## the install line CI adds after the rule.
static func notes_of(body: String) -> PackedStringArray:
	var md := body.replace("\r\n", "\n")
	var cut := md.find("\n---\n")
	if cut >= 0:
		md = md.left(cut)
	md = md.strip_edges()
	var title := ""
	if md.begins_with("## "):
		var nl := md.find("\n")
		var head := md.substr(3, nl - 3 if nl >= 0 else -1).strip_edges()
		var colon := head.find(": ")
		title = head.substr(colon + 2) if colon >= 0 else head
		md = md.substr(nl + 1).strip_edges() if nl >= 0 else ""
	if title != "":
		title = title.left(1).to_upper() + title.substr(1)
	return PackedStringArray([title, md])


## Notes in the few kinds of block RELEASE_NOTES.md uses: paragraphs and
## bullets (whose lines run on indented), each as runs of plain and **bold**
## words: [{"kind": "p"|"li"|"h", "runs": [[text, bold], ...]}].
static func blocks(md: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var kind := ""
	var text := ""
	for raw in md.replace("\r\n", "\n").split("\n"):
		var line := raw.strip_edges()
		var starts := ""
		if line == "":
			starts = "end"
		elif line.begins_with("- ") or line.begins_with("* "):
			starts = "li"
			line = line.substr(2)
		elif line.begins_with("#"):
			starts = "h"
			line = line.lstrip("#").strip_edges()
		elif kind == "" or kind == "h":
			starts = "p"
		if starts != "":
			if kind != "":
				out.append({"kind": kind, "runs": runs_of(text)})
			kind = "" if starts == "end" else starts
			text = line
		else:
			text += " " + line
	if kind != "":
		out.append({"kind": kind, "runs": runs_of(text)})
	return out


## A line's **bold** stretches apart from the rest (other marks dropped).
static func runs_of(s: String) -> Array:
	var out := []
	var parts := s.replace("`", "").split("**")
	for i in parts.size():
		if parts[i] != "":
			out.append([parts[i], i % 2 == 1])
	return out


func _checked(ok: bool) -> void:
	reached = ok
	checked_at = _now()
	if not ok:
		state = _before if _before != CHECKING else IDLE
		changed.emit()
		return
	if latest.is_empty() or int(latest.code) <= installed_code:
		state = CURRENT
		tidy()
		changed.emit()
		return
	# a build downloaded earlier and since overtaken goes
	tidy(_file())
	if _ready_file() != "":
		state = READY
		got = int(latest.size)
		total = got
	else:
		state = OFFER
	changed.emit()
	if available() and _told != int(latest.code):
		_told = int(latest.code)
		found.emit()


## Downloads the newest build's APK (on Windows its .exe).
func download() -> void:
	if latest.is_empty() or state in [CHECKING, DOWNLOADING, VERIFYING]:
		return
	if _ready_file() != "":
		state = READY
		changed.emit()
		return
	DirAccess.make_dir_recursive_absolute(DIR)
	var part := _file() + ".part"
	if FileAccess.file_exists(part):
		DirAccess.remove_absolute(part)
	_dl.download_file = part
	got = 0
	total = int(latest.size)
	rate = 0.0
	_rate_at = Time.get_ticks_msec()
	_rate_got = 0
	error = ""
	var err := _dl.request(str(latest.url), _headers(["Accept: application/octet-stream"]))
	if err != OK:
		_fail("The download couldn't start. Try again in a moment.")
		return
	state = DOWNLOADING
	set_process(true)
	changed.emit()


## Stops the download (and drops what came).
func cancel() -> void:
	if state == DOWNLOADING:
		_dl.cancel_request()
		DirAccess.remove_absolute(_file() + ".part")
	elif state == VERIFYING:
		_stop_hash()
		DirAccess.remove_absolute(_file() + ".part")
	else:
		return
	set_process(false)
	got = 0
	state = OFFER
	changed.emit()


func _on_download(result: int, code: int, _h: PackedStringArray, _b: PackedByteArray) -> void:
	if state != DOWNLOADING:
		return
	var part := _file() + ".part"
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		DirAccess.remove_absolute(part)
		match result:
			HTTPRequest.RESULT_CANT_CONNECT, HTTPRequest.RESULT_CANT_RESOLVE, HTTPRequest.RESULT_CONNECTION_ERROR, HTTPRequest.RESULT_TIMEOUT:
				_fail("The connection dropped. Check you're online and try again.")
			HTTPRequest.RESULT_DOWNLOAD_FILE_WRITE_ERROR, HTTPRequest.RESULT_DOWNLOAD_FILE_CANT_OPEN:
				_fail("There's no room on the %s for the download. Free some space and try again." % ("computer" if desktop else "phone"))
			_:
				_fail("The download broke off. Try again in a moment.")
		return
	var have := _size_of(part)
	got = have
	if total > 0 and have != total:
		DirAccess.remove_absolute(part)
		_fail("The download came in short. Try again.")
		return
	total = have
	if str(latest.sha256) == "":
		_sealed(part)
		return
	# the seal: the SHA-256 GitHub keeps for the file, checked a few MB a frame
	_hash = HashingContext.new()
	_hash.start(HashingContext.HASH_SHA256)
	_hash_file = FileAccess.open(part, FileAccess.READ)
	if _hash_file == null:
		_fail("The download couldn't be read back. Try again.")
		return
	state = VERIFYING
	changed.emit()


func _process(_dt: float) -> void:
	if state == DOWNLOADING:
		got = _dl.get_downloaded_bytes()
		if total <= 0:
			total = maxi(0, _dl.get_body_size())
		var now := Time.get_ticks_msec()
		if now - _rate_at >= 500:
			var r := (got - _rate_got) * 1000.0 / float(now - _rate_at)
			rate = r if rate <= 0.0 else lerpf(rate, r, 0.3)
			_rate_at = now
			_rate_got = got
		changed.emit()
	elif state == VERIFYING:
		_hash.update(_hash_file.get_buffer(HASH_STEP))
		if _hash_file.get_position() < _hash_file.get_length():
			return
		var sum := _hash.finish().hex_encode()
		_stop_hash()
		var part := _file() + ".part"
		if sum != str(latest.sha256).to_lower():
			DirAccess.remove_absolute(part)
			_fail("The download didn't match its seal. Try again.")
			return
		_sealed(part)
	else:
		set_process(false)


func _stop_hash() -> void:
	_hash_file = null
	_hash = null


func _sealed(part: String) -> void:
	set_process(false)
	var apk := _file()
	if FileAccess.file_exists(apk):
		DirAccess.remove_absolute(apk)
	if DirAccess.rename_absolute(part, apk) != OK:
		_fail("The download couldn't be kept. Try again.")
		return
	state = READY
	changed.emit()


## Hands the APK to Android's package installer. If the phone can't open it,
## the release's page opens in the browser instead.
func install() -> void:
	var apk := _ready_file()
	if apk == "":
		download()
		return
	if desktop:
		_swap_in(apk)
		return
	var err := OS.shell_open(ProjectSettings.globalize_path(apk))
	if err != OK:
		if str(latest.page) != "":
			OS.shell_open(str(latest.page))
		error = "Android wouldn't open the installer, so the release's page is open in your browser instead."
	else:
		error = ""
	state = INSTALLING
	changed.emit()


## Windows: the new .exe into the running one's place (renamed aside first),
## then started, and this one closes. A frame or two first, so the card can
## say it's restarting before the copy holds the game up for a moment.
func _swap_in(file: String) -> void:
	state = INSTALLING
	error = ""
	changed.emit()
	await get_tree().process_frame
	await get_tree().process_frame
	var src := ProjectSettings.globalize_path(file)
	var exe := OS.get_executable_path()
	var old := exe + ".old"
	if FileAccess.file_exists(old):
		DirAccess.remove_absolute(old)
	var swapped := DirAccess.rename_absolute(exe, old) == OK
	if swapped and DirAccess.copy_absolute(src, exe) != OK:
		# couldn't write the new one: the old one goes back where it was
		DirAccess.remove_absolute(exe)
		DirAccess.rename_absolute(old, exe)
		swapped = false
	var run := exe if swapped else src
	Progress.save()
	if OS.create_process(run, []) < 0:
		error = "The new build wouldn't start. Try again, or get it from the release page."
		state = READY if _ready_file() != "" else OFFER
		changed.emit()
		return
	if swapped:
		DirAccess.remove_absolute(src)
	get_tree().quit()


## Back from Android's installer without being replaced: it was turned down,
## or Android first wanted installs from the game allowed.
func resumed() -> void:
	if state == INSTALLING:
		state = READY if _ready_file() != "" else OFFER
		changed.emit()
	elif state == IDLE and enabled:
		check(false)


## Clears out user://updates: half downloads, APKs of this build or older,
## and (given the newest's) any other build's.
func tidy(keep := "") -> void:
	if not DirAccess.dir_exists_absolute(DIR):
		return
	for f in DirAccess.get_files_at(DIR):
		var p := DIR.path_join(f)
		if f.ends_with(".part") or not f.ends_with(asset_ext()) or code_of(f.trim_suffix(asset_ext())) <= installed_code or (keep != "" and p != keep):
			DirAccess.remove_absolute(p)


func _fail(msg: String) -> void:
	set_process(false)
	error = msg
	state = FAILED
	changed.emit()


## Where the newest build's APK goes.
func _file() -> String:
	return DIR.path_join("shores-o-fortune-%s%s" % [str(latest.get("name", "0")), asset_ext()])


## The newest build's APK if it's here whole.
func _ready_file() -> String:
	if latest.is_empty():
		return ""
	var f := _file()
	if not FileAccess.file_exists(f):
		return ""
	var want := int(latest.size)
	return f if want <= 0 or _size_of(f) == want else ""


static func _size_of(path: String) -> int:
	var f := FileAccess.open(path, FileAccess.READ)
	return 0 if f == null else f.get_length()


func _headers(extra: Array) -> PackedStringArray:
	var h := PackedStringArray(["User-Agent: ShoresOFortune/%s (%s)" % [installed, "Windows" if desktop else "Android"]])
	for e: String in extra:
		h.append(e)
	return h


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0


## A pretend offer for screenshots and the checks (--update-demo): the build
## after this one with this build's own notes, at `at` (offer, downloading,
## ready, failed).
func demo(notes: String, at: String) -> void:
	enabled = true
	var n := notes_of(notes)
	installed = "0.19.65"
	installed_code = 65
	latest = {"name": "0.20.67", "code": 67, "tag": TAG + "0.20.67", "title": n[0], "notes": n[1],
			"url": "", "size": 118 << 20, "sha256": "", "page": "", "published": Time.get_datetime_string_from_system(true),
			"key": signed_with}
	if at == "rekeyed":
		signed_with = "fallback"
		latest.key = "release"
	between = ["The Treasure Vault"]
	reached = true
	total = int(latest.size)
	match at:
		"downloading":
			state = DOWNLOADING
			got = int(total * 0.62)
			rate = 3.1 * 1024.0 * 1024.0
		"ready":
			state = READY
			got = total
		"failed":
			state = FAILED
			error = "The connection dropped. Check you're online and try again."
		_:
			state = OFFER
	changed.emit()
