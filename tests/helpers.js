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
// A summary widget's children are [optional title bar, card1..card3]; the three cards are the rounded
// slot-tinted blocks (borderRadius 16), so this filters out the new top title bar.
const cards=w=>(w.children||[]).filter(c=>c&&c.type==='stack'&&c.borderRadius===16);
export {mock,capture,phones,API,key,cards};
