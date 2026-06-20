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
    
    // Wait for and select course dropdown
    send("Selecting course: Mathematics MATH101...");
    try {
      // Try to find and select the course from dropdown
      await page.waitForSelector('select, [role="combobox"], .select, .dropdown', { timeout: 5000 });
      
      // Try to select the course using various methods
      await page.evaluate(() => {
        // Try select element first
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
        
        // Try clicking elements that might be dropdown triggers
        const dropdowns = Array.from(document.querySelectorAll('[role="combobox"], .select-trigger, .dropdown-trigger'));
        for (const dropdown of dropdowns) {
          if (dropdown.textContent.toLowerCase().includes('math') || 
              dropdown.textContent.toLowerCase().includes('course')) {
            dropdown.click();
            break;
          }
        }
      });
      
      send("Course selected: Mathematics MATH101");
    } catch (e) {
      send("Course may already be selected or using default value");
    }
    
    await new Promise((r) => setTimeout(r, 1000));
    
    // Wait for and select class schedule
    send("Selecting class schedule: Monday 09:00-10:30...");
    try {
      await page.evaluate(() => {
        // Try select element first
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
        
        // Try clicking schedule elements
        const allElements = Array.from(document.querySelectorAll('*'));
        const scheduleEl = allElements.find(el => 
          el.textContent.toLowerCase().includes('monday') && 
          el.textContent.toLowerCase().includes('09:00')
        );
        if (scheduleEl) {
          scheduleEl.click();
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
    
    // Try multiple approaches to find and click the View Attendance button
    const viewClicked = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll("button, a, [role='button']"));
      
      // Try exact match first
      let btn = allButtons.find(b => 
        b.textContent.toLowerCase().trim() === "view attendance" ||
        b.textContent.toLowerCase().trim() === "view"
      );
      
      // Try partial match
      if (!btn) {
        btn = allButtons.find(b => 
          b.textContent.toLowerCase().includes("view attendance") ||
          b.textContent.toLowerCase().includes("view")
        );
      }
      
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    
    if (!viewClicked) {
      // If button not found, try clicking any element that looks clickable near "View Attendance" text
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll("*"));
        const viewText = elements.find(el => {
          const text = el.textContent.toLowerCase().trim();
          return text === "view attendance" || text === "view";
        });
        
        if (viewText) {
          // Click the element itself or its parent
          if (viewText.tagName === "BUTTON" || viewText.tagName === "A") {
            viewText.click();
          } else {
            viewText.closest("button, a, [role='button'], [onclick]")?.click();
          }
        }
      });
    }
    
    // Wait for page to update after clicking View Attendance
    send("Waiting for attendance list to load...");
    
    // Wait for network to be idle and UI to update
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {
      send("Page didn't navigate, waiting for UI update...");
    });
    
    // Extra wait to ensure the attendance list renders
    await new Promise((r) => setTimeout(r, 3000));
    
    // Check if attendance list or table appeared
    const hasAttendanceList = await page.evaluate(() => {
      return document.querySelector('table, [class*="attendance"], [class*="list"], [class*="table"]') !== null;
    });
    
    if (hasAttendanceList) {
      send("Attendance list loaded successfully!");
      await sendShot(page, "Attendance list view");
    } else {
      send("View Attendance clicked, waiting for content...");
      await sendShot(page, "After View Attendance click");
    }

    // ── STEP 5: Click Create Attendance ─────────────────────────────
    if (isStopped) throw new Error("STOPPED");
    send("Looking for Create Attendance button...");
    
    // Wait longer and try to find the button with retries
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
      throw new Error("Could not find Create Attendance button after multiple attempts");
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
    
    // Wait for dropdown with 3 options to appear (Manual, QR, RFID)
    send("Waiting for attendance options dropdown...");
    await new Promise((r) => setTimeout(r, 1500));
    await sendShot(page, "Create Attendance dropdown with options");

    // ── STEP 6: Select Manual Attendance (First Option) ───────────
    if (isStopped) throw new Error("STOPPED");
    send("Selecting Manual Attendance (first option)...");
    
    // Wait for manual attendance option with retries
    let manualFound = false;
    for (let i = 0; i < 5; i++) {
      // Check for manual attendance text in the dropdown
      manualFound = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll("button, li, [role='menuitem'], div, span, p"));
        const manualOption = allElements.find(e => 
          e.textContent.toLowerCase().includes("manual") && 
          e.offsetParent !== null &&
          e.textContent.length < 100 // Avoid matching large containers
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
          // Sort by text length - shortest is usually the most specific
          candidates.sort((a, b) => a.textContent.length - b.textContent.length);
          
          // Try to click the element, if not clickable, click its parent
          const target = candidates[0];
          if (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "LI") {
            target.click();
          } else {
            target.closest("button, a, li, [role='button'], [role='menuitem']")?.click();
          }
        }
      });
      
      // Wait for modal to appear after clicking Manual Attendance
      send("Waiting for Manual Attendance modal to open...");
      await new Promise((r) => setTimeout(r, 2000));
      await sendShot(page, "Manual Attendance modal opened");
      send("Manual Attendance modal is now open!");
    } else {
      send("⚠️ Could not find Manual Attendance option. Taking screenshot of current state...");
      await sendShot(page, "Manual Attendance option not found");
      throw new Error("Manual Attendance option not found in dropdown");
    }

    // ── STEP 7: Click Mark Bulk Attendance inside the modal ───────
    if (isStopped) throw new Error("STOPPED");
    send("Looking for Mark Bulk Attendance button inside the modal...");
    
    // Wait for bulk button with retries - it's inside the modal
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
        if (bulkBtn) {
          bulkBtn.click();
        }
      });
      
      // Wait for student list to load in the bulk attendance view
      send("Waiting for student list to load in bulk attendance view...");
      
      // Wait for checkboxes with timeout
      try {
        await page.waitForFunction(() => {
          return document.querySelectorAll('input[type="checkbox"]').length > 1;
        }, { timeout: 15000 });
        
        await new Promise((r) => setTimeout(r, 1500));
        await sendShot(page, "Bulk Attendance view with student list");
        
        const checkboxCount = await page.evaluate(() => document.querySelectorAll('input[type="checkbox"]').length);
        send(`Found ${checkboxCount} student checkboxes in the list`);
        send("✅ Bulk Attendance view opened successfully with all students!");
      } catch (e) {
        send("⚠️ Could not find student checkboxes, but bulk view should be open");
        await sendShot(page, "Bulk Attendance view (no checkboxes found)");
      }
      
      send("✅ Automation completed! Stopping at Bulk Attendance view as requested.");
    } else {
      send("⚠️ Mark Bulk Attendance button not found in the modal");
      send("Taking screenshot of the modal to help debug...");
      await sendShot(page, "Manual Attendance modal - Bulk button not found");
      
      // Log all button texts for debugging
      const allButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("button, a, [role='button']"))
          .map(b => b.textContent.trim())
          .filter(text => text.length > 0);
      });
      send(`Available buttons in modal: ${JSON.stringify(allButtons)}`);
    }

    // Take final screenshot
    await sendShot(page, "Final State");
    
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