import os
import sys
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("FLOWSTUDIO_URL", "https://flow-studio-pwa.vercel.app")
SHOT_DIR = os.environ.get("FLOWSTUDIO_SHOT_DIR", "")

CUSTOM_SCRIPT = """INT. CEBU BAKERY - DAWN
CARLO (35, tired baker in flour-dusted maroon apron) slams a metal tray of hot pandesal onto the stainless counter.
ELENA (32, sharp-eyed sister in yellow blouse) holds an eviction notice.
ELENA: "Three days, Carlo. That is all the landlord gave us."
CARLO: "Then we bake double tonight." """


def check_no_horizontal_overflow(page, label):
    metrics = page.evaluate(
        "() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })"
    )
    assert metrics["sw"] <= metrics["iw"] + 2, (
        f"[{label}] Horizontal overflow: scrollWidth={metrics['sw']} > innerWidth={metrics['iw']}"
    )


def check_no_composer_overlap(page, label):
    # Ensure the scrollable feed never renders underneath the footer composer
    overlap = page.evaluate(
        """() => {
          const feed = document.querySelector('[data-testid="director-message-feed"]');
          const footer = document.querySelector('[data-testid="director-composer-footer"]');
          if (!feed || !footer) return null;
          const fr = feed.getBoundingClientRect();
          const cr = footer.getBoundingClientRect();
          return { feedBottom: fr.bottom, footerTop: cr.top };
        }"""
    )
    if overlap:
        assert overlap["feedBottom"] <= overlap["footerTop"] + 2, (
            f"[{label}] Feed overlaps footer composer: {overlap}"
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

    print(f"[Desktop 1440x900] 1/9 Loading {BASE_URL} ...")
    page.goto(BASE_URL, wait_until="networkidle")
    page.get_by_test_id("flow-top-bar").wait_for(timeout=15_000)
    page.get_by_test_id("nav-studio-btn").wait_for(timeout=10_000)
    page.get_by_test_id("nav-director-btn").wait_for(timeout=10_000)
    check_no_horizontal_overflow(page, "Desktop Studio initial")

    print("[Desktop 1440x900] 2/9 Verifying Studio Bible, Script Import, and 3-Tab GPU Engine ...")
    page.get_by_test_id("open-bible-btn").click()
    page.get_by_text("@MIRA", exact=True).first.wait_for(timeout=8_000)
    page.keyboard.press("Escape")

    page.get_by_test_id("open-script-import-btn").click()
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

    print("[Desktop 1440x900] 3/9 Rendering live $0 Studio Still (S01) + verifying Lightbox & Storyboard Cut ...")
    composer = page.get_by_test_id("composer-prompt-input")
    composer.fill("Medium close-up of @MIRA sketching inside @LOC-D, warm tungsten lamp, 35mm film")
    page.get_by_test_id("composer-submit-btn").click()
    studio_card = page.locator('[data-shot-label="S01"]').first
    studio_card.wait_for(timeout=15_000)
    studio_img = studio_card.locator("img").first
    studio_img.wait_for(state="visible", timeout=65_000)
    dims = studio_img.evaluate("el => ({ w: el.naturalWidth, h: el.naturalHeight })")
    assert dims["w"] >= 256 and dims["h"] >= 256, f"Studio still failed: {dims}"
    print(f"    Studio still S01 rendered cleanly: {dims['w']}x{dims['h']}")

    # Open Lightbox & verify 4K Export + Director Turn panel
    studio_img.click()
    page.get_by_test_id("upscale-4k-btn").wait_for(timeout=6_000)
    page.get_by_test_id("director-turn-panel").wait_for(timeout=6_000)
    page.keyboard.press("Escape")

    # Add to Storyboard Cut
    studio_card.get_by_role("button", name="Cut").click()
    page.get_by_text("Storyboard Cut").first.wait_for(timeout=6_000)

    print("[Desktop 1440x900] 4/9 Rendering REAL $0 Zero-Token AI Video (T2V S02) in Studio ...")
    page.get_by_test_id("mode-tab-t2v").click()
    composer.fill("Slow cinematic dolly-in on neon rain falling on a wet Manila window at night, 35mm film")
    page.get_by_test_id("composer-submit-btn").click()
    vid_card = page.locator('[data-shot-label="S02"]').first
    vid_card.wait_for(timeout=15_000)
    vid_el = vid_card.locator("video").first
    vid_el.wait_for(state="visible", timeout=90_000)
    vsrc = vid_el.get_attribute("src") or ""
    assert vsrc.startswith("blob:"), f"Expected real IndexedDB video blob URL, got: {vsrc}"
    print("    REAL AI Video S02 rendered & cached in IndexedDB Vault with ZERO HF token!")

    print("[Desktop 1440x900] 5/9 Opening Director v5 & pasting REAL CUSTOM SCREENPLAY (CARLO & ELENA @ CEBU BAKERY) ...")
    page.get_by_test_id("nav-director-btn").click()
    page.get_by_test_id("director-v5-view").wait_for(timeout=10_000)
    page.get_by_test_id("director-option-9").wait_for(timeout=15_000)
    check_no_composer_overlap(page, "Desktop Director STEP 0")

    page.get_by_test_id("director-chat-input").fill(CUSTOM_SCRIPT)
    page.get_by_test_id("director-send-btn").click()
    page.get_by_text("O-1a GENRE CONFIRM GATE").first.wait_for(timeout=35_000)
    latest_text = page.get_by_test_id("director-latest-turn").inner_text()
    assert "CARLO" in latest_text.upper() and "ELENA" in latest_text.upper(), (
        f"Custom script characters lost: {latest_text[:400]}"
    )
    assert "CEBU BAKERY" in latest_text.upper(), f"Custom location lost: {latest_text[:400]}"
    assert "MIRA" not in latest_text.upper(), f"Starter @MIRA leaked into custom script!"
    print("    Custom screenplay parsed cleanly: @CARLO, @ELENA, Cebu Bakery (0 @MIRA leakage)!")

    print("[Desktop 1440x900] 6/9 Express Fast-Track -> O-16 BUILD -> Queue A (carlo_w1_sheet.jpg) -> Copy & Generate ...")
    page.get_by_test_id("director-option-2").click()  # EXPRESS: FAST-TRACK ALL
    page.get_by_text("O-16 FINAL GATE: BUILD").first.wait_for(timeout=35_000)
    page.get_by_test_id("director-option-1").click()  # 1) ★ BUILD
    page.get_by_text("CHECKS: 78/78 PASS").first.wait_for(timeout=35_000)
    build_text = page.get_by_test_id("director-latest-turn").inner_text()
    assert "Three days, Carlo. That is all the landlord gave us." in build_text, "Verbatim ELENA dialogue lost!"
    assert "carlo_w1_sheet.jpg" in build_text, "Expected carlo_w1_sheet.jpg Queue A card!"
    check_no_composer_overlap(page, "Desktop Director BUILD")

    page.get_by_test_id("director-copy-flow-btn").first.click()
    page.get_by_text("Copied for Flow").first.wait_for(timeout=5_000)
    page.get_by_test_id("director-generate-studio-btn").first.click()
    page.get_by_text("Auto-Bound to Ledger").first.wait_for(timeout=75_000)
    print("    Queue A carlo_w1_sheet.jpg rendered & auto-bound into Asset Inventory Ledger!")

    if SHOT_DIR:
        page.screenshot(path=os.path.join(SHOT_DIR, "desktop_molecular_build.png"), full_page=False)

    print("[Desktop 1440x900] 7/9 Advancing to Shot S1 & rendering 4x Frame Quartet + Picking Winner ...")
    page.get_by_test_id("director-option-2").click()  # Skip to Shot S1
    page.get_by_test_id("director-acceptance-card").first.wait_for(timeout=35_000)
    page.get_by_test_id("director-prompt-block-queue_b_video").first.wait_for(timeout=10_000)
    page.get_by_test_id("director-generate-quartet4-btn").first.click()
    page.get_by_test_id("director-quartet-gallery").first.wait_for(timeout=10_000)
    # Wait for all 4 Quartet candidates A/B/C/D to render via our 4-pool $0 cascade!
    for letter in ["A", "B", "C", "D"]:
        page.get_by_test_id(f"quartet-pick-{letter}").first.wait_for(timeout=110_000)
    print("    ALL 4 Frame Quartet candidates (A, B, C, D) rendered cleanly!")
    page.get_by_test_id("quartet-pick-B").first.click()
    page.get_by_text("Locked B").first.wait_for(timeout=8_000)
    check_no_composer_overlap(page, "Desktop Director Shot S1 Quartet")

    if SHOT_DIR:
        page.screenshot(path=os.path.join(SHOT_DIR, "desktop_molecular_quartet.png"), full_page=False)

    print("[Desktop 1440x900] 8/9 Verifying Inline Free Gemini 2.5 Key Setup Toggle ...")
    page.get_by_test_id("director-gemini-toggle-btn").click()
    page.get_by_role("button", name="Save Key").wait_for(timeout=5_000)
    page.get_by_test_id("director-gemini-toggle-btn").click()

    print("[Desktop 1440x900] 9/9 Verifying IndexedDB Persistence Across Full Reload ...")
    page.reload(wait_until="networkidle")
    page.get_by_test_id("nav-director-btn").click()
    page.get_by_test_id("director-quartet-gallery").first.wait_for(timeout=10_000)
    page.get_by_test_id("nav-studio-btn").click()
    page.locator('[data-shot-label="S01"] img').first.wait_for(state="visible", timeout=10_000)
    page.locator('[data-shot-label="S02"] video').first.wait_for(state="visible", timeout=10_000)
    print("    Studio still S01, real AI video S02, Director session & 4x Quartet persisted across reload!")

    browser.close()
    assert not page_errors, f"[Desktop] Uncaught page errors: {page_errors}"
    assert not console_errors, f"[Desktop] Console errors: {console_errors}"
    print("[PASS] Desktop (1440x900) Molecular E2E PASSED with 0 console errors & 0 page errors!")


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

    print("[Mobile 390x844] 2/4 Opening Director v5 & pasting custom script on mobile ...")
    page.get_by_test_id("mobile-nav-director-btn").click()
    page.get_by_test_id("director-v5-view").wait_for(timeout=10_000)
    page.get_by_test_id("director-option-4").wait_for(timeout=15_000)
    check_no_horizontal_overflow(page, "Mobile Director STEP 0")
    check_no_composer_overlap(page, "Mobile Director STEP 0")

    print("[Mobile 390x844] 3/4 Running custom script -> Express -> BUILD on mobile ...")
    page.get_by_test_id("director-chat-input").fill(CUSTOM_SCRIPT)
    page.get_by_test_id("director-send-btn").click()
    page.get_by_text("O-1a GENRE CONFIRM GATE").first.wait_for(timeout=35_000)
    page.get_by_test_id("director-option-2").click()
    page.get_by_text("O-16 FINAL GATE: BUILD").first.wait_for(timeout=35_000)
    page.get_by_test_id("director-option-1").click()
    page.get_by_test_id("director-generate-studio-btn").first.wait_for(timeout=35_000)
    check_no_horizontal_overflow(page, "Mobile Director BUILD")
    check_no_composer_overlap(page, "Mobile Director BUILD")

    if SHOT_DIR:
        page.screenshot(path=os.path.join(SHOT_DIR, "mobile_molecular_build.png"), full_page=False)

    print("[Mobile 390x844] 4/4 Opening Mobile Asset Inventory Ledger drawer & returning to Studio ...")
    page.get_by_test_id("mobile-ledger-toggle-btn").click()
    page.locator('[data-testid="director-ledger-list"]:visible').first.wait_for(timeout=8_000)
    page.locator('button[aria-label="Close ledger drawer"]:visible').first.click()
    page.get_by_test_id("mobile-nav-studio-btn").click()
    page.get_by_test_id("flow-main-canvas").wait_for(timeout=8_000)
    check_no_horizontal_overflow(page, "Mobile Studio return")

    browser.close()
    assert not page_errors, f"[Mobile] Uncaught page errors: {page_errors}"
    assert not console_errors, f"[Mobile] Console errors: {console_errors}"
    print("[PASS] Mobile (390x844) Molecular E2E PASSED with 0 console errors, 0 page errors & 0 overlap!")


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
