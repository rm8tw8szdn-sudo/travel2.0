import argparse
import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageOps


TARGET_BYTES = 300_000
MAX_BYTES = 500_000
MIN_WIDTH = 640
MIN_HEIGHT = 360


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def dhash64(image: Image.Image) -> str:
    grayscale = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(grayscale.getdata())
    value = 0
    for row in range(8):
        for column in range(8):
            value = (value << 1) | int(pixels[row * 9 + column] > pixels[row * 9 + column + 1])
    return f"{value:016x}"


def save_candidate(image: Image.Image, target: Path, quality: int) -> int:
    image.save(target, "WEBP", quality=quality, method=6, optimize=True, exif=b"", icc_profile=None)
    return target.stat().st_size


def process(source: Path, target: Path) -> dict:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    source_width, source_height = image.size
    if source_width < MIN_WIDTH or source_height < MIN_HEIGHT:
        raise ValueError(f"IMAGE_TOO_LOW_QUALITY:source-dimensions:{source_width}x{source_height}")
    ratio = source_width / source_height
    if ratio < 0.45 or ratio > 3.2:
        raise ValueError(f"IMAGE_TOO_LOW_QUALITY:extreme-aspect-ratio:{ratio:.3f}")
    target.parent.mkdir(parents=True, exist_ok=True)
    best_bytes = None
    best_dimensions = None
    for maximum_dimension in (1600, 1400, 1200, 1000, 800, 640):
        candidate = image.copy()
        candidate.thumbnail((maximum_dimension, maximum_dimension), Image.Resampling.LANCZOS)
        if min(candidate.size) < 360:
            continue
        for quality in (82, 78, 74, 70, 66, 62):
            size = save_candidate(candidate, target, quality)
            best_bytes = size
            best_dimensions = candidate.size
            if size <= TARGET_BYTES:
                return {
                    "status": "PASS",
                    "width": candidate.width,
                    "height": candidate.height,
                    "bytes": size,
                    "format": "webp",
                    "quality": quality,
                    "sourceWidth": source_width,
                    "sourceHeight": source_height,
                    "sourceHash": sha256(source),
                    "processedHash": sha256(target),
                    "perceptualHash": dhash64(candidate),
                }
    if best_bytes is None or best_dimensions is None:
        raise ValueError("IMAGE_TOO_LOW_QUALITY:no-usable-output-dimensions")
    if best_bytes > MAX_BYTES:
        raise ValueError(f"SIZE_QUALITY_CONFLICT:processed-bytes:{best_bytes}")
    return {
        "status": "PASS",
        "width": best_dimensions[0],
        "height": best_dimensions[1],
        "bytes": best_bytes,
        "format": "webp",
        "quality": 62,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "sourceHash": sha256(source),
        "processedHash": sha256(target),
        "perceptualHash": dhash64(image),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    source = Path(args.source).resolve()
    target = Path(args.target).resolve()
    try:
        result = process(source, target)
        print(json.dumps(result, sort_keys=True))
    except Exception as error:
        if target.exists():
            target.unlink()
        message = str(error)
        reason_code, _, detail = message.partition(":")
        print(json.dumps({"status": "FAIL", "reasonCode": reason_code or "IMAGE_TOO_LOW_QUALITY", "reasonDetail": detail or message}, sort_keys=True))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
