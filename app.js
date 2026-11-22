(() => {
const $=id=>document.getElementById(id);
const cfg=window.ARAZ_FIREBASE_CONFIG;
const isConfigured=cfg&&cfg.apiKey&&cfg.apiKey!=="YOUR_API_KEY";
const params=new URLSearchParams(location.search), videoId=params.get("v");
let auth,db,storage,lastQrCanvas=null;
function status(id,msg){$(id).textContent=msg}
function show(id,on){$(id).classList.toggle("hidden",!on)}
function niceDate(d){return new Intl.DateTimeFormat("fa-IR",{dateStyle:"long",timeStyle:"short"}).format(d)}
if(!isConfigured){status("loginStatus","برای فعال‌شدن سامانه، فایل firebase-config.js را با تنظیمات پروژه Firebase خود تکمیل کنید. راهنما در README.md است.");}
else{
 firebase.initializeApp(cfg);auth=firebase.auth();db=firebase.firestore();storage=firebase.storage();
 auth.onAuthStateChanged(user=>{show("loginCard",!user&&!videoId);show("uploadCard",!!user&&!videoId);});
}
if(videoId){show("loginCard",false);show("uploadCard",false);show("watchCard",true);loadVideo(videoId);}
$("loginBtn").onclick=async()=>{if(!isConfigured)return;try{await auth.signInWithEmailAndPassword($("email").value.trim(),$("password").value);status("loginStatus","ورود موفق بود.");}catch(e){status("loginStatus","ورود انجام نشد: "+e.message)}};
$("logoutBtn").onclick=()=>auth.signOut();
$("uploadBtn").onclick=upload;
async function upload(){
 const file=$("videoFile").files[0];if(!file){status("uploadStatus","لطفاً یک فایل ویدیویی انتخاب کنید.");return;}
 if(!file.type.startsWith("video/")){status("uploadStatus","فایل انتخاب‌شده ویدیو نیست.");return;}
 if(file.size>500*1024*1024){status("uploadStatus","حداکثر حجم فعلی هر ویدیو ۵۰۰ مگابایت است.");return;}
 if(!auth.currentUser){status("uploadStatus","ابتدا وارد حساب مدیر شوید.");return;}
 $("uploadBtn").disabled=true;show("qrResult",false);
 try{
  const doc=db.collection("videos").doc(),id=doc.id,ref=storage.ref("videos/"+id+"/"+file.name);
  status("uploadStatus","در حال آپلود ویدیو… لطفاً صفحه را نبندید.");
  const task=ref.put(file,{contentType:file.type});
  task.on("state_changed",s=>status("uploadStatus","در حال آپلود: "+Math.round(s.bytesTransferred/s.totalBytes*100)+"٪"),e=>status("uploadStatus","خطای آپلود: "+e.message),async()=>{
   const url=await task.snapshot.ref.getDownloadURL(),days=$("expiry").value;
   const expiresAt=days==="forever"?null:firebase.firestore.Timestamp.fromDate(new Date(Date.now()+Number(days)*86400000));
   await doc.set({downloadURL:url,description:$("description").value.trim(),fileName:file.name,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expiresAt,ownerUid:auth.currentUser.uid});
   const share=location.origin+location.pathname+"?v="+id;
   $("shareUrl").value=share;$("qr").innerHTML="";
   new QRCode($("qr"),{text:share,width:256,height:256,colorDark:"#102b50",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
   setTimeout(()=>{lastQrCanvas=$("qr").querySelector("canvas");if(!lastQrCanvas){const im=$("qr").querySelector("img");if(im){const c=document.createElement("canvas");c.width=c.height=256;const x=c.getContext("2d");x.drawImage(im,0,0);lastQrCanvas=c;}}},250);
   $("expiryText").textContent=days==="forever"?"این پیوند تاریخ انقضا ندارد و همیشه فعال می‌ماند.":"اعتبار QR تا "+niceDate(new Date(Date.now()+Number(days)*86400000))+" است.";
   show("qrResult",true);status("uploadStatus","ویدیو با موفقیت ذخیره شد و QR Code ساخته شد.");
  });
 }catch(e){status("uploadStatus","خطا: "+e.message)}
 finally{$("uploadBtn").disabled=false}
}
$("downloadQr").onclick=()=>{const canvas=$("qr").querySelector("canvas");if(canvas){const a=document.createElement("a");a.download="Araz-Media-QR.png";a.href=canvas.toDataURL("image/png");a.click();return;}const img=$("qr").querySelector("img");if(img){const a=document.createElement("a");a.download="Araz-Media-QR.png";a.href=img.src;a.click();}};
async function loadVideo(id){
 if(!isConfigured){status("watchStatus","سامانه هنوز به Firebase متصل نشده است.");return;}
 try{
  const snap=await db.collection("videos").doc(id).get();
  if(!snap.exists){status("watchStatus","این ویدیو پیدا نشد یا حذف شده است.");return;}
  const data=snap.data();
  if(data.expiresAt&&data.expiresAt.toDate()<=new Date()){status("watchStatus","مهلت این QR Code به پایان رسیده است.");return;}
  $("player").src=data.downloadURL;$("watchDescription").textContent=data.description||"";$("watchTitle").textContent=data.fileName||"ویدیو";
 }catch(e){status("watchStatus","بارگذاری ویدیو ممکن نشد: "+e.message)}
}
})();