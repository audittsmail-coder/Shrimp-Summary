(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    var lastSwUpdateCheck = 0;
    function maybeUpdateSw(registration) {
      var now = Date.now();
      if (now - lastSwUpdateCheck < 5 * 60 * 1000) return;
      lastSwUpdateCheck = now;
      registration.update();
    }
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (registration) {
        maybeUpdateSw(registration);
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") maybeUpdateSw(registration);
        });
      });
    });
    var refreshingAfterUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshingAfterUpdate) return;
      refreshingAfterUpdate = true;
      window.location.reload();
    });
  }

  var form = document.getElementById("harvest-form");
  var recordIdInput = document.getElementById("record-id");
  var farmInput = document.getElementById("farm");
  var pondInput = document.getElementById("pond");
  var dateInput = document.getElementById("harvestDate");
  var stockingDateInput = document.getElementById("stockingDate");
  var sizeInput = document.getElementById("size");
  var priceInput = document.getElementById("price");
  var stockingCountInput = document.getElementById("stockingCount");
  var catchAmountInput = document.getElementById("catchAmount");
  var totalFeedInput = document.getElementById("totalFeed");
  var cultureDaysPreview = document.getElementById("culture-days-preview");
  var fcrPreview = document.getElementById("fcr-preview");
  var valuePreview = document.getElementById("value-preview");
  var countPreview = document.getElementById("count-preview");
  var survivalPreview = document.getElementById("survival-preview");
  var submitBtn = document.getElementById("submit-btn");
  var formTitle = document.getElementById("form-title");
  var cancelEditBtn = document.getElementById("cancel-edit-btn");
  var recordsBody = document.getElementById("records-body");
  var emptyState = document.getElementById("empty-state");
  var searchInput = document.getElementById("search-input");
  var exportCsvBtn = document.getElementById("export-csv-btn");
  var pondSummaryEl = document.getElementById("pond-summary");
  var overallSummaryEl = document.getElementById("overall-summary");
  var farmListEl = document.getElementById("farm-list");
  var pondListEl = document.getElementById("pond-list");
  var syncStatusEl = document.getElementById("sync-status");
  var bulkTextarea = document.getElementById("bulk-import-textarea");
  var bulkFileInput = document.getElementById("bulk-file-input");
  var bulkPreviewBtn = document.getElementById("bulk-preview-btn");
  var bulkImportBtn = document.getElementById("bulk-import-btn");
  var bulkClearBtn = document.getElementById("bulk-clear-btn");
  var bulkSummaryEl = document.getElementById("bulk-summary");
  var bulkPreviewWrap = document.getElementById("bulk-preview-wrap");
  var bulkPreviewBody = document.getElementById("bulk-preview-body");

  var records = [];
  var dataLoaded = false;
  var recordsRef = firebase.database().ref("harvestRecords");

  var offlineWarningTimer = null;

  firebase.database().ref(".info/connected").on("value", function (snap) {
    if (snap.val() === true) {
      if (offlineWarningTimer) {
        clearTimeout(offlineWarningTimer);
        offlineWarningTimer = null;
      }
      syncStatusEl.textContent = "✅ เชื่อมต่อฐานข้อมูลแล้ว";
      syncStatusEl.className = "sync-status ok";
    } else {
      // Brief reconnects are normal (e.g. WiFi handoff, tab backgrounded on
      // mobile Safari) — wait a few seconds before alarming the user so a
      // split-second blip doesn't read as the connection "flapping".
      if (offlineWarningTimer) clearTimeout(offlineWarningTimer);
      offlineWarningTimer = setTimeout(function () {
        syncStatusEl.textContent = "⚠️ ขาดการเชื่อมต่อ (ข้อมูลจะซิงค์เมื่อกลับมาออนไลน์)";
        syncStatusEl.className = "sync-status offline";
      }, 3000);
    }
  });

  recordsRef.on("value", function (snapshot) {
    var data = snapshot.val() || {};
    records = Object.keys(data)
      .filter(function (key) { return data[key] !== null; })
      .map(function (key) {
        var r = data[key];
        r.id = key;
        return r;
      });
    dataLoaded = true;
    renderAll();
  }, function (error) {
    syncStatusEl.textContent = "❌ เชื่อมต่อฐานข้อมูลไม่สำเร็จ: " + error.message;
    syncStatusEl.className = "sync-status error";
  });

  function toNumber(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function calcFcr(feed, catchAmount) {
    if (!catchAmount) return null;
    return feed / catchAmount;
  }

  function calcHarvestedCount(catchAmount, size) {
    return catchAmount * size;
  }

  function calcSurvivalRate(stockingCount, harvestedCount) {
    if (!stockingCount) return null;
    return (harvestedCount / stockingCount) * 100;
  }

  function calcCultureDays(stockingDate, harvestDate) {
    if (!stockingDate || !harvestDate) return null;
    var start = new Date(stockingDate + "T00:00:00");
    var end = new Date(harvestDate + "T00:00:00");
    var diffDays = Math.round((end - start) / 86400000);
    if (isNaN(diffDays) || diffDays < 0) return null;
    return diffDays;
  }

  function cycleKey(r) {
    return r.farm + "||" + r.pond + "||" + (r.stockingDate || "ไม่ระบุวันปล่อย");
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return n.toLocaleString("th-TH", {
      minimumFractionDigits: digits === undefined ? 0 : digits,
      maximumFractionDigits: digits === undefined ? 2 : digits
    });
  }

  function fcrBadgeClass(fcr) {
    if (fcr === null) return "";
    if (fcr <= 1.4) return "fcr-good";
    if (fcr <= 1.8) return "fcr-ok";
    return "fcr-bad";
  }

  function survivalBadgeClass(rate) {
    if (rate === null) return "";
    if (rate >= 70) return "fcr-good";
    if (rate >= 50) return "fcr-ok";
    return "fcr-bad";
  }

  function updatePreview() {
    var feed = toNumber(totalFeedInput.value);
    var catchAmount = toNumber(catchAmountInput.value);
    var price = toNumber(priceInput.value);
    var size = toNumber(sizeInput.value);
    var stockingCount = toNumber(stockingCountInput.value);
    var fcr = calcFcr(feed, catchAmount);
    var harvestedCount = calcHarvestedCount(catchAmount, size);
    var survivalRate = calcSurvivalRate(stockingCount, harvestedCount);
    var cultureDays = calcCultureDays(stockingDateInput.value, dateInput.value);
    cultureDaysPreview.textContent = cultureDays === null ? "-" : fmt(cultureDays, 0) + " วัน";
    fcrPreview.textContent = fcr === null ? "-" : fmt(fcr, 2);
    valuePreview.textContent = catchAmount && price ? fmt(catchAmount * price, 2) : "-";
    countPreview.textContent = harvestedCount ? fmt(harvestedCount, 0) + " ตัว" : "-";
    survivalPreview.textContent = survivalRate === null ? "-" : fmt(survivalRate, 1) + "%";
  }

  [totalFeedInput, catchAmountInput, priceInput, sizeInput, stockingCountInput, dateInput, stockingDateInput].forEach(function (el) {
    el.addEventListener("input", updatePreview);
  });

  function resetForm() {
    form.reset();
    recordIdInput.value = "";
    formTitle.textContent = "เพิ่มรายการจับกุ้ง";
    submitBtn.textContent = "＋ บันทึกรายการ";
    cancelEditBtn.classList.add("hidden");
    updatePreview();
  }

  cancelEditBtn.addEventListener("click", resetForm);

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var id = recordIdInput.value || recordsRef.push().key;
    var cultureDays = calcCultureDays(stockingDateInput.value, dateInput.value);
    if (cultureDays === null) {
      alert("วันที่ปล่อยกุ้งต้องมาก่อนวันที่จับ กรุณาตรวจสอบวันที่อีกครั้ง");
      return;
    }
    var record = {
      harvestDate: dateInput.value,
      stockingDate: stockingDateInput.value,
      farm: farmInput.value.trim(),
      pond: pondInput.value.trim(),
      size: toNumber(sizeInput.value),
      price: toNumber(priceInput.value),
      cultureDays: cultureDays,
      stockingCount: toNumber(stockingCountInput.value),
      catchAmount: toNumber(catchAmountInput.value),
      totalFeed: toNumber(totalFeedInput.value)
    };

    submitBtn.disabled = true;
    recordsRef.child(id).set(record)
      .then(function () {
        resetForm();
      })
      .catch(function (error) {
        alert("บันทึกรายการไม่สำเร็จ: " + error.message);
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });

  function startEdit(id) {
    var r = records.find(function (r) { return r.id === id; });
    if (!r) return;
    recordIdInput.value = r.id;
    dateInput.value = r.harvestDate;
    stockingDateInput.value = r.stockingDate || "";
    farmInput.value = r.farm;
    pondInput.value = r.pond;
    sizeInput.value = r.size;
    priceInput.value = r.price;
    stockingCountInput.value = r.stockingCount;
    catchAmountInput.value = r.catchAmount;
    totalFeedInput.value = r.totalFeed;
    formTitle.textContent = "แก้ไขรายการ";
    submitBtn.textContent = "✓ บันทึกการแก้ไข";
    cancelEditBtn.classList.remove("hidden");
    updatePreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteRecord(id) {
    if (!confirm("ต้องการลบรายการนี้หรือไม่?")) return;
    recordsRef.child(id).remove().catch(function (error) {
      alert("ลบรายการไม่สำเร็จ: " + error.message);
    });
  }

  function deleteRecords(ids, confirmMessage) {
    if (ids.length === 0) return;
    if (!confirm(confirmMessage)) return;
    var updates = {};
    ids.forEach(function (id) { updates[id] = null; });
    recordsRef.update(updates).catch(function (error) {
      alert("ลบข้อมูลไม่สำเร็จ: " + error.message);
    });
  }

  function renderDatalists() {
    var farms = Array.from(new Set(records.map(function (r) { return r.farm; }).filter(Boolean)));
    var ponds = Array.from(new Set(records.map(function (r) { return r.pond; }).filter(Boolean)));
    farmListEl.innerHTML = farms.map(function (f) { return "<option value=\"" + escapeHtml(f) + "\">"; }).join("");
    pondListEl.innerHTML = ponds.map(function (p) { return "<option value=\"" + escapeHtml(p) + "\">"; }).join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderTable() {
    var query = searchInput.value.trim().toLowerCase();
    var filtered = records
      .filter(function (r) {
        if (!query) return true;
        return (r.farm + " " + r.pond).toLowerCase().indexOf(query) !== -1;
      })
      .sort(function (a, b) { return (b.harvestDate || "").localeCompare(a.harvestDate || ""); });

    recordsBody.innerHTML = "";
    emptyState.textContent = dataLoaded ? "ยังไม่มีรายการ เริ่มบันทึกรายการจับกุ้งด้านบนได้เลย" : "กำลังโหลดข้อมูล...";
    emptyState.classList.toggle("hidden", records.length !== 0);

    filtered.forEach(function (r) {
      var fcr = calcFcr(r.totalFeed, r.catchAmount);
      var value = r.catchAmount * r.price;
      var harvestedCount = calcHarvestedCount(r.catchAmount, r.size);
      var survivalRate = calcSurvivalRate(r.stockingCount, harvestedCount);
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(r.harvestDate || "-") + "</td>" +
        "<td>" + escapeHtml(r.stockingDate || "-") + "</td>" +
        "<td>" + escapeHtml(r.farm) + "</td>" +
        "<td>" + escapeHtml(r.pond) + "</td>" +
        "<td>" + fmt(r.size, 1) + "</td>" +
        "<td>" + fmt(r.price, 2) + "</td>" +
        "<td>" + fmt(r.cultureDays, 0) + "</td>" +
        "<td>" + fmt(r.stockingCount, 0) + "</td>" +
        "<td>" + fmt(r.catchAmount, 2) + "</td>" +
        "<td>" + fmt(harvestedCount, 0) + "</td>" +
        "<td><span class=\"fcr-badge " + survivalBadgeClass(survivalRate) + "\">" + (survivalRate === null ? "-" : fmt(survivalRate, 1) + "%") + "</span></td>" +
        "<td>" + fmt(r.totalFeed, 2) + "</td>" +
        "<td><span class=\"fcr-badge " + fcrBadgeClass(fcr) + "\">" + (fcr === null ? "-" : fmt(fcr, 2)) + "</span></td>" +
        "<td>" + fmt(value, 2) + "</td>" +
        "<td class=\"row-actions\">" +
          "<button class=\"btn-icon\" data-action=\"edit\" data-id=\"" + r.id + "\" title=\"แก้ไข\">✏️</button>" +
          "<button class=\"btn-icon danger\" data-action=\"delete\" data-id=\"" + r.id + "\" title=\"ลบ\">🗑️</button>" +
        "</td>";
      recordsBody.appendChild(tr);
    });
  }

  recordsBody.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    if (btn.getAttribute("data-action") === "edit") startEdit(id);
    if (btn.getAttribute("data-action") === "delete") deleteRecord(id);
  });

  searchInput.addEventListener("input", renderTable);

  function renderDelta(newVal, prevVal, higherIsBetter, digits, suffix) {
    if (newVal === null || prevVal === null || prevVal === undefined) return "";
    var diff = newVal - prevVal;
    if (Math.abs(diff) < Math.pow(10, -digits) / 2) return "";
    var improved = higherIsBetter ? diff > 0 : diff < 0;
    var arrow = diff > 0 ? "▲" : "▼";
    var sign = diff > 0 ? "+" : "";
    return "<span class=\"delta " + (improved ? "delta-up" : "delta-down") + "\">" +
      arrow + " " + sign + fmt(diff, digits) + (suffix || "") + " จากรอบก่อน</span>";
  }

  function renderPondSummary() {
    // Group harvest events into culture cycles: same farm + pond + stocking date.
    var cycles = {};
    records.forEach(function (r) {
      var key = cycleKey(r);
      if (!cycles[key]) {
        cycles[key] = { farm: r.farm, pond: r.pond, stockingDate: r.stockingDate, entries: [] };
      }
      cycles[key].entries.push(r);
    });

    var cycleList = Object.keys(cycles).map(function (key) {
      var c = cycles[key];
      var totalCatch = c.entries.reduce(function (s, r) { return s + r.catchAmount; }, 0);
      var totalFeed = Math.max.apply(null, c.entries.map(function (r) { return r.totalFeed; }));
      var totalValue = c.entries.reduce(function (s, r) { return s + r.catchAmount * r.price; }, 0);
      var maxDays = Math.max.apply(null, c.entries.map(function (r) { return r.cultureDays || 0; }));
      var stockingCount = Math.max.apply(null, c.entries.map(function (r) { return r.stockingCount || 0; }));
      var totalHarvestedCount = c.entries.reduce(function (s, r) { return s + calcHarvestedCount(r.catchAmount, r.size); }, 0);
      var lastEntry = c.entries.slice().sort(function (a, b) { return (a.harvestDate || "").localeCompare(b.harvestDate || ""); }).pop();
      c.totalCatch = totalCatch;
      c.totalFeed = totalFeed;
      c.totalValue = totalValue;
      c.maxDays = maxDays;
      c.stockingCount = stockingCount;
      c.totalHarvestedCount = totalHarvestedCount;
      c.lastEntry = lastEntry;
      c.fcr = calcFcr(totalFeed, totalCatch);
      c.survivalRate = calcSurvivalRate(stockingCount, totalHarvestedCount);
      c.avgPrice = totalCatch ? totalValue / totalCatch : 0;
      c.sortKey = c.stockingDate || (c.entries[0] && c.entries[0].harvestDate) || "";
      return c;
    });

    // Group cycles by pond, then order each pond's cycles oldest -> newest for comparison.
    var pondGroups = {};
    cycleList.forEach(function (c) {
      var key = c.farm + "||" + c.pond;
      if (!pondGroups[key]) pondGroups[key] = { farm: c.farm, pond: c.pond, cycles: [] };
      pondGroups[key].cycles.push(c);
    });

    var pondKeys = Object.keys(pondGroups).sort(function (a, b) {
      return pondGroups[a].farm.localeCompare(pondGroups[b].farm) || pondGroups[a].pond.localeCompare(pondGroups[b].pond);
    });

    if (pondKeys.length === 0) {
      pondSummaryEl.innerHTML = "<p class=\"empty-state\">ยังไม่มีข้อมูลสำหรับปิดยอด</p>";
      return;
    }

    pondSummaryEl.innerHTML = pondKeys.map(function (key) {
      var g = pondGroups[key];
      g.cycles.sort(function (a, b) { return a.sortKey.localeCompare(b.sortKey); });

      var cardsHtml = g.cycles.map(function (c, index) {
        var prev = index > 0 ? g.cycles[index - 1] : null;
        var isLatest = index === g.cycles.length - 1;
        var fcrDelta = prev ? renderDelta(c.fcr, prev.fcr, false, 2, "") : "";
        var survivalDelta = prev ? renderDelta(c.survivalRate, prev.survivalRate, true, 1, "%") : "";
        var cycleLabel = c.stockingDate ? "ปล่อย " + escapeHtml(c.stockingDate) : "ไม่ระบุวันปล่อย";
        var cycleIds = c.entries.map(function (r) { return r.id; }).join(",");

        return (
          "<div class=\"pond-card" + (isLatest && g.cycles.length > 1 ? " is-latest" : "") + "\">" +
            "<button class=\"btn-icon danger cycle-delete-btn\" data-action=\"delete-cycle\" data-ids=\"" + cycleIds + "\" title=\"ลบข้อมูลรอบนี้\">🗑️</button>" +
            "<span class=\"cycle-label\">" + cycleLabel + (isLatest && g.cycles.length > 1 ? " · ล่าสุด" : "") + "</span>" +
            "<div class=\"row\"><span>จำนวนครั้งที่จับ</span><span>" + c.entries.length + " ครั้ง</span></div>" +
            "<div class=\"row\"><span>วันเลี้ยง</span><span>" + fmt(c.maxDays, 0) + " วัน</span></div>" +
            "<div class=\"row\"><span>ไซส์ล่าสุด</span><span>" + fmt(c.lastEntry.size, 1) + " ตัว/กก.</span></div>" +
            "<div class=\"row\"><span>จำนวนปล่อย</span><span>" + fmt(c.stockingCount, 0) + " ตัว</span></div>" +
            "<div class=\"row\"><span>จำนวนจับรวม</span><span>" + fmt(c.totalCatch, 2) + " กก. (" + fmt(c.totalHarvestedCount, 0) + " ตัว)</span></div>" +
            "<div class=\"row\"><span>อาหารรวม (สะสม)</span><span>" + fmt(c.totalFeed, 2) + " กก.</span></div>" +
            "<div class=\"row\"><span>ราคาเฉลี่ย</span><span>" + fmt(c.avgPrice, 2) + " บาท/กก.</span></div>" +
            "<div class=\"row\"><span>มูลค่ารวม</span><span>" + fmt(c.totalValue, 2) + " บาท</span></div>" +
            "<div class=\"fcr-line\"><span>อัตรารอด" + survivalDelta + "</span><span class=\"fcr-badge " + survivalBadgeClass(c.survivalRate) + "\">" + (c.survivalRate === null ? "-" : fmt(c.survivalRate, 1) + "%") + "</span></div>" +
            "<div class=\"fcr-line\"><span>FCR" + fcrDelta + "</span><span class=\"fcr-badge " + fcrBadgeClass(c.fcr) + "\">" + (c.fcr === null ? "-" : fmt(c.fcr, 2)) + "</span></div>" +
          "</div>"
        );
      }).join("");

      var pondIds = g.cycles.reduce(function (acc, c) {
        return acc.concat(c.entries.map(function (r) { return r.id; }));
      }, []).join(",");

      return (
        "<div class=\"pond-group\">" +
          "<div class=\"pond-group-header\">" +
            "<h3>" + escapeHtml(g.farm) + " · " + escapeHtml(g.pond) + "</h3>" +
            (g.cycles.length > 1 ? "<span class=\"cycle-count-badge\">" + g.cycles.length + " รอบเลี้ยง</span>" : "") +
            "<button class=\"btn-icon danger pond-delete-btn\" data-action=\"delete-pond\" data-ids=\"" + pondIds + "\" data-label=\"" + escapeHtml(g.farm) + " · " + escapeHtml(g.pond) + "\" title=\"ลบบ่อนี้ทั้งหมด\">🗑️ ลบบ่อนี้</button>" +
          "</div>" +
          "<div class=\"cycle-row\">" + cardsHtml + "</div>" +
        "</div>"
      );
    }).join("");
  }

  pondSummaryEl.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var ids = btn.getAttribute("data-ids").split(",").filter(Boolean);
    var action = btn.getAttribute("data-action");
    if (action === "delete-cycle") {
      deleteRecords(ids, "ต้องการลบข้อมูลรอบเลี้ยงนี้หรือไม่? (" + ids.length + " รายการ)");
    } else if (action === "delete-pond") {
      var label = btn.getAttribute("data-label");
      deleteRecords(ids, "ต้องการลบข้อมูลทั้งหมดของบ่อ \"" + label + "\" หรือไม่? (" + ids.length + " รายการ ทุกรอบเลี้ยง) การลบนี้ไม่สามารถย้อนกลับได้");
    }
  });

  function renderOverallSummary() {
    var totalRecords = records.length;
    var pondKeys = new Set(records.map(function (r) { return r.farm + "||" + r.pond; }));
    var totalCatch = records.reduce(function (s, r) { return s + r.catchAmount; }, 0);
    var totalValue = records.reduce(function (s, r) { return s + r.catchAmount * r.price; }, 0);

    var feedByCycle = {};
    var stockingByCycle = {};
    records.forEach(function (r) {
      var key = cycleKey(r);
      feedByCycle[key] = Math.max(feedByCycle[key] || 0, r.totalFeed);
      stockingByCycle[key] = Math.max(stockingByCycle[key] || 0, r.stockingCount || 0);
    });
    var totalFeed = Object.values(feedByCycle).reduce(function (s, v) { return s + v; }, 0);
    var totalStocking = Object.values(stockingByCycle).reduce(function (s, v) { return s + v; }, 0);
    var totalHarvestedCount = records.reduce(function (s, r) { return s + calcHarvestedCount(r.catchAmount, r.size); }, 0);
    var overallFcr = calcFcr(totalFeed, totalCatch);
    var overallSurvival = calcSurvivalRate(totalStocking, totalHarvestedCount);

    var stats = [
      { label: "จำนวนรายการ", value: totalRecords },
      { label: "จำนวนบ่อที่บันทึก", value: pondKeys.size },
      { label: "จับรวมทั้งหมด (กก.)", value: fmt(totalCatch, 2) },
      { label: "อาหารรวมทั้งหมด (กก.)", value: fmt(totalFeed, 2) },
      { label: "มูลค่ารวม (บาท)", value: fmt(totalValue, 2) },
      { label: "อัตรารอดเฉลี่ยรวม", value: overallSurvival === null ? "-" : fmt(overallSurvival, 1) + "%" },
      { label: "FCR เฉลี่ยรวม", value: overallFcr === null ? "-" : fmt(overallFcr, 2) }
    ];

    overallSummaryEl.innerHTML = stats.map(function (s) {
      return "<div class=\"stat\"><div class=\"stat-value\">" + s.value + "</div><div class=\"stat-label\">" + s.label + "</div></div>";
    }).join("");
  }

  function exportCsv() {
    if (records.length === 0) return;
    var header = ["วันที่จับ", "วันที่ปล่อย", "ฟาร์ม", "บ่อ", "ไซส์", "ราคา", "วันเลี้ยง", "จำนวนปล่อย(ตัว)", "จำนวนจับ(กก.)", "จำนวนจับ(ตัว)", "อัตรารอด(%)", "อาหารรวม(กก.)", "FCR", "มูลค่า(บาท)"];
    var rows = records.map(function (r) {
      var fcr = calcFcr(r.totalFeed, r.catchAmount);
      var harvestedCount = calcHarvestedCount(r.catchAmount, r.size);
      var survivalRate = calcSurvivalRate(r.stockingCount, harvestedCount);
      return [
        r.harvestDate, r.stockingDate, r.farm, r.pond, r.size, r.price, r.cultureDays, r.stockingCount,
        r.catchAmount, harvestedCount.toFixed(0), survivalRate === null ? "" : survivalRate.toFixed(1),
        r.totalFeed, fcr === null ? "" : fcr.toFixed(2), (r.catchAmount * r.price).toFixed(2)
      ];
    });
    var csv = "﻿" + [header].concat(rows).map(function (row) {
      return row.map(function (cell) {
        var s = String(cell === undefined || cell === null ? "" : cell);
        if (s.indexOf(",") !== -1 || s.indexOf("\"") !== -1) {
          s = "\"" + s.replace(/"/g, "\"\"") + "\"";
        }
        return s;
      }).join(",");
    }).join("\r\n");

    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "shrimp-harvest-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportCsvBtn.addEventListener("click", exportCsv);

  function beToCe(year) {
    return year > 2400 ? year - 543 : year;
  }

  function pad2(n) {
    return String(n).length < 2 ? "0" + n : String(n);
  }

  function parseDateFlexible(str) {
    str = (str || "").trim();
    if (!str) return null;

    var iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      var isoYear = beToCe(parseInt(iso[1], 10));
      return isoYear + "-" + pad2(iso[2]) + "-" + pad2(iso[3]);
    }

    var dmy = str.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (dmy) {
      var day = dmy[1];
      var month = dmy[2];
      var yearRaw = dmy[3];
      var year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);
      year = beToCe(year);
      if (parseInt(month, 10) > 12) return null;
      return year + "-" + pad2(month) + "-" + pad2(day);
    }

    return null;
  }

  function parseNumberFlexible(str) {
    var cleaned = String(str === undefined || str === null ? "" : str).replace(/,/g, "").trim();
    if (cleaned === "") return NaN;
    return parseFloat(cleaned);
  }

  var BULK_FIELD_DEFS = [
    { key: "harvestDate", label: "วันที่จับ" },
    { key: "stockingDate", label: "วันที่ปล่อยกุ้ง" },
    { key: "farm", label: "ฟาร์ม" },
    { key: "pond", label: "บ่อ" },
    { key: "size", label: "ไซส์" },
    { key: "price", label: "ราคา" },
    { key: "stockingCount", label: "จำนวนปล่อย" },
    { key: "catchAmount", label: "จำนวนที่จับ" },
    { key: "totalFeed", label: "อาหารรวม" }
  ];
  var BULK_DEFAULT_MAP = { harvestDate: 0, stockingDate: 1, farm: 2, pond: 3, size: 4, price: 5, stockingCount: 6, catchAmount: 7, totalFeed: 8 };

  function detectFieldFromHeader(header) {
    var h = (header || "").toLowerCase().replace(/\s+/g, "");
    if (h.indexOf("วัน") !== -1) {
      if (h.indexOf("ปล่อย") !== -1) return "stockingDate";
      if (h.indexOf("จับ") !== -1 || h.indexOf("เก็บ") !== -1 || h.indexOf("harvest") !== -1) return "harvestDate";
    }
    if (h.indexOf("ฟาร์ม") !== -1 || h.indexOf("farm") !== -1) return "farm";
    if (h.indexOf("บ่อ") !== -1 || h.indexOf("pond") !== -1) return "pond";
    if (h.indexOf("ไซส์") !== -1 || h.indexOf("ไซซ์") !== -1 || h.indexOf("ขนาด") !== -1 || h.indexOf("size") !== -1) return "size";
    if (h.indexOf("ราคา") !== -1 || h.indexOf("price") !== -1) return "price";
    if (h.indexOf("อาหาร") !== -1 || h.indexOf("feed") !== -1) return "totalFeed";
    if (h.indexOf("ปล่อย") !== -1 || h.indexOf("stock") !== -1) return "stockingCount";
    if (h.indexOf("จับ") !== -1 || h.indexOf("catch") !== -1) return "catchAmount";
    return null;
  }

  function buildBulkColumnMap(headerCells) {
    var map = {};
    headerCells.forEach(function (cellText, idx) {
      var field = detectFieldFromHeader(cellText);
      if (field && map[field] === undefined) map[field] = idx;
    });
    return map;
  }

  function processBulkRows(allRows) {
    allRows = allRows
      .map(function (cells) { return cells.map(function (c) { return (c === undefined || c === null ? "" : String(c)).trim(); }); })
      .filter(function (cells) { return cells.some(function (c) { return c !== ""; }); });

    if (allRows.length === 0) return { rows: [], headerError: null };

    var firstCells = allRows[0];
    var detectedMap = buildBulkColumnMap(firstCells);
    var matchedCount = Object.keys(detectedMap).length;
    var columnMap;
    var dataRows;

    if (matchedCount >= 6) {
      // First row looks like a header — match columns by their label text.
      var missing = BULK_FIELD_DEFS.filter(function (f) { return detectedMap[f.key] === undefined; });
      if (missing.length > 0) {
        return {
          rows: [],
          headerError: "ไม่พบคอลัมน์ในหัวตาราง: " + missing.map(function (f) { return f.label; }).join(", ") +
            " กรุณาตรวจสอบชื่อหัวข้อคอลัมน์ในแถวแรกแล้วลองใหม่"
        };
      }
      columnMap = detectedMap;
      dataRows = allRows.slice(1);
    } else {
      // No recognizable header — assume the fixed column order.
      columnMap = BULK_DEFAULT_MAP;
      dataRows = parseDateFlexible(firstCells[0]) === null ? allRows.slice(1) : allRows;
    }

    var minCols = Math.max.apply(null, Object.keys(columnMap).map(function (k) { return columnMap[k]; })) + 1;

    var rows = dataRows.map(function (cells, index) {
      var errors = [];

      if (cells.length < minCols) {
        errors.push("จำนวนคอลัมน์ไม่ครบ (ต้องมีอย่างน้อย " + minCols + " คอลัมน์ พบ " + cells.length + ")");
      }

      var harvestDate = parseDateFlexible(cells[columnMap.harvestDate]);
      var stockingDate = parseDateFlexible(cells[columnMap.stockingDate]);
      var farm = (cells[columnMap.farm] || "").trim();
      var pond = (cells[columnMap.pond] || "").trim();
      var size = parseNumberFlexible(cells[columnMap.size]);
      var price = parseNumberFlexible(cells[columnMap.price]);
      var stockingCount = parseNumberFlexible(cells[columnMap.stockingCount]);
      var catchAmount = parseNumberFlexible(cells[columnMap.catchAmount]);
      var totalFeed = parseNumberFlexible(cells[columnMap.totalFeed]);

      if (!harvestDate) errors.push("วันที่จับไม่ถูกต้อง");
      if (!stockingDate) errors.push("วันที่ปล่อยไม่ถูกต้อง");
      if (!farm) errors.push("ไม่มีชื่อฟาร์ม");
      if (!pond) errors.push("ไม่มีชื่อบ่อ");
      if (isNaN(size) || size <= 0) errors.push("ไซส์ไม่ถูกต้อง");
      if (isNaN(price) || price < 0) errors.push("ราคาไม่ถูกต้อง");
      if (isNaN(stockingCount) || stockingCount <= 0) errors.push("จำนวนปล่อยไม่ถูกต้อง");
      if (isNaN(catchAmount) || catchAmount <= 0) errors.push("จำนวนที่จับไม่ถูกต้อง");
      if (isNaN(totalFeed) || totalFeed < 0) errors.push("อาหารรวมไม่ถูกต้อง");

      var cultureDays = errors.length === 0 ? calcCultureDays(stockingDate, harvestDate) : null;
      if (errors.length === 0 && cultureDays === null) {
        errors.push("วันที่ปล่อยต้องมาก่อนวันที่จับ");
      }

      return {
        rowNumber: index + 1,
        harvestDate: harvestDate,
        stockingDate: stockingDate,
        farm: farm,
        pond: pond,
        size: size,
        price: price,
        stockingCount: stockingCount,
        catchAmount: catchAmount,
        totalFeed: totalFeed,
        cultureDays: cultureDays,
        errors: errors,
        valid: errors.length === 0
      };
    });

    return { rows: rows, headerError: null };
  }

  function parseBulkText(text) {
    var lines = text.split(/\r\n|\r|\n/).filter(function (l) { return l.trim() !== ""; });
    if (lines.length === 0) return { rows: [], headerError: null };
    var delimiter = lines[0].indexOf("\t") !== -1 ? "\t" : ",";
    var allRows = lines.map(function (line) { return line.split(delimiter); });
    return processBulkRows(allRows);
  }

  function parseSheetFile(file) {
    var isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";

    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("อ่านไฟล์ไม่สำเร็จ")); };

      if (isCsv) {
        reader.onload = function () {
          try {
            resolve(parseBulkText(String(reader.result)));
          } catch (e) {
            reject(e);
          }
        };
        reader.readAsText(file);
        return;
      }

      reader.onload = function () {
        try {
          if (typeof XLSX === "undefined") {
            reject(new Error("ไม่สามารถโหลดตัวอ่านไฟล์ Excel ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่"));
            return;
          }
          var data = new Uint8Array(reader.result);
          var workbook = XLSX.read(data, { type: "array" });
          var sheet = workbook.Sheets[workbook.SheetNames[0]];
          var allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
          resolve(processBulkRows(allRows));
        } catch (e) {
          reject(new Error("อ่านไฟล์ Excel ไม่สำเร็จ: " + e.message));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  var bulkParsedRows = [];

  function renderBulkPreview(result) {
    var rows = result.rows;
    bulkParsedRows = rows;
    var validCount = rows.filter(function (r) { return r.valid; }).length;

    if (result.headerError) {
      bulkPreviewWrap.classList.add("hidden");
      bulkImportBtn.classList.add("hidden");
      bulkClearBtn.classList.remove("hidden");
      bulkSummaryEl.textContent = "⚠️ " + result.headerError;
      return;
    }

    if (rows.length === 0) {
      bulkPreviewWrap.classList.add("hidden");
      bulkImportBtn.classList.add("hidden");
      bulkClearBtn.classList.add("hidden");
      bulkSummaryEl.textContent = "ไม่พบข้อมูลที่วางเข้ามา";
      return;
    }

    bulkPreviewBody.innerHTML = rows.map(function (r) {
      var statusCell = r.valid
        ? "<span class=\"fcr-badge status-ok\">✅ ถูกต้อง</span>"
        : "<span class=\"fcr-badge status-bad\" title=\"" + escapeHtml(r.errors.join(", ")) + "\">❌ " + escapeHtml(r.errors[0]) + "</span>";
      return (
        "<tr>" +
        "<td>" + r.rowNumber + "</td>" +
        "<td>" + escapeHtml(r.harvestDate || "-") + "</td>" +
        "<td>" + escapeHtml(r.stockingDate || "-") + "</td>" +
        "<td>" + escapeHtml(r.farm || "-") + "</td>" +
        "<td>" + escapeHtml(r.pond || "-") + "</td>" +
        "<td>" + (isNaN(r.size) ? "-" : fmt(r.size, 1)) + "</td>" +
        "<td>" + (isNaN(r.price) ? "-" : fmt(r.price, 2)) + "</td>" +
        "<td>" + (isNaN(r.stockingCount) ? "-" : fmt(r.stockingCount, 0)) + "</td>" +
        "<td>" + (isNaN(r.catchAmount) ? "-" : fmt(r.catchAmount, 2)) + "</td>" +
        "<td>" + (isNaN(r.totalFeed) ? "-" : fmt(r.totalFeed, 2)) + "</td>" +
        "<td>" + (r.cultureDays === null ? "-" : fmt(r.cultureDays, 0)) + "</td>" +
        "<td>" + statusCell + "</td>" +
        "</tr>"
      );
    }).join("");

    bulkPreviewWrap.classList.remove("hidden");
    bulkClearBtn.classList.remove("hidden");
    bulkImportBtn.classList.remove("hidden");

    if (validCount > 0) {
      bulkSummaryEl.textContent = "พบ " + rows.length + " แถว — ถูกต้อง " + validCount + " แถว, ผิดพลาด " + (rows.length - validCount) + " แถว";
      bulkImportBtn.disabled = false;
      bulkImportBtn.textContent = "นำเข้า " + validCount + " รายการที่ถูกต้อง";
    } else {
      bulkSummaryEl.textContent = "⚠️ พบ " + rows.length + " แถว แต่ผิดพลาดทั้งหมด — ดูสถานะแต่ละแถวด้านล่าง แก้ไขข้อมูลแล้วกด \"ตรวจสอบข้อมูล\" ใหม่";
      bulkImportBtn.disabled = true;
      bulkImportBtn.textContent = "นำเข้า 0 รายการ";
    }
  }

  bulkPreviewBtn.addEventListener("click", function () {
    renderBulkPreview(parseBulkText(bulkTextarea.value));
  });

  bulkFileInput.addEventListener("change", function () {
    var file = bulkFileInput.files && bulkFileInput.files[0];
    if (!file) return;
    bulkSummaryEl.textContent = "กำลังอ่านไฟล์ " + file.name + " ...";
    parseSheetFile(file)
      .then(function (result) {
        bulkTextarea.value = "";
        renderBulkPreview(result);
      })
      .catch(function (error) {
        bulkPreviewWrap.classList.add("hidden");
        bulkImportBtn.classList.add("hidden");
        bulkClearBtn.classList.remove("hidden");
        bulkSummaryEl.textContent = "⚠️ " + error.message;
      })
      .finally(function () {
        bulkFileInput.value = "";
      });
  });

  bulkClearBtn.addEventListener("click", function () {
    bulkTextarea.value = "";
    bulkFileInput.value = "";
    bulkParsedRows = [];
    bulkPreviewWrap.classList.add("hidden");
    bulkImportBtn.classList.add("hidden");
    bulkClearBtn.classList.add("hidden");
    bulkSummaryEl.textContent = "";
  });

  bulkImportBtn.addEventListener("click", function () {
    var validRows = bulkParsedRows.filter(function (r) { return r.valid; });
    if (validRows.length === 0) return;

    var updates = {};
    validRows.forEach(function (r) {
      var id = recordsRef.push().key;
      updates[id] = {
        harvestDate: r.harvestDate,
        stockingDate: r.stockingDate,
        farm: r.farm,
        pond: r.pond,
        size: r.size,
        price: r.price,
        cultureDays: r.cultureDays,
        stockingCount: r.stockingCount,
        catchAmount: r.catchAmount,
        totalFeed: r.totalFeed
      };
    });

    bulkImportBtn.disabled = true;
    recordsRef.update(updates)
      .then(function () {
        bulkTextarea.value = "";
        bulkParsedRows = [];
        bulkPreviewWrap.classList.add("hidden");
        bulkImportBtn.classList.add("hidden");
        bulkClearBtn.classList.add("hidden");
        bulkSummaryEl.textContent = "นำเข้าสำเร็จ " + validRows.length + " รายการ";
      })
      .catch(function (error) {
        alert("นำเข้าข้อมูลไม่สำเร็จ: " + error.message);
      })
      .finally(function () {
        bulkImportBtn.disabled = false;
      });
  });

  function renderAll() {
    renderDatalists();
    renderTable();
    renderPondSummary();
    renderOverallSummary();
  }

  updatePreview();
  renderAll();
})();

