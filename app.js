(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js");
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
  var sizeInput = document.getElementById("size");
  var priceInput = document.getElementById("price");
  var cultureDaysInput = document.getElementById("cultureDays");
  var catchAmountInput = document.getElementById("catchAmount");
  var totalFeedInput = document.getElementById("totalFeed");
  var fcrPreview = document.getElementById("fcr-preview");
  var valuePreview = document.getElementById("value-preview");
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

  var records = [];
  var dataLoaded = false;
  var recordsRef = firebase.database().ref("harvestRecords");

  firebase.database().ref(".info/connected").on("value", function (snap) {
    if (snap.val() === true) {
      syncStatusEl.textContent = "✅ เชื่อมต่อฐานข้อมูลแล้ว";
      syncStatusEl.className = "sync-status ok";
    } else {
      syncStatusEl.textContent = "⚠️ ขาดการเชื่อมต่อ (ข้อมูลจะซิงค์เมื่อกลับมาออนไลน์)";
      syncStatusEl.className = "sync-status offline";
    }
  });

  recordsRef.on("value", function (snapshot) {
    var data = snapshot.val() || {};
    records = Object.keys(data).map(function (key) {
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

  function updatePreview() {
    var feed = toNumber(totalFeedInput.value);
    var catchAmount = toNumber(catchAmountInput.value);
    var price = toNumber(priceInput.value);
    var fcr = calcFcr(feed, catchAmount);
    fcrPreview.textContent = fcr === null ? "-" : fmt(fcr, 2);
    valuePreview.textContent = catchAmount && price ? fmt(catchAmount * price, 2) : "-";
  }

  [totalFeedInput, catchAmountInput, priceInput].forEach(function (el) {
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
    var record = {
      harvestDate: dateInput.value,
      farm: farmInput.value.trim(),
      pond: pondInput.value.trim(),
      size: toNumber(sizeInput.value),
      price: toNumber(priceInput.value),
      cultureDays: toNumber(cultureDaysInput.value),
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
    farmInput.value = r.farm;
    pondInput.value = r.pond;
    sizeInput.value = r.size;
    priceInput.value = r.price;
    cultureDaysInput.value = r.cultureDays;
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
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(r.harvestDate || "-") + "</td>" +
        "<td>" + escapeHtml(r.farm) + "</td>" +
        "<td>" + escapeHtml(r.pond) + "</td>" +
        "<td>" + fmt(r.size, 1) + "</td>" +
        "<td>" + fmt(r.price, 2) + "</td>" +
        "<td>" + fmt(r.cultureDays, 0) + "</td>" +
        "<td>" + fmt(r.catchAmount, 2) + "</td>" +
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

  function renderPondSummary() {
    var groups = {};
    records.forEach(function (r) {
      var key = r.farm + "||" + r.pond;
      if (!groups[key]) {
        groups[key] = { farm: r.farm, pond: r.pond, entries: [] };
      }
      groups[key].entries.push(r);
    });

    var keys = Object.keys(groups).sort(function (a, b) {
      return groups[a].farm.localeCompare(groups[b].farm) || groups[a].pond.localeCompare(groups[b].pond);
    });

    if (keys.length === 0) {
      pondSummaryEl.innerHTML = "<p class=\"empty-state\">ยังไม่มีข้อมูลสำหรับปิดยอด</p>";
      return;
    }

    pondSummaryEl.innerHTML = keys.map(function (key) {
      var g = groups[key];
      var totalCatch = g.entries.reduce(function (s, r) { return s + r.catchAmount; }, 0);
      var totalFeed = Math.max.apply(null, g.entries.map(function (r) { return r.totalFeed; }));
      var totalValue = g.entries.reduce(function (s, r) { return s + r.catchAmount * r.price; }, 0);
      var maxDays = Math.max.apply(null, g.entries.map(function (r) { return r.cultureDays; }));
      var lastEntry = g.entries.slice().sort(function (a, b) { return (a.harvestDate || "").localeCompare(b.harvestDate || ""); }).pop();
      var fcr = calcFcr(totalFeed, totalCatch);
      var avgPrice = totalCatch ? totalValue / totalCatch : 0;

      return (
        "<div class=\"pond-card\">" +
          "<h3>" + escapeHtml(g.farm) + " · " + escapeHtml(g.pond) + "</h3>" +
          "<div class=\"row\"><span>จำนวนครั้งที่จับ</span><span>" + g.entries.length + " ครั้ง</span></div>" +
          "<div class=\"row\"><span>วันเลี้ยงสูงสุด</span><span>" + fmt(maxDays, 0) + " วัน</span></div>" +
          "<div class=\"row\"><span>ไซส์ล่าสุด</span><span>" + fmt(lastEntry.size, 1) + " ตัว/กก.</span></div>" +
          "<div class=\"row\"><span>จำนวนจับรวม</span><span>" + fmt(totalCatch, 2) + " กก.</span></div>" +
          "<div class=\"row\"><span>อาหารรวม (สะสม)</span><span>" + fmt(totalFeed, 2) + " กก.</span></div>" +
          "<div class=\"row\"><span>ราคาเฉลี่ย</span><span>" + fmt(avgPrice, 2) + " บาท/กก.</span></div>" +
          "<div class=\"row\"><span>มูลค่ารวม</span><span>" + fmt(totalValue, 2) + " บาท</span></div>" +
          "<div class=\"fcr-line\"><span>FCR รวมทั้งบ่อ</span><span class=\"fcr-badge " + fcrBadgeClass(fcr) + "\">" + (fcr === null ? "-" : fmt(fcr, 2)) + "</span></div>" +
        "</div>"
      );
    }).join("");
  }

  function renderOverallSummary() {
    var totalRecords = records.length;
    var pondKeys = new Set(records.map(function (r) { return r.farm + "||" + r.pond; }));
    var totalCatch = records.reduce(function (s, r) { return s + r.catchAmount; }, 0);
    var totalValue = records.reduce(function (s, r) { return s + r.catchAmount * r.price; }, 0);

    var feedByPond = {};
    records.forEach(function (r) {
      var key = r.farm + "||" + r.pond;
      feedByPond[key] = Math.max(feedByPond[key] || 0, r.totalFeed);
    });
    var totalFeed = Object.values(feedByPond).reduce(function (s, v) { return s + v; }, 0);
    var overallFcr = calcFcr(totalFeed, totalCatch);

    var stats = [
      { label: "จำนวนรายการ", value: totalRecords },
      { label: "จำนวนบ่อที่บันทึก", value: pondKeys.size },
      { label: "จับรวมทั้งหมด (กก.)", value: fmt(totalCatch, 2) },
      { label: "อาหารรวมทั้งหมด (กก.)", value: fmt(totalFeed, 2) },
      { label: "มูลค่ารวม (บาท)", value: fmt(totalValue, 2) },
      { label: "FCR เฉลี่ยรวม", value: overallFcr === null ? "-" : fmt(overallFcr, 2) }
    ];

    overallSummaryEl.innerHTML = stats.map(function (s) {
      return "<div class=\"stat\"><div class=\"stat-value\">" + s.value + "</div><div class=\"stat-label\">" + s.label + "</div></div>";
    }).join("");
  }

  function exportCsv() {
    if (records.length === 0) return;
    var header = ["วันที่จับ", "ฟาร์ม", "บ่อ", "ไซส์", "ราคา", "วันเลี้ยง", "จำนวนจับ(กก.)", "อาหารรวม(กก.)", "FCR", "มูลค่า(บาท)"];
    var rows = records.map(function (r) {
      var fcr = calcFcr(r.totalFeed, r.catchAmount);
      return [
        r.harvestDate, r.farm, r.pond, r.size, r.price, r.cultureDays,
        r.catchAmount, r.totalFeed, fcr === null ? "" : fcr.toFixed(2), (r.catchAmount * r.price).toFixed(2)
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

  function renderAll() {
    renderDatalists();
    renderTable();
    renderPondSummary();
    renderOverallSummary();
  }

  updatePreview();
  renderAll();
})();

