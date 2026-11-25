import os
import sys
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("FLOWSTUDIO_URL", "https://flow-studio-pwa.vercel.app")
SHOT_DIR = os.environ.get("FLOWSTUDIO_SHOT_DIR", "")


def check_no_horizontal_overflow(page, label):
    metrics = page.evaluate(
        "() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })"
    )
    assert metrics["sw"] <= metrics["iw"] + 2, (
        f"[{label}] Horizontal overflow detected: scrollWidth={metrics['sw']} > innerWidth={metrics['iw']}"
    )


def run_desktop_e2e(playwright):
    console_errors = []
    page_errors = []

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        permissions=["clipboard-read", "clipboard-write"],
    )
    page = context.new_page()
    page.on(
        "console",
        lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
    )
    page.on("pageerror", lambda err: page_errors.append(str(err)))

    print(f"[Desktop 1440x900] 1/7 Loading {BASE_URL} ...")
    page.goto(BASE_URL, wait_until="networkidle")
    page.get_by_test_id("flow-top-bar").wait_for(timeout=15_000)
    page.get_by_test_id("nav-studio-btn").wait_for(timeout=10_000)
    page.get_by_test_id("nav-director-btn").wait_for(timeout=10_000)
    check_no_horizontal_overflow(page, "Desktop Studio initial")

    print("[Desktop 1440x900] 2/7 Verifying existing Studio modals (Bible, Script Import, 3-Tab GPU Engine) ...")
    page.get_by_test_id("open-bible-btn").click()
    page.get_by_text("@MIRA", exact=True).first.wait_for(timeout=8_000)
    page.get_by_text("@LOC-D", exact=True).first.wait_for(timeout=8_000)
    page.keyboard.press("Escape")
    # Fallback close if Bible drawer doesn't close on Escape
    close_btn = page.locator("button:has(svg.lucide-x)").first
    if close_btn.is_visible():
        close_btn.click()

    page.get_by_test_id("open-script-import-btn").click()
    page.get_by_test_id("load-example-script-btn").wait_for(timeout=8_000)
    page.get_by_test_id("load-example-script-btn").click()
    page.get_by_text("Parsed 3 Shots Ready to Queue").wait_for(timeout=8_000)
    page.get_by_role("button", name="Cancel").click()

    page.get_by_test_id("open-engine-btn").click()
    page.get_by_test_id("select-engine-free").wait_for(timeout=8_000)
    page.get_by_test_id("select-engine-colab").wait_for(timeout=8_000)
    page.get_by_test_id("toggle-paid-apis-btn").click()
    page.get_by_test_id("select-engine-omni").wait_for(timeout=8_000)
    page.get_by_test_id("select-engine-seedance").wait_for(timeout=8_000)
    page.keyboard.press("Escape")

    print("[Desktop 1440x900] 3/7 Verifying existing Studio live $0 still generation ...")
    composer = page.get_by_test_id("composer-prompt-input")
    composer.fill("Medium close-up of @MIRA sketching inside @LOC-D, warm tungsten lamp, 35mm film")
    page.get_by_test_id("composer-submit-btn").click()
    studio_card = page.locator('[data-shot-label="S01"]').first
    studio_card.wait_for(timeout=15_000)
    studio_img = studio_card.locator("img").first
    studio_img.wait_for(state="visible", timeout=60_000)
    dims = studio_img.evaluate("el => ({ w: el.naturalWidth, h: el.naturalHeight })")
    assert dims["w"] >= 256 and dims["h"] >= 256, f"Studio still failed to render: {dims}"
    print(f"    Studio still S01 rendered cleanly: {dims['w']}x{dims['h']}")

    print("[Desktop 1440x900] 4/7 Opening Director v5 tab & verifying STEP 0 (9 canonical choices) ...")
    page.get_by_test_id("nav-director-btn").click()
    page.get_by_test_id("director-v5-view").wait_for(timeout=10_000)
    page.get_by_test_id("director-option-1").wait_for(timeout=15_000)
    page.get_by_test_id("director-option-4").wait_for(timeout=10_000)
    page.get_by_test_id("director-option-9").wait_for(timeout=10_000)
    check_no_horizontal_overflow(page, "Desktop Director STEP 0")

    print("[Desktop 1440x900] 5/7 Running Express Walk -> O-16 BUILD -> Queue A -> 1-click Copy & Generate in Studio ...")
    page.get_by_test_id("director-option-4").click()
    page.get_by_text("Awaiting Source Material").first.wait_for(timeout=20_000)
    page.get_by_test_id("director-option-1").click()
    page.get_by_text("O-16 FINAL GATE: BUILD").first.wait_for(timeout=35_000)

    # Click 1) ★ BUILD
    page.get_by_test_id("director-option-1").click()
    page.get_by_text("CHECKS: 78/78 PASS").first.wait_for(timeout=35_000)

    # Verify Copy for Google Flow + 1-click Generate in Studio
    copy_btn = page.get_by_test_id("director-copy-flow-btn").first
    copy_btn.wait_for(timeout=10_000)
    copy_btn.click()
    page.get_by_text("Copied for Flow").first.wait_for(timeout=5_000)

    gen_btn = page.get_by_test_id("director-generate-studio-btn").first
    gen_btn.click()

    # Wait for background Studio render + automatic binding into Director Asset Inventory Ledger!
    page.get_by_text("Auto-Bound to Ledger").first.wait_for(timeout=65_000)
    print("    1-click 'Generate in Studio' completed & auto-bound into Director Asset Inventory Ledger!")

    if SHOT_DIR:
        page.screenshot(path=os.path.join(SHOT_DIR, "desktop_director_build.png"), full_page=False)

    print("[Desktop 1440x900] 6/7 Advancing to Shot S1 & verifying Quartet + Queue B + 12-Cell Acceptance Card ...")
    page.get_by_test_id("director-option-2").click()
    page.get_by_test_id("director-acceptance-card").first.wait_for(timeout=35_000)
    page.get_by_test_id("director-prompt-block-queue_b_video").first.wait_for(timeout=10_000)
    check_no_horizontal_overflow(page, "Desktop Director Shot S1")

    if SHOT_DIR:
        page.screenshot(path=os.path.join(SHOT_DIR, "desktop_director_shot1.png"), full_page=False)

    print("[Desktop 1440x900] 7/7 Verifying IndexedDB Vault persistence across full page reload ...")
    page.reload(wait_until="networkidle")
    page.get_by_test_id("nav-director-btn").click()
    page.get_by_test_id("director-v5-view").wait_for(timeout=10_000)
    page.get_by_test_id("director-acceptance-card").first.wait_for(timeout=10_000)
    # Confirm Studio still S01 + Director still S02 are both persisted
    page.get_by_test_id("nav-studio-btn").click()
    page.locator('[data-shot-label="S01"] img').first.wait_for(state="visible", timeout=10_000)
    page.locator('[data-shot-label="S02"] img').first.wait_for(state="visible", timeout=10_000)
    print("    Both Studio S01 & Director-dispatched S02 hydrated from IndexedDB after reload!")

    browser.close()
    assert not page_errors, f"[Desktop] Uncaught page errors: {page_errors}"
    assert not console_errors, f"[Desktop] Console errors: {console_errors}"
    print("[PASS] Desktop (1440x900) E2E passed with 0 console errors & 0 page errors!")


def run_mobile_e2e(playwright):
    console_errors = []
    page_errors = []

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    page = context.new_page()
    page.on(
        "console",
        lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
    )
    page.on("pageerror", lambda err: page_errors.append(str(err)))

    print(f"[Mobile 390x844] 1/4 Loading {BASE_URL} ...")
    page.goto(BASE_URL, wait_until="networkidle")
    page.get_by_test_id("mobile-view-strip").wait_for(timeout=15_000)
    check_no_horizontal_overflow(page, "Mobile Studio initial")

    print("[Mobile 390x844] 2/4 Tapping mobile Director v5 switcher & checking STEP 0 layout ...")
    page.get_by_test_id("mobile-nav-director-btn").click()
    page.get_by_test_id("director-v5-view").wait_for(timeout=10_000)
    page.get_by_test_id("director-option-4").wait_for(timeout=15_000)
    check_no_horizontal_overflow(page, "Mobile Director STEP 0")

    print("[Mobile 390x844] 3/4 Running Express Walk -> BUILD on mobile & checking zero overflow ...")
    page.get_by_test_id("director-option-4").click()
    page.get_by_text("Awaiting Source Material").first.wait_for(timeout=20_000)
    page.get_by_test_id("director-option-1").click()
    page.get_by_text("O-16 FINAL GATE: BUILD").first.wait_for(timeout=35_000)
    page.get_by_test_id("director-option-1").click()
    page.get_by_test_id("director-generate-studio-btn").first.wait_for(timeout=35_000)
    page.get_by_test_id("director-copy-flow-btn").first.wait_for(timeout=8_000)
    check_no_horizontal_overflow(page, "Mobile Director BUILD")

    if SHOT_DIR:
        page.screenshot(path=os.path.join(SHOT_DIR, "mobile_director_build.png"), full_page=False)

    print("[Mobile 390x844] 4/4 Opening Mobile Asset Inventory Ledger drawer & switching back to Studio ...")
    page.get_by_test_id("mobile-ledger-toggle-btn").click()
    page.locator('[data-testid="director-ledger-list"]:visible').first.wait_for(timeout=8_000)
    page.locator('button[aria-label="Close ledger drawer"]:visible').first.click()
    page.get_by_test_id("mobile-nav-studio-btn").click()
    page.get_by_test_id("flow-main-canvas").wait_for(timeout=8_000)
    check_no_horizontal_overflow(page, "Mobile Studio return")

    browser.close()
    assert not page_errors, f"[Mobile] Uncaught page errors: {page_errors}"
    assert not console_errors, f"[Mobile] Console errors: {console_errors}"
    print("[PASS] Mobile (390x844) E2E passed with 0 console errors, 0 page errors & 0 overflow!")


def main():
    if SHOT_DIR:
        os.makedirs(SHOT_DIR, exist_ok=True)
    with sync_playwright() as p:
        run_desktop_e2e(p)
        run_mobile_e2e(p)
    print("ALL_DIRECTOR_V5_LIVE_E2E_PASSED")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"E2E_FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
