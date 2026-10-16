extends RefCounted
## Local-only QuantDeus Metaverse economy proof of concept.
## No wallet, blockchain transactions, external agents, or real-money value.

const SAVE_PATH := "user://quantdeus_metaverse_v1.json"
const STARTING_CREDITS := 100
const AERO_SKIN_PRICE := 40
const AGENT_DEMO_PRICE := 10
const AGENT_REGISTRY_TARGET := 10000
const PILOT_ROLES := ["Seven of Nine", "Data", "Sherlock Holmes", "Tuvok"]

var save_path: String = SAVE_PATH
var credits: int = STARTING_CREDITS
var academy_reward_claimed: bool = false
var aero_skin_owned: bool = false
var simulated_agent_requests: int = 0

func complete_academy_quest() -> int:
    if academy_reward_claimed:
        return 0
    academy_reward_claimed = true
    credits += 25
    save_state()
    return 25

func buy_aero_skin() -> String:
    if aero_skin_owned:
        return "Aero skin already owned (local item, NOT an NFT)."
    if credits < AERO_SKIN_PRICE:
        return "Not enough demo Credits for Aero skin."
    credits -= AERO_SKIN_PRICE
    aero_skin_owned = true
    save_state()
    return "Aero ship skin unlocked locally! No NFT minted."

func simulate_data_task() -> String:
    if credits < AGENT_DEMO_PRICE:
        return "Not enough demo Credits for a simulated Data task."
    credits -= AGENT_DEMO_PRICE
    simulated_agent_requests += 1
    save_state()
    return "Data task simulated and logged locally. No external agent invoked."

func load_state() -> void:
    if not FileAccess.file_exists(save_path):
        return
    var file := FileAccess.open(save_path, FileAccess.READ)
    if file == null:
        return
    var parsed = JSON.parse_string(file.get_as_text())
    if typeof(parsed) != TYPE_DICTIONARY:
        return
    credits = clampi(int(parsed.get("credits", STARTING_CREDITS)), 0, 100000)
    academy_reward_claimed = parsed.get("academy_reward_claimed", false) == true
    aero_skin_owned = parsed.get("aero_skin_owned", false) == true
    simulated_agent_requests = clampi(int(parsed.get("simulated_agent_requests", 0)), 0, 100000)

func save_state() -> void:
    var file := FileAccess.open(save_path, FileAccess.WRITE)
    if file == null:
        push_warning("Could not write local metaverse save data.")
        return
    file.store_string(JSON.stringify({
        "schema_version": 1,
        "credits": credits,
        "academy_reward_claimed": academy_reward_claimed,
        "aero_skin_owned": aero_skin_owned,
        "simulated_agent_requests": simulated_agent_requests
    }))
