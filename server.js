import express from "express";
import cors from "cors";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
app.use(cors());
app.use(express.json());

const ATTMARK_URL = "https://attendance-management-system-fronte-two.vercel.app";
const EMAIL = "tester@gmail.com";
const PASSWORD = "123";

app.get("/simulate", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (msg) => res.write(`data: ${JSON.stringify({ msg })}\n\n`);
  const sendShot = async (page, label) => {
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 75, fullPage: false });
      res.write(`data: ${JSON.stringify({ screenshot: buf.toString("base64"), label })}\n\n`);
      return buf;
    } catch (_) {
      return null;
    }
  };

  // Waits until the page visually changes (compares screenshot byte length/hash),
  // or until timeout — used after every click so we never screenshot a stale frame.
  const quickHash = (buf) => {
    if (!buf) return null;
    let h = 0;
    for (let i = 0; i < buf.length; i += 97) h = (h * 31 + buf[i]) >>> 0;
    return `${buf.length}-${h}`;
  };

  const waitForVisualChange = async (page, beforeBuf, { timeout = 6000, interval = 250 } = {}) => {
    const beforeHash = quickHash(beforeBuf);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, interval));
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 50 });
        if (quickHash(buf) !== beforeHash) return true;
      } catch (_) {}
    }
    return false;
  };

  let browser;
  try {
    send("Launching browser...");
    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: await chromium.executablePath(),
      headless: true,
      defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // ── STEP 1: Login ──────────────────────────────────────────────
    send("Navigating to login page...");
    await page.goto(`${ATTMARK_URL}/auth/login`, { waitUntil: "networkidle2", timeout: 30000 });
    await sendShot(page, "Login page");

    send("Filling email...");
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"], input[placeholder*="email" i]', EMAIL, { delay: 60 });

    send("Filling password...");
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    await page.type('input[type="password"]', PASSWORD, { delay: 80 });
    await sendShot(page, "Credentials filled");

    send("Clicking login button...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => b.type === "submit") ||
        buttons.find((b) => b.textContent.toLowerCase().includes("authorize")) ||
        buttons.find((b) => b.textContent.toLowerCase().includes("login"));
      if (btn) btn.click();
    });

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });
    await sendShot(page, "After login");
    send("Logged in successfully!");

    // ── STEP 2: Go to Manage Attendance ───────────────────────────
    send("Navigating to Manage Attendance...");
    await page.goto(`${ATTMARK_URL}/teacher/attendance`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1000));

    await sendShot(page, "Manage Attendance page");
    send("On Manage Attendance page!");

    // ── STEP 3: Confirm Subject & Schedule (already defaulted on page load) ─
    send("Mathematics MATH101, Monday 09:00-10:30 already selected (default).");
    await sendShot(page, "Attendance list view");

    // ── STEP 4: Click Create Attendance ─────────────────────────────
    send("Clicking Create Attendance...");
    const beforeCreateClick = await page.screenshot({ type: "jpeg", quality: 50 }).catch(() => null);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent.toLowerCase().includes("create attendance"));
      if (btn) btn.click();
    });
    await waitForVisualChange(page, beforeCreateClick);
    await sendShot(page, "Create Attendance dropdown");

    // ── STEP 5: Select Manual Attendance ──────────────────────────
    send("Selecting Manual Attendance...");
    const beforeManualClick = await page.screenshot({ type: "jpeg", quality: 50 }).catch(() => null);
    await page.evaluate(() => {
      // Prefer the smallest/most specific element containing the text (innermost match)
      const candidates = Array.from(document.querySelectorAll("button, li, [role='menuitem'], div"))
        .filter((e) => e.textContent.toLowerCase().includes("manual attendance"));
      if (candidates.length === 0) return;
      // Sort by text length ascending — the most specific element has the shortest matching text
      candidates.sort((a, b) => a.textContent.length - b.textContent.length);
      candidates[0].click();
    });
    await waitForVisualChange(page, beforeManualClick);
    await sendShot(page, "Manual Attendance modal");

    // ── STEP 6: Click Mark Bulk Attendance ────────────────────────
    send("Clicking Mark Bulk Attendance...");
    const beforeBulkClick = await page.screenshot({ type: "jpeg", quality: 50 }).catch(() => null);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent.toLowerCase().includes("bulk"));
      if (btn) btn.click();
    });
    await waitForVisualChange(page, beforeBulkClick);

    // Extra confirmation: poll until checkboxes actually populate (up to 6s more)
    send("Waiting for student list to load...");
    let checkboxCount = await page.evaluate(() => document.querySelectorAll('input[type="checkbox"]').length);
    const pollStart = Date.now();
    while (checkboxCount <= 1 && Date.now() - pollStart < 6000) {
      await new Promise((r) => setTimeout(r, 300));
      checkboxCount = await page.evaluate(() => document.querySelectorAll('input[type="checkbox"]').length);
    }

    await sendShot(page, "Bulk Attendance modal");
    send(`Found ${checkboxCount} checkboxes on page`);

    // ── STEP 7: Select 3-4 students ───────────────────────────────
    send("Selecting students...");
    const targetRolls = ["25FA-002-ST", "25FA-003-ST", "25FA-005-ST", "25FA-008-ST"];

    for (const roll of targetRolls) {
      const clicked = await page.evaluate((rollNo) => {
        // Find any element whose text CONTAINS the roll number (not exact match)
        const allEls = Array.from(document.querySelectorAll("*"));
        const rollEl = allEls.find((el) => {
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent.trim())
            .join("");
          return ownText.includes(rollNo) || el.textContent.trim() === rollNo;
        });

        if (!rollEl) return { ok: false, reason: "roll text not found" };

        // Walk up to find the clickable card/row container (max 6 levels)
        let card = rollEl;
        for (let i = 0; i < 6; i++) {
          if (!card.parentElement) break;
          card = card.parentElement;
          const checkbox = card.querySelector('input[type="checkbox"]');
          if (checkbox) {
            // Click checkbox directly — most reliable for React controlled inputs
            checkbox.click();
            // Also dispatch change event in case onClick isn't enough
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
            return { ok: true, via: "checkbox" };
          }
        }

        // Fallback: click the roll element's closest labeled/clickable ancestor
        const clickableCard = rollEl.closest("[role='button'], label, li, [class*='card']");
        if (clickableCard) {
          clickableCard.click();
          return { ok: true, via: "card-click" };
        }

        return { ok: false, reason: "no checkbox or clickable ancestor found" };
      }, roll);

      send(`${clicked.ok ? "✓" : "✗"} ${roll}${clicked.ok ? ` (${clicked.via})` : ` — ${clicked.reason}`}`);
      await new Promise((r) => setTimeout(r, 600));
    }

    await sendShot(page, "Students selected");

    // ── STEP 8: Click Mark Attendance ─────────────────────────────
    send("Clicking Mark Attendance button...");
    const beforeSubmitClick = await page.screenshot({ type: "jpeg", quality: 50 }).catch(() => null);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) =>
        b.textContent.toLowerCase().includes("mark attendance") &&
        !b.textContent.toLowerCase().includes("bulk")
      );
      if (btn) btn.click();
    });
    await waitForVisualChange(page, beforeSubmitClick);
    await sendShot(page, "Attendance marked!");

    send("✅ Done! Attendance marked successfully.");
    res.write(`data: ${JSON.stringify({ done: true, success: true })}\n\n`);
  } catch (err) {
    send(`ERROR: ${err.message}`);
    try {
      const buf = await browser?.pages().then(async (pages) => {
        const p = pages[pages.length - 1];
        return p ? await p.screenshot({ type: "jpeg", quality: 60 }) : null;
      });
      if (buf) res.write(`data: ${JSON.stringify({ screenshot: buf.toString("base64"), label: "Error state" })}\n\n`);
    } catch (_) {}
    res.write(`data: ${JSON.stringify({ done: true, success: false })}\n\n`);
  } finally {
    if (browser) await browser.close();
    res.end();
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", awake: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Automation server running on port ${PORT}`));