import { version } from "./pkg/pharaoh_web.js";

// Load wasm version into footer.
(async () => {
    const verEl = document.getElementById("version");
    try {
        verEl.textContent = await version();
    } catch {
        // wasm may not be built yet; show placeholder.
        verEl.textContent = "v0.1.0";
    }
})();

const dropZone = document.getElementById("drop-zone");
const folderPicker = document.getElementById("folder-picker");
const fileList = document.getElementById("file-list");

/** Recursively walk a FileSystemEntry tree and collect all files. */
function readEntries(entry) {
    return new Promise((resolve, reject) => {
        if (entry.isFile) {
            entry.file((f) => resolve([f]));
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            reader.readEntries(async (rawEntries) => {
                try {
                    const results = await Promise.all(rawEntries.map(readEntries));
                    resolve(results.flat());
                } catch (err) {
                    reject(err);
                }
            });
        } else {
            resolve([]);
        }
    });
}

/** Handle a list of File objects. */
function handleFiles(files) {
    const arr = Array.from(files);
    const sg3Names = arr.filter((f) => f.name.toLowerCase().endsWith(".sg3")).map((f) => f.name);
    let output = `${arr.length} file(s) loaded.\n`;
    if (sg3Names.length > 0) {
        output += `.sg3 files:\n${sg3Names.map((n) => `  ${n}`).join("\n")}\n`;
    }
    fileList.textContent = output;
}

// --- Drag and drop ---
dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");

    const items = Array.from(e.dataTransfer.items);
    const entries = await Promise.all(
        items.map((item) => {
            const entry = item.webkitGetAsEntry?.() ?? item.getAsFileSystemHandle?.();
            // Fallback: if it's a file, wrap in a promise resolving to the File.
            if (item.kind === "file") {
                return new Promise((resolve) => item.getAsFile()?.then(resolve));
            }
            return entry ? readEntries(entry) : [];
        })
    );

    handleFiles(entries.flat().filter(Boolean));
});

// --- Folder picker ---
folderPicker.addEventListener("change", () => {
    handleFiles(folderPicker.files);
});
