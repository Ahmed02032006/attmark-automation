import express from "express";
import cors from "cors";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();

// Configure CORS properly
app.use(cors({
  origin: ['https://attendance-management-system-fronte-two.vercel.app', 'http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

const ATTMARK_URL = "https://attendance-management-system-fronte-two.vercel.app";
const EMAIL = "tester@gmail.com";
const PASSWORD = "123";

// Store active connections for stopping
const activeConnections = new Map();

app.get("/simulate", async (req, res) => {
  const connectionId = Date.now().toString();
  let isStopped = false;
  
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "https://attendance-management-system-fronte-two.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  const send = (msg) => {
    if (!isStopped) {
      res.write(`data: ${JSON.stringify({ msg })}\n\n`);
    }
  };
  
  const sendShot = async (page, label) => {
    if (isStopped) return null;
    try {
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
    await new Promise((r) => setTimeout(r, 1000));
    await sendShot(page, "After login");
    send("Logged in successfully!");

    // ── STEP 2: Go to Manage Attendance ───────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Navigating to Manage Attendance...");
    await page.goto(`${ATTMARK_URL}/teacher/attendance`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2000));
    await sendShot(page, "Manage Attendance page");
    send("On Manage Attendance page!");

    // ── STEP 3: Select Subject & Schedule ─────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Selecting course and class schedule...");
    
    send("Selecting course: Mathematics MATH101...");
    try {
      await page.waitForSelector('select, [role="combobox"], .select, .dropdown', { timeout: 5000 });
      
      await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const select of selects) {
          const options = Array.from(select.options);
          const mathOption = options.find(opt => 
            opt.text.toLowerCase().includes('math') || 
            opt.text.toLowerCase().includes('math101')
          );
          if (mathOption) {
            select.value = mathOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
      });
      
      send("Course selected: Mathematics MATH101");
    } catch (e) {
      send("Course may already be selected or using default value");
    }
    
    await new Promise((r) => setTimeout(r, 1000));
    
    send("Selecting class schedule: Monday 09:00-10:30...");
    try {
      await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const select of selects) {
          const options = Array.from(select.options);
          const scheduleOption = options.find(opt => 
            opt.text.toLowerCase().includes('monday') || 
            opt.text.toLowerCase().includes('09:00')
          );
          if (scheduleOption) {
            select.value = scheduleOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
      });
      
      send("Schedule selected: Monday 09:00-10:30");
    } catch (e) {
      send("Schedule may already be selected or using default value");
    }
    
    await new Promise((r) => setTimeout(r, 1000));
    await sendShot(page, "Subject and Schedule selected");

    // ── STEP 4: Click View Attendance ──────────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Clicking View Attendance button...");
    
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll("button, a, [role='button']"));
      let btn = allButtons.find(b => 
        b.textContent.toLowerCase().trim() === "view attendance" ||
        b.textContent.toLowerCase().trim() === "view"
      );
      
      if (!btn) {
        btn = allButtons.find(b => 
          b.textContent.toLowerCase().includes("view attendance") ||
          b.textContent.toLowerCase().includes("view")
        );
      }
      
      if (btn) btn.click();
    });
    
    send("Waiting for attendance list to load...");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {
      send("Page didn't navigate, waiting for UI update...");
    });
    
    await new Promise((r) => setTimeout(r, 3000));
    await sendShot(page, "Attendance list view");
    send("Attendance list loaded successfully!");

    // ── STEP 5: Click Create Attendance ─────────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Looking for Create Attendance button...");
    
    let createBtnFound = false;
    for (let i = 0; i < 5; i++) {
      createBtnFound = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, a, [role='button']"));
        const btn = btns.find(b => 
          b.textContent.toLowerCase().includes("create attendance") ||
          b.textContent.toLowerCase().includes("create")
        );
        return btn && btn.offsetParent !== null;
      });
      
      if (createBtnFound) break;
      await new Promise((r) => setTimeout(r, 1000));
      send(`Retrying to find Create Attendance button... (attempt ${i + 2}/5)`);
    }
    
    if (!createBtnFound) {
      await sendShot(page, "Debug - Create Attendance button not found");
      throw new Error("Could not find Create Attendance button");
    }
    
    send("Clicking Create Attendance button...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a, [role='button']"));
      const btn = btns.find(b => 
        b.textContent.toLowerCase().includes("create attendance") ||
        b.textContent.toLowerCase().includes("create")
      );
      if (btn) btn.click();
    });
    
    send("Waiting for attendance options dropdown...");
    await new Promise((r) => setTimeout(r, 1500));
    await sendShot(page, "Create Attendance dropdown with options");

    // ── STEP 6: Select Manual Attendance ──────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Selecting Manual Attendance (first option)...");
    
    let manualFound = false;
    for (let i = 0; i < 5; i++) {
      manualFound = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll("button, li, [role='menuitem'], div, span, p"));
        const manualOption = allElements.find(e => 
          e.textContent.toLowerCase().includes("manual") && 
          e.offsetParent !== null &&
          e.textContent.length < 100
        );
        return manualOption !== undefined;
      });
      
      if (manualFound) break;
      await new Promise((r) => setTimeout(r, 1000));
      send(`Waiting for Manual Attendance option... (attempt ${i + 2}/5)`);
    }
    
    if (manualFound) {
      send("Found Manual Attendance option, clicking...");
      await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll("button, li, [role='menuitem'], div, span, p"));
        const candidates = allElements.filter(e => 
          e.textContent.toLowerCase().includes("manual") &&
          e.textContent.length < 100
        );
        
        if (candidates.length > 0) {
          candidates.sort((a, b) => a.textContent.length - b.textContent.length);
          const target = candidates[0];
          if (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "LI") {
            target.click();
          } else {
            target.closest("button, a, li, [role='button'], [role='menuitem']")?.click();
          }
        }
      });
      
      send("Waiting for Manual Attendance modal to open...");
      await new Promise((r) => setTimeout(r, 2000));
      await sendShot(page, "Manual Attendance modal opened");
      send("Manual Attendance modal is now open!");
    } else {
      await sendShot(page, "Manual Attendance option not found");
      throw new Error("Manual Attendance option not found");
    }

    // ── STEP 7: Click Mark Bulk Attendance ────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Looking for Mark Bulk Attendance button inside the modal...");
    
    let bulkFound = false;
    for (let i = 0; i < 5; i++) {
      bulkFound = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll("button, a, [role='button']"));
        const bulkBtn = allButtons.find(b => 
          b.textContent.toLowerCase().includes("bulk") && 
          b.offsetParent !== null
        );
        return bulkBtn !== undefined;
      });
      
      if (bulkFound) break;
      await new Promise((r) => setTimeout(r, 1500));
      send(`Waiting for Mark Bulk Attendance button... (attempt ${i + 2}/5)`);
    }
    
    if (bulkFound) {
      send("Found Mark Bulk Attendance button, clicking...");
      await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll("button, a, [role='button']"));
        const bulkBtn = allButtons.find(b => 
          b.textContent.toLowerCase().includes("bulk") &&
          b.offsetParent !== null
        );
        if (bulkBtn) bulkBtn.click();
      });
      
      send("Waiting for bulk attendance view to fully load...");
      await new Promise((r) => setTimeout(r, 3000));
      await sendShot(page, "Bulk Attendance view loaded");
      
      const stats = await page.evaluate(() => {
        const inputCheckboxes = document.querySelectorAll('input[type="checkbox"]');
        const customCheckboxes = document.querySelectorAll('[role="checkbox"], [class*="checkbox"], [class*="check"]');
        const studentRows = document.querySelectorAll('[class*="student"], [class*="row"], [class*="card"], tr, li');
        
        const allElements = Array.from(document.querySelectorAll('*'));
        const rollPatterns = allElements.filter(el => /25FA-\d{3}-ST/i.test(el.textContent));
        
        const rollNumbers = new Set();
        rollPatterns.forEach(el => {
          const matches = el.textContent.match(/25FA-\d{3}-ST/gi);
          if (matches) matches.forEach(m => rollNumbers.add(m));
        });
        
        return {
          inputCheckboxes: inputCheckboxes.length,
          customCheckboxes: customCheckboxes.length,
          studentRows: studentRows.length,
          uniqueRollNumbers: rollNumbers.size,
          rollNumbers: Array.from(rollNumbers)
        };
      });
      
      send(`Bulk Attendance View Stats:`);
      send(`  - Standard checkboxes: ${stats.inputCheckboxes}`);
      send(`  - Custom checkboxes/check elements: ${stats.customCheckboxes}`);
      send(`  - Student rows/cards detected: ${stats.studentRows}`);
      send(`  - Unique roll numbers found: ${stats.uniqueRollNumbers}`);
      
      if (stats.rollNumbers.length > 0) {
        send(`  - Sample roll numbers: ${stats.rollNumbers.slice(0, 5).join(', ')}`);
      }
      
      send("✅ Bulk Attendance view opened successfully!");
      await sendShot(page, "Bulk Attendance - Final View");
      
    } else {
      const allButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("button, a, [role='button']"))
          .map(b => b.textContent.trim())
          .filter(text => text.length > 0);
      });
      send(`Available buttons in modal: ${JSON.stringify(allButtons)}`);
      await sendShot(page, "Manual Attendance modal - Bulk button not found");
    }

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

app.post("/stop", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://attendance-management-system-fronte-two.vercel.app");
  
  const connectionId = req.body.connectionId;
  if (connectionId && activeConnections.has(connectionId)) {
    const connection = activeConnections.get(connectionId);
    connection.stop();
    activeConnections.delete(connectionId);
    res.json({ success: true, message: "Automation stopped" });
  } else {
    activeConnections.forEach((connection) => connection.stop());
    activeConnections.clear();
    res.json({ success: true, message: "All automations stopped" });
  }
});

// Health endpoint with proper CORS headers
app.get("/health", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://attendance-management-system-fronte-two.vercel.app");
  res.json({ status: "ok", awake: true });
});

// Handle OPTIONS preflight
app.options("*", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://attendance-management-system-fronte-two.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Automation server running on port ${PORT}`));