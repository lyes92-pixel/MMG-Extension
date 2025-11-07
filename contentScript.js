// contentScript.js
// ================================================
// 📱 هذا السكربت يعمل داخل صفحة web.whatsapp.com
// هدفه: انتظار أمر background لإرسال الرسالة
// ================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== 'send_whatsapp') return;

  const text = msg.text || '';
  const messageId = msg.messageId || ('mid_' + Date.now());

  // دالة انتظار العنصر
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const intervalMs = 300;
      let elapsed = 0;
      const timer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
        } else {
          elapsed += intervalMs;
          if (elapsed >= timeout) {
            clearInterval(timer);
            reject(new Error('⏰ انتهى الوقت ولم يظهر العنصر: ' + selector));
          }
        }
      }, intervalMs);
    });
  }

  (async () => {
    try {
      const selectors = [
        'div[contenteditable="true"][data-tab="10"]',
        'div[contenteditable="true"][data-tab="6"]',
        'div[contenteditable="true"]'
      ];
      let inputBox = null;
      for (const sel of selectors) {
        try {
          inputBox = await waitForElement(sel, 7000);
          if (inputBox) break;
        } catch (_) {}
      }

      if (!inputBox) throw new Error('لم يتم العثور على مربع الإدخال في الصفحة.');

      // Focus + إدخال النص
      inputBox.focus();
      document.execCommand('insertText', false, text);

      // إرسال Enter
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      inputBox.dispatchEvent(enterEvent);

      // إعلام background بنجاح الإرسال
      chrome.runtime.sendMessage({ action: 'sent', messageId });

      sendResponse({ ok: true });
    } catch (err) {
      console.error('❌ خطأ أثناء إرسال الرسالة:', err);
      chrome.runtime.sendMessage({ action: 'sent', messageId });
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true; // للسماح بـ sendResponse async
});
