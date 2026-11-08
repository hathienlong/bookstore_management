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
app.use(express.static(path.join(__dirname, "..", "frontend")));

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

  // Bộ dữ liệu demo bổ sung: INSERT OR IGNORE giúp không nhân đôi khi khởi động lại.
  const demoSuppliers = [["NCC003", "Công ty Phát hành sách Thành Đạt", "028 3821 1003", "thanhdat@example.com", "TP. Hồ Chí Minh"], ["NCC004", "Công ty Sách Ánh Dương", "028 3821 1004", "anhduong@example.com", "TP. Hồ Chí Minh"], ["NCC005", "Nhà phân phối Tri Thức Việt", "028 3821 1005", "trithucviet@example.com", "Hà Nội"], ["NCC006", "Công ty Sách Minh Long", "028 3821 1006", "minhlong@example.com", "Đà Nẵng"], ["NCC007", "Nhà sách Phương Nam", "028 3821 1007", "phuongnam@example.com", "TP. Hồ Chí Minh"], ["NCC008", "Công ty Sách Đông A", "028 3821 1008", "donga@example.com", "TP. Hồ Chí Minh"], ["NCC009", "Nhà phân phối Kim Đồng", "028 3821 1009", "kimdong@example.com", "Hà Nội"], ["NCC010", "Công ty Sách Thái Hà", "028 3821 1010", "thaiha@example.com", "Hà Nội"], ["NCC011", "Công ty Văn hóa Sáng Tạo", "028 3821 1011", "sangtao@example.com", "Cần Thơ"], ["NCC012", "Nhà phân phối Văn Lang", "028 3821 1012", "vanlang@example.com", "TP. Hồ Chí Minh"]];
  for (const s of demoSuppliers) {
    await run("INSERT OR IGNORE INTO suppliers(code,name,phone,email,address) VALUES(?,?,?,?,?)", s);
  }

  const demoBooks = [["S007", "Cây cam ngọt của tôi", "José Mauro de Vasconcelos", "Văn học", "NXB Hội Nhà Văn", 2022, 108000, 65000, 2, 5], ["S008", "Đi tìm lẽ sống", "Viktor E. Frankl", "Tâm lý", "NXB Tổng hợp", 2021, 88000, 52000, 3, 5], ["S009", "Không gia đình", "Hector Malot", "Văn học", "Kim Đồng", 2020, 125000, 76000, 4, 5], ["S010", "Nhà thờ Đức Bà Paris", "Victor Hugo", "Văn học", "NXB Văn Học", 2019, 145000, 88000, 26, 5], ["S011", "Bố già", "Mario Puzo", "Tiểu thuyết", "NXB Văn Học", 2022, 135000, 82000, 32, 5], ["S012", "Rừng Na Uy", "Haruki Murakami", "Tiểu thuyết", "Nhã Nam", 2021, 119000, 71000, 21, 5], ["S013", "Kafka bên bờ biển", "Haruki Murakami", "Tiểu thuyết", "Nhã Nam", 2020, 155000, 93000, 17, 5], ["S014", "Sapiens: Lược sử loài người", "Yuval Noah Harari", "Lịch sử", "Omega+", 2022, 189000, 112000, 28, 5], ["S015", "Homo Deus: Lược sử tương lai", "Yuval Noah Harari", "Lịch sử", "Omega+", 2021, 199000, 118000, 19, 5], ["S016", "Tư duy nhanh và chậm", "Daniel Kahneman", "Tâm lý", "NXB Thế Giới", 2020, 179000, 108000, 24, 5], ["S017", "Dám bị ghét", "Kishimi Ichiro, Koga Fumitake", "Tâm lý", "Nhã Nam", 2022, 99000, 59000, 35, 5], ["S018", "Atomic Habits: Thay đổi tí hon, hiệu quả bất ngờ", "James Clear", "Kỹ năng", "NXB Thế Giới", 2023, 150000, 90000, 42, 5], ["S019", "7 thói quen hiệu quả", "Stephen R. Covey", "Kỹ năng", "NXB Tổng hợp", 2021, 135000, 81000, 18, 5], ["S020", "Tuần làm việc 4 giờ", "Timothy Ferriss", "Kinh doanh", "Alphabooks", 2020, 145000, 87000, 16, 5], ["S021", "Khởi nghiệp tinh gọn", "Eric Ries", "Kinh doanh", "NXB Công Thương", 2022, 165000, 99000, 23, 5], ["S022", "Marketing giỏi phải kiếm được tiền", "Sergio Zyman", "Kinh doanh", "NXB Trẻ", 2019, 125000, 75000, 14, 5], ["S023", "Từ tốt đến vĩ đại", "Jim Collins", "Kinh doanh", "NXB Trẻ", 2021, 155000, 93000, 27, 5], ["S024", "Lược sử thời gian", "Stephen Hawking", "Khoa học", "NXB Trẻ", 2020, 115000, 69000, 31, 5], ["S025", "Vũ trụ trong vỏ hạt dẻ", "Stephen Hawking", "Khoa học", "NXB Trẻ", 2022, 135000, 81000, 22, 5], ["S026", "Gen: Lịch sử và tương lai của nhân loại", "Siddhartha Mukherjee", "Khoa học", "Omega+", 2021, 220000, 132000, 12, 5], ["S027", "Bí mật của nước", "Masaru Emoto", "Khoa học", "NXB Lao Động", 2018, 95000, 57000, 29, 5], ["S028", "Thế giới phẳng", "Thomas L. Friedman", "Kinh tế", "NXB Trẻ", 2019, 185000, 111000, 20, 5], ["S029", "Cha giàu cha nghèo", "Robert T. Kiyosaki", "Tài chính", "NXB Trẻ", 2022, 105000, 63000, 38, 5], ["S030", "Nghĩ giàu và làm giàu", "Napoleon Hill", "Tài chính", "First News", 2021, 99000, 59000, 33, 5], ["S031", "Bí mật tư duy triệu phú", "T. Harv Eker", "Tài chính", "NXB Tổng hợp", 2020, 115000, 69000, 25, 5], ["S032", "Cho tôi xin một vé đi tuổi thơ (bản minh họa)", "Nguyễn Nhật Ánh", "Văn học", "NXB Trẻ", 2023, 110000, 66000, 15, 5], ["S033", "Mắt biếc", "Nguyễn Nhật Ánh", "Văn học", "NXB Trẻ", 2021, 95000, 57000, 30, 5], ["S034", "Tôi thấy hoa vàng trên cỏ xanh", "Nguyễn Nhật Ánh", "Văn học", "NXB Trẻ", 2020, 105000, 63000, 36, 5], ["S035", "Thám tử lừng danh Conan - Tập 1", "Gosho Aoyama", "Truyện tranh", "Kim Đồng", 2022, 25000, 15000, 48, 5], ["S036", "One Piece - Tập 1", "Eiichiro Oda", "Truyện tranh", "Kim Đồng", 2022, 25000, 15000, 44, 5]];
  for (const b of demoBooks) {
    await run("INSERT OR IGNORE INTO books(code,title,author,genre,publisher,publish_year,price,cost_price,stock,min_stock) VALUES(?,?,?,?,?,?,?,?,?,?)", b);
  }

  const demoCustomers = [["KH003", "Lê Hoàng Nam", "0903000003", "nam.le@example.com", "TP. Hồ Chí Minh", 860, "Vàng"], ["KH004", "Phạm Ngọc Hà", "0903000004", "ha.pham@example.com", "Bình Dương", 1250, "Vàng"], ["KH005", "Võ Minh Khang", "0903000005", "khang.vo@example.com", "Đồng Nai", 430, "Bạc"], ["KH006", "Đặng Thùy Linh", "0903000006", "linh.dang@example.com", "TP. Hồ Chí Minh", 2180, "Kim cương"], ["KH007", "Bùi Gia Huy", "0903000007", "huy.bui@example.com", "Long An", 670, "Bạc"], ["KH008", "Đỗ Khánh Vy", "0903000008", "vy.do@example.com", "TP. Hồ Chí Minh", 1540, "Vàng"], ["KH009", "Ngô Đức Anh", "0903000009", "anh.ngo@example.com", "Tây Ninh", 390, "Bạc"], ["KH010", "Huỳnh Mỹ Duyên", "0903000010", "duyen.huynh@example.com", "Cần Thơ", 2750, "Kim cương"], ["KH011", "Trương Nhật Minh", "0903000011", "minh.truong@example.com", "TP. Hồ Chí Minh", 980, "Vàng"], ["KH012", "Phan Bảo Ngọc", "0903000012", "ngoc.phan@example.com", "Đà Nẵng", 560, "Bạc"]];
  for (const c of demoCustomers) {
    await run("INSERT OR IGNORE INTO customers(code,name,phone,email,address,points,tier) VALUES(?,?,?,?,?,?,?)", c);
  }

  // Liên kết sách với nhà cung cấp thông qua phiếu nhập và chi tiết phiếu nhập.
  for (let supplierIndex = 0; supplierIndex < demoSuppliers.length; supplierIndex++) {
    const supplier = await get("SELECT id FROM suppliers WHERE code=?", [demoSuppliers[supplierIndex][0]]);
    const receiptCode = `PN-DEMO-${String(supplierIndex + 1).padStart(3, "0")}`;
    const receiptExists = await get("SELECT id FROM purchase_receipts WHERE code=?", [receiptCode]);
    if (!receiptExists) {
      const suppliedBooks = demoBooks.filter((book, index) => index % demoSuppliers.length === supplierIndex);
      const total = suppliedBooks.reduce((sum, book) => sum + book[8] * book[7], 0);
      const receipt = await run("INSERT INTO purchase_receipts(code,supplier_id,total,note) VALUES(?,?,?,?)",
        [receiptCode, supplier.id, total, "Phiếu nhập dữ liệu demo"]);
      for (const book of suppliedBooks) {
        const savedBook = await get("SELECT id FROM books WHERE code=?", [book[0]]);
        await run("INSERT INTO purchase_items(receipt_id,book_id,quantity,unit_cost) VALUES(?,?,?,?)",
          [receipt.id, savedBook.id, book[8], book[7]]);
      }
    }
  }

  // 15 hóa đơn: mỗi trạng thái có 5 hóa đơn. Hóa đơn hủy không trừ tồn kho.
  const demoStatuses = ["Chưa thanh toán","Đã thanh toán","Hủy thanh toán"];
  for (let i = 0; i < 15; i++) {
    const invoiceCode = `HD-DEMO-${String(i + 1).padStart(3, "0")}`;
    const exists = await get("SELECT id FROM invoices WHERE code=?", [invoiceCode]);
    if (exists) continue;
    const status = demoStatuses[Math.floor(i / 5)];
    const customerCode = demoCustomers[i % demoCustomers.length][0];
    const customer = await get("SELECT id FROM customers WHERE code=?", [customerCode]);
    const chosen = [
      demoBooks[3 + ((i * 2) % 27)],
      demoBooks[3 + ((i * 2 + 7) % 27)]
    ];
    const lines = [];
    for (let j = 0; j < chosen.length; j++) {
      const book = await get("SELECT * FROM books WHERE code=?", [chosen[j][0]]);
      const quantity = 1 + ((i + j) % 2);
      lines.push({ book, quantity });
    }
    const subtotal = lines.reduce((sum, line) => sum + line.book.price * line.quantity, 0);
    const discount = i % 3 === 0 ? Math.round(subtotal * 0.05) : 0;
    const total = subtotal - discount;
    const createdAt = `2026-10-${String(10 + i).padStart(2, "0")} ${String(9 + (i % 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00`;
    const invoice = await run(
      "INSERT INTO invoices(code,customer_id,subtotal,discount,total,payment_method,payment_status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [invoiceCode, customer.id, subtotal, discount, total, i % 2 ? "Chuyển khoản" : "Tiền mặt", status,
       "Hóa đơn dữ liệu demo", createdAt]
    );
    for (const line of lines) {
      await run("INSERT INTO invoice_items(invoice_id,book_id,quantity,unit_price) VALUES(?,?,?,?)",
        [invoice.id, line.book.id, line.quantity, line.book.price]);
      if (status !== "Hủy thanh toán") {
        await run("UPDATE books SET stock=MAX(0, stock-?) WHERE id=?", [line.quantity, line.book.id]);
      }
    }
    if (status === "Đã thanh toán") {
      await run("UPDATE customers SET points=points+? WHERE id=?", [Math.floor(total / 10000), customer.id]);
    }
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
