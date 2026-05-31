import { D } from './js/dsp.js';
import { readFileSync } from 'fs';
function loadCsv(path){
  const lines=readFileSync(path,'utf8').split('\n'); let ti=-1,ri=-1,gi=-1,bi=-1;
  const R=[],G=[],B=[],T=[];
  for(const raw of lines){ const line=raw.trim(); if(!line||line.startsWith('#'))continue;
    if(line.startsWith('t_ms')){const c=line.split(',');ti=c.indexOf('t_ms');ri=c.findIndex(x=>x.toUpperCase()==='R');gi=c.findIndex(x=>x.toUpperCase()==='G');bi=c.findIndex(x=>x.toUpperCase()==='B');continue;}
    const p=line.split(','); if(p.length<=Math.max(ti,ri,gi,bi))continue;
    T.push(+p[ti]);R.push(+p[ri]);G.push(+p[gi]);B.push(+p[bi]); }
  return {T,R,G,B};
}
const {T,R,G,B}=loadCsv(process.argv[2]); const n=R.length;
const fps=(n-1)/((T[n-1]-T[0])/1000);
const combined=new Float64Array(n); for(let i=0;i<n;i++)combined[i]=R[i]*.4+G[i]*.6;
const detr=D.detrend(combined,2,fps); const co=D.bp4(fps,.5,4); const flt=Array.from(D.ff(detr,co));
const pks=D.fp(flt,Math.round(fps*.45));
const motion=D.detectMotion(B,fps,0.5);
const dirty=motion.filter(x=>!x).length;
console.log(`fps=${fps.toFixed(2)} peaks=${pks.length} motion_dirty=${dirty}/${n}`);
console.log('PEAKS='+pks.join(','));
// refine varje peak (D.rp) → sub-sample-positioner
const refined=pks.map(i=>D.rp(flt,i));
console.log('REFINED='+refined.map(x=>x.toFixed(3)).join(','));
