const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0}).format(Number(n)||0);
const number = n => new Intl.NumberFormat("vi-VN").format(Number(n)||0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = new Date();
$("#today").textContent = today.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"});
let page = "dashboard", booksCache=[], customersCache=[], suppliersCache=[], invoicesCache=[], currentQuery="";
const titles={dashboard:"Tổng quan",books:"Quản lý sách",customers:"Khách hàng",suppliers:"Nhà cung cấp",purchases:"Nhập hàng",invoices:"Bán hàng / Hóa đơn",promotions:"Chương trình khuyến mãi",returns:"Đổi / trả hàng",reports:"Báo cáo & thống kê"};
async function api(url, options={}) {
  const res=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Có lỗi xảy ra.");
  return data;
}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),3000)}

/* ===== Vai trò (actor) theo sơ đồ use case — chỉ phục vụ demo giao diện, chưa phải đăng nhập/bảo mật thật ===== */
const DEMO_CUSTOMER_CODE="KH001";
const NAV_ITEMS={dashboard:["⌂","Tổng quan"],books:["▤","Quản lý sách"],customers:["♙","Khách hàng"],suppliers:["▣","Nhà cung cấp"],purchases:["⇩","Nhập hàng"],stock:["◫","Tồn kho & kiểm kê"],invoices:["▧","Bán hàng / Hóa đơn"],promotions:["％","Chương trình khuyến mãi"],returns:["⇄","Đổi / trả hàng"],reports:["▥","Báo cáo & thống kê"],mytier:["★","Hạng thành viên của tôi"],myinvoices:["▧","Hóa đơn của tôi"]};
const ROLES={
 customer:{label:"Khách hàng",icon:"♙",desc:"Tra cứu sách, xem hạng thành viên và hóa đơn của tôi",home:"books",can:{},nav:[["TRA CỨU",["books"]],["TÀI KHOẢN CỦA TÔI",["mytier","myinvoices"]]]},
 sales:{label:"Nhân viên bán hàng",icon:"▧",desc:"Lập hóa đơn, đổi/trả hàng, lưu thông tin khách, tra cứu sách",home:"invoices",can:{customerEdit:1},nav:[["BÁN HÀNG",["invoices","returns","promotions"]],["KHÁCH HÀNG",["customers"]],["TRA CỨU",["books"]]]},
 warehouse:{label:"Nhân viên kho",icon:"◫",desc:"Quản lý sách, nhập hàng, kiểm kê, theo dõi tồn kho, tra cứu NCC",home:"stock",can:{bookEdit:1},nav:[["SÁCH",["books"]],["KHO",["purchases","stock"]],["NHÀ CUNG CẤP",["suppliers"]]]},
 manager:{label:"Quản lý",icon:"⌂",desc:"Toàn quyền quản lý cửa hàng, báo cáo & thống kê",home:"dashboard",can:{bookEdit:1,customerEdit:1,customerDelete:1,supplierEdit:1},nav:[["TỔNG QUAN",["dashboard"]],["NGHIỆP VỤ",["books","customers","suppliers","purchases","stock","invoices","promotions","returns","reports"]]]}
};
for(const r of Object.values(ROLES)) r.pages=r.nav.flatMap(g=>g[1]);
let role="manager";
try{const saved=localStorage.getItem("bookstore_role");if(ROLES[saved])role=saved}catch{}
const can=k=>!!ROLES[role].can[k];
function navLabel(p){if(p==="books"&&!can("bookEdit"))return"Tra cứu sách";if(p==="suppliers"&&!can("supplierEdit"))return"Tra cứu nhà cung cấp";return NAV_ITEMS[p][1]}
function pageTitle(p){return NAV_ITEMS[p]?navLabel(p):titles[p]}
function buildNav(){
 $("#nav").innerHTML=ROLES[role].nav.map(([g,items])=>`<div class="nav-label">${g}</div>`+items.map(p=>`<button class="nav-item${p===page?" active":""}" data-page="${p}"><span>${NAV_ITEMS[p][0]}</span>${esc(navLabel(p))}</button>`).join("")).join("");
 document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.page)));
}
function buildRoleSwitch(){
 const r=ROLES[role];$("#role-btn").innerHTML=`<span class="role-ic">${r.icon}</span><span><small>Vai trò</small><strong>${esc(r.label)}</strong></span><span class="role-caret">▾</span>`;
 $("#role-menu").innerHTML=Object.entries(ROLES).map(([k,x])=>`<button class="role-opt${k===role?" active":""}" role="option" aria-selected="${k===role}" data-role="${k}"><span class="role-ic">${x.icon}</span><span><strong>${esc(x.label)}${k==="customer"?` <em>(${DEMO_CUSTOMER_CODE})</em>`:""}</strong><small>${esc(x.desc)}</small></span></button>`).join("");
 $("#role-menu").querySelectorAll("[data-role]").forEach(b=>b.onclick=()=>{closeRoleMenu();applyRole(b.dataset.role)});
 $("#eyebrow").textContent="VAI TRÒ: "+r.label.toUpperCase();
}
function closeRoleMenu(){$("#role-menu").hidden=true;$("#role-btn").setAttribute("aria-expanded","false")}
$("#role-btn").addEventListener("click",e=>{e.stopPropagation();const m=$("#role-menu");m.hidden=!m.hidden;$("#role-btn").setAttribute("aria-expanded",String(!m.hidden))});
document.addEventListener("click",e=>{if(!e.target.closest(".role-switch"))closeRoleMenu()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeRoleMenu()});
function applyRole(k){
 role=k;shop.genre=null;shop.q="";shop.bookId=null;try{localStorage.setItem("bookstore_role",k)}catch{}
 closeModal();buildRoleSwitch();setPage(ROLES[k].home);
}
function setPage(p){if(!ROLES[role].pages.includes(p))p=ROLES[role].home;if(p!==page||p==="books")shop.bookId=null;page=p;currentQuery="";buildNav();$("#page-title").textContent=pageTitle(p);renderPage()}
$("#refresh").addEventListener("click",()=>renderPage());

async function renderPage(){
  const c=$("#content"); c.innerHTML='<div class="loading">Đang tải dữ liệu...</div>';
  try{
    if(page==="dashboard") return await dashboard();
    if(page==="books") return await booksPage();
    if(page==="customers") return await customersPage();
    if(page==="suppliers") return await suppliersPage();
    if(page==="purchases") return await purchasesPage();
    if(page==="invoices") return await invoicesPage();
    if(page==="promotions") return await promotionsPage();
    if(page==="stock") return await stockPage();
    if(page==="mytier") return await myTierPage();
    if(page==="myinvoices") return await myInvoicesPage();
    if(page==="returns") return await returnsPage();
    if(page==="reports") return await reportsPage();
  }catch(e){c.innerHTML=`<div class="panel"><strong>Không thể tải dữ liệu</strong><p class="muted">${esc(e.message)}</p><button class="btn btn-primary" onclick="renderPage()">Thử lại</button></div>`}
}
function sectionHead(title,desc,button,label){return `<div class="section-head"><div><h2>${title}</h2><p>${desc}</p></div>${button?`<button class="btn btn-primary" id="${button}">＋ ${label}</button>`:""}</div>`}
function stat(label,value,sub,icon){return `<div class="stat-card"><div class="stat-top"><span>${label}</span><div class="stat-icon">${icon}</div></div><div class="stat-value">${value}</div><div class="stat-foot">${sub}</div></div>`}
async function dashboard(){
 const d=await api("/api/dashboard");
 $("#content").innerHTML=`<div class="stats">
 ${stat("Đầu sách đang kinh doanh",number(d.books),"Trong danh mục","▤")}
 ${stat("Khách hàng",number(d.customers),"Hồ sơ đã lưu","♙")}
 ${stat("Doanh thu hôm nay",money(d.todayRevenue),"Hóa đơn đã thanh toán","₫")}
 ${stat("Sách cần chú ý",number(d.lowStock),"Đạt hoặc dưới mức tồn tối thiểu","!")}
 </div>
 <div class="grid-2"><div class="panel"><h3>Truy cập nhanh</h3><div class="sub">Các nghiệp vụ thường dùng trong cửa hàng</div>
 <div class="quick-grid">
 <button class="btn btn-primary" data-go="invoices">＋ Tạo hóa đơn bán hàng</button>
 <button class="btn btn-light" data-go="purchases">＋ Lập phiếu nhập</button>
 <button class="btn btn-light" data-go="books">Quản lý danh mục sách</button>
 <button class="btn btn-light" data-go="reports">Xem báo cáo thống kê</button>
 </div></div>
 <div class="panel"><h3>Hóa đơn gần đây</h3><div class="sub">5 hóa đơn mới nhất</div>
 ${d.recent.length?d.recent.map(x=>`<div class="recent-row"><div><strong>${esc(x.code)}</strong><div class="muted">${esc(x.customer)}</div></div><div style="text-align:right"><strong>${money(x.total)}</strong><div class="pill">${esc(x.payment_status)}</div></div></div>`).join(""):'<div class="empty">Chưa có hóa đơn</div>'}
 </div></div>
 <div class="panel" style="margin-top:18px"><h3>Quy trình sử dụng nhanh</h3><div class="sub">Bắt đầu từ danh mục, nhập hàng rồi tạo hóa đơn bán hàng.</div><div class="workflow"><span>01 · Quản lý sách</span><b>→</b><span>02 · Nhập hàng</span><b>→</b><span>03 · Lập hóa đơn</span><b>→</b><span>04 · Báo cáo</span></div></div>`;
 $("#content").insertAdjacentHTML("beforeend",`<style>.quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.quick-grid button{text-align:left;min-height:43px}.recent-row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--line);font-size:11px}.recent-row .muted{margin-top:4px;font-size:10px}.workflow{display:flex;gap:12px;align-items:center;flex-wrap:wrap;color:#52627a;font-size:11px}.workflow span{background:#f5f7ff;padding:10px 12px;border-radius:8px}.workflow b{color:#9aa5b7}</style>`);
 document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>setPage(b.dataset.go));
}
function tableLayout(searchPlaceholder,addId,addLabel,headers,rows){
 return `${sectionHead(pageTitle(page),addId?"Quản lý và cập nhật dữ liệu nghiệp vụ.":"Tra cứu thông tin (chỉ xem).",addId,addLabel)}
 <div class="table-card"><div class="table-toolbar"><input class="search" id="table-search" placeholder="${searchPlaceholder}" value="${esc(currentQuery)}"><span class="hint">${rows.length} bản ghi</span></div>
 <div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows||""}</tbody></table></div></div>`;
}
function actions(type,id){
 const ed={book:"bookEdit",customer:"customerEdit",supplier:"supplierEdit"}[type],del={book:"bookEdit",customer:"customerDelete",supplier:"supplierEdit"}[type];
 if(!can(ed))return type==="book"?`<button class="btn btn-light btn-small" data-view="${id}">Chi tiết</button>`:"—";
 return `<div class="actions"><button class="btn btn-light btn-small" data-edit="${type}:${id}">Sửa</button>${can(del)?`<button class="btn btn-danger btn-small" data-delete="${type}:${id}">Xóa</button>`:""}</div>`}
function bindTableSearch(fn){const s=$("#table-search");if(s)s.addEventListener("input",e=>{currentQuery=e.target.value;clearTimeout(bindTableSearch.timer);bindTableSearch.timer=setTimeout(fn,200)})}
function bookDetail(id){const b=booksCache.find(x=>x.id===Number(id));if(!b)return;const row=(l,v)=>`<tr><td class="muted" style="width:34%">${l}</td><td><strong>${v}</strong></td></tr>`;modal("Thông tin sách",`<div class="book-cell" style="margin-bottom:14px"><div class="book-cover">B</div><div><div class="book-name" style="font-size:14px">${esc(b.title)}</div><div class="muted">${esc(b.author)}</div></div></div><table>${row("Mã sách",esc(b.code))}${row("Thể loại",esc(b.genre||"—"))}${row("Nhà xuất bản",esc(b.publisher||"—"))}${row("Năm xuất bản",b.publish_year||"—")}${row("Giá bán",money(b.price))}${row("Tình trạng",role==="customer"?(b.stock>0?"Còn hàng":"Hết hàng"):`${number(b.stock)} cuốn trong kho`)}</table>${b.description?`<p class="small-note" style="margin-top:12px">${esc(b.description)}</p>`:""}<div class="modal-actions"><button class="btn btn-primary" id="detail-close">Đóng</button></div>`);$("#detail-close").onclick=closeModal}
function bindActions(){document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>bookDetail(b.dataset.view));document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const [t,id]=b.dataset.edit.split(":");editRecord(t,id)});document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{const [t,id]=b.dataset.delete.split(":");deleteRecord(t,id)})}

/* ===== Giao diện tra cứu sách của Khách hàng: tìm kiếm + chọn thể loại → lưới sách → chi tiết ===== */
const GENRE_COLORS={"Văn học":"#8c2f39","Thiếu nhi":"#b34d12","Kỹ năng":"#1f6f78","Fantasy":"#5b3f9a","Kinh doanh":"#1f4e79","Khoa học":"#2a6f4a","Tâm lý":"#a23b72","Tiểu thuyết":"#6b4a2f","Tài chính":"#3b4a5c","Lịch sử":"#7a5c1e","Truyện tranh":"#b83a2e","Kinh tế":"#2d6a8f"};
const FALLBACK_COLORS=["#4a5d8f","#8f4a6b","#3f7a6a","#7a5a3f","#5a4a8f"];
function genreColor(g){if(GENRE_COLORS[g])return GENRE_COLORS[g];let h=0;for(const ch of String(g||""))h=(h*31+ch.charCodeAt(0))>>>0;return FALLBACK_COLORS[h%FALLBACK_COLORS.length]}
const coverHtml=b=>`<div class="cover" style="--c:${genreColor(b.genre)}"><div class="cover-frame"><span class="cover-title">${esc(b.title)}</span></div></div>`;
const shop={genre:null,q:"",bookId:null};
function shopCard(b){return `<button class="shop-card" data-book="${b.id}">${coverHtml(b)}${b.stock>0?"":'<span class="shop-badge">Hết hàng</span>'}<div class="shop-name">${esc(b.title)}</div><div class="shop-author">${esc(b.author)}</div><div class="shop-price">${money(b.price)}</div></button>`}
function bindShopCards(root){root.querySelectorAll("[data-book]").forEach(c=>c.onclick=()=>{shop.bookId=Number(c.dataset.book);renderShopDetail();$("#content").scrollIntoView({block:"start"})})}
function shopFilter(){const toks=fold(shop.q).split(/\s+/).filter(Boolean);return booksCache.filter(b=>(!shop.genre||shop.genre==="__all"||b.genre===shop.genre)&&toks.every(t=>fold(`${b.code} ${b.title} ${b.author} ${b.genre}`).includes(t)))}
function renderShopResults(){
 const box=$("#shop-results");
 if(!shop.genre&&!shop.q.trim()){box.innerHTML='<div class="shop-hint"><strong>Bạn muốn đọc gì hôm nay?</strong><span>Nhập tên sách hoặc tác giả ở trên, hoặc chọn một thể loại để xem các đầu sách.</span></div>';return}
 const list=shopFilter(),g=shop.genre&&shop.genre!=="__all"?shop.genre:"";
 box.innerHTML=`<div class="shop-count">${list.length} cuốn${g?` · thể loại ${esc(g)}`:""}${shop.q.trim()?` · từ khóa “${esc(shop.q.trim())}”`:""}</div>`+(list.length?`<div class="shop-grid">${list.map(shopCard).join("")}</div>`:'<div class="empty">Không tìm thấy sách phù hợp</div>');
 bindShopCards(box);
}
async function customerBooksPage(){
 booksCache=await api("/api/books");
 if(shop.bookId)return renderShopDetail();
 const genres=[...new Set(booksCache.map(b=>b.genre).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
 const chips=()=>`<button class="chip${shop.genre==="__all"?" active":""}" data-genre="__all">Tất cả (${booksCache.length})</button>`+genres.map(g=>`<button class="chip${shop.genre===g?" active":""}" data-genre="${esc(g)}"><i style="background:${genreColor(g)}"></i>${esc(g)}</button>`).join("");
 $("#content").innerHTML=`<div class="shop-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="shop-q" placeholder="Tra cứu theo tên sách, tác giả hoặc mã sách..." autocomplete="off" value="${esc(shop.q)}"></div><div class="chip-label">THỂ LOẠI</div><div class="chips" id="chips">${chips()}</div><div id="shop-results"></div>`;
 const bindChips=()=>$("#chips").querySelectorAll("[data-genre]").forEach(c=>c.onclick=()=>{shop.genre=shop.genre===c.dataset.genre?null:c.dataset.genre;$("#chips").innerHTML=chips();bindChips();renderShopResults()});
 bindChips();
 $("#shop-q").addEventListener("input",e=>{shop.q=e.target.value;renderShopResults()});
 renderShopResults();
}
function renderShopDetail(){
 const b=booksCache.find(x=>x.id===shop.bookId);
 if(!b){shop.bookId=null;return customerBooksPage()}
 const related=booksCache.filter(x=>x.genre===b.genre&&x.id!==b.id),color=genreColor(b.genre);
 const row=(l,v)=>`<tr><td class="muted">${l}</td><td><strong>${v}</strong></td></tr>`;
 $("#content").innerHTML=`<button class="btn btn-light" id="shop-back">← Quay lại danh sách</button>
 <div class="shop-detail panel"><div class="shop-info"><span class="pill" style="background:${color};color:#fff">${esc(b.genre||"Chưa phân loại")}</span><h2>${esc(b.title)}</h2><div class="shop-by">Tác giả: <strong>${esc(b.author||"—")}</strong></div><div class="shop-big-price">${money(b.price)}</div><div>${b.stock>0?'<span class="pill">Còn hàng</span>':'<span class="pill danger">Hết hàng</span>'}</div><table class="shop-meta">${row("Mã sách",esc(b.code))}${row("Nhà xuất bản",esc(b.publisher||"—"))}${row("Năm xuất bản",b.publish_year||"—")}${row("Thể loại",esc(b.genre||"—"))}</table>${b.description?`<p class="shop-desc">${esc(b.description)}</p>`:""}</div><div class="shop-cover">${coverHtml(b)}</div></div>
 <div class="panel related"><div class="related-head"><div><h3>Sách cùng thể loại</h3><div class="sub" style="margin:0">${related.length?`${related.length} cuốn khác thuộc “${esc(b.genre)}” — lướt ngang để xem thêm`:`Chưa có sách khác thuộc thể loại “${esc(b.genre||"")}”`}</div></div>${related.length?'<div class="related-nav"><button class="btn btn-light btn-small" id="rel-prev" aria-label="Trước">‹</button><button class="btn btn-light btn-small" id="rel-next" aria-label="Sau">›</button></div>':""}</div>${related.length?`<div class="hscroll" id="hscroll">${related.map(shopCard).join("")}</div>`:""}</div>`;
 $("#shop-back").onclick=()=>{shop.bookId=null;customerBooksPage()};
 bindShopCards($("#content"));
 const hs=$("#hscroll");if(hs){$("#rel-prev").onclick=()=>hs.scrollBy({left:-hs.clientWidth*.8,behavior:"smooth"});$("#rel-next").onclick=()=>hs.scrollBy({left:hs.clientWidth*.8,behavior:"smooth"})}
}
async function booksPage(){
 if(role==="customer")return customerBooksPage();
 booksCache=await api("/api/books?q="+encodeURIComponent(currentQuery));
 const edit=can("bookEdit"),cust=role==="customer";
 const status=b=>cust?(b.stock>0?'<span class="pill">Còn hàng</span>':'<span class="pill danger">Hết hàng</span>'):(b.stock<=b.min_stock?'<span class="pill danger">Sắp hết / hết</span>':'<span class="pill">Đủ hàng</span>');
 const rows=booksCache.map(b=>`<tr><td><strong>${esc(b.code)}</strong></td><td><div class="book-cell"><div class="book-cover">B</div><div><div class="book-name">${esc(b.title)}</div><div class="muted">${esc(b.author)}</div></div></div></td><td>${esc(b.genre||"—")}</td><td>${money(b.price)}</td>${cust?"":`<td>${number(b.stock)}</td>`}<td>${status(b)}</td><td>${actions("book",b.id)}</td></tr>`).join("");
 $("#content").innerHTML=tableLayout("Tìm theo tên, mã sách, tác giả, thể loại...",edit?"add-record":null,"Thêm sách",["MÃ SÁCH","THÔNG TIN SÁCH","THỂ LOẠI","GIÁ BÁN",...(cust?[]:["TỒN KHO"]),cust?"TÌNH TRẠNG":"TRẠNG THÁI",edit?"THAO TÁC":"CHI TIẾT"],rows);
 if(edit)$("#add-record").onclick=()=>recordModal("book");bindTableSearch(booksPage);bindActions();
}
const tierKey=t=>({"Bạc":"silver","Vàng":"gold","Kim cương":"diamond"}[t]||"basic");
async function customersPage(){
 customersCache=await api("/api/customers?q="+encodeURIComponent(currentQuery));
 const rows=customersCache.map(c=>`<tr><td><strong>${esc(c.code)}</strong></td><td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.email)}</div></td><td>${esc(c.phone||"—")}</td><td>${esc(c.address||"—")}</td><td>${number(c.points)}</td><td><span class="pill tier-${tierKey(c.tier)}">${esc(c.tier)}</span></td>${can("customerEdit")?`<td>${actions("customer",c.id)}</td>`:""}</tr>`).join("");
 $("#content").innerHTML=tableLayout("Tìm tên, mã hoặc số điện thoại...",can("customerEdit")?"add-record":null,"Thêm khách hàng",["MÃ KH","KHÁCH HÀNG","SỐ ĐIỆN THOẠI","ĐỊA CHỈ","ĐIỂM","HẠNG",...(can("customerEdit")?["THAO TÁC"]:[])],rows);
 if(can("customerEdit"))$("#add-record").onclick=()=>recordModal("customer");bindTableSearch(customersPage);bindActions();
}
async function suppliersPage(){
 suppliersCache=await api("/api/suppliers?q="+encodeURIComponent(currentQuery));
 const rows=suppliersCache.map(s=>`<tr><td><strong>${esc(s.code)}</strong></td><td><strong>${esc(s.name)}</strong><div class="muted">${esc(s.email)}</div></td><td>${esc(s.phone||"—")}</td><td>${esc(s.address||"—")}</td><td>${s.active?'<span class="pill">Đang hoạt động</span>':'<span class="pill warn">Ngừng hoạt động</span>'}</td>${can("supplierEdit")?`<td>${actions("supplier",s.id)}</td>`:""}</tr>`).join("");
 $("#content").innerHTML=tableLayout("Tìm nhà cung cấp, mã, số điện thoại...",can("supplierEdit")?"add-record":null,"Thêm nhà cung cấp",["MÃ NCC","NHÀ CUNG CẤP","ĐIỆN THOẠI","ĐỊA CHỈ","TRẠNG THÁI",...(can("supplierEdit")?["THAO TÁC"]:[])],rows);
 if(can("supplierEdit"))$("#add-record").onclick=()=>recordModal("supplier");bindTableSearch(suppliersPage);bindActions();
}
function modal(title,body){
 $("#modal-root").innerHTML=`<div class="modal-backdrop" id="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="close" id="modal-close">Đóng</button></div><div class="modal-body">${body}</div></div></div>`;
 $("#modal-close").onclick=closeModal;$("#modal-backdrop").onclick=e=>{if(e.target.id==="modal-backdrop")closeModal()};
}
function closeModal(){$("#modal-root").innerHTML=""}
function field(label,name,value="",type="text",required=false,extra=""){return `<div class="field"><label>${label}${required?' *':''}</label><input name="${name}" type="${type}" value="${esc(value)}" ${required?"required":""} ${extra}></div>`}
function formBody(fields,submitText="Lưu thông tin"){return `<form id="record-form"><div class="form-grid">${fields}</div><div class="modal-actions"><button type="button" class="btn btn-light" id="cancel-form">Hủy</button><button class="btn btn-primary">${submitText}</button></div></form>`}
function readForm(form){return Object.fromEntries(new FormData(form).entries())}
const schemas={
 book:{title:"sách",endpoint:"books",fields:b=>field("Mã sách","code",b?.code||"", "text",true)+field("Tên sách","title",b?.title||"", "text",true)+field("Tác giả","author",b?.author||"")+field("Thể loại","genre",b?.genre||"")+field("Nhà xuất bản","publisher",b?.publisher||"")+field("Năm xuất bản","publish_year",b?.publish_year||"","number")+field("Giá bán (VNĐ)","price",b?.price??0,"number",true,'min="0"')+field("Giá nhập (VNĐ)","cost_price",b?.cost_price??0,"number",false,'min="0"')+field("Tồn kho ban đầu","stock",b?.stock??0,"number",false,'min="0"')+field("Mức tồn tối thiểu","min_stock",b?.min_stock??5,"number",false,'min="0"')+`<div class="field full"><label>Mô tả</label><textarea name="description">${esc(b?.description||"")}</textarea></div>`},
 customer:{title:"khách hàng",endpoint:"customers",fields:c=>field("Mã khách hàng","code",c?.code||"","text",true)+field("Họ và tên","name",c?.name||"","text",true)+field("Số điện thoại","phone",c?.phone||"")+field("Email","email",c?.email||"","email")+field("Địa chỉ","address",c?.address||"")+field("Điểm tích lũy","points",c?.points??0,"number")+`<div class="field"><label>Hạng thành viên</label><input value="${esc(c?.tier||"Thường")}" disabled><small class="muted">Tự động xếp theo điểm tích lũy (1 điểm = 10.000 ₫ đã mua)</small></div>`},
 supplier:{title:"nhà cung cấp",endpoint:"suppliers",fields:s=>field("Mã nhà cung cấp","code",s?.code||"","text",true)+field("Tên nhà cung cấp","name",s?.name||"","text",true)+field("Số điện thoại","phone",s?.phone||"")+field("Email","email",s?.email||"","email")+`<div class="field full"><label>Địa chỉ</label><input name="address" value="${esc(s?.address||"")}"></div>`}
};
async function recordModal(type,record=null){
 const schema=schemas[type],isEdit=!!record;
 modal((isEdit?"Chỉnh sửa ":"Thêm ")+schema.title,formBody(schema.fields(record),isEdit?"Lưu thay đổi":"Thêm mới"));
 $("#cancel-form").onclick=closeModal;
 $("#record-form").onsubmit=async e=>{e.preventDefault();const data=readForm(e.target);
  for(const k of ["price","cost_price","stock","min_stock","publish_year","points"])if(data[k]!==undefined&&data[k]!=="")data[k]=Number(data[k]);
  try{await api(`/api/${schema.endpoint}${isEdit?"/"+record.id:""}`,{method:isEdit?"PUT":"POST",body:JSON.stringify(data)});closeModal();toast("Đã lưu "+schema.title+" thành công.");renderPage()}catch(err){toast(err.message)}
 };
}
function editRecord(type,id){const map={book:booksCache,customer:customersCache,supplier:suppliersCache};const rec=map[type]?.find(x=>x.id===Number(id));if(rec)recordModal(type,rec)}
async function deleteRecord(type,id){
 if(!confirm("Bạn chắc chắn muốn xóa/ngừng sử dụng bản ghi này?"))return;
 const endpoint={book:"books",customer:"customers",supplier:"suppliers"}[type];
 try{const r=await api(`/api/${endpoint}/${id}`,{method:"DELETE"});toast(r.message||"Đã xử lý bản ghi.");renderPage()}catch(e){toast(e.message)}
}
async function purchasesPage(){
 const [purchases,books,suppliers]=await Promise.all([api("/api/purchases"),api("/api/books"),api("/api/suppliers")]);booksCache=books;suppliersCache=suppliers;
 const rows=purchases.map(p=>`<tr><td><strong>${esc(p.code)}</strong></td><td>${esc(p.supplier_name||"—")}</td><td>${money(p.total)}</td><td>${new Date(p.created_at+"Z").toLocaleString("vi-VN")}</td><td><span class="pill">Đã ghi nhận</span></td></tr>`).join("");
 $("#content").innerHTML=sectionHead("Nhập hàng","Lập phiếu nhập và cập nhật số lượng tồn kho.","new-purchase","Lập phiếu nhập")+`<div class="table-card"><div class="table-toolbar"><span class="hint">${purchases.length} phiếu nhập</span><span class="hint">Tồn kho tăng khi phiếu nhập được lưu</span></div><div class="table-wrap"><table><thead><tr><th>MÃ PHIẾU</th><th>NHÀ CUNG CẤP</th><th>TỔNG TIỀN</th><th>NGÀY NHẬP</th><th>TRẠNG THÁI</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">Chưa có phiếu nhập</td></tr>'}</tbody></table></div></div>`;
 $("#new-purchase").onclick=()=>purchaseModal(books,suppliers);
}
function purchaseModal(books,suppliers){
 if(!books.length||!suppliers.some(s=>s.active)){toast("Cần có sách và nhà cung cấp đang hoạt động trước khi nhập hàng.");return}
 modal("Lập phiếu nhập",`<form id="purchase-form"><div class="field"><label>Nhà cung cấp *</label><select name="supplier_id" required>${suppliers.filter(s=>s.active).map(s=>`<option value="${s.id}">${esc(s.code)} — ${esc(s.name)}</option>`).join("")}</select></div><div class="field" style="margin-top:15px"><label>Danh sách sách nhập</label></div><div id="purchase-lines"></div><button type="button" class="btn btn-light" id="add-purchase-line">＋ Thêm dòng sách</button><div class="field" style="margin-top:15px"><label>Ghi chú</label><textarea name="note"></textarea></div><div class="modal-actions"><button type="button" class="btn btn-light" id="cancel-form">Hủy</button><button class="btn btn-primary">Lưu phiếu nhập</button></div></form>`);
 const lines=$("#purchase-lines");
 function addLine(){const row=document.createElement("div");row.className="item-line";row.innerHTML=`<select class="purchase-book">${books.map(b=>`<option value="${b.id}">${esc(b.code)} · ${esc(b.title)}</option>`).join("")}</select><input class="purchase-qty" type="number" min="1" value="1" aria-label="Số lượng"><input class="purchase-cost" type="number" min="0" value="${books[0]?.cost_price||0}" aria-label="Đơn giá nhập"><button type="button" class="close">×</button>`;row.querySelector("button").onclick=()=>row.remove();lines.appendChild(row)}
 addLine();$("#add-purchase-line").onclick=addLine;$("#cancel-form").onclick=closeModal;
 $("#purchase-form").onsubmit=async e=>{e.preventDefault();const items=[...lines.querySelectorAll(".item-line")].map(r=>({book_id:Number(r.querySelector(".purchase-book").value),quantity:Number(r.querySelector(".purchase-qty").value),unit_cost:Number(r.querySelector(".purchase-cost").value)}));
 try{await api("/api/purchases",{method:"POST",body:JSON.stringify({supplier_id:Number(e.target.supplier_id.value),items,note:e.target.note.value})});closeModal();toast("Đã lưu phiếu nhập và cập nhật tồn kho.");renderPage()}catch(err){toast(err.message)}};
}
async function demoCustomer(){const list=await api("/api/customers?q="+encodeURIComponent(DEMO_CUSTOMER_CODE));const me=list.find(c=>c.code===DEMO_CUSTOMER_CODE);if(!me)throw new Error("Không tìm thấy khách hàng "+DEMO_CUSTOMER_CODE+" trong hệ thống.");return me}
async function myTierPage(){
 const [me,tiers]=await Promise.all([demoCustomer(),api("/api/membership")]);
 const idx=Math.max(0,tiers.findIndex(t=>t.name===me.tier)),cur=tiers[idx],next=tiers[idx+1];
 const pct=next?Math.min(100,Math.max(0,(me.points-cur.above)/(next.above-cur.above)*100)):100;
 const need=next?next.above+1-me.points:0;
 $("#content").innerHTML=`<div class="tier-hero"><div><div class="muted">${esc(me.code)} · ${esc(me.name)}</div><div class="tier-name"><span class="pill tier-${tierKey(me.tier)}" style="font-size:15px;padding:8px 16px">${esc(me.tier)}</span></div><div class="muted">${cur.rate?`Bạn được giảm <strong>${cur.rate}%</strong> trên mỗi hóa đơn (cộng dồn với khuyến mãi đang áp dụng).`:"Mua sắm để tích điểm và nhận ưu đãi theo hạng."}</div></div><div class="tier-points"><strong>${number(me.points)}</strong><span>điểm tích lũy</span><small class="muted">≈ ${money(me.points*10000)} đã mua</small></div></div>
 <div class="panel" style="margin-bottom:18px"><h3>${next?`Tiến độ lên hạng ${esc(next.name)}`:"Bạn đang ở hạng cao nhất"}</h3><div class="sub">${next?`Cần thêm <strong>${number(need)} điểm</strong> (tương đương ${money(need*10000)} chi tiêu) để lên hạng ${esc(next.name)} và được giảm ${next.rate}%.`:"Cảm ơn bạn đã đồng hành cùng cửa hàng."}</div><div class="progress"><div class="progress-bar" style="width:${pct.toFixed(1)}%"></div></div></div>
 <div class="table-card"><div class="table-toolbar"><strong>Quyền lợi theo hạng</strong><span class="hint">1 điểm = 10.000 ₫ đã mua</span></div><div class="table-wrap"><table><thead><tr><th>HẠNG</th><th>ĐIỀU KIỆN</th><th>ƯU ĐÃI</th></tr></thead><tbody>${tiers.map(t=>`<tr${t.name===me.tier?' style="background:#f6f8ff"':""}><td><span class="pill tier-${tierKey(t.name)}">${esc(t.name)}</span>${t.name===me.tier?' <small class="muted">· hạng của bạn</small>':""}</td><td>${t.above?"Trên "+number(t.above)+" điểm":"Mặc định"}</td><td><strong>${t.rate?"Giảm "+t.rate+"%":"Không giảm"}</strong></td></tr>`).join("")}</tbody></table></div></div>`;
}
async function myInvoicesPage(){
 const me=await demoCustomer(),inv=await api("/api/invoices?customer_id="+me.id);invoicesCache=inv;
 const paid=inv.filter(i=>i.payment_status==="Đã thanh toán"),spent=paid.reduce((s,i)=>s+i.total,0);
 const cls=s=>s==="Đã thanh toán"?"":s==="Hủy thanh toán"?"danger":"warn";
 const rows=inv.map(i=>`<tr><td>${invCodeCell(i)}</td><td>${money(i.total)}</td><td>${esc(i.payment_method)}</td><td>${new Date(i.created_at+"Z").toLocaleString("vi-VN")}</td><td><span class="pill ${cls(i.payment_status)}">${esc(i.payment_status)}</span></td><td><button class="btn btn-light btn-small" data-invoice="${i.id}">Chi tiết</button></td></tr>`).join("");
 $("#content").innerHTML=sectionHead("Hóa đơn của tôi",`${esc(me.code)} · ${esc(me.name)}`)+`<div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">${stat("Hóa đơn đã thanh toán",number(paid.length),"Trong tổng "+inv.length+" hóa đơn","▧")}${stat("Tổng đã mua",money(spent),"Hóa đơn đã thanh toán","₫")}</div><div class="table-card"><div class="table-wrap"><table><thead><tr><th>MÃ HÓA ĐƠN</th><th>TỔNG TIỀN</th><th>THANH TOÁN</th><th>THỜI GIAN</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">Bạn chưa có hóa đơn nào</td></tr>'}</tbody></table></div></div>`;
 document.querySelectorAll("[data-invoice]").forEach(b=>b.onclick=()=>invoiceDetail(b.dataset.invoice));
}
async function stockPage(){
 const [books,checks]=await Promise.all([api("/api/books?q="+encodeURIComponent(currentQuery)),api("/api/stocktakes")]);booksCache=books;
 const low=books.filter(b=>b.stock<=b.min_stock).length,total=books.reduce((s,b)=>s+b.stock,0);
 const st=b=>b.stock===0?'<span class="pill danger">Hết hàng</span>':b.stock<=b.min_stock?'<span class="pill warn">Sắp hết</span>':'<span class="pill">Đủ hàng</span>';
 const rows=books.map(b=>`<tr><td><strong>${esc(b.code)}</strong></td><td><div class="book-name">${esc(b.title)}</div><div class="muted">${esc(b.genre||"")}</div></td><td><strong>${number(b.stock)}</strong></td><td>${number(b.min_stock)}</td><td>${st(b)}</td><td><div class="actions"><input class="count-input" type="number" min="0" placeholder="Thực tế" data-count="${b.id}" aria-label="Số lượng kiểm đếm thực tế"><button class="btn btn-light btn-small" data-stocktake="${b.id}">Kiểm kê</button></div></td></tr>`).join("");
 const hist=checks.map(c=>`<tr><td>${new Date(c.created_at+"Z").toLocaleString("vi-VN")}</td><td><strong>${esc(c.code)}</strong> · ${esc(c.title)}</td><td>${c.system_qty}</td><td>${c.counted_qty}</td><td><strong class="${c.diff<0?"neg":c.diff>0?"pos":""}">${c.diff>0?"+":""}${c.diff}</strong></td></tr>`).join("");
 $("#content").innerHTML=sectionHead("Tồn kho & kiểm kê","Theo dõi tồn kho; nhập số lượng đếm thực tế rồi bấm Kiểm kê để đối chiếu và điều chỉnh.")+`<div class="stats" style="grid-template-columns:repeat(3,minmax(0,1fr))">${stat("Đầu sách",number(books.length),"Đang kinh doanh","▤")}${stat("Tổng số cuốn trong kho",number(total),"Theo hệ thống","▦")}${stat("Cần nhập thêm",number(low),"Đạt hoặc dưới mức tối thiểu","!")}</div>
 <div class="table-card"><div class="table-toolbar"><input class="search" id="table-search" placeholder="Tìm theo tên, mã sách..." value="${esc(currentQuery)}"><span class="hint">${books.length} đầu sách</span></div><div class="table-wrap"><table><thead><tr><th>MÃ SÁCH</th><th>TÊN SÁCH</th><th>TỒN HỆ THỐNG</th><th>TỐI THIỂU</th><th>TRẠNG THÁI</th><th>KIỂM KÊ THỰC TẾ</th></tr></thead><tbody>${rows}</tbody></table></div></div>
 <div class="table-card" style="margin-top:18px"><div class="table-toolbar"><strong>Lịch sử kiểm kê gần đây</strong></div><div class="table-wrap"><table><thead><tr><th>THỜI GIAN</th><th>SÁCH</th><th>HỆ THỐNG</th><th>THỰC TẾ</th><th>CHÊNH LỆCH</th></tr></thead><tbody>${hist||'<tr><td colspan="5" class="empty">Chưa có lần kiểm kê nào</td></tr>'}</tbody></table></div></div>`;
 bindTableSearch(stockPage);
 document.querySelectorAll("[data-stocktake]").forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.stocktake,v=document.querySelector(`[data-count="${id}"]`).value;if(v===""){toast("Hãy nhập số lượng đếm thực tế.");return}try{const before=booksCache.find(b=>b.id===Number(id)).stock,after=await api(`/api/books/${id}/stocktake`,{method:"POST",body:JSON.stringify({counted:Number(v)})});const d=after.stock-before;toast(d===0?"Số liệu khớp, không cần điều chỉnh.":`Đã điều chỉnh tồn kho (${d>0?"+":""}${d}).`);renderPage()}catch(e){toast(e.message)}});
}
async function promotionsPage(){
 const [promos,tiers]=await Promise.all([api("/api/promotions"),api("/api/membership")]);
 const cls={"Đang áp dụng":"","Sắp diễn ra":"warn","Hết hạn":"danger","Tạm dừng":"danger"};
 const period=p=>p.start_date||p.end_date?`${p.start_date?new Date(p.start_date).toLocaleDateString("vi-VN"):"Từ trước"} → ${p.end_date?new Date(p.end_date).toLocaleDateString("vi-VN"):"Không giới hạn"}`:"Không giới hạn";
 const rows=promos.map(p=>`<tr><td><span class="promo-badge">${esc(p.code)}</span></td><td><strong>${esc(p.name)}</strong></td><td>${esc(p.condition.charAt(0).toUpperCase()+p.condition.slice(1))}</td><td><strong>${esc(p.benefit)}</strong></td><td>${period(p)}</td><td><span class="pill ${cls[p.status]||""}">${esc(p.status)}</span></td><td>${number(p.used_count)} hóa đơn<br><small class="muted">−${money(p.used_amount)}</small></td></tr>`).join("");
 const active=promos.filter(p=>p.status==="Đang áp dụng").length;
 $("#content").innerHTML=sectionHead("Chương trình khuyến mãi","Hệ thống tự động áp dụng 1 chương trình có số tiền giảm lớn nhất cho mỗi hóa đơn đạt điều kiện.")+`<div class="table-card"><div class="table-toolbar"><span class="hint">${promos.length} chương trình · ${active} đang áp dụng</span><span class="hint">Các chương trình khuyến mãi không cộng dồn với nhau</span></div><div class="table-wrap"><table><thead><tr><th>MÃ</th><th>TÊN CHƯƠNG TRÌNH</th><th>ĐIỀU KIỆN HÓA ĐƠN</th><th>MỨC GIẢM</th><th>THỜI GIAN</th><th>TRẠNG THÁI</th><th>ĐÃ ÁP DỤNG</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Chưa có chương trình khuyến mãi</td></tr>'}</tbody></table></div></div>`+`<div class="table-card" style="margin-top:20px"><div class="table-toolbar"><span class="hint"><strong>Ưu đãi hạng thành viên</strong> · 1 điểm = 10.000 ₫ đã mua</span><span class="hint">Cộng dồn với 1 khuyến mãi tốt nhất, tính trên số tiền sau khuyến mãi</span></div><div class="table-wrap"><table><thead><tr><th>HẠNG</th><th>ĐIỀU KIỆN ĐIỂM TÍCH LŨY</th><th>TƯƠNG ĐƯƠNG ĐÃ MUA</th><th>ƯU ĐÃI</th></tr></thead><tbody>${tiers.map(t=>`<tr><td><span class="pill tier-${tierKey(t.name)}">${esc(t.name)}</span></td><td>${t.above?"Trên "+number(t.above)+" điểm":"Mặc định"}</td><td>${t.above?"Trên "+money(t.above*10000):"—"}</td><td><strong>${t.rate?"Giảm "+t.rate+"%":"Không giảm"}</strong></td></tr>`).join("")}</tbody></table></div></div>`;
}
async function invoicesPage(){
 const inv=await api("/api/invoices");invoicesCache=inv;
 const rows=inv.map(i=>`<tr><td>${invCodeCell(i)}</td><td>${esc(i.customer_name)}</td><td>${money(i.total)}</td><td>${esc(i.payment_method)}</td><td>${new Date(i.created_at+"Z").toLocaleString("vi-VN")}</td><td><span class="pill">${esc(i.payment_status)}</span></td><td><button class="btn btn-light btn-small" data-invoice="${i.id}">Chi tiết</button></td></tr>`).join("");
 $("#content").innerHTML=sectionHead("Bán hàng / Hóa đơn","Tạo hóa đơn, hệ thống tự áp dụng khuyến mãi tốt nhất và ghi nhận thanh toán.","new-invoice","Tạo hóa đơn")+`<div class="table-card"><div class="table-toolbar"><span class="hint">${inv.length} hóa đơn</span><span class="hint">Hóa đơn mới được thanh toán theo phương thức đã chọn</span></div><div class="table-wrap"><table><thead><tr><th>MÃ HÓA ĐƠN</th><th>KHÁCH HÀNG</th><th>TỔNG TIỀN</th><th>THANH TOÁN</th><th>THỜI GIAN</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Chưa có hóa đơn</td></tr>'}</tbody></table></div></div>`;
 $("#new-invoice").onclick=invoiceModal;
 document.querySelectorAll("[data-invoice]").forEach(b=>b.onclick=()=>invoiceDetail(b.dataset.invoice));
}

/* ===== Ô chọn có tìm kiếm (combobox): bấm để xổ danh sách hoặc gõ mã/tên để lọc ===== */
const fold=s=>String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
function combo({items,placeholder="",emptyItem=null,selected=null,onChange=()=>{}}){
 const wrap=document.createElement("div");wrap.className="combo";
 wrap.innerHTML=`<input type="text" class="combo-input" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" placeholder="${esc(placeholder)}"><span class="combo-caret">▾</span>`;
 const input=wrap.firstChild;let list=null,matches=[],active=0,current=null;
 const pool=items.map(it=>({...it,_k:fold(it.search||it.label)}));
 function setItem(it,silent){current=it;input.value=it?it.label:"";if(!silent)onChange(it)}
 function place(){if(!list)return;const r=input.getBoundingClientRect(),below=innerHeight-r.bottom,h=Math.min(260,list.scrollHeight);const up=below<h+12&&r.top>below;list.style.left=r.left+"px";list.style.width=Math.max(r.width,260)+"px";list.style.top=up?"auto":r.bottom+4+"px";list.style.bottom=up?innerHeight-r.top+4+"px":"auto";list.style.maxHeight=Math.max(120,Math.min(260,(up?r.top:below)-12))+"px"}
 function render(q){
  const toks=fold(q).split(/\s+/).filter(Boolean);
  matches=pool.filter(it=>toks.every(t=>it._k.includes(t)));
  const exact=toks.length?matches.findIndex(it=>fold(it.code||"")===toks[0]):-1;
  if(exact>0)matches.unshift(matches.splice(exact,1)[0]);
  active=0;
  const shown=matches.slice(0,60);
  list.innerHTML=shown.map((it,i)=>`<div class="combo-opt${i===active?" active":""}${current===it?" selected":""}" role="option" data-i="${i}">${it.html||esc(it.label)}</div>`).join("")+(matches.length>60?`<div class="combo-note">Còn ${matches.length-60} kết quả — gõ thêm để thu hẹp</div>`:"")||`<div class="combo-note">Không tìm thấy kết quả phù hợp</div>`;
  place();
 }
 function open(q=""){
  if(!list){list=document.createElement("div");list.className="combo-list";list.setAttribute("role","listbox");
   list.addEventListener("mousedown",e=>{e.preventDefault();const o=e.target.closest(".combo-opt");if(o){pick(matches[Number(o.dataset.i)])}});
   document.body.appendChild(list);addEventListener("resize",place);addEventListener("scroll",place,true)}
  input.setAttribute("aria-expanded","true");render(q);
  const sel=list.querySelector(".selected");if(sel)sel.scrollIntoView({block:"nearest"});
 }
 function close(){if(!list)return;removeEventListener("resize",place);removeEventListener("scroll",place,true);list.remove();list=null;input.setAttribute("aria-expanded","false")}
 function pick(it){if(!it)return;setItem(it);close();input.select&&0}
 function move(d){if(!list||!matches.length)return;active=(active+d+Math.min(matches.length,60))%Math.min(matches.length,60);list.querySelectorAll(".combo-opt").forEach((o,i)=>o.classList.toggle("active",i===active));list.querySelector(".combo-opt.active")?.scrollIntoView({block:"nearest"})}
 input.addEventListener("focus",()=>{input.select();open("")});
 input.addEventListener("click",()=>{if(!list){input.select();open("")}});
 input.addEventListener("input",()=>{if(current){current=null;onChange(null)}open(input.value)});
 input.addEventListener("keydown",e=>{
  if(e.key==="ArrowDown"){e.preventDefault();if(!list)open(input.value);else move(1)}
  else if(e.key==="ArrowUp"){e.preventDefault();move(-1)}
  else if(e.key==="Enter"){if(list){e.preventDefault();pick(matches[active])}}
  else if(e.key==="Escape"&&list){e.preventDefault();e.stopPropagation();close();input.value=current?current.label:""}
 });
 input.addEventListener("blur",()=>{
  if(!current){const t=fold(input.value.trim());
   if(!t&&emptyItem)setItem(emptyItem);
   else if(t){const m=pool.filter(it=>fold(it.code||"")===t);if(m.length===1)setItem(m[0]);else if(matches.length===1&&list)setItem(matches[0]);else input.value=""}}
  else input.value=current.label;
  close();
 });
 setItem(selected||emptyItem,true);
 Object.defineProperties(wrap,{item:{get:()=>current},value:{get:()=>current?current.value:null}});
 wrap.focusInput=()=>input.focus();
 return wrap;
}
async function invoiceModal(){
 const [books,customers]=await Promise.all([api("/api/books"),api("/api/customers")]);booksCache=books;customersCache=customers;
 if(!books.some(b=>b.stock>0)){toast("Không có sách còn hàng để bán.");return}
 modal("Tạo hóa đơn bán hàng",`<form id="invoice-form"><div class="form-grid"><div class="field"><label>Khách hàng <span class="muted" style="font-weight:400">(gõ mã, tên hoặc SĐT để tìm)</span></label><div id="customer-combo"></div></div><div class="field"><label>Phương thức thanh toán</label><select name="payment_method"><option>Tiền mặt</option><option>Chuyển khoản</option><option>Thẻ ngân hàng</option></select></div></div><div class="field" style="margin-top:18px"><label>Danh sách sách</label></div><div id="invoice-lines"></div><button type="button" class="btn btn-light" id="add-invoice-line">＋ Thêm sách</button><div class="field" style="margin-top:18px"><label>Ghi chú</label><input name="note"></div><div class="panel" style="margin-top:16px;padding:14px"><div class="total-line"><span>Tạm tính</span><strong id="invoice-subtotal">0 ₫</strong></div><div class="total-line promo-line" id="invoice-promo" hidden></div><div class="total-line promo-line" id="invoice-member" hidden></div><div class="total-line final"><span>Thanh toán</span><strong id="invoice-total">0 ₫</strong></div></div><div class="modal-actions"><button type="button" class="btn btn-light" id="cancel-form">Hủy</button><button class="btn btn-primary">Xác nhận thanh toán</button></div></form>`);
 const lines=$("#invoice-lines");
 const available=books.filter(b=>b.stock>0);
 const bookItems=available.map(b=>({value:b.id,code:b.code,price:b.price,stock:b.stock,label:`${b.code} · ${b.title}`,search:`${b.code} ${b.title} ${b.author||""}`,html:`<strong>${esc(b.code)}</strong> · ${esc(b.title)}<small>${esc(b.author||"")}${b.author?" · ":""}${money(b.price)} · còn ${b.stock}</small>`}));
 const customerItems=customers.map(c=>({value:c.id,code:c.code,label:`${c.code?c.code+" · ":""}${c.name}`,search:`${c.code||""} ${c.name} ${c.phone||""}`,html:`<strong>${esc(c.code||"")}</strong> · ${esc(c.name)}<small>${esc(c.phone||"Chưa có SĐT")}${c.tier?" · "+esc(c.tier):""}</small>`}));
 const walkIn={value:"",label:"Khách vãng lai",search:"khach vang lai",html:"Khách vãng lai"};
 const customerCombo=combo({items:[walkIn,...customerItems],emptyItem:walkIn,placeholder:"Khách vãng lai",onChange:()=>calc()});$("#customer-combo").appendChild(customerCombo);
 function addLine(focus){const row=document.createElement("div");row.className="item-line";row.innerHTML=`<span class="slot"></span><input class="invoice-qty" type="number" min="1" value="1" aria-label="Số lượng"><span class="line-price">${money(0)}</span><button type="button" class="close">×</button>`;
  const qty=row.querySelector(".invoice-qty");
  const upd=()=>{const it=row.combo.item;qty.max=it?it.stock:"";row.querySelector(".line-price").textContent=money((it?.price||0)*(Number(qty.value)||0));calc()};
  row.combo=combo({items:bookItems,placeholder:"Gõ mã hoặc tựa sách...",onChange:upd});row.querySelector(".slot").replaceWith(row.combo);
  row.querySelector("button").onclick=()=>{row.remove();calc()};qty.addEventListener("input",upd);lines.appendChild(row);calc();if(focus)row.combo.focusInput()}
 let promo=null,member=null,promoSeq=0,promoTimer=null;
 function renderTotals(){const sub=[...lines.querySelectorAll(".item-line")].reduce((s,r)=>s+Number(r.combo.item?.price||0)*Math.max(0,Number(r.querySelector(".invoice-qty").value)||0),0);const pa=Math.min(sub,promo?.amount||0);const ma=Math.min(sub-pa,member?.amount||0);$("#invoice-subtotal").textContent=money(sub);$("#invoice-total").textContent=money(sub-pa-ma);const mel=$("#invoice-member");if(member){mel.hidden=false;mel.innerHTML=`<span><span class="promo-badge tier-${tierKey(member.tier)}">${esc(member.tier)}</span> Ưu đãi thành viên ${member.rate}%<small class="promo-desc">${esc(member.description)}</small></span><strong class="promo-amount">−${money(ma)}</strong>`}else{mel.hidden=true;mel.innerHTML=""}const el=$("#invoice-promo");if(promo){el.hidden=false;el.innerHTML=`<span><span class="promo-badge">${esc(promo.code)}</span> ${esc(promo.name)}<small class="promo-desc">${esc(promo.description)}</small></span><strong class="promo-amount">−${money(pa)}</strong>`}else{el.hidden=true;el.innerHTML=""}}
 function calc(){renderTotals();clearTimeout(promoTimer);promoTimer=setTimeout(async()=>{const seq=++promoSeq;const items=[...lines.querySelectorAll(".item-line")].filter(r=>r.combo.item).map(r=>({book_id:Number(r.combo.value),quantity:Math.max(1,Number(r.querySelector(".invoice-qty").value)||1)}));try{const res=items.length?await api("/api/invoices/preview",{method:"POST",body:JSON.stringify({customer_id:customerCombo.value||null,items})}):{promotion:null,member:null};if(seq!==promoSeq)return;promo=res.promotion||null;member=res.member||null}catch{if(seq!==promoSeq)return;promo=null;member=null}renderTotals()},200)}
 addLine();$("#add-invoice-line").onclick=()=>addLine(true);$("#cancel-form").onclick=closeModal;
 $("#invoice-form").onsubmit=async e=>{e.preventDefault();const rows=[...lines.querySelectorAll(".item-line")];if(!rows.length||rows.some(r=>!r.combo.item)){toast("Vui lòng chọn sách cho tất cả các dòng (hoặc xóa dòng trống).");return}const items=rows.map(r=>({book_id:Number(r.combo.value),quantity:Number(r.querySelector(".invoice-qty").value)}));
 try{const invoice=await api("/api/invoices",{method:"POST",body:JSON.stringify({customer_id:customerCombo.value||null,payment_method:e.target.payment_method.value,note:e.target.note.value,items})});closeModal();toast("Tạo hóa đơn thành công: "+invoice.code);renderPage()}catch(err){toast(err.message)}};
}
async function invoiceDetail(id){
 try{const i=await api("/api/invoices/"+id);modal("Chi tiết hóa đơn "+i.code,`<div class="small-note">Khách hàng: <strong>${esc(i.customer_name)}</strong><br>Ngày tạo: ${new Date(i.created_at+"Z").toLocaleString("vi-VN")}<br>Phương thức: ${esc(i.payment_method)}</div>${i.kind==="exchange"?`<div class="small-note" style="margin-top:12px;padding:10px 12px;background:#fff8e8;border-radius:8px">Hóa đơn chênh lệch đổi hàng của hóa đơn <strong>${esc(i.ref_code||"")}</strong>.<br>${esc(i.note||"")}</div>`:`<div class="table-wrap" style="margin-top:15px"><table><thead><tr><th>SÁCH</th><th>SL</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${i.items.map(x=>`<tr><td>${esc(x.title)}</td><td>${x.quantity}</td><td>${money(x.unit_price)}</td><td>${money(x.quantity*x.unit_price)}</td></tr>`).join("")}</tbody></table></div>`}<div class="total-line"><span>Tạm tính</span><strong>${money(i.subtotal)}</strong></div>${i.promotion_code?`<div class="total-line promo-line"><span><span class="promo-badge">${esc(i.promotion_code)}</span> ${esc(i.promotion_name||"")}<small class="promo-desc">${esc(i.promotion_desc||"")}</small></span><strong class="promo-amount">−${money(i.promotion_amount)}</strong></div>`:""}${i.member_amount>0?`<div class="total-line promo-line"><span><span class="promo-badge tier-${tierKey(i.member_tier)}">${esc(i.member_tier)}</span> Ưu đãi thành viên ${i.member_rate}%<small class="promo-desc">Cộng dồn với khuyến mãi, tính sau khuyến mãi</small></span><strong class="promo-amount">−${money(i.member_amount)}</strong></div>`:""}${!i.promotion_code&&!(i.member_amount>0)?`<div class="total-line"><span>Giảm giá</span><strong>${money(i.discount)}</strong></div>`:(i.discount-(i.promotion_amount||0)-(i.member_amount||0)>0?`<div class="total-line"><span>Giảm giá khác</span><strong>${money(i.discount-(i.promotion_amount||0)-(i.member_amount||0))}</strong></div>`:"")}<div class="total-line final"><span>Tổng cộng</span><strong>${money(i.total)}</strong></div>${(i.returns||[]).length?`<div class="sub" style="margin:18px 0 6px"><strong>Lịch sử đổi / trả</strong></div>${i.returns.map(r=>`<div class="total-line" style="font-size:11px"><span><span class="pill ${r.type==="Trả hàng"?"danger":"warn"}">${esc(r.type)}</span> ${esc(r.book_title)}${r.new_title?" → "+esc(r.new_title):""} ×${r.quantity}<small class="promo-desc">${esc(r.code)} · ${new Date(r.created_at+"Z").toLocaleDateString("vi-VN")}</small></span><span>${returnEffect(r)}</span></div>`).join("")}`:""}${i.returnable?`<div class="small-note" style="margin-top:12px">Còn <strong>${i.days_left} ngày</strong> để đổi / trả hàng cho hóa đơn này.</div>`:""}<div class="modal-actions"><button class="btn btn-primary" id="detail-close">Đóng</button></div>`);$("#detail-close").onclick=closeModal}catch(e){toast(e.message)}
}
function invCodeCell(i){return `<strong>${esc(i.code)}</strong>${i.kind==="exchange"?` <span class="pill warn">Đổi hàng</span><div class="muted" style="font-size:10px">Chênh lệch của ${esc(i.ref_code||"")}</div>`:""}`}
function returnEffect(r){
 if(r.type==="Trả hàng")return `<strong class="neg">−${money(r.refund)}</strong>`;
 if(r.diff>0)return `<strong class="pos">+${money(r.diff)}</strong>`;
 if(r.diff<0)return `<strong class="neg">−${money(-r.diff)}</strong>`;
 return `<span class="muted">0 ₫</span>`;
}
function returnNote(r){
 if(r.type==="Trả hàng")return "Hoàn tiền · trừ vào doanh thu";
 if(r.diff>0)return `Khách trả thêm · hóa đơn ${esc(r.exchange_code||"")}`;
 if(r.diff<0)return "Hoàn chênh lệch · trừ vào doanh thu";
 return "Không chênh lệch";
}
async function returnsPage(){
 const [list,inv,books]=await Promise.all([api("/api/returns"),api("/api/invoices"),api("/api/books")]);invoicesCache=inv;booksCache=books;
 const days=inv[0]?.return_days||7,eligible=inv.filter(i=>i.returnable).length;
 const rows=list.map(r=>`<tr><td><strong>${esc(r.code)}</strong></td><td>${esc(r.invoice_code)}<div class="muted" style="font-size:10px">${esc(r.customer_name)}</div></td><td><span class="pill ${r.type==="Trả hàng"?"danger":"warn"}">${esc(r.type)}</span></td><td>${esc(r.book_title)}${r.new_title?`<div class="muted" style="font-size:10px">→ ${esc(r.new_title)}</div>`:""}</td><td>${r.quantity}</td><td>${returnEffect(r)}<div class="muted" style="font-size:10px">${returnNote(r)}</div></td><td>${new Date(r.created_at+"Z").toLocaleString("vi-VN")}</td></tr>`).join("");
 $("#content").innerHTML=sectionHead("Đổi / trả hàng",`Chỉ đổi / trả trong <strong>${days} ngày</strong> kể từ ngày lập hóa đơn (hóa đơn đã thanh toán).`,"new-return","Tạo yêu cầu đổi / trả")+`<div class="table-card"><div class="table-toolbar"><span class="hint">${list.length} giao dịch · ${eligible} hóa đơn còn trong hạn đổi / trả</span><span class="hint">Trả hàng: hoàn tiền trừ doanh thu · Đổi sách đắt hơn: lập hóa đơn thu thêm · Đổi sách rẻ hơn: hoàn chênh lệch</span></div><div class="table-wrap"><table><thead><tr><th>MÃ GIAO DỊCH</th><th>HÓA ĐƠN</th><th>LOẠI</th><th>SÁCH</th><th>SL</th><th>TIỀN</th><th>THỜI GIAN</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Chưa có giao dịch đổi / trả</td></tr>'}</tbody></table></div></div>`;
 $("#new-return").onclick=()=>returnModal(inv,books);
}
function returnModal(inv,books){
 const eligible=inv.filter(i=>i.returnable),days=inv[0]?.return_days||7;
 if(!eligible.length){toast(`Không có hóa đơn nào còn trong hạn ${days} ngày để đổi / trả.`);return}
 modal("Ghi nhận đổi / trả hàng",`<form id="return-form"><div class="field"><label>Hóa đơn * <span class="muted" style="font-weight:400">(đã thanh toán, trong ${days} ngày)</span></label><div id="ret-inv"></div></div>
 <div class="form-grid" style="margin-top:14px"><div class="field"><label>Hình thức *</label><select name="type"><option>Trả hàng</option><option>Đổi hàng</option></select></div><div class="field"><label>Số lượng *</label><input name="quantity" type="number" min="1" value="1" required></div>
 <div class="field full" style="grid-column:1/-1"><label>Sách trong hóa đơn *</label><select name="book_id" id="ret-book" required><option value="">— Chọn hóa đơn trước —</option></select></div>
 <div class="field" id="ret-new-wrap" style="grid-column:1/-1" hidden><label>Đổi sang sách *</label><div id="ret-new"></div></div>
 <div class="field" style="grid-column:1/-1"><label>Lý do</label><textarea name="reason"></textarea></div></div>
 <div class="panel" id="ret-summary" style="margin-top:14px;padding:14px"><span class="muted">Chọn hóa đơn và sách để xem số tiền.</span></div>
 <div id="ret-pay" hidden style="margin-top:14px;padding:14px;border:1px solid #f4dca8;background:#fff8e8;border-radius:10px"><div class="form-grid"><div class="field"><label>Phương thức thanh toán phần chênh lệch</label><select name="payment_method"><option>Tiền mặt</option><option>Chuyển khoản</option><option>Thẻ ngân hàng</option></select></div><label style="display:flex;gap:8px;align-items:flex-end;font-size:11px;font-weight:600"><input type="checkbox" id="ret-paid" style="width:auto"> <span id="ret-paid-label">Đã thu đủ tiền chênh lệch</span></label></div></div>
 <div class="modal-actions"><button type="button" class="btn btn-light" id="cancel-form">Hủy</button><button class="btn btn-primary" id="ret-submit">Lưu giao dịch</button></div></form>`);
 const form=$("#return-form");let cur=null,ratio=1,remaining={};
 const invCombo=combo({items:eligible.map(i=>({value:i.id,code:i.code,label:`${i.code} · ${i.customer_name}`,search:`${i.code} ${i.customer_name}`,html:`<strong>${esc(i.code)}</strong> · ${esc(i.customer_name)}<small>${money(i.total)} · còn ${i.days_left} ngày đổi / trả</small>`})),placeholder:"Gõ mã hóa đơn hoặc tên khách...",onChange:loadInvoice});$("#ret-inv").appendChild(invCombo);
 const newItems=books.filter(b=>b.stock>0).map(b=>({value:b.id,code:b.code,price:b.price,stock:b.stock,label:`${b.code} · ${b.title}`,search:`${b.code} ${b.title} ${b.author||""}`,html:`<strong>${esc(b.code)}</strong> · ${esc(b.title)}<small>${money(b.price)} · còn ${b.stock}</small>`}));
 const newCombo=combo({items:newItems,placeholder:"Gõ mã hoặc tựa sách mới...",onChange:()=>update()});$("#ret-new").appendChild(newCombo);
 async function loadInvoice(item){
  cur=null;remaining={};$("#ret-book").innerHTML='<option value="">— Chọn hóa đơn trước —</option>';
  if(item){try{cur=await api("/api/invoices/"+item.value)}catch(e){toast(e.message);return}
   ratio=cur.subtotal>0?cur.total/cur.subtotal:1;
   for(const x of cur.items)remaining[x.book_id]=(remaining[x.book_id]||0)+x.quantity;
   for(const r of cur.returns||[])remaining[r.book_id]=(remaining[r.book_id]||0)-r.quantity;
   const opts=cur.items.filter((x,idx,a)=>a.findIndex(y=>y.book_id===x.book_id)===idx&&remaining[x.book_id]>0);
   $("#ret-book").innerHTML=opts.length?opts.map(x=>`<option value="${x.book_id}">${esc(x.title)} — còn ${remaining[x.book_id]} cuốn có thể đổi / trả (${money(x.unit_price)})</option>`).join(""):'<option value="">Hóa đơn này đã đổi / trả hết</option>'}
  update();
 }
 function calc(){
  if(!cur||!form.book_id.value)return null;
  const it=cur.items.find(x=>x.book_id===Number(form.book_id.value)),qty=Math.max(0,Math.floor(Number(form.quantity.value))||0),isEx=form.type.value==="Đổi hàng";
  const returnValue=Math.round(it.unit_price*qty*ratio),nb=newCombo.item,newValue=isEx&&nb?nb.price*qty:0;
  return {it,qty,isEx,returnValue,nb,newValue,diff:isEx&&nb?newValue-returnValue:0,max:remaining[it.book_id]};
 }
 function update(){
  const c=calc(),isEx=form.type.value==="Đổi hàng";$("#ret-new-wrap").hidden=!isEx;
  const sum=$("#ret-summary"),pay=$("#ret-pay");pay.hidden=true;
  if(!c){sum.innerHTML='<span class="muted">Chọn hóa đơn và sách để xem số tiền.</span>';return}
  form.quantity.max=c.max;
  const row=(l,v,cls="")=>`<div class="total-line"><span>${l}</span><strong class="${cls}">${v}</strong></div>`;
  let html=row(`Giá trị sách trả <small class="muted">(giá thực trả, đã trừ giảm giá)</small>`,money(c.returnValue));
  if(!c.isEx){html+=row("Hoàn tiền cho khách",money(c.returnValue),"neg")+'<div class="small-note">Số tiền hoàn được <strong>trừ vào doanh thu</strong> và sách được cộng lại kho.</div>'}
  else if(!c.nb){html+='<div class="small-note">Chọn sách muốn đổi sang để tính chênh lệch.</div>'}
  else{
   html+=row("Giá trị sách mới",money(c.newValue));
   if(c.nb.id===c.it.book_id)html+='<div class="small-note neg">Hãy chọn sách khác với sách đang đổi.</div>';
   else if(c.diff>0){html+=row("Khách cần thanh toán thêm",money(c.diff),"pos")+`<div class="small-note">Hệ thống sẽ tạo <strong>hóa đơn đổi hàng</strong> cho phần chênh lệch (tính vào doanh thu).</div>`;pay.hidden=false;$("#ret-paid-label").textContent=`Đã thu đủ ${money(c.diff)} từ khách`}
   else if(c.diff<0)html+=row("Hoàn lại chênh lệch cho khách",money(-c.diff),"neg")+'<div class="small-note">Ghi nhận đổi hàng và số tiền chênh lệch; khoản này <strong>trừ vào doanh thu</strong>.</div>';
   else html+='<div class="small-note">Hai sách cùng giá trị, không phát sinh chênh lệch.</div>';
  }
  sum.innerHTML=html;
 }
 form.type.onchange=update;form.book_id.onchange=update;form.quantity.addEventListener("input",update);$("#cancel-form").onclick=closeModal;
 form.onsubmit=async e=>{e.preventDefault();const c=calc();
  if(!c){toast("Vui lòng chọn hóa đơn và sách.");return}
  if(c.qty<1||c.qty>c.max){toast(`Số lượng phải từ 1 đến ${c.max}.`);return}
  if(c.isEx&&!c.nb){toast("Vui lòng chọn sách muốn đổi sang.");return}
  if(c.diff>0&&!$("#ret-paid").checked){toast("Hãy xác nhận đã thu tiền chênh lệch của khách.");return}
  try{const r=await api("/api/returns",{method:"POST",body:JSON.stringify({invoice_id:cur.id,book_id:Number(form.book_id.value),quantity:c.qty,type:form.type.value,reason:form.reason.value,new_book_id:c.isEx?c.nb.value:null,payment_method:form.payment_method.value})});
   closeModal();toast(r.type==="Trả hàng"?`Đã ghi nhận trả hàng, hoàn ${money(r.refund)}.`:r.diff>0?`Đã đổi hàng. Hóa đơn đổi ${r.exchange_code} thu thêm ${money(r.diff)}.`:r.diff<0?`Đã đổi hàng. Hoàn lại chênh lệch ${money(-r.diff)}.`:"Đã ghi nhận đổi hàng.");renderPage()}catch(err){toast(err.message)}};
}
function localDateValue(date){
  const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}
async function reportsPage(){
  const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1);
  $("#content").innerHTML=`${sectionHead("Báo cáo & thống kê","Doanh thu, sách bán chạy và tình hình tồn kho.")}<div class="panel"><div class="report-filters"><div class="field"><label>Từ ngày</label><input type="date" id="report-from" value="${localDateValue(start)}"></div><div class="field"><label>Đến ngày</label><input type="date" id="report-to" value="${localDateValue(now)}"></div><button class="btn btn-primary" id="run-report">Tạo báo cáo</button></div><div id="report-output"><div class="loading">Đang tải báo cáo...</div></div></div>`;
  $("#run-report").onclick=loadReport;await loadReport();
}
async function loadReport(){
  const from=$("#report-from").value,to=$("#report-to").value;
  if(from>to){toast("Ngày bắt đầu không được sau ngày kết thúc.");return}
  try{
    const r=await api(`/api/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const statusCount=status=>Number((r.statusCounts||[]).find(x=>x.payment_status===status)?.count||0);
    $("#report-output").innerHTML=`
      <div class="stats" style="margin-top:10px">
        ${stat("Doanh thu thuần",money(r.sales.revenue),"Bán hàng − hoàn trả ± đổi hàng","₫")}
        ${stat("Số hóa đơn",number(r.sales.invoices),"Đã thanh toán thành công","▧")}
        ${stat("Tổng giảm giá",money(r.sales.discounts),"Trên hóa đơn đã thanh toán","％")}
        ${stat("Mặt hàng tồn kho",number(r.stock.length),"Đầu sách đang hoạt động","▤")}
      </div>
      <div class="table-card" style="margin-top:14px">
        <div class="table-toolbar"><strong>Đối chiếu trạng thái hóa đơn</strong><span class="hint">${esc(from)} đến ${esc(to)}</span></div>
        <div class="stats">
          ${stat("Đã thanh toán",number(statusCount("Đã thanh toán")),"Được tính vào doanh thu","✓")}
          ${stat("Chưa thanh toán",number(statusCount("Chưa thanh toán")),"Không tính vào doanh thu","…")}
          ${stat("Hủy thanh toán",number(statusCount("Hủy thanh toán")),"Không tính vào doanh thu","×")}
        </div>
      </div>
      <div class="table-card" style="margin-top:14px">
        <div class="table-toolbar"><strong>Cách tính doanh thu thuần</strong><span class="hint">${esc(from)} đến ${esc(to)}</span></div>
        <div style="padding:6px 18px 14px">
          <div class="total-line"><span>Doanh thu bán hàng (hóa đơn đã thanh toán)</span><strong>${money(r.sales.gross_revenue)}</strong></div>
          <div class="total-line"><span>＋ Thu thêm từ đổi sách đắt hơn (hóa đơn đổi hàng)</span><strong class="pos">${money(r.returnStats.exchange_collected)}</strong></div>
          <div class="total-line"><span>－ Hoàn tiền trả hàng</span><strong class="neg">${money(r.returnStats.return_refunds)}</strong></div>
          <div class="total-line"><span>－ Hoàn chênh lệch khi đổi sách rẻ hơn</span><strong class="neg">${money(r.returnStats.exchange_refunded)}</strong></div>
          <div class="total-line final"><span>Doanh thu thuần</span><strong>${money(r.sales.revenue)}</strong></div>
        </div>
      </div>
      <div class="table-card" style="margin-top:18px">
        <div class="table-toolbar"><strong>Thống kê đổi / trả hàng</strong><span class="hint">Đổi / trả trong ${"7"} ngày kể từ ngày lập hóa đơn</span></div>
        <div class="stats">
          ${stat("Lượt trả hàng",number(r.returnStats.return_count),"Hoàn "+money(r.returnStats.return_refunds),"↩")}
          ${stat("Lượt đổi hàng",number(r.returnStats.exchange_count),"Thu thêm "+money(r.returnStats.exchange_collected)+" · hoàn "+money(r.returnStats.exchange_refunded),"⇄")}
          ${stat("Tỷ lệ đổi / trả",(r.returnStats.rate*100).toFixed(1).replace(".",",")+"%",number(r.returnStats.quantity)+" / "+number(r.returnStats.sold_quantity)+" cuốn đã bán","％")}
          ${stat("Ảnh hưởng doanh thu",(r.returnStats.net_effect>0?"+":r.returnStats.net_effect<0?"−":"")+money(Math.abs(r.returnStats.net_effect)),"Đổi / trả tính vào doanh thu thuần","₫")}
        </div>
        <div class="grid-2" style="padding:0 18px 18px">
          <div class="table-card" style="box-shadow:none">
            <div class="table-toolbar"><strong>Sách bị đổi / trả nhiều nhất</strong></div>
            <div class="table-wrap"><table><thead><tr><th>SÁCH</th><th>SỐ CUỐN</th><th>SỐ LẦN</th><th>HOÀN TIỀN</th></tr></thead><tbody>${r.topReturned.map(x=>`<tr><td>${esc(x.code)} · ${esc(x.title)}</td><td>${number(x.quantity)}</td><td>${x.times}</td><td>${money(x.refund)}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">Chưa có đổi / trả trong khoảng thời gian này</td></tr>'}</tbody></table></div>
          </div>
          <div class="table-card" style="box-shadow:none">
            <div class="table-toolbar"><strong>Giao dịch đổi / trả gần đây</strong></div>
            <div class="table-wrap"><table><thead><tr><th>MÃ</th><th>LOẠI</th><th>SÁCH</th><th>TIỀN</th></tr></thead><tbody>${r.recentReturns.map(x=>`<tr><td>${esc(x.code)}<div class="muted" style="font-size:10px">${esc(x.invoice_code)}</div></td><td><span class="pill ${x.type==="Trả hàng"?"danger":"warn"}">${esc(x.type)}</span></td><td>${esc(x.book_title)}${x.new_title?`<div class="muted" style="font-size:10px">→ ${esc(x.new_title)}</div>`:""}</td><td>${returnEffect(x)}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">Chưa có giao dịch</td></tr>'}</tbody></table></div>
          </div>
        </div>
      </div>
      <div class="grid-2" style="margin-top:18px">
        <div class="table-card">
          <div class="table-toolbar"><strong>Sách bán chạy</strong><span class="hint">Chỉ tính hóa đơn đã thanh toán</span></div>
          <div class="table-wrap"><table><thead><tr><th>MÃ SÁCH</th><th>TÊN SÁCH</th><th>SỐ LƯỢNG ĐÃ BÁN</th><th>TỔNG DOANH THU</th></tr></thead>
          <tbody>${r.top.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.title)}</td><td>${number(x.quantity)}</td><td>${money(x.revenue)}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">Chưa có sách được bán trong các hóa đơn đã thanh toán ở khoảng thời gian này</td></tr>'}</tbody></table></div>
        </div>
        <div class="table-card">
          <div class="table-toolbar"><strong>Cảnh báo tồn kho</strong></div>
          <div class="table-wrap"><table><thead><tr><th>SÁCH</th><th>TỒN</th><th>TỐI THIỂU</th></tr></thead><tbody>${r.stock.filter(x=>x.stock<=x.min_stock).map(x=>`<tr><td>${esc(x.title)}</td><td><span class="pill danger">${x.stock}</span></td><td>${x.min_stock}</td></tr>`).join("")||'<tr><td colspan="3" class="empty">Không có sách dưới mức tồn tối thiểu</td></tr>'}</tbody></table></div>
        </div>
      </div>
      <div class="table-card" style="margin-top:18px"><div class="table-toolbar"><strong>Báo cáo tồn kho</strong></div><div class="table-wrap"><table><thead><tr><th>MÃ SÁCH</th><th>TÊN SÁCH</th><th>TỒN KHO</th><th>GIÁ TRỊ TỒN (GIÁ NHẬP)</th></tr></thead><tbody>${r.stock.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.title)}</td><td>${x.stock}</td><td>${money(x.stock_value)}</td></tr>`).join("")}</tbody></table></div></div>`;
  }catch(e){toast(e.message)}
}
buildRoleSwitch();setPage(ROLES[role].home);