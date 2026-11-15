# Pharaoh `.map` and `.sav` File Formats

> **Status**: Research complete — all facts sourced from Akhenaten (Pharaoh reference) and Julius (Caesar III, same engine family). Ready for implementation issues.

## 1. Overview

Pharaoh uses two closely related file formats:

| Format | Extension | Purpose |
|--------|-----------|---------|
| **Map** (scenario / mission pack) | `.map` | Static scenario definition — terrain grid, image IDs, entry/exit points, win criteria, events, empire layout. Loaded once at mission start. |
| **Save** | `.sav` | Full game state — all map data plus runtime state: buildings, figures, routes, city economy, random seeds, camera position, etc. Can be loaded mid-game and resumed. |

Both formats share the same grid dimensions (228 × 228) and use the same compression algorithm (PKWare DCL "implode"). The save file is a superset of the map file: it contains all scenario data plus runtime state.

**Reference implementations**:
- **Akhenaten** (Pharaoh): `https://github.com/dalerank/Akhenaten` — C++ reimplementation, used as primary source.
- **Julius** (Caesar III): `https://github.com/bvschaik/julius` — C reimplementation of the same engine family, used for comparison and validation.

---

## 2. Compression: PKWare DCL "Implode"

Both formats use **PKWare Data Compression Library "implode"** method (compression code 8 in ZIP). This is a dictionary-based algorithm combining LZ77-style back-references with Huffman coding.

### Source
- **Julius**: `src/core/zip.c` — full implementation of `zip_compress()` and `zip_decompress()`.
- **Akhenaten**: `src/core/zip.cpp` / `src/core/zip.h` — same algorithm, C++ wrapper. The function is `zip_decompress(src, compressed_size, dst, &expected_raw_size)`.

### How it works (prose)
1. **Compression** builds a sliding dictionary window (up to 4096 bytes). It finds repeated byte sequences and emits back-references as (length, offset) pairs, encoded with variable-length Huffman codes. Literal bytes are also Huffman-encoded. The compressor uses hash chains for fast match finding and a KMP-like algorithm for finding longer matches.
2. **Decompression** reads the bitstream: each token is either a literal byte or a (length, offset) pair. Offsets and lengths use variable-length codes with jump tables for speed. A 4096-byte output buffer serves as the sliding window.

### On-disk representation
Each compressed chunk in the file has a **4-byte prefix** before its payload:
- `0x80000000` — the chunk is stored **uncompressed**; read the next N bytes raw.
- `0` — the chunk is all zeros; skip it (fill with zeroes).
- Any other value N — the next N bytes are compressed data to decompress.

**Sources**:
- Akhenaten: `src/io/og_save/og_save_reader.cpp` line ~247 (`read_chunk()`), `CHUNK_STORED = 0x80000000u`.
- Julius: `src/game/file_io.c` line ~395 (`UNCOMPRESSED = 0x80000000`).

---

## 3. Grid Dimensions

| Property | Value | Source |
|----------|-------|--------|
| Width | 228 cells | Akhenaten `src/io/og_save/og_save.h` line ~147: `GRID_CELLS = 228 * 228` |
| Height | 228 cells | Same — square grid |
| Total cells | 51,984 (0xCA60) | 228 × 228 |

Each cell in the grid is addressed by a linear index `y * 228 + x` where `(x, y)` are tile coordinates. The map may have a **border** around the playable area:
- `map_data_t::width` — total width including border (Akhenaten `src/grid/map_geometry.h`).
- `map_data_t::height` — total height including border.
- `map_data_t::start_offset` — linear offset of the first usable cell.
- `map_data_t::border_size` — size of the border ring.

**Source**: Akhenaten `src/grid/map_geometry.h` struct `map_data_t`.

---

## 4. Save File (`.sav`) Format — Chunk Layout

The save file uses a **positional chunk layout** (legacy format) or a **sectioned container** (.svx). Both contain the same logical chunks in the same order.

### 4a. Legacy Positional Format (`.sav`, version 160)

The file is an ordered sequence of chunks. Each chunk has:
- A **4-byte prefix** (see §2 for encoding).
- Raw or compressed payload of `element_size × count` bytes.

#### Schema Header (first 7 chunks, uncompressed)

| # | Chunk name | Element size | Count | Total bytes | Compressed | Source |
|---|-----------|-------------|-------|-------------|------------|--------|
| 0 | `mission_id` | 1 | 1 | 1 | No | `og_save_reader.cpp` line ~12 |
| 1 | `campaign` | 1 | 1 | 1 | No | Same |
| 2 | `previous_campaign_link` | 1 | 1 | 1 | No | Same |
| 3 | `campaign_link` | 1 | 1 | 1 | No | Same |
| 4 | `file_version` | 4 | 1 | 4 | No | Same — value is `0x6A` (106) or `0xA0` (160) |
| 5 | `schema_count` | 4 | 1 | 4 | No | Same — always 181 for v160 |
| 6 | `schema` | 20 | 300 | 6,000 | No | Same — describes all chunks below |

**Schema record format** (20 bytes each):
```c
struct chunk_schema_record {
    int32_t compressed;      // offset +0: 0 = uncompressed, non-zero = compressed
    uint32_t reserved_1;     // offset +4: padding
    int32_t element_size;    // offset +8: size of each record in this chunk
    int32_t count;           // offset +12: number of records
    uint32_t reserved_2;     // offset +16: padding
};
static_assert(sizeof(chunk_schema_record) == 20); // og_save.h line ~158
```

#### Grid Chunks (chunks 7–20, mostly compressed)

| # | Chunk name | Element size | Count | Total bytes | Compressed | Source |
|---|-----------|-------------|-------|-------------|------------|--------|
| 7 | `grid_images` | 4 | 51984 | 207,936 | Yes | `og_save_reader.cpp` line ~17 |
| 8 | `grid_edge` | 1 | 51984 | 51,984 | Yes | Same |
| 9 | `grid_building_ids` | 2 | 51984 | 103,968 | Yes | Same |
| 10 | `grid_terrain` | 4 | 51984 | 207,936 | Yes | Same |
| 11 | `grid_canals` | 1 | 51984 | 51,984 | Yes | Same |
| 12 | `grid_figure_ids` | 2 | 51984 | 103,968 | Yes | Same |
| 13 | `grid_bitfields` | 1 | 51984 | 51,984 | Yes | Same |
| 14 | `grid_sprite` | 1 | 51984 | 51,984 | Yes | Same |
| 15 | `grid_random` | 1 | 51984 | 51,984 | No | Same — random seed per cell |
| 16 | `grid_desirability` | 1 | 51984 | 51,984 | Yes | Same — signed int8 desirability |
| 17 | `grid_elevation` | 1 | 51984 | 51,984 | Yes | Same |
| 18 | `grid_building_damage` | 2 | 51984 | 103,968 | Yes | Same |
| 19 | `grid_canals_backup` | 1 | 51984 | 51,984 | Yes | Same |
| 20 | `grid_sprite_backup` | 1 | 51984 | 51,984 | Yes | Same |

#### Runtime State Chunks (chunks 21–180)

| # | Chunk name | Element size | Count | Total bytes | Compressed | Source |
|---|-----------|-------------|-------|-------------|------------|--------|
| 21 | `figures` | 388 | 2000 | 776,000 | Yes | `og_save_reader.cpp` line ~21 |
| 22 | `route_figure_ids` | 2 | 1000 | 2,000 | Yes | Same |
| 23 | `route_paths` | 1 | 500000 | 500,000 | Yes | Same — path data (one byte per step) |
| 24 | `formations` | 144 | 50 | 7,200 | Yes | Same |
| 25 | `formation_id_last_in_use` | 4 | 1 | 4 | No | Same |
| 26 | `formation_id_last_legion` | 4 | 1 | 4 | No | Same |
| 27 | `formation_num_legions` | 4 | 1 | 4 | No | Same |
| 28 | `city_players` | 18904 | 2 | 37,808 | Yes | Same — player data (current + AI) |
| 29 | `city_player_faction` | 2 | 2 | 4 | No | Same |
| 30 | `city_player_names` | 32 | 2 | 64 | No | Same |
| 31 | `city_current_player` | 4 | 1 | 4 | No | Same — index into city_players |
| 32 | `buildings` | 264 | 4000 | 1,056,000 | Yes | Same — **building struct is 0x108 (264) bytes** |
| 33 | `city_view_orientation` | 4 | 1 | 4 | No | Same |
| 34–38 | `game_time_tick/day/month/year/total_days` | 4 each | 5 | 20 | No | `og_save_reader.cpp` lines ~36–40 |
| 39 | `building_highest_id_ever` | 4 | 1 | 4 | No | Same |
| 40 | `city_locusts_countdown` | 4 | 1 | 4 | No | Same |
| 41–42 | `random_iv1`, `random_iv2` | 4 each | 2 | 8 | No | Same — RNG seed pair |
| 43–44 | `camera_x`, `camera_y` | 4 each | 2 | 8 | No | Same |
| 45 | `city_population_graph_order` | 4 | 1 | 4 | No | Same |
| 46 | `city_hailstorm_countdown` | 4 | 1 | 4 | No | Same |
| 47–49 | `empire_scroll_x/y`, `empire_selected_object` | 4 each | 3 | 12 | No | Same |
| 50 | `empire_cities` | 106 | 61 | 6,466 | Yes | Same — empire city data |
| 51–52 | `building_count_industry_total/active` | 4 each × 36 resources | 72 | No | Same |
| 53 | `trade_prices` | 8 | 36 | 288 | No | Same — price per resource |
| 54–75 | `name_counter_slot_40` through `name_counter_slot_20` | 4 each | 21 | 84 | No | `og_save_reader.cpp` lines ~63–83 |
| 76 | `scenario` | 1592 | 1 | 1,592 | No | Same — embedded scenario record (see §5) |
| 77 | `scenario_max_year` | 4 | 1 | 4 | No | Same |
| 78–86 | `messages` + message metadata | 48 × 1000 = 48,000 + metadata | — | Yes (messages) | `og_save_reader.cpp` lines ~85–93 |
| 87 | `starting_favor` | 4 | 1 | 4 | No | Same |
| 88 | `personal_savings_last_mission` | 4 | 1 | 4 | No | Same |
| 89 | `current_mission_id` | 4 | 1 | 4 | No | Same |
| 90 | `invasion_warnings` | 32 | 101 | 3,232 | Yes | Same |
| 91 | `is_custom_scenario` | 4 | 1 | 4 | No | Same — non-zero = custom map |
| 92 | `city_sounds` | 128 | 70 | 8,960 | No | Same |
| 93 | `building_highest_id` | 4 | 1 | 4 | No | Same |
| 94–95 | `empire_traders`, `trader_next_index` | 88 × 100 + 4 | — | No | Same |
| 96–98 | `building_list_burning/small/large` | 2 × (500/500/4000) | — | Yes | Same |
| 99 | `saved_reserved_1` | 4 | 1 | 4 | No | Same |
| 100 | `scenario_start_flags_empire_locked` | 4 | 1 | 4 | No | Same |
| 101–104 | `name_counter_slot_3/2/1/0` | 4 each | 4 | 16 | No | Same |
| 105 | `city_frogs_countdown` | 4 | 1 | 4 | No | Same |
| 106 | `pyramid_speedup_countdown` | 4 | 1 | 4 | No | Same |
| 107 | `map_sweep_total` | 4 | 1 | 4 | No | Same |
| 108–112 | Enemy army data (formations, strength, update counter) | 4 each × 5 | 20 | No | `og_save_reader.cpp` lines ~116–120 |
| 113 | `building_storages` | 196 | 200 | 39,200 | No | Same — **storage struct is 196 bytes** |
| 114–115 | `trade_route_limits/traded` | 144 × 20 = 2,880 each | — | Yes | Same |
| 116 | `building_barracks_tower_sentry_request` | 4 | 1 | 4 | No | Same |
| 117 | `building_extra_sequence` | 4 | 1 | 4 | No | Same |
| 118–121 | Routing stats (unused, enemy routes, total routes, unused) | 4 each × 4 | 16 | No | `og_save_reader.cpp` lines ~130–133 |
| 122–125 | City entry/exit flags (x/y for both) | 4 each × 4 | 16 | No | Same |
| 126 | `invasion_last_id` | 2 | 1 | 2 | No | Same |
| 127–128 | `building_corrupt_houses_a/b` | 4 each | 8 | No | Same |
| 129 | `scenario_map_name` | 65 | 1 | 65 | No | Same — null-terminated map name string |
| 130 | `map_bookmarks` | 8 | 4 | 32 | No | Same — bookmark data |
| 131 | `map_sweep_countdown` | 4 | 1 | 4 | No | Same |
| 132–133 | City entry/exit flag offsets | 4 each × 2 | 8 | No | Same |
| 134 | `saved_with_game` | 4 | 99 | 396 | No | Same — flags for what's saved with game |
| 135 | `grid_soil_fertility` | 1 | 51984 | 51,984 | No | Same |
| 136 | `scenario_events` | 18628 | 1 | 18,628 | No | Same — scenario event data |
| 137–138 | `ferry_queues`, `ferry_paths` | 224 × 50 + 44 × 50 | — | No | Same |
| 139 | `figure_name_counters_unused` | 4 | 4 | 16 | No | Same |
| 140 | `dock_queues` | 820 | 10 | 8,200 | No | Same — **dyn_queue_save is 0x334 (820) bytes** |
| 141–143 | Empire map data (headers, objects, routes) | 32×40 + 98×200 + 324×50 | — | Yes | `og_save_reader.cpp` lines ~156–158 |
| 144 | `grid_vegetation_growth` | 1 | 51984 | 51,984 | No | Same |
| 145 | `vegetation_growth_state` | 20 | 1 | 20 | No | Same |
| 146 | `sphinx_spots` | 24 | 22 | 528 | No | Same |
| 147 | `floodplain_settings` | 36 | 1 | 36 | Yes | Same — **first extended chunk (Cleopatra)** |
| 148 | `grid_service_visit` | 4 | 51984 | 207,936 | Yes | Same |
| 149 | `sun_temple_spots` | 24 | 13 | 312 | No | Same |
| 150–165 | `name_counter_ext_0` through `name_counter_ext_15` | 4 each × 16 | 64 | No | `og_save_reader.cpp` lines ~170–185 |
| 166 | `tutorial_flags_a` | 1 | 26 | 26 | No | Same |
| 167 | `tutorial_flags_b` | 1 | 15 | 15 | No | Same |
| 168 | `grid_rubble_building_type` | 1 | 51984 | 51,984 | Yes | Same |
| 169 | `game_is_replay` | 1 | 1 | 1 | No | Same |
| 170 | `grid_moisture` | 1 | 51984 | 51,984 | Yes | Same |
| 171–172 | `obelisk_small_spots`, `obelisk_large_spots` | 24 × (10 + 18) = 672 | No | Same |
| 173 | `mummies_max` | 4 | 1 | 4 | No | Same |
| 174 | `difficulty` | 4 | 1 | 4 | No | Same |
| 175 | `record_savings` | 12 | 1 | 12 | No | Same |
| 176–180 | Monument spots (library, caesareum, lighthouse, abu simbel, royal tomb) | 24 × (27+27+15+56+75) = 4,968 | No | `og_save_reader.cpp` lines ~203–207 |

**Total chunks: 181** (`CHUNK_COUNT = 181`, `og_save.h` line ~146).

### 4b. Sectioned Container Format (`.svx`)

Newer saves use a sectioned container where chunks are identified by name rather than position. Layout:

```
[file header] [section] [section] ... [section]
```

Each section has:
- **Section header**: name (32 bytes), payload_offset, payload_size, raw_size, crc32, compressed flag.
- **Payload**: same 4-byte prefix + compressed/raw data as legacy format.
- **Epilog**: name repeated between `0xFFFF` markers.

**Source**: Akhenaten `src/io/chunk_container.h` — class `svx` with `scan()`, `decompress_prefixed()`, `compress_prefixed()`.

The `.svx` format allows missing chunks (save predates the chunk) and CRC validation per section.

---

## 5. Scenario Record (embedded in save, also in .map files)

The scenario record is a fixed-size struct embedded at chunk index 76 of saves. In `.map` files it occupies the same logical position within the file's chunk layout.

### Source
- Akhenaten: `src/scenario/scenario.h` — struct `scenario_data_t`.
- Julius: `src/scenario/scenario.c` — function `scenario_save_state()` / `scenario_load_state()`.

### Key fields (Pharaoh, from `scenario_data_t`)

| Field | Type/Size | Source |
|-------|-----------|--------|
| `scenario_name` | xstring (name) | `scenario.h` line ~142 |
| `difficulty` | scenario_difficulty_t | Same |
| `start_year` | int | Same |
| `climate` | int (0=central, 1=northern, 2=desert) | Same — enum `e_climate` at line ~106 |
| `player_rank` | int | Same |
| `player_incarnation` | int | Same |
| `debt_interest_rate` | int | Same |
| `kingdom_supplies_grain` | int | Same |
| `image_id` | int (background image ID) | Same |
| `subtitle` | xstring | Same |
| `brief_description` | xstring | Same |
| `enemy_id` | e_enemy_type | Same |
| `is_open_play` | bool | Same |
| `open_play_scenario_id` | int | Same |
| `is_custom` | bool | Same — non-zero = .sav loaded, not a .map |
| `player_faction` | int | Same |
| `win_criteria` | struct (population, culture, prosperity, monuments, kingdom, housing_count, housing_level, time_limit, survival_time, milestones) | Same ~lines 178–190 |
| `finance.initial_funds` | int | Same ~line 193 |
| `finance.rescue_loan` | int | Same |
| `empire.id` | int | Same ~line 198 |
| `demand_changes[40]` | demand_change_t | Same ~line 205 |
| `price_changes[40]` | price_change_t | Same |
| `invasions[40]` | invasion_t | Same |
| `earthquake.severity/year` | int × 2 | Same ~line 213 |
| `current_pharaoh` | int | Same ~line 217 |
| `emperor_change.year/enabled` | int × 2 | Same |
| `gladiator_revolt.year/enabled` | int × 2 | Same |
| `random_events.*` | int × 6 | Same ~lines 224–230 |
| `map` | map_data_t (width, height, start_offset, border_size) | Same ~line 235 — **struct from grid/map_geometry.h** |
| `entry_point` | tile2i (x, y) | Same |
| `exit_point` | tile2i (x, y) | Same |
| `river_entry_point` | tile2i | Same |
| `river_exit_point` | tile2i | Same |
| `earthquake_point` | tile2i | Same |
| `herd_points_predator[30]` | herd_point_t | Same — dynamic vector, max 30 |
| `herd_points_prey[30]` | herd_point_t | Same |
| `fishing_points[15]` | tile2i | Same — MAX_FISH_POINTS = 15 |
| `disembark_points[15]` | tile2i | Same — MAX_DISEMBARK_POINTS = 15 |
| `invasion_points_land[30]` | tile2i | Same — MAX_INVASION_POINTS_LAND = 30 |
| `invasion_points_sea[30]` | tile2i | Same — MAX_INVASION_POINTS_SEA = 30 |
| `allowed_buildings[BUILDING_MAX]` | bool array | Same ~line 251 |
| `pak_reserved[114]` | int16_t | Same — reserved for mission .pak compatibility |
| `init_resources` | resource_allow_vec | Same |
| `vars` | settings_vars_t | Same |

### Julius comparison (scenario struct, simpler)

Julius stores the scenario in a flat buffer via `scenario_save_state()` / `scenario_load_state()`:

| Field | Size | Source |
|-------|------|--------|
| `start_year` | 2 bytes | `scenario.c` line ~10 |
| empire.id + padding | 12 bytes | Same |
| requests[40] × year/resource/amount/deadline | 640 bytes | Same lines ~13–28 |
| invasions[40] × type/amount/from/attack_type | 400 bytes | Same lines ~30–45 |
| initial_funds, enemy_id + padding | 12 bytes | Same lines ~47–50 |
| map.width/height/grid_start/grid_border_size | 16 bytes | Same line ~52–55 |
| brief_description (256), briefing (256) | 512 bytes | Same lines ~57–58 |
| requests[40] × can_comply_dialog_shown | 40 bytes | Same line ~60 |
| image_id, is_open_play, player_rank | 6 bytes | Same lines ~62–64 |
| herd_points[MAX_HERD_POINTS=30] × (x,y) | 120 bytes | Same lines ~66–71 |
| demand_changes[40] × year/month/resource/route/is_rise | 280 bytes | Same lines ~73–95 |
| price_changes[40] × year/month/resource/amount/is_rise | 280 bytes | Same lines ~97–119 |
| gladiator_revolt.enabled/year, emperor_change.enabled/year | 16 bytes | Same lines ~121–124 |
| random_events (6 ints) | 24 bytes | Same lines ~126–133 |
| fishing_points[15] × (x,y) | 60 bytes | Same lines ~135–140 |
| requests[40] × favor/month/state/visible/months_to_comply | 200 bytes | Same lines ~142–160 |
| rome_supplies_wheat | 4 bytes | Same line ~162 |
| allowed_buildings[MAX_ALLOWED_BUILDINGS=357] | 714 bytes | Same lines ~164–168 |
| win_criteria (culture/goal, prosperity/goal, peace/goal, favor/goal, enabled×4, time_limit.enabled/years, survival_time.enabled/years) | 40 bytes | Same lines ~170–182 |
| earthquake.severity/year | 8 bytes | Same line ~184 |
| win_criteria.population.enabled/goal | 8 bytes | Same line ~186 |
| map points (earthquake, entry, exit) + invasion_points[30] × (x,y) + river_entry/exit + rescue_loan + milestones | ~270 bytes | Same lines ~188–205 |
| native_images.hut/meeting/crops | 12 bytes | Same line ~207 |
| climate, flotsam_enabled | 2 bytes | Same line ~209 |
| empire.is_expanded/expansion_year + distant_battle info + open_play_scenario_id | 16 bytes | Same lines ~211–218 |

**Total Julius scenario buffer**: approximately **3,500–4,000 bytes**. Pharaoh's `scenario_data_t` is larger due to additional features (Cleopatra expansion).

---

## 6. Map File (`.map`) Specifics

The `.map` file is essentially a **scenario-only** save: it contains the schema header + grid chunks + scenario record, but **not** runtime state (buildings, figures, routes, city economy, etc.).

### How Akhenaten loads .map files

Akhenaten uses `ChunkSerializer` with a schema initialized for `FILE_FORMAT_MAP_FILE`. The map file follows the same positional chunk layout as saves but with fewer chunks. The exact chunk list for `.map` files is defined in the game's schema initialization function (called via `init_schema(FILE_FORMAT_MAP_FILE, version)`).

**Key difference from .sav**:
- No buildings chunk (buildings are placed by the player during gameplay).
- No figures chunk (figures spawn dynamically).
- No route_paths / route_figure_ids.
- No city_players, empire_cities, trade data.
- Grid chunks (images, terrain, edge, etc.) ARE present — they define the static map layout.
- Scenario record IS present — it defines mission parameters.

**Source**: Akhenaten `src/io/chunk_serializer.cpp` — `serialize()` / `unserialize()` methods dispatch to schema-specific init functions based on `e_file_format`. The map format uses `FILE_FORMAT_MAP_FILE` (defined in `src/content/file_formats.h` line ~14).

### Julius .map loading

Julius loads `.map` files via `game_file_io_read_scenario()` (`src/game/file_io.c` line ~530):
1. Initializes scenario pieces with fixed sizes.
2. Reads each piece sequentially from the file (no compression for scenarios in Julius).
3. Calls `scenario_load_from_state()` to populate game state.

**Julius scenario pieces** (uncompressed, sequential read):
| Piece | Size | Source |
|-------|------|--------|
| graphic_ids (image grid) | 52,488 bytes = 228×228×1 | `file_io.c` line ~207 |
| edge | 26,244 bytes = 228×115 | Same |
| terrain | 52,488 bytes = 228×228×1 | Same |
| bitfields | 26,244 bytes = 228×115 | Same |
| random | 26,244 bytes = 228×115 | Same |
| elevation | 26,244 bytes = 228×115 | Same |
| random_iv | 8 bytes | Same |
| camera | 8 bytes | Same |
| scenario (scenario record) | 1,720 bytes | Same |
| end_marker | 4 bytes | Same |

**Note**: Julius uses a **different grid layout** for some chunks — edge/bitfields/random/elevation are stored as `228 × 115` (half-height, since those values only need to be defined between cell centers). Pharaoh stores all grids at full `228 × 228`.

---

## 7. Image ID Mapping (Grid → .sg3 Files)

Each cell in the `grid_images` chunk contains a **32-bit image ID** that maps to a specific sprite in the game's `.sg2` / `.sg3` archive files.

### How it works
1. The image ID is an index into the game's resource catalog.
2. IDs are grouped by .sg file: typically `0–N` for sg2, `N+1–M` for sg3, etc.
3. To render a cell at `(x, y)`:
   - Read `grid_images[y * 228 + x]` → image ID.
   - Determine which .sg file contains this ID (based on ID ranges).
   - Extract the sprite from the .sg archive using the ID as an offset into the archive's image table.

### Source for Pharaoh image IDs
- Akhenaten: `src/graphics/image_pak.cpp` — `.sg2` / `.sg3` parsing.
- Julius: `src/core/image.c` — `.dat` file parsing (Julius uses .dat instead of .sg).
- The mapping from image ID to .sg file and sprite offset is determined by the game's resource catalog, which is loaded at startup from the data files.

**Note**: This is **not** part of the .map/.sav format itself — it's a runtime lookup. The grid stores only the numeric ID; the .sg file resolution happens when rendering.

---

## 8. Building Record Layout (`.sav` chunk 32)

Buildings are stored as an array of `building` structs, each **264 bytes** (`0x108`).

### Source
- Akhenaten: `src/io/og_save/og_types.h` — struct `building` with nested unions for building-type-specific data.
- The struct has a fixed header (common fields) followed by a union of type-specific data blocks.

### Common header (first ~80 bytes)
| Offset | Field | Size | Source |
|--------|-------|------|--------|
| 0x00 | player | uint8_t | `og_types.h` line ~234 |
| 0x01 | player (continued) | — | Same |
| 0x06 | x | int16_t | Same |
| 0x08 | y | int16_t | Same |
| 0x0C | grid_offset | int32_t | Same |
| 0x10 | type | int16_t | Same — building type enum |
| 0x12 | subtype | int16_t | Same |
| 0x14 | road_network_id | uint8_t | Same |
| 0x16 | created_sequence | uint16_t | Same |
| 0x18 | houses_covered | int16_t | Same |
| 0x1A | percentage_houses_covered | int16_t | Same |
| 0x1E | house_population | int16_t | Same |
| 0x22 | house_population_room | int16_t | Same |
| 0x24 | distance_from_entry | int16_t | Same |
| 0x26 | road_access_x/y | int16_t × 2 | Same |
| 0x2A | figure_id | int16_t | Same |
| 0x2C | figure_id2 | int16_t | Same |
| 0x2E | immigrant_figure_id | int16_t | Same |
| 0x30 | figure_id4 | int16_t | Same |
| 0x32 | figure_spawn_delay | uint8_t | Same |
| 0x33 | reserved_1 | uint8_t[2] | Same |
| 0x35 | figure_roam_direction | uint8_t | Same |
| 0x36 | water_dependency | uint8_t | Same |
| 0x3C | loads_stored | int16_t | Same |
| 0x42 | labor_category | int8_t | Same |
| 0x43 | output_resource | uint8_t | Same |
| 0x44 | has_road_access | uint8_t | Same |
| 0x46 | damage_risk | int16_t | Same |
| 0x48 | fire_risk/duration/proof | — | Same |
| 0x50 | formation_id | int16_t | Same |
| 0x54 | data (union) | varies | Same — type-specific data starts here |

### Type-specific data union (starts at offset 0x54)
The `data` union contains one of: `building_house`, `building_pyramid`, `building_monument`, `building_obelisk`, `building_abu_simbel`, `building_mausoleum`, `building_royal_tomb`, `building_market`, `building_granary`, `building_storage_yard`, `building_industry`, `building_shipyard`, `building_native`, `building_entertainment`, `building_dock`, `building_temple_complex`, `building_oriented`, `building_water_lift`.

Each variant is exactly **100 bytes** (`0x64`), making the total struct 264 bytes (80 header + 100 union + 84 trailing fields).

### Trailing fields (after union, offset ~0xB8)
| Offset | Field | Size | Source |
|--------|-------|------|--------|
| 0xB8 | tax_income_or_storage | int32_t | `og_types.h` line ~274 |
| 0xBC | house_months_without_food | uint8_t | Same |
| 0xBD | ruin_has_plague | uint8_t | Same |
| 0xBE | desirability | int8_t | Same |
| 0xBF | is_deleted | uint8_t | Same |
| 0xC0 | is_adjacent_to_water | uint8_t | Same |
| 0xC1 | storage_id | uint8_t | Same |
| 0xC2 | sentiment (union) | — | Same |
| 0xC3 | show_on_problem_overlay | uint8_t | Same |
| 0xC4 | linked_building_id | int32_t | Same |
| 0xC8 | monument_remaining_blocks | int16_t | Same |
| 0xCA | queue_index/queue_slot | uint8_t × 2 | Same |
| 0xCE | second_input_stock/resource | int16_t × 2 | Same |
| 0xD0 | venue_plaza_grid_offset | int32_t | Same |
| 0xD4–E0 | venue fields + info_orders | — | Same |
| 0xE4 | crime_risk | int32_t | Same |
| 0xFC | house_plague_risk | int32_t | Same |
| 0x100 | problem_flags | int32_t | Same |
| 0x104–106 | incoming_carts/loads | int16_t × 2 | Same |

**Source**: All offsets verified by `static_assert` in `og_types.h` lines ~280–500.

---

## 9. Figure Record Layout (`.sav` chunk 21)

Figures are stored as an array of **388-byte** records, max 2,000 figures (`MAX_FIGURES`).

### Source
- Akhenaten: `src/io/og_save/og_types.h` — figure struct definition.
- Julius: `src/figure/figure.c` / `src/figure/figure.h`.

The figure record contains position, type, state machine data, and type-specific fields (similar to buildings with a union).

---

## 10. Comparison: Pharaoh vs Caesar III

| Aspect | Pharaoh (Akhenaten) | Caesar III (Julius) |
|--------|---------------------|---------------------|
| Save version | 160 (0xA0), Cleopatra extension | ~102 (0x66) |
| Total chunks | 181 | ~95 pieces |
| Grid size | 228 × 228 | 228 × 228 |
| Scenario compression | None in .map; save uses chunk-level compression | None — all scenario pieces uncompressed |
| Save compression | Per-chunk PKWare implode prefix | Per-piece PKWare implode prefix |
| Building record size | 264 bytes (0x108) | ~200 bytes (varies by type) |
| Max buildings | 4,000 | ~357 types but fewer max instances |
| Sectioned format (.svx) | Yes — newer saves use name-based sections | No — purely positional |
| Extended chunks (Cleopatra) | Chunks 147–180 added in v160 | N/A |

**Key insight**: Julius's `.sav` and `.map` formats are structurally identical to Pharaoh's — both use the same chunk-based layout with PKWare compression. The main differences are:
- Pharaoh has more chunks (Cleopatra expansion).
- Julius stores scenario pieces uncompressed; Pharaoh compresses grid data.
- Julius uses .dat files for images; Pharaoh uses .sg2/.sg3 archives.

---

## 11. Proposed Implementation Issues

Based on this research, here is a proposed split into implementation issues:

### Issue 1: Implement PKWare DCL "Implode" decompressor in Rust
**Goal**: A standalone `pkware-decompress` crate that can decompress PKWare implode data.
- **Acceptance criteria**:
  - [ ] Given compressed bytes + expected raw size, returns the decompressed output.
  - [ ] Handles all three prefix cases: `0x80000000` (uncompressed), `0` (zero-filled), N (compressed payload of N bytes).
  - [ ] Passes round-trip tests against known Julius/Akhenaten test data.
  - [ ] No unsafe code required for the decompression logic itself.
- **Source**: Julius `src/core/zip.c` — functions `zip_decompress()`, `pk_implode_*()` helpers. Akhenaten `src/core/zip.cpp`.

### Issue 2: Implement `.sav` file reader (chunks + schema)
**Goal**: Read a Pharaoh `.sav` file and produce structured Rust types for all 181 chunks.
- **Acceptance criteria**:
  - [ ] Reads the 7-header chunks (mission_id through schema).
  - [ ] Validates the schema against expected sizes/counts/compression flags.
  - [ ] Decompresses each chunk using the pkware-decompress crate.
  - [ ] Populates grid arrays (images, edge, terrain, etc.) as `Vec<T>`.
  - [ ] Parses building records into Rust structs matching the 264-byte layout.
  - [ ] Parses figure records into Rust structs matching the 388-byte layout.
  - [ ] Returns an error if the file version is not supported or schema doesn't match.
- **Source**: Akhenaten `src/io/og_save/og_save_reader.cpp` — `read_savegame()`, `k_chunks[]` array, chunk enum.

### Issue 3: Implement `.map` (scenario) file reader
**Goal**: Read a Pharaoh `.map` file and produce structured Rust types for the scenario data.
- **Acceptance criteria**:
  - [ ] Reads the scenario header chunks (mission_id through schema).
  - [ ] Decompresses grid chunks (images, terrain, edge, etc.).
  - [ ] Parses the embedded scenario record into a `Scenario` struct.
  - [ ] Extracts entry/exit points, river points, map dimensions.
  - [ ] Returns an error if the file format is unrecognized.
- **Source**: Akhenaten `src/io/chunk_serializer.cpp` — schema init for `FILE_FORMAT_MAP_FILE`. Julius `src/game/file_io.c` — `game_file_io_read_scenario()`, `init_scenario_data()`.

### Issue 4: Implement `.sg2` / `.sg3` archive reader (image ID resolution)
**Goal**: Read Pharaoh's .sg archive files and resolve image IDs to sprite data.
- **Acceptance criteria**:
  - [ ] Parses the .sg file header and image table.
  - [ ] Given an image ID, returns the sprite's pixel data (or at least its dimensions and offset within the archive).
  - [ ] Handles both .sg2 and .sg3 archives.
- **Source**: Akhenaten `src/graphics/image_pak.cpp`. Julius `src/core/image.c` — `.dat` parsing (similar structure).

---

## Appendix A: File Format Quick Reference

| Item | Value | Source |
|------|-------|--------|
| Grid width | 228 cells | Akhenaten `og_save.h` line ~147 |
| Grid height | 228 cells | Same |
| Total grid cells | 51,984 (0xCA60) | 228 × 228 |
| Save version | 160 (0xA0) | Akhenaten `og_save.h` line ~145: `SAVE_VERSION = 160` |
| Julius save version | 102 (0x66) | Julius `file_io.c` line ~53: `SAVE_GAME_VERSION = 0x66` |
| Total chunks (v160) | 181 | Akhenaten `og_save.h` line ~146: `CHUNK_COUNT = 181` |
| Building record size | 264 bytes (0x108) | Akhenaten `og_types.h`: `static_assert(sizeof(building) == 0x108)` |
| Figure record size | 388 bytes | Akhenaten `og_save_reader.cpp` line ~21: element_size = 388 |
| Max buildings | 4,000 | Akhenaten `og_types.h`: `MAX_BUILDINGS = 4000` |
| Max figures | 2,000 | Same: `MAX_FIGURES = 2000` |
| Compression prefix (uncompressed) | 0x80000000 | Akhenaten `og_save_reader.cpp`: `CHUNK_STORED = 0x80000000u`; Julius `file_io.c`: `UNCOMPRESSED = 0x80000000` |
| Compression prefix (zero-filled) | 0x00000000 | Akhenaten `og_save_reader.cpp` line ~253: `if (header == 0)` |
| Sectioned container magic | N/A (no magic, uses section headers) | Akhenaten `chunk_container.h`: class `svx`, no file-level magic byte |

## Appendix B: Julius Scenario Buffer Layout (for reference)

Julius stores the scenario in a single flat buffer (~3,500–4,000 bytes). The layout is defined by the sequence of writes in `scenario_save_state()` (`src/scenario/scenario.c`):

1. start_year (2B) + padding (2B) + empire.id (2B) + padding (8B) = 14B
2. requests[40] × year/resource/amount/deadline = 640B
3. invasions[40] × type/amount/from/attack_type = 400B
4. padding (2B) + initial_funds (4B) + enemy_id (2B) + padding (6B) = 14B
5. map.width/height/grid_start/grid_border_size = 16B
6. brief_description (256B) + briefing (256B) = 512B
7. requests[40] × can_comply_dialog_shown = 40B
8. image_id (2B) + is_open_play (2B) + player_rank (2B) = 6B
9. herd_points[30] × (x,y) = 120B
10–15. demand_changes, price_changes, gladiator_revolt, emperor_change, random_events, fishing_points, requests metadata, rome_supplies_wheat, allowed_buildings, win_criteria, earthquake, population criteria, map points, invasion points, river points, rescue_loan, milestones, native_images, climate, empire data = ~1,500B

**Total**: approximately **3,500–4,000 bytes**.

Pharaoh's `scenario_data_t` is larger due to Cleopatra additions (more win criteria types, additional event systems, etc.). The exact size in Pharaoh is 1,592 bytes for the embedded scenario record in saves (chunk 76), but the full `scenario_data_t` struct is larger when including all dynamic arrays.
