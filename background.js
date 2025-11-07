// background.js (debug-friendly)
const DEFAULT_LOAD_TIMEOUT = 25000;
const AFTER_INJECT_WAIT = 1200;
const CLOSE_TAB_TIMEOUT = 30000;

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: "window.html",
    type: "popup",
    width: 510,
    height: 560
  });
});

// استقبال أوامر من الواجهة
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "open_and_send") {
    openAndSend(msg.url, msg.phone, msg.name, msg.templateText).catch(e => console.error(e));
    sendResponse({ ok: true });
  }
  // لا تنسَ return true إذا كنت سترد لاحقاً - لكن هنا نرد فوراً
});

// دالة رئيسية بتحقن contentScript ثم ترسل الرسالة
async function openAndSend(url, phone, name, templateText = "") {
  const messageId = 'mid_' + Date.now() + '_' + Math.floor(Math.random()*10000);
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false });
  } catch (err) {
    console.error("فتح التبويب فشل:", err);
    return;
  }
  const tabId = tab.id;

  // انتظر اكتمال تحميل الصفحة أو مرور المهلة
  const ready = await waitForTabComplete(tabId, DEFAULT_LOAD_TIMEOUT);
  console.log("Tab ready:", ready, " URL:", tab.url);

  // حاول حقن contentScript.js ديناميكياً
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] });
    console.log("contentScript injected");
  } catch (e) {
    console.warn("حقن contentScript فشل:", e);
    // سنحاول على أي حال الاستدعاء fallback لاحقاً
  }

  // انتظر قليلاً بعد الحقن
  await sleep(AFTER_INJECT_WAIT);

  // أرسل رسالة وانتبه لوجود lastError في callback
  chrome.tabs.sendMessage(tabId, {
    action: "send_whatsapp",
    phone,
    text: templateText.replace('{{name}}', name),
    messageId
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("sendMessage lastError:", chrome.runtime.lastError.message);
      // إذا فشل الإرسال (Receiving end does not exist) نفذ fallback مباشر داخل الصفحة
      fallbackInjectAndSend(tabId, templateText.replace('{{name}}', name), messageId);
      return;
    }
    console.log("sendMessage response:", response);
    // الأفتراض: الـ contentScript سيقوم بإرسال رسالة 'sent' لاحقاً لإغلاق التبويب
    // وضع مهلة احتياطية لإغلاق التبويب
    setTimeout(() => {
      try { chrome.tabs.remove(tabId); } catch(e) {}
    }, CLOSE_TAB_TIMEOUT);
  });
}

// fallback: تنفيذ دالة داخل صفحة التبويب لإدخال النص بالـ DOM مباشرة
async function fallbackInjectAndSend(tabId, text, messageId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msgText, mid) => {
        const selectors = [
          'div[contenteditable="true"][data-tab="10"]',
          'div[contenteditable="true"][data-tab="6"]',
          'div[contenteditable="true"]'
        ];
        function findInput(){
          for(const s of selectors){
            const el = document.querySelector(s);
            if(el) return el;
          }
          return null;
        }
        const input = findInput();
        if(!input){
          console.warn("Fallback: input not found");
          try{ chrome.runtime.sendMessage({ action: 'sent', messageId: mid }); }catch(e){}
          return;
        }
        input.focus();
        document.execCommand('insertText', false, msgText);
        input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
        try{ chrome.runtime.sendMessage({ action: 'sent', messageId: mid }); }catch(e){}
      },
      args: [text, messageId]
    });
  } catch (err) {
    console.error("fallbackInjectAndSend error:", err);
  } finally {
    // غلق تبويب احتياطي
    setTimeout(() => { try{ chrome.tabs.remove(tabId);}catch(e){} }, CLOSE_TAB_TIMEOUT);
  }
}

// انتظار اكتمال التبويب
function waitForTabComplete(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check(){
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) { resolve(false); return; }
        if (tab.status === 'complete' || (Date.now() - start) > timeout) { resolve(tab.status === 'complete'); return; }
        setTimeout(check, 500);
      });
    })();
  });
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
