# Third-party notices

The MIT License at the repository root applies to Photo Pinboard's original code and artwork. It does not replace the licenses of dependencies or separate programs.

| Component | Role | License |
| --- | --- | --- |
| React and React DOM | Shared user interface | MIT |
| exifr | Photo metadata reader | MIT |
| hash-wasm | File hashing | MIT |
| DM Sans | Interface font | SIL Open Font License 1.1 |
| Manrope | Interface font | SIL Open Font License 1.1 |
| Electron and Chromium | Windows runtime | Electron MIT and Chromium third-party notices |
| FFprobe built from unmodified FFmpeg 9.0.2 sources | Separate Windows video metadata reader | LGPL-2.1-or-later; MinGW runtime notices and GCC Runtime Library Exception also included |

The Windows package includes Electron's LICENSE and LICENSES.chromium.html, full notices for bundled web dependencies and fonts, and the FFprobe license and toolchain provenance under resources/tools. Development dependencies retain their upstream licenses in their packages.

FFprobe is an executable launched separately from Photo Pinboard. The app uses it for independent metadata readback. Video metadata modifications are implemented by Photo Pinboard without remuxing or re-encoding.

The release uses Photo Pinboard's own Windows x64 FFprobe build, with GPL/nonfree components, network protocols, encoding, and external codec libraries disabled. It requires only Windows system DLLs. It replaces the development build previously obtained from Gyan.

The named `Photo-Pinboard-1.0.0-ffprobe-sources.zip` release asset contains the complete FFmpeg source, the compiler/runtime source archive, the pinned toolchain build recipes and patches, and the actual FFmpeg configuration and build logs. Publish this asset and its checksum alongside the Windows ZIP. Binary and source-archive hashes are recorded in `vendor/toolchain.json`; the Windows packager verifies both before packaging. See `vendor/SOURCES.md` and [the release guide](docs/RELEASING.md).

- [FFmpeg license information](https://ffmpeg.org/legal.html)
- [Pinned w64devkit build tools and source](https://github.com/skeeto/w64devkit/releases/tag/v2.11.0)
- [Recorded toolchain provenance](vendor/toolchain.json)
