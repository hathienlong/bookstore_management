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
    )`,
    `CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'percent', value REAL NOT NULL DEFAULT 0, max_discount REAL,
      min_subtotal REAL NOT NULL DEFAULT 0, min_qty INTEGER NOT NULL DEFAULT 0, min_tier TEXT,
      start_date TEXT, end_date TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS stock_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER NOT NULL, system_qty INTEGER NOT NULL, counted_qty INTEGER NOT NULL,
      diff INTEGER NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(book_id) REFERENCES books(id)
    )`
  ];
  for (const sql of schema) await run(sql);
  // Nâng cấp CSDL cũ: lưu khuyến mãi đã áp dụng trên hóa đơn (snapshot, không đổi khi sửa chương trình sau này).
  const invCols = (await all("PRAGMA table_info(invoices)")).map(c => c.name);
  for (const [col, def] of [["promotion_code","TEXT"],["promotion_name","TEXT"],["promotion_desc","TEXT"],["promotion_amount","REAL NOT NULL DEFAULT 0"],["member_tier","TEXT"],["member_rate","REAL NOT NULL DEFAULT 0"],["member_amount","REAL NOT NULL DEFAULT 0"]])
    if (!invCols.includes(col)) await run(`ALTER TABLE invoices ADD COLUMN ${col} ${def}`);
  const retCols = (await all("PRAGMA table_info(returns)")).map(c => c.name);
  for (const [col, def] of [["new_book_id","INTEGER"],["new_qty","INTEGER NOT NULL DEFAULT 0"],["return_value","REAL NOT NULL DEFAULT 0"],["new_value","REAL NOT NULL DEFAULT 0"],["diff","REAL NOT NULL DEFAULT 0"],["exchange_invoice_id","INTEGER"]])
    if (!retCols.includes(col)) await run(`ALTER TABLE returns ADD COLUMN ${col} ${def}`);
  for (const [col, def] of [["kind","TEXT NOT NULL DEFAULT 'sale'"],["ref_invoice_id","INTEGER"]])
    if (!(await all("PRAGMA table_info(invoices)")).some(c => c.name === col)) await run(`ALTER TABLE invoices ADD COLUMN ${col} ${def}`);
  const demoPromos = [
    ["KM10","Giảm 10% hóa đơn từ 300.000 ₫","percent",10,50000,300000,0,null],
    ["KM50K","Giảm 50.000 ₫ hóa đơn từ 500.000 ₫","fixed",50000,null,500000,0,null]
  ];
  // Ưu đãi theo hạng nay do hệ thống hạng thành viên đảm nhiệm (cộng dồn với khuyến mãi thường).
  await run("DELETE FROM promotions WHERE code='KMVANG'");
  for (const x of demoPromos) await run("INSERT OR IGNORE INTO promotions(code,name,type,value,max_discount,min_subtotal,min_qty,min_tier) VALUES(?,?,?,?,?,?,?,?)", x);
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

  // Hóa đơn demo cho KH001 (tài khoản dùng khi xem giao diện vai trò Khách hàng). Hạng Bạc → giảm thêm 5% sau khuyến mãi.
  const kh001 = await get("SELECT id FROM customers WHERE code='KH001'");
  const kh001Invoices = [
    ["HD-DEMO-016", "Đã thanh toán", "Tiền mặt", "2026-11-03 10:15:00", [["S001", 2], ["S004", 1]], null],
    ["HD-DEMO-017", "Đã thanh toán", "Chuyển khoản", "2026-11-07 15:40:00", [["S005", 3]], "KM10"],
    ["HD-DEMO-018", "Chưa thanh toán", "Tiền mặt", "2026-11-09 09:05:00", [["S002", 2]], null]
  ];
  for (const [invCode, status, method, createdAt, items, promoCode] of kh001Invoices) {
    if (!kh001 || await get("SELECT id FROM invoices WHERE code=?", [invCode])) continue;
    const lines = [];
    for (const [bookCode, quantity] of items) lines.push({ book: await get("SELECT * FROM books WHERE code=?", [bookCode]), quantity });
    if (lines.some(l => !l.book)) continue;
    const subtotal = lines.reduce((sum, l) => sum + l.book.price * l.quantity, 0);
    const promo = promoCode ? await get("SELECT * FROM promotions WHERE code=?", [promoCode]) : null;
    const promoAmount = promo ? bestPromotion([promo], subtotal, lines.reduce((n, l) => n + l.quantity, 0), "Bạc", "2026-11-11")?.amount || 0 : 0;
    const memberAmount = Math.round((subtotal - promoAmount) * 5 / 100);
    const total = subtotal - promoAmount - memberAmount;
    const inv = await run("INSERT INTO invoices(code,customer_id,subtotal,discount,total,payment_method,payment_status,note,created_at,promotion_code,promotion_name,promotion_desc,promotion_amount,member_tier,member_rate,member_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [invCode, kh001.id, subtotal, promoAmount + memberAmount, total, method, status, "Hóa đơn dữ liệu demo", createdAt,
       promoAmount ? promo.code : null, promoAmount ? promo.name : null, promoAmount ? describePromotion(promo) : null, promoAmount, "Bạc", 5, memberAmount]);
    for (const l of lines) {
      await run("INSERT INTO invoice_items(invoice_id,book_id,quantity,unit_price) VALUES(?,?,?,?)", [inv.id, l.book.id, l.quantity, l.book.price]);
      await run("UPDATE books SET stock=MAX(0, stock-?) WHERE id=?", [l.quantity, l.book.id]);
    }
    if (status === "Đã thanh toán") await run("UPDATE customers SET points=points+? WHERE id=?", [Math.floor(total / 10000), kh001.id]);
  }

  // ===== Dữ liệu demo bổ sung: 50 sách (mỗi thể loại ≥ 7 tựa), 20 hóa đơn, một số giao dịch đổi/trả =====
  const moreBooks = [["S037", "Đời ngắn đừng ngủ dài", "Robin Sharma", "Kỹ năng", "Nhã Nam", 2019, 79000, 49000, 14, 5],
    ["S038", "Nghệ thuật tinh tế của việc đếch quan tâm", "Mark Manson", "Kỹ năng", "NXB Thế Giới", 2019, 98000, 61000, 21, 5],
    ["S039", "Sức mạnh của thói quen", "Charles Duhigg", "Kỹ năng", "NXB Thế Giới", 2018, 110000, 68000, 28, 5],
    ["S040", "Hoàng tử bé", "Antoine de Saint-Exupéry", "Thiếu nhi", "NXB Hội Nhà Văn", 2020, 59000, 37000, 35, 5],
    ["S041", "Totto-chan bên cửa sổ", "Tetsuko Kuroyanagi", "Thiếu nhi", "NXB Hội Nhà Văn", 2019, 75000, 46000, 15, 5],
    ["S042", "Tôi là Bêtô", "Nguyễn Nhật Ánh", "Thiếu nhi", "NXB Trẻ", 2021, 85000, 53000, 22, 5],
    ["S043", "Những cuộc phiêu lưu của Tom Sawyer", "Mark Twain", "Thiếu nhi", "Kim Đồng", 2018, 89000, 55000, 29, 5],
    ["S044", "Alice ở xứ sở thần tiên", "Lewis Carroll", "Thiếu nhi", "Kim Đồng", 2020, 69000, 43000, 36, 5],
    ["S045", "Chuyện con mèo dạy hải âu bay", "Luis Sepúlveda", "Thiếu nhi", "NXB Hội Nhà Văn", 2021, 62000, 38000, 16, 5],
    ["S046", "Harry Potter và Phòng chứa Bí mật", "J. K. Rowling", "Fantasy", "NXB Trẻ", 2019, 125000, 78000, 23, 5],
    ["S047", "Harry Potter và Tên tù nhân ngục Azkaban", "J. K. Rowling", "Fantasy", "NXB Trẻ", 2019, 140000, 87000, 30, 5],
    ["S048", "Chúa tể những chiếc nhẫn: Hiệp hội nhẫn thần", "J. R. R. Tolkien", "Fantasy", "NXB Hội Nhà Văn", 2020, 189000, 117000, 37, 5],
    ["S049", "Hobbit", "J. R. R. Tolkien", "Fantasy", "NXB Hội Nhà Văn", 2019, 145000, 90000, 17, 5],
    ["S050", "Biên niên sử Narnia: Sư tử, phù thủy và cái tủ áo", "C. S. Lewis", "Fantasy", "NXB Văn Học", 2018, 98000, 61000, 24, 5],
    ["S051", "Percy Jackson: Kẻ cắp tia chớp", "Rick Riordan", "Fantasy", "NXB Văn Học", 2019, 115000, 71000, 31, 5],
    ["S052", "Chiến lược đại dương xanh", "W. Chan Kim", "Kinh doanh", "NXB Tri Thức", 2018, 168000, 104000, 38, 5],
    ["S053", "Từ số 0 đến số 1", "Peter Thiel", "Kinh doanh", "NXB Thế Giới", 2017, 99000, 61000, 18, 5],
    ["S054", "Nhà lãnh đạo không chức danh", "Robin Sharma", "Kinh doanh", "First News", 2018, 92000, 57000, 25, 5],
    ["S055", "Nguồn gốc các loài", "Charles Darwin", "Khoa học", "NXB Tri Thức", 2019, 215000, 133000, 32, 5],
    ["S056", "Gen vị kỷ", "Richard Dawkins", "Khoa học", "NXB Tri Thức", 2021, 159000, 99000, 39, 5],
    ["S057", "Cosmos: Vũ trụ", "Carl Sagan", "Khoa học", "NXB Tri Thức", 2020, 185000, 115000, 19, 5],
    ["S058", "Trí tuệ cảm xúc", "Daniel Goleman", "Tâm lý", "First News", 2019, 135000, 84000, 26, 5],
    ["S059", "Sức mạnh của tiềm thức", "Joseph Murphy", "Tâm lý", "First News", 2018, 89000, 55000, 33, 5],
    ["S060", "Tâm lý học đám đông", "Gustave Le Bon", "Tâm lý", "NXB Tri Thức", 2020, 79000, 49000, 40, 5],
    ["S061", "Hiểu về trái tim", "Minh Niệm", "Tâm lý", "NXB Tổng hợp TP.HCM", 2019, 119000, 74000, 20, 5],
    ["S062", "Tội ác và hình phạt", "Fyodor Dostoevsky", "Tiểu thuyết", "NXB Văn Học", 2019, 165000, 102000, 27, 5],
    ["S063", "Trăm năm cô đơn", "Gabriel García Márquez", "Tiểu thuyết", "NXB Văn Học", 2018, 149000, 92000, 34, 5],
    ["S064", "Đại gia Gatsby", "F. Scott Fitzgerald", "Tiểu thuyết", "NXB Văn Học", 2021, 79000, 49000, 14, 5],
    ["S065", "Giết con chim nhại", "Harper Lee", "Tiểu thuyết", "NXB Văn Học", 2019, 125000, 78000, 21, 5],
    ["S066", "Nhà đầu tư thông minh", "Benjamin Graham", "Tài chính", "NXB Thế Giới", 2020, 199000, 123000, 28, 5],
    ["S067", "Người giàu có nhất thành Babylon", "George S. Clason", "Tài chính", "NXB Lao Động", 2019, 69000, 43000, 35, 5],
    ["S068", "Dạy con làm giàu - Tập 1", "Robert T. Kiyosaki", "Tài chính", "NXB Trẻ", 2018, 85000, 53000, 15, 5],
    ["S069", "Tâm lý học về tiền", "Morgan Housel", "Tài chính", "NXB Thế Giới", 2021, 139000, 86000, 22, 5],
    ["S070", "Súng, vi trùng và thép", "Jared Diamond", "Lịch sử", "NXB Thế Giới", 2019, 189000, 117000, 29, 5],
    ["S071", "21 bài học cho thế kỷ 21", "Yuval Noah Harari", "Lịch sử", "NXB Tri Thức", 2019, 169000, 105000, 36, 5],
    ["S072", "Việt Nam sử lược", "Trần Trọng Kim", "Lịch sử", "NXB Văn Học", 2018, 129000, 80000, 16, 5],
    ["S073", "Đại Việt sử ký toàn thư", "Ngô Sĩ Liên", "Lịch sử", "NXB Văn Học", 2017, 350000, 217000, 23, 5],
    ["S074", "Binh pháp Tôn Tử", "Tôn Vũ", "Lịch sử", "NXB Văn Học", 2020, 89000, 55000, 30, 5],
    ["S075", "Doraemon - Tập 1", "Fujiko F. Fujio", "Truyện tranh", "Kim Đồng", 2022, 22000, 14000, 37, 5],
    ["S076", "Dragon Ball - Tập 1", "Akira Toriyama", "Truyện tranh", "Kim Đồng", 2022, 25000, 16000, 17, 5],
    ["S077", "Naruto - Tập 1", "Masashi Kishimoto", "Truyện tranh", "Kim Đồng", 2022, 25000, 16000, 24, 5],
    ["S078", "Thám tử lừng danh Conan - Tập 2", "Gosho Aoyama", "Truyện tranh", "Kim Đồng", 2022, 25000, 16000, 31, 5],
    ["S079", "One Piece - Tập 2", "Eiichiro Oda", "Truyện tranh", "Kim Đồng", 2022, 25000, 16000, 38, 5],
    ["S080", "Kinh tế học hài hước", "Steven D. Levitt, Stephen J. Dubner", "Kinh tế", "NXB Thế Giới", 2018, 129000, 80000, 18, 5],
    ["S081", "Của cải của các dân tộc", "Adam Smith", "Kinh tế", "NXB Tri Thức", 2019, 260000, 161000, 25, 5],
    ["S082", "Tư bản trong thế kỷ XXI", "Thomas Piketty", "Kinh tế", "NXB Tri Thức", 2020, 280000, 174000, 32, 5],
    ["S083", "Tại sao các quốc gia thất bại", "Daron Acemoglu, James A. Robinson", "Kinh tế", "NXB Thế Giới", 2019, 199000, 123000, 39, 5],
    ["S084", "Nguyên lý kinh tế học", "N. Gregory Mankiw", "Kinh tế", "NXB Tri Thức", 2020, 245000, 152000, 19, 5],
    ["S085", "Thiên nga đen", "Nassim Nicholas Taleb", "Kinh tế", "NXB Thế Giới", 2018, 179000, 111000, 26, 5],
    ["S086", "Số đỏ", "Vũ Trọng Phụng", "Văn học", "NXB Văn Học", 2019, 69000, 43000, 33, 5]];
  for (const b of moreBooks) await run("INSERT OR IGNORE INTO books(code,title,author,genre,publisher,publish_year,price,cost_price,stock,min_stock) VALUES(?,?,?,?,?,?,?,?,?,?)", b);

  let prng = 20261112;
  const rnd = () => { prng = (prng * 1664525 + 1013904223) >>> 0; return prng / 4294967296; };
  const dbTime = d => d.toISOString().slice(0, 19).replace("T", " ");
  const custPool = await all("SELECT id FROM customers ORDER BY id");
  const promoList = await all("SELECT * FROM promotions WHERE active=1");
  // Ngày lập tính lùi từ lúc khởi tạo: 12 hóa đơn trong 7 ngày (còn đổi/trả được), 8 hóa đơn cũ hơn (đã quá hạn).
  const daysAgo = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 8, 9, 10, 12, 14, 17, 20, 25];
  for (let i = 0; i < 20; i++) {
    const invCode = `HD-DEMO-${String(19 + i).padStart(3, "0")}`;
    if (await get("SELECT id FROM invoices WHERE code=?", [invCode])) continue;
    const status = i === 4 || i === 15 ? "Chưa thanh toán" : i === 13 ? "Hủy thanh toán" : "Đã thanh toán";
    const customerId = i % 7 === 6 ? null : custPool[(i * 5 + 3) % custPool.length].id;
    const pool = await all("SELECT * FROM books WHERE active=1 AND stock>=4");
    const lines = [];
    for (let j = 0, n = 1 + Math.floor(rnd() * 3); j < n; j++) {
      const book = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      lines.push({ book, quantity: 1 + Math.floor(rnd() * 2) });
    }
    const subtotal = lines.reduce((sum, l) => sum + l.book.price * l.quantity, 0);
    const cust = customerId ? await get("SELECT points FROM customers WHERE id=?", [customerId]) : null;
    const tier = tierInfo(cust ? cust.points : 0);
    const promo = bestPromotion(promoList, subtotal, lines.reduce((n, l) => n + l.quantity, 0), tier.name);
    const promoAmount = promo ? promo.amount : 0;
    const memberAmount = Math.min(subtotal - promoAmount, Math.round((subtotal - promoAmount) * tier.rate / 100));
    const total = subtotal - promoAmount - memberAmount;
    const createdAt = dbTime(new Date(Date.now() - daysAgo[i] * 864e5 - (i % 6 + 1) * 40 * 60e3));
    const inv = await run("INSERT INTO invoices(code,customer_id,subtotal,discount,total,payment_method,payment_status,note,created_at,promotion_code,promotion_name,promotion_desc,promotion_amount,member_tier,member_rate,member_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [invCode, customerId, subtotal, promoAmount + memberAmount, total, ["Tiền mặt", "Chuyển khoản", "Thẻ ngân hàng"][i % 3], status, "Hóa đơn dữ liệu demo", createdAt,
       promo ? promo.code : null, promo ? promo.name : null, promo ? promo.description : null, promoAmount, memberAmount ? tier.name : null, memberAmount ? tier.rate : 0, memberAmount]);
    for (const l of lines) {
      await run("INSERT INTO invoice_items(invoice_id,book_id,quantity,unit_price) VALUES(?,?,?,?)", [inv.id, l.book.id, l.quantity, l.book.price]);
      if (status !== "Hủy thanh toán") await run("UPDATE books SET stock=MAX(0, stock-?) WHERE id=?", [l.quantity, l.book.id]);
    }
    if (status === "Đã thanh toán" && customerId) { await run("UPDATE customers SET points=points+? WHERE id=?", [Math.floor(total / 10000), customerId]); await syncTier(customerId); }
  }

  // Giao dịch đổi/trả mẫu trên các hóa đơn demo còn trong hạn 7 ngày (3 trả hàng, 2 đổi sang sách đắt hơn, 1 đổi sang sách rẻ hơn).
  const demoReturns = [["DT-DEMO-001", "Trả hàng"], ["DT-DEMO-002", "Trả hàng"], ["DT-DEMO-003", "Trả hàng"], ["DT-DEMO-004", "Đổi hàng", "up"], ["DT-DEMO-005", "Đổi hàng", "up"], ["DT-DEMO-006", "Đổi hàng", "down"]];
  const eligible = await all("SELECT id FROM invoices WHERE code>='HD-DEMO-019' AND code<='HD-DEMO-038' AND kind='sale' AND payment_status='Đã thanh toán' AND created_at>=? ORDER BY id", [dbTime(new Date(Date.now() - 6.5 * 864e5))]);
  for (let k = 0; k < demoReturns.length && k < eligible.length; k++) {
    const [rc, type, dir] = demoReturns[k];
    if (await get("SELECT id FROM returns WHERE code=?", [rc])) continue;
    try {
      const inv = await get("SELECT * FROM invoices WHERE id=?", [eligible[k].id]);
      const item = await get("SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id LIMIT 1", [inv.id]);
      const unitPaid = item.unit_price * (inv.subtotal > 0 ? inv.total / inv.subtotal : 1);
      let newBookId;
      if (type === "Đổi hàng") {
        const nb = dir === "up"
          ? await get("SELECT id FROM books WHERE active=1 AND id!=? AND stock>=2 AND price>? ORDER BY price LIMIT 1", [item.book_id, unitPaid + 40000])
          : await get("SELECT id FROM books WHERE active=1 AND id!=? AND stock>=2 AND price<? ORDER BY price DESC LIMIT 1", [item.book_id, unitPaid - 30000]);
        if (!nb) continue;
        newBookId = nb.id;
      }
      await performReturn({ code: rc, invoice_id: inv.id, book_id: item.book_id, quantity: 1, type, new_book_id: newBookId,
        payment_method: "Tiền mặt", reason: type === "Trả hàng" ? ["Sách bị lỗi in", "Đặt nhầm sách", "Không còn nhu cầu"][k % 3] : "Muốn đổi sang sách khác" });
    } catch (e) { console.warn("Bỏ qua giao dịch đổi/trả demo " + rc + ":", e.message); }
  }

}

/* ===== Khuyến mãi: tự chọn đúng 1 chương trình có số tiền giảm lớn nhất ===== */
const TIERS = ["Thường","Bạc","Vàng","Kim cương"];
/* ===== Hạng thành viên: 1 điểm = 10.000 ₫ đã mua; hạng xét theo điểm tích lũy (phải VƯỢT ngưỡng) ===== */
const TIER_RULES = [{ name: "Kim cương", above: 1000, rate: 12 }, { name: "Vàng", above: 250, rate: 8 }, { name: "Bạc", above: 100, rate: 5 }];
const tierInfo = points => TIER_RULES.find(r => points > r.above) || { name: "Thường", above: 0, rate: 0 };
async function syncTier(id) {
  const c = await get("SELECT points FROM customers WHERE id=?", [id]);
  if (c) await run("UPDATE customers SET tier=? WHERE id=?", [tierInfo(c.points).name, id]);
}
const vnd = n => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
const vnDate = d => d.split("-").reverse().join("/");
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
function conditionText(p) {
  const cond = [];
  if (p.min_subtotal > 0) cond.push(`hóa đơn từ ${vnd(p.min_subtotal)}`);
  if (p.min_qty > 0) cond.push(`từ ${p.min_qty} cuốn`);
  if (p.min_tier) cond.push(`hạng ${p.min_tier} trở lên`);
  return cond.length ? cond.join(", ") : "Mọi hóa đơn";
}
function benefitText(p) {
  return p.type === "percent" ? `Giảm ${p.value}%${p.max_discount ? ` (tối đa ${vnd(p.max_discount)})` : ""}` : `Giảm ${vnd(p.value)}`;
}
function describePromotion(p) {
  const cond = conditionText(p);
  const until = p.end_date ? ` · đến ${vnDate(p.end_date)}` : "";
  return (cond === "Mọi hóa đơn" ? "Áp dụng cho mọi hóa đơn: " : "Áp dụng cho " + cond + ": ") + benefitText(p).toLowerCase() + until;
}
function promotionStatus(p, today = todayLocal()) {
  if (!p.active) return "Tạm dừng";
  if (p.start_date && today < p.start_date) return "Sắp diễn ra";
  if (p.end_date && today > p.end_date) return "Hết hạn";
  return "Đang áp dụng";
}
function bestPromotion(promos, subtotal, qty, tier, today = todayLocal()) {
  let best = null;
  for (const p of promos) {
    if (!p.active) continue;
    if (p.start_date && today < p.start_date) continue;
    if (p.end_date && today > p.end_date) continue;
    if (subtotal < p.min_subtotal || qty < p.min_qty) continue;
    if (p.min_tier && TIERS.indexOf(tier || "Thường") < TIERS.indexOf(p.min_tier)) continue;
    let amount = p.type === "percent" ? subtotal * p.value / 100 : p.value;
    if (p.max_discount) amount = Math.min(amount, p.max_discount);
    amount = Math.min(subtotal, Math.round(amount));
    if (amount > 0 && (!best || amount > best.amount)) best = { code: p.code, name: p.name, description: describePromotion(p), amount };
  }
  return best;
}
async function priceCart(customer_id, items) {
  const clean = [];
  for (const item of items) {
    const book = await get("SELECT * FROM books WHERE id=? AND active=1", [Number(item.book_id)]);
    if (!book) throw Object.assign(new Error("Có sách không tồn tại."), { status: 400 });
    const qty = Math.floor(Number(item.quantity));
    if (!Number.isInteger(qty) || qty < 1) throw Object.assign(new Error("Số lượng phải từ 1 trở lên."), { status: 400 });
    clean.push({ book, qty });
  }
  const subtotal = clean.reduce((s, x) => s + x.book.price * x.qty, 0);
  const qty = clean.reduce((s, x) => s + x.qty, 0);
  const customer = customer_id ? await get("SELECT points FROM customers WHERE id=?", [customer_id]) : null;
  const tier = tierInfo(customer?.points || 0);
  const promo = bestPromotion(await all("SELECT * FROM promotions WHERE active=1"), subtotal, qty, tier.name);
  // Ưu đãi hạng cộng dồn với 1 khuyến mãi tốt nhất: tính trên số tiền còn lại sau khuyến mãi.
  const base = subtotal - (promo ? promo.amount : 0);
  const memberAmount = Math.min(base, Math.round(base * tier.rate / 100));
  const member = memberAmount > 0 ? { tier: tier.name, rate: tier.rate, amount: memberAmount, description: `Ưu đãi thành viên hạng ${tier.name}: giảm ${tier.rate}% sau khuyến mãi, cộng dồn với chương trình khác` } : null;
  return { clean, subtotal, promotion: promo, member };
}
/* ===== Đổi / trả hàng: chỉ trong 7 ngày kể từ ngày lập hóa đơn ===== */
const RETURN_DAYS = 7;
const parseDbTime = str => new Date(String(str).replace(" ", "T") + "Z");
const invoiceReturnInfo = inv => {
  const ageMs = Date.now() - parseDbTime(inv.created_at);
  const left = Math.max(0, Math.ceil(RETURN_DAYS - ageMs / 864e5));
  return { returnable: inv.kind !== "exchange" && inv.payment_status === "Đã thanh toán" && ageMs <= RETURN_DAYS * 864e5, days_left: left };
};
const RETURN_SELECT = `SELECT r.*,i.code invoice_code,COALESCE(c.name,'Khách vãng lai') customer_name,b.code book_code,b.title book_title,
  nb.code new_code,nb.title new_title,ex.code exchange_code,ex.payment_method exchange_method
  FROM returns r JOIN invoices i ON i.id=r.invoice_id LEFT JOIN customers c ON c.id=i.customer_id JOIN books b ON b.id=r.book_id
  LEFT JOIN books nb ON nb.id=r.new_book_id LEFT JOIN invoices ex ON ex.id=r.exchange_invoice_id`;
/**
 * Trả hàng: hoàn tiền theo giá thực trả (đã trừ giảm giá) → trừ vào doanh thu.
 * Đổi hàng: so sánh giá trị sách trả với sách mới.
 *   - Sách mới đắt hơn  → lập hóa đơn đổi (loại 'exchange') cho phần chênh lệch, khách thanh toán thêm → cộng doanh thu.
 *   - Sách mới rẻ hơn   → ghi nhận chênh lệch hoàn lại cho khách → trừ doanh thu.
 */
async function performReturn({ invoice_id, book_id, quantity, type, reason, new_book_id, payment_method, code: forcedCode }) {
  const bad = (m, status = 400) => Object.assign(new Error(m), { status });
  if (!["Trả hàng", "Đổi hàng"].includes(type)) throw bad("Hình thức phải là Trả hàng hoặc Đổi hàng.");
  const qty = Math.floor(Number(quantity));
  if (!Number.isInteger(qty) || qty < 1) throw bad("Số lượng phải từ 1 trở lên.");
  const invoice = await get("SELECT * FROM invoices WHERE id=? AND kind='sale'", [invoice_id]);
  if (!invoice) throw bad("Không tìm thấy hóa đơn bán hàng.", 404);
  if (invoice.payment_status !== "Đã thanh toán") throw bad("Chỉ đổi/trả hàng với hóa đơn đã thanh toán.");
  if (!invoiceReturnInfo(invoice).returnable) throw bad(`Hóa đơn ${invoice.code} đã quá ${RETURN_DAYS} ngày kể từ ngày lập nên không thể đổi/trả.`);
  const book = await get("SELECT * FROM books WHERE id=?", [book_id]);
  const purchased = await get("SELECT SUM(quantity) quantity, MAX(unit_price) unit_price FROM invoice_items WHERE invoice_id=? AND book_id=?", [invoice.id, book_id]);
  if (!book || !purchased || !purchased.quantity) throw bad("Sách không thuộc hóa đơn này.");
  const already = await get("SELECT COALESCE(SUM(quantity),0) n FROM returns WHERE invoice_id=? AND book_id=?", [invoice.id, book_id]);
  if (qty > purchased.quantity - already.n) throw bad(`Số lượng đổi/trả vượt số lượng còn lại (còn ${purchased.quantity - already.n} cuốn).`);
  const ratio = invoice.subtotal > 0 ? invoice.total / invoice.subtotal : 1;
  const returnValue = Math.round(purchased.unit_price * qty * ratio);
  let newBook = null, newValue = 0, diff = 0, refund = returnValue;
  if (type === "Đổi hàng") {
    if (!new_book_id) throw bad("Vui lòng chọn sách muốn đổi sang.");
    newBook = await get("SELECT * FROM books WHERE id=? AND active=1", [new_book_id]);
    if (!newBook) throw bad("Sách đổi không tồn tại.");
    if (newBook.id === book.id) throw bad("Hãy chọn một sách khác với sách đang đổi.");
    if (newBook.stock < qty) throw bad(`Sách "${newBook.title}" không đủ tồn kho. Còn ${newBook.stock} cuốn.`);
    newValue = newBook.price * qty;
    diff = newValue - returnValue;
    refund = diff < 0 ? -diff : 0;
  }
  await run("BEGIN TRANSACTION");
  try {
    let exchangeId = null;
    if (diff > 0) {
      const ex = await run("INSERT INTO invoices(code,customer_id,subtotal,discount,total,payment_method,payment_status,note,kind,ref_invoice_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [code("HDD"), invoice.customer_id, diff, 0, diff, payment_method || "Tiền mặt", "Đã thanh toán",
         `Chênh lệch đổi hàng (HĐ ${invoice.code}): ${book.title} → ${newBook.title}`, "exchange", invoice.id]);
      exchangeId = ex.id;
    }
    const r = await run("INSERT INTO returns(code,invoice_id,book_id,quantity,type,refund,reason,new_book_id,new_qty,return_value,new_value,diff,exchange_invoice_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [forcedCode || code("DT"), invoice.id, book.id, qty, type, refund, reason || "", newBook ? newBook.id : null, newBook ? qty : 0, returnValue, newValue, diff, exchangeId]);
    await run("UPDATE books SET stock=stock+? WHERE id=?", [qty, book.id]);
    if (newBook) await run("UPDATE books SET stock=stock-? WHERE id=?", [qty, newBook.id]);
    if (invoice.customer_id) {
      const pts = diff > 0 ? Math.floor(diff / 10000) : -Math.floor(refund / 10000);
      if (pts) await run("UPDATE customers SET points=MAX(0,points+?) WHERE id=?", [pts, invoice.customer_id]);
      await syncTier(invoice.customer_id);
    }
    await run("COMMIT");
    return await get(RETURN_SELECT + " WHERE r.id=?", [r.id]);
  } catch (e) { await run("ROLLBACK"); throw e; }
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
    get("SELECT (SELECT COALESCE(SUM(total),0) FROM invoices WHERE payment_status='Đã thanh toán' AND date(created_at)=date('now','localtime')) - (SELECT COALESCE(SUM(refund),0) FROM returns WHERE date(created_at)=date('now','localtime')) n"),
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
  const r=await run("INSERT INTO customers(code,name,phone,email,address,points,tier) VALUES(?,?,?,?,?,?,?)",[c.code,c.name,c.phone||"",c.email||"",c.address||"",Number(c.points)||0,tierInfo(Number(c.points)||0).name]);
  res.status(201).json(await get("SELECT * FROM customers WHERE id=?",[r.id]));
}));
app.put("/api/customers/:id", asyncRoute(async(req,res)=>{
  const old=await get("SELECT * FROM customers WHERE id=?",[req.params.id]); if(!old)return notFound(res,"Khách hàng");
  const c={...old,...req.body};
  await run("UPDATE customers SET code=?,name=?,phone=?,email=?,address=?,points=?,tier=? WHERE id=?",[c.code,c.name,c.phone||"",c.email||"",c.address||"",Number(c.points)||0,tierInfo(Number(c.points)||0).name,req.params.id]);
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

app.get("/api/invoices", asyncRoute(async(req,res)=>{
  const byCustomer=req.query.customer_id?"WHERE i.customer_id=?":"";
  const rows=await all(`SELECT i.*,COALESCE(c.name,'Khách vãng lai') customer_name,ri.code ref_code FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN invoices ri ON ri.id=i.ref_invoice_id ${byCustomer} ORDER BY i.id DESC`,req.query.customer_id?[Number(req.query.customer_id)]:[]);
  res.json(rows.map(i=>({...i,...invoiceReturnInfo(i),return_days:RETURN_DAYS})));
}));
// Kiểm kê kho: ghi nhận số lượng đếm thực tế và điều chỉnh tồn kho theo kết quả.
app.post("/api/books/:id/stocktake", asyncRoute(async(req,res)=>{
  const book=await get("SELECT * FROM books WHERE id=? AND active=1",[req.params.id]); if(!book)return notFound(res,"Sách");
  const counted=Number(req.body.counted);
  if(!Number.isInteger(counted)||counted<0) throw Object.assign(new Error("Số lượng kiểm đếm phải là số nguyên từ 0 trở lên."),{status:400});
  await run("INSERT INTO stock_checks(book_id,system_qty,counted_qty,diff,note) VALUES(?,?,?,?,?)",[book.id,book.stock,counted,counted-book.stock,req.body.note||""]);
  await run("UPDATE books SET stock=? WHERE id=?",[counted,book.id]);
  res.json(await get("SELECT * FROM books WHERE id=?",[book.id]));
}));
app.get("/api/stocktakes", asyncRoute(async(req,res)=>res.json(await all(
  "SELECT s.*,b.code,b.title FROM stock_checks s JOIN books b ON b.id=s.book_id ORDER BY s.id DESC LIMIT 15"))));
app.get("/api/membership",(req,res)=>res.json([{name:"Thường",above:0,rate:0},...TIER_RULES.slice().reverse()]));
app.get("/api/promotions", asyncRoute(async(req,res)=>{
  const rows=await all("SELECT p.*,COALESCE(u.n,0) used_count,COALESCE(u.amt,0) used_amount FROM promotions p LEFT JOIN (SELECT promotion_code,COUNT(*) n,SUM(promotion_amount) amt FROM invoices WHERE payment_status='Đã thanh toán' AND promotion_code IS NOT NULL GROUP BY promotion_code) u ON u.promotion_code=p.code ORDER BY p.id");
  res.json(rows.map(p=>({...p,description:describePromotion(p),condition:conditionText(p),benefit:benefitText(p),status:promotionStatus(p)})));
}));
app.post("/api/invoices/preview", asyncRoute(async(req,res)=>{
  const {customer_id,items}=req.body;
  if(!Array.isArray(items)||!items.length) return res.json({subtotal:0,promotion:null,member:null});
  const {subtotal,promotion,member}=await priceCart(customer_id||null,items);
  res.json({subtotal,promotion,member});
}));
app.post("/api/invoices", asyncRoute(async(req,res)=>{
  const {customer_id,items,payment_method,note}=req.body;
  if(!Array.isArray(items)||!items.length) throw Object.assign(new Error("Hóa đơn phải có ít nhất một đầu sách."),{status:400});
  const {clean,subtotal,promotion,member}=await priceCart(customer_id||null,items);
  for(const {book,qty} of clean)
    if(book.stock<qty) throw Object.assign(new Error(`Sách "${book.title}" không đủ tồn kho. Còn ${book.stock} cuốn.`),{status:400});
  // Giảm giá hoàn toàn tự động: máy chủ chọn 1 khuyến mãi tốt nhất, không nhận số tiền giảm từ giao diện.
  const promoAmount=promotion?promotion.amount:0;
  const memberAmount=member?member.amount:0;
  const disc=promoAmount+memberAmount;
  const total=subtotal-disc;
  await run("BEGIN TRANSACTION");
  try {
    const invCode=code("HD");
    const ir=await run("INSERT INTO invoices(code,customer_id,subtotal,discount,total,payment_method,payment_status,note,promotion_code,promotion_name,promotion_desc,promotion_amount,member_tier,member_rate,member_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [invCode,customer_id||null,subtotal,disc,total,payment_method||"Tiền mặt","Đã thanh toán",note||"",promotion?.code||null,promotion?.name||null,promotion?.description||null,promoAmount,member?.tier||null,member?.rate||0,memberAmount]);
    for(const x of clean){
      await run("INSERT INTO invoice_items(invoice_id,book_id,quantity,unit_price) VALUES(?,?,?,?)",[ir.id,x.book.id,x.qty,x.book.price]);
      await run("UPDATE books SET stock=stock-? WHERE id=?",[x.qty,x.book.id]);
    }
    if(customer_id){ await run("UPDATE customers SET points=points+? WHERE id=?",[Math.floor(total/10000),customer_id]); await syncTier(customer_id); }
    await run("COMMIT");
    res.status(201).json(await get("SELECT * FROM invoices WHERE id=?",[ir.id]));
  } catch(e){ await run("ROLLBACK"); throw e; }
}));

app.get("/api/invoices/:id", asyncRoute(async(req,res)=>{
  const invoice=await get("SELECT i.*,COALESCE(c.name,'Khách vãng lai') customer_name FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=?",[req.params.id]);
  if(!invoice)return notFound(res,"Hóa đơn");
  invoice.items=await all("SELECT ii.*,b.code,b.title FROM invoice_items ii JOIN books b ON b.id=ii.book_id WHERE ii.invoice_id=?",[req.params.id]);
  invoice.returns=await all(RETURN_SELECT+" WHERE r.invoice_id=? ORDER BY r.id",[req.params.id]);
  if(invoice.ref_invoice_id) invoice.ref_code=(await get("SELECT code FROM invoices WHERE id=?",[invoice.ref_invoice_id]))?.code;
  Object.assign(invoice,invoiceReturnInfo(invoice));
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

app.get("/api/returns", asyncRoute(async(req,res)=>res.json(await all(RETURN_SELECT+" ORDER BY r.id DESC"))));
app.post("/api/returns", asyncRoute(async(req,res)=>res.status(201).json(await performReturn(req.body))));

app.get("/api/reports/summary", asyncRoute(async(req,res)=>{
  const from=req.query.from||"2000-01-01", to=req.query.to||"2999-12-31";
  const rng=[from,to];
  const [sale,exch,refunds,top,stock,monthly,statusCounts,rs,sold,topReturned,recentReturns]=await Promise.all([
    get("SELECT COUNT(*) invoices,COALESCE(SUM(total),0) gross,COALESCE(SUM(discount),0) discounts FROM invoices WHERE kind='sale' AND payment_status='Đã thanh toán' AND date(created_at) BETWEEN date(?) AND date(?)",rng),
    get("SELECT COUNT(*) n,COALESCE(SUM(total),0) total FROM invoices WHERE kind='exchange' AND payment_status='Đã thanh toán' AND date(created_at) BETWEEN date(?) AND date(?)",rng),
    get("SELECT COALESCE(SUM(refund),0) total FROM returns WHERE date(created_at) BETWEEN date(?) AND date(?)",rng),
    all("SELECT b.code,b.title,SUM(ii.quantity) quantity,ROUND(SUM(ii.quantity*ii.unit_price),2) revenue FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN books b ON b.id=ii.book_id WHERE i.kind='sale' AND i.payment_status='Đã thanh toán' AND date(i.created_at) BETWEEN date(?) AND date(?) GROUP BY b.id,b.code,b.title ORDER BY quantity DESC,revenue DESC,b.title ASC LIMIT 10",rng),
    all("SELECT code,title,stock,min_stock,cost_price,stock*cost_price stock_value FROM books WHERE active=1 ORDER BY stock ASC"),
    all("SELECT month,SUM(amount) revenue FROM (SELECT strftime('%Y-%m',created_at) month,total amount FROM invoices WHERE payment_status='Đã thanh toán' AND date(created_at) BETWEEN date(?) AND date(?) UNION ALL SELECT strftime('%Y-%m',created_at),-refund FROM returns WHERE date(created_at) BETWEEN date(?) AND date(?)) GROUP BY month ORDER BY month",[from,to,from,to]),
    all("SELECT payment_status,COUNT(*) count FROM invoices WHERE kind='sale' AND date(created_at) BETWEEN date(?) AND date(?) GROUP BY payment_status",rng),
    get(`SELECT COALESCE(SUM(CASE WHEN type='Trả hàng' THEN 1 ELSE 0 END),0) return_count,COALESCE(SUM(CASE WHEN type='Đổi hàng' THEN 1 ELSE 0 END),0) exchange_count,
      COALESCE(SUM(quantity),0) quantity,COALESCE(SUM(CASE WHEN type='Trả hàng' THEN refund ELSE 0 END),0) return_refunds,
      COALESCE(SUM(CASE WHEN diff>0 THEN diff ELSE 0 END),0) exchange_collected,COALESCE(SUM(CASE WHEN diff<0 THEN -diff ELSE 0 END),0) exchange_refunded
      FROM returns WHERE date(created_at) BETWEEN date(?) AND date(?)`,rng),
    get("SELECT COALESCE(SUM(ii.quantity),0) n FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.kind='sale' AND i.payment_status='Đã thanh toán' AND date(i.created_at) BETWEEN date(?) AND date(?)",rng),
    all("SELECT b.code,b.title,SUM(r.quantity) quantity,COUNT(*) times,COALESCE(SUM(r.refund),0) refund FROM returns r JOIN books b ON b.id=r.book_id WHERE date(r.created_at) BETWEEN date(?) AND date(?) GROUP BY b.id,b.code,b.title ORDER BY quantity DESC,times DESC LIMIT 5",rng),
    all(RETURN_SELECT+" WHERE date(r.created_at) BETWEEN date(?) AND date(?) ORDER BY r.id DESC LIMIT 10",rng)
  ]);
  // Doanh thu thuần = hóa đơn bán (đã thanh toán) + hóa đơn chênh lệch đổi hàng − tiền hoàn trả/hoàn chênh lệch
  const sales={invoices:sale.invoices,discounts:sale.discounts,gross_revenue:sale.gross,exchange_revenue:exch.total,refunds:refunds.total,revenue:sale.gross+exch.total-refunds.total};
  const returnStats={...rs,sold_quantity:sold.n,rate:sold.n?rs.quantity/sold.n:0,net_effect:exch.total-refunds.total};
  res.json({sales,top,stock,monthly,statusCounts,returnStats,topReturned,recentReturns});
}));

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"..","frontend","index.html")));
app.use((err,req,res,next)=>{
  console.error(err);
  if(err.code==="SQLITE_CONSTRAINT") return res.status(409).json({error:"Dữ liệu bị trùng hoặc vi phạm ràng buộc. Hãy kiểm tra mã và thông tin liên quan."});
  res.status(err.status||500).json({error:err.message||"Lỗi máy chủ."});
});

initDb().then(async()=>{
  for (const c of await all("SELECT id FROM customers")) await syncTier(c.id); // đồng bộ hạng theo điểm cho dữ liệu cũ
  
  app.listen(PORT,()=>console.log(`Bookstore Management đang chạy tại http://localhost:${PORT}`));
}).catch(err=>{console.error("Không thể khởi tạo cơ sở dữ liệu:",err);process.exit(1);});