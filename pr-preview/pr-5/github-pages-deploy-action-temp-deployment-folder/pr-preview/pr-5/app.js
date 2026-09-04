"use strict";

/* =====================================================================
   Storage — the single source of truth is a plain-text blob using the
   exact N:/E:/S:/W:/T:/A:/B: syntax from vantage-graph.html, grouped
   under "// 15th Feb 2026" style date headers. This keeps it directly
   copy/paste compatible with that file.
   ===================================================================== */
const STORAGE_KEY = "vantage_location_text";
const DEFAULT_TYPES = ["Start","Wood","Leaf","Stone","Sand","Cave","Circuit","Energy","Sky","Metal","Sinew","None"];
const DIRS = ["N","E","S","W"];
const DIR_NAMES = {N:"North",E:"East",S:"South",W:"West"};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* Action/bonus labels are always "<verb>/<sub-name>" (e.g. "Help/Repair",
   "Move/Leap"). These are the only valid verbs, and their colors mirror
   the ones renderGraph() already assigns to action edges by label prefix
   (see the color switch in renderGraph()), so the Add form's verb picker
   stays visually in sync with the graph. */
const ACTION_VERBS = ["Move","Look","Engage","Help","Take","Overpower"];
const ACTION_VERB_COLORS = { Move:"blue", Look:"purple", Engage:"green", Help:"orange", Take:"yellow", Overpower:"red" };

function getText(){ return localStorage.getItem(STORAGE_KEY) || ""; }
function setText(text){ localStorage.setItem(STORAGE_KEY, text); }

function ordinalSuffix(n){
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}
function todayHeaderText(d = new Date()){
  return `// ${d.getDate()}${ordinalSuffix(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function appendLine(line){
  const header = todayHeaderText();
  const lines = getText().split("\n");
  let lastHeaderIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--){
    if (lines[i].trim().startsWith("//")) { lastHeaderIdx = i; break; }
  }
  const lastHeader = lastHeaderIdx >= 0 ? lines[lastHeaderIdx].trim() : null;
  let out = getText().replace(/\s+$/, "");
  if (lastHeader !== header){
    out += (out.length ? "\n\n" : "") + header + "\n";
  } else {
    out += "\n";
  }
  out += line + "\n";
  setText(out);
}

function getTodaysEntries(){
  const text = getText();
  const header = todayHeaderText();
  const idx = text.lastIndexOf(header);
  if (idx === -1) return [];
  return text.slice(idx + header.length).split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("//"));
}

function deleteTodayEntry(index){
  const text = getText();
  const header = todayHeaderText();
  const idx = text.lastIndexOf(header);
  if (idx === -1) return;
  const before = text.slice(0, idx + header.length);
  const afterLines = text.slice(idx + header.length).split("\n");
  let count = -1;
  for (let i = 0; i < afterLines.length; i++){
    const l = afterLines[i].trim();
    if (l && !l.startsWith("//")){
      count++;
      if (count === index){ afterLines.splice(i, 1); break; }
    }
  }
  setText(before + afterLines.join("\n"));
}

/* =====================================================================
   Play sessions — a session is just "everything since the last comment
   line" (a date header or an explicit "// SESSION <iso>" marker). Both
   parsers already skip every line starting with "//" unconditionally,
   so these markers are fully compatible with the existing data format
   and with vantage-graph.html without any changes to either.

   Revisiting an already-recorded location amends its canonical line in
   place (see loadForEdit()/onSave()) rather than duplicating it, so a
   revisit of a location first logged in an earlier session wouldn't
   otherwise appear anywhere in *this* session's route. To keep it in
   the route without duplicating the location's data, onSave() appends a
   "// VISIT <id> <iso>" marker for that revisit. It's still just a "//"
   comment line, so it needs no changes to either parser — only to the
   session-boundary/entry-collection logic below, which treats it as a
   route stop rather than a session boundary.
   ===================================================================== */
const SESSION_MARKER_PREFIX = "// SESSION ";
const VISIT_MARKER_PREFIX = "// VISIT ";

function startNewSession(){
  let out = getText().replace(/\s+$/, "");
  out += (out.length ? "\n\n" : "") + SESSION_MARKER_PREFIX + new Date().toISOString() + "\n";
  setText(out);
}

/* Appends a "// VISIT <id> <iso>" marker if `lineIndex` (the canonical
   line being amended) lies before the current session's start — i.e. the
   location was first recorded in an earlier session and is only now
   being revisited. Editing a line that's already part of the current
   session is a same-session correction, not a new stop, so no marker
   is added for that case. */
function logRevisitIfNeeded(id, lineIndex){
  const text = getText();
  const sessions = getAllSessions(text);
  const current = sessions[sessions.length - 1];
  if (!current || lineIndex > current.startIdx) return;
  let out = text.replace(/\s+$/, "");
  out += "\n" + VISIT_MARKER_PREFIX + id + " " + new Date().toISOString() + "\n";
  setText(out);
}

/* Splits the whole log into every session (a run bounded by consecutive
   date-header/"// SESSION" comment lines), each with its ordered list of
   entries — real location lines plus "// VISIT" revisits. Used both for
   the live current-session route overlay and for browsing past runs. */
function getAllSessions(text = getText()){
  const lines = text.split("\n");
  const boundaries = [];
  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (l.startsWith("//") && !l.startsWith(VISIT_MARKER_PREFIX)) boundaries.push(i);
  });

  return boundaries.map((startIdx, bi) => {
    const endIdx = bi + 1 < boundaries.length ? boundaries[bi + 1] : lines.length;
    const headerLine = lines[startIdx].trim();
    const startedAt = headerLine.startsWith(SESSION_MARKER_PREFIX)
      ? headerLine.slice(SESSION_MARKER_PREFIX.length)
      : null;
    const label = headerLine.replace(/^\/\/\s*/, "");

    const entries = [];
    for (let i = startIdx + 1; i < endIdx; i++){
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith(VISIT_MARKER_PREFIX)){
        const id = line.slice(VISIT_MARKER_PREFIX.length).trim().split(/\s+/)[0];
        if (id) entries.push({ id, line, lineIndex: i, revisit: true });
        continue;
      }
      if (line.startsWith("//")) continue;
      const id = line.split(/\s+/)[0];
      if (id) entries.push({ id, line, lineIndex: i });
    }
    return { index: bi, startIdx, endIdx, label, startedAt, entries };
  });
}

/* The live, currently-accumulating session (what the Graph tab shows by
   default). Kept as its own helper since it's the common case. */
function getSessionEntries(text = getText()){
  const sessions = getAllSessions(text);
  if (!sessions.length) return { startedAt: null, entries: [] };
  return sessions[sessions.length - 1];
}

/* Human-readable label for a session-picker option: a "// SESSION <iso>"
   marker gets formatted as a date/time, a plain date header is already
   readable as-is (e.g. "15th Feb 2026"). */
function formatSessionLabel(session){
  if (session.startedAt){
    const d = new Date(session.startedAt);
    if (!isNaN(d)){
      return d.toLocaleString(undefined, { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" });
    }
  }
  return session.label || "Session";
}

/* Finds the most recently written line for a given location id, so it can
   be reloaded into the Add form for amending rather than duplicated. */
function findLastLineForId(id){
  const lines = getText().split("\n");
  for (let i = lines.length - 1; i >= 0; i--){
    const line = lines[i].trim();
    if (!line || line.startsWith("//")) continue;
    if (line.split(/\s+/)[0] === id) return { lineIndex: i, line };
  }
  return null;
}

function parseLocationLine(line){
  const parts = line.trim().split(/\s+/);
  const id = parts[0];
  if (!id) return null;
  const dirs = { N: "unknown", E: "unknown", S: "unknown", W: "unknown" };
  const dirValues = { N: "", E: "", S: "", W: "" };
  let type = "None";
  const actions = [];
  const bonuses = [];

  parts.slice(1).forEach(p => {
    if (p.startsWith("T:")){
      type = p.slice(2) || "None";
    } else if (p.startsWith("A:")){
      p.slice(2).split(",").forEach(a => {
        const [label, target] = a.split("->");
        if (label && target) actions.push({ label, target });
      });
    } else if (p.startsWith("B:")){
      p.slice(2).split(",").forEach(b => {
        const [label, ...rest] = b.split("->");
        const desc = rest.join("->");
        if (label && desc) bonuses.push({ label, desc });
      });
    } else {
      const [dir, target] = p.split(":");
      if (!DIRS.includes(dir)) return;
      if (target === "---") dirs[dir] = "wall";
      else if (!target || target === "***") dirs[dir] = "unknown";
      else { dirs[dir] = "id"; dirValues[dir] = target; }
    }
  });

  return { id, dirs, dirValues, type, actions, bonuses };
}

/* =====================================================================
   Parsing (mirrors vantage-graph.html's parser) — used for stats,
   duplicate-id warnings and autocomplete, not for the graph itself.
   ===================================================================== */
function parseAll(text){
  const definedIds = new Set();
  const allIds = new Set();
  const types = new Set(DEFAULT_TYPES);
  const actionLabels = new Set();
  const bonusLabels = new Set();
  let locationCount = 0;

  text.split("\n").forEach(raw => {
    const line = raw.trim();
    if (!line || line.startsWith("//")) return;
    const parts = line.split(/\s+/);
    const id = parts[0];
    if (!id) return;
    definedIds.add(id);
    allIds.add(id);
    locationCount++;
    parts.slice(1).forEach(p => {
      if (p.startsWith("T:")){
        const t = p.slice(2);
        if (t) types.add(t);
      } else if (p.startsWith("A:")){
        p.slice(2).split(",").forEach(a => {
          const [label, target] = a.split("->");
          if (label) actionLabels.add(labelSubPart(label));
          if (target) allIds.add(target);
        });
      } else if (p.startsWith("B:")){
        p.slice(2).split(",").forEach(b => {
          const [label] = b.split("->");
          if (label) bonusLabels.add(labelSubPart(label));
        });
      } else {
        const [, target] = p.split(":");
        if (target && target !== "---" && target !== "***") allIds.add(target);
      }
    });
  });

  return { definedIds, allIds, types, actionLabels, bonusLabels, locationCount };
}

/* =====================================================================
   Add-location form
   ===================================================================== */
const dirState = {};
let editingLineIndex = null; // non-null while amending a previously-saved line in place

/* Splits a stored "<verb>/<sub-name>" label (action or bonus) into its
   picker value and free-text remainder, for reloading a saved line back
   into the split verb-select + sub-text controls. Anything that isn't a
   recognised "<verb>/..." — including pre-existing free-form labels — is
   kept intact as the sub-text under the default verb, rather than losing
   data. */
function splitActionLabel(label){
  const raw = (label || "").trim();
  const slash = raw.indexOf("/");
  if (slash !== -1){
    const verbPart = raw.slice(0, slash);
    const match = ACTION_VERBS.find(v => v.toLowerCase() === verbPart.toLowerCase());
    if (match) return { verb: match, sub: raw.slice(slash + 1) };
  }
  return { verb: ACTION_VERBS[0], sub: raw };
}

/* Recombines the verb picker + sub-text back into a stored label, per the
   "always <verb>/<sub-name>, spaces stripped from the sub-name" convention. */
function joinActionLabel(verb, sub){
  const cleanSub = (sub || "").replace(/\s+/g, "");
  return cleanSub ? `${verb}/${cleanSub}` : verb;
}

/* For autocomplete: only the free-text sub-name is worth suggesting back,
   not the fixed verb prefix. */
function labelSubPart(label){
  const raw = (label || "").trim();
  const slash = raw.indexOf("/");
  return slash === -1 ? raw : raw.slice(slash + 1);
}

/* Bonus outcome/item/lesson text: spaces become "-", except around a "+"
   (joining two bonuses) where spaces are simply dropped —
   e.g. "item 101 + skill" -> "item-101+skill". */
function formatBonusDescription(text){
  return (text || "").trim().replace(/\s*\+\s*/g, "+").replace(/\s+/g, "-");
}

function actionVerbOptionsHtml(selected){
  return ACTION_VERBS.map(v =>
    `<option value="${v}" style="color:${ACTION_VERB_COLORS[v]};"${v === selected ? " selected" : ""}>${v}</option>`
  ).join("");
}

function applyVerbColor(select){
  const color = ACTION_VERB_COLORS[select.value] || "";
  select.style.borderColor = color;
  select.style.color = color;
}

function setDirUI(d, mode, value){
  const row = document.querySelectorAll("#dirGrid .dirrow")[DIRS.indexOf(d)];
  const buttons = row.querySelectorAll(".seg button");
  const input = row.querySelector("input");
  buttons.forEach(b => b.classList.toggle("sel", b.dataset.mode === mode));
  dirState[d].mode = mode;
  dirState[d].value = mode === "id" ? (value || "") : "";
  input.value = dirState[d].value;
  input.classList.toggle("show", mode === "id");
}

function buildDirGrid(){
  const grid = document.getElementById("dirGrid");
  grid.innerHTML = "";
  DIRS.forEach(d => {
    dirState[d] = { mode: "unknown", value: "" };
    const row = document.createElement("div");
    row.className = "dirrow";
    row.innerHTML = `
      <div class="dirname">${DIR_NAMES[d]}</div>
      <div class="seg">
        <button type="button" data-mode="unknown" class="sel">? Unknown</button>
        <button type="button" data-mode="wall">Wall</button>
        <button type="button" data-mode="id">ID</button>
      </div>
      <input type="text" inputmode="numeric" placeholder="target ID" autocomplete="off" list="idList">
    `;
    const buttons = row.querySelectorAll(".seg button");
    const input = row.querySelector("input");
    buttons.forEach(btn => {
      btn.onclick = () => {
        buttons.forEach(b => b.classList.remove("sel"));
        btn.classList.add("sel");
        dirState[d].mode = btn.dataset.mode;
        if (btn.dataset.mode === "id"){ input.classList.add("show"); input.focus(); }
        else { input.classList.remove("show"); }
      };
    });
    input.oninput = () => { dirState[d].value = input.value.trim(); };
    grid.appendChild(row);
  });
}
function getDirToken(d){
  const st = dirState[d];
  if (st.mode === "wall") return "---";
  if (st.mode === "id") return st.value || "***";
  return "***";
}

function addActionRow(label = "", target = ""){
  const container = document.getElementById("actionRows");
  const { verb, sub } = splitActionLabel(label);
  const row = document.createElement("div");
  row.className = "rowitem";
  row.innerHTML = `
    <div class="label-split">
      <select class="label-verb">${actionVerbOptionsHtml(verb)}</select>
      <input type="text" class="label-sub" list="actionLabelList" placeholder="Repair" autocomplete="off" value="${escapeHtml(sub)}">
    </div>
    <span class="arrow">&#8594;</span>
    <input type="text" class="target-input" inputmode="numeric" list="idList" placeholder="target ID" autocomplete="off" value="${escapeHtml(target)}">
    <button type="button" class="rm">&times;</button>
  `;
  const verbSelect = row.querySelector(".label-verb");
  applyVerbColor(verbSelect);
  verbSelect.onchange = () => applyVerbColor(verbSelect);
  row.querySelector(".rm").onclick = () => row.remove();
  container.appendChild(row);
}
function addBonusRow(label = "", desc = ""){
  const container = document.getElementById("bonusRows");
  const { verb, sub } = splitActionLabel(label);
  const row = document.createElement("div");
  row.className = "rowitem";
  row.innerHTML = `
    <div class="label-split">
      <select class="label-verb">${actionVerbOptionsHtml(verb)}</select>
      <input type="text" class="label-sub" list="bonusLabelList" placeholder="Repair" autocomplete="off" value="${escapeHtml(sub)}">
    </div>
    <span class="arrow">&#8594;</span>
    <input type="text" class="target-input" placeholder="outcome / item / lesson" autocomplete="off" value="${escapeHtml(desc)}">
    <button type="button" class="rm">&times;</button>
  `;
  const verbSelect = row.querySelector(".label-verb");
  applyVerbColor(verbSelect);
  verbSelect.onchange = () => applyVerbColor(verbSelect);
  row.querySelector(".rm").onclick = () => row.remove();
  container.appendChild(row);
}

function onSave(){
  const idInput = document.getElementById("idInput");
  const id = idInput.value.trim();
  if (!id){ idInput.focus(); return; }

  const type = document.getElementById("typeInput").value.trim() || "None";

  const actions = [];
  document.querySelectorAll("#actionRows .rowitem").forEach(row => {
    const verb = row.querySelector(".label-verb").value;
    const sub = row.querySelector(".label-sub").value.trim();
    const target = row.querySelector(".target-input").value.trim();
    if (target) actions.push(`${joinActionLabel(verb, sub)}->${target}`);
  });
  const bonuses = [];
  document.querySelectorAll("#bonusRows .rowitem").forEach(row => {
    const verb = row.querySelector(".label-verb").value;
    const sub = row.querySelector(".label-sub").value.trim();
    const desc = formatBonusDescription(row.querySelector(".target-input").value.trim());
    if (desc) bonuses.push(`${joinActionLabel(verb, sub)}->${desc}`);
  });

  let line = `${id} N:${getDirToken("N")} E:${getDirToken("E")} S:${getDirToken("S")} W:${getDirToken("W")} T:${type}`;
  if (actions.length) line += ` A:${actions.join(",")}`;
  if (bonuses.length) line += ` B:${bonuses.join(",")}`;

  if (editingLineIndex !== null){
    logRevisitIfNeeded(id, editingLineIndex);
    const lines = getText().split("\n");
    lines[editingLineIndex] = line;
    setText(lines.join("\n"));
  } else {
    appendLine(line);
  }

  cancelEdit();
  idInput.focus();

  refreshEverything();
}

/* Pulls the most recently saved line for `id` back into the form so it can
   be amended (directions/type corrected, or new actions appended) instead
   of logged again as a duplicate. Saving replaces that line in place. */
function loadForEdit(id){
  const found = findLastLineForId(id);
  if (!found) return;
  const parsed = parseLocationLine(found.line);
  if (!parsed) return;

  editingLineIndex = found.lineIndex;

  document.getElementById("idInput").value = parsed.id;
  DIRS.forEach(d => setDirUI(d, parsed.dirs[d], parsed.dirValues[d]));
  document.getElementById("typeInput").value = parsed.type;

  document.getElementById("actionRows").innerHTML = "";
  parsed.actions.forEach(a => addActionRow(a.label, a.target));
  addActionRow();

  document.getElementById("bonusRows").innerHTML = "";
  parsed.bonuses.forEach(b => addBonusRow(b.label, b.desc));
  addBonusRow();

  document.getElementById("saveBtn").textContent = "Update Location";

  const banner = document.getElementById("dupWarning");
  banner.className = "warn-banner show editing";
  banner.innerHTML = `Editing existing entry for <b>${escapeHtml(id)}</b> — saving will update it in place. <button type="button" id="btnCancelEdit">Cancel</button>`;
  document.getElementById("btnCancelEdit").onclick = cancelEdit;

  switchView("add");
  window.scrollTo(0, 0);
}

function cancelEdit(){
  editingLineIndex = null;
  document.getElementById("idInput").value = "";
  document.getElementById("saveBtn").textContent = "Save Location";
  const banner = document.getElementById("dupWarning");
  banner.className = "warn-banner";
  banner.innerHTML = "";
  buildDirGrid();
  document.getElementById("actionRows").innerHTML = ""; addActionRow();
  document.getElementById("bonusRows").innerHTML = ""; addBonusRow();
}

function renderTodayList(){
  const container = document.getElementById("todayList");
  const entries = getTodaysEntries();
  container.innerHTML = "";
  if (!entries.length){
    container.innerHTML = `<div class="empty-hint">Nothing added yet today.</div>`;
    return;
  }
  entries.forEach((line, idx) => {
    const row = document.createElement("div");
    row.className = "entry-line";
    const span = document.createElement("span");
    span.textContent = line;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = "&times;";
    btn.onclick = () => {
      if (confirm("Delete this entry?")){ deleteTodayEntry(idx); refreshEverything(); }
    };
    row.appendChild(span);
    row.appendChild(btn);
    container.appendChild(row);
  });
}

/* =====================================================================
   Datalists (autocomplete) + shared refresh
   ===================================================================== */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function setOptions(listId, values){
  const dl = document.getElementById(listId);
  if (dl) dl.innerHTML = values.map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
}
function ensureDatalists(){
  ["actionLabelList","bonusLabelList","idList"].forEach(id => {
    if (!document.getElementById(id)){
      const dl = document.createElement("datalist");
      dl.id = id;
      document.body.appendChild(dl);
    }
  });
}

function updateDataStats(info){
  document.getElementById("dataStats").textContent =
    `${info.locationCount} locations, ${info.allIds.size} total IDs referenced`;
}

function refreshEverything(){
  const text = getText();
  const info = parseAll(text);

  document.getElementById("knownCountBadge").textContent = `${info.locationCount} known`;
  setOptions("typeList", Array.from(info.types).sort());
  setOptions("actionLabelList", Array.from(info.actionLabels).sort());
  setOptions("bonusLabelList", Array.from(info.bonusLabels).sort());
  setOptions("idList", Array.from(info.allIds).sort((a,b) => a.localeCompare(b, undefined, {numeric:true})));

  renderTodayList();

  const dataText = document.getElementById("dataText");
  if (document.activeElement !== dataText) dataText.value = text;
  updateDataStats(info);

  if (document.getElementById("view-graph").classList.contains("active")) renderGraph(text);
}

/* =====================================================================
   Tabs
   ===================================================================== */
function switchView(name){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  document.querySelectorAll("#tabbar button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "graph") renderGraph(getText());
  if (name === "data") { document.getElementById("dataText").value = getText(); updateDataStats(parseAll(getText())); }
}

/* =====================================================================
   Data tab
   ===================================================================== */
function flashButton(btn, msg){
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = orig; }, 1200);
}

function wireDataTab(){
  document.getElementById("btnApply").onclick = () => {
    setText(document.getElementById("dataText").value);
    refreshEverything();
  };

  document.getElementById("btnCopy").onclick = async () => {
    const text = getText();
    const btn = document.getElementById("btnCopy");
    try {
      await navigator.clipboard.writeText(text);
      flashButton(btn, "Copied!");
    } catch (err) {
      const ta = document.getElementById("dataText");
      ta.value = text;
      ta.select();
      document.execCommand("copy");
      flashButton(btn, "Copied!");
    }
  };

  document.getElementById("btnDownload").onclick = () => {
    const text = getText();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vantage-locations-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  document.getElementById("fileInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let content = reader.result;
      const marker = "const input = `";
      // lastIndexOf, not indexOf: vantage-graph.html has a commented-out
      // `// const input = \`{{ $json.data }}\`;` template line above the
      // real one, which also contains this marker text.
      const startIdx = content.lastIndexOf(marker);
      if (startIdx !== -1){
        const rest = content.slice(startIdx + marker.length);
        const endIdx = rest.indexOf("\n`;");
        content = endIdx !== -1 ? rest.slice(0, endIdx) : rest;
      }
      document.getElementById("dataText").value = content.trim() + "\n";
      alert('File loaded into the editor below. Review it, then press "Apply edits" to save it.');
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("btnClear").onclick = () => {
    if (confirm("Clear ALL stored location data? This cannot be undone — copy or download a backup first if you want one.")){
      setText("");
      refreshEverything();
    }
  };
}

/* =====================================================================
   Graph tab — ported from vantage-graph.html, re-runnable so it can be
   refreshed whenever the underlying data changes.
   ===================================================================== */
let graphApi = {};
let selectedSessionIndex = null; // null = always follow the live/current session

function renderGraph(text){
  const grid = 120;
  const nodes = {};
  const compassEdges = [];
  const actionEdges = [];

  text.split("\n").forEach(line => {
    const parts = line.trim().split(/\s+/);
    const id = parts[0];
    if (!id || id.startsWith("/")) return;
    if (!nodes[id]) nodes[id] = { id, x:0, y:0, group:null, actions:[], specials:{} };

    parts.slice(1).forEach(p => {
      if (p.startsWith("T:")){
        // location type — not yet visualised, mirrors vantage-graph.html
      } else if (p.startsWith("B:")){
        // informational only, mirrors vantage-graph.html
      } else if (p.startsWith("A:")){
        const acts = p.substring(2).split(",");
        acts.forEach(a => {
          const [label, target] = a.split("->");
          if (!target) return;
          if (!nodes[target]) nodes[target] = { id:target, x:0, y:0, group:null, actions:[], specials:{} };
          let color = "#888";
          switch ((label||"").toLowerCase().substring(0,3)){
            case "blu": case "mov": color = "blue"; break;
            case "pur": case "loo": color = "purple"; break;
            case "gre": case "eng": color = "green"; break;
            case "ora": case "hel": color = "orange"; break;
            case "yel": case "tak": color = "yellow"; break;
            case "red": case "ove": color = "red"; break;
            default:
          }
          actionEdges.push({ source:id, target, label, color });
          nodes[id].actions.push(label + " → " + target);
        });
      } else {
        const [dir, target] = p.split(":");
        if (target === "***") nodes[id].specials[dir] = "red";
        else if (target === "---") nodes[id].specials[dir] = "yellow";
        else if (target){
          if (!nodes[target]) nodes[target] = { id:target, x:0, y:0, group:null, actions:[], specials:{} };
          compassEdges.push({ source:id, target, dir });
        }
      }
    });
  });

  // Play session route: the ordered sequence of locations added during a
  // session (a run bounded by date-header / "New Session" markers, plus
  // "// VISIT" revisits of earlier-session locations), restricted to
  // locations that resolved to a node (so a typo'd target doesn't crash
  // the overlay). Consecutive repeats collapse into a single stop.
  // Defaults to the live/current session; the picker below lets you
  // browse any past run instead.
  const allSessions = getAllSessions(text);
  const liveIndex = allSessions.length - 1;
  if (selectedSessionIndex === null || !allSessions[selectedSessionIndex]) selectedSessionIndex = liveIndex;
  const session = allSessions[selectedSessionIndex] || { startedAt: null, entries: [] };
  const viewingPast = selectedSessionIndex !== liveIndex;

  const picker = document.getElementById("g-sessionPicker");
  if (picker){
    picker.innerHTML = allSessions.map((s, i) =>
      `<option value="${i}">${escapeHtml(formatSessionLabel(s))}${i === liveIndex ? " (current)" : ""}</option>`
    ).join("");
    picker.value = String(selectedSessionIndex);
    picker.onchange = () => {
      selectedSessionIndex = Number(picker.value);
      renderGraph(getText());
    };
  }

  const routeStops = [];
  session.entries.forEach(e => {
    if (!nodes[e.id]) return;
    if (routeStops.length && routeStops[routeStops.length - 1].id === e.id) return;
    routeStops.push({ id: e.id, order: routeStops.length + 1 });
  });
  const sessionIds = new Set(routeStops.map(s => s.id));
  const routeSegments = [];
  for (let i = 1; i < routeStops.length; i++){
    routeSegments.push({ source: routeStops[i-1].id, target: routeStops[i].id });
  }
  document.getElementById("g-sessionInfo").textContent = routeStops.length
    ? `${session.entries.length} stop${session.entries.length===1?"":"s"} (${sessionIds.size} unique)${viewingPast ? "" : " this session"}`
    : (viewingPast ? "No stops recorded in this session." : "No stops recorded yet this session.");

  document.getElementById("g-editSelected").style.display = "none";

  const empty = document.getElementById("g-empty");
  const svgEl = document.getElementById("g-svg");
  if (Object.keys(nodes).length === 0){
    empty.style.display = "flex";
    svgEl.style.display = "none";
    graphApi = {};
    return;
  }
  empty.style.display = "none";
  svgEl.style.display = "block";

  const visited = new Set();
  let gid = 0;
  function dfs(start){
    const stack = [start];
    while (stack.length){
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      nodes[id].group = gid;
      compassEdges.forEach(e => {
        if (e.source === id && !visited.has(e.target)) stack.push(e.target);
        if (e.target === id && !visited.has(e.source)) stack.push(e.source);
      });
    }
  }
  Object.keys(nodes).forEach(id => { if (!visited.has(id)){ dfs(id); gid++; } });

  const components = {};
  Object.values(nodes).forEach(n => {
    if (!components[n.group]) components[n.group] = [];
    components[n.group].push(n);
  });

  compassEdges.forEach(e => {
    const s = nodes[e.source], t = nodes[e.target];
    if (e.dir === "N"){ t.x = s.x; t.y = s.y - grid; }
    if (e.dir === "S"){ t.x = s.x; t.y = s.y + grid; }
    if (e.dir === "E"){ t.y = s.y; t.x = s.x + grid; }
    if (e.dir === "W"){ t.y = s.y; t.x = s.x - grid; }
  });

  let offsetX = 0;
  Object.values(components).forEach(group => {
    const minX = d3.min(group, n => n.x);
    group.forEach(n => n.x += offsetX - minX);
    offsetX += 150;
  });

  const componentData = Object.entries(components).map(([id, ns]) => ({
    id, nodes: ns, x: d3.mean(ns, n => n.x), y: d3.mean(ns, n => n.y)
  }));

  componentData.forEach(comp => {
    const cx = d3.mean(comp.nodes, n => n.x), cy = d3.mean(comp.nodes, n => n.y);
    let maxDist = 0;
    comp.nodes.forEach(n => { const dist = Math.hypot(n.x-cx, n.y-cy); if (dist > maxDist) maxDist = dist; });
    comp.radius = maxDist + 55;
  });

  const allNodes = Object.values(nodes);
  const specialsData = [];
  allNodes.forEach(n => {
    Object.entries(n.specials).forEach(([dir, type]) => specialsData.push({ node:n, dir, type }));
  });

  const svg = d3.select("#g-svg");
  const viewport = d3.select("#g-viewport");
  viewport.selectAll("*").remove();
  const tooltip = d3.select("#g-tooltip");

  const zoom = d3.zoom().on("zoom", event => { viewport.attr("transform", event.transform); });
  svg.call(zoom);
  svg.on("click", () => {
    d3.selectAll("#graphHost .dim").classed("dim", false);
    d3.selectAll("#graphHost .highlight-node").classed("highlight-node", false);
    d3.selectAll("#graphHost .highlight-edge").classed("highlight-edge", false);
    document.getElementById("g-editSelected").style.display = "none";
  });

  let chargeStrength = +document.getElementById("g-chargeSlider").value;
  document.getElementById("g-chargeSlider").oninput = function(){
    chargeStrength = +this.value;
    document.getElementById("g-chargeValue").textContent = chargeStrength;
    simulation.force("charge", d3.forceManyBody().strength(-chargeStrength));
    simulation.alpha(1).restart();
  };
  let collisionRadius = +document.getElementById("g-collisionSlider").value;
  document.getElementById("g-collisionSlider").oninput = function(){
    collisionRadius = +this.value;
    document.getElementById("g-collisionValue").textContent = collisionRadius;
    simulation.force("collision", d3.forceCollide().radius(comp => comp.radius + collisionRadius));
    simulation.alpha(1).restart();
  };
  let pullStrength = +document.getElementById("g-pullSlider").value;
  document.getElementById("g-pullSlider").oninput = function(){
    pullStrength = +this.value;
    document.getElementById("g-pullValue").textContent = pullStrength;
    simulation.force("componentLink").strength(pullStrength/500);
    simulation.alpha(1).restart();
  };
  let linkDistance = +document.getElementById("g-linkSlider").value;
  document.getElementById("g-linkSlider").oninput = function(){
    linkDistance = +this.value;
    document.getElementById("g-linkValue").textContent = linkDistance;
    simulation.force("componentLink").distance(l => l.source.radius + l.target.radius + linkDistance);
    simulation.alpha(1).restart();
  };

  const componentLinks = [];
  componentData.forEach(c1 => {
    componentData.forEach(c2 => {
      if (c1.id < c2.id){
        const hasLink = actionEdges.some(ae => {
          const sg = String(nodes[ae.source].group), tg = String(nodes[ae.target].group);
          return (sg === c1.id && tg === c2.id) || (sg === c2.id && tg === c1.id);
        });
        if (hasLink) componentLinks.push({ source:c1, target:c2 });
      }
    });
  });

  const centerX = d3.mean(componentData, d => d.x);
  const centerY = d3.mean(componentData, d => d.y);

  const simulation = d3.forceSimulation(componentData)
    .force("charge", d3.forceManyBody().strength(-chargeStrength))
    .force("collision", d3.forceCollide().radius(comp => comp.radius + collisionRadius))
    .force("componentLink", d3.forceLink(componentLinks).distance(l => l.source.radius + l.target.radius + linkDistance).strength(pullStrength/500))
    .force("centerX", d3.forceX(centerX).strength(0.03))
    .force("centerY", d3.forceY(centerY).strength(0.03))
    .on("tick", tick);

  let initialFitDone = false;
  simulation.on("end", () => { if (!initialFitDone){ zoomFitAll(); initialFitDone = true; } });

  function tick(){
    componentData.forEach(comp => {
      const dx = comp.x - d3.mean(comp.nodes, n => n.x);
      const dy = comp.y - d3.mean(comp.nodes, n => n.y);
      comp.nodes.forEach(n => { n.x += dx; n.y += dy; });
    });
    redraw();
  }

  const defs = viewport.append("defs");
  defs.append("marker")
    .attr("id","g-arrowhead")
    .attr("viewBox","-0 -5 10 10")
    .attr("refX",15).attr("refY",0).attr("orient","auto")
    .attr("markerWidth",6).attr("markerHeight",6)
    .append("path").attr("d","M 0,-5 L 10,0 L 0,5").attr("fill","#999").style("stroke","none");
  defs.append("marker")
    .attr("id","g-arrowhead-route")
    .attr("viewBox","-0 -5 10 10")
    .attr("refX",15).attr("refY",0).attr("orient","auto")
    .attr("markerWidth",6).attr("markerHeight",6)
    .append("path").attr("d","M 0,-5 L 10,0 L 0,5").attr("fill","#e0399b").style("stroke","none");

  let showRoute = document.getElementById("g-routeToggle").checked;
  document.getElementById("g-routeToggle").onchange = function(){
    showRoute = this.checked;
    redraw();
  };

  const boardBoxSel = viewport.append("rect").attr("class","board-box");
  const componentLayer = viewport.append("g");
  const edgeLayer = viewport.append("g");
  const actionLayer = viewport.append("g");
  const routeLayer = viewport.append("g");
  const nodeLayer = viewport.append("g");
  const specialLayer = viewport.append("g");

  function redraw(){
    const margin = 200;
    const minX = d3.min(allNodes, n => n.x) - margin, maxX = d3.max(allNodes, n => n.x) + margin;
    const minY = d3.min(allNodes, n => n.y) - margin, maxY = d3.max(allNodes, n => n.y) + margin;
    boardBoxSel.attr("x",minX).attr("y",minY).attr("width",maxX-minX).attr("height",maxY-minY);

    componentLayer.selectAll(".component-box")
      .data(componentData, d => d.id)
      .join("rect")
      .attr("class","component-box")
      .attr("x", d => d3.min(d.nodes, n => n.x) - 60)
      .attr("y", d => d3.min(d.nodes, n => n.y) - 60)
      .attr("width", d => d3.max(d.nodes, n => n.x) - d3.min(d.nodes, n => n.x) + 120)
      .attr("height", d => d3.max(d.nodes, n => n.y) - d3.min(d.nodes, n => n.y) + 120);

    componentLayer.selectAll(".drag-handle")
      .data(componentData, d => d.id)
      .join(enter => enter.append("circle")
        .attr("class","drag-handle").attr("r",10)
        .call(d3.drag().on("drag", (event, comp) => {
          comp.x += event.dx; comp.y += event.dy;
          comp.nodes.forEach(n => { n.x += event.dx; n.y += event.dy; });
          redraw();
        }))
        .on("dblclick", (event, comp) => zoomToComponent(comp))
      )
      .attr("cx", d => d3.max(d.nodes, n => n.x) + 60 - 15)
      .attr("cy", d => d3.max(d.nodes, n => n.y) + 60 - 15);

    edgeLayer.selectAll(".edge")
      .data(compassEdges, (d,i) => i)
      .join("line")
      .attr("class","edge")
      .attr("marker-end","url(#g-arrowhead)")
      .attr("x1", d => nodes[d.source].x).attr("y1", d => nodes[d.source].y)
      .attr("x2", d => nodes[d.target].x).attr("y2", d => nodes[d.target].y);

    actionLayer.selectAll(".action-edge")
      .data(actionEdges, (d,i) => i)
      .join("path")
      .attr("class","action-edge")
      .attr("stroke", d => d.color || "#888")
      .attr("marker-end","url(#g-arrowhead)")
      .attr("d", d => {
        const s = nodes[d.source], t = nodes[d.target];
        const mx = (s.x+t.x)/2, my = (s.y+t.y)/2 - 60;
        return `M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`;
      });

    actionLayer.selectAll(".action-label")
      .data(actionEdges, (d,i) => i)
      .join("text")
      .attr("class","action-label")
      .text(d => d.label)
      .attr("x", d => { const s=nodes[d.source],t=nodes[d.target]; const mx=(s.x+t.x)/2; return 0.25*s.x+0.5*mx+0.25*t.x; })
      .attr("y", d => { const s=nodes[d.source],t=nodes[d.target]; const my=(s.y+t.y)/2-60; return 0.25*s.y+0.5*my+0.25*t.y; });

    routeLayer.selectAll(".route-edge")
      .data(showRoute ? routeSegments : [], (d,i) => i)
      .join("line")
      .attr("class","route-edge")
      .attr("marker-end","url(#g-arrowhead-route)")
      .attr("x1", d => nodes[d.source].x).attr("y1", d => nodes[d.source].y)
      .attr("x2", d => nodes[d.target].x).attr("y2", d => nodes[d.target].y);

    routeLayer.selectAll(".route-stop")
      .data(showRoute ? routeStops : [], d => d.id + "-" + d.order)
      .join(enter => {
        const g = enter.append("g").attr("class","route-stop");
        g.append("circle").attr("r", 11);
        g.append("text").attr("text-anchor","middle").attr("dy", 4).text(d => d.order);
        return g;
      })
      .attr("transform", d => `translate(${nodes[d.id].x + 34},${nodes[d.id].y - 30})`);

    nodeLayer.selectAll(".node")
      .data(allNodes, d => d.id)
      .join(enter => {
        const g = enter.append("g").attr("class","node")
          .on("mouseover", (event, d) => {
            tooltip.style("display","block")
              .html(`<b>ID:</b> ${d.id}<br><b>Group:</b> ${d.group}<br><b>Actions:</b><br>${d.actions.join("<br>")||"None"}`);
          })
          .on("mousemove", (event) => { tooltip.style("left",(event.pageX+10)+"px").style("top",(event.pageY+10)+"px"); })
          .on("mouseout", () => tooltip.style("display","none"))
          .on("click", (event, d) => { event.stopPropagation(); highlightConnections(d.id); showEditButton(d.id); });
        g.append("rect").attr("x",-45).attr("y",-22).attr("width",90).attr("height",44);
        g.append("text").attr("text-anchor","middle").attr("dy",".35em").text(d => d.id);
        return g;
      })
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .classed("session-node", d => showRoute && sessionIds.has(d.id));

    specialLayer.selectAll(".special-marker")
      .data(specialsData, d => d.node.id + "-" + d.dir)
      .join(enter => {
        const g = enter.append("g").attr("class","special-marker");
        g.each(function(d){
          const sel = d3.select(this);
          if (d.type === "red"){
            sel.append("circle").attr("class","special-red").attr("r",8);
          } else {
            sel.append("circle").attr("class","special-yellow").attr("r",10);
            sel.append("text").attr("text-anchor","middle").attr("font-size","12px").attr("dy",4).text("X");
          }
        });
        return g;
      })
      .attr("transform", d => {
        let dx=0, dy=0;
        if (d.dir==="N") dy=-40;
        if (d.dir==="S") dy=40;
        if (d.dir==="E") dx=60;
        if (d.dir==="W") dx=-60;
        return `translate(${d.node.x+dx},${d.node.y+dy})`;
      });
  }

  function showEditButton(nodeId){
    const btn = document.getElementById("g-editSelected");
    btn.textContent = `Edit ${nodeId}`;
    btn.style.display = "flex";
    btn.onclick = () => loadForEdit(nodeId);
  }

  function highlightConnections(nodeId){
    d3.selectAll("#graphHost .dim").classed("dim", false);
    d3.selectAll("#graphHost .highlight-node").classed("highlight-node", false);
    d3.selectAll("#graphHost .highlight-edge").classed("highlight-edge", false);
    const connectedNodes = new Set([nodeId]);
    compassEdges.forEach(e => { if (e.source===nodeId||e.target===nodeId){ connectedNodes.add(e.source); connectedNodes.add(e.target); } });
    actionEdges.forEach(e => { if (e.source===nodeId||e.target===nodeId){ connectedNodes.add(e.source); connectedNodes.add(e.target); } });
    d3.selectAll("#graphHost .node").classed("dim", true);
    d3.selectAll("#graphHost .edge").classed("dim", true);
    d3.selectAll("#graphHost .action-edge").classed("dim", true);
    d3.selectAll("#graphHost .node").filter(d => connectedNodes.has(d.id)).classed("dim", false).classed("highlight-node", true);
    d3.selectAll("#graphHost .edge").filter(d => d.source===nodeId||d.target===nodeId).classed("dim", false).classed("highlight-edge", true);
    d3.selectAll("#graphHost .action-edge").filter(d => d.source===nodeId||d.target===nodeId).classed("dim", false).classed("highlight-edge", true);
  }

  function zoomFitAll(){
    const bbox = viewport.node().getBBox();
    const w = svg.node().clientWidth, h = svg.node().clientHeight;
    if (!w || !h || !bbox.width || !bbox.height) return;
    const scale = 0.9 / Math.max(bbox.width/w, bbox.height/h);
    const tx = (w - bbox.width*scale)/2 - bbox.x*scale;
    const ty = (h - bbox.height*scale)/2 - bbox.y*scale;
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
  }

  function zoomToComponent(comp){
    const minX=d3.min(comp.nodes,n=>n.x)-100, maxX=d3.max(comp.nodes,n=>n.x)+100;
    const minY=d3.min(comp.nodes,n=>n.y)-100, maxY=d3.max(comp.nodes,n=>n.y)+100;
    const w = svg.node().clientWidth, h = svg.node().clientHeight;
    const scale = 0.9/Math.max((maxX-minX)/w,(maxY-minY)/h);
    const tx = (w-(maxX-minX)*scale)/2 - minX*scale;
    const ty = (h-(maxY-minY)*scale)/2 - minY*scale;
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
  }

  function detectOverlaps(){
    const output = document.getElementById("g-overlapOutput");
    let overlaps = [];
    for (let i=0;i<allNodes.length;i++){
      for (let j=i+1;j<allNodes.length;j++){
        const n1=allNodes[i], n2=allNodes[j];
        if (Math.abs(n1.x-n2.x)<90 && Math.abs(n1.y-n2.y)<44) overlaps.push(`${n1.id} overlaps ${n2.id}`);
      }
    }
    output.textContent = overlaps.length ? overlaps.join("\n") : "No overlaps detected";
  }

  redraw();
  requestAnimationFrame(zoomFitAll);

  graphApi = { zoomFitAll, detectOverlaps };
}

function wireGraphTab(){
  document.getElementById("g-menuToggle").onclick = () => {
    const tb = document.getElementById("g-toolbar");
    tb.style.display = tb.style.display === "block" ? "none" : "block";
  };
  document.getElementById("g-btnFit").onclick = () => graphApi.zoomFitAll && graphApi.zoomFitAll();
  document.getElementById("g-btnOverlap").onclick = () => graphApi.detectOverlaps && graphApi.detectOverlaps();
  document.getElementById("g-btnRefresh").onclick = () => renderGraph(getText());
  document.getElementById("g-btnNewSession").onclick = () => {
    if (confirm("Start a new play session? The route overlay will restart from here — earlier locations stay on the map.")){
      startNewSession();
      selectedSessionIndex = null;
      refreshEverything();
    }
  };
}

/* =====================================================================
   Init
   ===================================================================== */
function init(){
  ensureDatalists();
  buildDirGrid();
  addActionRow();
  addBonusRow();

  document.getElementById("addActionRow").onclick = () => addActionRow();
  document.getElementById("addBonusRow").onclick = () => addBonusRow();
  document.getElementById("saveBtn").onclick = onSave;

  document.getElementById("idInput").addEventListener("input", e => {
    if (editingLineIndex !== null) return; // editing banner/Cancel stays until saved or cancelled
    const id = e.target.value.trim();
    const banner = document.getElementById("dupWarning");
    if (id && parseAll(getText()).definedIds.has(id)){
      banner.className = "warn-banner show";
      banner.innerHTML = `Location <b>${escapeHtml(id)}</b> is already recorded. Saving will add a duplicate entry. <button type="button" id="btnLoadExisting">Load &amp; edit existing</button>`;
      document.getElementById("btnLoadExisting").onclick = () => loadForEdit(id);
    } else {
      banner.className = "warn-banner";
      banner.innerHTML = "";
    }
  });

  document.querySelectorAll("#tabbar button").forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });

  wireDataTab();
  wireGraphTab();

  refreshEverything();

  if ("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW registration failed", err));
    });
  }
}

if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
