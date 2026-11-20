#!/bin/sh
# Run from an extracted, unmodified FFmpeg 9.0.2 source directory, using
# w64devkit 2.11.0 on PATH. Use a working directory with no spaces.
set -eu
export TMPDIR=../tmp
mkdir -p "$TMPDIR"
sh ./configure \
  --target-os=mingw32 --arch=x86_64 \
  --disable-autodetect --disable-gpl --disable-nonfree --disable-version3 \
  --disable-network --disable-doc --disable-debug \
  --disable-ffmpeg --disable-ffplay --disable-avdevice --disable-avfilter \
  --disable-swscale --disable-swresample --disable-encoders --disable-muxers \
  --disable-devices --disable-filters --disable-x86asm \
  --enable-static --disable-shared --extra-ldflags=-static
make V=1 -j"${JOBS:-8}" ffprobe.exe
