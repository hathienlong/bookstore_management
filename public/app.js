const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0}).format(Number(n)||0);
const number = n => new Intl.NumberFormat("vi-VN").format(Number(n)||0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = new Date();
$("#today").textContent = today.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"});
let page = "dashboard", booksCache=[], customersCache=[], suppliersCache=[], invoicesCache=[], currentQuery="";
const titles={dashboard:"Tổng quan",books:"Quản lý sách",customers:"Khách hàng",suppliers:"Nhà cung cấp",purchases:"Nhập hàng",invoices:"Bán hàng / Hóa đơn",returns:"Đổi / trả hàng",reports:"Báo cáo & thống kê"};
async function api(url, options={}) {
  const res=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Có lỗi xảy ra.");
  return data;
}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),3000)}
function setPage(p){page=p;currentQuery="";document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===p));$("#page-title").textContent=titles[p];renderPage()}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.page)));
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
 return `${sectionHead(titles[page],"Quản lý và cập nhật dữ liệu nghiệp vụ.",addId,addLabel)}
 <div class="table-card"><div class="table-toolbar"><input class="search" id="table-search" placeholder="${searchPlaceholder}" value="${esc(currentQuery)}"><span class="hint">${rows.length} bản ghi</span></div>
 <div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows||""}</tbody></table></div></div>`;
}
function actions(type,id){return `<div class="actions"><button class="btn btn-light btn-small" data-edit="${type}:${id}">Sửa</button><button class="btn btn-danger btn-small" data-delete="${type}:${id}">Xóa</button></div>`}
function bindTableSearch(fn){const s=$("#table-search");if(s)s.addEventListener("input",e=>{currentQuery=e.target.value;clearTimeout(bindTableSearch.timer);bindTableSearch.timer=setTimeout(fn,200)})}
function bindActions(){document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const [t,id]=b.dataset.edit.split(":");editRecord(t,id)});document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{const [t,id]=b.dataset.delete.split(":");deleteRecord(t,id)})}
async function booksPage(){
 booksCache=await api("/api/books?q="+encodeURIComponent(currentQuery));
 const rows=booksCache.map(b=>`<tr><td><strong>${esc(b.code)}</strong></td><td><div class="book-cell"><div class="book-cover">B</div><div><div class="book-name">${esc(b.title)}</div><div class="muted">${esc(b.author)}</div></div></div></td><td>${esc(b.genre||"—")}</td><td>${money(b.price)}</td><td>${number(b.stock)}</td><td>${b.stock<=b.min_stock?'<span class="pill danger">Sắp hết / hết</span>':'<span class="pill">Đủ hàng</span>'}</td><td>${actions("book",b.id)}</td></tr>`).join("");
 $("#content").innerHTML=tableLayout("Tìm theo tên, mã sách, tác giả...","add-record","Thêm sách",["MÃ SÁCH","THÔNG TIN SÁCH","THỂ LOẠI","GIÁ BÁN","TỒN KHO","TRẠNG THÁI","THAO TÁC"],rows);
 $("#add-record").onclick=()=>recordModal("book");bindTableSearch(booksPage);bindActions();
}
async function customersPage(){
 customersCache=await api("/api/customers?q="+encodeURIComponent(currentQuery));
 const rows=customersCache.map(c=>`<tr><td><strong>${esc(c.code)}</strong></td><td><strong>${esc(c.name)}</strong><div class="muted">${esc(c.email)}</div></td><td>${esc(c.phone||"—")}</td><td>${esc(c.address||"—")}</td><td>${number(c.points)}</td><td><span class="pill">${esc(c.tier)}</span></td><td>${actions("customer",c.id)}</td></tr>`).join("");
 $("#content").innerHTML=tableLayout("Tìm tên, mã hoặc số điện thoại...","add-record","Thêm khách hàng",["MÃ KH","KHÁCH HÀNG","SỐ ĐIỆN THOẠI","ĐỊA CHỈ","ĐIỂM","HẠNG","THAO TÁC"],rows);
 $("#add-record").onclick=()=>recordModal("customer");bindTableSearch(customersPage);bindActions();
}
async function suppliersPage(){
 suppliersCache=await api("/api/suppliers?q="+encodeURIComponent(currentQuery));
 const rows=suppliersCache.map(s=>`<tr><td><strong>${esc(s.code)}</strong></td><td><strong>${esc(s.name)}</strong><div class="muted">${esc(s.email)}</div></td><td>${esc(s.phone||"—")}</td><td>${esc(s.address||"—")}</td><td>${s.active?'<span class="pill">Đang hoạt động</span>':'<span class="pill warn">Ngừng hoạt động</span>'}</td><td>${actions("supplier",s.id)}</td></tr>`).join("");
 $("#content").innerHTML=tableLayout("Tìm nhà cung cấp, mã, số điện thoại...","add-record","Thêm nhà cung cấp",["MÃ NCC","NHÀ CUNG CẤP","ĐIỆN THOẠI","ĐỊA CHỈ","TRẠNG THÁI","THAO TÁC"],rows);
 $("#add-record").onclick=()=>recordModal("supplier");bindTableSearch(suppliersPage);bindActions();
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
 customer:{title:"khách hàng",endpoint:"customers",fields:c=>field("Mã khách hàng","code",c?.code||"","text",true)+field("Họ và tên","name",c?.name||"","text",true)+field("Số điện thoại","phone",c?.phone||"")+field("Email","email",c?.email||"","email")+field("Địa chỉ","address",c?.address||"")+field("Điểm tích lũy","points",c?.points??0,"number")+`<div class="field"><label>Hạng thành viên</label><select name="tier">${["Thường","Bạc","Vàng","Kim cương"].map(x=>`<option ${x===(c?.tier||"Thường")?"selected":""}>${x}</option>`).join("")}</select></div>`},
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
async function invoicesPage(){
 const inv=await api("/api/invoices");invoicesCache=inv;
 const rows=inv.map(i=>`<tr><td><strong>${esc(i.code)}</strong></td><td>${esc(i.customer_name)}</td><td>${money(i.total)}</td><td>${esc(i.payment_method)}</td><td>${new Date(i.created_at+"Z").toLocaleString("vi-VN")}</td><td><span class="pill">${esc(i.payment_status)}</span></td><td><button class="btn btn-light btn-small" data-invoice="${i.id}">Chi tiết</button></td></tr>`).join("");
 $("#content").innerHTML=sectionHead("Bán hàng / Hóa đơn","Tạo hóa đơn, áp dụng giảm giá và ghi nhận thanh toán.","new-invoice","Tạo hóa đơn")+`<div class="table-card"><div class="table-toolbar"><span class="hint">${inv.length} hóa đơn</span><span class="hint">Hóa đơn mới được thanh toán theo phương thức đã chọn</span></div><div class="table-wrap"><table><thead><tr><th>MÃ HÓA ĐƠN</th><th>KHÁCH HÀNG</th><th>TỔNG TIỀN</th><th>THANH TOÁN</th><th>THỜI GIAN</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Chưa có hóa đơn</td></tr>'}</tbody></table></div></div>`;
 $("#new-invoice").onclick=invoiceModal;
 document.querySelectorAll("[data-invoice]").forEach(b=>b.onclick=()=>invoiceDetail(b.dataset.invoice));
}
async function invoiceModal(){
 const [books,customers]=await Promise.all([api("/api/books"),api("/api/customers")]);booksCache=books;customersCache=customers;
 if(!books.some(b=>b.stock>0)){toast("Không có sách còn hàng để bán.");return}
 modal("Tạo hóa đơn bán hàng",`<form id="invoice-form"><div class="form-grid"><div class="field"><label>Khách hàng</label><select name="customer_id"><option value="">Khách vãng lai</option>${customers.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(c.phone)}</option>`).join("")}</select></div><div class="field"><label>Phương thức thanh toán</label><select name="payment_method"><option>Tiền mặt</option><option>Chuyển khoản</option><option>Thẻ ngân hàng</option></select></div></div><div class="field" style="margin-top:18px"><label>Danh sách sách</label></div><div id="invoice-lines"></div><button type="button" class="btn btn-light" id="add-invoice-line">＋ Thêm sách</button><div class="form-grid" style="margin-top:18px"><div class="field"><label>Giảm giá (VNĐ)</label><input name="discount" type="number" min="0" value="0"></div><div class="field"><label>Ghi chú</label><input name="note"></div></div><div class="panel" style="margin-top:16px;padding:14px"><div class="total-line"><span>Tạm tính</span><strong id="invoice-subtotal">0 ₫</strong></div><div class="total-line"><span>Giảm giá</span><strong id="invoice-discount">0 ₫</strong></div><div class="total-line final"><span>Thanh toán</span><strong id="invoice-total">0 ₫</strong></div></div><div class="modal-actions"><button type="button" class="btn btn-light" id="cancel-form">Hủy</button><button class="btn btn-primary">Xác nhận thanh toán</button></div></form>`);
 const lines=$("#invoice-lines");
 function addLine(){const available=books.filter(b=>b.stock>0);const row=document.createElement("div");row.className="item-line";row.innerHTML=`<select class="invoice-book">${available.map(b=>`<option value="${b.id}" data-price="${b.price}" data-stock="${b.stock}">${esc(b.code)} · ${esc(b.title)} (còn ${b.stock})</option>`).join("")}</select><input class="invoice-qty" type="number" min="1" value="1" aria-label="Số lượng"><span class="line-price">${money(available[0]?.price||0)}</span><button type="button" class="close">×</button>`;row.querySelector("button").onclick=()=>{row.remove();calc()};row.querySelectorAll("select,input").forEach(el=>el.addEventListener("input",()=>{row.querySelector(".line-price").textContent=money(Number(row.querySelector(".invoice-book").selectedOptions[0]?.dataset.price)*Number(row.querySelector(".invoice-qty").value));calc()}));lines.appendChild(row);calc()}
 function calc(){const sub=[...lines.querySelectorAll(".item-line")].reduce((s,r)=>s+Number(r.querySelector(".invoice-book").selectedOptions[0]?.dataset.price||0)*Math.max(0,Number(r.querySelector(".invoice-qty").value)||0),0);const disc=Math.min(sub,Math.max(0,Number($("#invoice-form")?.discount?.value)||0));$("#invoice-subtotal").textContent=money(sub);$("#invoice-discount").textContent=money(disc);$("#invoice-total").textContent=money(sub-disc)}
 addLine();$("#add-invoice-line").onclick=addLine;$("#cancel-form").onclick=closeModal;$("#invoice-form").discount.addEventListener("input",calc);
 $("#invoice-form").onsubmit=async e=>{e.preventDefault();const items=[...lines.querySelectorAll(".item-line")].map(r=>({book_id:Number(r.querySelector(".invoice-book").value),quantity:Number(r.querySelector(".invoice-qty").value)}));
 try{const invoice=await api("/api/invoices",{method:"POST",body:JSON.stringify({customer_id:e.target.customer_id.value||null,payment_method:e.target.payment_method.value,discount:Number(e.target.discount.value)||0,note:e.target.note.value,items})});closeModal();toast("Tạo hóa đơn thành công: "+invoice.code);renderPage()}catch(err){toast(err.message)}};
}
async function invoiceDetail(id){
 try{const i=await api("/api/invoices/"+id);modal("Chi tiết hóa đơn "+i.code,`<div class="small-note">Khách hàng: <strong>${esc(i.customer_name)}</strong><br>Ngày tạo: ${new Date(i.created_at+"Z").toLocaleString("vi-VN")}<br>Phương thức: ${esc(i.payment_method)}</div><div class="table-wrap" style="margin-top:15px"><table><thead><tr><th>SÁCH</th><th>SL</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>${i.items.map(x=>`<tr><td>${esc(x.title)}</td><td>${x.quantity}</td><td>${money(x.unit_price)}</td><td>${money(x.quantity*x.unit_price)}</td></tr>`).join("")}</tbody></table></div><div class="total-line"><span>Tạm tính</span><strong>${money(i.subtotal)}</strong></div><div class="total-line"><span>Giảm giá</span><strong>${money(i.discount)}</strong></div><div class="total-line final"><span>Tổng cộng</span><strong>${money(i.total)}</strong></div><div class="modal-actions"><button class="btn btn-primary" id="detail-close">Đóng</button></div>`);$("#detail-close").onclick=closeModal}catch(e){toast(e.message)}
}
async function returnsPage(){
 const [inv,books]=await Promise.all([api("/api/invoices"),api("/api/books")]);invoicesCache=inv;booksCache=books;
 const rows=[];
 for(const i of inv){const detail=await api("/api/invoices/"+i.id);for(const r of detail.returns||[])rows.push(`<tr><td>${esc(r.code)}</td><td>${esc(i.code)}</td><td>${esc(r.title)}</td><td>${r.quantity}</td><td>${esc(r.type)}</td><td>${money(r.refund)}</td><td>${new Date(r.created_at+"Z").toLocaleString("vi-VN")}</td></tr>`)}
 $("#content").innerHTML=sectionHead("Đổi / trả hàng","Ghi nhận yêu cầu đổi hoặc trả sách theo hóa đơn đã lập.","new-return","Tạo yêu cầu đổi / trả")+`<div class="table-card"><div class="table-toolbar"><span class="hint">${rows.length} giao dịch đổi / trả</span><span class="hint">Trả hàng sẽ cộng lại kho theo bản demo</span></div><div class="table-wrap"><table><thead><tr><th>MÃ GIAO DỊCH</th><th>HÓA ĐƠN</th><th>SÁCH</th><th>SỐ LƯỢNG</th><th>LOẠI</th><th>HOÀN TIỀN</th><th>THỜI GIAN</th></tr></thead><tbody>${rows.join("")||'<tr><td colspan="7" class="empty">Chưa có giao dịch đổi / trả</td></tr>'}</tbody></table></div></div>`;
 $("#new-return").onclick=()=>returnModal(inv,books);
}
function returnModal(inv,books){
 if(!inv.length){toast("Cần có hóa đơn trước khi tạo yêu cầu đổi / trả.");return}
 modal("Ghi nhận đổi / trả hàng",`<form id="return-form"><div class="form-grid"><div class="field"><label>Hóa đơn *</label><select name="invoice_id" id="return-invoice" required>${inv.map(i=>`<option value="${i.id}">${esc(i.code)} — ${esc(i.customer_name)}</option>`).join("")}</select></div><div class="field"><label>Hình thức *</label><select name="type"><option>Trả hàng</option><option>Đổi hàng</option></select></div><div class="field"><label>Sách *</label><select name="book_id" id="return-book" required></select></div><div class="field"><label>Số lượng *</label><input name="quantity" type="number" min="1" value="1" required></div><div class="field full"><label>Lý do</label><textarea name="reason"></textarea></div></div><p class="small-note">Bản demo ghi nhận đổi hàng nhưng chưa quản lý việc chọn sách thay thế. Hoàn tiền được tính theo đơn giá trong hóa đơn.</p><div class="modal-actions"><button type="button" class="btn btn-light" id="cancel-form">Hủy</button><button class="btn btn-primary">Lưu giao dịch</button></div></form>`);
 const form=$("#return-form");
 async function loadBooks(){const i=await api("/api/invoices/"+form.invoice_id.value);$("#return-book").innerHTML=i.items.map(x=>`<option value="${x.book_id}">${esc(x.title)} — đã mua ${x.quantity}</option>`).join("")}
 $("#return-invoice").onchange=loadBooks;loadBooks();$("#cancel-form").onclick=closeModal;
 form.onsubmit=async e=>{e.preventDefault();try{await api("/api/returns",{method:"POST",body:JSON.stringify(readForm(form))});closeModal();toast("Đã lưu giao dịch đổi / trả.");renderPage()}catch(err){toast(err.message)}};
}
async function reportsPage(){
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1);
 $("#content").innerHTML=`${sectionHead("Báo cáo & thống kê","Doanh thu, sách bán chạy và tình hình tồn kho.")}<div class="panel"><div class="report-filters"><div class="field"><label>Từ ngày</label><input type="date" id="report-from" value="${start.toISOString().slice(0,10)}"></div><div class="field"><label>Đến ngày</label><input type="date" id="report-to" value="${now.toISOString().slice(0,10)}"></div><button class="btn btn-primary" id="run-report">Tạo báo cáo</button></div><div id="report-output"><div class="loading">Chọn điều kiện rồi tạo báo cáo.</div></div></div>`;
 $("#run-report").onclick=loadReport;await loadReport();
}
async function loadReport(){
 const from=$("#report-from").value,to=$("#report-to").value;if(from>to){toast("Ngày bắt đầu không được sau ngày kết thúc.");return}
 try{const r=await api(`/api/reports/summary?from=${from}&to=${to}`);
 $("#report-output").innerHTML=`<div class="stats" style="margin-top:10px">${stat("Doanh thu",money(r.sales.revenue),"Trong khoảng thời gian chọn","₫")}${stat("Số hóa đơn",number(r.sales.invoices),"Đã thanh toán","▧")}${stat("Tổng giảm giá",money(r.sales.discounts),"Trên hóa đơn","％")}${stat("Mặt hàng tồn kho",number(r.stock.length),"Đầu sách đang hoạt động","▤")}</div><div class="grid-2"><div class="table-card"><div class="table-toolbar"><strong>Sách bán chạy</strong></div><div class="table-wrap"><table><thead><tr><th>SÁCH</th><th>SỐ LƯỢNG</th><th>DOANH THU</th></tr></thead><tbody>${r.top.map(x=>`<tr><td>${esc(x.title)}</td><td>${x.quantity}</td><td>${money(x.revenue)}</td></tr>`).join("")||'<tr><td colspan="3" class="empty">Chưa có dữ liệu bán hàng</td></tr>'}</tbody></table></div></div><div class="table-card"><div class="table-toolbar"><strong>Cảnh báo tồn kho</strong></div><div class="table-wrap"><table><thead><tr><th>SÁCH</th><th>TỒN</th><th>TỐI THIỂU</th></tr></thead><tbody>${r.stock.filter(x=>x.stock<=x.min_stock).map(x=>`<tr><td>${esc(x.title)}</td><td><span class="pill danger">${x.stock}</span></td><td>${x.min_stock}</td></tr>`).join("")||'<tr><td colspan="3" class="empty">Không có sách dưới mức tồn tối thiểu</td></tr>'}</tbody></table></div></div></div><div class="table-card" style="margin-top:18px"><div class="table-toolbar"><strong>Báo cáo tồn kho</strong></div><div class="table-wrap"><table><thead><tr><th>MÃ SÁCH</th><th>TÊN SÁCH</th><th>TỒN KHO</th><th>GIÁ TRỊ TỒN (GIÁ NHẬP)</th></tr></thead><tbody>${r.stock.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.title)}</td><td>${x.stock}</td><td>${money(x.stock_value)}</td></tr>`).join("")}</tbody></table></div></div>`;
 }catch(e){toast(e.message)}
}
renderPage();
