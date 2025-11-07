/* popup.js
   واجهة المستخدم: تسجيل دخول المستشار → جلب الطلاب → Templates حسب الدور → معاينة الرسالة
   UI بالفرنسية، التعليقات بالعربية
*/

const MASTER_ID = "1TFqodTUYMSAZfu4lO8BaXou2hN6ZDkMCxO8L2TA-NvE"; // ID Master Sheet
const USER_SHEET = "Users"; // اسم الورقة في Master
const API_KEY = "AIzaSyAwPGFOeh4_zdw9mjO6_c_5mxP7MUO8g9E";

let User_Url = "";
let students = [];
let templates = [];
let FoundUser = null;

// عناصر واجهة المستخدم
const statusEl = document.getElementById("status");
const emailInput = document.getElementById("UserEmail");
const studentSelect = document.getElementById("studentSelect");
const templateSelect = document.getElementById("templateSelect");
const messageBox = document.getElementById("messageBox");

// 🔹 زر تسجيل الدخول
document.getElementById("Login").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) { alert("⚠️ الرجاء إدخال البريد الإلكتروني"); return; }
  statusEl.textContent = "⏳ Vérification en cours...";

  const masterUrl = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_ID}/values/${USER_SHEET}!A:E?key=${API_KEY}`;

  try {
    const resp = await fetch(masterUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    if (!data.values || data.values.length < 2) throw new Error("Master sheet vide");

    const rows = data.values.slice(1);
    const Users = rows.map(r => ({
      Name: r[0] || "",
      phone: r[1] || "",
      Mail: (r[2] || "").toLowerCase(),
      Fonction: r[3] || "",
      Link: r[4] || ""
    }));

    FoundUser = Users.find(u => u.Mail === email.toLowerCase());
    if (!FoundUser) { statusEl.textContent = "❌ البريد غير مسجل"; return; }

    if (!FoundUser.Link || !/^[a-zA-Z0-9\-_]{20,}$/.test(FoundUser.Link)) {
      statusEl.textContent = "❌ رابط شيت المستخدم غير صالح"; return;
    }

    statusEl.textContent = `✅ أهلاً ${FoundUser.Name}, جاري تحميل قائمة المتدربين...`;
    User_Url = `https://sheets.googleapis.com/v4/spreadsheets/${FoundUser.Link}/values/${FoundUser.Fonction}!A:D?key=${API_KEY}`;

    // تحميل الطلاب والقوالب
    await Promise.all([loadStudents(), loadTemplates()]);

  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ حدث خطأ أثناء تسجيل الدخول";
  }
});

// 🔹 جلب الطلاب من شيت المستخدم
async function loadStudents() {
  try {
    const res = await fetch(User_Url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.values || data.values.length < 2) throw new Error("Sheet vide");

    const rows = data.values.slice(1);
    students = rows.map((r, i) => ({
      name: r[0] || `بدون اسم ${i+1}`,
      phone: r[1] || "بدون رقم",
      status: r[2] || "غير محدد",
      template: r[3] || ""
    }));

    studentSelect.innerHTML = `<option value="">اختر الاسم</option>` + students.map((s, i) =>
      `<option value="${i}">${s.name} (${s.phone})</option>`).join("");

    statusEl.textContent = `✅ تم تحميل ${students.length} متدرب/ـة`;

    // عند اختيار متدرب، يظهر القالب مع استبدال {{name}}
    studentSelect.onchange = (e) => {
      const s = students[e.target.value];
      if (!s) return;
      const tplText = templateSelect.value || s.template || "";
      messageBox.value = tplText.replace(/{{name}}/gi, s.name);
    };

  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ خطأ أثناء تحميل المتدربين";
  }
}

// 🔹 جلب Templates من شيت خاص بالقوالب حسب الدور
async function loadTemplates() {
  try {
    const role = FoundUser.Fonction;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_ID}/values/Templates!A:C?key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const rows = data.values || [];
    templates = rows.filter((r,i) => i>0 && r[0] === role).map(r => ({ name: r[1], text: r[2] }));

    templateSelect.innerHTML = '<option value="">اختر نموذجًا...</option>';
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.text;
      opt.innerText = t.name;
      templateSelect.appendChild(opt);
    });

    // عند اختيار قالب، نعرضه في مربع الرسالة
    templateSelect.onchange = () => {
      const sIndex = studentSelect.value;
      const s = students[sIndex] || {};
      const tpl = templateSelect.value || "";
      messageBox.value = tpl.replace(/{{name}}/gi, s.name || "");
    };

  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ خطأ أثناء تحميل Templates";
  }
}
document.getElementById("sendBtn").addEventListener("click", () => {
  const sIndex = studentSelect.value;
  if (!sIndex) {
    alert("❗ يرجى اختيار متدرب أولاً");
    return;
  }

  const s = students[sIndex];
  const phone = s.phone.replace(/\D/g, ""); // حذف الرموز
  const message = messageBox.value.trim();

  if (!phone || phone.length < 8) {
    alert("📵 رقم الهاتف غير صالح");
    return;
  }

  if (!message) {
    alert("✍️ أدخل نص الرسالة أولاً");
    return;
  }

  // ✅ إنشاء رابط واتساب بطريقة صحيحة (باستخدام backticks)
  const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

  // 📤 إرسال الطلب لخلفية الإضافة
  chrome.runtime.sendMessage({
    action: "open_and_send",
    url: waUrl,
    phone: phone,
    name: s.name
  });

  // 🎬 المؤقت بعد الإرسال
  const timerBox = document.getElementById("timerBox");
  const timerCircle = document.getElementById("timerCircle");

  timerBox.style.display = "block";
  statusEl.textContent = "⏳ جاري الإرسال...";

  let seconds = 20;
  timerCircle.textContent = seconds;

  const countdown = setInterval(() => {
    seconds--;
    timerCircle.textContent = seconds;

    if (seconds <= 0) {
      clearInterval(countdown);
      timerBox.style.display = "none";
      statusEl.textContent = "✅ الرسالة أرسلت لـ ${s.name} ";
      studentSelect.selectedIndex = 0;
      templateSelect.selectedIndex = 0;
      messageBox.value = "";
    }
  }, 2000);
    

});
