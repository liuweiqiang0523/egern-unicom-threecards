import run from '../UnicomThreeCards.js';
const API='https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';
const phones=['13000000001','13000000002','13000000003']; // synthetic, not real accounts
const env={};
function mock(){
 const db=new Map(),calls=[],notices=[];
 const storage={get:k=>db.get(k)??null,set:(k,v)=>db.set(k,v),getJSON:k=>db.has(k)?JSON.parse(db.get(k)):null,setJSON:(k,v)=>db.set(k,JSON.stringify(v)),delete:k=>db.delete(k)};
 const ctx={env:{...env},storage,widgetFamily:'systemMedium',notify:n=>notices.push(n),http:{get:async(u,o)=>{calls.push({u,o}); return {status:200,json:async()=>({code:'Y',feeResource:{feePersent:'12.34',newUnit:'元'},voiceResource:{voicePersent:'56',newUnit:'分钟'},flowResource:{flowPersent:'7.8',newUnit:'GB'}})}}}};
 return {ctx,db,calls,notices};
}
async function capture(m,p=phones[0],cookie='mock-session=A',url=API+'?desmobiel='+p){return run({...m.ctx,request:{url,headers:{Cookie:cookie}}});}
const key=p=>'egern.unicom3.v1.slot.'+(phones.indexOf(p)+1);
// A summary widget's children are [optional title bar, (card holder stack)] or just [card1..card3].
// The three cards are the rounded slot-tinted blocks (borderRadius 16); walk the whole tree so the
// cards are found whether or not the title bar wraps them in a holder (see eslint-free flatten).
const flatten=n=>[n,...(n.children||[]).flatMap(flatten)];
const cards=w=>flatten(w).filter(c=>c&&c.type==='stack'&&c.borderRadius===16);
// The column stack that holds the three cards when a title bar is present; its gap is the card
// spacing. Returns undefined when there is no title bar (cards are direct children then).
const cardHolder=w=>(w.children||[]).find(c=>c&&c.type==='stack'&&(c.children||[]).some(x=>x&&x.borderRadius===16));
export {mock,capture,phones,API,key,cards,cardHolder};
