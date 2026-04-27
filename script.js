/* ================================================================
   AGGIE PORTAL IQ — script.js
   Page router · Roster Gaps · Portal Board · Coach Notes
   Strength Meter · Depth Chart · Admin Panel · Modals
================================================================ */
'use strict';

const POSITIONS = ['QB','RB','WR','TE','OL','EDGE','DL','LB','CB','S','K','P'];
const NEED_LABEL = { CRITICAL:'Critical Need', HIGH:'High Need', MEDIUM:'Medium Need', LOW:'Low Need' };
const ADMIN_PASSWORD = 'aggies2026';
const LS_OVERRIDES  = 'apiq_gap_overrides';
const LS_BOARD      = 'apiq_my_board';      // [{pos, playerName, fit_score, school, year, score_breakdown}]
const LS_NOTES      = 'apiq_coach_notes';   // {overall:'', QB:'', RB:...}
const LS_PRIORITIES = 'apiq_scheme_priorities'; // {DL:'run_stop', EDGE:'pass_rush', ...}

// Scheme priority options per position — each shifts the physical ideal window
const SCHEME_PRIORITIES = {
  QB:   [
    { value:'standard',  label:'Standard' },
    { value:'pocket',    label:'Pocket Passer — Bigger frame preferred',    htMod: 1, wtMod: 15 },
    { value:'dual',      label:'Dual Threat — Athletic build OK',            htMod:-1, wtMod:-20 },
  ],
  RB:   [
    { value:'standard',  label:'Standard' },
    { value:'power',     label:'Power Back — Bigger, harder to tackle',      htMod: 0, wtMod: 20 },
    { value:'speed',     label:'Speed / Receiving Back — Lighter frame',     htMod: 0, wtMod:-20 },
  ],
  WR:   [
    { value:'standard',  label:'Standard' },
    { value:'boundary',  label:'Boundary X Receiver — Tall & physical',      htMod: 2, wtMod: 10 },
    { value:'slot',      label:'Slot / YAC Threat — Smaller OK',             htMod:-2, wtMod:-15 },
  ],
  TE:   [
    { value:'standard',  label:'Standard' },
    { value:'blocking',  label:'Blocking TE — Heavier body',                 htMod: 0, wtMod: 20 },
    { value:'receiving', label:'Receiving TE — Athletic frame',              htMod: 0, wtMod:-20 },
  ],
  OL:   [
    { value:'standard',  label:'Standard' },
    { value:'power',     label:'Power / Gap Scheme — Heavier linemen',       htMod: 0, wtMod: 20 },
    { value:'zone',      label:'Zone Scheme — More athletic, lighter',        htMod: 0, wtMod:-20 },
  ],
  EDGE: [
    { value:'standard',  label:'Standard' },
    { value:'pass_rush', label:'Pass Rush Specialist — Lighter & faster',    htMod: 0, wtMod:-20 },
    { value:'run_stop',  label:'Run Stop / SAM — Bigger body',               htMod: 0, wtMod: 20 },
  ],
  DL:   [
    { value:'standard',  label:'Standard' },
    { value:'run_stop',  label:'Run Stopper — Need bigger DTs (run block fix)', htMod: 0, wtMod: 25 },
    { value:'pass_rush', label:'Pass Rush DT — Quicker, lighter',            htMod: 0, wtMod:-20 },
  ],
  LB:   [
    { value:'standard',  label:'Standard' },
    { value:'run_stuff', label:'Run Stopper ILB — Bigger',                   htMod: 0, wtMod: 20 },
    { value:'coverage',  label:'Coverage / WILL LB — Lighter & faster',     htMod: 0, wtMod:-20 },
  ],
  CB:   [
    { value:'standard',  label:'Standard' },
    { value:'press',     label:'Press Man Corner — Bigger & physical',       htMod: 2, wtMod: 10 },
    { value:'zone',      label:'Zone / Slot Corner — Shorter OK',            htMod:-2, wtMod:-10 },
  ],
  S:    [
    { value:'standard',  label:'Standard' },
    { value:'box',       label:'Box Safety / Strong Safety — Bigger',        htMod: 0, wtMod: 15 },
    { value:'free',      label:'Free Safety / Center Field — Lighter',       htMod: 0, wtMod:-15 },
  ],
  K:    [{ value:'standard', label:'Standard' }],
  P:    [{ value:'standard', label:'Standard' }],
};

// ---- State ----
let playersData  = {};
let rosterData   = {};
let activePos    = 'QB';
let viewMode     = 'cards';
let tableSortCol = 'fit_score';
let tableSortAsc = false;
let adminUnlocked = false;
let gapOverrides  = {};
let myBoard       = [];   // array of {pos, player}
let coachNotes       = {};
let schemePriorities = {};  // {pos: priorityValue}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadStorage();
  await Promise.all([loadPlayers(), loadRoster()]);
  buildOverviewNeeds();
  buildPosTabs();
  renderActivePosition();
  buildGapsPage();
  buildCoachNotes();
  renderBoard();
  bindUI();
  updateBoardBadge();
}

// ================================================================
// STORAGE
// ================================================================
function loadStorage() {
  try { gapOverrides = JSON.parse(localStorage.getItem(LS_OVERRIDES) || '{}'); } catch(e){ gapOverrides={}; }
  try { myBoard      = JSON.parse(localStorage.getItem(LS_BOARD)     || '[]'); } catch(e){ myBoard=[]; }
  try { coachNotes        = JSON.parse(localStorage.getItem(LS_NOTES)       || '{}'); } catch(e){ coachNotes={}; }
  try { schemePriorities  = JSON.parse(localStorage.getItem(LS_PRIORITIES)  || '{}'); } catch(e){ schemePriorities={}; }
}
function saveOverrides(){ try{ localStorage.setItem(LS_OVERRIDES, JSON.stringify(gapOverrides)); }catch(e){} }
function saveBoard()    { try{ localStorage.setItem(LS_BOARD,     JSON.stringify(myBoard));      }catch(e){} }
function saveNotes()       { try{ localStorage.setItem(LS_NOTES,       JSON.stringify(coachNotes));        }catch(e){} }
function savePriorities()  { try{ localStorage.setItem(LS_PRIORITIES,  JSON.stringify(schemePriorities)); }catch(e){} }

// ================================================================
// DATA LOADING
// ================================================================
async function loadPlayers() {
  try {
    const r = await fetch('data/players.json');
    if (!r.ok) throw new Error(r.status);
    playersData = await r.json();
  } catch(e) {
    console.warn('players.json not found — showing demo data');
    playersData = buildDemoPlayers();
  }
}

async function loadRoster() {
  try {
    const r = await fetch('data/roster.json');
    if (!r.ok) throw new Error(r.status);
    rosterData = await r.json();
    const dep = rosterData.summary?.departed_starters;
    if (dep) document.getElementById('stat-departed').textContent = dep;
    let prospects = 0;
    POSITIONS.forEach(p => { prospects += (playersData[p]||[]).length; });
    document.getElementById('stat-prospects').textContent = prospects || 120;
  } catch(e) {
    console.warn('roster.json not found');
    rosterData = buildDemoRoster();
  }
}

// ================================================================
// PAGE ROUTER
// ================================================================
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  const link = document.querySelector(`.nav-link[data-page="${name}"]`);
  if (link) link.classList.add('active');
  window.scrollTo(0, 0);

  // Refresh board when switching to gaps page
  if (name === 'gaps') { renderBoard(); updateBoardBadge(); }
}

// ================================================================
// NEED LEVEL HELPERS
// ================================================================
function getNeedLevel(pos) {
  return gapOverrides[pos] || rosterData?.need_levels?.[pos]?.level || 'MEDIUM';
}

function strengthBase(level) {
  return { CRITICAL:18, HIGH:38, MEDIUM:58, LOW:78 }[level] ?? 50;
}

function strengthAfter(level, topFitScore) {
  const base = strengthBase(level);
  const boost = Math.round((topFitScore / 100) * 30);
  return Math.min(98, base + boost);
}

// ================================================================
// LIVE PLAYER SCORING (respects overrides)
// ================================================================
function getLivePlayer(player, pos) {
  const level = getNeedLevel(pos);
  const base  = { CRITICAL:82, HIGH:68, MEDIUM:54, LOW:40 }[level] ?? 54;

  // Recompute physical score if a non-standard scheme priority is active
  const priority = getActivePriority(pos);
  let physical = player.score_breakdown.physical;
  let physAdjusted = false;
  if (priority && (player.height || player.weight)) {
    const adj = computeAdjustedPhysical(pos, player.height, player.weight, priority);
    if (adj !== null) { physical = adj; physAdjusted = true; }
  }

  const physBonus = Math.round((physical / 100) * 15);
  const scheme = Math.min(100, base + physBonus);
  const bd = player.score_breakdown;
  const fit = Math.max(0, Math.min(100, Math.round(
    bd.statistical * 0.35 + physical * 0.25 + scheme * 0.25 + bd.culture * 0.15
  )));
  return { ...player, fit_score: fit, score_breakdown: { ...bd, physical, scheme }, physAdjusted };
}

// Returns the active priority object for a position, or null if standard/unset
function getActivePriority(pos) {
  const val = schemePriorities[pos];
  if (!val || val === 'standard') return null;
  return (SCHEME_PRIORITIES[pos] || []).find(o => o.value === val) || null;
}

// Recompute physical score with shifted ideal window based on scheme priority
function computeAdjustedPhysical(pos, htStr, wtStr, priority) {
  const base = PHYSICAL_IDEALS[pos];
  if (!base) return null;
  const htMod = priority.htMod || 0;
  const wtMod = priority.wtMod || 0;
  const htLo = base.htLo + htMod;
  const htHi = base.htHi + htMod;
  const wtLo = base.wtLo + wtMod;
  const wtHi = base.wtHi + wtMod;
  const ht = parseHeightInches(htStr);
  const wt = wtStr ? parseInt(wtStr) : null;
  if (!ht && !wt) return null;  // No physicals to work with
  const htDev = ht ? Math.max(0, htLo - ht, ht - htHi) : 3;
  const wtDev = wt ? Math.max(0, wtLo - wt, wt - wtHi) : 20;
  const htScore = Math.max(0, Math.min(100, 100 - htDev * 8));
  const wtScore = Math.max(0, Math.min(100, 100 - wtDev * 0.8));
  return Math.round(htScore * 0.5 + wtScore * 0.5);
}

function getLivePlayers(pos) {
  return (playersData[pos] || [])
    .map(p => getLivePlayer(p, pos))
    .sort((a,b) => b.fit_score - a.fit_score);
}

// ================================================================
// SCORE HELPERS
// ================================================================
function scoreClass(s) { return s >= 75 ? 'score-green' : s >= 60 ? 'score-yellow' : 'score-red'; }
function scoreHex(s)   { return s >= 75 ? '#16a34a'     : s >= 60 ? '#ca8a04'      : '#dc2626'; }
function fitGrade(s) {
  if (s>=90) return 'A+'; if (s>=85) return 'A'; if (s>=80) return 'A-';
  if (s>=77) return 'B+'; if (s>=73) return 'B'; if (s>=70) return 'B-';
  if (s>=67) return 'C+'; if (s>=63) return 'C'; if (s>=60) return 'C-';
  return 'D';
}
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatStat(v, k) {
  if (v==null) return '—';
  const pct = ['Cmp%','TD%','Int%','XP%','FG%','TB%','IN20%'];
  if (pct.includes(k)) return (+v).toFixed(1)+'%';
  if (['Rate','Y/A','AY/A','Y/C','Y/R','Y/G','Avg','AVG'].includes(k)) return (+v).toFixed(1);
  return Number.isInteger(+v) ? +v : (+v).toFixed(0);
}

// ================================================================
// OVERVIEW NEEDS GRID
// ================================================================
function buildOverviewNeeds() {
  buildNeedsGrid('overview-needs-grid', pos => {
    showPage('gaps');
    openGapsTab('departures');
    openDeparturesModal(pos);
  });
}

function buildNeedsGrid(containerId, clickFn) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = '';
  POSITIONS.forEach(pos => {
    const level = getNeedLevel(pos);
    const lvl   = level.toLowerCase();
    const info  = rosterData?.need_levels?.[pos] || {};
    const dep   = info.departed || 0;
    const card  = document.createElement('div');
    card.className = `need-card ${lvl}`;
    card.innerHTML = `
      <div class="need-pos">${pos}</div>
      <div class="need-departed">${dep > 0 ? `${dep} starter${dep!==1?'s':''} departed` : 'Depth need'}</div>
      <span class="need-badge ${lvl}">${NEED_LABEL[level]}</span>`;
    card.addEventListener('click', () => clickFn(pos));
    grid.appendChild(card);
  });
}

// ================================================================
// POSITION TABS
// ================================================================
function buildPosTabs() {
  const el = document.getElementById('pos-tabs');
  if (!el) return;
  el.innerHTML = '';
  POSITIONS.forEach(pos => {
    const level = getNeedLevel(pos).toLowerCase();
    const btn = document.createElement('button');
    btn.className = `pos-tab${pos===activePos?' active':''}`;
    btn.setAttribute('role','tab');
    btn.innerHTML = `<span class="tab-need-dot ${level}"></span>${pos}`;
    btn.addEventListener('click', () => activatePosition(pos));
    el.appendChild(btn);
  });
}

function activatePosition(pos) {
  activePos = pos;
  document.querySelectorAll('.pos-tab').forEach(t => {
    const isActive = t.textContent.trim().endsWith(pos);
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive);
  });
  renderActivePosition();
}

// ================================================================
// PORTAL RANKINGS — RENDER
// ================================================================
function renderActivePosition() {
  const players  = getLivePlayers(activePos);
  const level    = getNeedLevel(activePos);
  const badge    = document.getElementById('active-need-badge');
  const priority = getActivePriority(activePos);
  if (badge) {
    const schemeTag = priority
      ? `<span class="scheme-active-badge">&#9881; ${priority.label.split(' — ')[0]}</span>`
      : '';
    badge.innerHTML = `<span class="need-badge ${level.toLowerCase()}">${activePos} · ${NEED_LABEL[level]}</span>${schemeTag}`;
  }
  if (viewMode === 'cards') renderCards(players);
  else renderTable(players);
}

// ---- Cards ----
function renderCards(players) {
  const el = document.getElementById('players-cards');
  el.classList.remove('hidden');
  document.getElementById('players-table-wrap').classList.add('hidden');
  el.innerHTML = '';

  if (!players.length) {
    el.innerHTML = '<div class="empty-state"><h3>No data</h3><p>Run extract_data.py first.</p></div>';
    return;
  }

  players.forEach((player, idx) => {
    const sc = scoreClass(player.fit_score);
    const bd = player.score_breakdown;
    const onBoard = isOnBoard(activePos, player.name);
    const statsHtml = buildStatsPreview(player.stats, activePos);
    const insightHtml = player.ai_insight
      ? `<div class="ai-insight"><div class="ai-insight-label">AI Scout Analysis</div>${escHtml(player.ai_insight)}</div>` : '';

    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML = `
      <div class="player-card-header">
        <div>
          <div class="player-rank">#${idx+1} · ${activePos}</div>
          <div class="player-name">${escHtml(player.name)}</div>
          <div class="player-meta">
            <span>${escHtml(player.school)}</span>
            <span class="player-meta-sep">·</span>
            <span>${escHtml(player.year)}</span>
            ${player.height||player.weight?`<span class="player-meta-sep">·</span><span class="player-physicals">${[player.height,player.weight?player.weight+' lbs':''].filter(Boolean).join(' / ')}</span>`:''}
          </div>
        </div>
        <div class="fit-score-block">
          <div class="fit-score-number ${sc}">${player.fit_score}</div>
          <div class="fit-score-grade">${fitGrade(player.fit_score)}</div>
        </div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-label"><span>Fit Score</span><span style="color:${scoreHex(player.fit_score)};font-weight:700">${player.fit_score}/100</span></div>
        <div class="score-bar"><div class="score-bar-fill ${sc}" style="width:${player.fit_score}%"></div></div>
      </div>
      <div class="factor-grid">
        <div class="factor-item"><div class="factor-name">Statistical</div><div class="factor-score ${scoreClass(bd.statistical)}">${bd.statistical}</div></div>
        <div class="factor-item"><div class="factor-name">Physical${player.physAdjusted ? ' <span class="adj-tag" title="Adjusted by Scheme Priority">✦</span>' : ''}</div><div class="factor-score ${scoreClass(bd.physical)}">${bd.physical}</div></div>
        <div class="factor-item"><div class="factor-name">Scheme Fit</div><div class="factor-score ${scoreClass(bd.scheme)}">${bd.scheme}</div></div>
        <div class="factor-item"><div class="factor-name">Culture Fit</div><div class="factor-score ${scoreClass(bd.culture)}">${bd.culture}</div></div>
      </div>
      ${statsHtml}
      ${insightHtml}
      <button class="add-board-btn${onBoard?' on-board':''}" data-pos="${activePos}" data-name="${escHtml(player.name)}">
        ${onBoard ? '✓ On Your Board' : '+ Add to Board'}
      </button>`;

    card.querySelector('.add-board-btn').addEventListener('click', e => {
      e.stopPropagation();
      toggleBoard(activePos, player);
      renderActivePosition();
      updateBoardBadge();
    });
    card.addEventListener('click', () => openPlayerModal(player, idx+1, activePos));
    el.appendChild(card);
  });
}

// ---- Table ----
function renderTable(players) {
  const sorted = [...players].sort((a,b) => {
    let va, vb;
    if      (tableSortCol==='name')      { va=a.name;   vb=b.name; }
    else if (tableSortCol==='school')    { va=a.school; vb=b.school; }
    else if (tableSortCol==='year')      { va=a.year;   vb=b.year; }
    else if (tableSortCol==='fit_score') { va=a.fit_score; vb=b.fit_score; }
    else { va=a.score_breakdown[tableSortCol]??0; vb=b.score_breakdown[tableSortCol]??0; }
    if (va<vb) return tableSortAsc?-1:1;
    if (va>vb) return tableSortAsc?1:-1;
    return 0;
  });

  const tbody = document.getElementById('players-tbody');
  tbody.innerHTML = '';
  sorted.forEach((player, idx) => {
    const bd = player.score_breakdown;
    const onBoard = isOnBoard(activePos, player.name);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="table-rank">${idx+1}</td>
      <td><div class="table-name">${escHtml(player.name)}</div></td>
      <td class="table-school">${escHtml(player.school)}</td>
      <td class="table-year">${escHtml(player.year)}</td>
      <td><span class="table-score ${scoreClass(player.fit_score)}">${player.fit_score}</span></td>
      <td class="table-factor">${bd.statistical}</td>
      <td class="table-factor">${bd.physical}</td>
      <td class="table-factor">${bd.scheme}</td>
      <td class="table-factor">${bd.culture}</td>
      <td><button class="add-board-btn${onBoard?' on-board':''}" style="width:auto;padding:4px 10px;font-size:10px" data-pos="${activePos}" data-name="${escHtml(player.name)}">${onBoard?'✓':'+'}</button></td>`;
    tr.querySelector('.add-board-btn').addEventListener('click', e => {
      e.stopPropagation();
      toggleBoard(activePos, player);
      renderActivePosition();
      updateBoardBadge();
    });
    tr.addEventListener('click', () => openPlayerModal(player, idx+1, activePos));
    tbody.appendChild(tr);
  });

  document.getElementById('players-cards').classList.add('hidden');
  document.getElementById('players-table-wrap').classList.remove('hidden');
}

// ================================================================
// STATS PREVIEW
// ================================================================
const KEY_PRIORITY = {
  QB:['Rate','Cmp%','Yds','TD','Int','Y/A'], RB:['Yds','Y/A','TD','Y/G','Rec'],
  WR:['Rec','Yds','Y/R','TD','Y/G'],         TE:['Rec','Yds','Y/R','TD'],
  OL:[],                                      EDGE:['Sk','TFL','Comb','FF','PD'],
  DL:['Sk','TFL','Comb','FF'],               LB:['Comb','TFL','Int','PD','FF'],
  CB:['Int','PD','Comb','TFL'],              S:['Int','PD','Comb','TFL'],
  K:['FG%','XP%','FGM','FGA','Pts'],         P:['AVG','PUNTS','IN20','TB'],
};

function buildStatsPreview(stats, pos) {
  if (!stats) return '';
  const keys = (KEY_PRIORITY[pos]||[]).filter(k => stats[k]!=null).slice(0,5);
  if (!keys.length) return '';
  const cells = keys.map(k => `<div class="modal-stat-cell"><div class="modal-stat-val">${formatStat(stats[k],k)}</div><div class="modal-stat-key">${k}</div></div>`).join('');
  return `<div style="margin-top:12px"><div class="modal-stats-title" style="font-size:10px;margin-bottom:6px">2025 Stats</div><div class="modal-stats-grid">${cells}</div></div>`;
}

// ================================================================
// PLAYER MODAL
// ================================================================
function openPlayerModal(player, rank, pos) {
  const bd = player.score_breakdown;
  const sc = scoreClass(player.fit_score);
  const onBoard = isOnBoard(pos, player.name);
  const statsHtml = buildFullStats(player.stats);
  const insightHtml = player.ai_insight
    ? `<div class="ai-insight" style="margin-top:16px"><div class="ai-insight-label">AI Scout Analysis</div>${escHtml(player.ai_insight)}</div>` : '';

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-header">
      <div class="modal-player-name">${escHtml(player.name)}</div>
      <div class="modal-player-meta">#${rank} · ${pos} · ${escHtml(player.school)} · ${escHtml(player.year)}${player.height?` · ${player.height}`:''}${player.weight?` / ${player.weight} lbs`:''}</div>
    </div>
    <div class="modal-body">
      <div class="modal-score-row">
        <div>
          <div class="modal-score-big ${sc}">${player.fit_score}</div>
          <div style="font-size:12px;color:var(--gray-400);margin-top:2px">${fitGrade(player.fit_score)} Fit</div>
        </div>
        <div class="modal-factor-bars">
          ${buildFactorBar('Statistical',bd.statistical)}
          ${buildFactorBar('Physical',bd.physical)}
          ${buildFactorBar('Scheme',bd.scheme)}
          ${buildFactorBar('Culture',bd.culture)}
        </div>
      </div>
      ${statsHtml}
      ${insightHtml}
      <button class="add-board-btn${onBoard?' on-board':''}" id="modal-board-btn" style="margin-top:16px">
        ${onBoard ? '✓ On Your Board — Click to Remove' : '+ Add to My 2026 Board'}
      </button>
    </div>`;

  document.getElementById('modal-board-btn').addEventListener('click', () => {
    toggleBoard(pos, player);
    openPlayerModal(player, rank, pos);
    renderActivePosition();
    updateBoardBadge();
  });

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function buildFactorBar(label, score) {
  return `<div class="modal-factor-row">
    <div class="modal-factor-name">${label}</div>
    <div class="modal-factor-bar"><div class="modal-factor-fill" style="width:${score}%;background:${scoreHex(score)}"></div></div>
    <div class="modal-factor-val">${score}</div>
  </div>`;
}

function buildFullStats(stats) {
  if (!stats) return '';
  const entries = Object.entries(stats).filter(([,v]) => v!=null);
  if (!entries.length) return '';
  const cells = entries.map(([k,v]) => `<div class="modal-stat-cell"><div class="modal-stat-val">${formatStat(v,k)}</div><div class="modal-stat-key">${k}</div></div>`).join('');
  return `<div class="modal-stats-title">2025 Season Statistics</div><div class="modal-stats-grid">${cells}</div>`;
}

// ================================================================
// GAPS PAGE
// ================================================================
function buildGapsPage() {
  buildNeedsGrid('gaps-needs-grid', pos => openDeparturesModal(pos));
  buildRoster2026();
}

function openGapsTab(tab) {
  document.querySelectorAll('.gaps-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.gaps-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.gaps-tab[data-gaps-tab="${tab}"]`);
  const panel = document.getElementById(`gaps-${tab}`);
  if (btn)   btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

// ---- Departures modal ----
function openDeparturesModal(pos) {
  const level  = getNeedLevel(pos);
  const info   = rosterData?.need_levels?.[pos] || {};
  const dep    = info.departed || 0;
  const departed = (rosterData?.departed_players || []).filter(p => p.position === pos);

  function depBadgeClass(d) {
    const dl = (d||'').toLowerCase();
    if (dl.includes('nfl')) return 'dep-nfl';
    if (dl.includes('portal') || dl.includes('transfer')) return 'dep-portal';
    if (dl.includes('grad')) return 'dep-grad';
    return 'dep-other';
  }
  function depLabel(d) {
    const dl = (d||'').toLowerCase();
    if (dl.includes('nfl')) return 'NFL Draft';
    if (dl.includes('portal') || dl.includes('transfer')) return 'Transfer Portal';
    if (dl.includes('grad')) return 'Graduated';
    return d || 'Departed';
  }

  const rows = departed.length
    ? departed.map(p => `
      <div class="dep-player-row">
        <div>
          <div class="dep-player-name">${escHtml(p.name)}</div>
          <div class="dep-player-detail">${escHtml(p.designation)||'—'} ${p.year?'· '+escHtml(p.year):''}</div>
        </div>
        <span class="dep-departure-badge ${depBadgeClass(p.departure)}">${depLabel(p.departure)}</span>
      </div>`).join('')
    : `<p style="color:var(--gray-400);font-size:13px;padding:20px 0">No departure records found. Run extract_data.py to load.</p>`;

  document.getElementById('dep-modal-content').innerHTML = `
    <div class="dep-modal-pos-header">
      <div class="dep-modal-pos-title">${pos} — 2025 Departures</div>
      <div class="dep-modal-pos-sub">${dep} starter${dep!==1?'s':''} departed · ${NEED_LABEL[level]}</div>
    </div>
    <div class="dep-player-list">${rows}</div>`;

  document.getElementById('dep-modal-overlay').classList.remove('hidden');
}

// ---- 2026 Roster ----
// Physical ideal ranges per position (matches extract_data.py)
const PHYSICAL_IDEALS = {
  QB:   {htLo:73,htHi:77,wtLo:210,wtHi:240},
  RB:   {htLo:68,htHi:73,wtLo:200,wtHi:230},
  WR:   {htLo:70,htHi:76,wtLo:175,wtHi:215},
  TE:   {htLo:75,htHi:79,wtLo:240,wtHi:265},
  OL:   {htLo:75,htHi:79,wtLo:300,wtHi:340},
  EDGE: {htLo:74,htHi:77,wtLo:245,wtHi:275},
  DL:   {htLo:74,htHi:77,wtLo:280,wtHi:320},
  LB:   {htLo:72,htHi:76,wtLo:225,wtHi:255},
  CB:   {htLo:70,htHi:74,wtLo:185,wtHi:205},
  S:    {htLo:71,htHi:75,wtLo:200,wtHi:220},
  K:    {htLo:69,htHi:74,wtLo:175,wtHi:210},
  P:    {htLo:71,htHi:76,wtLo:185,wtHi:220},
};

function parseHeightInches(ht) {
  if (!ht) return null;
  const m = String(ht).match(/(\d+)['\-]\s*(\d+)/);
  return m ? parseInt(m[1])*12 + parseInt(m[2]) : null;
}

function physicalGrade(pos, htStr, wtStr) {
  const ideal = PHYSICAL_IDEALS[pos];
  if (!ideal) return { score: 60, htStatus: '—', wtStatus: '—' };
  const ht = parseHeightInches(htStr);
  const wt = wtStr ? parseInt(wtStr) : null;
  const inHt = ht === null ? false : ht >= ideal.htLo && ht <= ideal.htHi;
  const inWt = wt === null ? false : wt >= ideal.wtLo && wt <= ideal.wtHi;
  const htDev = ht ? Math.max(0, ideal.htLo - ht, ht - ideal.htHi) : 3;
  const wtDev = wt ? Math.max(0, ideal.wtLo - wt, wt - ideal.wtHi) : 20;
  const htScore = Math.max(0, Math.min(100, 100 - htDev * 8));
  const wtScore = Math.max(0, Math.min(100, 100 - wtDev * 0.8));
  const score = Math.round(htScore * 0.5 + wtScore * 0.5);
  const htIdeal = `${Math.floor(ideal.htLo/12)}'${ideal.htLo%12}"–${Math.floor(ideal.htHi/12)}'${ideal.htHi%12}"`;
  const wtIdeal = `${ideal.wtLo}–${ideal.wtHi} lbs`;
  return { score, htIdeal, wtIdeal, inHt, inWt };
}

function classLabel(yr) {
  if (!yr) return 'Unknown';
  const y = yr.toLowerCase();
  if (y.includes('fr') || y.includes('freshman')) return 'Freshman';
  if (y.includes('so') || y.includes('sophomore')) return 'Sophomore';
  if (y.includes('jr') || y.includes('junior')) return 'Junior';
  if (y.includes('sr') || y.includes('senior')) return 'Senior';
  if (y.includes('gr') || y.includes('grad')) return 'Graduate';
  if (y.includes('5th') || y.includes('fifth')) return '5th Year';
  return yr;
}

function openRosterPlayerModal(player) {
  const ideal = PHYSICAL_IDEALS[player.position] || {};
  const grade = physicalGrade(player.position, player.height, player.weight);
  const sc = scoreClass(grade.score);
  const yrLabel = classLabel(player.year);

  const htIn = parseHeightInches(player.height);
  const htDisplay = htIn ? `${Math.floor(htIn/12)}'${htIn%12}"` : (player.height || '—');
  const wtDisplay = player.weight ? `${player.weight} lbs` : '—';

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-header">
      <div class="modal-player-name">${escHtml(player.name)}</div>
      <div class="modal-player-meta">${player.position} · ${yrLabel} · Texas A&amp;M</div>
    </div>
    <div class="modal-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div class="modal-stat-cell" style="padding:14px">
          <div class="modal-stat-val" style="font-size:22px">${htDisplay}</div>
          <div class="modal-stat-key">Height</div>
          <div style="font-size:10px;color:${grade.inHt?'var(--score-green)':'var(--score-yellow)'};margin-top:3px;font-weight:600">
            ${grade.inHt ? '✓ Ideal range' : `Ideal: ${grade.htIdeal}`}
          </div>
        </div>
        <div class="modal-stat-cell" style="padding:14px">
          <div class="modal-stat-val" style="font-size:22px">${wtDisplay}</div>
          <div class="modal-stat-key">Weight</div>
          <div style="font-size:10px;color:${grade.inWt?'var(--score-green)':'var(--score-yellow)'};margin-top:3px;font-weight:600">
            ${grade.inWt ? '✓ Ideal range' : `Ideal: ${grade.wtIdeal}`}
          </div>
        </div>
      </div>

      <div class="modal-stats-title">Physical Profile Match — ${player.position}</div>
      <div style="margin:10px 0 4px;display:flex;justify-content:space-between;font-size:12px;color:var(--gray-600)">
        <span>A&amp;M Physical Fit Score</span>
        <span style="font-weight:700;color:${scoreHex(grade.score)}">${grade.score}/100</span>
      </div>
      <div class="score-bar" style="height:8px;margin-bottom:16px">
        <div class="score-bar-fill ${sc}" style="width:${grade.score}%"></div>
      </div>

      <div style="background:var(--gray-100);border-radius:var(--radius-md);padding:12px 14px;font-size:12px;color:var(--gray-600);line-height:1.6">
        <strong style="color:var(--gray-800)">A&amp;M ${player.position} Prototype:</strong>
        ${grade.htIdeal} · ${grade.wtIdeal}<br/>
        ${grade.score >= 80 ? `${player.name.split(' ')[0]} fits the physical profile for this position at A&M.` :
          grade.score >= 60 ? `${player.name.split(' ')[0]} is close to the ideal profile — may need development.` :
          `${player.name.split(' ')[0]}'s frame is a project fit for this position at A&M.`}
      </div>

      <div style="margin-top:16px;padding:10px 14px;background:#f5f3ff;border-radius:var(--radius-md);border-left:3px solid #7c3aed;font-size:12px;color:var(--gray-600)">
        <strong style="color:#7c3aed;display:block;margin-bottom:3px;font-size:10px;text-transform:uppercase;letter-spacing:.6px">Coming Soon</strong>
        AI-generated player bio — run generate_insights.py once you have an Anthropic API key.
      </div>
    </div>`;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function buildRoster2026() {
  const el = document.getElementById('roster2026-content');
  if (!el) return;
  const current = rosterData?.current_roster_2026 || [];

  if (!current.length) {
    el.innerHTML = '<div class="empty-state"><h3>No 2026 roster data</h3><p>Run extract_data.py to load your 2026 roster.</p></div>';
    return;
  }

  const byPos = {};
  POSITIONS.forEach(p => { byPos[p] = []; });
  current.forEach(player => { if (byPos[player.position]) byPos[player.position].push(player); });

  el.innerHTML = POSITIONS.filter(p => byPos[p].length > 0).map(pos => `
    <div class="roster2026-pos-group">
      <div class="roster2026-pos-title">${pos} (${byPos[pos].length})</div>
      <div class="roster2026-grid">
        ${byPos[pos].map(p => `
          <div class="roster2026-player clickable" data-name="${escHtml(p.name)}" data-pos="${p.position}">
            <div class="roster2026-player-name">${escHtml(p.name)}</div>
            <div class="roster2026-player-meta">${[classLabel(p.year), p.height ? p.height : '', p.weight ? p.weight+' lbs' : ''].filter(Boolean).join(' · ')}</div>
            <div style="font-size:10px;color:var(--gray-400);margin-top:4px">Click for profile →</div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  // Bind click handlers
  el.querySelectorAll('.roster2026-player.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.name;
      const pos  = card.dataset.pos;
      const player = current.find(p => p.name === name && p.position === pos);
      if (player) openRosterPlayerModal(player);
    });
  });
}

// ---- Coach Notes ----
function buildCoachNotes() {
  const overall = document.getElementById('notes-overall');
  if (overall) {
    overall.value = coachNotes.overall || '';
    overall.addEventListener('input', () => { coachNotes.overall = overall.value; saveNotes(); });
  }

  const container = document.getElementById('notes-positions');
  if (!container) return;
  container.innerHTML = `<div class="notes-pos-grid">${POSITIONS.map(pos => {
    const level    = getNeedLevel(pos);
    const opts     = SCHEME_PRIORITIES[pos] || [];
    const curPri   = schemePriorities[pos] || 'standard';
    const hasOpts  = opts.length > 1;
    const priorityRow = hasOpts ? `
      <div class="notes-priority-row">
        <label class="notes-priority-label">Targeting</label>
        <select class="notes-priority-select" id="priority-${pos}">
          ${opts.map(o => `<option value="${o.value}" ${curPri===o.value?'selected':''}>${o.label.split(' — ')[0]}</option>`).join('')}
        </select>
        ${curPri !== 'standard' ? `<span class="notes-priority-active-dot" title="Rankings adjusted"></span>` : ''}
      </div>` : '';
    return `<div class="notes-pos-card">
      <div class="notes-pos-card-header">
        <span class="notes-pos-abbr">${pos}</span>
        <span class="need-badge ${level.toLowerCase()} notes-pos-need">${NEED_LABEL[level]}</span>
      </div>
      ${priorityRow}
      <textarea class="notes-pos-textarea" id="note-${pos}" placeholder="Notes on ${pos} gaps, targets, priorities...">${escHtml(coachNotes[pos]||'')}</textarea>
    </div>`;
  }).join('')}</div>`;

  POSITIONS.forEach(pos => {
    // Notes auto-save
    const ta = document.getElementById(`note-${pos}`);
    if (ta) ta.addEventListener('input', () => { coachNotes[pos] = ta.value; saveNotes(); });

    // Scheme priority auto-saves and immediately re-ranks portal players
    const sel = document.getElementById(`priority-${pos}`);
    if (sel) {
      sel.addEventListener('change', () => {
        schemePriorities[pos] = sel.value;
        savePriorities();
        // Refresh dot indicator
        const dot = sel.closest('.notes-priority-row')?.querySelector('.notes-priority-active-dot');
        if (dot) dot.style.display = sel.value !== 'standard' ? 'inline-block' : 'none';
        else if (sel.value !== 'standard') {
          const span = document.createElement('span');
          span.className = 'notes-priority-active-dot';
          span.title = 'Rankings adjusted';
          sel.closest('.notes-priority-row').appendChild(span);
        }
        // Re-rank portal players live
        if (pos === activePos) renderActivePosition();
      });
    }
  });
}

// ================================================================
// MY PORTAL BOARD
// ================================================================
function isOnBoard(pos, name) {
  return myBoard.some(e => e.pos === pos && e.player.name === name);
}

function toggleBoard(pos, player) {
  if (isOnBoard(pos, player.name)) {
    myBoard = myBoard.filter(e => !(e.pos===pos && e.player.name===player.name));
  } else {
    myBoard.push({ pos, player: getLivePlayer(player, pos) });
  }
  saveBoard();
  renderBoard();
}

function updateBoardBadge() {
  const badge = document.getElementById('board-count-badge');
  if (badge) badge.textContent = myBoard.length || '';
}

function renderBoard() {
  const el = document.getElementById('board-content');
  if (!el) return;
  updateBoardBadge();

  if (!myBoard.length) {
    el.innerHTML = `<div class="empty-state">
      <h3>No players added yet</h3>
      <p>Go to <strong>Portal Rankings</strong> and click <strong>+ Add to Board</strong> on any player card.</p>
      <button class="btn btn-primary" data-page="rankings" style="margin-top:16px">Go to Rankings</button>
    </div>`;
    el.querySelector('[data-page]')?.addEventListener('click', e => showPage(e.currentTarget.dataset.page));
    return;
  }

  // Group board by position
  const byPos = {};
  myBoard.forEach(entry => {
    if (!byPos[entry.pos]) byPos[entry.pos] = [];
    byPos[entry.pos].push(entry);
  });

  el.innerHTML = POSITIONS.filter(p => byPos[p]).map(pos => {
    const entries    = byPos[pos].sort((a,b) => b.player.fit_score - a.player.fit_score);
    const level      = getNeedLevel(pos);
    const current    = (rosterData?.current_roster_2026||[]).filter(p => p.position===pos);
    const topFit     = entries[0]?.player.fit_score || 0;
    const before     = strengthBase(level);
    const after      = strengthAfter(level, topFit);
    const change     = after - before;
    const afterClass = scoreClass(after);

    // Depth chart: portal additions first, then current roster
    const depthRows = [
      ...entries.map((e,i) => `
        <div class="depth-chart-row portal-addition">
          <span class="depth-slot">P${i+1}</span>
          <div style="flex:1">
            <div class="depth-name">${escHtml(e.player.name)}</div>
            <div class="depth-school">${escHtml(e.player.school)} · ${escHtml(e.player.year)}</div>
          </div>
          <span class="depth-portal-tag">Portal</span>
          <span class="depth-score ${scoreClass(e.player.fit_score)}" style="margin-left:8px">${e.player.fit_score}</span>
          <button class="depth-remove-btn" title="Remove" data-pos="${pos}" data-name="${escHtml(e.player.name)}">✕</button>
        </div>`),
      ...current.slice(0,4).map((p,i) => `
        <div class="depth-chart-row">
          <span class="depth-slot">${i+1}</span>
          <div style="flex:1">
            <div class="depth-name">${escHtml(p.name)}</div>
            <div class="depth-school">${escHtml(p.year)||'Returning'}</div>
          </div>
          <span class="depth-school" style="font-size:11px">Returning</span>
        </div>`),
    ].join('');

    return `
      <div class="board-pos-section">
        <div class="board-pos-header">
          <div>
            <div class="board-pos-title">${pos}</div>
            <div class="board-pos-subtitle">${entries.length} portal addition${entries.length!==1?'s':''} · ${NEED_LABEL[level]}</div>
          </div>
          <span class="need-badge ${level.toLowerCase()}">${level}</span>
        </div>
        <div class="strength-meter-wrap">
          <div class="strength-meter-labels">
            <span>Position Strength</span>
            <span style="color:${scoreHex(after)};font-weight:700">${after}/100</span>
          </div>
          <div class="strength-meter-bar">
            <div class="strength-meter-before" style="width:${before}%"></div>
            <div class="strength-meter-after ${afterClass}" style="width:${after}%"></div>
          </div>
          <div class="strength-meter-change">▲ +${change} improvement from portal additions</div>
        </div>
        <div class="depth-chart">${depthRows}</div>
      </div>`;
  }).join('');

  // Bind remove buttons
  el.querySelectorAll('.depth-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pos  = btn.dataset.pos;
      const name = btn.dataset.name;
      myBoard = myBoard.filter(e => !(e.pos===pos && e.player.name===name));
      saveBoard();
      renderBoard();
      renderActivePosition();
      updateBoardBadge();
    });
  });
}

// ================================================================
// ADMIN PANEL
// ================================================================
function openAdmin() {
  document.getElementById('admin-overlay').classList.remove('hidden');
  if (adminUnlocked) showAdminContent();
}
function closeAdmin() { document.getElementById('admin-overlay').classList.add('hidden'); }

function showAdminContent() {
  document.getElementById('admin-auth').classList.add('hidden');
  document.getElementById('admin-content').classList.remove('hidden');

  // --- Gap Overrides ---
  const cont = document.getElementById('admin-positions');
  cont.innerHTML = '';
  POSITIONS.forEach(pos => {
    const cur = gapOverrides[pos] || rosterData?.need_levels?.[pos]?.level || 'MEDIUM';
    const row = document.createElement('div');
    row.className = 'admin-pos-row';
    row.innerHTML = `
      <div class="admin-pos-label">${pos}</div>
      <select class="admin-status-select" id="admin-select-${pos}">
        <option value="CRITICAL" ${cur==='CRITICAL'?'selected':''}>Critical Need</option>
        <option value="HIGH"     ${cur==='HIGH'?'selected':''}>High Need</option>
        <option value="MEDIUM"   ${cur==='MEDIUM'?'selected':''}>Medium Need</option>
        <option value="LOW"      ${cur==='LOW'?'selected':''}>Low / Filled</option>
      </select>`;
    cont.appendChild(row);
  });

}

function saveAdminOverrides() {
  // Save gap overrides
  POSITIONS.forEach(pos => {
    const s = document.getElementById(`admin-select-${pos}`);
    if (s) gapOverrides[pos] = s.value;
  });
  saveOverrides();
  buildOverviewNeeds();
  buildPosTabs();
  buildNeedsGrid('gaps-needs-grid', pos => openDeparturesModal(pos));
  renderActivePosition();
  buildCoachNotes();
  closeAdmin();
}

// ================================================================
// BIND ALL UI
// ================================================================
function bindUI() {
  // Nav links (pages)
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      showPage(e.currentTarget.dataset.page);
    });
  });

  // Gaps sub-tabs
  document.querySelectorAll('.gaps-tab').forEach(btn => {
    btn.addEventListener('click', () => openGapsTab(btn.dataset.gapsTab));
  });

  // View toggle
  document.getElementById('view-cards').addEventListener('click', () => {
    viewMode = 'cards';
    document.getElementById('view-cards').classList.add('active');
    document.getElementById('view-table').classList.remove('active');
    renderActivePosition();
  });
  document.getElementById('view-table').addEventListener('click', () => {
    viewMode = 'table';
    document.getElementById('view-table').classList.add('active');
    document.getElementById('view-cards').classList.remove('active');
    renderActivePosition();
  });

  // Table sort
  document.querySelectorAll('.players-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (tableSortCol===col) tableSortAsc = !tableSortAsc;
      else { tableSortCol=col; tableSortAsc = col==='name'||col==='school'; }
      document.querySelectorAll('.players-table th').forEach(h => h.classList.remove('sort-asc','sort-desc','sort-active'));
      th.classList.add('sort-active', tableSortAsc?'sort-asc':'sort-desc');
      renderActivePosition();
    });
  });

  // Admin
  document.getElementById('admin-trigger').addEventListener('click', e => { e.preventDefault(); openAdmin(); });
  document.getElementById('admin-close').addEventListener('click', closeAdmin);
  document.getElementById('admin-login-btn').addEventListener('click', () => {
    const pw = document.getElementById('admin-password').value;
    if (pw === ADMIN_PASSWORD) { adminUnlocked=true; showAdminContent(); }
    else {
      const inp = document.getElementById('admin-password');
      inp.style.borderColor='#dc2626'; inp.value=''; inp.placeholder='Incorrect password';
      setTimeout(()=>{ inp.style.borderColor=''; inp.placeholder='Password'; }, 2000);
    }
  });
  document.getElementById('admin-password').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('admin-login-btn').click(); });
  document.getElementById('admin-save-btn').addEventListener('click', saveAdminOverrides);
  document.getElementById('admin-reset-btn').addEventListener('click', () => {
    if (confirm('Reset all gap overrides to original values?')) {
      gapOverrides={}; saveOverrides(); showAdminContent();
    }
  });
  document.getElementById('admin-overlay').addEventListener('click', e => { if(e.target===document.getElementById('admin-overlay')) closeAdmin(); });

  // Player modal close
  document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-overlay').classList.add('hidden'));
  document.getElementById('modal-overlay').addEventListener('click', e => { if(e.target===document.getElementById('modal-overlay')) document.getElementById('modal-overlay').classList.add('hidden'); });

  // Departures modal close
  document.getElementById('dep-modal-close').addEventListener('click', () => document.getElementById('dep-modal-overlay').classList.add('hidden'));
  document.getElementById('dep-modal-overlay').addEventListener('click', e => { if(e.target===document.getElementById('dep-modal-overlay')) document.getElementById('dep-modal-overlay').classList.add('hidden'); });

  // Clear board
  document.getElementById('clear-board-btn')?.addEventListener('click', () => {
    if (confirm('Clear your entire portal board?')) { myBoard=[]; saveBoard(); renderBoard(); renderActivePosition(); updateBoardBadge(); }
  });

  // Escape closes any modal
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') {
      document.getElementById('modal-overlay').classList.add('hidden');
      document.getElementById('dep-modal-overlay').classList.add('hidden');
      document.getElementById('admin-overlay').classList.add('hidden');
    }
  });
}

// ================================================================
// DEMO DATA
// ================================================================
function buildDemoPlayers() {
  const schools=['Alabama','Georgia','Ohio State','Michigan','Oregon','Tennessee','LSU','Auburn','Florida','Texas'];
  const years=['Junior','Senior','Sophomore','5th Year'];
  const demo={};
  POSITIONS.forEach(pos => {
    demo[pos]=Array.from({length:10},(_,i)=>{
      const stat=55+Math.floor(Math.random()*40), phys=55+Math.floor(Math.random()*40);
      const scheme=55+Math.floor(Math.random()*38), cult=55+Math.floor(Math.random()*38);
      const fit=Math.round(stat*.35+phys*.25+scheme*.25+cult*.15);
      return {name:`Player ${i+1} (Demo)`,school:schools[i%schools.length],year:years[i%years.length],
        height:`6-${1+(i%4)}`,weight:210+i*8,stats:{},fit_score:Math.max(40,Math.min(99,fit)),
        fit_grade:fitGrade(fit),score_breakdown:{statistical:stat,physical:phys,scheme,culture:cult},ai_insight:null};
    }).sort((a,b)=>b.fit_score-a.fit_score);
  });
  return demo;
}

function buildDemoRoster() {
  const levels={QB:'HIGH',RB:'CRITICAL',WR:'HIGH',TE:'MEDIUM',OL:'HIGH',EDGE:'CRITICAL',DL:'HIGH',LB:'HIGH',CB:'CRITICAL',S:'HIGH',K:'MEDIUM',P:'LOW'};
  const dep={QB:1,RB:3,WR:2,TE:1,OL:3,EDGE:3,DL:2,LB:2,CB:3,S:2,K:1,P:0};
  const need_levels={};
  POSITIONS.forEach(p=>{need_levels[p]={level:levels[p],departed:dep[p],returning:4};});
  return {summary:{total_players:130,departed_starters:19,season:'2026'},need_levels,departed_players:[],current_roster_2026:[]};
}
