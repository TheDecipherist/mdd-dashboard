export function getTemplate(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MDD Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css">
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3}
#app{display:flex;flex-direction:column;height:100%}
/* Toolbar */
#toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#161b22;border-bottom:1px solid #30363d;flex-shrink:0;flex-wrap:wrap}
#toolbar input{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:4px 8px;font-size:13px;width:180px}
#toolbar input::placeholder{color:#8b949e}
.chip{background:#21262d;border:1px solid #30363d;border-radius:20px;color:#8b949e;cursor:pointer;font-size:12px;padding:3px 10px;white-space:nowrap;transition:all .15s}
.chip.active,.chip:hover{background:#388bfd22;border-color:#388bfd;color:#e6edf3}
.chip.active{background:#388bfd33}
select{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:4px 8px;font-size:13px}
button{background:#21262d;border:1px solid #30363d;border-radius:6px;color:#e6edf3;cursor:pointer;font-size:12px;padding:4px 10px;transition:all .15s}
button:hover{background:#30363d}
button.active{background:#388bfd33;border-color:#388bfd}
#adv-badge{background:#ef4444;border-radius:10px;color:#fff;font-size:10px;padding:1px 5px;margin-left:4px;display:none}
/* Active filters bar */
#filters-bar{display:none;align-items:center;gap:6px;padding:5px 12px;background:#161b22;border-bottom:1px solid #30363d;flex-shrink:0;flex-wrap:wrap}
.filter-chip{align-items:center;background:#388bfd22;border:1px solid #388bfd44;border-radius:20px;color:#8b949e;cursor:pointer;display:inline-flex;font-size:11px;gap:4px;padding:2px 8px}
.filter-chip:hover{border-color:#388bfd}
#clear-all-btn{color:#8b949e;font-size:11px;cursor:pointer;background:none;border:none;margin-left:auto}
/* Advanced panel */
#adv-panel{display:none;background:#161b22;border-bottom:1px solid #30363d;padding:10px 14px;flex-shrink:0}
#adv-panel.open{display:flex;flex-wrap:wrap;gap:10px 20px}
#adv-panel label{color:#8b949e;font-size:12px;display:flex;flex-direction:column;gap:3px}
#adv-panel input,#adv-panel select{background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6edf3;font-size:12px;padding:3px 6px}
.adv-header{width:100%;display:flex;justify-content:space-between;align-items:center;color:#8b949e;font-size:12px}
.git-divider{width:100%;border:none;border-top:1px solid #30363d;margin:4px 0}
/* Canvas */
#canvas-wrap{flex:1;position:relative;overflow:hidden}
svg#graph{width:100%;height:100%;cursor:default}
/* Shared badges */
.badge{border-radius:12px;font-size:11px;padding:2px 8px;display:inline-block;margin-right:4px}
.badge-type{background:#21262d;color:#8b949e}
.badge-status-complete{background:#22c55e22;color:#22c55e}
.badge-status-in_progress{background:#f59e0b22;color:#f59e0b}
.badge-status-draft{background:#6b728022;color:#6b7280}
.badge-status-active{background:#0ea5e922;color:#0ea5e9}
.badge-status-planned{background:#8b5cf622;color:#8b5cf6}
.badge-status-deprecated{background:#37415122;color:#6b7280}
.badge-status-cancelled{background:#ef444422;color:#ef4444}
.badge-modified{background:#f59e0b22;color:#f59e0b}
.dep-chip{background:#21262d;border:1px solid #30363d;border-radius:12px;color:#8b949e;cursor:pointer;display:inline-block;font-size:12px;margin:2px;padding:2px 8px}
.dep-chip:hover{border-color:#388bfd;color:#e6edf3}
.git-info{color:#8b949e;font-size:12px}
.git-hash{background:#21262d;border-radius:4px;font-family:monospace;font-size:11px;padding:1px 4px}
#view-history-btn{background:none;border:1px solid #30363d;border-radius:6px;color:#8b949e;cursor:pointer;font-size:11px;margin-top:6px;padding:3px 8px}
#view-history-btn:hover{color:#e6edf3}
#commit-list{max-height:240px;overflow-y:auto;margin-top:6px}
.commit-item{border-bottom:1px solid #21262d;font-size:11px;padding:5px 0}
.commit-item .cm-msg{color:#e6edf3}
.commit-item .cm-meta{color:#8b949e;margin-top:2px}
.skeleton{animation:pulse 1.5s ease-in-out infinite;background:#21262d;border-radius:4px;height:12px;margin:6px 0}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
/* ── Viewer overlay ──────────────────────────────────────────────────────────── */
#viewer-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(3px);z-index:50;display:none}
#viewer-backdrop.open{display:block}
#viewer{position:fixed;inset:30px;background:#0d1117;border:1px solid #30363d;border-radius:10px;z-index:51;display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.8)}
#viewer.open{display:flex}
#viewer-header{background:#161b22;border-bottom:1px solid #30363d;padding:12px 20px;flex-shrink:0;display:flex;align-items:flex-start;gap:0}
#viewer-header-content{flex:1;min-width:0}
#viewer-title-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap}
#viewer-id-label{color:#8b949e;font-size:11px;font-family:monospace;background:#21262d;border-radius:4px;padding:1px 6px;flex-shrink:0}
#viewer-title{font-size:18px;font-weight:700;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#viewer-badges{display:flex;align-items:center;flex-wrap:wrap;gap:4px}
#viewer-meta-bar{display:flex;align-items:center;flex-wrap:wrap;gap:0;font-size:12px;color:#8b949e}
.meta-sep{color:#30363d;padding:0 5px}
.sync-synced{color:#22c55e}
.sync-modified{color:#f59e0b}
.badge-phase{background:#8b5cf622;color:#8b5cf6}
#viewer-close{background:none;border:1px solid #30363d;border-radius:6px;color:#8b949e;cursor:pointer;flex-shrink:0;font-size:16px;height:32px;line-height:1;margin-left:16px;padding:0 10px;transition:all .15s}
#viewer-close:hover{background:#30363d;color:#e6edf3}
#viewer-main{display:flex;flex:1;overflow:hidden}
#viewer-sidebar{background:#161b22;border-right:1px solid #30363d;flex-shrink:0;overflow-y:auto;padding:14px 16px;width:260px}
#viewer-body{flex:1;font-size:14px;line-height:1.75;overflow-y:auto;padding:24px 32px}
.viewer-section{margin-bottom:18px}
.viewer-section h4{color:#8b949e;font-size:11px;font-weight:600;letter-spacing:.06em;margin-bottom:8px;text-transform:uppercase}
.src-file-btn{background:none;border:1px solid #30363d;border-radius:6px;color:#8b949e;cursor:pointer;display:block;font-family:monospace;font-size:11px;margin:3px 0;padding:5px 8px;text-align:left;transition:all .15s;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.src-file-btn:hover{background:#161b22;border-color:#388bfd;color:#388bfd}
.copy-btn{position:absolute;top:8px;right:8px;background:#21262d;border:1px solid #30363d;border-radius:5px;color:#8b949e;cursor:pointer;font-size:11px;padding:3px 8px;transition:all .15s;opacity:0;z-index:1}
#viewer-body pre:hover .copy-btn{opacity:1}
.copy-btn:hover{background:#30363d;color:#e6edf3}
#viewer-body h1,#viewer-body h2,#viewer-body h3,#viewer-body h4{color:#e6edf3;font-weight:600;margin:22px 0 9px}
#viewer-body h1{font-size:22px;border-bottom:1px solid #30363d;padding-bottom:9px}
#viewer-body h2{font-size:18px;border-bottom:1px solid #21262d;padding-bottom:6px}
#viewer-body h3{font-size:15px}
#viewer-body p{color:#c9d1d9;margin:9px 0}
#viewer-body a{color:#388bfd;text-decoration:none}
#viewer-body a:hover{text-decoration:underline}
#viewer-body code{background:#161b22;border:1px solid #30363d;border-radius:4px;font-size:12px;padding:2px 5px;color:#f97583}
#viewer-body pre{background:#161b22;border:1px solid #30363d;border-radius:8px;overflow-x:auto;padding:16px;position:relative;margin:14px 0}
#viewer-body pre code{background:none;border:none;padding:0;color:inherit;font-size:13px}
#viewer-body ul,#viewer-body ol{color:#c9d1d9;padding-left:22px;margin:9px 0}
#viewer-body li{margin:3px 0}
#viewer-body blockquote{border-left:3px solid #30363d;color:#8b949e;margin:10px 0;padding:4px 14px}
#viewer-body table{border-collapse:collapse;margin:14px 0;width:100%}
#viewer-body th{background:#161b22;color:#e6edf3;font-size:13px;font-weight:600;text-align:left}
#viewer-body td,#viewer-body th{border:1px solid #30363d;padding:7px 12px}
#viewer-body tr:nth-child(even) td{background:#0d1117}
#viewer-body hr{border:none;border-top:1px solid #30363d;margin:22px 0}
.viewer-no-body{color:#8b949e;font-size:13px;font-style:italic;padding:20px 0}
.hljs{background:transparent !important}
/* Mini-map */
#minimap{position:absolute;bottom:12px;right:12px;background:rgba(13,17,23,.85);border:1px solid #30363d;border-radius:6px;display:none}
/* Live indicator */
#live-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:4px;animation:livepulse 2s ease-in-out infinite}
@keyframes livepulse{0%,100%{opacity:1}50%{opacity:.4}}
#live-dot.off{animation:none;background:#8b949e}
#live-label{color:#8b949e;font-size:11px}
/* Nodes */
.node{cursor:pointer}
.node circle{transition:r .15s}
.node text{pointer-events:none;user-select:none}
/* Edges */
.edge{fill:none}
.edge-depends_on{stroke:#4b5563;stroke-width:1.5;opacity:.6;stroke-dasharray:6 3;animation:flowForward 1.2s linear infinite}
.edge-hierarchy{stroke-width:1.5;opacity:.5;stroke-dasharray:4 6;animation:flowForward 2.5s linear infinite}
.edge-initiative_wave{stroke:#7c3aed}
.edge-wave_feature{stroke:#0ea5e9}
.edge-broken{stroke:#ef4444;stroke-width:2;opacity:.8;stroke-dasharray:4 4;animation:flowForward .6s linear infinite}
@keyframes flowForward{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}
@keyframes flowBackward{from{stroke-dashoffset:0}to{stroke-dashoffset:24}}
.paused .edge{animation-play-state:paused !important}
</style>
</head>
<body>
<div id="app">
  <div id="toolbar">
    <span id="live-dot"></span><span id="live-label">connecting...</span>
    <input id="search" placeholder="Search docs…" autocomplete="off">
    <div id="type-chips" style="display:flex;gap:4px;flex-wrap:wrap">
      <span class="chip active" data-type="all">All</span>
      <span class="chip" data-type="feature">Features</span>
      <span class="chip" data-type="task">Tasks</span>
      <span class="chip" data-type="wave">Waves</span>
      <span class="chip" data-type="initiative">Initiatives</span>
      <span class="chip" data-type="ops">Ops</span>
    </div>
    <select id="status-sel">
      <option value="all">All statuses</option>
      <option value="complete">Complete</option>
      <option value="in_progress">In Progress</option>
      <option value="draft">Draft</option>
      <option value="deprecated">Deprecated</option>
      <option value="active">Active</option>
      <option value="planned">Planned</option>
      <option value="cancelled">Cancelled</option>
    </select>
    <button id="adv-btn">Advanced Filters <span id="adv-badge"></span></button>
    <button id="layout-btn">Force ↔ Tree</button>
    <button id="pause-btn">⏸ Pause</button>
  </div>
  <div id="filters-bar"><button id="clear-all-btn">Clear all</button></div>
  <div id="adv-panel">
    <div class="adv-header">
      <span>Advanced Filters</span>
      <div style="display:flex;gap:8px">
        <a href="#" id="clear-adv-link" style="color:#8b949e;font-size:12px;text-decoration:none">Clear advanced</a>
        <button id="close-adv-btn" style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:14px">✕</button>
      </div>
    </div>
    <label>Edition<select id="f-edition"><option value="">Any</option></select></label>
    <label>Initiative<select id="f-initiative"><option value="">Any</option></select></label>
    <label>Wave<select id="f-wave"><option value="">Any</option></select></label>
    <label>Wave status<select id="f-wave-status"><option value="">Any</option><option value="planned">Planned</option><option value="active">Active</option><option value="complete">Complete</option></select></label>
    <label>Known issues<select id="f-issues"><option value="">Any</option><option value="has">Has issues</option><option value="none">No issues</option></select></label>
    <label>Synced after<input type="date" id="f-synced-after"></label>
    <label>Synced before<input type="date" id="f-synced-before"></label>
    <label>MDD version<input type="number" id="f-mdd-ver" placeholder="Any"></label>
    <label>Dependencies<select id="f-deps"><option value="">Any</option><option value="has">Has depends_on</option><option value="none">No depends_on</option></select></label>
    <label>Source file path<input type="text" id="f-src" placeholder="substring…"></label>
    <label>Route contains<input type="text" id="f-route" placeholder="substring…"></label>
    <hr class="git-divider">
    <div id="git-filters" style="display:none;flex-wrap:wrap;gap:10px 20px;width:100%">
      <label>Changed in last N commits
        <div style="display:flex;gap:4px;margin-top:3px">
          <span class="chip active" data-commits="0">All</span>
          <span class="chip" data-commits="5">5</span>
          <span class="chip" data-commits="10">10</span>
          <span class="chip" data-commits="25">25</span>
          <span class="chip" data-commits="50">50</span>
        </div>
      </label>
      <label>Modified since<input type="date" id="f-git-since"></label>
      <label>Author<select id="f-git-author"><option value="">Any</option></select></label>
      <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="f-uncommitted"> Has uncommitted changes</label>
    </div>
  </div>
  <div id="canvas-wrap">
    <svg id="graph"><defs></defs><g id="edges-g"></g><g id="nodes-g"></g></svg>
    <svg id="minimap" width="160" height="120"></svg>
  </div>
</div>
<div id="viewer-backdrop"></div>
<div id="viewer">
  <div id="viewer-header">
    <div id="viewer-header-content">
      <div id="viewer-title-row">
        <span id="viewer-id-label"></span>
        <span id="viewer-title"></span>
        <div id="viewer-badges"></div>
      </div>
      <div id="viewer-meta-bar"></div>
    </div>
    <button id="viewer-close">✕</button>
  </div>
  <div id="viewer-main">
    <div id="viewer-sidebar"><div id="viewer-sidebar-inner"></div></div>
    <div id="viewer-body"></div>
  </div>
</div>
<script>
(function(){
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let nodes=[], edges=[], selectedId=null, gitLoaded=false, paused=false, layoutMode='force';
let simulation, zoom, svgEl, gEdges, gNodes;
let clientBodyCache=new Map();

const filters={
  search:'', types:new Set(), status:'all',
  edition:'', initiative:'', wave:'', waveStatus:'', hasIssues:'',
  syncedAfter:'', syncedBefore:'', mddVersion:'', hasDeps:'',
  srcContains:'', routeContains:'',
  gitCommits:0, gitSince:'', gitAuthor:'', uncommitted:false
};

const STATUS_COLORS={
  complete:'#22c55e', in_progress:'#f59e0b', active:'#0ea5e9',
  planned:'#8b5cf6', draft:'#6b7280', deprecated:'#374151', cancelled:'#ef4444'
};
function statusColor(s){ return STATUS_COLORS[s]||'#6b7280'; }

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot(){
  const r=await fetch('/api/data');
  const data=await r.json();
  nodes=data.nodes; edges=data.edges;
  initGraph();
  connectSSE();
  loadFromStorage();
}

// ─── Graph init ───────────────────────────────────────────────────────────────
function initGraph(){
  svgEl=document.getElementById('graph');
  gEdges=document.getElementById('edges-g');
  gNodes=document.getElementById('nodes-g');

  const defs=svgEl.querySelector('defs');
  ['depends_on','initiative_wave','wave_feature','broken'].forEach(t=>{
    const m=document.createElementNS('http://www.w3.org/2000/svg','marker');
    m.setAttribute('id','arrow-'+t);
    m.setAttribute('viewBox','0 -5 10 10');
    m.setAttribute('refX','20'); m.setAttribute('refY','0');
    m.setAttribute('markerWidth','6'); m.setAttribute('markerHeight','6');
    m.setAttribute('orient','auto');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M0,-5L10,0L0,5');
    path.setAttribute('fill', t==='broken'?'#ef4444':t==='depends_on'?'#4b5563':t==='initiative_wave'?'#7c3aed':'#0ea5e9');
    m.appendChild(path);
    defs.appendChild(m);
  });

  zoom=d3.zoom().scaleExtent([0.1,4]).on('zoom',e=>{
    d3.select(gEdges).attr('transform',e.transform);
    d3.select(gNodes).attr('transform',e.transform);
    updateMinimap();
  });
  d3.select(svgEl).call(zoom).on('click',e=>{if(e.target===svgEl||e.target===gEdges)deselect();});

  buildForceLayout();
  render();
}

// ─── Force simulation ─────────────────────────────────────────────────────────
function nodeRadius(n){
  if(n.type==='initiative')return 28;
  if(n.type==='wave')return 22;
  if(n.type==='task')return 14;
  if(n.type==='ops')return 14;
  return 16;
}

function buildForceLayout(){
  const W=svgEl.clientWidth||800, H=svgEl.clientHeight||600;
  const visible=nodes.filter(isVisible);
  simulation=d3.forceSimulation(visible)
    .force('link',d3.forceLink(edges.filter(e=>isVisible(nodeById(e.source))&&isVisible(nodeById(e.target))))
      .id(d=>d.id)
      .distance(e=>e.type==='depends_on'?140:80))
    .force('charge',d3.forceManyBody().strength(-500))
    .force('center',d3.forceCenter(W/2,H/2))
    .force('collide',d3.forceCollide().radius(n=>nodeRadius(n)+8))
    .alphaDecay(0.028)
    .on('tick',ticked);
}

function buildTreeLayout(){
  if(simulation){simulation.stop();}
  const W=svgEl.clientWidth||800, H=svgEl.clientHeight||600;
  const roots=nodes.filter(n=>n.type==='initiative'&&isVisible(n));
  const unassigned=nodes.filter(n=>!n.initiative&&!n.wave&&n.type!=='initiative'&&isVisible(n));
  let x=60, colW=Math.max(180,(W-60)/(roots.length+1));
  roots.forEach(root=>{
    root.fx=x+colW/2; root.fy=80;
    const waves=nodes.filter(n=>n.type==='wave'&&n.initiative===root.id&&isVisible(n));
    waves.forEach((w,wi)=>{w.fx=root.fx; w.fy=200+wi*90;
      const feats=nodes.filter(n=>n.wave===w.id&&isVisible(n));
      feats.forEach((f,fi)=>{f.fx=root.fx+(fi-feats.length/2)*60; f.fy=w.fy+80;});
    });
    x+=colW;
  });
  unassigned.forEach((n,i)=>{n.fx=W-80; n.fy=60+i*50;});
  simulation=d3.forceSimulation(nodes.filter(isVisible))
    .force('charge',d3.forceManyBody().strength(-50))
    .alphaDecay(0.1).on('tick',ticked);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render(){
  const visNodes=nodes.filter(isVisible);
  const visEdges=edges.filter(e=>{
    const s=nodeById(typeof e.source==='object'?e.source.id:e.source);
    const t=nodeById(typeof e.target==='object'?e.target.id:e.target);
    return s&&t;
  });

  // Edges
  const edgeSel=d3.select(gEdges).selectAll('path.edge').data(visEdges,e=>e.source.id+'-'+e.target.id+'-'+e.type);
  edgeSel.enter().append('path').attr('class',e=>'edge edge-'+e.type+(e.broken?' edge-broken':'')).attr('marker-end',e=>'url(#arrow-'+(e.broken?'broken':e.type)+')')
    .merge(edgeSel);
  edgeSel.exit().remove();

  // Nodes
  const nodeSel=d3.select(gNodes).selectAll('g.node').data(visNodes,n=>n.id);
  const enter=nodeSel.enter().append('g').attr('class','node')
    .call(d3.drag().on('start',dragStart).on('drag',dragged).on('end',dragEnd))
    .on('click',(e,n)=>{e.stopPropagation();selectNode(n);})
    .on('dblclick',(e,n)=>{e.stopPropagation();zoomToNode(n);})
    .on('mouseenter',(e,n)=>hoverNode(n,true))
    .on('mouseleave',(e,n)=>hoverNode(n,false));

  enter.append('circle').attr('r',nodeRadius);
  enter.append('text').attr('dy','1em').attr('text-anchor','middle').attr('fill','#e6edf3').attr('font-size',11);
  // badges
  enter.append('circle').attr('class','badge-issues').attr('r',7).attr('cx',d=>nodeRadius(d)-4).attr('cy',d=>-nodeRadius(d)+4);
  enter.append('text').attr('class','badge-issues-txt').attr('text-anchor','middle').attr('dominant-baseline','central').attr('fill','#fff').attr('font-size',9);
  enter.append('circle').attr('class','badge-uncommitted').attr('r',4).attr('cx',d=>nodeRadius(d)-4).attr('cy',d=>nodeRadius(d)-4);

  const merged=enter.merge(nodeSel);
  merged.select('circle:first-of-type').attr('r',nodeRadius).attr('fill',n=>n.type==='ops'?'#f97316':statusColor(n.status)).attr('stroke',n=>n.type==='task'?'#94a3b8':'none').attr('stroke-dasharray',n=>n.type==='task'?'4 2':'none').attr('stroke-width',2);
  merged.select('text').text(n=>n.title.length>18?n.title.slice(0,17)+'…':n.title).attr('y',n=>nodeRadius(n)+4);
  merged.select('.badge-issues').attr('fill',n=>n.known_issues_count>0?'#ef4444':'none').attr('cx',n=>nodeRadius(n)-4).attr('cy',n=>-nodeRadius(n)+4);
  merged.select('.badge-issues-txt').text(n=>n.known_issues_count>0?n.known_issues_count:'').attr('x',n=>nodeRadius(n)-4).attr('y',n=>-nodeRadius(n)+4);
  merged.select('.badge-uncommitted').attr('fill',n=>n.git&&n.git.hasUncommittedChanges?'#f59e0b':'none').attr('cx',n=>nodeRadius(n)-4).attr('cy',n=>nodeRadius(n)-4);

  nodeSel.exit().remove();
}

function ticked(){
  d3.select(gEdges).selectAll('path.edge').attr('d',linkArc);
  d3.select(gNodes).selectAll('g.node').attr('transform',n=>'translate('+(n.x||0)+','+(n.y||0)+')');
  updateMinimap();
}

function linkArc(e){
  const s=e.source,t=e.target;
  const dx=(t.x||0)-(s.x||0), dy=(t.y||0)-(s.y||0);
  const dr=Math.sqrt(dx*dx+dy*dy)*1.5;
  return 'M'+(s.x||0)+','+(s.y||0)+'A'+dr+','+dr+' 0 0,1 '+(t.x||0)+','+(t.y||0);
}

// ─── Interaction ──────────────────────────────────────────────────────────────
function nodeById(id){ return nodes.find(n=>n.id===(typeof id==='object'?id.id:id)); }

function selectNode(n){
  selectedId=n.id;
  d3.select(gNodes).selectAll('g.node').select('circle:first-of-type')
    .attr('stroke',d=>d.id===n.id?'#fff':'none').attr('stroke-width',d=>d.id===n.id?2:0);
  applyEdgeSelection(n);
  openViewer(n);
}

function deselect(){
  selectedId=null;
  d3.select(gNodes).selectAll('g.node').select('circle:first-of-type').attr('stroke','none');
  d3.select(gEdges).selectAll('path.edge').style('opacity',null).style('animation',null);
  closeViewer();
}

function hoverNode(n,on){
  if(!on){
    d3.select(gEdges).selectAll('path.edge')
      .style('opacity',null).style('animation-duration',null);
    return;
  }
  d3.select(gEdges).selectAll('path.edge').each(function(e){
    const sid=typeof e.source==='object'?e.source.id:e.source;
    const tid=typeof e.target==='object'?e.target.id:e.target;
    const connected=sid===n.id||tid===n.id;
    d3.select(this).style('opacity',connected?1:.04)
      .style('animation-duration',connected?null:null);
  });
}

function applyEdgeSelection(n){
  d3.select(gEdges).selectAll('path.edge').each(function(e){
    const sid=typeof e.source==='object'?e.source.id:e.source;
    const tid=typeof e.target==='object'?e.target.id:e.target;
    if(sid===n.id){
      d3.select(this).style('opacity',1).style('animation-name','flowForward').style('stroke-width',2);
    } else if(tid===n.id){
      d3.select(this).style('opacity',1).style('animation-name','flowBackward').style('stroke-width',2);
    } else {
      d3.select(this).style('opacity',.03);
    }
  });
}

function zoomToNode(n){
  const W=svgEl.clientWidth, H=svgEl.clientHeight;
  const t=d3.zoomIdentity.translate(W/2-(n.x||0),H/2-(n.y||0)).scale(1.5);
  d3.select(svgEl).transition().duration(500).call(zoom.transform,t);
}

function dragStart(e,n){ if(!e.active)simulation.alphaTarget(.3).restart(); n.fx=n.x; n.fy=n.y; }
function dragged(e,n){ n.fx=e.x; n.fy=e.y; }
function dragEnd(e,n){ if(!e.active)simulation.alphaTarget(0); }

// ─── Filters ──────────────────────────────────────────────────────────────────
function isVisible(n){
  if(!n)return false;
  if(filters.search&&!n.title.toLowerCase().includes(filters.search)&&!n.id.toLowerCase().includes(filters.search))return false;
  if(filters.types.size>0&&!filters.types.has('all')&&!filters.types.has(n.type))return false;
  if(filters.status!=='all'&&n.status!==filters.status)return false;
  if(filters.edition&&n.edition!==filters.edition)return false;
  if(filters.initiative&&n.initiative!==filters.initiative)return false;
  if(filters.wave&&n.wave!==filters.wave)return false;
  if(filters.waveStatus&&n.wave_status!==filters.waveStatus)return false;
  if(filters.hasIssues==='has'&&n.known_issues_count===0)return false;
  if(filters.hasIssues==='none'&&n.known_issues_count>0)return false;
  if(filters.syncedAfter&&n.last_synced&&n.last_synced<filters.syncedAfter)return false;
  if(filters.syncedBefore&&n.last_synced&&n.last_synced>filters.syncedBefore)return false;
  if(filters.mddVersion!==''&&n.mdd_version!==parseInt(filters.mddVersion))return false;
  if(filters.hasDeps==='has'&&n.depends_on.length===0)return false;
  if(filters.hasDeps==='none'&&n.depends_on.length>0)return false;
  if(filters.srcContains&&!n.source_files.some(f=>f.includes(filters.srcContains)))return false;
  if(filters.routeContains&&!n.routes.some(r=>r.includes(filters.routeContains)))return false;
  if(gitLoaded){
    if(filters.uncommitted&&(!n.git||!n.git.hasUncommittedChanges))return false;
    if(filters.gitAuthor&&n.git&&n.git.lastCommitAuthor!==filters.gitAuthor)return false;
  }
  return true;
}

function applyFilters(){
  d3.select(gNodes).selectAll('g.node').style('opacity',n=>isVisible(n)?1:.05);
  d3.select(gEdges).selectAll('path.edge').style('opacity',e=>{
    const s=nodeById(typeof e.source==='object'?e.source.id:e.source);
    const t=nodeById(typeof e.target==='object'?e.target.id:e.target);
    return (s&&isVisible(s)&&t&&isVisible(t))?null:.02;
  });
  updateFilterBar();
}

function updateFilterBar(){
  const bar=document.getElementById('filters-bar');
  const chips=[];
  if(filters.search)chips.push({label:'search: '+filters.search,key:'search'});
  if(filters.status!=='all')chips.push({label:'status: '+filters.status,key:'status'});
  if(filters.edition)chips.push({label:'edition: '+filters.edition,key:'edition'});
  bar.innerHTML='';
  if(chips.length===0){bar.style.display='none';return;}
  bar.style.display='flex';
  chips.forEach(c=>{
    const el=document.createElement('span');
    el.className='filter-chip';
    el.textContent=c.label+' ×';
    el.onclick=()=>{filters[c.key]=c.key==='status'?'all':'';applyFilters();};
    bar.appendChild(el);
  });
  const clr=document.createElement('button');
  clr.id='clear-all-btn'; clr.textContent='Clear all';
  clr.onclick=()=>{Object.assign(filters,{search:'',types:new Set(),status:'all',edition:'',initiative:'',wave:'',waveStatus:'',hasIssues:'',syncedAfter:'',syncedBefore:'',mddVersion:'',hasDeps:'',srcContains:'',routeContains:'',gitCommits:0,gitSince:'',gitAuthor:'',uncommitted:false});applyFilters();};
  bar.appendChild(clr);
}

// ─── Viewer ───────────────────────────────────────────────────────────────────
function openViewer(n){
  document.getElementById('viewer-id-label').textContent=n.id;
  document.getElementById('viewer-title').textContent=n.title;

  const phaseBadge=n.phase?'<span class="badge badge-phase">'+n.phase+'</span>':'';
  const modBadge=n.git&&n.git.hasUncommittedChanges?'<span class="badge badge-modified">⚠ modified</span>':'';
  document.getElementById('viewer-badges').innerHTML=
    '<span class="badge badge-type">'+n.type+'</span>'+
    '<span class="badge badge-status-'+n.status+'">'+n.status+'</span>'+
    phaseBadge+modBadge;

  const syncHtml=n.git
    ?(n.git.hasUncommittedChanges
      ?'<span class="sync-modified">⚠ modified</span>'
      :'<span class="sync-synced">✓ in sync</span>')
    :'';
  const issueHtml=n.known_issues_count>0
    ?'<span style="color:#ef4444">⚠ '+n.known_issues_count+' issue'+(n.known_issues_count!==1?'s':'')+'</span>'
    :'<span>no issues</span>';
  document.getElementById('viewer-meta-bar').innerHTML=
    (n.edition?'<span>'+n.edition+'</span><span class="meta-sep">·</span>':'')+
    '<span>'+(n.last_synced||'—')+'</span>'+
    '<span class="meta-sep">·</span>'+
    '<span>v'+(n.mdd_version||'?')+'</span>'+
    (syncHtml?'<span class="meta-sep">·</span>'+syncHtml:'')+
    '<span class="meta-sep"> | </span>'+
    '<span>'+n.source_files.length+' source'+(n.source_files.length===1?'':'s')+'</span>'+
    '<span class="meta-sep">·</span>'+
    '<span>'+n.routes.length+' route'+(n.routes.length===1?'':'s')+'</span>'+
    '<span class="meta-sep">·</span>'+
    issueHtml;

  const gitSection=n.git?
    '<div class="viewer-section"><h4>Git</h4><div class="git-info">'+
    '<div><span class="git-hash">'+n.git.lastCommitHash.slice(0,7)+'</span> '+n.git.relativeDate+
    ' — &ldquo;'+n.git.lastCommitMessage+'&rdquo; by '+n.git.lastCommitAuthor+'</div>'+
    '<div style="color:#8b949e;font-size:11px;margin-top:3px">'+n.git.commitCount+' commits</div>'+
    '<button id="view-history-btn" data-nid="'+n.id+'" onclick="loadHistory(this.dataset.nid)">View history</button>'+
    '<div id="commit-list"></div></div></div>':'';

  document.getElementById('viewer-sidebar-inner').innerHTML=
    (n.known_issues_count>0?'<div class="viewer-section"><h4>Known Issues</h4><div style="color:#ef4444;font-size:12px">'+n.known_issues_count+' issue(s)</div></div>':'')+
    (n.depends_on.length>0?'<div class="viewer-section"><h4>Depends On</h4>'+n.depends_on.map(d=>'<span class="dep-chip" data-nid="'+d+'" onclick="jumpTo(this.dataset.nid)">'+d+'</span>').join('')+'</div>':'')+
    (n.source_files.length>0?'<div class="viewer-section"><h4>Source Files</h4>'+n.source_files.map(f=>'<button class="src-file-btn" data-file="'+f+'" onclick="openFile(this.dataset.file)" title="Open in VS Code">'+f+'</button>').join('')+'</div>':'')+
    gitSection;

  const body=document.getElementById('viewer-body');
  body.innerHTML=
    '<div class="skeleton" style="height:14px;width:70%;margin-bottom:10px"></div>'+
    '<div class="skeleton" style="height:14px;width:85%;margin-bottom:10px"></div>'+
    '<div class="skeleton" style="height:14px;width:55%"></div>';

  document.getElementById('viewer-backdrop').classList.add('open');
  document.getElementById('viewer').classList.add('open');
  document.body.style.overflow='hidden';

  loadViewerBody(n.id);
}

function closeViewer(){
  document.getElementById('viewer').classList.remove('open');
  document.getElementById('viewer-backdrop').classList.remove('open');
  document.body.style.overflow='';
}

async function loadViewerBody(id){
  const wrap=document.getElementById('viewer-body');
  if(!wrap)return;
  if(clientBodyCache.has(id)){
    wrap.innerHTML=clientBodyCache.get(id);
    highlightAndDecorate(wrap);
    return;
  }
  const r=await fetch('/api/doc/'+encodeURIComponent(id));
  if(!r.ok){wrap.innerHTML='<p class="viewer-no-body">No document body.</p>';return;}
  const {html}=await r.json();
  const content=html.trim()||'<p class="viewer-no-body">No document body.</p>';
  clientBodyCache.set(id,content);
  if(wrap)wrap.innerHTML=content;
  highlightAndDecorate(wrap);
}

function highlightAndDecorate(wrap){
  if(typeof hljs!=='undefined'){
    wrap.querySelectorAll('pre code').forEach(el=>hljs.highlightElement(el));
  }
  wrap.querySelectorAll('pre').forEach(pre=>{
    if(!pre.querySelector('code'))return;
    const code=pre.querySelector('code');
    const btn=document.createElement('button');
    btn.className='copy-btn'; btn.textContent='Copy';
    btn.addEventListener('click',()=>{
      navigator.clipboard.writeText(code.innerText).then(()=>{
        btn.textContent='Copied!';
        setTimeout(()=>{btn.textContent='Copy';},1500);
      }).catch(()=>{});
    });
    pre.appendChild(btn);
  });
}

window.openFile=function(path){
  fetch('/api/open?file='+encodeURIComponent(path)).catch(()=>{});
};

window.loadHistory=async function(id){
  const r=await fetch('/api/git/'+encodeURIComponent(id));
  if(!r.ok)return;
  const {commits}=await r.json();
  const el=document.getElementById('commit-list');
  if(!el)return;
  el.innerHTML=commits.slice(0,50).map(c=>'<div class="commit-item"><div class="cm-msg">'+c.message+'</div><div class="cm-meta">'+c.relativeDate+' · <span class="git-hash">'+c.shortHash+'</span> · '+c.author+'</div></div>').join('');
};

window.jumpTo=function(id){
  closeViewer();
  const n=nodeById(id);
  if(n)selectNode(n);
};

// ─── Mini-map ─────────────────────────────────────────────────────────────────
function updateMinimap(){
  const mm=document.getElementById('minimap');
  if(nodes.length<10){mm.style.display='none';return;}
  mm.style.display='block';
  const svg=d3.select(mm);
  const xs=nodes.map(n=>n.x||0), ys=nodes.map(n=>n.y||0);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const W=160,H=120,pad=10;
  const sx=(W-pad*2)/(maxX-minX||1),sy=(H-pad*2)/(maxY-minY||1),s=Math.min(sx,sy);
  svg.selectAll('circle.mm-dot').data(nodes,n=>n.id)
    .join('circle').attr('class','mm-dot').attr('r',2)
    .attr('cx',n=>pad+(((n.x||0)-minX)*s)).attr('cy',n=>pad+(((n.y||0)-minY)*s))
    .attr('fill',n=>statusColor(n.status)).attr('opacity',.8);
}

// ─── SSE ──────────────────────────────────────────────────────────────────────
function connectSSE(){
  const dot=document.getElementById('live-dot');
  const lbl=document.getElementById('live-label');
  const es=new EventSource('/events');
  es.onopen=()=>{dot.classList.remove('off');lbl.textContent='live';};
  es.onerror=()=>{dot.classList.add('off');lbl.textContent='reconnecting…';};
  es.onmessage=async e=>{
    const msg=JSON.parse(e.data);
    if(msg.type==='node-update'){
      const idx=nodes.findIndex(n=>n.id===msg.id);
      if(idx>=0){nodes[idx]=msg.node;}
    } else if(msg.type==='node-add'){
      nodes.push(msg.node);
    } else if(msg.type==='node-remove'){
      nodes=nodes.filter(n=>n.id!==msg.id);
    } else if(msg.type==='graph-reload'){
      const r=await fetch('/api/data');
      const d=await r.json();
      const oldPositions=new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y,fx:n.fx,fy:n.fy}]));
      nodes=d.nodes.map(n=>{const p=oldPositions.get(n.id);return p?Object.assign(n,p):n;});
      edges=d.edges;
      if(msg.gitLoaded){gitLoaded=true; populateGitFilters();}
    }
    render(); applyFilters();
  };
}

function populateGitFilters(){
  document.getElementById('git-filters').style.display='flex';
  const authors=[...new Set(nodes.map(n=>n.git&&n.git.lastCommitAuthor).filter(Boolean))];
  const sel=document.getElementById('f-git-author');
  authors.forEach(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;sel.appendChild(o);});
}

// ─── Toolbar wiring ───────────────────────────────────────────────────────────
function loadFromStorage(){
  paused=localStorage.getItem('mdd-paused')==='true';
  if(paused){document.getElementById('graph').classList.add('paused');document.getElementById('pause-btn').classList.add('active');}
}

document.getElementById('search').addEventListener('input',e=>{filters.search=e.target.value.toLowerCase();applyFilters();});
document.getElementById('status-sel').addEventListener('change',e=>{filters.status=e.target.value;applyFilters();});

document.getElementById('type-chips').addEventListener('click',e=>{
  const chip=e.target.closest('.chip[data-type]');
  if(!chip)return;
  const t=chip.dataset.type;
  if(t==='all'){filters.types.clear();document.querySelectorAll('#type-chips .chip').forEach(c=>c.classList.toggle('active',c.dataset.type==='all'));}
  else{
    chip.classList.toggle('active');
    if(chip.classList.contains('active')){filters.types.add(t);}else{filters.types.delete(t);}
    document.querySelector('#type-chips .chip[data-type="all"]').classList.remove('active');
    if(filters.types.size===0)document.querySelector('#type-chips .chip[data-type="all"]').classList.add('active');
  }
  applyFilters();
});

document.getElementById('pause-btn').addEventListener('click',()=>{
  paused=!paused;
  document.getElementById('graph').classList.toggle('paused',paused);
  document.getElementById('pause-btn').classList.toggle('active',paused);
  localStorage.setItem('mdd-paused',paused);
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeViewer();
  if(e.key==='p'||e.key==='P')document.getElementById('pause-btn').click();
});

document.getElementById('layout-btn').addEventListener('click',()=>{
  layoutMode=layoutMode==='force'?'tree':'force';
  if(layoutMode==='tree'){nodes.forEach(n=>{n.fx=null;n.fy=null;});buildTreeLayout();}
  else{nodes.forEach(n=>{n.fx=null;n.fy=null;});buildForceLayout();}
  render();
});

document.getElementById('adv-btn').addEventListener('click',()=>{
  document.getElementById('adv-panel').classList.toggle('open');
});
document.getElementById('close-adv-btn').addEventListener('click',()=>{document.getElementById('adv-panel').classList.remove('open');});
document.getElementById('clear-adv-link').addEventListener('click',e=>{e.preventDefault();Object.assign(filters,{edition:'',initiative:'',wave:'',waveStatus:'',hasIssues:'',syncedAfter:'',syncedBefore:'',mddVersion:'',hasDeps:'',srcContains:'',routeContains:''});applyFilters();});

['f-edition','f-initiative','f-wave','f-wave-status','f-issues','f-deps','f-git-author'].forEach(id=>{
  const el=document.getElementById(id);
  if(el)el.addEventListener('change',e=>{
    const k={'f-edition':'edition','f-initiative':'initiative','f-wave':'wave','f-wave-status':'waveStatus','f-issues':'hasIssues','f-deps':'hasDeps','f-git-author':'gitAuthor'}[id];
    if(k)filters[k]=e.target.value;
    applyFilters();
  });
});

['f-synced-after','f-synced-before','f-mdd-ver','f-src','f-route','f-git-since'].forEach(id=>{
  const el=document.getElementById(id);
  if(el)el.addEventListener('input',e=>{
    const k={'f-synced-after':'syncedAfter','f-synced-before':'syncedBefore','f-mdd-ver':'mddVersion','f-src':'srcContains','f-route':'routeContains','f-git-since':'gitSince'}[id];
    if(k)filters[k]=e.target.value;
    applyFilters();
  });
});

document.getElementById('f-uncommitted')&&document.getElementById('f-uncommitted').addEventListener('change',e=>{filters.uncommitted=e.target.checked;applyFilters();});

document.getElementById('viewer-close').addEventListener('click',closeViewer);
document.getElementById('viewer-backdrop').addEventListener('click',closeViewer);

boot();
})();
</script>
</body>
</html>`
}
