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
| FFprobe from the recorded Gyan build | Separate Windows video metadata reader | GPLv3, plus applicable dependency notices |

The Windows package includes Electron's LICENSE and LICENSES.chromium.html, full notices for bundled web dependencies and fonts, and the FFprobe license and toolchain provenance under resources/tools. Development dependencies retain their upstream licenses in their packages.

FFprobe is an executable launched separately from Photo Pinboard. The app uses it for independent metadata readback. Video metadata modifications are implemented by Photo Pinboard without remuxing or re-encoding.

The current FFprobe build enables GPL components and includes external libraries. Before public binary distribution, provide access to the corresponding source and build information for the exact binary and its applicable dependencies. The existing upstream FFmpeg tarball link alone has not been verified to satisfy that requirement for the complete Gyan build. Track completion in [the release guide](docs/RELEASING.md).

- [FFmpeg license information](https://ffmpeg.org/legal.html)
- [Gyan build provider](https://www.gyan.dev/ffmpeg/builds/)
- [Recorded toolchain provenance](vendor/toolchain.json)
