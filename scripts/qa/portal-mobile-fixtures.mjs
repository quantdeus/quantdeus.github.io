import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = "/tmp/quantdeus-portal-mobile";
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ["assets", "forum", "store"]) fs.mkdirSync(path.join(out, dir), { recursive: true });
fs.copyFileSync(path.join(root, "assets/qd-portal.css"), path.join(out, "assets/qd-portal.css"));

const stripTelegram = html => html.replace(/\s*<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/, "");

const forumStub = `
<script>
window.Telegram={WebApp:{initData:"mobile-qa",ready(){},expand(){}}};
window.prompt=()=>"Mobile QA reason";
const qdForumThreads=[
  {number:9001,title:"Portal mobile review",body:"Проверяем карточку темы, длинный текст и переносы на узком Android viewport.",category:"community",created_at:"2026-10-01T10:00:00Z",updated_at:"2026-10-01T12:00:00Z",comments:3,state:"open",pinned:true,hidden:false},
  {number:9002,title:"Warp research status",body:"Вторая тема нужна для проверки одноколоночной сетки и вертикального скролла.",category:"space",created_at:"2026-10-01T09:00:00Z",updated_at:"2026-10-01T11:00:00Z",comments:1,state:"open",pinned:false,hidden:false}
];
window.fetch=async (url,options={})=>{
  const u=String(url);
  const send=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}}));
  if(u.includes("?me=1")) return send({ok:true,role:"moderator"});
  if(u.includes("?reports=1")) return send({ok:true,reports:[{thread_id:9002,title:"Warp research status",comment:{body:"**Жалоба участника**\\n\\nMobile QA sample report"}}]});
  if(u.includes("?moderation=1")) return send({ok:true,threads:qdForumThreads});
  if((options.method||"GET")==="GET") return send({ok:true,threads:qdForumThreads});
  return send({ok:true});
};
</script>`;

const storeStub = `
<script>
window.Telegram={WebApp:{initData:"mobile-qa",ready(){},expand(){}}};
window.prompt=()=>"Mobile QA audit note";
const qdProducts=[
  {id:"mobile-qa-product",name:"QuantDeus Mobile QA",category:"Цифровые продукты",description:"Тестовая карточка для проверки мобильного checkout. Не является реальным предложением.",status:"QA fixture",price_rub:1234,available:true},
  {id:"coming-soon",name:"Дети Эльтана",category:"Игровые проекты",description:"Проверка недоступного товара и переноса текста.",status:"В разработке",price_rub:null,available:false}
];
const qdOrder={id:"qa-order-390x844",product_id:"mobile-qa-product",product_name:"QuantDeus Mobile QA",amount:1234,status:"created"};
window.fetch=async (url,options={})=>{
  const u=String(url);
  const method=options.method||"GET";
  const send=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}}));
  if(u.includes("?products=1")) return send({ok:true,products:qdProducts});
  if(u.includes("?admin=1")) return send({ok:true,orders:[{...qdOrder,status:"payment_pending",created_at:"2026-10-01T12:00:00Z",audit:[]}]});
  if(method==="POST"){
    const body=JSON.parse(options.body||"{}");
    if(body.action==="create") return send({ok:true,order:qdOrder,payment:{method:"СБП",phone:"+7 000 000-00-00",bank:"QA Bank",recipient:"QA Recipient"}},201);
    if(body.action==="payment_submitted") return send({ok:true,order:{...qdOrder,status:"payment_pending"},payment:{method:"СБП",phone:"+7 000 000-00-00",bank:"QA Bank",recipient:"QA Recipient"}});
    if(body.action==="confirm"||body.action==="reject") return send({ok:true,order:{...qdOrder,status:body.action==="confirm"?"paid":"rejected"}});
  }
  return send({ok:true});
};
</script>`;

function inject(html, stub, tail="") {
  html = stripTelegram(html);
  html = html.replace("</head>", stub + "\n</head>");
  if (tail) html = html.replace("</body>", tail + "\n</body>");
  return html;
}

const forum = fs.readFileSync(path.join(root, "forum/index.html"), "utf8");
fs.writeFileSync(path.join(out, "forum/index.html"), inject(forum, forumStub));

const store = fs.readFileSync(path.join(root, "store/index.html"), "utf8");
const adminTail = `<style>.qd-heading,#systemNotice,#products{display:none!important}</style><script>setTimeout(()=>window.scrollTo(0,0),250);</script>`;
fs.writeFileSync(path.join(out, "store/admin.html"), inject(store, storeStub, adminTail));
const checkoutTail = `<script>setTimeout(()=>document.querySelector('[data-product="mobile-qa-product"]')?.click(),350);</script>`;
fs.writeFileSync(path.join(out, "store/checkout.html"), inject(store, storeStub, checkoutTail));

console.log(JSON.stringify({ok:true,out,fixtures:["forum/index.html","store/admin.html","store/checkout.html"]}));
