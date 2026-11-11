# Numbered decoder fixture

`numbered-video.mp4` is a locally generated, silent 2-second H.264 video (128×32,
10 fps, 20 intra frames, lossless CRF 0, YUV420p). Each frame encodes its zero-based
index using eight 16-pixel-wide black/white bands, least significant bit first.
The tests independently read band-center pixels; they do not trust currentTime as
proof of decoded content. No downloaded footage, paid generation or audio is used.

To reproduce, generate P6 PPM files for indices 0–19, setting every pixel in band
`b` to RGB 255 when `(index >> b) & 1`, otherwise RGB 0, then run:

```sh
ffmpeg -framerate 10 -i frame-%02d.ppm -c:v libx264 -crf 0 -g 1 -bf 0 -pix_fmt yuv420p numbered-video.mp4
```

Temporary sources and evidence belong under `scratch/output`; tests use the
committed fixture and do not require ffmpeg.
