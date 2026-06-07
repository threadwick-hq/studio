import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1100,height:160,deviceScaleFactor:2});
await p.goto('http://localhost:8099/',{waitUntil:'networkidle0'});
const el=await p.$('.home .topbar'); await (el||p).screenshot({path:'/tmp/hdr.png'});
const f=await p.newPage(); await f.setViewport({width:520,height:160,deviceScaleFactor:2});
await f.goto('file:///tmp/fav.html',{waitUntil:'networkidle0'}); await f.screenshot({path:'/tmp/fav.png'});
await b.close(); console.log('shots ok');
