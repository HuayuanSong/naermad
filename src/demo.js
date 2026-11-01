// Entirely fictional inventory and stores, positioned around Aarhus for a usable demo.
// Never substitute this for a failed live request.
export const DEMO_ORIGIN = {lat:56.1532, lon:10.2039, label:'Aarhus H · demoområde'};
export function demoData(now = Date.now()) {
  const item = (name, price, original, stock = 4) => ({product:{description:name}, offer:{
    currency:'DKK', newPrice:price, originalPrice:original, stock, stockUnit:'each',
    startTime:new Date(now-3600000).toISOString(), endTime:new Date(now+8*3600000).toISOString(),
    lastUpdate:new Date(now-12*60000).toISOString(),
  }});
  const store = (id, name, brand, coordinates, street, items) => ({
    store:{id, name, brand, coordinates, address:{street, zip:'8000', city:'Aarhus C', country:'DK'}, hours:[]}, clearances:items,
  });
  return [
    store('demo-1','Eksempelbutik · Frederiksbjerg','netto',[10.2008,56.1480],'Fiktiv butik ved Jægergårdsgade',[
      item('Broccoli · 1 stk.',8,16), item('Babyspinat · 150 g',10,20), item('Salatost · 200 g',12,24),
      item('Frilandsæg · 6 stk.',15,30), item('Madlavningsfløde · 250 ml',7.5,15), item('Kyllingebryst · 400 g',25,50),
      item('Cherrytomater · 250 g',9,18), item('Surdejsbrød · 500 g',12,30),
    ]),
    store('demo-2','Eksempelbutik · Midtbyen','foetex',[10.2090,56.1515],'Fiktiv butik ved Banegårdspladsen',[
      item('Champignon · 250 g',8,16), item('Madlavningsfløde · 250 ml',7,14), item('Laksefilet · 300 g',32,65),
      item('Broccoli · 1 stk.',9,18), item('Citroner · 2 stk.',6,15), item('Græsk yoghurt · 500 g',12,25),
      item('Bananer · 4 stk.',7,15), item('Letmælk · 1 l',6,13),
    ]),
    store('demo-3','Eksempelbutik · Åen','netto',[10.2020,56.1572],'Fiktiv butik ved Åboulevarden',[
      item('Gulerødder · 1 kg',7,15), item('Spidskål · 1 stk.',8,20), item('Squash · 1 stk.',6,12),
      item('Peberfrugt · 2 stk.',10,22), item('Hakket oksekød · 400 g',25,50), item('Mozzarella · 125 g',6,12),
      item('Æbler · 6 stk.',10,22), item('Kartofler · 1 kg',8,18),
    ]),
  ];
}
