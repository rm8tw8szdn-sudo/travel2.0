#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def require(condition, message):
    if not condition:
        raise AssertionError(message)


detail_enrichment = read("detail-enrichment.js")
travel_state = read("travel-state.js")

for page in ["country-japan.html", "city-oslo.html"]:
    require("detail-enrichment.js" in read(page), f"{page} should load detail-enrichment.js")

for page_script in ["country-detail.js", "city-detail.js"]:
    text = read(page_script)
    require("ensureDetailData" in text, f"{page_script} should request detail enrichment")
    require("正在补全旅行灵感" in text, f"{page_script} should render enrichment loading")
    require("暂时无法补全更多信息" in text, f"{page_script} should render enrichment failure")

require("detailCache" in travel_state, "travel-state should keep DetailCache")
require("getDetailCache" in travel_state, "travel-state should expose detail cache reads")
require("setDetailCache" in travel_state, "travel-state should expose detail cache writes")
require("DetailCandidate" in detail_enrichment, "detail-enrichment should define DetailCandidate handling")
require("FieldCandidate" in detail_enrichment, "detail-enrichment should define FieldCandidate handling")
require("sourceType" in detail_enrichment, "field metadata should include sourceType")
require("completionScore" in detail_enrichment, "detail enrichment should compute completionScore")
require("verified_web" in detail_enrichment, "verified web source type should be supported")
require("generated" in detail_enrichment, "generated source type should be tracked")
require("sourceType: \"user\"" in detail_enrichment, "user source priority should be explicit")
require("DEFAULT_TRIP_COVER" in detail_enrichment, "default cover should be recognized as incomplete")
require("Day1" not in detail_enrichment and "酒店" not in detail_enrichment and "餐厅" not in detail_enrichment, "detail enrichment must not generate itinerary/hotel/restaurant content")

print("Detail enrichment static checks passed")
