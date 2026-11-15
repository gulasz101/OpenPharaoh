# Akhenaten Emscripten / WASM Research

## 1. Build System and Dependencies

### Build system
- **CMake 3.16–3.26** (`CMakeLists.txt`, line 1). Custom `cmake/` scripts build each dependency from source via `execute_process()` during the configure phase (not FetchContent for most libs).
- Emscripten is triggered by setting `-DCMAKE_BUILD_PLATFORM=win_emscripten`. The CMake code path is named "win_emscripten" but works on any host — it just means "target Emscripten". See `CMakeLists.txt` lines 27–31.
- CI uses the Docker image `emscripten/emsdk:4.0.1` (`.github/workflows/akhenaten_emscripten.yml`, line 18).

### Third-party dependencies (all version-pinned in CMakeLists.txt, lines 69–78)

| Dependency | Version | Source / FetchContent URL | Emscripten handling |
|---|---|---|---|
| **SDL2** | 2.32.10 | `https://github.com/libsdl-org/SDL.git` (release-2.32.10) | **Skipped** — uses `-sUSE_SDL=2` port (`CMakeLists.txt` line 197, `if(NOT WIN_EMSCRIPTEN)` block at ~line 200). |
| **SDL2_mixer** | 2.8.0 | `https://github.com/libsdl-org/SDL_mixer.git` (release-2.8.0) | **Skipped** — uses `-sUSE_SDL_MIXER=2` port (`CMakeLists.txt` line ~315, same guard). |
| **zlib** | v1.3.1 | `https://github.com/madler/zlib` | Built from source (not skipped for Emscripten; see zlib section at ~line 270). |
| **freetype** | VER-2-13-3 | `https://github.com/freetype/freetype.git` | Built from source. |
| **harfbuzz** | 7.3.0 | `https://github.com/harfbuzz/harfbuzz.git` | Built from source; depends on freetype + zlib. |
| **stb** | commit 5736b15f… | `https://github.com/nothings/stb.git` | FetchContent_MakeAvailable (header-only). |
| **imgui** | v1.92.2 | `https://github.com/ocornut/imgui.git` | FetchContent_MakeAvailable; backends: `imgui_impl_sdl2.cpp`, `imgui_impl_sdlrenderer2.cpp`. |
| **libpng** | v1.6.50 | `https://github.com/pnggroup/libpng.git` | FetchContent_MakeAvailable (static). |
| **cpptrace** | v1.0.4 | `https://github.com/jeremy-rifkin/cpptrace.git` | Only in Debug/RelWithDebInfo builds; uses zstd, libdwarf as nested deps. |
| **tracy** (profiler) | v0.13.1 | `https://github.com/wolfpld/tracy.git` | Optional (`OPTION_ENABLE_TRACY`, default ON). |
| **curl** | curl-8_23_0 | `https://github.com/curl/curl.git` | **Skipped for Emscripten** (`CMakeLists.txt` line ~159, guard `if(NOT WIN_EMSCRIPTEN AND NOT MACOS_X64_BUILD)`). |
| **LAME** (MP3 encoder) | bundled in `src/lame/` | — | Static C files compiled into the binary; has inline assembly but Emscripten handles it. |

### Embedded resources
- **cmrc** (CMake Resource Compiler): embeds `.js` mission scripts and PNG icons as a static library (`akhenaten::rc`). See `cmrc_add_resource_library()` at ~line 1230 of CMakeLists.txt.

## 2. Existing Emscripten / Web Support

### Build system support (already implemented)
- **CMake path**: `-DCMAKE_BUILD_PLATFORM=win_emscripten` sets `WIN_EMSCRIPTEN=TRUE`, which:
  - Generates a nested toolchain file for sub-builds (`CMakeLists.txt` lines 50–63).
  - Skips SDL2/SDL2_mixer/curl/innoextract/video-recording builds.
  - Applies Emscripten-specific compiler/linker flags (lines 104–118):
    ```cmake
    set(USE_FLAGS "-sUSE_SDL=2 -sUSE_SDL_MIXER=2 -sSDL2_MIXER_FORMATS=mp3 -s USE_MPG123=1 -gsource-map")
    ...
    -sASYNCIFY -sASYNCIFY_STACK_SIZE=32768 \
    -sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=128mb -sMEMORY_GROWTH_LINEAR_STEP=32mb \
    -sENVIRONMENT=web \
    -sMODULARIZE \
    -sEXPORT_ALL -sEXPORTED_RUNTIME_METHODS=callMain,addRunDependency,removeRunDependency \
    -lidbfs.js
    ```
  - Embeds engine data maps: `--embed-file ${CMAKE_SOURCE_DIR}/data/maps@/engine/data/maps` (line ~1360).

### CI pipeline (`.github/workflows/akhenaten_emscripten.yml`)
- **Job 1** (`build-akhenaten-emscripten-module`): Builds inside `emscripten/emsdk:4.0.1`, produces `akhenaten.js` + `akhenaten.wasm` in `akhenaten-emscripten-module/`.
- **Job 2** (`build-Akhenaten-ems-launcher`): Checks out a separate repo `dalerank/akhenaten-ems` (React/Vite frontend), drops the WASM module into it, builds with Vite.
- **Job 3**: Deploys to GitHub Pages via `actions/deploy-pages@v4`.

### Source-level Emscripten guards
| File | What's guarded | Notes |
|---|---|---|
| `src/platform/platform.h` (line ~28) | Defines `GAME_PLATFORM_WEB`, `GAME_PLATFORM_BROWSER`, `GAME_PLATFORM_NAME "emscripten"` when `__EMSCRIPTEN__`. | Used throughout for platform checks. |
| `src/platform/platform_emscripten.cpp` | Full platform abstraction: main loop via `emscripten_set_main_loop()`, event polling, user directory resolution. | No file picker — uses IDBFS + JS bridge. |
| `src/content/content_emscripten.cpp` | `platform_file_manager_open_file()` → plain `fopen()` (reads from Emscripten FS). `remove_file()` → POSIX `remove()`. | Minimal; relies on virtual FS. |
| `src/content/vfs.cpp` (line ~23) | `EM_ASYNC_JS(__sync_em_fs, ...)` — async JS bridge to call `FS.syncfs()`. Used after file writes/renames/deletes. | Ensures IDBFS persistence. |
| `src/core/threading.h` (line ~408) | `determine_thread_count()` returns 0 when `__EMSCRIPTEN__ && !__EMSCRIPTEN_PTHREADS__`, effectively disabling the thread pool. | Single-threaded by default. |
| `src/graphics/font.cpp` (line ~291) | Skips custom TTF font loading on Emscripten; uses built-in Pharaoh fonts only. | Workaround for missing font files in IDBFS. |
| `src/platform/screen.cpp` (line ~80) | Forces windowed mode, sets 1920×1080 default size for Emscripten. Fullscreen support exists but uses SDL's canvas fullscreen. |
| `src/platform/akhenaten.cpp` (~lines 243–250) | Skips data bootstrap (innoextract, Steam detection), options window, and engine data check on Emscripten. Language forced to "en". |
| `ext/gpupixel/core/gpupixel_macros.h` | Has `#ifdef __EMSCRIPTEN__` guards for platform-specific code. |

### How Julius/Augustus handle Emscripten (for comparison)
- Julius (Caesar III engine, C): Uses SDL2 + `-sUSE_SDL=2`, loads game files from IDBFS via a file picker in the JS loader. Preloads `.dat` packs into memory at startup. See `src/core/image.c` for image parsing — no special WASM changes needed there.
- Augustus (Empire/Conqueror engine): Similar approach; uses Emscripten's FS API with IDBFS for persistence.

## 3. What Blocks a Browser Build

### Blocker 1: `std::filesystem` usage (~20 files)
**Status**: Partially handled but not fully ported.
- Files using `std::filesystem`: `src/content/vfs.cpp`, `src/content/dir.cpp`, `src/content/mods.cpp`, `src/game/autosave_module.cpp`, `src/game/game.cpp`, `src/io/chunk_serializer.cpp`, `src/platform/app_updater.cpp`, etc.
- In `vfs.cpp` (line 103), `std::filesystem::exists()` is called directly — this works in Emscripten's virtual FS but may fail for paths outside the mounted area.
- `file_rename_os()` at line 178 uses `std::filesystem::rename()` — guarded by `#if defined(GAME_PLATFORM_ANDROID)` else branch, so it hits `std::filesystem` on Emscripten too. The `sync_em_fs()` call after helps but doesn't fix the underlying issue.
- `create_folders()`, `remove_folder()` also use `std::filesystem`.

### Blocker 2: Threading / pthreads
**Status**: Handled (single-threaded mode).
- `src/core/threading.h` line ~408: returns thread count 0 when `__EMSCRIPTEN__ && !__EMSCRIPTEN_PTHREADS__`, so the pool runs on the main thread.
- The CMake flags do NOT include `-sPROXY_TO_PTHREAD` or pthread support, so all game logic runs single-threaded. This is fine for Pharaoh but means no background loading.

### Blocker 3: OpenGL vs SDL_Renderer
**Status**: Handled (SDL_Renderer only).
- No direct OpenGL usage in the codebase (`grep -r 'gl_|GL_'` returns nothing outside comments).
- The renderer uses `SDL_CreateRenderer()` with `SDL_RENDERER_PRESENTVSYNC | SDL_RENDERER_ACCELERATED` (`renderer.cpp` line ~1208). Emscripten's SDL2 port supports WebGL-backed rendering.
- OpenGL context code (`platform_render_create_context()`) is guarded by `data.is_opengl_context`, which is only true if the user selects "opengl" renderer — default is auto-detect, which on Emscripten will pick the SDL_Renderer (WebGL) backend.

### Blocker 4: Audio
**Status**: Handled by SDL2_mixer port.
- CMake flags include `-sUSE_SDL_MIXER=2 -sSDL2_MIXER_FORMATS=mp3 -s USE_MPG123=1`.
- MP3 decoding works via Emscripten's built-in mpg123 support.

### Blocker 5: Inline assembly / platform-specific code
**Status**: Mostly fine.
- LAME encoder (`src/lame/libmp3lame/`) has inline assembly, but Emscripten handles this transparently.
- No x86-specific SIMD or assembly in game logic.

### Blocker 6: Discord RPC, video recording, innoextract
**Status**: Disabled for Emscripten.
- `gpupixel` (GPU rendering acceleration) is excluded on Emscripten (`CMakeLists.txt` line ~1240: `if (PLATFORM_ANDROID OR WIN_EMSCRIPTEN OR APPLE)`).
- Video recording (OpenH264 + minimp4) disabled for non-desktop platforms.
- innoextract (Windows installer extraction) disabled.

### Blocker 7: File paths — absolute vs relative
**Status**: Needs attention.
- The game resolves data from `Data/` or `data/` relative to the base path. On Emscripten, this is resolved via `SDL_GetPrefPath()` in `platform_emscripten.cpp` (line ~50), which returns a path like `/akhenaten` when `ENV.HOME` is set.
- Mission scripts are embedded via cmrc and loaded from memory (`js_vfs.cpp` line 28: `internal_file_open`).

## 4. How Game Files Would Get In

### Current Akhenaten approach (from akhenaten-ems launcher)
The launcher repo (`dalerank/akhenaten-ems`) provides a complete reference implementation:

1. **IDBFS mount**: The WASM module mounts `IDBFS` at `/akhenaten` on startup (`Launcher.tsx` line ~97):
   ```typescript
   instance.FS.mount(instance.FS.filesystems.IDBFS, {root: '/'}, `${instance.ENV.HOME}`);
   await new Promise(resolve => instance.FS.syncfs(true, resolve)); // load from IndexedDB
   ```

2. **File input methods** (`src/pages/dataInput.ts`):
   - **Directory picker**: `<input webkitdirectory>` → reads each file via `FileReader.readAsArrayBuffer()` → writes to virtual FS with `instance.FS.writeFile(uri, data)`.
   - **ZIP upload**: Uses `@zip.js/zip.js` to extract entries → writes each to virtual FS.

3. **Persistence**: After writing files, `FS.syncfs(false, ...)` persists to IndexedDB for future sessions.

4. **No server round-trip**: All file I/O is local browser APIs (File API + IndexedDB). Zero upload to any server.

### Can our Rust/JS drop-folder approach feed Emscripten's FS?
**Yes.** The pattern is identical:
- Our JS side reads files from the File API (user-selected folder or zip).
- Instead of parsing assets directly, we call `Module.FS.writeFile(path, uint8array)` to place them in the virtual FS.
- Then `Module.callMain(['--data', '/akhenaten/Data'])` starts Akhenaten with the data directory pointing into the virtual FS.

This is **exactly** what the akhenaten-ems launcher does — no upload, purely local browser operations. The only difference would be our JS glue code instead of their React app.

## 5. License Note: AGPL-3.0

Akhenaten is licensed under **AGPL-3.0** (`LICENSE.txt`).

### If Wojtek hosts the page publicly
- **Source disclosure required**: AGPL-3.0 section 13 requires that anyone who interacts with a modified version over a network must be able to download the complete corresponding source code.
- The WASM binary + JS loader counts as "serving" the program, so:
  - A "Download Source" link must be provided on the page.
  - Any modifications to Akhenaten's C++ code must also be released under AGPL-3.0.
  - Our Rust asset parser (separate crate) is not derivative — it reads different file formats and doesn't link against Akhenaten, so it can remain under our chosen license.

### If only used locally (user downloads the page)
- The AGPL network clause doesn't apply if no one else accesses the server. A purely local HTML file with File API is fine.
- However, distributing the WASM binary still requires providing source to recipients.

### Practical recommendation
Provide a prominent "Download Source" link and attribute Akhenaten clearly. Consider whether the AGPL compliance burden is worth it vs. writing game logic from scratch (our current Rust path).

## 6. Verdict

### Effort estimate: **~15–25 issues** to reach "playable in browser with local file loading"
The CMake build already works (CI proves it). The remaining work is mostly integration and polish:

| Category | Estimated effort | Notes |
|---|---|---|
| Fix `std::filesystem` calls for Emscripten FS | 3–5 issues | `vfs.cpp`, `dir.cpp`, `mods.cpp`, `autosave_module.cpp` need path resolution fixes. |
| JS glue code (file picker → IDBFS) | 2–3 issues | Similar to akhenaten-ems but simpler — just drop files into virtual FS and callMain(). |
| Save game persistence (IDBFS sync) | 1–2 issues | Already partially implemented (`sync_em_fs()` in `vfs.cpp`). Needs testing. |
| Audio/video edge cases | 1 issue | Test MP3 playback, video recording is disabled so N/A. |
| UI/UX (fullscreen, keyboard, touch) | 2–3 issues | SDL handles most of this; test on mobile browsers. |
| Localization / font loading | 1 issue | Custom fonts disabled on Emscripten (`font.cpp` line ~291). |
| Testing & CI integration | 2–3 issues | Add WASM build to our CI, test with synthetic fixtures. |

### First 3 issues to file
1. **GUL-XXX**: Fix `std::filesystem` calls in `vfs.cpp`, `dir.cpp`, and `autosave_module.cpp` for Emscripten virtual FS — replace or guard with `#ifdef __EMSCRIPTEN__` using `fopen()`/`remove()`/`mkdir()` equivalents.
2. **GUL-XXX**: Write JS glue code: file picker → `Module.FS.writeFile()` into `/akhenaten/Data/` and `/akhenaten/saves/`, then `Module.callMain()`. Reuse the pattern from akhenaten-ems/src/pages/dataInput.ts.
3. **GUL-XXX**: Integrate Akhenaten WASM build into our CI pipeline — add a GitHub Actions job that builds with `-DCMAKE_BUILD_PLATFORM=win_emscripten` and validates the output `.js` + `.wasm`.

### Main risk
**Game logic re-implementation is already done in C++** — this is the biggest advantage over starting from scratch. The main risk is **performance**: running a full city-builder simulation single-threaded in WASM may be slow on mobile devices. The thread pool is disabled (`threading.h` line ~408), so all game updates run on the JS event loop via ASYNCIFY, which adds overhead. Expect 15–30 FPS on mid-range hardware vs. 60+ FPS native.

### Comparison with our Rust path
| Aspect | Akhenaten WASM | Our Rust/WASM |
|---|---|---|
| Game logic | Complete (re-implemented) | Not started |
| Asset parsing | Needs work (uses original formats) | In progress (`pharaoh-assets` crate) |
| Performance | Single-threaded, ASYNCIFY overhead | Potentially multi-threaded via wasm-threads |
| License | AGPL-3.0 (copyleft) | Ours (permissive?) |
| Time to playable | **~2–4 months** (if we accept AGPL) | ~6+ months |
| Control | Limited by Akhenaten's architecture | Full control |

### Bottom line for Wojtek
Akhenaten can absolutely build to WASM — the CMake infrastructure and CI are already in place. The remaining work is primarily glue code and a handful of `std::filesystem` fixes. If we're willing to accept AGPL-3.0 compliance (source disclosure, derivative works), this path gets us to "playable in browser" **significantly faster** than writing game logic from scratch in Rust.

The main trade-off: AGPL compliance burden and single-threaded performance vs. speed-to-market. For a demo or prototype, Akhenaten WASM is the clear winner. For a long-term commercial product, our Rust path gives more control despite taking longer.
