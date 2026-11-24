import os
import sys
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("FLOWSTUDIO_URL", "http://localhost:5175")
SCREENSHOT_PATH = os.environ.get("FLOWSTUDIO_SCREENSHOT", "")


def main():
    console_errors = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        print(f"[1/6] Loading {BASE_URL} ...")
        page.goto(BASE_URL, wait_until="networkidle")
        assert "Cabardo" in page.title(), f"Unexpected title: {page.title()}"
        page.get_by_text("Cabardo Studio AI Generator").first.wait_for(timeout=10_000)

        print("[2/6] Testing Character & Location Bible (@TAG Vault) ...")
        page.get_by_test_id("open-bible-btn").click()
        page.get_by_text("@MIRA", exact=True).first.wait_for(timeout=5_000)
        page.get_by_text("@LOC-D", exact=True).first.wait_for(timeout=5_000)
        page.get_by_test_id("bible-tag-input").fill("testhero")
        page.get_by_test_id("bible-title-input").fill("Test Hero")
        page.get_by_test_id("bible-descriptor-input").fill(
            "cyberpunk detective in neon rain trenchcoat, 35mm film"
        )
        page.get_by_test_id("bible-save-btn").click()
        page.get_by_text("@TESTHERO", exact=True).first.wait_for(timeout=5_000)
        # Click close button inside drawer
        page.locator("button:has(svg.lucide-x)").first.click()

        print("[3/6] Testing Bulk Script / Shot-List Importer ...")
        page.get_by_test_id("open-script-import-btn").click()
        page.get_by_test_id("load-example-script-btn").click()
        page.get_by_text("Parsed 3 Shots Ready to Queue").wait_for(timeout=5_000)
        page.get_by_role("button", name="Cancel").click()

        print("[4/6] Testing 4-Engine Settings (Free Cloud + Colab T4 + Gemini Omni 1.2 + Seedance 2.5) ...")
        page.get_by_test_id("open-engine-btn").click()
        page.get_by_test_id("select-engine-free").wait_for(timeout=5_000)
        page.get_by_test_id("select-engine-colab").wait_for(timeout=5_000)
        page.get_by_test_id("select-engine-omni").wait_for(timeout=5_000)
        page.get_by_test_id("select-engine-seedance").wait_for(timeout=5_000)
        page.get_by_text("Engine 3: Official Google Gemini Omni 1.2 Flash").first.wait_for(timeout=5_000)
        page.get_by_text("Engine 4: Official ByteDance Seedance").first.wait_for(timeout=5_000)
        page.get_by_test_id("omni-resolution-select").wait_for(timeout=5_000)
        page.get_by_test_id("omni-apikey-input").wait_for(timeout=5_000)
        nb_href = page.get_by_role("link", name="Download Colab Notebook").get_attribute("href")
        assert nb_href == "/FlowStudio_Colab_T4_Backend.ipynb", f"Bad notebook href: {nb_href}"
        page.get_by_role("button", name="Cancel").click()

        print("[5/6] Testing Live $0 Generation + @TAG Expansion + Storyboard Cut ...")
        composer = page.get_by_test_id("composer-prompt-input")
        composer.fill("Close-up of @MIRA inside @LOC-D, warm lamp light, rain on window, 35mm cinema still")
        page.get_by_text("Bible Auto-Expanded:").first.wait_for(timeout=5_000)
        page.get_by_test_id("composer-submit-btn").click()

        shot_card = page.get_by_test_id("shot-card-S01")
        shot_card.wait_for(timeout=10_000)
        img = shot_card.locator("img").first
        img.wait_for(state="visible", timeout=55_000)
        dims = img.evaluate("el => ({ w: el.naturalWidth, h: el.naturalHeight })")
        assert dims["w"] >= 256 and dims["h"] >= 256, f"Image failed to load cleanly: {dims}"
        print(f"      Live $0 image rendered cleanly: {dims['w']}x{dims['h']}")

        # Add to Storyboard Cut (Fix #3)
        shot_card.get_by_role("button", name="Cut").click()
        page.get_by_text("Storyboard Cut").first.wait_for(timeout=5_000)
        page.get_by_role("button", name="Play Sequence").wait_for(timeout=5_000)
        page.get_by_role("button", name="Export Stitched Video").wait_for(timeout=5_000)

        if SCREENSHOT_PATH:
            page.screenshot(path=SCREENSHOT_PATH, full_page=False)
            print(f"      Saved screenshot: {SCREENSHOT_PATH}")

        print("[6/6] Testing Offline IndexedDB Vault Persistence Across Full Page Reload ...")
        page.reload(wait_until="networkidle")
        reloaded_img = page.get_by_test_id("shot-card-S01").locator("img").first
        reloaded_img.wait_for(state="visible", timeout=10_000)
        reloaded_dims = reloaded_img.evaluate("el => ({ w: el.naturalWidth, h: el.naturalHeight })")
        assert reloaded_dims["w"] >= 256, f"IndexedDB blob failed to hydrate after reload: {reloaded_dims}"
        page.get_by_text("Storyboard Cut").first.wait_for(timeout=5_000)

        browser.close()

    assert not page_errors, f"Uncaught page errors: {page_errors}"
    assert not console_errors, f"Console errors: {console_errors}"
    print("ALL_PHASE3_E2E_BROWSER_TESTS_PASSED")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"E2E_FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
