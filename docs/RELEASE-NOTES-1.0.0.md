# Photo Pinboard 1.0.0

The first public release of Photo Pinboard, a local tool for adding locations and restoring missing capture dates in photo and video libraries.

## Included

- A shared React interface for web and portable Windows use.
- Nested folder browsing, search, previews, batch selection, and individual review.
- Detection of existing GPS and missing capture dates.
- Manual and batch location assignments with reusable saved places.
- Verified JPEG GPS writes to originals or separate copies.
- Windows MP4, MOV, and M4V GPS writes that preserve encoded video and audio data.
- Web capture-date embedding for JPEG originals in Chrome or Edge, including source-folder access, saved-file verification, and recovery on verification failure.
- Windows capture-date embedding for undated JPEG, MP4, MOV, and M4V files.
- Portable JSON progress backups and CSV location inventories.
- Photo Pinboard app icons, favicon, and Windows taskbar branding.

## Download and run

Download Photo-Pinboard-1.0.0-win-x64.zip, extract it completely, and run Photo Pinboard.exe. Keep the included files beside the executable. No Node.js installation is needed. The ZIP supports Windows 10/11 x64 and is unsigned.

The accompanying .sha256 file verifies the ZIP. GitHub's automatically generated source archives contain project source files.

Keep a backup before updating originals. The GPS copy option preserves the original files. The capture-date tool updates originals and applies one entered timestamp to each batch.

See the README for supported formats, browser differences, and development instructions. Third-party licenses and any required corresponding-source downloads are provided with the release.
