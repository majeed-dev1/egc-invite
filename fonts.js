"use strict";

// خط البكسل Handjet يظهر في بعض متصفحات الجوال بحروف عربية مفصولة غير متصلة.
// هذا الملف يقيس ذلك على جهاز الزائر: لو كان عرض «ببب» يساوي ثلاثة أضعاف «ب» فالحروف لم تتصل،
// فيضيف الصنف safe-font على <html> ليستبدل style.css خط البكسل بخط عربي يتصل دائماً.
(() => {
  const KEY = "safe-font";
  const root = document.documentElement;

  // نتيجة الزيارة السابقة تُطبَّق فوراً حتى لا يظهر الخط المفكك ثم يتبدل.
  try {
    if (sessionStorage.getItem(KEY) === "1") root.classList.add(KEY);
  } catch (error) {}

  function lettersJoin() {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:700 40px Handjet";
    document.body.append(probe);
    const width = text => {
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    };
    const joined = Math.abs(width("ببب") - width("ب") * 3) > 2;
    probe.remove();
    return joined;
  }

  async function check() {
    if (!document.fonts) return;
    try {
      await document.fonts.load('700 40px "Handjet"', "ب");
    } catch (error) {
      return;
    }
    // الخط لم يُحمَّل (بلا إنترنت مثلاً): المتصفح يستخدم خط النظام أصلاً، فلا حاجة للفحص.
    if (!document.fonts.check('700 40px "Handjet"', "ب")) return;

    const safe = !lettersJoin();
    try {
      sessionStorage.setItem(KEY, safe ? "1" : "0");
    } catch (error) {}
    if (safe !== root.classList.contains(KEY)) {
      root.classList.toggle(KEY, safe);
      // مقاسات النص تتغير مع الخط، فتُعاد حسابات المشهد.
      window.dispatchEvent(new Event("resize"));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", check);
  else check();
})();
