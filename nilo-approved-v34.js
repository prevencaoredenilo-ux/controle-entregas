/** NILO ENTREGAS • V34.1 • AJUSTE MENU + MASCOTE
 * Camada exclusivamente visual/organizacional.
 * Não grava IndexedDB/localStorage/Supabase e não altera regras operacionais.
 */
(() => {
'use strict';
const VERSION='34.1.0';
const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
const ICONS={"today": "<svg viewBox=\"0 0 24 24\"><path d=\"M3 11.5 12 4l9 7.5\"/><path d=\"M5.5 10.5V20h13v-9.5\"/><path d=\"M9.5 20v-6h5v6\"/></svg>", "deliveries": "<svg viewBox=\"0 0 24 24\"><path d=\"m4 7 8-4 8 4-8 4-8-4Z\"/><path d=\"m4 7 8 4 8-4v10l-8 4-8-4V7Z\"/><path d=\"M12 11v10\"/></svg>", "scheduled": "<svg viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4M17 3v4M3 10h18\"/></svg>", "pending": "<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v6M12 17h.01\"/></svg>", "cycles": "<svg viewBox=\"0 0 24 24\"><path d=\"M20 7h-6V1\"/><path d=\"M20 7a9 9 0 1 0 1 8\"/><path d=\"m20 7-4-4\"/></svg>", "odometer": "<svg viewBox=\"0 0 24 24\"><path d=\"M4 18a8 8 0 1 1 16 0\"/><path d=\"m12 14 4-4\"/><path d=\"M6 18h12\"/></svg>", "route-history": "<svg viewBox=\"0 0 24 24\"><path d=\"M5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z\"/><path d=\"M7.5 16.5c3-1 3.5-6 7.5-7.5\"/><path d=\"M10 6H5v5\"/></svg>", "dashboard": "<svg viewBox=\"0 0 24 24\"><path d=\"M4 20V10M10 20V4M16 20v-7M22 20V7\"/></svg>", "reports": "<svg viewBox=\"0 0 24 24\"><path d=\"M5 3h10l4 4v14H5z\"/><path d=\"M15 3v5h5M8 17v-4M12 17V9M16 17v-6\"/></svg>", "neighborhoods": "<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"10\" r=\"3\"/><path d=\"M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z\"/></svg>", "costs": "<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.1 1.8 3.1 2.2c2 .4 2.9 1 2.9 2.3 0 1.4-1.3 2.5-3.2 2.5-1.4 0-2.6-.4-3.5-1.3M12 5v14\"/></svg>", "trace": "<svg viewBox=\"0 0 24 24\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6\"/><path d=\"m15 15 5 5\"/></svg>", "settings": "<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19 15a2 2 0 0 0 .4 2.2l.1.1-2.2 2.2-.1-.1A2 2 0 0 0 15 19a2 2 0 0 0-1.2 1.8V21h-3.2v-.2A2 2 0 0 0 9.4 19a2 2 0 0 0-2.2.4l-.1.1-2.2-2.2.1-.1A2 2 0 0 0 5 15a2 2 0 0 0-1.8-1.2H3v-3.2h.2A2 2 0 0 0 5 9.4a2 2 0 0 0-.4-2.2l-.1-.1 2.2-2.2.1.1A2 2 0 0 0 9 5a2 2 0 0 0 1.2-1.8V3h3.2v.2A2 2 0 0 0 15 5a2 2 0 0 0 2.2-.4l.1-.1 2.2 2.2-.1.1A2 2 0 0 0 19 9a2 2 0 0 0 1.8 1.2h.2v3.2h-.2A2 2 0 0 0 19 15Z\"/></svg>", "trash": "<svg viewBox=\"0 0 24 24\"><path d=\"M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6\"/></svg>"};
const ASSET={nilo:'nilo-v34.png?v=34.1.0',triela:'triela-v34.png?v=34.1.0',mascot:'mascote-v34.png?v=34.1.0'};

const CSS=String.raw`
:root{--v34-navy:#062b63;--v34-deep:#031b43;--v34-blue:#0869f7;--v34-yellow:#ffd500;--v34-bg:#f4f7fb;--v34-card:#fff;--v34-line:#dbe5f0;--v34-text:#082653;--v34-muted:#66768d;--v34-green:#10b981;--v34-orange:#ff7a00;--v34-purple:#7048ff;--v34-red:#ef4444;--v34-shadow:0 10px 28px rgba(6,43,99,.08)}
html,body{width:100%!important;max-width:none!important;margin:0!important;background:var(--v34-bg)!important;overflow-x:hidden!important}
body.v34{color:var(--v34-text)!important}
body.v34 .app-shell{display:grid!important;grid-template-columns:76px minmax(0,1fr)!important;width:100%!important;max-width:none!important;margin:0!important;min-height:100vh!important;background:var(--v34-bg)!important;transition:grid-template-columns .2s ease!important}
body.v34.v34-expanded .app-shell{grid-template-columns:252px minmax(0,1fr)!important}
body.v34 .main-content{width:100%!important;min-width:0!important;max-width:none!important;margin:0!important;background:var(--v34-bg)!important}
body.v34 .sidebar{position:sticky!important;top:0!important;width:76px!important;min-width:76px!important;max-width:76px!important;height:100vh!important;margin:0!important;padding:12px 8px 10px!important;overflow:hidden!important;background:linear-gradient(180deg,#042552,#063a79)!important;color:#fff!important;border:0!important;border-right:1px solid rgba(255,255,255,.08)!important;box-shadow:7px 0 22px rgba(3,27,67,.12)!important;z-index:120!important;display:flex!important;flex-direction:column!important;transition:width .2s ease,min-width .2s ease,max-width .2s ease!important}
body.v34.v34-expanded .sidebar{width:252px!important;min-width:252px!important;max-width:252px!important}
body.v34 .sidebar-top{padding:0!important;flex:0 0 auto!important}
body.v34 .brand-block{height:60px!important;min-height:60px!important;margin:0 0 6px!important;padding:4px!important;background:transparent!important;border:0!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}
body.v34 .brand-mark,body.v34 .brand-copy{display:none!important}
.v34-side-nilo{display:none;width:158px;max-height:52px;object-fit:contain;filter:drop-shadow(0 3px 0 rgba(0,0,0,.2))}
.v34-side-mini{display:block;width:48px;height:48px;border-radius:50%;object-fit:cover;object-position:42% 20%;border:3px solid var(--v34-yellow);box-shadow:0 0 0 2px rgba(255,255,255,.9)}
body.v34.v34-expanded .v34-side-nilo{display:block}
body.v34.v34-expanded .v34-side-mini{display:none}
body.v34 .connection-card{display:none!important}
body.v34 .mode-card{display:none!important}
body.v34 .main-nav{padding:0!important;margin:0!important;display:block!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:thin!important;flex:1 1 auto!important}
body.v34 .main-nav>.nav-caption{display:none!important}
.v34-nav-group{margin:5px 0 10px;padding:0}
.v34-nav-title{display:none;color:var(--v34-yellow);font-size:10px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;padding:7px 10px 4px;white-space:nowrap}
body.v34.v34-expanded .v34-nav-title{display:block}
.v34-combo{margin:4px 0 7px;padding:0;border:0;background:transparent}
body.v34.v34-expanded .v34-combo{padding:4px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(0,0,0,.06)}
.v34-combo-title{display:none;padding:5px 8px;color:#bfd4f4;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
body.v34.v34-expanded .v34-combo-title{display:flex;align-items:center;gap:7px}.v34-combo-title:before{content:"";width:5px;height:5px;background:var(--v34-yellow);border-radius:50%}
body.v34 .nav-item{width:100%!important;min-height:44px!important;margin:3px 0!important;padding:5px!important;border:1px solid transparent!important;border-radius:10px!important;background:transparent!important;color:#f5f9ff!important;-webkit-text-fill-color:#f5f9ff!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;position:relative!important;box-shadow:none!important;transform:none!important}
body.v34.v34-expanded .nav-item{justify-content:flex-start!important;padding:5px 8px!important}
body.v34 .nav-item:hover{background:rgba(255,255,255,.08)!important}
body.v34 .nav-item.active{background:var(--v34-yellow)!important;color:var(--v34-navy)!important;-webkit-text-fill-color:var(--v34-navy)!important;border-color:#ffe55c!important;box-shadow:0 8px 18px rgba(255,213,0,.16)!important}
body.v34 .nav-ico{width:34px!important;height:34px!important;min-width:34px!important;border-radius:9px!important;background:rgba(255,255,255,.08)!important;color:inherit!important;display:grid!important;place-items:center!important;padding:7px!important;font-size:0!important}
body.v34 .nav-item.active .nav-ico{background:rgba(6,43,99,.10)!important}
body.v34 .nav-ico svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
body.v34 .nav-item>span:not(.nav-ico):not(.nav-badge){display:none!important}
body.v34.v34-expanded .nav-item>span:not(.nav-ico):not(.nav-badge){display:inline!important;font-size:12px!important;font-weight:850!important;white-space:nowrap!important}
body.v34 .nav-badge{position:absolute!important;right:1px!important;top:0!important;transform:scale(.78);margin:0!important}body.v34.v34-expanded .nav-badge{position:static!important;transform:none!important;margin-left:auto!important}
.v34-training{display:none;margin:4px 0 8px;padding:8px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(0,0,0,.08)}
body.v34.v34-expanded .v34-training{display:block}.v34-training-title{color:var(--v34-yellow);font-size:10px;font-weight:950;margin:0 0 7px;text-transform:uppercase}.v34-training .mode-card{display:block!important;margin:0!important;background:rgba(255,255,255,.06)!important;border:1px solid rgba(255,255,255,.09)!important;color:#fff!important}.v34-training .mode-card *{color:#fff!important;-webkit-text-fill-color:#fff!important}.v34-training .mode-choice.active{background:rgba(255,213,0,.14)!important;border-color:rgba(255,213,0,.4)!important;color:#fff!important}
.v34-side-branding{display:none;flex:0 0 auto;margin:7px 0 6px;text-align:center}
body.v34.v34-expanded .v34-side-branding{display:block}
.v34-partner{height:58px;background:#fff;border:1px solid rgba(255,213,0,.78);border-radius:10px;padding:6px 10px;display:grid;place-items:center;overflow:hidden;margin-bottom:5px}.v34-partner img{max-width:100%;max-height:44px;object-fit:contain}
.v34-mascot-wrap{height:178px;overflow:hidden;display:grid;place-items:center;border-radius:8px;background:#052e67}.v34-mascot-wrap img{width:138px;height:auto;object-fit:contain}
body.v34 .sidebar-footer{margin:0!important;padding:8px!important;min-height:52px!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:11px!important;background:rgba(0,0,0,.15)!important;display:flex!important;align-items:center!important;justify-content:center!important}
body.v34 .sidebar-footer>div{display:none!important}body.v34.v34-expanded .sidebar-footer>div{display:block!important;flex:1}body.v34 .sidebar-footer span,body.v34 .sidebar-footer small{color:#d8e7ff!important;-webkit-text-fill-color:#d8e7ff!important}body.v34 .sidebar-footer small{font-size:8px!important}
body.v34 .topbar{position:sticky!important;top:0!important;z-index:110!important;width:100%!important;max-width:none!important;margin:0!important;min-height:88px!important;padding:12px 18px!important;background:linear-gradient(100deg,var(--v34-deep),#074783)!important;border:0!important;border-bottom:1px solid rgba(255,255,255,.1)!important;box-shadow:0 8px 24px rgba(3,27,67,.15)!important;display:flex!important;align-items:center!important;gap:12px!important}
.v34-menu-toggle{width:42px;height:42px;min-width:42px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;display:grid;place-items:center;font-size:22px;line-height:1}
.v34-top-brand{display:flex;align-items:center;gap:10px;min-width:0}.v34-top-brand img{display:block;object-fit:contain}.v34-top-brand .nilo{width:138px;max-height:45px}.v34-top-brand .triela-box{height:48px;min-width:132px;background:#fff;border-radius:10px;padding:5px 9px;display:grid;place-items:center}.v34-top-brand .triela{max-width:120px;max-height:36px}
body.v34.v34-expanded .v34-top-brand{display:none}
body.v34 .topbar-title{min-width:0!important;display:flex!important;align-items:center!important;gap:10px!important;flex:1!important}body.v34 .topbar-title>.menu-btn{display:none!important}.v34-title-copy{min-width:0}.v34-greeting{display:block;color:#fff;font-size:19px;font-weight:950;line-height:1;margin:0 0 3px;white-space:nowrap}body.v34 .topbar-title h1{margin:0!important;color:#fff!important;-webkit-text-fill-color:#fff!important;font-size:20px!important;line-height:1.05!important}body.v34 .topbar-title p{margin:3px 0 0!important;color:#dbe9fb!important;-webkit-text-fill-color:#dbe9fb!important;font-size:10px!important;line-height:1.25!important}
body.v34 .topbar-actions{margin-left:auto!important;display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:nowrap!important}body.v34 .desktop-mode-chip{background:#effaf4!important;color:#356450!important;-webkit-text-fill-color:#356450!important;border:0!important;border-radius:10px!important;padding:10px 13px!important;font-weight:850!important}body.v34 .topbar .btn.secondary{background:rgba(255,255,255,.06)!important;color:#fff!important;-webkit-text-fill-color:#fff!important;border:1px solid rgba(255,255,255,.22)!important}body.v34 #quickNewDeliveryBtn{background:var(--v34-yellow)!important;color:#082653!important;-webkit-text-fill-color:#082653!important;border-color:#e8c100!important;font-weight:900!important;box-shadow:0 8px 18px rgba(255,213,0,.17)!important}
body.v34 .filter-panel{width:auto!important;max-width:none!important;margin:14px 16px!important;padding:12px 14px!important;background:#fff!important;border:1px solid var(--v34-line)!important;border-radius:14px!important;box-shadow:none!important}body.v34 .filter-icon{background:#edf4ff!important;color:var(--v34-blue)!important}body.v34 .filter-intro strong{color:var(--v34-text)!important}body.v34 .filter-intro small{color:var(--v34-muted)!important}
body.v34 #view{width:100%!important;max-width:none!important;margin:0!important;padding:0 16px 100px!important;background:var(--v34-bg)!important}
body.v34 #view .card,body.v34 #view .section-card,body.v34 #view .management-panel,body.v34 #view .v16-card,body.v34 #view .panel,body.v34 #view .table-wrap,body.v34 #view .operation-pulse-card,body.v34 #view .executive-metric,body.v34 #view .next-best-action,body.v34 #view .day-close-checkpoint{border-radius:14px!important;box-shadow:var(--v34-shadow)!important;border:1px solid var(--v34-line)!important}
body.v34 #view .card,body.v34 #view .section-card,body.v34 #view .management-panel,body.v34 #view .v16-card,body.v34 #view .panel,body.v34 #view .table-wrap,body.v34 #view .operation-pulse-card,body.v34 #view .executive-metric{background:#fff!important;color:var(--v34-text)!important}
body.v34 #view :where(h1,h2,h3,h4,strong,b,.cell-title){color:var(--v34-text)!important;-webkit-text-fill-color:var(--v34-text)!important}body.v34 #view :where(p,small,.cell-sub,.muted){color:var(--v34-muted)!important;-webkit-text-fill-color:var(--v34-muted)!important}
body.v34 #view :where(.hero-strip,.today-hero,.v11-operation-hero,.cycle-hero,.mileage-hero,.route-history-hero,.trash-hero){background:linear-gradient(120deg,#fff,#f6f9ff)!important;color:var(--v34-text)!important;border:1px solid var(--v34-line)!important;box-shadow:var(--v34-shadow)!important;border-radius:16px!important}body.v34 #view :where(.hero-strip,.today-hero,.v11-operation-hero,.cycle-hero,.mileage-hero,.route-history-hero,.trash-hero) :where(h1,h2,h3,h4,strong,b,p,small,span){color:var(--v34-text)!important;-webkit-text-fill-color:var(--v34-text)!important}
body.v34 #view .next-best-action{background:linear-gradient(140deg,#07366f,#07569e)!important;color:#fff!important;border:0!important}body.v34 #view .next-best-action :where(h1,h2,h3,h4,strong,b,p,small,span){color:#fff!important;-webkit-text-fill-color:#fff!important}.next-best-icon{background:#f5f7bd!important;color:#496100!important}
body.v34 #view .v11-section-number{background:var(--v34-yellow)!important;color:var(--v34-navy)!important;border-color:var(--v34-yellow)!important}
body.v34 #view .metric-icon.blue,body.v34 #view .operation-pulse-icon{background:#e9f2ff!important;color:var(--v34-blue)!important}body.v34 #view .metric-icon.green{background:#e8f8f1!important;color:var(--v34-green)!important}body.v34 #view .metric-icon.yellow{background:#fff2df!important;color:var(--v34-orange)!important}body.v34 #view .metric-icon.purple{background:#f0eaff!important;color:var(--v34-purple)!important}body.v34 #view .metric-icon.red{background:#ffe9e9!important;color:var(--v34-red)!important}
body.v34 #view .btn.primary{background:linear-gradient(90deg,var(--v34-blue),#0a5bd5)!important;color:#fff!important;-webkit-text-fill-color:#fff!important;border-color:var(--v34-blue)!important}body.v34 #view .btn.secondary{background:#fff!important;color:var(--v34-blue)!important;-webkit-text-fill-color:var(--v34-blue)!important;border:1px solid #bfd2eb!important}
body.v34 #view table th{background:#f7f9fc!important;color:#42526b!important;-webkit-text-fill-color:#42526b!important;font-weight:900!important}body.v34 #view table td{background:#fff!important;color:#183653!important;-webkit-text-fill-color:#183653!important;border-bottom:1px solid #edf1f6!important}
body.v34 input,body.v34 select,body.v34 textarea{background:#fff!important;color:#183653!important;-webkit-text-fill-color:#183653!important;border:1px solid #cfd9e7!important;border-radius:9px!important}
body.v34 .v11-delivery-card{background:#fff!important;border-color:var(--v34-line)!important;box-shadow:var(--v34-shadow)!important}body.v34 .v11-delivery-head{background:#fff!important;border-color:#e7edf5!important}body.v34 .journey-timeline{background:#263f4b!important}body.v34 .v11-next-action{background:#f7f9fc!important;border-color:#e3eaf3!important}
body.v34 .modal-wrap{backdrop-filter:blur(3px)}body.v34 .modal{background:#f7f9fc!important;border-radius:18px!important}body.v34 .modal-head{background:linear-gradient(100deg,var(--v34-deep),#074783)!important;color:#fff!important;border:0!important}body.v34 .modal-head h2,body.v34 .modal-head p,body.v34 .modal-kicker{color:#fff!important;-webkit-text-fill-color:#fff!important}
.v34-register-stepper{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:12px;max-width:760px}.v34-register-stepper span{display:flex;align-items:center;gap:6px;color:#dce9fb;font-size:10px;font-weight:850;white-space:nowrap}.v34-register-stepper b{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff}.v34-register-stepper span:first-child b{background:var(--v34-yellow);color:var(--v34-navy)}
.v34-mobile-dock,.v34-mobile-fab{display:none}
@media(max-width:900px){body.v34 .app-shell{display:block!important;width:100%!important}body.v34 .sidebar{position:fixed!important;left:0!important;top:0!important;width:min(86vw,320px)!important;min-width:min(86vw,320px)!important;max-width:min(86vw,320px)!important;transform:translateX(-105%)!important;transition:transform .2s ease!important;z-index:2000!important}body.v34 .sidebar.open{transform:translateX(0)!important}body.v34 .main-content{width:100%!important}body.v34 .topbar{min-height:72px!important;padding:8px 10px!important;gap:7px!important}.v34-menu-toggle{display:none!important}.v34-top-brand{display:flex!important;gap:7px!important}.v34-top-brand .nilo{width:91px;max-height:36px}.v34-top-brand .triela-box{height:38px;min-width:100px;padding:4px 7px}.v34-top-brand .triela{max-width:88px;max-height:28px}body.v34 .topbar-title{display:none!important}body.v34 .topbar-actions{display:none!important}body.v34 .filter-panel{margin:8px 10px!important}body.v34 #view{padding:0 10px 132px!important}body.v34 .mobile-app-dock{display:none!important}.v34-mobile-dock{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:8px;right:8px;bottom:8px;z-index:1800;background:#062b63;border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:7px 4px max(7px,env(safe-area-inset-bottom));box-shadow:0 12px 40px rgba(6,43,99,.28)}.v34-mobile-dock button{border:0;background:transparent;color:#d8e5f7;display:grid;place-items:center;gap:3px;min-height:54px;font:inherit;font-size:10px;font-weight:850}.v34-mobile-dock button.active{color:var(--v34-yellow)}.v34-mobile-dock svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.v34-mobile-fab{display:flex;align-items:center;justify-content:center;gap:8px;position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:1801;border:0;border-radius:999px;background:var(--v34-yellow);color:var(--v34-navy);font-weight:950;padding:13px 18px;box-shadow:0 12px 28px rgba(255,213,0,.30);white-space:nowrap}.v34-register-stepper{grid-template-columns:repeat(5,1fr);gap:4px}.v34-register-stepper span{font-size:0;justify-content:center}.v34-register-stepper b{width:28px;height:28px;font-size:11px}}
`;
function injectCSS(){if(q('#nilo-v34-style'))return;const s=document.createElement('style');s.id='nilo-v34-style';s.textContent=CSS;document.head.appendChild(s)}
function setIcon(btn){const v=btn?.dataset?.view;if(!v||!ICONS[v])return;const i=q('.nav-ico',btn);if(i&&i.dataset.v34!=='1'){i.dataset.v34='1';i.innerHTML=ICONS[v]}}
function setText(btn,text){if(!btn)return;const spans=qa(':scope > span',btn);const t=spans.find(x=>!x.classList.contains('nav-ico')&&!x.classList.contains('nav-badge'));if(t)t.textContent=text}
function group(title,items){const g=document.createElement('div');g.className='v34-nav-group';const h=document.createElement('div');h.className='v34-nav-title';h.textContent=title;g.appendChild(h);items.forEach(x=>x&&g.appendChild(x));return g}
function combo(title,items){const c=document.createElement('div');c.className='v34-combo';const h=document.createElement('div');h.className='v34-combo-title';h.textContent=title;c.appendChild(h);items.forEach(x=>x&&c.appendChild(x));return c}
function setupNav(){const nav=q('#mainNav');if(!nav||nav.dataset.v34==='1')return;const buttons=qa('.nav-item',nav);const m=new Map(buttons.map(b=>[b.dataset.view,b]));const labels={today:'Central de Operação',deliveries:'Entregas',scheduled:'Programadas',pending:'Pendências',cycles:'Ciclos',odometer:'Quilometragem','route-history':'Histórico de rotas',dashboard:'Desempenho',reports:'Relatórios',neighborhoods:'Análise por bairro',costs:'Custos',trace:'Pesquisar entregas',settings:'Cadastros',trash:'Lixeira'};Object.entries(labels).forEach(([v,t])=>setText(m.get(v),t));nav.innerHTML='';nav.appendChild(group('OPERAÇÃO',[m.get('today'),combo('ENTREGAS & PROGRAMAÇÕES',[m.get('deliveries'),m.get('scheduled'),m.get('pending')]),combo('ROTAS, CICLOS & KM',[m.get('cycles'),m.get('route-history'),m.get('odometer')]) ]));nav.appendChild(group('ANÁLISES',[combo('ANÁLISES & RELATÓRIOS',[m.get('dashboard'),m.get('reports'),m.get('neighborhoods'),m.get('costs'),m.get('trace')]) ]));nav.appendChild(group('ADMINISTRAÇÃO',[combo('ADMINISTRAÇÃO & CADASTROS',[m.get('settings'),m.get('trash')]) ]));buttons.forEach(setIcon);nav.dataset.v34='1'}
function setupBrand(){const brand=q('.brand-block');if(brand&&!q('.v34-side-nilo',brand)){brand.innerHTML=`<img class="v34-side-nilo" src="${ASSET.nilo}" alt="Nilo"><img class="v34-side-mini" src="${ASSET.mascot}" alt="Mascote Nilo">`}const sidebar=q('.sidebar');if(sidebar&&!q('.v34-side-branding',sidebar)){const box=document.createElement('div');box.className='v34-side-branding';box.innerHTML=`<div class="v34-partner"><img src="${ASSET.triela}" alt="Triela Soluções"></div><div class="v34-mascot-wrap"><img src="${ASSET.mascot}" alt="Mascote Nilo"></div>`;const footer=q('.sidebar-footer',sidebar);sidebar.insertBefore(box,footer||null)}const nav=q('#mainNav');const mode=q('.mode-card');if(nav&&mode&&!q('.v34-training',sidebar)){const w=document.createElement('div');w.className='v34-training';w.innerHTML='<div class="v34-training-title">TREINAMENTO</div>';w.appendChild(mode);nav.insertAdjacentElement('afterend',w)}}
function setupTop(){const top=q('.topbar'),title=q('.topbar-title');if(!top||!title)return;if(!q('.v34-menu-toggle',top)){const b=document.createElement('button');b.type='button';b.className='v34-menu-toggle';b.setAttribute('aria-label','Recolher ou abrir menu');b.textContent='☰';b.addEventListener('click',()=>document.body.classList.toggle('v34-expanded'));top.insertBefore(b,top.firstChild)}if(!q('.v34-top-brand',top)){const d=document.createElement('div');d.className='v34-top-brand';d.innerHTML=`<img class="nilo" src="${ASSET.nilo}" alt="Nilo"><span class="triela-box"><img class="triela" src="${ASSET.triela}" alt="Triela Soluções"></span>`;top.insertBefore(d,title)}if(!q('.v34-greeting',title)){const holder=q(':scope > div',title);if(holder){holder.classList.add('v34-title-copy');const g=document.createElement('span');g.className='v34-greeting';g.textContent='Olá, Prevenção! 👋';holder.insertBefore(g,holder.firstChild)}}}
function setupMenu(){if(innerWidth>900&&!document.body.dataset.v34Init){document.body.dataset.v34Init='1';document.body.classList.add('v34-expanded')}}
function setupMobile(){if(q('.v34-mobile-dock'))return;const dock=document.createElement('nav');dock.className='v34-mobile-dock';dock.setAttribute('aria-label','Navegação rápida');const items=[['today','Início'],['deliveries','Entregas'],['cycles','Rotas'],['reports','Relatórios']];items.forEach(([v,l],i)=>{const b=document.createElement('button');b.type='button';b.dataset.v34View=v;b.className=i===0?'active':'';b.innerHTML=(ICONS[v]||'')+`<span>${l}</span>`;b.addEventListener('click',()=>{q(`#mainNav .nav-item[data-view="${v}"]`)?.click();qa('.v34-mobile-dock button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});dock.appendChild(b)});const more=document.createElement('button');more.type='button';more.innerHTML='<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span>Mais</span>';more.addEventListener('click',()=>{(q('#mobileMenuBtn')||q('#menuBtn'))?.click()});dock.appendChild(more);document.body.appendChild(dock);const fab=document.createElement('button');fab.type='button';fab.className='v34-mobile-fab';fab.textContent='＋ Registrar compra';fab.addEventListener('click',()=>{(q('#quickNewDeliveryBtn')||q('#mobileNewDeliveryBtn'))?.click()});document.body.appendChild(fab)}
function registerStepper(){const modal=q('#modal'),head=q('#modal .modal-head');if(!modal||!head)return;const title=(q('#modalTitle')?.textContent||'').trim();const active=/Registrar nova compra|Nova compra|Registrar compra/i.test(title)||Boolean(q('#quickDeliveryForm'));if(active&&!q('.v34-register-stepper',head)){const s=document.createElement('div');s.className='v34-register-stepper';['Identificação','Tipo','Taxa','Entrega','Endereço'].forEach((t,i)=>{const x=document.createElement('span');x.innerHTML=`<b>${i+1}</b>${t}`;s.appendChild(x)});(q(':scope > div',head)||head).appendChild(s)}}
function footer(){const f=q('.sidebar-footer>div small');if(f)f.textContent='Operação + sincronização • Layout V34'}
function refresh(){if(!document.body.classList.contains('v34'))return;qa('#mainNav .nav-item').forEach(setIcon);registerStepper();footer()}
function init(){document.body.classList.add('v34');document.documentElement.setAttribute('data-nilo-visual-version',VERSION);injectCSS();setupNav();setupBrand();setupTop();setupMenu();setupMobile();registerStepper();footer();setInterval(refresh,2200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,30),{once:true});else setTimeout(init,30);
})();

/* =====================================================================
   NILO ENTREGAS • V34.1 — MENU FIXO + MASCOTE PADRONIZADO
   - elimina qualquer faixa branca abaixo/ao lado do menu;
   - sidebar ocupa 100% da altura visível;
   - conteúdo e topbar acompanham 76px / 252px;
   - mascote sem moldura quadrada aparente, integrado ao fundo do menu.
   ===================================================================== */
(() => {
  'use strict';
  if (document.getElementById('nilo-v34-1-fix')) return;

  const style = document.createElement('style');
  style.id = 'nilo-v34-1-fix';
  style.textContent = `
    @media (min-width:901px){
      body.v34 .app-shell{
        display:block!important;
        width:100%!important;
        max-width:none!important;
        min-height:100vh!important;
        margin:0!important;
      }

      body.v34 .sidebar{
        position:fixed!important;
        left:0!important;
        top:0!important;
        bottom:0!important;
        height:100vh!important;
        min-height:100vh!important;
        width:76px!important;
        min-width:76px!important;
        max-width:76px!important;
        margin:0!important;
        border-radius:0!important;
        background:linear-gradient(180deg,#031b43 0%,#062b63 55%,#073d7d 100%)!important;
        overflow:hidden!important;
        z-index:200!important;
      }

      body.v34.v34-expanded .sidebar{
        width:252px!important;
        min-width:252px!important;
        max-width:252px!important;
      }

      body.v34 .main-content{
        margin-left:76px!important;
        width:calc(100% - 76px)!important;
        max-width:none!important;
        min-width:0!important;
        transition:margin-left .2s ease,width .2s ease!important;
      }

      body.v34.v34-expanded .main-content{
        margin-left:252px!important;
        width:calc(100% - 252px)!important;
      }

      body.v34 .topbar{
        left:auto!important;
        right:auto!important;
        width:100%!important;
        max-width:none!important;
        margin:0!important;
      }

      body.v34 #view,
      body.v34 .filter-panel{
        width:auto!important;
        max-width:none!important;
      }

      body.v34 .v34-side-branding{
        margin-top:auto!important;
        padding:6px 4px 0!important;
      }

      body.v34 .v34-partner{
        height:54px!important;
        margin:0 4px 4px!important;
        border-radius:10px!important;
        border:1px solid rgba(255,213,0,.7)!important;
        background:#fff!important;
      }

      body.v34 .v34-partner img{
        max-height:39px!important;
        width:auto!important;
        max-width:92%!important;
      }

      body.v34 .v34-mascot-wrap{
        height:190px!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        border-radius:0!important;
        box-shadow:none!important;
        background:#001536!important;
        overflow:hidden!important;
        display:flex!important;
        align-items:flex-end!important;
        justify-content:center!important;
      }

      body.v34 .v34-mascot-wrap img{
        display:block!important;
        height:190px!important;
        width:auto!important;
        max-width:none!important;
        object-fit:contain!important;
        object-position:center bottom!important;
        border:0!important;
        border-radius:0!important;
        box-shadow:none!important;
        background:transparent!important;
      }

      body.v34 .sidebar-footer{
        flex:0 0 auto!important;
        margin:5px 4px 4px!important;
      }
    }

    @media (max-width:900px){
      body.v34 .main-content{
        margin-left:0!important;
        width:100%!important;
      }
    }
  `;
  document.head.appendChild(style);
})();

