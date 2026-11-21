import{readFileSync}from'node:fs';import vm from'node:vm';import{DOMParser}from'linkedom';import{unzipSync}from'fflate';
const context=vm.createContext({window:{},DOMParser,TextDecoder,TextEncoder,URL,Uint8Array,atob});vm.runInContext(readFileSync(new URL('../portfolio-test/shared/detail-package.js',import.meta.url),'utf8'),context);const P=context.window.PortfolioDetailPackage;
export function unpackDetailPackage(bytes){try{return P.inspect(P.unzip(bytes,unzipSync));}catch(error){throw Object.assign(Error(error.message),{status:422});}}
