import fs from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=ts.transpileModule(await fs.readFile('lib/boot-recovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exported={exports:{}};vm.runInNewContext(source,{exports:exported.exports});const script=exported.exports.bootRecoveryScript;
function fixture(){const callbacks={},nodes={'pls-boot-recovery':{hidden:true},'pls-workspace-loading':{},'pls-boot-message':{}},timers=[];let reloads=0;class Element{closest(selector){return selector==='[data-pls-reload]'?this:null;}}const window={addEventListener:(name,fn)=>callbacks[name]=fn,location:{reload(){reloads++}}};const document={getElementById:id=>nodes[id],addEventListener:(name,fn)=>callbacks[name]=fn};vm.runInNewContext(script,{window,document,Element,setTimeout:fn=>{timers.push(fn);return 1},clearTimeout:()=>{}});return {window,nodes,callbacks,timers,Element,reloads:()=>reloads};}
const html=fixture();assert.equal(html.nodes['pls-boot-recovery'].hidden,true);html.timers[0]();assert.equal(html.nodes['pls-boot-recovery'].hidden,false);assert.match(html.nodes['pls-boot-message'].textContent,/Interface/);assert.equal(html.reloads(),0);
html.callbacks.click({target:new html.Element()});assert.equal(html.reloads(),1);
const loading=fixture();loading.window.__plsBoot.phase='loading';loading.timers[0]();assert.match(loading.nodes['pls-boot-message'].textContent,/Loading/);
const ready=fixture();ready.callbacks['pls-workspace-ready']();ready.timers[0]();ready.callbacks.error();assert.equal(ready.nodes['pls-boot-recovery'].hidden,true);assert.equal(ready.reloads(),0);
const failed=fixture();failed.callbacks.error();assert.equal(failed.nodes['pls-boot-recovery'].hidden,false);
console.log('PASS independent startup recovery: bundle error, delayed data, ready state, manual reload only; no workspace mutation. This is a script-unit check, not browser QA.');
