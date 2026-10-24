const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new sqlite3.Database(path.join(dataDir, "bookstore.db"));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const run = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes }); })
);
const get = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
);
const all = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
);

async function initDb() {
  const schema = [
    `CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '', genre TEXT NOT NULL DEFAULT '', publisher TEXT DEFAULT '',
      publish_year INTEGER, price REAL NOT NULL DEFAULT 0, cost_price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0, min_stock INTEGER NOT NULL DEFAULT 5,
      description TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      phone TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '', points INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL DEFAULT 'Thường', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      phone TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, supplier_id INTEGER,
      total REAL NOT NULL DEFAULT 0, note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL, unit_cost REAL NOT NULL, FOREIGN KEY(receipt_id) REFERENCES purchase_receipts(id),
      FOREIGN KEY(book_id) REFERENCES books(id)
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, customer_id INTEGER,
      subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'Tiền mặt', payment_status TEXT NOT NULL DEFAULT 'Đã thanh toán',
      note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )`,
    `CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL, unit_price REAL NOT NULL, FOREIGN KEY(invoice_id) REFERENCES invoices(id),
      FOREIGN KEY(book_id) REFERENCES books(id)
    )`,
    `CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, invoice_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL, quantity INTEGER NOT NULL, type TEXT NOT NULL, refund REAL NOT NULL DEFAULT 0,
      reason TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id), FOREIGN KEY(book_id) REFERENCES books(id)
    )`
  ];
  for (const sql of schema) await run(sql);
  const count = await get("SELECT COUNT(*) AS n FROM books");
  if (count.n === 0) {
    const books = [
      ["S001","Nhà giả kim","Paulo Coelho","Văn học","NXB Hội Nhà Văn",2018,79000,45000,24,5],
      ["S002","Dế Mèn phiêu lưu ký","Tô Hoài","Thiếu nhi","Kim Đồng",2022,65000,36000,18,5],
      ["S003","Tuổi trẻ đáng giá bao nhiêu","Rosie Nguyễn","Kỹ năng","Nhã Nam",2021,85000,52000,12,4],
      ["S004","Đắc nhân tâm","Dale Carnegie","Kỹ năng","NXB Tổng hợp",2020,90000,55000,15,5],
      ["S005","Harry Potter và Hòn đá Phù thủy","J. K. Rowling","Fantasy","Trẻ",2019,120000,75000,8,3],
      ["S006","Cho tôi xin một vé đi tuổi thơ","Nguyễn Nhật Ánh","Văn học","Trẻ",2020,95000,57000,3,5]
    ];
    for (const b of books) await run(
      "INSERT INTO books(code,title,author,genre,publisher,publish_year,price,cost_price,stock,min_stock) VALUES(?,?,?,?,?,?,?,?,?,?)", b
    );
  }
  const ccount = await get("SELECT COUNT(*) AS n FROM customers");
  if (ccount.n === 0) {
    await run("INSERT INTO customers(code,name,phone,email,address,points,tier) VALUES(?,?,?,?,?,?,?)",
      ["KH001","Nguyễn Minh Anh","0901234567","minhanh@example.com","TP. Hồ Chí Minh",120,"Bạc"]);
    await run("INSERT INTO customers(code,name,phone,email,address,points,tier) VALUES(?,?,?,?,?,?,?)",
      ["KH002","Trần Quốc Bảo","0912345678","quocbao@example.com","Tây Ninh",30,"Thường"]);
  }
  const scount = await get("SELECT COUNT(*) AS n FROM suppliers");
  if (scount.n === 0) {
    await run("INSERT INTO suppliers(code,name,phone,email,address) VALUES(?,?,?,?,?)",
      ["NCC001","Công ty Sách Nhã Nam","0283822 3344","contact@nhanam.vn","TP. Hồ Chí Minh"]);
    await run("INSERT INTO suppliers(code,name,phone,email,address) VALUES(?,?,?,?,?)",
      ["NCC002","Nhà sách Tổng hợp","0283930 1234","info@example.com","TP. Hồ Chí Minh"]);
  }
}

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notFound = (res, what = "Dữ liệu") => res.status(404).json({ error: `${what} không tồn tại.` });
const required = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === "") throw Object.assign(new Error(`${label} là bắt buộc.`), { status: 400 });
};
const code = prefix => `${prefix}${Date.now().toString().slice(-8)}${Math.floor(Math.random()*90+10)}`;

app.get("/api/health", (req, res) => res.json({ ok: true, app: "Bookstore Management", database: "SQLite" }));

app.get("/api/dashboard", asyncRoute(async (req, res) => {
  const [books, customers, suppliers, sales, lowStock, recent] = await Promise.all([
    get("SELECT COUNT(*) n FROM books WHERE active=1"),
    get("SELECT COUNT(*) n FROM customers"),
    get("SELECT COUNT(*) n FROM suppliers WHERE active=1"),
    get("SELECT COALESCE(SUM(total),0) n FROM invoices WHERE payment_status='Đã thanh toán' AND date(created_at)=date('now','localtime')"),
    get("SELECT COUNT(*) n FROM books WHERE active=1 AND stock<=min_stock"),
    all("SELECT i.id,i.code,i.total,i.payment_status,i.created_at,COALESCE(c.name,'Khách vãng lai') customer FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id ORDER BY i.id DESC LIMIT 5")
  ]);
  res.json({ books: books.n, customers: customers.n, suppliers: suppliers.n, todayRevenue: sales.n, lowStock: lowStock.n, recent });
}));

app.get("/api/books", asyncRoute(async (req,res) => {
  const q = `%${req.query.q || ""}%`;
  res.json(await all("SELECT * FROM books WHERE active=1 AND (code LIKE ? OR title LIKE ? OR author LIKE ? OR genre LIKE ?) ORDER BY id DESC", [q,q,q,q]));
}));
app.post("/api/books", asyncRoute(async (req,res) => {
  const b=req.body; required(b.code,"Mã sách"); required(b.title,"Tên sách");
  const r=await run("INSERT INTO books(code,title,author,genre,publisher,publish_year,price,cost_price,stock,min_stock,description) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [b.code,b.title,b.author||"",b.genre||"",b.publisher||"",b.publish_year||null,Number(b.price)||0,Number(b.cost_price)||0,Math.max(0,Number(b.stock)||0),Math.max(0,Number(b.min_stock)||0),b.description||""]);
  res.status(201).json(await get("SELECT * FROM books WHERE id=?",[r.id]));
}));
app.put("/api/books/:id", asyncRoute(async (req,res) => {
  const old=await get("SELECT * FROM books WHERE id=?",[req.params.id]); if(!old) return notFound(res,"Sách");
  const b={...old,...req.body};
  await run("UPDATE books SET code=?,title=?,author=?,genre=?,publisher=?,publish_year=?,price=?,cost_price=?,min_stock=?,description=? WHERE id=?",
    [b.code,b.title,b.author||"",b.genre||"",b.publisher||"",b.publish_year||null,Number(b.price)||0,Number(b.cost_price)||0,Math.max(0,Number(b.min_stock)||0),b.description||"",req.params.id]);
  res.json(await get("SELECT * FROM books WHERE id=?",[req.params.id]));
}));
app.delete("/api/books/:id", asyncRoute(async (req,res) => {
  const b=await get("SELECT * FROM books WHERE id=?",[req.params.id]); if(!b) return notFound(res,"Sách");
  const used=await get("SELECT (SELECT COUNT(*) FROM invoice_items WHERE book_id=?) + (SELECT COUNT(*) FROM purchase_items WHERE book_id=?) n",[b.id,b.id]);
  if(used.n) await run("UPDATE books SET active=0 WHERE id=?",[b.id]); else await run("DELETE FROM books WHERE id=?",[b.id]);
  res.json({ok:true,message:"Đã ngừng kinh doanh/xóa sách."});
}));

app.get("/api/customers", asyncRoute(async(req,res)=>{
  const q=`%${req.query.q||""}%`; res.json(await all("SELECT * FROM customers WHERE code LIKE ? OR name LIKE ? OR phone LIKE ? ORDER BY id DESC",[q,q,q]));
}));
app.post("/api/customers", asyncRoute(async(req,res)=>{
  const c=req.body; required(c.code,"Mã khách hàng"); required(c.name,"Tên khách hàng");
  const r=await run("INSERT INTO customers(code,name,phone,email,address,points,tier) VALUES(?,?,?,?,?,?,?)",[c.code,c.name,c.phone||"",c.email||"",c.address||"",Number(c.points)||0,c.tier||"Thường"]);
  res.status(201).json(await get("SELECT * FROM customers WHERE id=?",[r.id]));
}));
app.put("/api/customers/:id", asyncRoute(async(req,res)=>{
  const old=await get("SELECT * FROM customers WHERE id=?",[req.params.id]); if(!old)return notFound(res,"Khách hàng");
  const c={...old,...req.body};
  await run("UPDATE customers SET code=?,name=?,phone=?,email=?,address=?,points=?,tier=? WHERE id=?",[c.code,c.name,c.phone||"",c.email||"",c.address||"",Number(c.points)||0,c.tier||"Thường",req.params.id]);
  res.json(await get("SELECT * FROM customers WHERE id=?",[req.params.id]));
}));
app.delete("/api/customers/:id", asyncRoute(async(req,res)=>{
  const used=await get("SELECT COUNT(*) n FROM invoices WHERE customer_id=?",[req.params.id]);
  if(used.n) return res.status(409).json({error:"Khách hàng đã có hóa đơn, không thể xóa."});
  await run("DELETE FROM customers WHERE id=?",[req.params.id]); res.json({ok:true});
}));

app.get("/api/suppliers", asyncRoute(async(req,res)=>{
  const q=`%${req.query.q||""}%`; res.json(await all("SELECT * FROM suppliers WHERE code LIKE ? OR name LIKE ? OR phone LIKE ? ORDER BY id DESC",[q,q,q]));
}));
app.post("/api/suppliers", asyncRoute(async(req,res)=>{
  const s=req.body; required(s.code,"Mã nhà cung cấp"); required(s.name,"Tên nhà cung cấp");
  const r=await run("INSERT INTO suppliers(code,name,phone,email,address) VALUES(?,?,?,?,?)",[s.code,s.name,s.phone||"",s.email||"",s.address||""]);
  res.status(201).json(await get("SELECT * FROM suppliers WHERE id=?",[r.id]));
}));
app.put("/api/suppliers/:id", asyncRoute(async(req,res)=>{
  const old=await get("SELECT * FROM suppliers WHERE id=?",[req.params.id]); if(!old)return notFound(res,"Nhà cung cấp");
  const s={...old,...req.body};
  await run("UPDATE suppliers SET code=?,name=?,phone=?,email=?,address=?,active=? WHERE id=?",[s.code,s.name,s.phone||"",s.email||"",s.address||"",s.active===undefined?1:s.active,req.params.id]);
  res.json(await get("SELECT * FROM suppliers WHERE id=?",[req.params.id]));
}));
app.delete("/api/suppliers/:id", asyncRoute(async(req,res)=>{
  const used=await get("SELECT COUNT(*) n FROM purchase_receipts WHERE supplier_id=?",[req.params.id]);
  if(used.n) { await run("UPDATE suppliers SET active=0 WHERE id=?",[req.params.id]); return res.json({ok:true,message:"Nhà cung cấp đã được ngừng hoạt động."}); }
  await run("DELETE FROM suppliers WHERE id=?",[req.params.id]); res.json({ok:true});
}));

app.get("/api/invoices", asyncRoute(async(req,res)=>res.json(await all(
  "SELECT i.*,COALESCE(c.name,'Khách vãng lai') customer_name FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id ORDER BY i.id DESC"))));
app.post("/api/invoices", asyncRoute(async(req,res)=>{
  const {customer_id,items,payment_method,discount,note}=req.body;
  if(!Array.isArray(items)||!items.length) throw Object.assign(new Error("Hóa đơn phải có ít nhất một đầu sách."),{status:400});
  const clean=[];
  for(const item of items){
    const book=await get("SELECT * FROM books WHERE id=? AND active=1",[Number(item.book_id)]);
    if(!book) throw Object.assign(new Error("Có sách không tồn tại."),{status:400});
    const qty=Math.floor(Number(item.quantity));
    if(!Number.isInteger(qty)||qty<1) throw Object.assign(new Error("Số lượng phải từ 1 trở lên."),{status:400});
    if(book.stock<qty) throw Object.assign(new Error(`Sách "${book.title}" không đủ tồn kho. Còn ${book.stock} cuốn.`),{status:400});
    clean.push({book,qty});
  }
  const subtotal=clean.reduce((sum,x)=>sum+x.book.price*x.qty,0);
  const disc=Math.min(subtotal,Math.max(0,Number(discount)||0));
  const total=subtotal-disc;
  await run("BEGIN TRANSACTION");
  try {
    const invCode=code("HD");
    const ir=await run("INSERT INTO invoices(code,customer_id,subtotal,discount,total,payment_method,payment_status,note) VALUES(?,?,?,?,?,?,?,?)",
      [invCode,customer_id||null,subtotal,disc,total,payment_method||"Tiền mặt","Đã thanh toán",note||""]);
    for(const x of clean){
      await run("INSERT INTO invoice_items(invoice_id,book_id,quantity,unit_price) VALUES(?,?,?,?)",[ir.id,x.book.id,x.qty,x.book.price]);
      await run("UPDATE books SET stock=stock-? WHERE id=?",[x.qty,x.book.id]);
    }
    if(customer_id) await run("UPDATE customers SET points=points+? WHERE id=?",[Math.floor(total/10000),customer_id]);
    await run("COMMIT");
    res.status(201).json(await get("SELECT * FROM invoices WHERE id=?",[ir.id]));
  } catch(e){ await run("ROLLBACK"); throw e; }
}));

app.get("/api/invoices/:id", asyncRoute(async(req,res)=>{
  const invoice=await get("SELECT i.*,COALESCE(c.name,'Khách vãng lai') customer_name FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=?",[req.params.id]);
  if(!invoice)return notFound(res,"Hóa đơn");
  invoice.items=await all("SELECT ii.*,b.code,b.title FROM invoice_items ii JOIN books b ON b.id=ii.book_id WHERE ii.invoice_id=?",[req.params.id]);
  invoice.returns=await all("SELECT r.*,b.title FROM returns r JOIN books b ON b.id=r.book_id WHERE r.invoice_id=?",[req.params.id]);
  res.json(invoice);
}));

app.get("/api/purchases", asyncRoute(async(req,res)=>res.json(await all(
  "SELECT p.*,s.name supplier_name FROM purchase_receipts p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC"))));
app.post("/api/purchases", asyncRoute(async(req,res)=>{
  const {supplier_id,items,note}=req.body;
  if(!supplier_id) throw Object.assign(new Error("Vui lòng chọn nhà cung cấp."),{status:400});
  if(!Array.isArray(items)||!items.length) throw Object.assign(new Error("Phiếu nhập phải có ít nhất một đầu sách."),{status:400});
  const clean=[];
  for(const item of items){
    const book=await get("SELECT * FROM books WHERE id=?",[Number(item.book_id)]);
    if(!book) throw Object.assign(new Error("Có sách không tồn tại."),{status:400});
    const qty=Math.floor(Number(item.quantity)),cost=Number(item.unit_cost);
    if(qty<1||!Number.isFinite(cost)||cost<0) throw Object.assign(new Error("Số lượng hoặc đơn giá nhập không hợp lệ."),{status:400});
    clean.push({book,qty,cost});
  }
  const total=clean.reduce((sum,x)=>sum+x.qty*x.cost,0);
  await run("BEGIN TRANSACTION");
  try {
    const r=await run("INSERT INTO purchase_receipts(code,supplier_id,total,note) VALUES(?,?,?,?)",[code("PN"),supplier_id,total,note||""]);
    for(const x of clean){
      await run("INSERT INTO purchase_items(receipt_id,book_id,quantity,unit_cost) VALUES(?,?,?,?)",[r.id,x.book.id,x.qty,x.cost]);
      await run("UPDATE books SET stock=stock+?,cost_price=? WHERE id=?",[x.qty,x.cost,x.book.id]);
    }
    await run("COMMIT"); res.status(201).json(await get("SELECT * FROM purchase_receipts WHERE id=?",[r.id]));
  } catch(e){ await run("ROLLBACK"); throw e; }
}));

app.post("/api/returns", asyncRoute(async(req,res)=>{
  const {invoice_id,book_id,quantity,type,reason}=req.body;
  required(invoice_id,"Hóa đơn"); required(book_id,"Sách"); required(type,"Hình thức");
  const qty=Math.floor(Number(quantity));
  if(qty<1) throw Object.assign(new Error("Số lượng phải từ 1 trở lên."),{status:400});
  const invoice=await get("SELECT * FROM invoices WHERE id=?",[invoice_id]); if(!invoice)return notFound(res,"Hóa đơn");
  const book=await get("SELECT * FROM books WHERE id=?",[book_id]); if(!book)return notFound(res,"Sách");
  const purchased=await get("SELECT quantity,unit_price FROM invoice_items WHERE invoice_id=? AND book_id=?",[invoice_id,book_id]);
  if(!purchased) throw Object.assign(new Error("Sách không thuộc hóa đơn này."),{status:400});
  const already=await get("SELECT COALESCE(SUM(quantity),0) n FROM returns WHERE invoice_id=? AND book_id=?",[invoice_id,book_id]);
  if(qty>purchased.quantity-already.n) throw Object.assign(new Error("Số lượng đổi/trả vượt số lượng đã mua còn lại."),{status:400});
  const refund=type==="Trả hàng"?purchased.unit_price*qty:0;
  const r=await run("INSERT INTO returns(code,invoice_id,book_id,quantity,type,refund,reason) VALUES(?,?,?,?,?,?,?)",[code("DT"),invoice_id,book_id,qty,type,refund,reason||""]);
  if(type==="Trả hàng") await run("UPDATE books SET stock=stock+? WHERE id=?",[qty,book_id]);
  res.status(201).json(await get("SELECT * FROM returns WHERE id=?",[r.id]));
}));

app.get("/api/reports/summary", asyncRoute(async(req,res)=>{
  const from=req.query.from||"2000-01-01", to=req.query.to||"2999-12-31";
  const [sales,top,stock,monthly]=await Promise.all([
    get("SELECT COUNT(*) invoices,COALESCE(SUM(total),0) revenue,COALESCE(SUM(discount),0) discounts FROM invoices WHERE payment_status='Đã thanh toán' AND date(created_at) BETWEEN date(?) AND date(?)",[from,to]),
    all("SELECT b.title,b.code,SUM(ii.quantity) quantity,SUM(ii.quantity*ii.unit_price) revenue FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN books b ON b.id=ii.book_id WHERE date(i.created_at) BETWEEN date(?) AND date(?) GROUP BY b.id ORDER BY quantity DESC LIMIT 10",[from,to]),
    all("SELECT code,title,stock,min_stock,cost_price,stock*cost_price stock_value FROM books WHERE active=1 ORDER BY stock ASC"),
    all("SELECT strftime('%Y-%m',created_at) month, SUM(total) revenue FROM invoices WHERE payment_status='Đã thanh toán' AND date(created_at) BETWEEN date(?) AND date(?) GROUP BY month ORDER BY month",[from,to])
  ]);
  res.json({sales,top,stock,monthly});
}));

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{
  console.error(err);
  if(err.code==="SQLITE_CONSTRAINT") return res.status(409).json({error:"Dữ liệu bị trùng hoặc vi phạm ràng buộc. Hãy kiểm tra mã và thông tin liên quan."});
  res.status(err.status||500).json({error:err.message||"Lỗi máy chủ."});
});

initDb().then(()=>{
  app.listen(PORT,()=>console.log(`Bookstore Management đang chạy tại http://localhost:${PORT}`));
}).catch(err=>{console.error("Không thể khởi tạo cơ sở dữ liệu:",err);process.exit(1);});
