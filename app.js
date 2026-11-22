(() => {
"use strict";
const $ = id => document.getElementById(id);
const cfg = window.ARAZ_FIREBASE_CONFIG;
const adminEmail = String(window.ARAZ_ADMIN_EMAIL || "").trim().toLowerCase();
const configured = !!(cfg && cfg.apiKey && cfg.projectId && cfg.appId &&
  cfg.apiKey !== "YOUR_API_KEY" && cfg.projectId !== "YOUR_PROJECT_ID" &&
  adminEmail && adminEmail !== "admin@example.com");
const params = new URLSearchParams(location.search);
const mediaId = params.get("v");
let auth, db, storage, qrReady = false;

function setStatus(id, message) { $(id).textContent = message; }
function show(id, visible) { $(id).classList.toggle("hidden", !visible); }
function faDate(date) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeStyle: "short" }).format(date);
}
function clearPlayers() {
  for (const id of ["videoPlayer", "audioPlayer"]) {
    const player = $(id);
    player.pause();
    player.removeAttribute("src");
    player.load();
    show(id, false);
  }
}
function friendlyError(error) {
  const code = error && error.code ? error.code : "";
  const messages = {
    "auth/invalid-login-credentials": "ایمیل یا رمز عبور درست نیست.",
    "auth/invalid-credential": "ایمیل یا رمز عبور درست نیست.",
    "auth/too-many-requests": "تلاش‌های ورود زیاد بوده است؛ کمی بعد دوباره امتحان کنید.",
    "storage/unauthorized": "دسترسی آپلود مجاز نیست. قوانین Storage و ایمیل مدیر را بررسی کنید.",
    "storage/quota-exceeded": "سهمیه یا فضای ذخیره‌سازی پر شده است.",
    "storage/canceled": "آپلود لغو شد."
  };
  return messages[code] || (error && error.message) || "خطای نامشخص";
}

if (mediaId) {
  show("loginCard", false);
  show("uploadCard", false);
  show("watchCard", true);
}
if (!configured) {
  show("loginCard", !mediaId);
  setStatus("loginStatus", "سامانه هنوز به Firebase متصل نشده است. فایل firebase-config.js و ایمیل مدیر باید تنظیم شوند؛ راهنمای راه‌اندازی در README مخزن قرار دارد.");
  if (mediaId) setStatus("watchStatus", "این سایت هنوز به پایگاه داده و فضای ذخیره‌سازی Firebase متصل نشده است.");
} else {
  firebase.initializeApp(cfg);
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  auth.onAuthStateChanged(user => {
    if (mediaId) return;
    const isAdmin = !!(user && user.email && user.email.toLowerCase() === adminEmail);
    show("loginCard", !isAdmin);
    show("uploadCard", isAdmin);
    if (user && !isAdmin) {
      auth.signOut();
      setStatus("loginStatus", "این حساب اجازه آپلود ندارد. فقط حساب مدیر مجاز است.");
    } else if (isAdmin) {
      setStatus("loginStatus", "ورود مدیر موفق بود.");
    }
  });
}

$("loginBtn").addEventListener("click", async () => {
  if (!configured) return;
  const email = $("email").value.trim().toLowerCase();
  const password = $("password").value;
  if (email !== adminEmail) {
    setStatus("loginStatus", "این ایمیل، ایمیل مدیر سامانه نیست.");
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    setStatus("loginStatus", "ورود موفق بود.");
  } catch (error) {
    setStatus("loginStatus", "ورود انجام نشد: " + friendlyError(error));
  }
});
$("logoutBtn").addEventListener("click", () => auth.signOut());
$("uploadBtn").addEventListener("click", uploadMedia);
$("downloadQr").addEventListener("click", downloadQr);

async function uploadMedia() {
  const file = $("mediaFile").files[0];
  if (!file) { setStatus("uploadStatus", "لطفاً یک فایل صوتی یا ویدیویی انتخاب کنید."); return; }
  const mediaType = file.type.startsWith("video/") ? "video" :
                    file.type.startsWith("audio/") ? "audio" : "";
  if (!mediaType) { setStatus("uploadStatus", "فقط فایل‌های صوتی یا ویدیویی پذیرفته می‌شوند."); return; }
  if (file.size > 500 * 1024 * 1024) { setStatus("uploadStatus", "حداکثر حجم هر فایل ۵۰۰ مگابایت است."); return; }
  if (!auth || !auth.currentUser || auth.currentUser.email.toLowerCase() !== adminEmail) {
    setStatus("uploadStatus", "ابتدا با حساب مدیر وارد شوید."); return;
  }

  const button = $("uploadBtn");
  const progress = $("uploadProgress");
  button.disabled = true;
  progress.value = 0;
  show("uploadProgress", true);
  show("qrResult", false);
  let fileRef = null;

  try {
    const doc = db.collection("videos").doc();
    const id = doc.id;
    fileRef = storage.ref("media/" + id + "/" + file.name);
    setStatus("uploadStatus", "در حال آماده‌سازی آپلود…");

    const task = fileRef.put(file, { contentType: file.type || (mediaType + "/octet-stream") });
    await new Promise((resolve, reject) => {
      task.on("state_changed",
        snapshot => {
          const percent = snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0;
          progress.value = percent;
          setStatus("uploadStatus", "در حال آپلود فایل: " + percent + "٪");
        },
        reject,
        resolve
      );
    });

    const downloadURL = await task.snapshot.ref.getDownloadURL();
    const days = $("expiry").value;
    const expiresAt = days === "forever" ? null :
      firebase.firestore.Timestamp.fromDate(new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000));

    await doc.set({
      downloadURL,
      storagePath: "media/" + id + "/" + file.name,
      fileName: file.name,
      mediaType,
      description: $("description").value.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      ownerUid: auth.currentUser.uid
    });

    const shareUrl = location.origin + location.pathname + "?v=" + id;
    $("shareUrl").value = shareUrl;
    $("qr").innerHTML = "";
    if (typeof QRCode === "undefined") throw new Error("کتابخانه ساخت QR بارگذاری نشد. صفحه را دوباره باز کنید.");
    new QRCode($("qr"), {
      text: shareUrl, width: 280, height: 280,
      colorDark: "#102b50", colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    qrReady = !!$("qr").querySelector("canvas, img");
    if (!qrReady) throw new Error("ساخت QR Code ناموفق بود. اتصال اینترنت را بررسی کنید.");

    $("expiryText").textContent = days === "forever"
      ? "این QR Code تاریخ انقضا ندارد و همیشه فعال می‌ماند."
      : "این QR Code تا " + faDate(new Date(Date.now() + Number(days) * 86400000)) + " فعال است.";
    show("qrResult", true);
    setStatus("uploadStatus", "فایل با موفقیت ذخیره شد. QR Code آماده اسکن و ذخیره است.");
    progress.value = 100;
  } catch (error) {
    if (fileRef) {
      try { await fileRef.delete(); } catch (_) {}
    }
    setStatus("uploadStatus", "عملیات کامل نشد: " + friendlyError(error));
  } finally {
    button.disabled = false;
  }
}

function downloadQr() {
  const canvas = $("qr").querySelector("canvas");
  const img = $("qr").querySelector("img");
  let dataUrl = "";
  if (canvas) dataUrl = canvas.toDataURL("image/png");
  else if (img && img.src.startsWith("data:")) dataUrl = img.src;
  if (!dataUrl) { setStatus("uploadStatus", "QR Code هنوز آماده ذخیره نیست."); return; }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "Araz-Media-QR.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function loadMedia(id) {
  if (!configured) return;
  try {
    const snapshot = await db.collection("videos").doc(id).get();
    if (!snapshot.exists) { setStatus("watchStatus", "این فایل پیدا نشد یا حذف شده است."); return; }
    const data = snapshot.data();
    if (data.expiresAt && data.expiresAt.toDate() <= new Date()) {
      setStatus("watchStatus", "اعتبار این QR Code به پایان رسیده است.");
      return;
    }
    if (!data.downloadURL) { setStatus("watchStatus", "نشانی فایل در دسترس نیست."); return; }
    $("watchTitle").textContent = data.fileName || "رسانه";
    $("watchDescription").textContent = data.description || "";
    clearPlayers();
    if (data.mediaType === "audio" || (!data.mediaType && /^audio\//.test(data.contentType || ""))) {
      $("audioPlayer").src = data.downloadURL;
      show("audioPlayer", true);
    } else {
      $("videoPlayer").src = data.downloadURL;
      show("videoPlayer", true);
    }
  } catch (error) {
    setStatus("watchStatus", "نمایش فایل ممکن نشد: " + friendlyError(error));
  }
}
if (mediaId) loadMedia(mediaId);
})();