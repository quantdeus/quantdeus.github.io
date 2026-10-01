import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = "/tmp/quantdeus-portal-mobile";
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ["assets", "forum", "store", "telegram"]) fs.mkdirSync(path.join(out, dir), { recursive: true });
fs.copyFileSync(path.join(root, "assets/qd-portal.css"), path.join(out, "assets/qd-portal.css"));
fs.copyFileSync(path.join(root, "assets/telegram-auth.js"), path.join(out, "assets/telegram-auth.js"));

const stripTelegram = html => html.replace(/\s*<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/, "");

const landingStub = `
<script>
window.fetch=async (url)=>{
  if(String(url).includes("/coordination/agents.json")) return Promise.resolve(new Response(JSON.stringify({agents:[
    {id:"seven-of-nine",department:"Executive & Strategy",title:"Coordinator",role:"coordination"},
    {id:"sherlock",department:"Science & R&D",title:"Science",role:"research"},
    {id:"control-tower",department:"Product & Engineering",title:"Automation",role:"engineering"}
  ]}),{status:200,headers:{"content-type":"application/json"}}));
  return Promise.resolve(new Response("{}",{status:404}));
};
</script>`;

const telegramStub = `
<script>
window.Telegram={WebApp:{initData:"mobile-qa",initDataUnsafe:{user:{id:910000001,first_name:"Anton",username:"mobile_anton"}},ready(){},expand(){},HapticFeedback:{impactOccurred(){}}}};
</script>`;

const forumStub = `
<script>
window.Telegram={WebApp:{initData:"mobile-qa",initDataUnsafe:{user:{id:9003,first_name:"Forum",username:"forum_mod"}},ready(){},expand(){}}};
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
window.Telegram={WebApp:{initData:"mobile-qa",initDataUnsafe:{user:{id:9002,first_name:"Admin",username:"mobile_qa"}},ready(){},expand(){}}};
window.prompt=()=>"Mobile QA audit note";
const qdProducts=[
  {id:"business-automation",name:"Автоматизация бизнеса",category:"Автоматизация",description:"Проектирование и внедрение ИИ-агентов, интеграций и рабочих процессов под задачи бизнеса.",status:"Расчёт после заявки",pricing_mode:"quote",price_rub:null,available:true},
  {id:"ksenia-cherednikova-concert",name:"Концерт Ксении Чередниковой",category:"Концерты",description:"Заявка на концерт: формат, дата, город и площадка согласуются индивидуально.",status:"Стоимость по запросу",pricing_mode:"quote",price_rub:null,available:true}
];
const qdOrder={id:"qa-inquiry-390x844",product_id:"business-automation",product_name:"Автоматизация бизнеса",pricing_mode:"quote",amount:null,status:"inquiry_created",request_note:"Нужно автоматизировать приём заявок, CRM и ежедневную отчётность.",contact:{telegram_user_id:"910000001",telegram_username:"mobile_qa"}};
window.fetch=async (url,options={})=>{
  const u=String(url);
  const method=options.method||"GET";
  const send=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}}));
  if(u.includes("?products=1")) return send({ok:true,products:qdProducts});
  if(u.includes("?admin=1")) return send({ok:true,orders:[qdOrder]});
  if(method==="POST"){
    const body=JSON.parse(options.body||"{}");
    if(body.action==="create") return send({ok:true,order:{...qdOrder,request_note:body.note||qdOrder.request_note},payment:null},201);
    if(body.action==="cancel") return send({ok:true,order:{...qdOrder,status:"cancelled"},payment:null});
  }
  return send({ok:true});
};
</script>`;

const storeGuestStub = storeStub.replace(
  'window.Telegram={WebApp:{initData:"mobile-qa",initDataUnsafe:{user:{id:9002,first_name:"Admin",username:"mobile_qa"}},ready(){},expand(){}}};',
  ''
);

function inject(html, stub, tail="") {
  html = stripTelegram(html);
  const authScript = /<script src="[^"]*assets\/telegram-auth\.js"><\/script>/;
  if (authScript.test(html)) html = html.replace(authScript, match => stub + "\n" + match);
  else html = html.replace("</head>", stub + "\n</head>");
  if (tail) html = html.replace("</body>", tail + "\n</body>");
  return html;
}

const landing = fs.readFileSync(path.join(root, "index.html"), "utf8");
fs.writeFileSync(path.join(out, "index.html"), inject(landing, landingStub));

const telegram = fs.readFileSync(path.join(root, "telegram/index.html"), "utf8");
fs.writeFileSync(path.join(out, "telegram/index.html"), inject(telegram, telegramStub));

const forum = fs.readFileSync(path.join(root, "forum/index.html"), "utf8");
fs.writeFileSync(path.join(out, "forum/index.html"), inject(forum, forumStub));

const store = fs.readFileSync(path.join(root, "store/index.html"), "utf8");
const adminTail = `<style>.qd-heading,#systemNotice,#products{display:none!important}</style><script>setTimeout(()=>window.scrollTo(0,0),250);</script>`;
fs.writeFileSync(path.join(out, "store/admin.html"), inject(store, storeStub, adminTail));
const checkoutTail = `<script>setTimeout(()=>document.querySelector('[data-product="business-automation"]')?.click(),350);</script>`;
fs.writeFileSync(path.join(out, "store/checkout.html"), inject(store, storeGuestStub, checkoutTail));

console.log(JSON.stringify({ok:true,out,fixtures:["index.html","telegram/index.html","forum/index.html","store/admin.html","store/checkout.html"]}));
