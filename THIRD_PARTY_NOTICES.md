# Third-Party Notices

NeoResourceManager includes and invokes third-party components. This notice is not a replacement for the full license texts included with the project or packaged dependencies.

## FFmpeg / ffmpeg-static

- Component: FFmpeg
- npm package: `ffmpeg-static`
- Package version currently used: `5.3.0`
- Bundled FFmpeg version currently installed by the package: `6.1.1`
- License: GPL v3 / GPL-3.0-or-later
- Project: https://ffmpeg.org/
- Package repository: https://github.com/eugeneware/ffmpeg-static
- Binary source reference from the bundled Windows build: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93

The packaged FFmpeg binary is distributed with its accompanying license/readme files from `ffmpeg-static`, including `ffmpeg.exe.LICENSE` and `ffmpeg.exe.README` on Windows builds.

## ffprobe-static

- Component: ffprobe static package wrapper
- npm package: `ffprobe-static`
- Package version currently used: `3.1.0`
- Package license: MIT
- Package repository: https://github.com/joshwnj/ffprobe-static

`ffprobe-static` provides static ffprobe binaries and package metadata. See the package license and readme in `node_modules/ffprobe-static` for the installed package details.

## Application License

Because NeoResourceManager distributes and invokes the GPL-licensed FFmpeg binary via `ffmpeg-static`, this repository declares the application license as `GPL-3.0-or-later`.

See `LICENSE` for the full GNU General Public License text.
