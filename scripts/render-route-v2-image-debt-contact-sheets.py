import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


COLS = 4
ROWS = 5
CELL_WIDTH = 300
CELL_HEIGHT = 230
IMAGE_WIDTH = 280
IMAGE_HEIGHT = 165
PAGE_SIZE = COLS * ROWS


def load_font(size: int):
    candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--round", choices=["all", "multi-source-recovery"], default="all")
    parser.add_argument("--retry-only", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    provenance = json.loads((root / "data/route-v2/images/image-debt-elimination-provenance.json").read_text(encoding="utf-8"))
    assets = sorted(provenance.get("assets", []), key=lambda item: (item["countryCode"], item["entityType"], item["canonicalNameEn"], item["entityId"]))
    if args.round != "all":
        assets = [item for item in assets if item.get("acquisitionRound") == args.round]
    if args.retry_only:
        results = json.loads((root / "data/route-v2/images/image-debt-recovery-results.json").read_text(encoding="utf-8"))
        retry_qids = {item["qid"] for item in results.get("records", []) if item.get("visualRejections")}
        assets = [item for item in assets if item.get("wikidataId") in retry_qids]
    font = load_font(14)
    small = load_font(11)
    index = []
    for page_index in range(math.ceil(len(assets) / PAGE_SIZE)):
        page_assets = assets[page_index * PAGE_SIZE:(page_index + 1) * PAGE_SIZE]
        sheet = Image.new("RGB", (COLS * CELL_WIDTH, ROWS * CELL_HEIGHT), "#f4f3ef")
        draw = ImageDraw.Draw(sheet)
        page_rows = []
        for cell_index, asset in enumerate(page_assets):
            x = (cell_index % COLS) * CELL_WIDTH
            y = (cell_index // COLS) * CELL_HEIGHT
            image_path = root / asset["assetPath"]
            with Image.open(image_path) as opened:
                preview = ImageOps.fit(ImageOps.exif_transpose(opened).convert("RGB"), (IMAGE_WIDTH, IMAGE_HEIGHT), method=Image.Resampling.LANCZOS)
            sheet.paste(preview, (x + 10, y + 8))
            draw.text((x + 10, y + 178), f"{asset['countryCode']} · {asset['entityType']} · {asset['wikidataId']}", fill="#111", font=small)
            label = asset["canonicalNameEn"][:38]
            draw.text((x + 10, y + 195), label, fill="#111", font=font)
            draw.text((x + 10, y + 214), f"#{page_index + 1:02d}-{cell_index + 1:02d}", fill="#555", font=small)
            page_rows.append({"slot": cell_index + 1, "entityId": asset["entityId"], "qid": asset["wikidataId"], "name": asset["canonicalNameEn"], "path": asset["assetPath"]})
        filename = f"image-debt-contact-sheet-{page_index + 1:02d}.jpg"
        sheet.save(output / filename, "JPEG", quality=88, optimize=True)
        index.append({"page": page_index + 1, "file": filename, "records": page_rows})
    (output / "index.json").write_text(json.dumps({"pages": len(index), "assets": len(assets), "index": index}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "assets": len(assets), "pages": len(index), "output": str(output)}, indent=2))


if __name__ == "__main__":
    main()
