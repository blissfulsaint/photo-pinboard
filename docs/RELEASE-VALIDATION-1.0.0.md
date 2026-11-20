# Photo Pinboard 1.0.0 candidate validation

Candidate prepared on 2026-11-20. The project owner confirmed the interactive Windows check passed. GitHub release publication remains pending.

## Results

- All strict TypeScript configurations and the production web build passed.
- Shared/browser tests: 35 passed.
- Native tests: 17 passed using the new bundled FFprobe. One initial run encountered a transient Windows EPERM during a progress-file rename; the complete rerun passed.
- Packaged Electron runtime: compiled application modules, the narrow preload bridge, JPEG capture-date writes, video GPS writes, independent video payload verification, and shared web/Windows version 1.0.0 passed.
- FFprobe imports only bcrypt.dll, KERNEL32.dll, msvcrt.dll, and SHELL32.dll. Its configuration disables GPL/nonfree components, external dependency autodetection, networking, encoding, and muxing.
- All 10,399 files in the upstream FFmpeg source archive matched the build tree byte-for-byte. The toolchain Dockerfile matched its pinned upstream source archive, and the corresponding-source ZIP passed checksum, required-content, and ZIP integrity checks.
- The release packager checked the bundled FFprobe and corresponding-source ZIP against the hashes in vendor/toolchain.json. It bundled the LGPL, FFmpeg license explanation, MinGW runtime notices, GCC runtime exception, and source-download instructions.
- Synthetic fixtures and disposable temporary folders were used; no user media was modified.

## Local artifacts

The matching files are under release/candidate-20261120:

- Photo-Pinboard-1.0.0-win-x64.zip
- Photo-Pinboard-1.0.0-win-x64.zip.sha256
- Photo-Pinboard-1.0.0-ffprobe-sources.zip
- Photo-Pinboard-1.0.0-ffprobe-sources.zip.sha256

FFprobe binary SHA-256: bff6afa843a2198ad16588c758c1b16d51ba4dc9d5b432e2bd0c374ad6694fc3

Windows ZIP SHA-256: 51a19fd630b844c484c0b0e070eeab11f75e25b75c6e9ef628dd81a15a343076

Source ZIP SHA-256: fdba86b9e5be944701ef473cc0bd642211e319d5d398fa95b18bed77c5587a4a

## Before publication

The project owner confirmed the final interactive check passed and authorized syncing the changes to GitHub. Attach all four matching files to the existing release draft and finish the release-text review before publishing v1.0.0. The separate FFprobe source download is optional for running the app, but must remain available with the Windows binary.
