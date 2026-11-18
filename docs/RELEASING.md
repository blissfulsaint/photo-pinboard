# Releasing Photo Pinboard

## Publication layout

The public source repository is https://github.com/blissfulsaint/photo-pinboard.

- Commit source, icons, synthetic test fixtures, documentation, dependency manifests, and license files.
- Keep node_modules, dist, release output, work files, private environment settings, and vendor executables out of Git history.
- Publish portable Windows ZIPs and checksum files as GitHub Release assets.
- Deploy the web app separately from the repository using a static host such as Vercel.

The app version lives in package.json. Keep the root version in package-lock.json synchronized. Use a matching v-prefixed Git tag, such as v1.0.0, on the exact commit used for the Windows and web builds.

## Initial 1.0.0 review

- [x] General-purpose copy, sample content, app name, and icons.
- [x] Shared version source for web and Windows.
- [x] MIT license selected by the project owner.
- [x] Public README, usage guide, and GitHub download layout prepared.
- [ ] Obtain and package the complete corresponding source, dependency source, and build information for the exact bundled FFprobe build. Bundling was selected by the project owner.
- [ ] Review and approve the repository contents and release text.
- [x] Shared tests (35), native tests (17), and production web build pass for the 1.0.0 source candidate.
- [ ] Build and verify the final Windows package after the FFprobe source-distribution item is complete.
- [ ] Verify the final Windows app interactively, including taskbar branding, folder selection, and writes on disposable test files.
- [x] Create the public repository and upload the source candidate.
- [x] Save the unpublished Photo Pinboard 1.0.0 release draft.
- [ ] Tag the release commit v1.0.0 and publish the named Windows ZIP, checksum, and required third-party source assets with the release notes.
- [ ] Add a hosted web link to the README and repository About section after deployment.

## Build and validate

Use Node.js 24. Install the pinned dependencies with npm ci. Obtain the exact vendor tools recorded in vendor/toolchain.json for Windows video tests and packaging. The developer FFmpeg fixture tool is excluded from the portable app.

```sh
npm test
npm run test:desktop
npm run desktop:package
```

The desktop packager refuses an existing version directory. It generates the shared web assets, verifies version alignment, embeds the app name and icon, and creates release/Photo-Pinboard-1.0.0-win-x64.zip with a matching .sha256 file.

## Release assets

- Photo-Pinboard-1.0.0-win-x64.zip, the complete portable application.
- Photo-Pinboard-1.0.0-win-x64.zip.sha256, the checksum for that exact ZIP.
- Required corresponding-source archives and build information for redistributed GPL components when FFprobe is bundled. List them clearly next to the Windows download.
- Optionally, a ZIP of the static web build for people who want to self-host.

GitHub also generates source-code ZIP and tar archives from the tag. Explain that those are source code rather than the runnable Windows app.

Draft the GitHub Release first and attach the reviewed assets. Publish after the source-distribution and final verification items are complete. The first public release is a stable release, with tag v1.0.0 and title Photo Pinboard 1.0.0.

## Vercel later

Import the GitHub repository, choose Vite, use npm run build and dist, and select Node.js 24. Set ELECTRON_SKIP_BINARY_DOWNLOAD=1 to avoid installing the Windows desktop runtime for web deployment. The deployed application serves static files and processes selected media locally in the browser. Download buttons should point to GitHub Releases.

## References

- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [FFmpeg license information](https://ffmpeg.org/legal.html)
