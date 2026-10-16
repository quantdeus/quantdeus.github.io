extends SceneTree
## Run: godot --headless --path projects/galactic-academy --script res://tests/metaverse_model_test.gd
const EconomyModel = preload("res://scripts/metaverse_model.gd")

func _initialize() -> void:
    var errors: Array[String] = []
    var test_path := "user://galactic_academy_economy_test.json"
    if FileAccess.file_exists(test_path):
        DirAccess.remove_absolute(ProjectSettings.globalize_path(test_path))
    var model = EconomyModel.new()
    model.save_path = test_path
    if model.credits != 100:
        errors.append("Start balance must be 100")
    if model.complete_academy_quest() != 25:
        errors.append("Quiz should award 25 Credits")
    if model.complete_academy_quest() != 0:
        errors.append("Quiz reward must only be issued once")
    model.buy_aero_skin()
    if not model.aero_skin_owned or model.credits != 85:
        errors.append("Cosmetic purchase must charge exactly 40 Credits")
    model.simulate_data_task()
    if model.credits != 75 or model.simulated_agent_requests != 1:
        errors.append("Simulated task must charge 10 Credits")
    var restored = EconomyModel.new()
    restored.save_path = test_path
    restored.load_state()
    if restored.credits != 75 or not restored.academy_reward_claimed or not restored.aero_skin_owned:
        errors.append("Local save/load must preserve progress")
    restored.credits = 0
    restored.simulate_data_task()
    if restored.credits != 0 or restored.simulated_agent_requests != 1:
        errors.append("Demo task must not overspend")
    if FileAccess.file_exists(test_path):
        DirAccess.remove_absolute(ProjectSettings.globalize_path(test_path))
    if errors.is_empty():
        print("PASS: Galactic Academy metaverse local economy")
        quit(0)
    else:
        for error in errors:
            push_error(error)
        quit(1)
