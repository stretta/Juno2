import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const exportDir = path.join(repoRoot, "export");
const manifestPath = path.join(exportDir, "export-manifest.json");

const entries = await readdir(exportDir, { withFileTypes: true });
const exportJsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".export.json"))
    .map((entry) => entry.name)
    .sort();

const preferredExport = pickPreferredExport(exportJsonFiles);

if (!preferredExport) {
    console.error("No RNBO .export.json file found in export/.");
    process.exit(1);
}

const manifest = {
    patchExportURL: `export/${preferredExport}`,
    dependenciesURL: "export/dependencies.json"
};

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`Wrote ${path.relative(repoRoot, manifestPath)} -> ${manifest.patchExportURL}`);

function pickPreferredExport(files) {
    if (files.includes("patch.export.json")) {
        return "patch.export.json";
    }

    return files[0] || null;
}
