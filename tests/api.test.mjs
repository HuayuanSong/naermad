import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi,parseRetryAfter} from '../src/api.js';
import {demoData,DEMO_ORIGIN} from '../src/demo.js';
const now=Date.parse('2026-11-01T12:00:00Z');
const config={sallingFrontendKey:'test-frontend-key',geocoderUrl:'https://photon.komoot.io/api/'};

test('nearby requests use documented endpoint and header; selection can reuse cached data without more quota',async()=>{
  let count=0,clock=now;
  const api=createApi(config,{now:()=>clock,fetcher:async(url,opts)=>{
    count++;assert.equal(url.origin,'https://api.sallinggroup.com');assert.equal(url.pathname,'/v1/food-waste/');
    assert.equal(url.searchParams.get('geo'),`${DEMO_ORIGIN.lat},${DEMO_ORIGIN.lon}`);
    assert.equal(opts.headers.Authorization,'Bearer test-frontend-key');assert.ok(!url.href.includes('test-frontend-key'));
    return Response.json(demoData(now),{headers:{'Retry-After':'3'}});
  }});
  const first=await api.nearby(DEMO_ORIGIN,3);assert.equal(first.stores.length,3);
  clock+=2000;const second=await api.nearby(DEMO_ORIGIN,3);assert.equal(second.cached,true);assert.equal(count,1);
  await assert.rejects(api.nearby(DEMO_ORIGIN,5),e=>e.status===429);
  clock+=5*60000;await api.nearby(DEMO_ORIGIN,3);assert.equal(count,2);
});
test('coalesces simultaneous identical calls',async()=>{
  let count=0;const api=createApi(config,{now:()=>now,fetcher:async()=>{count++;return Response.json(demoData(now));}});
  await Promise.all([api.nearby(DEMO_ORIGIN,3),api.nearby(DEMO_ORIGIN,3)]);assert.equal(count,1);
});
test('live errors never silently fall back to demo data and no key is disclosed',async()=>{
  for(const status of [401,403,429,500]){
    let count=0;
    const api=createApi(config,{now:()=>now,fetcher:async()=>{count++;return new Response('test-frontend-key',{status,headers:{'Retry-After':'60'}});}});
    await assert.rejects(api.nearby(DEMO_ORIGIN,3),e=>e.status===status&&!e.message.includes('test-frontend-key'));
    if(status===429){await assert.rejects(api.nearby(DEMO_ORIGIN,3));assert.equal(count,1);}
  }
});
test('missing key, invalid positions and unknown schemas fail explicitly',async()=>{
  let count=0;const fetcher=async()=>{count++;return Response.json({foo:[]});};
  await assert.rejects(createApi({}, {fetcher}).nearby(DEMO_ORIGIN,3));assert.equal(count,0);
  await assert.rejects(createApi(config,{fetcher}).nearby({lat:NaN,lon:5},3));assert.equal(count,0);
  await assert.rejects(createApi(config,{fetcher}).nearby(DEMO_ORIGIN,3),/dataformat/);
});
test('address search is explicit, cached, limited to Denmark and validates responses',async()=>{
  let count=0;
  const api=createApi(config,{now:()=>now,fetcher:async url=>{
    count++;assert.equal(url.searchParams.get('countrycode'),'DK');assert.equal(url.searchParams.get('q'),'Aarhus H');
    return Response.json({features:[
      {properties:{countrycode:'DK',name:'Aarhus H',city:'Aarhus',postcode:'8000'},geometry:{coordinates:[10.2,56.15]}},
      {properties:{countrycode:'DE',name:'Other'},geometry:{coordinates:[10,55]}},
      {properties:{countrycode:'DK'},geometry:{coordinates:[null,null]}},
    ]});
  }});
  const data=await api.search('Aarhus H');assert.equal(data.length,1);assert.equal(data[0].lat,56.15);
  await api.search('aarhus h');assert.equal(count,1);
  await assert.rejects(api.search('Odense'));await assert.rejects(api.search('ab'));
});
test('handles both Retry-After forms',()=>{
  assert.equal(parseRetryAfter('15',now),15000);
  assert.equal(parseRetryAfter(new Date(now+5000).toUTCString(),now),5000);
  assert.equal(parseRetryAfter('nonsense',now),0);
});
