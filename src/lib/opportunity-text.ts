// Formatting only: preserve official wording instead of inventing a summary or requirements.
export function officialText(text:string){return text.replace(/\r\n?/g,"\n").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();}
export function excerpt(text:string,limit=220){const value=officialText(text).replace(/\n/g," ");if(value.length<=limit)return value;const cut=value.lastIndexOf(" ",limit);return value.slice(0,cut>limit/2?cut:limit)+"…";}
