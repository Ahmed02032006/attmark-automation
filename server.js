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

// Store active connections for stopping
const activeConnections = new Map();

app.get("/simulate", async (req, res) => {
  const connectionId = Date.now().toString();
  let isStopped = false;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (msg) => {
    if (!isStopped) {
      res.write(`data: ${JSON.stringify({ msg })}\n\n`);
    }
  };
  
  const sendShot = async (page, label) => {
    if (isStopped) return null;
    try {
      // Wait a bit for UI to settle before screenshot
      await new Promise((r) => setTimeout(r, 500));
      const buf = await page.screenshot({ type: "jpeg", quality: 75, fullPage: false });
      res.write(`data: ${JSON.stringify({ screenshot: buf.toString("base64"), label })}\n\n`);
      return buf;
    } catch (_) {
      return null;
    }
  };

  // Store connection for stopping
  activeConnections.set(connectionId, { res, stop: () => { isStopped = true; } });
  
  // Clean up on close
  req.on('close', () => {
    isStopped = true;
    activeConnections.delete(connectionId);
  });

  let browser;
  try {
    if (isStopped) throw new Error("STOPPED");
    
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
    if (isStopped) throw new Error("STOPPED");
    send("Navigating to login page...");
    await page.goto(`${ATTMARK_URL}/auth/login`, { waitUntil: "networkidle2", timeout: 30000 });
    await sendShot(page, "Login page");

    if (isStopped) throw new Error("STOPPED");
    send("Filling email...");
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 10000 });
    await page.type('input[type="email"], input[name="email"], input[placeholder*="email" i]', EMAIL, { delay: 60 });

    send("Filling password...");
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    await page.type('input[type="password"]', PASSWORD, { delay: 80 });
    await sendShot(page, "Credentials filled");

    if (isStopped) throw new Error("STOPPED");
    send("Clicking login button...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => b.type === "submit") ||
        buttons.find((b) => b.textContent.toLowerCase().includes("authorize")) ||
        buttons.find((b) => b.textContent.toLowerCase().includes("login"));
      if (btn) btn.click();
    });

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1000)); // Extra wait for UI to render
    await sendShot(page, "After login");
    send("Logged in successfully!");

    // ── STEP 2: Go to Manage Attendance ───────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Navigating to Manage Attendance...");
    await page.goto(`${ATTMARK_URL}/teacher/attendance`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2000)); // Wait for page to fully load

    await sendShot(page, "Manage Attendance page");
    send("On Manage Attendance page!");

    // ── STEP 3: Confirm Subject & Schedule ─────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Mathematics MATH101, Monday 09:00-10:30 already selected (default).");
    await sendShot(page, "Attendance list view");

    // ── STEP 4: Click Create Attendance ─────────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Clicking Create Attendance...");
    
    // Wait for button to be clickable
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.textContent.toLowerCase().includes("create attendance") && b.offsetParent !== null);
    }, { timeout: 5000 });
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent.toLowerCase().includes("create attendance"));
      if (btn) btn.click();
    });
    
    // Wait for dropdown to appear
    await new Promise((r) => setTimeout(r, 1000));
    await sendShot(page, "Create Attendance dropdown");

    // ── STEP 5: Select Manual Attendance ──────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Selecting Manual Attendance...");
    
    // Wait for manual attendance option to appear
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("button, li, [role='menuitem'], div"))
        .some(e => e.textContent.toLowerCase().includes("manual attendance") && e.offsetParent !== null);
    }, { timeout: 5000 });
    
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("button, li, [role='menuitem'], div"))
        .filter((e) => e.textContent.toLowerCase().includes("manual attendance"));
      if (candidates.length === 0) return;
      candidates.sort((a, b) => a.textContent.length - b.textContent.length);
      candidates[0].click();
    });
    
    // Wait for modal to appear
    await new Promise((r) => setTimeout(r, 1500));
    await sendShot(page, "Manual Attendance modal");

    // ── STEP 6: Click Mark Bulk Attendance ────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Clicking Mark Bulk Attendance...");
    
    // Wait for bulk button to appear
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.textContent.toLowerCase().includes("bulk") && b.offsetParent !== null);
    }, { timeout: 5000 });
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent.toLowerCase().includes("bulk"));
      if (btn) btn.click();
    });
    
    // Wait for student list to load
    send("Waiting for student list to load...");
    await page.waitForFunction(() => {
      return document.querySelectorAll('input[type="checkbox"]').length > 1;
    }, { timeout: 10000 });
    
    await new Promise((r) => setTimeout(r, 1000));
    await sendShot(page, "Bulk Attendance modal");

    const checkboxCount = await page.evaluate(() => document.querySelectorAll('input[type="checkbox"]').length);
    send(`Found ${checkboxCount} checkboxes on page`);
    send("✅ Bulk Attendance modal opened successfully. Stopping here as requested.");

    // Take final screenshot of the bulk attendance modal
    await sendShot(page, "Bulk Attendance - Final State");
    
    res.write(`data: ${JSON.stringify({ done: true, success: true })}\n\n`);
  } catch (err) {
    if (err.message === "STOPPED") {
      send("⏹️ Automation stopped by user.");
      res.write(`data: ${JSON.stringify({ done: true, success: false, stopped: true })}\n\n`);
    } else {
      send(`ERROR: ${err.message}`);
      try {
        if (browser) {
          const pages = await browser.pages();
          const p = pages[pages.length - 1];
          if (p) {
            const buf = await p.screenshot({ type: "jpeg", quality: 60 });
            res.write(`data: ${JSON.stringify({ screenshot: buf.toString("base64"), label: "Error state" })}\n\n`);
          }
        }
      } catch (_) {}
      res.write(`data: ${JSON.stringify({ done: true, success: false })}\n\n`);
    }
  } finally {
    if (browser) await browser.close();
    activeConnections.delete(connectionId);
    res.end();
  }
});

// Endpoint to stop automation
app.post("/stop", (req, res) => {
  const connectionId = req.body.connectionId;
  if (connectionId && activeConnections.has(connectionId)) {
    const connection = activeConnections.get(connectionId);
    connection.stop();
    activeConnections.delete(connectionId);
    res.json({ success: true, message: "Automation stopped" });
  } else {
    // Stop all active connections
    activeConnections.forEach((connection) => connection.stop());
    activeConnections.clear();
    res.json({ success: true, message: "All automations stopped" });
  }
});

app.get("/health", (_, res) => res.json({ status: "ok", awake: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Automation server running on port ${PORT}`));