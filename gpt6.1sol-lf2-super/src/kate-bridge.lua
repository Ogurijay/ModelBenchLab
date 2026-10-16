-- SPDX-License-Identifier: MIT
-- Host bridge for the MIT OpenLF2 runtime. Injected into the trusted bootstrap;
-- original OpenLF2 module sources and their copyright headers remain intact.
local kate_paths = __KATE_PATHS__
local function kate_json_string(value)
    return '"' .. tostring(value):gsub('[%z\1-\31\\"]', function(character)
        return string.format("\\u%04x", character:byte())
    end) .. '"'
end
local function kate_path(path)
    local normalized = path:gsub("\\", "/"):lower()
    return kate_paths[normalized] and ("mods/kate/" .. normalized) or path
end
local function kate_read(native)
    return function(path) return native(kate_path(path)) end
end
-- Defaults come from the host's in-memory control.txt. Ignore unrelated saved
-- OpenLF2 keyboard mappings until controls are explicitly saved from this host.
local function kate_read_settings()
    local stored, problem = openlf2_read_settings()
    if type(stored) == "table" and stored.kate_host_controls ~= 1 then stored.controls = nil end
    return stored, problem
end
local function kate_write_settings(document)
    document.kate_host_controls = 1
    local saved, problem = openlf2_write_settings(document)
    if saved and document.controls and document.controls.players then
        local lines, names = {}, {}
        local keys = {"up", "down", "left", "right", "attack", "jump", "defend"}
        for index = 1, 4 do
            local player = document.controls.players[index]
            local row = {player.device}
            for _, key in ipairs(keys) do row[#row + 1] = player[key] end
            for button = 1, 3 do row[#row + 1] = player.buttons[button] end
            lines[#lines + 1] = table.concat(row, " ")
            names[#names + 1] = player.name:gsub("%s", "`")
        end
        lines[#lines + 1] = table.concat(names, " ")
        lines[#lines + 1] = "0 0\n\n\n"
        print("KATE_CONTROLS:" .. kate_json_string(table.concat(lines, "\n")))
    end
    return saved, problem
end

-- The original executable is read as data, never executed. Extract the same
-- recording key that OpenLF2 uses, so the browser can inflate imported .lfr.
local function kate_recording_key()
    local exe = openlf2_read_resource("lf2.exe")
    local function u16(offset)
        local a, b = exe:byte(offset + 1, offset + 2)
        return a + b * 256
    end
    local function u32(offset)
        local a, b, c, d = exe:byte(offset + 1, offset + 4)
        return a + b * 256 + c * 65536 + d * 16777216
    end
    local pe = u32(0x3c)
    local optional = pe + 24
    local rva = 0x44d7a0 - u32(optional + 28)
    local sections = optional + u16(pe + 20)
    for index = 0, u16(pe + 6) - 1 do
        local section = sections + index * 40
        local base, size = u32(section + 12), u32(section + 16)
        if rva >= base and rva < base + size then
            local offset = u32(section + 20) + rva - base
            local key = exe:sub(offset + 1, offset + 1346):match("^[^%z]*")
            assert(key and key:match("^%d+$"), "Unexpected original recording key")
            print("KATE_KEY:" .. key)
            return
        end
    end
    error("Original executable recording key section is missing")
end
local key_ok, key_problem = pcall(kate_recording_key)
if not key_ok then print("KATE_KEY_ERROR:" .. tostring(key_problem)) end

local kate_replay_token
local function kate_take_recording()
    local block, problem = openlf2_take_recording()
    if block or problem then return block, problem end
    -- Native read_resource caps data at 4 MiB, below an uncompressed replay.
    -- The trusted runtime can read MEMFS directly; modules cannot access io.
    local file = io.open("/mods/kate/replay.bin", "rb")
    if not file then return end
    local token = file:read(8)
    if token == kate_replay_token then file:close(); return end
    local packet = file:read("*a")
    file:close()
    if packet and #packet == 0x630e18 and token ~= kate_replay_token then
        kate_replay_token = token
        return packet
    end
end

local kate_tick = 0
local function kate_snapshot(state, screen)
    kate_tick = kate_tick + 1
    if kate_tick ~= 1 and kate_tick % 15 ~= 0 then return end
    local description = screen.describe and screen.describe(state) or ""
    local match = state.match and state.match.match
    local fighters = {}
    if match and match.items then
        for index = 0, 399 do
            local fighter = match.items[index]
            local record = fighter and fighter.record
            if record and record.kind == 0 then
                local frame = record.frame(fighter.frame)
                fighters[#fighters + 1] = string.format('{"slot":%d,"index":%d,"id":%d,"name":%s,"hp":%d,"maxHp":%d,"mp":%d,"human":%s,"x":%s,"y":%s,"z":%s,"frame":%d,"state":%d}',
                    fighter.slot or -1, index, record.id or -1, kate_json_string(record.data.name or ""),
                    fighter.hp or 0, fighter.max_hp or 0, fighter.mp or 0, fighter.human and "true" or "false",
                    tostring(fighter.x or 0), tostring(fighter.y or 0), tostring(fighter.z or 0),
                    fighter.frame or 0, frame.state or 0)
            end
        end
    end
    local document = '{"screen":' .. kate_json_string(state.active or "unknown") ..
        ',"description":' .. kate_json_string(description) .. ',"tick":' .. kate_tick ..
        ',"fighters":[' .. table.concat(fighters, ",") .. ']}'
    -- Trusted bootstrap has the Lua standard libraries. This writes only MEMFS,
    -- and never calls the real settings store or changes localStorage.
    local file = io and io.open and io.open("/data/state.json", "w")
    if file then file:write(document); file:close()
    else print("KATE_STATE:" .. document) end
end
