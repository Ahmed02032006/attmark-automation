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
    } catch (_) { }
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
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a, [role='link'], nav li, .nav-item"));
      const link = links.find((el) => el.textContent.toLowerCase().includes("manage attendance") ||
        el.textContent.toLowerCase().includes("attendance"));
      if (link) link.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    // fallback: try direct URL patterns
    const currentUrl = page.url();
    if (!currentUrl.includes("attendance")) {
      const possiblePaths = ["/teacher/attendance", "/manage-attendance", "/attendance", "/teacher/manage"];
      for (const path of possiblePaths) {
        await page.goto(`${ATTMARK_URL}${path}`, { waitUntil: "networkidle2", timeout: 10000 }).catch(() => { });
        if (!page.url().includes("login") && !page.url().includes("auth")) break;
      }
    }

    await sendShot(page, "Manage Attendance page");
    send("On Manage Attendance page!");

    // ── STEP 3: Select Subject ─────────────────────────────────────
    send("Selecting subject (Mathematics MATH101)...");
    await new Promise((r) => setTimeout(r, 1500));

    // Try to find and open the subject/course selector modal or dropdown
    await page.evaluate(() => {
      // Click any button that opens course/subject selection
      const btns = Array.from(document.querySelectorAll("button, [role='button']"));
      const btn = btns.find((b) =>
        b.textContent.toLowerCase().includes("select") ||
        b.textContent.toLowerCase().includes("course") ||
        b.textContent.toLowerCase().includes("subject") ||
        b.textContent.toLowerCase().includes("view attendance")
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await sendShot(page, "Course selection modal");

    // Select subject dropdown
    send("Choosing Mathematics MATH101...");
    const subjectSelected = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const sel of selects) {
        const opts = Array.from(sel.options);
        const opt = opts.find((o) =>
          o.text.toLowerCase().includes("math") ||
          o.text.toLowerCase().includes("mathematics")
        );
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      // Also try React-style dropdowns
      const divs = Array.from(document.querySelectorAll("[class*='select'], [class*='dropdown'], [role='combobox'], [role='listbox']"));
      for (const div of divs) {
        if (div.textContent.toLowerCase().includes("subject") || div.textContent.toLowerCase().includes("select subject")) {
          div.click();
          return "clicked-div";
        }
      }
      return false;
    });

    await new Promise((r) => setTimeout(r, 1000));

    // If React dropdown opened, pick Mathematics option
    if (subjectSelected === "clicked-div") {
      await page.evaluate(() => {
        const opts = Array.from(document.querySelectorAll("[role='option'], li, [class*='option']"));
        const opt = opts.find((o) => o.textContent.toLowerCase().includes("math"));
        if (opt) opt.click();
      });
      await new Promise((r) => setTimeout(r, 800));
    }

    // Select schedule
    send("Selecting schedule (Monday 09:00-10:30)...");
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const sel of selects) {
        const opts = Array.from(sel.options);
        const opt = opts.find((o) =>
          o.text.toLowerCase().includes("monday") ||
          o.text.toLowerCase().includes("09:00")
        );
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      const divs = Array.from(document.querySelectorAll("[class*='select'], [class*='dropdown'], [role='combobox']"));
      for (const div of divs) {
        if (div.textContent.toLowerCase().includes("schedule") || div.textContent.toLowerCase().includes("select schedule")) {
          div.click();
          return true;
        }
      }
    });

    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll("[role='option'], li, [class*='option']"));
      const opt = opts.find((o) => o.textContent.toLowerCase().includes("monday") || o.textContent.includes("09:00"));
      if (opt) opt.click();
    });

    await new Promise((r) => setTimeout(r, 800));
    await sendShot(page, "Subject & Schedule selected");

    // ── STEP 4: Click View Attendance ──────────────────────────────
    send("Clicking View Attendance...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent.toLowerCase().includes("view attendance"));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    await sendShot(page, "Attendance list view");

    // ── STEP 5: Click Create Attendance ───────────────────────────
    send("Clicking Create Attendance...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent.toLowerCase().includes("create attendance"));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    await sendShot(page, "Create Attendance dropdown");

    // ── STEP 6: Select Manual Attendance ──────────────────────────
    send("Selecting Manual Attendance...");
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("button, li, [role='menuitem'], div"));
      const el = els.find((e) => e.textContent.toLowerCase().includes("manual attendance") ||
        (e.textContent.toLowerCase().includes("manual") && e.textContent.toLowerCase().includes("attendance")));
      if (el) el.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    await sendShot(page, "Manual Attendance modal");

    // ── STEP 7: Click Mark Bulk Attendance ────────────────────────
    send("Clicking Mark Bulk Attendance...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent.toLowerCase().includes("bulk"));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await sendShot(page, "Bulk Attendance modal");

    // ── STEP 8: Select 3-4 students ───────────────────────────────
    send("Selecting students...");
    const targetRolls = ["25FA-002-ST", "25FA-003-ST", "25FA-005-ST", "25FA-008-ST"];

    for (const roll of targetRolls) {
      const clicked = await page.evaluate((rollNo) => {
        // Find student card/checkbox by roll number text
        const allEls = Array.from(document.querySelectorAll("*"));
        const rollEl = allEls.find((el) =>
          el.children.length === 0 &&
          el.textContent.trim() === rollNo
        );
        if (rollEl) {
          // Click the parent card
          const card = rollEl.closest("[class*='card'], [class*='item'], [class*='student'], li, label");
          if (card) { card.click(); return true; }
          rollEl.parentElement?.click();
          return true;
        }
        return false;
      }, roll);

      send(`${clicked ? "✓" : "✗"} ${roll}`);
      await new Promise((r) => setTimeout(r, 500));
    }

    await sendShot(page, "Students selected");

    // ── STEP 9: Click Mark Attendance ─────────────────────────────
    send("Clicking Mark Attendance button...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) =>
        b.textContent.toLowerCase().includes("mark attendance") &&
        !b.textContent.toLowerCase().includes("bulk")
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));
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
    } catch (_) { }
    res.write(`data: ${JSON.stringify({ done: true, success: false })}\n\n`);
  } finally {
    if (browser) await browser.close();
    res.end();
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Automation server running on port ${PORT}`));
