extends Control
const EconomyModel = preload("res://scripts/metaverse_model.gd")
# Staged, self-contained Godot 4 prototype: 2D/3D, science quest, two audio streams.
const STAR_POINTS := [Vector2(0.18, 0.42), Vector2(0.39, 0.70), Vector2(0.71, 0.38), Vector2(0.84, 0.66)]
const STAR_NAMES := ["Aero Prime", "Eltara", "New Horizon", "Veridian"]
var is_3d := false
var view_3d: SubViewportContainer
var mode_btn: Button
var personal_btn: Button
var quest: Label
var main_music := AudioStreamPlayer.new()
var personal_audio := AudioStreamPlayer.new()
var selected_star := 0
var economy = EconomyModel.new()
var economy_status: Label
var economy_feedback: Label

func _ready() -> void:
    economy.load_state()
    _build_world()
    _configure_audio()
    _build_interface()
    _set_mode(false)

func _draw() -> void:
    if is_3d:
        return
    draw_rect(Rect2(Vector2.ZERO, size), Color("#061b2d"))
    for i in range(135):
        var p := Vector2(fposmod(float(i * 337), max(1.0, size.x)), fposmod(float(i * 197), max(1.0, size.y)))
        draw_circle(p, 1.0, Color("#789cba"))
    for i in range(STAR_POINTS.size()):
        var p: Vector2 = STAR_POINTS[i] * size
        var c := Color("#66eee5") if i == selected_star else Color("#88baff")
        draw_circle(p, 22.0 if i == selected_star else 14.0, c)
        draw_string(ThemeDB.fallback_font, p + Vector2(22, 5), STAR_NAMES[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color.WHITE)

func _gui_input(event: InputEvent) -> void:
    if is_3d:
        return
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        for i in range(STAR_POINTS.size()):
            if (event.position - STAR_POINTS[i] * size).length() < 32.0:
                selected_star = i
                quest.text = "Selected: %s  |  Quiz: Which planet is called the Red Planet?" % STAR_NAMES[i]
                queue_redraw()
                accept_event()
                return

func _build_world() -> void:
    view_3d = SubViewportContainer.new()
    view_3d.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    view_3d.stretch = true
    add_child(view_3d)
    var v := SubViewport.new()
    v.size = Vector2i(1280, 720)
    v.render_target_update_mode = SubViewport.UPDATE_ALWAYS
    view_3d.add_child(v)
    var world := Node3D.new()
    v.add_child(world)
    var camera := Camera3D.new()
    camera.position = Vector3(0, 5, 13)
    world.add_child(camera)
    camera.look_at(Vector3.ZERO)
    camera.current = true
    var sunlight := DirectionalLight3D.new()
    sunlight.rotation_degrees = Vector3(-45, 20, -15)
    sunlight.light_energy = 2.0
    world.add_child(sunlight)
    var positions := [Vector3.ZERO, Vector3(-3, 1, -2), Vector3(4, -1, -3)]
    for i in range(positions.size()):
        var planet := MeshInstance3D.new()
        var mesh := SphereMesh.new()
        mesh.radius = 1.7 if i == 0 else 0.68
        mesh.height = mesh.radius * 2.0
        planet.mesh = mesh
        var mat := StandardMaterial3D.new()
        mat.albedo_color = [Color("#5eead4"), Color("#acffa0"), Color("#a6afff")][i]
        mat.emission_enabled = true
        mat.emission = mat.albedo_color * 0.28
        planet.material_override = mat
        planet.position = positions[i]
        world.add_child(planet)

func _configure_audio() -> void:
    _bus("AcademyMusic", -6.0)
    _bus("PersonalAudio", -28.0)
    main_music.bus = "AcademyMusic"
    personal_audio.bus = "PersonalAudio"
    add_child(main_music)
    add_child(personal_audio)
    for ext in [".ogg", ".mp3"]:
        var track := "res://assets/audio/suno_main" + ext
        if ResourceLoader.exists(track):
            main_music.stream = load(track) as AudioStream
            main_music.play()
            break
    for ext in [".ogg", ".mp3"]:
        var track := "res://assets/audio/v17_local" + ext
        if ResourceLoader.exists(track):
            personal_audio.stream = load(track) as AudioStream
            break
    # Personal audio deliberately does not auto-play.

func _bus(name: String, level_db: float) -> void:
    var index := AudioServer.get_bus_index(name)
    if index < 0:
        AudioServer.add_bus()
        index = AudioServer.bus_count - 1
        AudioServer.set_bus_name(index, name)
    AudioServer.set_bus_volume_db(index, level_db)

func _build_interface() -> void:
    var overlay := MarginContainer.new()
    overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    overlay.add_theme_constant_override("margin_left", 26)
    overlay.add_theme_constant_override("margin_top", 18)
    overlay.mouse_filter = Control.MOUSE_FILTER_PASS
    add_child(overlay)
    var layout := VBoxContainer.new()
    overlay.add_child(layout)
    var title := Label.new()
    title.text = "QUANTDEUS  •  GALACTIC ACADEMY"
    title.add_theme_font_size_override("font_size", 30)
    title.add_theme_color_override("font_color", Color("#b0fff3"))
    layout.add_child(title)
    var buttons := HBoxContainer.new()
    layout.add_child(buttons)
    mode_btn = Button.new()
    mode_btn.pressed.connect(func() -> void: _set_mode(not is_3d))
    buttons.add_child(mode_btn)
    var music_btn := Button.new()
    music_btn.text = "Music pause / play"
    music_btn.pressed.connect(func() -> void:
        if main_music.playing: main_music.stop()
        elif main_music.stream != null: main_music.play()
    )
    buttons.add_child(music_btn)
    personal_btn = Button.new()
    personal_btn.text = "Personal audio: OFF"
    personal_btn.pressed.connect(_toggle_personal)
    buttons.add_child(personal_btn)
    quest = Label.new()
    quest.text = "Quiz: Which planet is called the Red Planet?"
    quest.add_theme_font_size_override("font_size", 19)
    layout.add_child(quest)
    var answers := HBoxContainer.new()
    layout.add_child(answers)
    for answer in ["Venus", "Mars", "Neptune"]:
        var b := Button.new()
        b.text = answer
        b.pressed.connect(_quiz_answer.bind(answer))
        answers.add_child(b)
    _build_metaverse_panel(layout)

func _build_metaverse_panel(layout: VBoxContainer) -> void:
    var panel := PanelContainer.new()
    layout.add_child(panel)
    var content := VBoxContainer.new()
    panel.add_child(content)
    var heading := Label.new()
    heading.text = "QUANTDEUS METAVERSE / AGENTCHAIN — LOCAL DEMO"
    heading.add_theme_color_override("font_color", Color("#66eee5"))
    content.add_child(heading)
    economy_status = Label.new()
    content.add_child(economy_status)
    var actions := HBoxContainer.new()
    content.add_child(actions)
    var buy_button := Button.new()
    buy_button.text = "Aero skin (40 Credits)"
    buy_button.pressed.connect(_buy_demo_skin)
    actions.add_child(buy_button)
    var data_button := Button.new()
    data_button.text = "Simulate Data task (10 Credits)"
    data_button.pressed.connect(_simulate_data_task)
    actions.add_child(data_button)
    economy_feedback = Label.new()
    economy_feedback.text = "Sandbox only: no wallet, token, NFT mint, or real AI request."
    economy_feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    content.add_child(economy_feedback)
    _refresh_economy()

func _refresh_economy() -> void:
    economy_status.text = "Credits: %d | Aero skin: %s | Agent demos: %d | Pilot roles: %d | Registry design target: %d" % [
        economy.credits,
        "Owned" if economy.aero_skin_owned else "Not owned",
        economy.simulated_agent_requests,
        EconomyModel.PILOT_ROLES.size(),
        EconomyModel.AGENT_REGISTRY_TARGET
    ]

func _buy_demo_skin() -> void:
    economy_feedback.text = economy.buy_aero_skin()
    _refresh_economy()

func _simulate_data_task() -> void:
    economy_feedback.text = economy.simulate_data_task()
    _refresh_economy()

func _set_mode(mode: bool) -> void:
    is_3d = mode
    view_3d.visible = mode
    mode_btn.text = "Return to 2D" if mode else "Enter 3D"
    queue_redraw()

func _toggle_personal() -> void:
    if personal_audio.playing:
        personal_audio.stop()
        personal_btn.text = "Personal audio: OFF"
    elif personal_audio.stream != null:
        personal_audio.play()
        personal_btn.text = "Personal audio: ON"
    else:
        personal_btn.text = "Add v17_local.mp3/ogg to enable"

func _quiz_answer(answer: String) -> void:
    if answer != "Mars":
        quest.text = "Try again: iron-oxide dust is the clue."
        return
    var reward: int = economy.complete_academy_quest()
    quest.text = "✓ Correct! Aero-class blueprint unlocked. +25 Credits" if reward > 0 else "✓ Correct! Blueprint already unlocked."
    _refresh_economy()
