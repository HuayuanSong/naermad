import {test,expect} from '@playwright/test';
import {demoData} from '../../src/demo.js';
import AxeBuilder from '@axe-core/playwright';
// No automated map tile downloading or geocoder load. Upstream APIs are fixture-backed here.
test.beforeEach(async({page})=>{
  await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X3GZAAAAAElFTkSuQmCC','base64')}));
  await page.route('https://photon.komoot.io/**',r=>r.fulfill({json:{features:[{properties:{countrycode:'DK',name:'Københavns Hovedbanegård',city:'København',postcode:'1570'},geometry:{coordinates:[12.564,55.672]}}]}}));
});
test('demo supports stores, selected ingredients, recipes, scaled lists, download and keyboard dismissal',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.locator('#mode-badge')).toContainText('Demo');await expect(page.locator('.store-card')).toHaveCount(3);
  await page.locator('[data-store="demo-1"]').click();
  await expect(page.locator('.recipe-card')).not.toHaveCount(0);
  await page.locator('#toggle-all').click();await expect(page.locator('.recipe-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Vælg Broccoli · 1 stk.',exact:true}).click();
  await page.locator('#vegetarian').check();await page.locator('#max-minutes').selectOption('30');
  await expect(page.locator('.recipe-card')).toHaveCount(1);
  await page.locator('#servings').selectOption('4');await page.getByRole('button',{name:'Se opskrift: Cremet pasta med broccoli'}).click();
  await expect(page.locator('#recipe-dialog')).toBeVisible();await expect(page.locator('.shopping-list')).toContainText('600 g');
  const downloadPromise=page.waitForEvent('download');await page.locator('#download-list').click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('naermad-broccoli-pasta.txt');
  await page.keyboard.press('Escape');await expect(page.locator('#recipe-dialog')).not.toBeVisible();expect(errors).toEqual([]);
});
test('address results work; demo stores are never invented near another city',async({page})=>{
  await page.goto('/');await page.locator('#address').fill('København H');await page.locator('#search-button').click();
  await page.locator('[data-address="0"]').click();await expect(page.locator('.store-card')).toHaveCount(0);
  await expect(page.locator('#message')).toContainText('ingen demobutikker');
  await page.locator('#demo-reset').click();await expect(page.locator('.store-card')).toHaveCount(3);
});
test('manual classification updates recipes, and changing store resets selected items',async({page})=>{
  await page.goto('/');await page.locator('[data-store="demo-1"]').click();await page.locator('#toggle-all').click();
  const select=page.getByRole('combobox',{name:'Råvare for Broccoli · 1 stk.',exact:true});await select.selectOption('mushroom');
  await expect(page.locator('.recipe-card')).toContainText('Svampepasta');
  await page.locator('[data-store="demo-3"]').click();await expect(page.locator('.selection-heading')).toContainText('8 af 8');
});
test('mobile has no horizontal overflow, working filters and accessible dialog',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.locator('.store-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Om Nærmad'}).click();await expect(page.locator('#about-dialog')).toBeVisible();
  expect(await page.locator('#about-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');await expect(page.locator('#about-dialog')).not.toBeVisible();
});
test('configured live flow consumes one nearby request, filters expired offers and never uses demo fallback on errors',async({page})=>{
  let calls=0;await page.route('**/config.json',r=>r.fulfill({json:{sallingFrontendKey:'fixture-only-public-key',geocoderUrl:'https://photon.komoot.io/api/',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}}));
  await page.route('https://photon.komoot.io/**',r=>r.fulfill({json:{features:[{properties:{countrycode:'DK',name:'Aarhus H'},geometry:{coordinates:[10.2039,56.1532]}}]}}));
  await page.route('https://api.sallinggroup.com/**',r=>{
    calls++;const data=demoData();data[0].clearances[0].offer.endTime='2020-01-01T00:00:00Z';
    return r.fulfill({json:data});
  });
  await page.goto('/');await expect(page.locator('#demo-notice')).not.toBeVisible();
  await page.locator('#address').fill('Aarhus H');await page.locator('#search-button').click();await page.locator('[data-address="0"]').click();
  await expect(page.locator('.store-card')).toHaveCount(3);expect(calls).toBe(1);
  await page.locator('[data-store="demo-1"]').click();await expect(page.locator('.selection-heading')).toContainText('7 af 7');
  await page.locator('[data-store="demo-2"]').click();await page.locator('#refresh').click();await expect(page.locator('.store-card')).toHaveCount(3);expect(calls).toBe(1);
});
test('live authentication error remains an error',async({page})=>{
  await page.route('**/config.json',r=>r.fulfill({json:{sallingFrontendKey:'fixture',geocoderUrl:'https://photon.komoot.io/api/',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}}));
  await page.route('https://api.sallinggroup.com/**',r=>r.fulfill({status:403,json:{error:'Forbidden'}}));
  await page.goto('/');await page.locator('#address').fill('København H');await page.locator('#search-button').click();await page.locator('[data-address="0"]').click();
  await expect(page.locator('#message')).toContainText('Salling-adgangen virker ikke');await expect(page.locator('.store-card')).toHaveCount(0);
  await expect(page.locator('#demo-notice')).not.toBeVisible();
});

test('main view and dialogs pass automated WCAG A/AA checks',async({page})=>{
  await page.goto('/');await expect(page.locator('.store-card')).toHaveCount(3);
  for(const screen of ['main','recipe','about']){
    if(screen==='recipe')await page.locator('[data-recipe]').first().click();
    if(screen==='about'){await page.keyboard.press('Escape');await page.locator('#about-button').click();}
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(result.violations,screen).toEqual([]);
  }
});
