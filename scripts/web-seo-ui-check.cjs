
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
fs.mkdirSync('artifacts',{recursive:true});
(async()=>{
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1453,height:900}});
const page=await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const now=new Date().toISOString();
const connection={id:'test-site',domain:'peluguau.com',websiteUrl:'https://www.peluguau.com/',status:'connected',connector:{kind:'git',canPush:true},signals:{verified:false,last7d:{}}};
const report={url:connection.websiteUrl,generatedAt:now,webAlive:true,score:72,provider:'heuristic',keywords:[],contentPlan:[],localSeo:[],checklist:[{id:'title',label:'Título de la portada demasiado largo',ok:false,hint:'Resume el título para explicar con claridad qué ofrece tu negocio.'},{id:'meta',label:'Falta una descripción en varias páginas',ok:false,hint:'Describe el contenido de cada página para los resultados de búsqueda.'},{id:'ssl',label:'Certificado válido',ok:true}],site:{sitemapFound:true,sitemapCount:2,sitemapUrlCount:3,pagesAudited:2,crawlLimit:50,truncated:false,duplicateTitles:[],failedUrls:['https://www.peluguau.com/contacto'],pages:[{url:connection.websiteUrl,title:'Peluguau · Software para peluquerías caninas',hasMetaDescription:false,hasH1:true,imgsWithoutAlt:0},{url:'https://www.peluguau.com/precios',title:'Planes y precios',hasMetaDescription:true,hasH1:true,imgsWithoutAlt:0}],discoveredUrls:[connection.websiteUrl,'https://www.peluguau.com/precios','https://www.peluguau.com/contacto']}};
let mode='normal', jobStatus='succeeded', auditPosts=0, proposalPosts=0;
const second={...connection,id:'second-site',domain:'segunda.example',websiteUrl:'https://segunda.example/'};
const overview=()=>({report,history:[{id:'r1',url:connection.websiteUrl,createdAt:now,score:72,auto:true}],jobs:[{id:'j1',status:jobStatus,createdAt:now,finishedAt:jobStatus==='succeeded'?now:null,progress:jobStatus==='running'?10:100}],proposals:[],monitoring:{status:'active',intervalHours:24,nextRunAt:new Date(Date.now()+86400000).toISOString()}});
await page.route('**/api/**',async route=>{
const url=new URL(route.request().url()),path=url.pathname;
let body=[];
if(path==='/api/auth/refresh') body={token:'offline-ui-token',user:{id:'test',orgId:'test',name:'Prueba UI',email:'ui@example.test',role:'owner'}};
else if(path==='/api/web-connections') { if(mode==='error') return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Error de prueba recuperable'})}); body=mode==='empty'?[]:[connection,second]; }
else if(path.endsWith('/second-site/seo')) body={report:null,history:[],jobs:[{id:'failed',status:'failed',error:'No se pudo completar la revisión.',createdAt:now}],proposals:[],monitoring:{status:'unavailable'}};
else if(path.endsWith('/seo/audit')){auditPosts++;jobStatus='running';body={job:{id:'j1',status:jobStatus}}}
else if(path.endsWith('/git/proposals')){proposalPosts++;body={id:'p1',status:'queued'}}
else if(path.endsWith('/test-site/seo')) body=overview();
else if(path.includes('/seo/search-console')) body={data:{connected:false,totalQueries:0,matched:[],topQueries:[]}};
else if(path.includes('/seo/')) body={data:[]};
else if(path.includes('brand')) body={brandName:'Vendrava'};
await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
await page.goto('http://127.0.0.1:5173/captacion/convertir');
await page.getByRole('heading',{name:'Web y SEO',exact:true}).waitFor();
await page.getByText('Título de la portada demasiado largo',{exact:true}).first().waitFor();
await page.screenshot({path:'artifacts/web-seo-desktop.png',fullPage:true});
await page.getByRole('button',{name:'Páginas',exact:true}).click();
await page.getByRole('cell',{name:'Planes y precios'}).waitFor();
await page.getByRole('checkbox',{name:'Solo con incidencias'}).check();
if(await page.getByRole('cell',{name:'Planes y precios'}).count()) throw Error('Issue filter failed');
await page.getByRole('button',{name:'Ver detalle',exact:true}).first().click();
await page.getByRole('button',{name:'Preparar mejora',exact:true}).click();
await page.locator('#ws-proposal').waitFor({state:'visible'});
await page.getByRole('button',{name:'Preparar propuesta',exact:true}).click();
await page.getByText('Cambio en preparación.',{exact:false}).waitFor();
await page.getByRole('button',{name:'Resultados',exact:true}).click();
await page.getByRole('heading',{name:'Qué está cambiando'}).waitFor();
await page.screenshot({path:'artifacts/web-seo-results.png',fullPage:true});
await page.getByRole('button',{name:'Mi web',exact:true}).click();
await page.getByRole('button',{name:/Revisar ahora|Revisar web/}).click();
await page.getByText('Revisando la web',{exact:false}).first().waitFor();
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'artifacts/web-seo-mobile.png',fullPage:true});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
await page.setViewportSize({width:1453,height:900});
await page.getByLabel('Web seleccionada').selectOption('second-site');
await page.getByText('La última revisión no se completó',{exact:true}).waitFor();
if(await page.getByText('Título de la portada demasiado largo',{exact:true}).count()) throw Error('Previous website report leaked');
await page.getByText('Sin servicio de vigilancia',{exact:true}).waitFor();
mode='empty'; await page.reload();
await page.getByRole('heading',{name:'Empecemos por tu web'}).waitFor();
mode='error'; await page.reload();
await page.getByText('Error de prueba recuperable').waitFor();
mode='normal'; await page.getByRole('button',{name:'Reintentar',exact:true}).click();
await page.getByLabel('Web seleccionada').waitFor();
console.log(JSON.stringify({errors,auditPosts,proposalPosts,overflow,states:['populated','running','failed','unavailable','empty','load-error','retry','site-switch'],url:page.url()}));
await browser.close();
if(errors.length||overflow||auditPosts!==1||proposalPosts!==1)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
