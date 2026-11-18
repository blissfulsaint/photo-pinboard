# Photo Pinboard usage and development

Photo Pinboard is a local React app for adding GPS coordinates to photos and videos and restoring missing capture dates. Browse nested folders, review individual files, or work through batches before importing your collection into a photo manager.

The web app and Windows desktop app share one React interface, metadata logic, progress format, and release version. The Windows app adds native folder access, persistent progress, and video metadata processing.

## Capabilities

| Feature | Web | Windows |
| --- | --- | --- |
| Nested folder browser, search, batch selection and review | Yes | Yes |
| Read embedded photo GPS and capture dates | Depending on format | Depending on format |
| Write JPEG GPS to originals or copies | Yes | Yes |
| Preview videos | Depends on browser codecs | Depends on bundled Chromium codecs |
| Read and write MP4, MOV and M4V GPS | — | Yes |
| Embed missing capture dates | JPEG originals, with folder-write access | JPEG, MP4, MOV and M4V originals |
| Progress backups and CSV location inventory | Yes | Yes |
| Saved progress | Browser storage | Local app data |

Original-file and batch-folder writing on the web requires File System Access, available in browsers such as Chrome and Edge. Other browsers can download a single geotagged JPEG copy. JPEG writing is limited to 100 MB per file. Video writing streams from disk.

Files, hashing and metadata processing stay on your computer. The app bundles its fonts. Map verification and optional Google Photos links open external services.

## Use the app

1. Open a media folder and wait for the metadata scan.
2. Browse folders or search by filename and folder name. Selecting a parent includes its descendants.
3. Choose a status filter, then select files in Batch mode or open one in Review.
4. Paste decimal latitude and longitude, or a full Google Maps URL containing explicit pin coordinates.
5. Assign the location, then use the GPS write panel to update originals or save copies.

The map graphic is illustrative. **Verify pin in Maps** opens the coordinates on Google Maps. Map viewport URLs and shortened links require obtaining the actual pin coordinates first. The optional source field accepts a full HTTPS link for your own reference.

Saved places start empty. Enter coordinates and a name, then use **+** to create a reusable preset.

The grid shows 60 files per page. **Select all matching files** covers the current folder, filter and search across pages. **Select this page** adds or removes the current page while retaining selections on other pages.

### Status and progress

- **Needs location** means readable metadata with no detected GPS or pending assignment.
- **Pending write** means assigned coordinates differ from embedded GPS.
- **Geotagged** means GPS is embedded and no different assignment is pending.
- **Check metadata** includes read failures, unsupported formats and ambiguous GPS.
- **Missing date taken** finds photos without a usable EXIF `DateTimeOriginal` and supported videos without a readable capture timestamp.

The progress bar counts geotagged files. Assignments become pending until written. Copy output recreates the imported folder hierarchy with a `.geotagged-HASH` filename suffix. Reopen the copies to see their embedded GPS reflected in progress.

### Missing capture dates

On the web, capture-date writing supports JPEG originals in Chrome or Edge. Select the same top-level source folder when prompted for write access. Windows also supports MP4, MOV and M4V originals. Browsers without folder-write access can inspect missing dates but cannot embed them.

Open **Missing date taken**, select a batch, and enter its local capture date, time and UTC offset. Choose the offset at the place and date of capture, accounting for daylight saving time. The offset starts blank so it must be chosen explicitly.

One batch applies the same timestamp to all eligible selected files. This tool updates originals and skips files that already have a readable capture date or need metadata review. JPEG output embeds `DateTimeOriginal` and `OffsetTimeOriginal`. Supported video output writes the movie creation timestamp in UTC. It does not recover an unknown date automatically.

Metadata writes change file contents. Keep a backup before updating originals. Assignment Undo applies to pending assignments, and does not reverse completed disk writes. Files already uploaded to another service require updating that service's stored copies or metadata separately.

## Resume and back up

Progress follows the SHA-256 hash of each complete file. Moving or renaming a file preserves its identity. Identical files share an assignment. The scan reads complete files, so large libraries can take time.

The web app stores assignments and saved places in browser storage. Windows stores progress and recent folders under `%APPDATA%\Photo Pinboard\progress.json`, with a previous-save recovery file. Reopen the folder after restarting to scan its embedded metadata and match pending work.

Use **Export locations → Back up all progress (JSON)** to transfer progress between web and Windows or recover after clearing browser storage. Restore the JSON and open the corresponding folder, in either order. CSV exports are inventories, not restorable progress backups. Earlier backup formats remain supported.

Existing embedded GPS and capture dates are read from the files independently of saved progress. A successful original write refreshes the file's hash and status in the current library.

## Development

Use Node.js 22.12 or newer and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` produces `dist/`, and `npm run preview` serves that build.

```sh
npm test
npm run test:desktop
```

Desktop video tests require the FFmpeg fixture-generation tool described below. Tests use temporary fixture files.

### Windows development and packaging

```sh
npm run desktop:install
npm run desktop:start
npm run desktop:package
```

The packager creates a portable Windows x64 folder and ZIP under `release/`. Extract the entire ZIP and run `Photo Pinboard.exe`. Keep its resource files beside the executable. The package is unsigned.

The React UI is built from the same sources for both editions. `package.json` is the version source. Vite displays that version in the app and emits `dist/version.json`. The Windows packager checks this build version against the package version and refuses a mismatch or an existing release directory. Platform-specific features use the narrow preload bridge exposed by Electron.

### Video tools

The Windows app requires `vendor/ffprobe.exe`. Desktop video tests additionally require `vendor/ffmpeg.exe`, which is used for fixtures and is excluded from the release. `vendor/toolchain.json` records the FFmpeg version, build/source URLs and checksums. Obtain the matching tools from the recorded build provider and verify the checksums.

The package includes FFprobe as a separate executable along with its license, provenance and third-party notices. JPEG processing uses exifr and the app's metadata writer. Electron runs a sandboxed renderer with context isolation and native file access restricted to selected folders.

## Format limits

Photo reading depends on exifr support. JPEG is the most thoroughly exercised format. HEIC, TIFF and PNG metadata may be readable, while RAW support varies. Writing photo metadata currently supports JPEG only. Preview support is independent of metadata support.

Video metadata writes support MP4, MOV and M4V. Other containers may be listed and previewed but remain under metadata review. Fragmented containers, conflicting metadata, and unsupported layouts require a dedicated metadata editor.

JPEG writes preserve compressed image data. Video writes preserve encoded audio/video payloads and their data offsets. Saved files are independently read and verified, and original writes use recovery copies with rollback on verification failure. Per-file failures appear in a downloadable write report.

## App identity and icons

Photo Pinboard uses the same photo-and-location mark in the web header, browser favicon, and Windows application. The vector source is ../public/app-icon.svg. Run npm run icons:generate after editing it to regenerate the multi-resolution Windows ICO and PNG assets. The normal build also regenerates them.

Windows packaging embeds the app icon, product name and release version into the copied executable. A dedicated App User Model ID and relaunch details identify the running taskbar window. Existing pins made from an older Electron-branded executable may need to be unpinned and recreated from the new executable.

## TypeScript development

Application code and tests use TypeScript. React components use .tsx, shared modules and browser workers use .ts, and Electron/build sources use .cts to emit CommonJS .cjs files. Runtime imports with .js or .cjs extensions refer to the compiled output.

Run npm run typecheck for strict checks of the browser app, desktop/build code, and tests. npm run build includes these checks and emits native modules under build/ before building the web app under dist/. Generated build/ files are excluded from Git. npm test runs the shared TypeScript tests through tsx, and npm run test:desktop compiles native modules before running their TypeScript tests against the emitted code. The desktop packager includes compiled JavaScript without requiring TypeScript or tsx on the user's machine.
