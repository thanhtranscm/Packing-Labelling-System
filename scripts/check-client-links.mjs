// Link production JavaScript as ES modules without executing DOM/browser code.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const directory=path.resolve('dist/client/_next/static/chunks');
const cache=new Map();
function moduleAt(file){if(cache.has(file))return cache.get(file);const module=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{identifier:file});cache.set(file,module);return module;}
function resolve(specifier,parent){if(!specifier.startsWith('.'))throw Error('Unexpected external browser import '+specifier);const file=path.resolve(path.dirname(parent.identifier),specifier);if(!fs.existsSync(file))throw Error('Missing browser chunk '+file);return moduleAt(file);}
for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.js'))){const module=moduleAt(path.join(directory,file));if(module.status==='unlinked')await module.link(resolve);}
console.log(`PASS ${cache.size} production browser modules: every static chunk and named export resolves (no browser execution).`);
