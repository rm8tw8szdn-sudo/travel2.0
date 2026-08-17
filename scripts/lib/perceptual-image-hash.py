import json
import sys

from PIL import Image, ImageOps


def dhash64(image):
    grayscale = ImageOps.exif_transpose(image).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(grayscale.getdata())
    value = 0
    for row in range(8):
        offset = row * 9
        for column in range(8):
            value = (value << 1) | int(pixels[offset + column] > pixels[offset + column + 1])
    return f"{value:016x}"


def inspect(entry):
    try:
        with Image.open(entry["path"]) as image:
            image.load()
            return {
                "key": entry["key"],
                "format": (image.format or "unknown").lower(),
                "width": image.width,
                "height": image.height,
                "mode": image.mode,
                "dhash64": dhash64(image),
                "error": None,
            }
    except Exception as error:  # Pillow exposes format-specific subclasses; all are audit failures.
        return {
            "key": entry.get("key"),
            "format": None,
            "width": None,
            "height": None,
            "mode": None,
            "dhash64": None,
            "error": f"{type(error).__name__}: {error}",
        }


def main():
    payload = json.load(sys.stdin)
    json.dump([inspect(entry) for entry in payload], sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
