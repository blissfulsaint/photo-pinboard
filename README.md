<img src="public/app-icon.svg" alt="Photo Pinboard icon" width="80" height="80" />

# Photo Pinboard

Put your memories on the map. Add GPS coordinates and restore missing capture dates in your photo and video collection, with a local web app or portable Windows app.

Photo Pinboard helps with files that have lost their location metadata, including photos whose estimated locations appear only in another photo service's interface. You supply the coordinates or capture date, and the app writes them into supported files.

[Download for Windows](https://github.com/blissfulsaint/photo-pinboard/releases/latest) · [Usage guide](docs/USAGE.md) · [Report an issue](https://github.com/blissfulsaint/photo-pinboard/issues)

## What it does

- Browse nested folders with search, previews, batch selection, and individual review.
- Detect existing GPS and find files with missing capture dates.
- Assign coordinates individually or in batches, with reusable saved places.
- Write GPS to originals or create verified copies with the folder hierarchy preserved.
- Embed missing JPEG capture dates in the web app, with additional video support on Windows.
- Resume work using embedded metadata and portable JSON progress backups.

The sample library uses illustrations. Open a folder to work with your own files.

## Choose an edition

| Capability | Web app | Windows app |
| --- | --- | --- |
| Folder browser, previews, selection, and saved places | Yes | Yes |
| Photo GPS and capture-date scanning | Supported formats | Supported formats |
| Write JPEG GPS | Yes | Yes |
| MP4, MOV, and M4V GPS scanning and writing | — | Yes |
| Embed missing capture dates | JPEG, with folder-write access | JPEG, MP4, MOV, and M4V |
| Saved progress | Browser storage | Local app data |
| JSON backup and restore | Yes | Yes |

The web edition works locally in your browser and can be deployed as a static website. Chrome or Edge is recommended for updating originals and writing batches to folders. Browsers without folder-write support can download a single geotagged JPEG copy.

### Windows download

Open the repository's **Releases** page and download `Photo-Pinboard-1.0.0-win-x64.zip`. Extract the entire ZIP, then run `Photo Pinboard.exe`. Keep the included resources and DLLs beside the executable. Windows 10/11 x64 is the target platform.

The portable app requires no Node.js installation. The package is unsigned, so Windows may display an unknown-publisher or SmartScreen prompt. Verify that you obtained it from this repository's Releases page. A SHA-256 checksum file accompanies the download.

GitHub's automatically generated **Source code** archives contain the project files. Choose the named Windows ZIP to run the desktop app.

## Quick start

1. Open a media folder and wait for the metadata scan.
2. Select a folder and filter, then choose one file or a batch. **Select this page** affects the current page, while **Select all matching files** covers the current folder, filter, and search across pages.
3. Paste decimal latitude and longitude or a Google Maps link containing explicit pin coordinates.
4. Assign the location, then choose **Write copies** or **Update originals** in the GPS write panel.
5. For missing capture dates, open **Missing date taken**, select files sharing a timestamp, and enter the local date, time, and UTC offset. On the web, this supports JPEG originals in Chrome or Edge and asks for access to the same source folder. Windows also supports MP4, MOV, and M4V originals.

Keep a backup before updating originals. Assignment Undo reverses pending location assignments. Completed disk writes require restoring from your backup to undo them.

## Privacy and progress

Media files are read and processed on your computer. Opening a folder does not upload its contents. Map and Google Photos links open those external services when clicked.

Web progress is stored in browser storage. Windows progress is stored under `%APPDATA%\Photo Pinboard`. Export a JSON backup to transfer pending work between editions or recover after clearing browser data. Reopen your media folder after restarting the app.

Coordinates and dates successfully written into originals remain embedded independently of saved app progress. Updating local files after an earlier upload does not automatically update copies held by another service.

## Format limits

JPEG metadata writing supports files up to 100 MB. Windows video metadata writing supports MP4, MOV, and M4V and streams from disk. Encoded image, video, and audio data is preserved and verified. Unsupported layouts, ambiguous metadata, and read errors are reported per file.

Other photo formats may support metadata reading and previews, depending on the format. Video playback depends on available codecs. The app requires you to supply missing dates or coordinates, and does not automatically retrieve estimated Google Photos locations.

## Run from source

Use Node.js 24 LTS and npm. The minimum supported Node.js version is 22.12.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production web build, run `npm run build`. Vite writes the static site to `dist/`. Run `npm test` for the shared tests. See the [usage and development guide](docs/USAGE.md) for native video tools, Windows tests, and packaging.

The web and Windows editions share a strictly typed React/TypeScript UI and metadata library. TypeScript checks also cover the Electron bridge, native file operations, packaging scripts, and tests. Run npm run typecheck to check all three configurations. `package.json` supplies the release version, and Windows packaging checks it against the web build.

## Hosting the web app

Import this repository into Vercel with the Vite framework preset, `npm run build` as the build command, and `dist` as the output directory. Use Node.js 24 and set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` for web-only installs. The web app needs no API keys or application backend. The Windows download is distributed through GitHub Releases.

See the [release guide](docs/RELEASING.md) for the publication layout and release checklist.

## License

Photo Pinboard's original code and artwork are available under the [MIT License](LICENSE), copyright 2026 blissfulsaint. Dependencies and bundled programs retain their own licenses. See [third-party notices](THIRD-PARTY-NOTICES.md).
